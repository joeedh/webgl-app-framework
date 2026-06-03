#!/usr/bin/env node
// Create a sibling git worktree with the submodules synced and the sccache
// environment ready, so a fresh worktree builds at compiler-cache speed instead
// of recompiling the C++ tree from scratch. See the `create-worktree` skill
// (.claude/skills/create-worktree/SKILL.md) for the why and the workflow.
//
// Usage (from any worktree of this repo):
//   node tools/new-worktree.mjs <name> [--base <ref>] [--branch <branch>] [--no-emsdk]
//
//   <name>            worktree is created at <main-worktree>-<name>
//   --base <ref>      branch point for the new branch (default: master)
//   --branch <name>   new branch name (default: <name>)
//   --no-emsdk        don't point WASM builds at the main worktree's emsdk (default: do)
//
// It does NOT build anything and never touches the persistent -agent worktree.

import fs from 'fs'
import Path from 'path'
import child_process from 'child_process'

function die(msg) {
  process.stderr.write(`new-worktree: ${msg}\n`)
  process.exit(1)
}

// Run a command, returning {status, out} with stdout+stderr merged. Never throws.
function run(cmd, args, opts = {}) {
  const r = child_process.spawnSync(cmd, args, {encoding: 'utf8', ...opts})
  return {status: r.status ?? 1, out: (r.stdout || '') + (r.stderr || '')}
}

// Run a command and die on non-zero exit, echoing output.
function runOrDie(cmd, args, opts = {}) {
  const r = run(cmd, args, opts)
  if (r.status !== 0) {
    process.stderr.write(r.out)
    die(`command failed (${r.status}): ${cmd} ${args.join(' ')}`)
  }
  return r.out
}

function fwd(p) {
  return p.replace(/\\/g, '/').replace(/\/+$/, '')
}

// --- parse args ---
const argv = process.argv.slice(2)
let name = null
let base = 'master'
let branch = null
let noEmsdk = false
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === '--base') base = argv[++i]
  else if (a === '--branch') branch = argv[++i]
  else if (a === '--no-emsdk') noEmsdk = true
  else if (a.startsWith('--')) die(`unknown flag ${a}`)
  else if (name === null) name = a
  else die(`unexpected argument ${a}`)
}
if (!name) die('usage: node tools/new-worktree.mjs <name> [--base <ref>] [--branch <branch>] [--no-emsdk]')
branch = branch || name

// --- resolve the MAIN worktree root (parent of the shared .git common dir) ---
const commonDir = runOrDie('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim()
const MAIN = fwd(Path.dirname(commonDir))
const DEST = `${MAIN}-${name}`

if (fs.existsSync(DEST)) die(`destination already exists: ${DEST}`)

console.log(`main worktree : ${MAIN}`)
console.log(`new worktree  : ${DEST}`)
console.log(`branch        : ${branch}  (base ${base})`)

// --- create the worktree ---
runOrDie('git', ['-C', MAIN, 'worktree', 'add', '-b', branch, DEST, base])

// --- sync submodules, recovering the local-only pinned commits ---
// sculptcore and sculptcore/source/litestl are pinned to commits never pushed
// to their remotes, so `submodule update` aborts with "not our ref"; fetch the
// exact commit from the MAIN worktree's matching submodule and resume. See the
// "Syncing the worktree + submodules" section of CLAUDE.md.
syncSubmodules()

function syncSubmodules() {
  const tried = new Set()
  for (let attempt = 0; attempt < 30; attempt++) {
    const r = run('git', ['-C', DEST, 'submodule', 'update', '--init', '--recursive'])
    if (r.status === 0) {
      console.log('submodules: synced')
      return
    }
    // Two error shapes carry (path, sha) we can recover from:
    //   "Fetched in submodule path 'X', but it did not contain <sha>..."
    //   "Unable to fetch in submodule path 'X'; ... could not require <sha>"
    const m =
      r.out.match(/submodule path '([^']+)',? but it did not contain ([0-9a-f]{40})/) ||
      r.out.match(/submodule path '([^']+)'.*?(?:require|contain) ([0-9a-f]{40})/s)
    if (!m) {
      process.stderr.write(r.out)
      die('submodule update failed and no recoverable "not our ref" commit was found')
    }
    const [, subPath, sha] = m
    const key = `${subPath}@${sha}`
    if (tried.has(key)) {
      process.stderr.write(r.out)
      die(`recovery for ${key} did not stick; aborting`)
    }
    tried.add(key)
    const subDest = Path.join(DEST, subPath)
    const subMain = `${MAIN}/${fwd(subPath)}`
    console.log(`submodules: fetching ${sha.slice(0, 10)} for '${subPath}' from main worktree`)
    if (!fs.existsSync(subDest)) die(`submodule dir missing, cannot recover: ${subDest}`)
    runOrDie('git', ['-C', subDest, 'fetch', subMain, sha])
    runOrDie('git', ['-C', subDest, 'checkout', sha])
  }
  die('submodule sync exceeded retry budget')
}

// --- verify clean ---
const status = runOrDie('git', ['-C', DEST, 'submodule', 'status', '--recursive'])
const dirty = status.split('\n').filter((l) => l && !l.startsWith(' '))
if (dirty.length) {
  process.stderr.write(dirty.join('\n') + '\n')
  die('submodules not at pinned commits after sync')
}

// --- resolve a shared emsdk to borrow (avoid the 2.4 GB reinstall) ---
// Rather than junction emsdk into the new worktree (a reparse point that a later
// `rm -rf` of the worktree would follow and destroy), we point the build at the
// main worktree's emsdk via SCULPTCORE_EMSDK_DIR (honored by configureEnv.mjs).
// Nothing is placed inside the new worktree, so teardown can never touch the
// shared install. Disable with --no-emsdk.
const mainEmsdk = `${MAIN}/sculptcore/emsdk`
let emsdkRedirect = ''
if (!noEmsdk) {
  if (fs.existsSync(Path.join(mainEmsdk.replace(/\//g, Path.sep), 'upstream'))) {
    emsdkRedirect = mainEmsdk
    console.log(`emsdk: WASM builds will borrow ${mainEmsdk} via SCULPTCORE_EMSDK_DIR (no reinstall)`)
  } else {
    console.log('emsdk: main worktree has no install; WASM builds here need `node make.mjs install-emsdk`')
  }
}

// --- emit per-worktree sccache env scripts ---
// SCCACHE_BASEDIRS = this worktree's own root, so the absolute paths that leak
// into preprocessed output (line markers, __FILE__) are normalized away and
// compiles cross-hit the shared cache from any worktree. SCCACHE_DIR is the
// single shared cache (sccache's own default location).
const BASEDIRS = fwd(DEST)
const localAppData = process.env.LOCALAPPDATA ? fwd(process.env.LOCALAPPDATA) : ''
const sccacheDirSh = localAppData ? `${localAppData}/sccache` : '$HOME/.cache/sccache'

const ps1Emsdk = emsdkRedirect ? `$env:SCULPTCORE_EMSDK_DIR = "${emsdkRedirect}"\n` : ''
const shEmsdk = emsdkRedirect ? `export SCULPTCORE_EMSDK_DIR="${emsdkRedirect}"\n` : ''

const ps1 = `# Auto-generated by tools/new-worktree.mjs. Dot-source before building:
#   . .\\worktree-env.ps1
$env:SCCACHE_DIR = "$env:LOCALAPPDATA\\sccache"
$env:SCCACHE_BASEDIRS = "${BASEDIRS}"
${ps1Emsdk}Write-Host "sccache env: BASEDIRS=$env:SCCACHE_BASEDIRS DIR=$env:SCCACHE_DIR"
if (-not (Get-Command sccache -ErrorAction SilentlyContinue)) {
  Write-Warning "sccache not found on PATH; builds will run without the compiler cache"
}
`

const sh = `#!/usr/bin/env bash
# Auto-generated by tools/new-worktree.mjs. Source before building:
#   source worktree-env.sh
export SCCACHE_DIR="${sccacheDirSh}"
export SCCACHE_BASEDIRS="${BASEDIRS}"
${shEmsdk}echo "sccache env: BASEDIRS=$SCCACHE_BASEDIRS DIR=$SCCACHE_DIR"
command -v sccache >/dev/null 2>&1 || echo "warning: sccache not found on PATH"
`

fs.writeFileSync(Path.join(DEST, 'worktree-env.ps1'), ps1)
fs.writeFileSync(Path.join(DEST, 'worktree-env.sh'), sh)

console.log('\nworktree ready. next steps:')
console.log(`  cd ${DEST}`)
console.log('  . .\\worktree-env.ps1            # PowerShell  (or: source worktree-env.sh)')
console.log('  cd sculptcore')
console.log('  pnpm i                                  # make.mjs deps (yargs, cmake-js, ...)')
console.log('  node extern/wgpu_native/fetch.mjs       # wgpu-native headers/lib')
console.log('  node make.mjs fetch-wgpu-native         # native-only prebuilt (not checked in)')
console.log('  node make.mjs configure native   # prints "sccache compiler launcher enabled"')
console.log('  node make.mjs build native')
console.log('\nnote: sccache reads SCCACHE_BASEDIRS at server start. If a server is')
console.log('already running for a different worktree, run `sccache --stop-server`')
console.log('once after loading the env so it restarts with this worktree\'s basedir.')
console.log('\nteardown when done (safe — nothing is junctioned into the worktree):')
console.log(`  git -C ${MAIN} worktree remove --force ${DEST}`)

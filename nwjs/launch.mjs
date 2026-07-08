#!/usr/bin/env node
/**
 * NW.js launcher for the app. Replaces electron/run.sh + electron/main.js's
 * arg handling: there is no main process under NW.js, so this thin wrapper just
 * resolves the NW.js binary and spawns it on the app dir (this directory).
 *
 * App flags (--backend, --gen-scene, --eval, --run, --dump, --headless,
 * --no-devtools, ...) are NOT chromium switches, so NW.js hands them to the
 * renderer verbatim as `nw.App.argv` (read by scripts/core/app_argv.ts and the
 * window.html bootstrap). The flags we translate here:
 *   --remote-debug[=PORT]  → the chromium switches that expose a CDP endpoint a
 *                            direct client (e.g. `nwjs/cdp.mjs`) connects to. A
 *                            bare --remote-debug picks a free port when an
 *                            --instance is in play (so parallel windows don't
 *                            fight over 9222), else keeps the classic 9222.
 *   --instance[=NAME]      → run a second window in THIS worktree concurrently.
 *                            Each instance gets its own Chromium profile subdir
 *                            (breaking the single-instance lock); NAME is a
 *                            persistent profile, bare is an auto ephemeral one.
 *   --ephemeral            → alias for a throwaway auto instance (deleted-old GC).
 * The Chromium profile is per-worktree (see profile_dir.mjs), so worktrees run
 * independently and never clobber each other's window, lock, or crash dumps.
 */
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {dirname} from 'node:path'
import {createServer} from 'node:net'
import {existsSync, mkdirSync, readdirSync, rmSync, statSync} from 'node:fs'
import {join} from 'node:path'
import {profileBaseForRoot, profileDirForRoot, crashReportsDir} from './profile_dir.mjs'

const requireCjs = createRequire(import.meta.url)
// The NW.js app root is the REPO ROOT (one level up from nwjs/), so the
// chrome-extension:// root can serve build/, scripts/, and assets/. The
// manifest is the repo-root package.json; its `main` is nwjs/window.html.
const appDir = dirname(dirname(fileURLToPath(import.meta.url)))

// The `nw` npm package exports findpath() → the cached NW.js binary path.
const nwBin = await requireCjs('nw').findpath()

/** Bind port 0 to learn a currently-free TCP port, then release it. */
function freePort() {
  return new Promise((res, rej) => {
    const srv = createServer()
    srv.on('error', rej)
    srv.listen(0, '127.0.0.1', () => {
      const {port} = srv.address()
      srv.close(() => res(port))
    })
  })
}

/** Delete auto/ephemeral instance profiles older than a week so throwaway
 * runs don't accumulate heavy Chromium dirs. Named instances are never GC'd. */
function gcEphemeralProfiles(base) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  let entries
  try {
    entries = readdirSync(base)
  } catch {
    return
  }
  for (const name of entries) {
    if (!name.startsWith('inst-auto-')) continue
    const dir = join(base, name)
    try {
      if (statSync(dir).mtimeMs < cutoff) rmSync(dir, {recursive: true, force: true})
    } catch {
      /* in use or already gone */
    }
  }
}

const userArgs = process.argv.slice(2)
// note: support for gc() manual invocation is enabled in package.json
const chromiumArgs = []
const appArgs = []
let instance // undefined = default profile; string = inst-<name>
let wantRemoteDebug = false
let remotePort // explicit port from --remote-debug=PORT
let userSetProfile = false

for (const arg of userArgs) {
  const rd = /^--remote-debug(?:=(\d+))?$/.exec(arg)
  if (rd) {
    wantRemoteDebug = true
    if (rd[1]) remotePort = rd[1]
    continue
  }
  const inst = /^--instance(?:=(.+))?$/.exec(arg)
  if (inst) {
    instance = inst[1] || `auto-${Date.now().toString(36)}`
    continue
  }
  if (arg === '--ephemeral') {
    instance = `auto-${Date.now().toString(36)}`
    continue
  }
  if (arg === '--headless') {
    // --headless is a real Chromium switch (it would put Chromium in headless
    // mode and break NW.js's window model). Map to the app-only flag the
    // window.html bootstrap reads from nw.App.argv.
    appArgs.push('--apptest-headless')
    continue
  }
  if (arg.startsWith('--user-data-dir')) userSetProfile = true
  appArgs.push(arg)
}

// Per-worktree Chromium profile: each checkout (and each --instance within it)
// gets its own --user-data-dir, so worktrees/instances never collide.
if (!userSetProfile) {
  const base = profileBaseForRoot(appDir)
  gcEphemeralProfiles(base)
  const userDataDir = profileDirForRoot(appDir, instance)
  mkdirSync(userDataDir, {recursive: true})
  chromiumArgs.push(`--user-data-dir=${userDataDir}`)
  console.log(`[nwjs] profile ${instance ? `instance '${instance}'` : 'default'} → ${userDataDir}`)
  console.log(`[nwjs] crash dumps → ${crashReportsDir(userDataDir)}`)
}

if (wantRemoteDebug) {
  // A named/ephemeral instance auto-picks a free port unless one was given, so
  // concurrent windows don't collide on 9222.
  const port = remotePort || (instance ? String(await freePort()) : '9222')
  chromiumArgs.push(`--remote-debugging-port=${port}`, '--remote-allow-origins=*')
  console.log(`[nwjs] CDP remote debugging on http://127.0.0.1:${port}`)
}

// `nw <app-dir> [chromium switches] [app args]`. NW.js consumes the chromium
// switches and forwards the rest to nw.App.argv.
const args = [appDir, ...chromiumArgs, ...appArgs]
console.log(args.join(' '))
const child = spawn(nwBin, args, {stdio: 'inherit'})

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})

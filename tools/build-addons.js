#!/usr/bin/env node
/**
 * Per-addon esbuild driver. Discovers every `addons/builtin/<id>/manifest.json`,
 * bundles each addon's TypeScript entry into `build/addons/<id>/<entry>.js`,
 * and writes `build/addons/index.json` for the runtime loader. See plan §2.3,
 * §6 step 5.
 *
 * Usage:
 *   node tools/build-addons.js          # one-shot build
 *   node tools/build-addons.js --watch  # watch mode
 *   node tools/build-addons.js --include-fixtures  # also build tests/fixtures/addons/*
 *
 * Each addon is bundled as ESM with `splitting: true` and shared chunks in
 * `build/addons/_chunks/`. The bundling currently inlines `scripts/*` imports
 * — the runtime resolver that maps externals to the main bundle lands in
 * step 5c.
 */

import * as esbuild from 'esbuild'
import fs from 'fs'
import Path from 'path'
import {fileURLToPath} from 'url'

import {addonApiPlugin} from './addon_api_plugin.js'

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = Path.resolve(Path.dirname(__filename), '..')

const args = process.argv.slice(2)
const WATCH = args.includes('--watch') || args.includes('-w')
const INCLUDE_FIXTURES = args.includes('--include-fixtures')

const BUILTIN_DIR = Path.join(REPO_ROOT, 'addons', 'builtin')
const FIXTURE_DIR = Path.join(REPO_ROOT, 'tests', 'fixtures', 'addons')
const OUT_DIR = Path.join(REPO_ROOT, 'build', 'addons')

/**
 * Scans a directory for manifests. Returns objects shaped like
 * `{id, manifestPath, addonDir, manifest}`.
 */
function discoverManifests(rootDir, kind) {
  if (!fs.existsSync(rootDir)) return []
  const out = []
  for (const name of fs.readdirSync(rootDir)) {
    const addonDir = Path.join(rootDir, name)
    const stat = fs.statSync(addonDir)
    if (!stat.isDirectory()) continue
    const manifestPath = Path.join(addonDir, 'manifest.json')
    if (!fs.existsSync(manifestPath)) continue
    let manifest
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    } catch (err) {
      console.error(`failed to parse ${manifestPath}: ${err.message}`)
      continue
    }
    if (manifest.id !== name) {
      console.error(
        `${manifestPath}: manifest.id ("${manifest.id}") must match directory name ("${name}")`
      )
      continue
    }
    out.push({id: manifest.id, manifestPath, addonDir, manifest, kind})
  }
  return out
}

function buildOptionsFor(entries) {
  return {
    entryPoints: entries.map(({entryPath, outPath}) => ({in: entryPath, out: outPath})),
    outdir     : OUT_DIR,
    bundle     : true,
    target     : 'es2022',
    sourcemap  : 'inline',
    minify     : false,
    treeShaking: false,
    logLevel   : 'info',
    format     : 'esm',
    platform   : 'browser',
    splitting  : true,
    keepNames  : true,
    chunkNames : '_chunks/[name]-[hash]',
    logOverride: {'direct-eval': 'silent'},
    // @addon/<id>/api imports get resolved to a tiny runtime-lookup stub
    // instead of inlining the upstream addon's code. See plan §2.5.
    plugins: [addonApiPlugin(REPO_ROOT)],
  }
}

async function build() {
  const builtins = discoverManifests(BUILTIN_DIR, 'builtin')
  const fixtures = INCLUDE_FIXTURES ? discoverManifests(FIXTURE_DIR, 'fixture') : []
  const all = [...builtins, ...fixtures]

  if (all.length === 0) {
    console.log('No addon manifests found.')
    fs.mkdirSync(OUT_DIR, {recursive: true})
    fs.writeFileSync(Path.join(OUT_DIR, 'index.json'), '[]\n')
    return
  }

  const entries = []
  const index = []

  for (const m of all) {
    const entryPath = Path.join(m.addonDir, m.manifest.entry)
    if (!fs.existsSync(entryPath)) {
      console.error(`${m.manifestPath}: entry "${m.manifest.entry}" does not exist`)
      continue
    }
    // out path: <id>/<entry stem>, esbuild appends .js
    const entryStem = m.manifest.entry.replace(/\.(ts|tsx|js|mjs)$/, '')
    const outPath = `${m.id}/${entryStem}`
    entries.push({entryPath, outPath, id: m.id})

    index.push({
      manifest: m.manifest,
      builtin : m.kind === 'builtin',
      kind    : m.kind,
    })
  }

  const opts = buildOptionsFor(entries)

  if (WATCH) {
    const ctx = await esbuild.context(opts)
    await ctx.watch()
    console.log('build-addons: watching')
  } else {
    await esbuild.build(opts)
  }

  fs.mkdirSync(OUT_DIR, {recursive: true})
  fs.writeFileSync(Path.join(OUT_DIR, 'index.json'), JSON.stringify(index, null, 2) + '\n')
  console.log(`build-addons: wrote ${index.length} addon(s) to ${OUT_DIR}`)
}

await build()

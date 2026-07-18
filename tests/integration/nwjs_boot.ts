/**
 * Shared NW.js boot helper for the headless integration tests.
 *
 * NW.js has no main process: we launch `nw <nwjs-app-dir> <app args>`, and the
 * app args (--headless, --backend, --gen-scene, --eval, --dump, --exit, ...)
 * reach the renderer verbatim as `nw.App.argv` (scripts/core/app_argv.ts). The
 * window.html bootstrap keeps the window hidden under --headless. This replaces
 * the per-test Electron `resolveElectronExe()` + `electron main.js ...` spawn.
 */
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import Path from 'node:path'
import {fileURLToPath} from 'node:url'

const __filename = fileURLToPath(import.meta.url)
export const REPO_ROOT = Path.resolve(Path.dirname(__filename), '../..')
// The NW.js app root is the REPO ROOT (its package.json is the manifest, with
// main = nwjs/window.html), so the chrome-extension root serves build/ + assets/.
export const NWJS_APP_DIR = REPO_ROOT

/** Resolve the NW.js executable via the root `nw` devDependency. */
export function resolveNwjsExe(): string | undefined {
  try {
    // The `nw` package exposes findpath() → the cached binary (not a path export).
    const exe = execFileSync(
      'node',
      ['-e', "require('nw').findpath().then(p=>process.stdout.write(p),()=>process.exit(1))"],
      {cwd: REPO_ROOT, encoding: 'utf-8'}
    ).trim()
    return exe && fs.existsSync(exe) ? exe : undefined
  } catch {
    return undefined
  }
}

/**
 * Boot NW.js headlessly with the given app args and return the parsed `--dump`
 * JSON. `appArgs` is everything the old tests passed after `main.js` (minus the
 * trailing `--dump <out> --exit`, which this adds). Throws if no dump is written.
 */
export function bootDump(nwExe: string, appArgs: string[], opts: {tmpPrefix?: string; timeout?: number} = {}): unknown {
  const out = Path.join(fs.mkdtempSync(Path.join(os.tmpdir(), opts.tmpPrefix ?? 'nwboot-')), 'dump.json')
  // --headless is a Chromium switch NW.js intercepts; the window-hide hint the
  // bootstrap reads is --apptest-headless. Translate so callers can pass either.
  const args = appArgs.map((a) => (a === '--headless' ? '--apptest-headless' : a))
  execFileSync(nwExe, [NWJS_APP_DIR, ...args, '--dump', out, '--exit'], {
    cwd     : REPO_ROOT,
    encoding: 'utf-8',
    stdio   : 'pipe',
    timeout : opts.timeout ?? 120000,
  })
  if (!fs.existsSync(out)) throw new Error(`nwjs dump not written to ${out}`)
  return JSON.parse(fs.readFileSync(out, 'utf-8'))
}

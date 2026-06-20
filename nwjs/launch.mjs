#!/usr/bin/env node
/**
 * NW.js launcher for the app. Replaces electron/run.sh + electron/main.js's
 * arg handling: there is no main process under NW.js, so this thin wrapper just
 * resolves the NW.js binary and spawns it on the app dir (this directory).
 *
 * App flags (--backend, --gen-scene, --eval, --run, --dump, --headless,
 * --no-devtools, ...) are NOT chromium switches, so NW.js hands them to the
 * renderer verbatim as `nw.App.argv` (read by scripts/core/app_argv.ts and the
 * window.html bootstrap). The one ergonomic flag we translate is
 * `--remote-debug[=PORT]`, mapped to the chromium switches that expose a CDP
 * endpoint a direct client (e.g. `nwjs/cdp.mjs`) connects to — no MCP server.
 */
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {dirname} from 'node:path'

const requireCjs = createRequire(import.meta.url)
// The NW.js app root is the REPO ROOT (one level up from nwjs/), so the
// chrome-extension:// root can serve build/, scripts/, and assets/. The
// manifest is the repo-root package.json; its `main` is nwjs/window.html.
const appDir = dirname(dirname(fileURLToPath(import.meta.url)))

// The `nw` npm package exports findpath() → the cached NW.js binary path.
const nwBin = await requireCjs('nw').findpath()

const userArgs = process.argv.slice(2)
// note: support for gc() manual invocation is enabled in package.json
const chromiumArgs = []
const appArgs = []

for (const arg of userArgs) {
  const m = /^--remote-debug(?:=(\d+))?$/.exec(arg)
  if (m) {
    const port = m[1] || '9222'
    chromiumArgs.push(`--remote-debugging-port=${port}`, '--remote-allow-origins=*')
    console.log(`[nwjs] CDP remote debugging on http://127.0.0.1:${port}`)
    continue
  }
  // --headless is a real Chromium switch (it would put Chromium in headless mode
  // and break NW.js's window model). Map the ergonomic CLI flag to the app-only
  // --apptest-headless that the window.html bootstrap reads from nw.App.argv.
  if (arg === '--headless') {
    appArgs.push('--apptest-headless')
    continue
  }
  appArgs.push(arg)
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

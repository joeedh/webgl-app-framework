#!/usr/bin/env node
/**
 * Minimal direct CDP client for the NW.js app — no MCP server, no puppeteer, no
 * Claude Code restart. Talks straight to the Chrome DevTools Protocol endpoint
 * the app exposes under `--remote-debug` (`--remote-debugging-port=9222`).
 *
 * Why direct CDP instead of the chrome-devtools MCP server: an MCP server binds
 * its browser connection once, at MCP-server (Claude Code) startup, so it can
 * only see a browser that was already running on the port at that moment — and
 * any NW.js launched as a child of the agent dies when the agent exits, so it
 * can never satisfy that ordering. This script connects on demand, in-session,
 * to whatever is live on the port.
 *
 * Node 22+ only (global `fetch` + `WebSocket`, no deps).
 *
 * Usage:
 *   node nwjs/cdp.mjs list                 # list CDP targets
 *   node nwjs/cdp.mjs eval "<js expr>"     # evaluate JS in the renderer (CTX /
 *                                          #   _appstate / __nativeManager live there)
 *   node nwjs/cdp.mjs shot <out.png>       # screenshot the page
 *
 * Port override: PORT env var or --port=NNNN (default 9222).
 *
 * The eval expression runs as the body of `(async () => { <expr> })()` with
 * awaitPromise + returnByValue, so you can `return` a JSON-serializable value
 * (or `await`). Example:
 *   node nwjs/cdp.mjs eval "return globalThis.__nativeManager.addon.version()"
 */
const argv = process.argv.slice(2)
const portArg = argv.find((a) => a.startsWith('--port='))
const port = portArg ? portArg.slice(7) : process.env.PORT || '9222'
const rest = argv.filter((a) => !a.startsWith('--port='))
const mode = rest[0]
const arg = rest[1]

const base = `http://127.0.0.1:${port}`
let targets
try {
  targets = await (await fetch(`${base}/json/list`)).json()
} catch (e) {
  console.error(`[cdp] no CDP endpoint on ${base} — is NW.js running with --remote-debug? (${e.message})`)
  process.exit(1)
}

if (mode === 'list') {
  console.log(JSON.stringify(targets.map((t) => ({type: t.type, title: t.title, url: t.url})), null, 2))
  process.exit(0)
}

const page = targets.find((p) => p.type === 'page' && p.webSocketDebuggerUrl) || targets[0]
if (!page?.webSocketDebuggerUrl) {
  console.error('[cdp] no page target with a webSocketDebuggerUrl')
  process.exit(1)
}

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const mid = ++id
    pending.set(mid, {resolve, reject})
    ws.send(JSON.stringify({id: mid, method, params}))
  })
}
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const {resolve, reject} = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
  }
})
await new Promise((res) => ws.addEventListener('open', res))

if (mode === 'eval') {
  if (arg === undefined) {
    console.error('[cdp] usage: node nwjs/cdp.mjs eval "<js expr>"')
    process.exit(1)
  }
  const r = await send('Runtime.evaluate', {
    expression   : `(async()=>{ ${arg} })()`,
    awaitPromise : true,
    returnByValue: true,
  })
  if (r.exceptionDetails) {
    console.error('[cdp] eval threw:', JSON.stringify(r.exceptionDetails.exception ?? r.exceptionDetails))
    ws.close()
    process.exit(1)
  }
  console.log(JSON.stringify(r.result?.value ?? null, null, 2))
} else if (mode === 'shot') {
  const r = await send('Page.captureScreenshot', {format: 'png'})
  const fs = await import('node:fs')
  fs.writeFileSync(arg, Buffer.from(r.data, 'base64'))
  console.log('[cdp] wrote ' + arg)
} else {
  console.error('[cdp] usage: node nwjs/cdp.mjs <list|eval|shot> [arg]')
  ws.close()
  process.exit(1)
}
ws.close()

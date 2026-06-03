// Minimal CDP client (no deps; Node 22+ global WebSocket). Usage:
//   node cdp.mjs eval "<js expression>"
//   node cdp.mjs shot <outPath>
const mode = process.argv[2]
const arg = process.argv[3]

const versionRes = await fetch('http://127.0.0.1:9222/json/list')
const pages = await versionRes.json()
const page = pages.find((p) => p.type === 'page') || pages[0]
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
    pending.get(msg.id).resolve(msg)
    pending.delete(msg.id)
  }
})

await new Promise((res) => ws.addEventListener('open', res))

if (mode === 'eval') {
  const r = await send('Runtime.evaluate', {
    expression: `(async()=>{ ${arg} })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  console.log(JSON.stringify(r.result?.result?.value ?? r.result, null, 2))
} else if (mode === 'shot') {
  const r = await send('Page.captureScreenshot', {format: 'png'})
  const fs = await import('fs')
  fs.writeFileSync(arg, Buffer.from(r.result.data, 'base64'))
  console.log('wrote ' + arg)
}
ws.close()

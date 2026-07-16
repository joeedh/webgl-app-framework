// CLAUDENOTE: real-mouse-stroke profiler. Connects to the live NW.js app over
// CDP, synthesizes a genuine mouse drag through Chromium's input pipeline
// (Input.dispatchMouseEvent), and records per-RAF-frame dab/draw stats so the
// true interactive cadence (events -> dabs -> frames) is measured — unlike the
// stroke tester, which runs all dabs synchronously.
//
// Usage: node mouse-stroke-profile.mjs [--port=9777]

const portArg = process.argv.find((a) => a.startsWith('--port='))
const port = portArg ? portArg.slice(7) : '9777'
const base = `http://127.0.0.1:${port}`

const targets = await (await fetch(`${base}/json/list`)).json()
const page = targets.find((p) => p.type === 'page' && p.webSocketDebuggerUrl)
if (!page) {
  console.error('no page target')
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

async function evalJs(body) {
  const r = await send('Runtime.evaluate', {
    expression: `(async()=>{ ${body} })()`,
    awaitPromise: true,
    returnByValue: true,
  })
  if (r.exceptionDetails) {
    throw new Error('eval threw: ' + JSON.stringify(r.exceptionDetails.exception ?? r.exceptionDetails))
  }
  return r.result?.value
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

// --- 1. setup: show window, frame mesh, install per-frame recorder ---
const setup = await evalJs(`
  const w = nw.Window.get(); w.restore(); w.show(); w.focus();
  const t = window._sculptcoreStrokeTester;
  _appstate.ctx.scene.switchToolMode('sculptcore');
  t.frameMeshInCamera();
  const addon = globalThis.__nativeManager && globalThis.__nativeManager.addon;
  if (addon && addon.redirectStdout) {
    addon.redirectStdout('C:/Users/joeed/AppData/Local/Temp/claude/C--dev-webgl-app-framework/6054124d-7ec1-45d9-a1c1-1054bb74496e/scratchpad/scprof_mouse.txt');
  }
  // wait for RAF to prove the window is really visible
  const rafOk = await new Promise(res=>{let d=false; requestAnimationFrame(()=>{d=true;res(true)}); setTimeout(()=>{if(!d)res(false)},1500)});
  const v3d = _appstate.ctx.view3d;
  const brush = _appstate.ctx.scene.toolmode?.getBrush ? null : null;
  return {rafOk, hidden: document.hidden,
          pos: [...v3d.pos], size: [...v3d.size], dpr: window.devicePixelRatio};
`)
console.error('[setup]', JSON.stringify(setup))
if (!setup.rafOk) {
  console.error('window hidden / RAF stalled — make the app window visible and retry')
  process.exit(2)
}

// --- 2. install recorder + reset profilers ---
await evalJs(`
  const fp = globalThis.__frameProf; fp.frames.length = 0;
  const up = globalThis.__gpuUploadProf;
  globalThis.__mouseRec = {raf: [], up0: {n: up.n, bytes: up.bytes, ms: up.ms}, t0: performance.now(), stop: false};
  const sp = globalThis.__scProf; sp.reset();
  ;(function tick(){
    const r = globalThis.__mouseRec;
    if (r.stop) return;
    requestAnimationFrame(()=>{
      const s = sp.stats.get('sample.total');
      const a = sp.stats.get('applyDabNative');
      r.raf.push({t: +(performance.now()-r.t0).toFixed(1),
                  samples: s ? s.n : 0, sampleMs: s ? +s.total.toFixed(1) : 0,
                  dabMs: a ? +a.total.toFixed(1) : 0});
      tick();
    });
  })();
  return 'recorder-on';
`)

// --- 3. the real mouse drag across the viewport ---
const [px, py] = setup.pos
const [wdt, hgt] = setup.size
const cy = py + hgt * 0.45
const x0 = px + wdt * 0.30
const x1 = px + wdt * 0.70
const MOVES = 120
const MOVE_INTERVAL = 12 // ms — ~83Hz mouse

async function mouse(type, x, y, extra = {}) {
  await send('Input.dispatchMouseEvent', {
    type, x: Math.round(x), y: Math.round(y),
    button: type === 'mouseMoved' ? 'none' : 'left',
    buttons: type === 'mouseReleased' ? 0 : 1,
    clickCount: type === 'mouseMoved' ? 0 : 1,
    ...extra,
  })
}

await mouse('mouseMoved', x0, cy, {buttons: 0})
await sleep(50)
await mouse('mousePressed', x0, cy)
const tStroke0 = Date.now()
for (let i = 1; i <= MOVES; i++) {
  const x = x0 + ((x1 - x0) * i) / MOVES
  await mouse('mouseMoved', x, cy)
  await sleep(MOVE_INTERVAL)
}
await mouse('mouseReleased', x1, cy)
const strokeWall = Date.now() - tStroke0
await sleep(400) // let trailing frames land + endStep report flush

// --- 4. collect ---
const result = await evalJs(`
  const r = globalThis.__mouseRec; r.stop = true;
  const up = globalThis.__gpuUploadProf;
  const fp = globalThis.__frameProf;
  const sp = globalThis.__scProf;
  return {
    raf: r.raf,
    fpFrames: fp.frames.splice(0).map(f=>({dg:+(f.dg||0).toFixed(1), draw:+(f.draw||0).toFixed(1), dispatch:+(f.dispatchMs||0).toFixed(1)})),
    upload: {n: up.n - r.up0.n, MB: +((up.bytes - r.up0.bytes)/1e6).toFixed(1), ms: +(up.ms - r.up0.ms).toFixed(1)},
    lastReport: sp.lastReport,
  };
`)
result.strokeWall = strokeWall
result.moves = MOVES
console.log(JSON.stringify(result))
ws.close()

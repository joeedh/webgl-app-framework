// CLAUDENOTE: headless stroke-profiling driver (non-dyntopo, 1.5M sphere).
// Loaded via --eval "eval(require('fs').readFileSync('<path>','utf8'))".
;(async () => {
  const out = {}
  try {
    // Native printf lands on a dead fd in the NW.js renderer — freopen stdout
    // to a file so the C++ SCPROF report survives (nwjs-renderer-stdout-fd-ebadf).
    const scprofPath =
      'C:/Users/joeed/AppData/Local/Temp/claude/C--dev-webgl-app-framework/6054124d-7ec1-45d9-a1c1-1054bb74496e/scratchpad/scprof_native.txt'
    const addon = globalThis.__nativeManager && globalThis.__nativeManager.addon
    if (addon && addon.redirectStdout) {
      addon.redirectStdout(scprofPath)
      out.scprofPath = scprofPath
    }
    const t = window._sculptcoreStrokeTester
    _appstate.ctx.scene.switchToolMode('sculptcore')
    t.frameMeshInCamera()
    const mesh = t.mesh
    out.verts = mesh.mesh.v.count
    out.backend = globalThis.__SCULPTCORE_BACKEND

    const prof = globalThis.__scProf
    const up = globalThis.__gpuUploadProf

    // Keep points near the viewport center so every dab's raycast hits the
    // sphere (y=0.7 missed entirely in the first run; edges were ~50% misses).
    const mkPoints = (y, n) => Array.from({length: n}, (_, i) => [0.3 + (0.4 * i) / (n - 1), y])

    const fp = globalThis.__frameProf

    const strokes = []
    const run = async (name, opts) => {
      const t0 = performance.now()
      const r = t.runStroke(opts)
      const strokeMs = performance.now() - t0
      fp.frames.length = 0
      // Frame 0 = the dirty post-stroke frame (GPU-half fill + re-uploads);
      // frames 1-2 = clean frames (baseline render cost, nothing dirty).
      const frames = []
      for (let i = 0; i < 3; i++) {
        const u0 = {n: up.n, bytes: up.bytes, ms: up.ms}
        const tf = performance.now()
        if (i === 0) {
          await r.redrawPromise
        } else {
          await window.redraw_viewport_p(true)
        }
        const rec = fp.frames.splice(0).pop() || {}
        rec.wall = performance.now() - tf
        rec.uploadN = up.n - u0.n
        rec.uploadMB = (up.bytes - u0.bytes) / 1e6
        rec.uploadMs = up.ms - u0.ms
        frames.push(rec)
      }
      strokes.push({name, dabs: r.dabs, strokeMs, ts: prof.lastReport, frames})
    }

    // Warmup: first-touch page materialization, lazy attr creation, JIT.
    await run('warmup-clay', {points: mkPoints(0.35, 40), radius: 120})
    await run('clay', {points: mkPoints(0.42, 40), radius: 120})
    await run('clay2', {points: mkPoints(0.5, 40), radius: 120})
    await run('draw', {points: mkPoints(0.58, 40), radius: 120, sculptTool: 4})
    await run('smooth', {points: mkPoints(0.46, 40), radius: 120, sculptTool: 3})
    await run('smooth2', {points: mkPoints(0.54, 40), radius: 120, sculptTool: 3})
    out.strokes = strokes
    out.ok = true
  } catch (e) {
    out.ok = false
    out.error = String((e && e.stack) || e)
  }
  globalThis.__evalTestResult = out
})()

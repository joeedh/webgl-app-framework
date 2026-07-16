// CLAUDENOTE: viewport-framerate survey driver (solid mode, no strokes).
// Orbits the camera slightly each frame and measures 30 consecutive redraws:
// main-thread draw breakdown (__frameProf), uniform-write counters (__ubProf),
// and GPU completion time (queue.onSubmittedWorkDone).
;(async () => {
  const out = {}
  try {
    const t = window._sculptcoreStrokeTester
    _appstate.ctx.scene.switchToolMode('sculptcore')
    t.frameMeshInCamera()
    out.verts = t.mesh.mesh.v.count
    out.backend = globalThis.__SCULPTCORE_BACKEND

    const fp = globalThis.__frameProf
    const ub = globalThis.__ubProf
    const up = globalThis.__gpuUploadProf

    // Warm up: a few frames so pipelines/bind rings/buffers exist.
    for (let i = 0; i < 4; i++) {
      await window.redraw_viewport_p(true)
    }
    const device = globalThis.__getWebGpuDevice && globalThis.__getWebGpuDevice()
    out.haveDevice = !!device

    const view3d = _appstate.ctx.view3d
    const cam = view3d.activeCamera

    const frames = []
    fp.frames.length = 0
    for (let i = 0; i < 30; i++) {
      // Small orbit: rotate camera pos around Z so every frame has fresh
      // matrices (the realistic navigation case) but no geometry dirt.
      const a = 0.01
      const x = cam.pos[0] * Math.cos(a) - cam.pos[1] * Math.sin(a)
      const y = cam.pos[0] * Math.sin(a) + cam.pos[1] * Math.cos(a)
      cam.pos[0] = x
      cam.pos[1] = y
      cam.regen_mats()

      const u0 = {writes: ub.writes, applyMs: ub.applyMs, writeMs: ub.writeMs, creates: ub.creates}
      const up0 = {n: up.n, ms: up.ms, bytes: up.bytes}
      const t0 = performance.now()
      await window.redraw_viewport_p(true)
      const cpuDone = performance.now()
      if (device) {
        await device.queue.onSubmittedWorkDone()
      }
      const gpuDone = performance.now()

      const rec = fp.frames.splice(0).pop() || {}
      rec.cpuMs = cpuDone - t0
      rec.gpuWaitMs = gpuDone - cpuDone
      rec.ubWrites = ub.writes - u0.writes
      rec.ubApplyMs = ub.applyMs - u0.applyMs
      rec.ubWriteMs = ub.writeMs - u0.writeMs
      rec.ubCreates = ub.creates - u0.creates
      rec.upN = up.n - up0.n
      rec.upMB = (up.bytes - up0.bytes) / 1e6
      frames.push(rec)
    }
    out.frames = frames
    out.ok = true
  } catch (e) {
    out.ok = false
    out.error = String((e && e.stack) || e)
  }
  globalThis.__evalTestResult = out
})()

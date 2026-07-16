// CLAUDENOTE: gpu_tri_target sweep (viewport-framerate survey). For each
// target: rebuild the spatial tree, measure 20 orbit frames (main-thread draw,
// GPU wait, commands/drawn) and one localized clay stroke (dab cost + dirty
// frame). Requires the dispatch-cache/bundle/cull executor.
;(async () => {
  const out = {}
  try {
    const t = window._sculptcoreStrokeTester
    _appstate.ctx.scene.switchToolMode('sculptcore')
    t.frameMeshInCamera()
    out.verts = t.mesh.mesh.v.count
    out.backend = globalThis.__SCULPTCORE_BACKEND

    const fp = globalThis.__frameProf
    const up = globalThis.__gpuUploadProf
    const prof = globalThis.__scProf
    const mesh = t.mesh
    const view3d = _appstate.ctx.view3d
    const cam = view3d.activeCamera

    for (let i = 0; i < 4; i++) {
      await window.redraw_viewport_p(true)
    }
    const device = globalThis.__getWebGpuDevice && globalThis.__getWebGpuDevice()
    out.haveDevice = !!device

    const median = (arr) => {
      const s = arr.filter((v) => v !== undefined && v !== null).sort((a, b) => a - b)
      return s.length ? s[Math.floor(s.length / 2)] : 0
    }

    const measureFrames = async (n) => {
      const recs = []
      fp.frames.length = 0
      for (let i = 0; i < n; i++) {
        const a = 0.012
        const x = cam.pos[0] * Math.cos(a) - cam.pos[1] * Math.sin(a)
        const y = cam.pos[0] * Math.sin(a) + cam.pos[1] * Math.cos(a)
        cam.pos[0] = x
        cam.pos[1] = y
        cam.regen_mats()
        const t0 = performance.now()
        await window.redraw_viewport_p(true)
        const cpuDone = performance.now()
        if (device) {
          await device.queue.onSubmittedWorkDone()
        }
        const gpuDone = performance.now()
        const rec = fp.frames.splice(0).pop() || {}
        rec.cpu = cpuDone - t0
        rec.gpu = gpuDone - cpuDone
        recs.push(rec)
      }
      return {
        drawMs   : median(recs.map((r) => r.draw)),
        gpuMs    : median(recs.map((r) => r.gpu)),
        dispatch : median(recs.map((r) => r.dispatchMs)),
        cmds     : median(recs.map((r) => r.dispatchCmds)),
        drawn    : median(recs.map((r) => r.dispatchDrawn)),
        encodes  : recs.reduce((s, r) => s + (r.bundleEncodes ?? 0), 0),
      }
    }

    const targets = [2048, 8192, 16384, 32768, 65536, 131072]
    const results = []
    for (const target of targets) {
      globalThis.__SC_GPU_TRI_TARGET = target
      const tr0 = performance.now()
      mesh.rebuildSpatialFromEdit()
      const rebuildMs = performance.now() - tr0
      // settle: first frames rebuild caches/bundles + upload fresh buffers
      for (let i = 0; i < 4; i++) {
        await window.redraw_viewport_p(true)
      }
      const frames = await measureFrames(20)

      // Zoomed-in view: verifies frustum culling engages (drawn << cmds) and
      // measures the culled frame cost.
      const savedPos = [cam.pos[0], cam.pos[1], cam.pos[2]]
      cam.pos[0] *= 0.35
      cam.pos[1] *= 0.35
      cam.pos[2] *= 0.35
      cam.regen_mats()
      for (let i = 0; i < 2; i++) {
        await window.redraw_viewport_p(true)
      }
      const zoomed = await measureFrames(8)
      cam.pos[0] = savedPos[0]
      cam.pos[1] = savedPos[1]
      cam.pos[2] = savedPos[2]
      cam.regen_mats()
      await window.redraw_viewport_p(true)

      // Localized stroke: dab cost + the dirty frame after it.
      prof.reset()
      up.n = 0
      up.bytes = 0
      up.ms = 0
      const pts = Array.from({length: 10}, (_, i) => [0.46 + (0.08 * i) / 9, 0.6])
      const r = t.runStroke({points: pts, radius: 40})
      const ts = prof.lastReport
      fp.frames.length = 0
      const tf0 = performance.now()
      await r.redrawPromise
      const dirtyFrame = fp.frames.splice(0).pop() || {}
      dirtyFrame.wall = performance.now() - tf0
      results.push({
        target,
        rebuildMs,
        frames,
        zoomed,
        dabNativeAvg: ts.applyDabNative ? ts.applyDabNative.avg : null,
        uqAvg       : ts.updateQueries ? ts.updateQueries.avg : null,
        dirtyDraw   : dirtyFrame.draw,
        dirtyUploadMB: (up.bytes / 1e6),
        dirtyUploadMs: up.ms,
      })
    }
    out.results = results
    out.ok = true
  } catch (e) {
    out.ok = false
    out.error = String((e && e.stack) || e)
  }
  globalThis.__evalTestResult = out
})()

/**
 * GPU brush-stroke controller (documentation/plans/gpuGlobalBrushes.md §5).
 *
 * Owns one stroke's GpuBrush_* seam session + GpuBrushStroke dispatcher on
 * behalf of SculptPaintOp: eligibility (D5), per-dab marshal + dispatch, the
 * coalesced async readback that keeps rendering current in the M2 shape, the
 * shadow-verify mode (CPU authoritative + per-dab GPU diff, §9.3), the
 * capture/replay fixture hook (§9.2), and the window.DEBUG.gpuBrush surface
 * (§9.1). All GPU work serializes through one promise chain so per-dab
 * readbacks, undo requests, and the stroke-end apply can never interleave.
 */

import {
  GpuBrushData,
  GpuBrushInfo,
  IWasmInterface,
  SculptHandle,
} from '@sculptcore/api/api'
import {SculptBrushes} from '@sculptcore/api/sculptcore/brush/SculptBrushes'

import {GpuBrushStroke, GpuBrushStats} from '../../../webgpu/brush_compute'
import {getActiveWebGpuContext} from '../../../render/queue_factory'
import {FeatureFlags} from '../../../core/feature-flag'

import type {LiteMesh} from '../../../lite-mesh/litemesh'

const SHADOW_ATOL = 1e-5
const SHADOW_RTOL = 1e-4
const SHADOW_LOG_VERTS = 8

/** window.DEBUG.gpuBrush — the CDP-reachable debug surface (§9.1). */
export interface GpuBrushDebug {
  verbose: boolean
  /** Test hook: let non-modal (exec-replayed) strokes take the GPU path. The
   * headless parity harness drives SculptPaintOp through execTool, which is
   * non-modal; real replay determinism stays CPU because this defaults off. */
  allowNonModal: boolean
  /** Pending capture count: the next N GPU strokes record replay fixtures. */
  captureNext: number
  /** The last captured stroke fixture (tests/webgpu/replay.mjs format). */
  lastFixture: object | undefined
  /** The last (or live) stroke's stats object. */
  lastStats: GpuBrushStats | undefined
  /** Divergent-dab count reported by shadow-verify this session. */
  shadowDivergences: number
  capture(strokes?: number): void
  state(): object | undefined
  /** Mid-stroke: sync the CPU mesh from the GPU buffers so every existing
   * inspection tool sees live GPU state. No-op with no active GPU stroke. */
  forceReadback(): Promise<boolean>
}

/** Install (or fetch) window.DEBUG.gpuBrush. Exported for the headless parity
 * driver, which needs `allowNonModal` set before the first GPU stroke. */
export function ensureGpuBrushDebug(): GpuBrushDebug {
  return ensureDebugSurface()
}

function ensureDebugSurface(): GpuBrushDebug {
  const w = window as unknown as {DEBUG?: Record<string, unknown>}
  w.DEBUG = w.DEBUG ?? {}
  let dbg = w.DEBUG.gpuBrush as GpuBrushDebug | undefined
  if (!dbg) {
    dbg = {
      verbose          : false,
      allowNonModal    : false,
      captureNext      : 0,
      lastFixture      : undefined,
      lastStats        : undefined,
      shadowDivergences: 0,
      capture(strokes = 1) {
        this.captureNext = strokes
      },
      state() {
        const c = activeController
        return {
          active : !!c,
          shadow : c?.shadow ?? false,
          stats  : this.lastStats,
          session: c
            ? {
                kernel     : c.stroke.kernel,
                elemCount  : c.stroke.elemCount,
                uniqueCount: c.wasm.GpuBrush_info(c.session, GpuBrushInfo.UNIQUE_COUNT),
                nodeCount  : c.wasm.GpuBrush_info(c.session, GpuBrushInfo.NODE_COUNT),
                dabGen     : c.wasm.GpuBrush_info(c.session, GpuBrushInfo.DAB_GEN),
                lastBrushUniformsHex: hex(c.wasm.GpuBrush_data(c.session, GpuBrushData.BRUSH_UNIFORMS)),
                lastCtxUniformsHex  : hex(c.wasm.GpuBrush_data(c.session, GpuBrushData.CTX_UNIFORMS)),
              }
            : undefined,
        }
      },
      async forceReadback() {
        const c = activeController
        if (!c || !c.stroke.valid) {
          return false
        }
        await c.forceReadback()
        return true
      },
    }
    w.DEBUG.gpuBrush = dbg
  }
  return dbg
}

function hex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, '0')
    if ((i & 3) === 3) {
      out += ' '
    }
  }
  return out.trim()
}

/** The live stroke's controller (one GPU stroke at a time), for the debug
 * surface's mid-stroke hatches. */
let activeController: GpuStrokeController | undefined = undefined

export interface GpuStrokeBeginArgs {
  wasm: IWasmInterface
  mesh: LiteMesh
  /** Bound sculptcore::brush::Brush (already writeProps'd). */
  wasmBrush: SculptHandle
  meshLog: SculptHandle
  brushType: number
  /** Replay (non-modal exec) must stay on the CPU for determinism. */
  modalRunning: boolean
  dyntopoEnabled: boolean
  autosmooth: number
}

export class GpuStrokeController {
  readonly wasm: IWasmInterface
  readonly session: SculptHandle
  readonly stroke: GpuBrushStroke
  /** Shadow-verify: the CPU executor stays authoritative; the GPU runs in
   * parallel and every dab is diffed (§9.3). */
  readonly shadow: boolean
  /** Resolves when all enqueued GPU work (readbacks, final apply) has landed.
   * Undo/redo arriving mid-await chain onto it. */
  completion: Promise<void> = Promise.resolve()

  private mesh: LiteMesh
  private chain: Promise<void> = Promise.resolve()
  private readbackQueued = false
  private finished = false
  private debug: GpuBrushDebug

  /**
   * Evaluate D5 eligibility once per stroke and open the session + dispatcher.
   * Any miss returns undefined and the caller stays on the CPU path,
   * unchanged. Never throws.
   */
  static tryBegin(args: GpuStrokeBeginArgs): GpuStrokeController | undefined {
    try {
      const flagOn = FeatureFlags.get('sculptcore.gpu_brush') as boolean
      const shadowOn = FeatureFlags.get('sculptcore.gpu_brush_verify') as boolean
      if (!flagOn && !shadowOn) {
        return undefined
      }
      const debugSurface = ensureDebugSurface()
      if (!args.modalRunning && !debugSurface.allowNonModal) {
        return undefined
      }
      if (args.dyntopoEnabled || args.autosmooth > 0) {
        return undefined
      }
      // Kernel-map gate: KELVINLET first (M2); GRAB lands with M4.
      if (args.brushType !== (SculptBrushes.KELVINLET as number)) {
        return undefined
      }
      const device = getActiveWebGpuContext()?.device
      if (!device) {
        return undefined
      }
      const session = args.wasm.GpuBrush_beginStroke(
        args.mesh.mesh,
        args.mesh.spatial,
        args.wasmBrush,
        args.meshLog,
        args.brushType
      )
      if (!session) {
        return undefined
      }
      const debug = debugSurface
      const capture = debug.captureNext > 0
      if (capture) {
        debug.captureNext--
      }
      const stroke = new GpuBrushStroke({
        device,
        wasm: args.wasm,
        session,
        capture,
        log : (msg) => console.warn(`[gpu-brush] ${msg}`),
      })
      const ctl = new GpuStrokeController(args.wasm, args.mesh, session, stroke, shadowOn, debug)
      void stroke.begin().then((ok) => {
        if (!ok) {
          console.warn('[gpu-brush] begin failed; stroke falls back to CPU-applied finish')
        }
      })
      return ctl
    } catch (e) {
      console.warn('[gpu-brush] tryBegin failed:', e)
      return undefined
    }
  }

  private constructor(
    wasm: IWasmInterface,
    mesh: LiteMesh,
    session: SculptHandle,
    stroke: GpuBrushStroke,
    shadow: boolean,
    debug: GpuBrushDebug
  ) {
    this.wasm = wasm
    this.mesh = mesh
    this.session = session
    this.stroke = stroke
    this.shadow = shadow
    this.debug = debug
    this.debug.lastStats = stroke.stats
    activeController = this
  }

  /**
   * Marshal + dispatch one dab image. Returns true when the GPU path is still
   * healthy; the caller keeps its CPU work only in shadow mode. In pure GPU
   * mode a coalesced async readback keeps rendering current (M2 shape).
   */
  dab(
    center: ArrayLike<number | undefined>,
    normal: ArrayLike<number | undefined>,
    radius: number,
    filterRadius: number,
    mirrorIdx: number,
    nonAccum: boolean
  ): boolean {
    if (this.finished) {
      return false
    }
    const t0 = performance.now()
    const n = this.wasm.GpuBrush_marshalDab(
      this.session,
      center[0] ?? 0,
      center[1] ?? 0,
      center[2] ?? 0,
      normal[0] ?? 0,
      normal[1] ?? 0,
      normal[2] ?? 1,
      radius,
      filterRadius,
      mirrorIdx,
      nonAccum ? 1 : 0
    )
    this.stroke.stats.marshalMs += performance.now() - t0
    if (mirrorIdx === 0) {
      this.stroke.stats.dabs++
    }
    if (n > 0) {
      this.stroke.dab(n)
    }
    if (this.stroke.valid && !this.shadow) {
      this.scheduleReadback()
    }
    if (this.stroke.valid && this.shadow && mirrorIdx === 0) {
      this.scheduleShadowDiff()
    }
    if (this.debug.verbose) {
      console.log(
        `[gpu-brush] dab ${this.stroke.stats.dabs} img ${mirrorIdx}: ${n} workgroups, ` +
          `${this.wasm.GpuBrush_info(this.session, GpuBrushInfo.UNIQUE_COUNT)} verts`
      )
    }
    return this.stroke.valid
  }

  /** Drop the GPU stroke before any dispatch landed (begin failed): free the
   * session so the caller can run the whole stroke on the CPU path. */
  abort() {
    this.finished = true
    activeController = undefined
    this.wasm.GpuBrush_free(this.session)
    this.stroke.destroy()
  }

  /** Mid-stroke CPU sync for the debug surface: readback + applyCo + spatial
   * refresh, serialized on the chain. */
  forceReadback(): Promise<void> {
    return this.enqueue(async () => {
      const co = await this.stroke.readCo()
      if (co && !this.finished) {
        this.wasm.GpuBrush_applyCo(this.session, co)
        this.refreshMesh()
      }
    })
  }

  /**
   * Close the stroke (§5): final readback → GpuBrush_endStroke (snapshot +
   * write + dirty + free) → mesh refresh → `tail` (the op's endStep/dispose
   * sequence). In shadow mode the CPU already owns the mesh, so the session is
   * freed without an apply. `tail` runs exactly once, even on GPU failure.
   * Returns the completion promise (also stored on `.completion`).
   */
  finish(tail: () => void): Promise<void> {
    this.finished = true
    activeController = undefined
    this.completion = this.enqueue(async () => {
      try {
        if (this.shadow) {
          // CPU path owns the mesh; drop the GPU side.
          this.wasm.GpuBrush_free(this.session)
        } else {
          const co = this.stroke.valid ? await this.stroke.readCo() : null
          if (this.stroke.stats.tripwireTripped) {
            // §9.4: a poisoned buffer must never reach the mesh or the undo
            // step — finish from the CPU state (per-dab applies already
            // landed only finite-checked-late data; the conservative choice
            // is to keep whatever the mesh already holds).
            console.warn('[gpu-brush] tripwire tripped — discarding final GPU readback')
            this.wasm.GpuBrush_endStroke(this.session, null, null)
          } else if (co) {
            const fixture = this.stroke.captureFixture(co)
            if (fixture) {
              this.debug.lastFixture = fixture
              console.warn('[gpu-brush] stroke fixture captured (DEBUG.gpuBrush.lastFixture)')
            }
            this.wasm.GpuBrush_endStroke(this.session, co, null)
          } else {
            // GPU died mid-stroke: per-dab applies (if any) already landed
            // consistent geometry; endStroke(null) just frees.
            this.wasm.GpuBrush_endStroke(this.session, null, null)
          }
          this.refreshMesh()
        }
      } finally {
        this.stroke.destroy()
        tail()
      }
    })
    // Test/report seam: the headless harness awaits this before reading
    // buffers (the finalization is mapAsync-bearing).
    ;(window as unknown as {__gpuBrushCompletion?: Promise<void>}).__gpuBrushCompletion = this.completion
    return this.completion
  }

  // -----------------------------------------------------------------------

  /** Serialize all GPU work; errors are logged, never thrown into callers. */
  private enqueue(fn: () => Promise<void>): Promise<void> {
    this.chain = this.chain.then(fn).catch((e) => {
      console.warn('[gpu-brush] async stage failed:', e)
    })
    return this.chain
  }

  /** Coalesced per-dab readback: at most one queued at a time — a burst of
   * dabs costs one readback, not N (the debug app's per-frame flush shape). */
  private scheduleReadback() {
    if (this.readbackQueued) {
      return
    }
    this.readbackQueued = true
    void this.enqueue(async () => {
      this.readbackQueued = false
      if (this.finished || !this.stroke.valid) {
        return
      }
      const co = await this.stroke.readCo()
      if (co && !this.finished) {
        this.wasm.GpuBrush_applyCo(this.session, co)
        this.refreshMesh()
      }
    })
  }

  /** §9.3: diff the GPU buffers against the authoritative CPU mesh after a
   * dab. On breach: log the first N divergent verts, auto-capture, and
   * re-sync the GPU co buffer so divergence never compounds. */
  private scheduleShadowDiff() {
    void this.enqueue(async () => {
      if (this.finished || !this.stroke.valid) {
        return
      }
      const gpuCo = await this.stroke.readCo()
      if (!gpuCo || this.finished) {
        return
      }
      const liveBytes = this.wasm.GpuBrush_data(this.session, GpuBrushData.LIVE_CO).slice()
      const cpuCo = new Float32Array(liveBytes.buffer, 0, liveBytes.byteLength / 4)
      const uvBytes = this.wasm.GpuBrush_data(this.session, GpuBrushData.UVERTS).slice()
      const uverts = new Uint32Array(uvBytes.buffer, 0, uvBytes.byteLength / 4)

      let divergent = 0
      for (const v of uverts) {
        let bad = false
        for (let j = 0; j < 3; j++) {
          const a = cpuCo[v * 3 + j]
          const b = gpuCo[v * 3 + j]
          const d = Math.abs(a - b)
          if (d > SHADOW_ATOL + SHADOW_RTOL * Math.abs(a)) {
            bad = true
            break
          }
        }
        if (!bad) {
          continue
        }
        divergent++
        if (divergent <= SHADOW_LOG_VERTS) {
          console.warn(
            `[gpu-brush] shadow-verify divergence v${v}: cpu(${cpuCo[v * 3]}, ${cpuCo[v * 3 + 1]}, ` +
              `${cpuCo[v * 3 + 2]}) gpu(${gpuCo[v * 3]}, ${gpuCo[v * 3 + 1]}, ${gpuCo[v * 3 + 2]})`
          )
        }
      }
      if (divergent > 0) {
        this.debug.shadowDivergences++
        console.warn(
          `[gpu-brush] shadow-verify: ${divergent}/${uverts.length} divergent verts at dab ` +
            `${this.stroke.stats.dabs}; re-syncing GPU from CPU`
        )
        const fixture = this.stroke.captureFixture(gpuCo)
        if (fixture) {
          this.debug.lastFixture = fixture
        }
        this.stroke.resyncCo(cpuCo)
      } else if (this.debug.verbose) {
        console.log(`[gpu-brush] shadow-verify dab ${this.stroke.stats.dabs}: 0 divergent`)
      }
    })
  }

  private refreshMesh() {
    this.mesh.regenTreeBatch()
    this.mesh.spatial.update(this.mesh.wasm.gpu)
    this.mesh.regenBounds()
    window.redraw_viewport()
  }
}

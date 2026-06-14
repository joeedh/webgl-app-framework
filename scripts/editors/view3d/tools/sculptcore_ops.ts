import {CommandExecutor, MeshLog, SpatialNode, Brush as WasmBrush, BrushProgram, DynTopoParams} from '@sculptcore/api'
import type {ToolContext, ViewContext} from '../../../core/context'
import {LiteMesh, LiteMeshDisplayMode} from '../../../lite-mesh/index'
import {Matrix4, ToolOp, Vector3, Vector4} from '../../../path.ux/pathux'
import {StrokeDriverOp} from './stroke_paint_op'
import {IStrokeHit, StrokeRayCast} from './stroke_driver'
import type {SculptCorePaintMode} from './sculptcore'
import {getWasmImmediate} from '@sculptcore/api/api'
import type {SculptBrush} from '../../../brush/index'
import {
  builSculptcoreBrush,
  toolToSculptBrush,
  buildBrushProgram,
  pushBrushDeviceInputs,
  configureDynTopoParams,
  isGrabTool,
} from './sculptcore_bindings'
import {BrushFlags, SculptTools, resolvePlaneDabNormal} from '../../../brush/brush_base'
import {PaintSample} from './pbvh_paintsample'
import type {View3D} from '../view3d'
import {view3dProject, view3dUnproject} from '../view3d_base'

export interface IGetBrushRet {
  brush: SculptBrush
  wasmExec: CommandExecutor
  wasmBrush: WasmBrush
}

/**
 * "Show what you paint": switch the LiteMesh surface display to the attribute
 * the active attribute-brush writes (color → vertex color, polygroup → poly
 * groups), so painted results are visible without manually toggling the ObData
 * display mode. Sculpting brushes (draw/smooth/…) leave the display untouched.
 * No-op when the display is already in the right mode (the setter dirties every
 * GPU node, so we guard against re-running it each dab).
 */
function syncDisplayModeToBrush(mesh: LiteMesh, tool: SculptTools): void {
  // displayColorMode is a bitmask, so OR the relevant overlay on without
  // disturbing any other enabled overlay (the user may want both at once).
  let bit = 0
  if (tool === SculptTools.COLOR) {
    bit = LiteMeshDisplayMode.VERTEX_COLOR
  } else if (tool === SculptTools.POLYGROUP) {
    bit = LiteMeshDisplayMode.POLY_GROUP
  }
  if (bit !== 0 && (mesh.displayColorMode & bit) === 0) {
    mesh.displayColorMode = mesh.displayColorMode | bit
  }
}

export class SculptPaintOp extends StrokeDriverOp<{}, {}> {
  wasmBrush?: WasmBrush
  executor?: CommandExecutor
  brushProgram?: BrushProgram
  /** Reused per-stroke dyntopo params handle (rebuilt fields each dab). */
  dynTopoParams?: DynTopoParams
  /** Deterministic per-dab seed for dyntopo's independent-set selection. */
  dabSeed = 1
  /** Poly-group id for the active stroke (computed once on the first dab:
   * a fresh maxFaceGroup()+1, or the sampled id under the cursor with shift). */
  strokeGroupId?: number
  /** Previous dab's object-local surface center, for grab brushes (kelvinlet):
   * grabTo = thisDab − prevDab. Undefined until the first dab of the stroke. */
  prevDabLocal?: Vector3

  static meshLog: MeshLog | undefined
  inStep = false
  /** MeshLog step id owned by this op (set in undoPre); -1 = none. Keys
   * calcUndoMem/onUndoDestroy so stack trimming frees the C++ step too. */
  logStepId = -1

  /** Monotonic, process-global non-accumulate generation stamp; pre-incremented
   * once per stroke (so the first stroke gets 1, never 0 = "not stamped"). The
   * executor + dyntopo key each vert's `.brush.orig.*` snapshot on it. */
  static nextStrokeGen = 0
  /** This stroke's generation stamp (set in undoPre). */
  curStrokeGen = 0

  static tooldef() {
    return {
      toolpath: 'sculptcore.paint',
      inputs  : {},
      outputs : {},
      is_modal: true,
    }
  }

  constructor() {
    super()
    if (SculptPaintOp.meshLog === undefined) {
      const wasm = getWasmImmediate()!
      SculptPaintOp.meshLog = wasm.manager.construct('sculptcore::meshlog::MeshLog')
    }
  }

  undoPre(ctx: ToolContext) {
    const brush = this.inputs.brush.getValue()
    const hasDyntopo = brush.dynTopoSC.enabled

    this.strokeGroupId = undefined
    this.prevDabLocal = undefined
    this.dabSeed = 1
    this.curStrokeGen = ++SculptPaintOp.nextStrokeGen
    ;(ctx.toolmode as SculptCorePaintMode | undefined)?.resetDynTopoStats()
    if (SculptPaintOp.meshLog) {
      SculptPaintOp.meshLog.beginStep(hasDyntopo)
      this.logStepId = SculptPaintOp.meshLog.lastStepId()
      this.inStep = true
      window.redraw_viewport()
    }
  }

  undo(ctx: ToolContext) {
    if (SculptPaintOp.meshLog) {
      const mesh = ctx.object!.data! as LiteMesh
      SculptPaintOp.meshLog.undo(mesh.mesh, mesh.spatial)
      window.redraw_viewport()
    }
  }

  redo(ctx: ToolContext) {
    if (SculptPaintOp.meshLog) {
      const mesh = ctx.object!.data! as LiteMesh
      SculptPaintOp.meshLog.redo(mesh.mesh, mesh.spatial)
      window.redraw_viewport()
    }
  }

  /** Undo data lives in the shared C++ MeshLog; report this op's step size so
   * the tool stack's memory limit sees the real cost. */
  calcUndoMem(_ctx: ToolContext): number {
    const log = SculptPaintOp.meshLog
    if (!log || this.logStepId < 0) {
      return 0
    }
    return log.stepMemSize(this.logStepId)
  }

  /** Stack trim dropped this op — free its C++ MeshLog step too. */
  onUndoDestroy(): void {
    const log = SculptPaintOp.meshLog
    if (log && this.logStepId >= 0) {
      log.freeStep(this.logStepId)
      this.logStepId = -1
    }
  }

  getBrush(ctx: ToolContext, ps: PaintSample): IGetBrushRet {
    const brush = this.inputs.brush.getValue()
    // Non-accumulate is the default (ACCUMULATE bit CLEAR). The executor ignores
    // it for non-deform brushes, so it's safe to pass unconditionally.
    const nonAccum = !(brush.flag & BrushFlags.ACCUMULATE)
    const result = builSculptcoreBrush({
      wasm: getWasmImmediate()!,
      brush,
      mesh     : ctx.object!.data as LiteMesh,
      radius   : this.calcRadius(brush.radius),
      invert   : ps.invert,
      wasmBrush: this.wasmBrush,
      wasmExec : this.executor,
      nonAccum,
      strokeGen: this.curStrokeGen,
    })

    this.wasmBrush = result.wasmBrush
    this.executor = result.wasmExec
    return {brush, ...result}
  }

  calcRadius(screenRadius: number): number {
    return screenRadius
  }

  /** Lazily-constructed, reused-per-dab composite brush program (autosmooth). */
  getProgram(): BrushProgram {
    if (!this.brushProgram) {
      this.brushProgram = getWasmImmediate()!.manager.construct('sculptcore::brush::BrushProgram') as BrushProgram
    }
    return this.brushProgram
  }

  /** Lazily-constructed, reused-per-dab dyntopo params handle. */
  getDynTopoParams(): DynTopoParams {
    if (!this.dynTopoParams) {
      this.dynTopoParams = getWasmImmediate()!.manager.construct('sculptcore::dyntopo::DynTopoParams') as DynTopoParams
    }
    return this.dynTopoParams
  }

  /** World-space ray cast for the stroke driver's control points: world
   * origin/dir -> object-local -> mesh.rayCast -> hit back in world space. */
  makeRayCast(): StrokeRayCast {
    const ctx = this.modal_ctx!
    const mesh = ctx.object!.data as LiteMesh

    return (origin: Vector3, dir: Vector3): IStrokeHit | undefined => {
      const obmat = new Matrix4(ctx.object!.outputs.matrix.getValue())
      const imatrix = new Matrix4(obmat)
      imatrix.invert()

      const o = origin.copy()
      const d = dir.copy()
      o.multVecMatrix(imatrix)
      d.multVecMatrix(imatrix)

      const isect = mesh.rayCast(o, d)
      if (!isect) {
        return undefined
      }

      const p = new Vector3(isect.p)
      p.multVecMatrix(obmat)
      const normal = new Vector3(isect.normal)
      normal.multVecMatrix(obmat)

      return {p, normal, dist: isect.dis}
    }
  }

  /** Apply one evenly-spaced driver dab: re-raycast at the sample's screen
   * point to snap to the surface (object-local space), then run the sculptcore
   * brush pipeline + optional dyntopo over the filtered nodes. */
  applyDab(ctx: ViewContext | ToolContext, ps: PaintSample): void {
    if (!this.inStep) {
      return
    }

    const view3d = (ctx as ViewContext).view3d as View3D | undefined
    const toolmode = ctx.toolmode as SculptCorePaintMode

    // XXX move this into the base class and out of applyDab
    if (view3d !== undefined) {
      view3d.resetDrawLines()
      toolmode.mpos[0] = ps.screenP[0] + view3d.pos![0]
      toolmode.mpos[1] = ps.screenP[1] + view3d.pos![1]
      toolmode.drawBrush(view3d, true, ps.screenP[0] + view3d.pos![0], ps.screenP[1] + view3d.pos![1])
    }

    const {brush, wasmExec, wasmBrush} = this.getBrush(ctx, ps)
    const wasm = getWasmImmediate()!

    const viewvec = ps.viewvec
    const origin = ps.vieworigin
    const mesh = ctx.object!.data as LiteMesh

    const imatrix = new Matrix4(ctx.object!.outputs.matrix.getValue())
    imatrix.invert()

    viewvec.multVecMatrix(imatrix)
    origin.multVecMatrix(imatrix)

    const isect = mesh.rayCast(origin, viewvec)

    let radius = this.calcRadius(ps.radius)

    if (isect === undefined) {
      return
    }

    const {p, normal} = isect

    const p4 = new Vector4().load3(p)
    p4[3] = 1.0
    p4.multVecMatrix(ps.rendermat)

    const m1 = new Vector3(p)
    view3dProject(m1, ps.view3dSize, ps.rendermat)
    const m2 = new Vector3(m1)
    m2[0] += 1

    view3dUnproject(m2, ps.view3dSize, ps.irendermat)

    const dist = m2.vectorDistance(p)
    radius *= dist

    // XXX binding system generator error, the type catalog is missing this
    // @ts-expect-error
    const vecCls = wasm.manager.findVectorClass('sculptcore::spatial::SpatialNode*')

    const brushType = toolToSculptBrush(brush.tool)
    if (brushType === undefined) {
      // TS tool with no sculptcore equivalent (e.g. Grab, Snake, Paint).
      // Skip the dab rather than silently running a Draw.
      console.warn(`sculptcore: no kernel for tool ${SculptTools[brush.tool] ?? brush.tool}; skipping dab`)
    } else {
      // Make the painted attribute visible (color/polygroup) without a manual
      // display-mode toggle.
      syncDisplayModeToBrush(mesh, brush.tool)

      // Poly-group paint: choose the stroke's group id once, on the first dab.
      // Default = a fresh incremented id (max existing + 1); holding shift
      // samples the group under the cursor and extends it (falling back to a
      // new id when that face has no group yet).
      if (brush.tool === SculptTools.POLYGROUP) {
        if (this.strokeGroupId === undefined) {
          if (ps.useAltBrush && isect.face >= 0) {
            const sampled = mesh.mesh.faceGroup(isect.face)
            this.strokeGroupId = sampled > 0 ? sampled : mesh.mesh.maxFaceGroup() + 1
          } else {
            this.strokeGroupId = mesh.mesh.maxFaceGroup() + 1
          }
        }
        wasmBrush.activeGroup = this.strokeGroupId!
      }

      wasmBrush.strength = ps.strength
      wasmBrush.radius = radius
      wasmBrush.writeProps()
      wasmExec.meshLog = SculptPaintOp.meshLog

      // Dynamic topology: remesh under the dab BEFORE the brush deform so the
      // brush moves the freshly-refined geometry. Runs over the same world
      // center/radius; the executor reuses the existing meshLog step + spatial
      // callbacks and grows the already-filtered `nodes` in place (incremental
      // ownership). `dist` is world-units-per-pixel at the dab (computed above).
      const dt = brush.dynTopoSC
      if (dt.enabled) {
        const {l_max, l_min} = dt.resolveEdgeGoal(radius, dist)
        const params = this.getDynTopoParams()
        configureDynTopoParams(params, dt, l_max, l_min)
        wasmExec.applyDynTopoDab(wasm.float3(p), radius, params, this.dabSeed++)
        // Accumulate stats for the debug HUD (wasmExec.lastDynTopoStats holds
        // this dab's counts).
        const st = wasmExec.lastDynTopoStats
        const acc = toolmode.dynTopoStats
        acc.splits += st.splits
        acc.collapses += st.collapses
        acc.flips += st.flips
        acc.rounds = st.rounds
        acc.budgetHit = acc.budgetHit || st.budget_hit
        SculptPaintOp.meshLog!.pushTopoChunk()
      }

      const nodes = wasm.manager.constructWith(vecCls!.findDefaultConstructor()!) as unknown as any
      mesh.spatial.filterNodes(wasm.float3(p), radius, nodes)

      // Per-dab pen device samples (pressure/tilt/twist) drive the dynamics
      // stack that loadProps applies inside execProgram.
      pushBrushDeviceInputs(wasmBrush, ps)

      // Build the per-dab command list (main brush + optional autosmooth) and
      // run it over the filtered node set.
      const prog = this.getProgram()
      buildBrushProgram(prog, brushType, brush, radius, mesh)
      // Plane brushes (Clay/Scrape/Fill) optionally project along the viewport
      // view vector instead of the center surface normal; viewvec is already
      // object-local here (same vector the dab raycast used).
      const dabNormal = resolvePlaneDabNormal(brush.tool, brush.planeNormalMode, normal, viewvec)

      // Grab-style brushes (kelvinlet): pull the region under the dab in the
      // stroke-movement direction (see applyGrabDabState).
      if (isGrabTool(brush.tool)) {
        this.prevDabLocal = applyGrabDabState(wasmBrush, p, this.prevDabLocal)
      }
      // Pass the bound Vector itself (not the getBoundVector inspection proxy) —
      // execProgram's `Vector<SpatialNode*>*` param needs an unwrappable handle,
      // which `nodes` (the constructWith result) is on both backends.
      wasmExec.execProgram(prog, nodes, wasm.float3(p), wasm.float3(dabNormal))
    }

    mesh.regenTreeBatch()
    mesh.spatial.update(mesh.wasm.gpu)
    window.redraw_viewport()
  }

  modalEnd(was_cancelled: boolean) {
    const ctx = this.modal_ctx!
    const result = super.modalEnd(was_cancelled)
    this.finishStroke(ctx)
    return result
  }

  finishStroke(ctx: ToolContext): void {
    // Release the stroke-long topology thaw the dyntopo path held (no-op if the
    // executor never ran a dyntopo dab).
    this.executor?.endDynTopoStroke()
    if (SculptPaintOp.meshLog) {
      this.inStep = false
      SculptPaintOp.meshLog.endStep()
    }
    if (this.brushProgram) {
      this.brushProgram[Symbol.dispose]()
      this.brushProgram = undefined
    }
    if (this.dynTopoParams) {
      this.dynTopoParams[Symbol.dispose]()
      this.dynTopoParams = undefined
    }
    // Dyntopo changes the seam/feature topology; refresh the overlay batch.
    const mesh = ctx.object?.data
    if (mesh instanceof LiteMesh) {
      mesh.markSeamsDirty()
    }
    window.redraw_viewport()
  }

  exec(ctx: ToolContext): void {
    for (const ps of this.inputs.samples.getValue()) {
      this.applyDab(ctx, ps)
    }
    if (!this.modalRunning) {
      this.finishStroke(ctx)
    }

    window.redraw_viewport()
    //console.error('TODO: support re-execution of sculptcore paint ops')
  }
}
ToolOp.register(SculptPaintOp)

/**
 * Set the kelvinlet grab vectors for one dab and return the new previous-dab
 * point. grabFrom = force application point (this dab center, object-local);
 * grabTo = the per-dab displacement vector (zero on the first dab, so the
 * kelvinlet is a no-op until the brush moves). Both are bound Brush members the
 * kernel reads from ctx.brush. Shared by the interactive op and the test driver.
 */
function applyGrabDabState(wasmBrush: WasmBrush, p: number[] | Vector3, prev: Vector3 | undefined): Vector3 {
  const gf = wasmBrush.grabFrom.vec
  const gt = wasmBrush.grabTo.vec
  for (let i = 0; i < 3; i++) {
    const cur = p[i] ?? 0
    gf[i] = cur
    gt[i] = prev ? cur - (prev[i] ?? 0) : 0
  }
  return new Vector3(p)
}

/**
 * Dev/test driver: run a sculptcore brush stroke programmatically over a list of
 * world-space dabs on a LiteMesh, with undo logging — the headless/CDP
 * counterpart to interactively dragging the sculpt brush. Mirrors
 * `SculptPaintOp.on_pointermove_intern`'s per-dab work (filterNodes +
 * builSculptcoreBrush + buildBrushProgram + execProgram) but takes world-space
 * `p`/`normal` directly instead of casting a view ray. Returns the dab count, or
 * `skipped:true` when the tool has no sculptcore kernel.
 */
export function runSculptcoreStroke(opts: {
  mesh: LiteMesh
  brush: SculptBrush
  dabs: {p: number[]; normal: number[]}[]
  radius?: number
  /** world-units-per-pixel at the dab; only needed for PIXELS edge mode. */
  dist?: number
  /** Stroke-level invert (the interactive op's ctrl modifier). */
  invert?: boolean
}): {dabs: number; skipped: boolean} {
  const wasm = getWasmImmediate()!
  const {mesh, brush} = opts
  const radius = opts.radius ?? brush.radius
  const dist = opts.dist ?? 0

  const brushType = toolToSculptBrush(brush.tool)
  if (brushType === undefined) {
    return {dabs: 0, skipped: true}
  }

  if (SculptPaintOp.meshLog === undefined) {
    SculptPaintOp.meshLog = wasm.manager.construct('sculptcore::meshlog::MeshLog')
  }
  const meshLog = SculptPaintOp.meshLog!
  meshLog.beginStep(brush.dynTopoSC.enabled)

  // Mirror SculptPaintOp: show the painted attribute (color/polygroup).
  syncDisplayModeToBrush(mesh, brush.tool)

  // Poly-group: allocate a fresh incremented id (max existing + 1) for this
  // driver stroke. The interactive op also supports shift-to-extend; the driver
  // always starts a new group.
  const polyGroupId = brush.tool === SculptTools.POLYGROUP ? mesh.mesh.maxFaceGroup() + 1 : 0

  let wasmBrush: WasmBrush | undefined = undefined
  let wasmExec: CommandExecutor | undefined = undefined
  let dynParams: DynTopoParams | undefined = undefined

  // Mirror the interactive op's non-accumulate handling (default = on; ACCUMULATE
  // bit re-enables accumulate) with one stroke-generation stamp for this stroke.
  const nonAccum = !(brush.flag & BrushFlags.ACCUMULATE)
  const strokeGen = ++SculptPaintOp.nextStrokeGen

  let dabIdx = 0
  let prevDabLocal: Vector3 | undefined = undefined
  for (const dab of opts.dabs) {
    const r = builSculptcoreBrush({
      wasm,
      brush,
      mesh,
      radius,
      invert: opts.invert ?? false,
      wasmBrush,
      wasmExec,
      nonAccum,
      strokeGen,
    })
    wasmBrush = r.wasmBrush
    wasmExec = r.wasmExec

    // @ts-expect-error — runtime helper not in the typed binding surface.
    const vecCls = wasm.manager.findVectorClass('sculptcore::spatial::SpatialNode*')
    const nodes = wasm.manager.constructWith(vecCls!.findDefaultConstructor()!) as unknown as any
    mesh.spatial.filterNodes(wasm.float3(new Vector3(dab.p)), radius, nodes)

    if (brush.tool === SculptTools.POLYGROUP) {
      wasmBrush.activeGroup = polyGroupId
    }
    wasmBrush.strength = brush.strength
    wasmBrush.radius = radius
    wasmBrush.writeProps()
    wasmExec.meshLog = meshLog
    pushBrushDeviceInputs(wasmBrush, new PaintSample())

    // Dyntopo remesh before the deform (mirrors SculptPaintOp).
    const dt = brush.dynTopoSC
    if (dt.enabled) {
      const {l_max, l_min} = dt.resolveEdgeGoal(radius, dist)
      if (!dynParams) {
        dynParams = wasm.manager.construct('sculptcore::dyntopo::DynTopoParams') as DynTopoParams
      }
      configureDynTopoParams(dynParams, dt, l_max, l_min)
      wasmExec.applyDynTopoDab(wasm.float3(new Vector3(dab.p)), radius, dynParams, dabIdx + 1)
    }

    // Grab-style brushes (kelvinlet) need per-dab grabFrom/grabTo, same as the
    // interactive op's applyDab.
    if (isGrabTool(brush.tool)) {
      prevDabLocal = applyGrabDabState(wasmBrush, dab.p, prevDabLocal)
    }

    const prog = wasm.manager.construct('sculptcore::brush::BrushProgram') as BrushProgram
    buildBrushProgram(prog, brushType, brush, radius, mesh)
    wasmExec.execProgram(prog, nodes, wasm.float3(new Vector3(dab.p)), wasm.float3(new Vector3(dab.normal)))
    prog[Symbol.dispose]()
    dabIdx++
  }

  wasmExec?.endDynTopoStroke()
  if (dynParams) {
    dynParams[Symbol.dispose]()
  }

  meshLog.endStep()
  mesh.regenTreeBatch()
  return {dabs: opts.dabs.length, skipped: false}
}

// Headless/CDP-friendly entry point: _testSculptcoreStroke(toolInt, dabs?, radius?)
// resolves the active LiteMesh + the default brush for the tool and runs a
// stroke. dabs are world-space [{p:[x,y,z], normal:[x,y,z]}].
;(globalThis as unknown as any)._testSculptcoreStroke = function (
  toolInt: number,
  dabs?: {p: number[]; normal: number[]}[],
  radius?: number
) {
  const g = globalThis as unknown as any
  const mesh = g._appstate?.ctx?.object?.data
  if (!(mesh instanceof LiteMesh)) {
    return {error: 'active object is not a LiteMesh'}
  }
  const brush = g._DefaultBrushes?.[toolInt] as SculptBrush | undefined
  if (!brush) {
    return {error: `no default brush for tool ${toolInt}`}
  }
  brush.tool = toolInt
  return runSculptcoreStroke({mesh, brush, dabs: dabs ?? [{p: [0, 0, 0], normal: [0, 0, 1]}], radius})
}

// Headless/CDP access to the sculpt undo log (created lazily by the first
// stroke); lets --eval probes drive MeshLog.undo/redo directly.
;(globalThis as unknown as any)._testSculptcoreMeshLog = () => SculptPaintOp.meshLog

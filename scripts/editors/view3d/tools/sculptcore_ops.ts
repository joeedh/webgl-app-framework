import {CommandExecutor, MeshLog, Brush as WasmBrush, BrushProgram, DynTopoParams} from '@sculptcore/api'
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
import {SymAxisMap} from './pbvh_base'
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
  /** Stroke arc-length (ps.strokeS) at which dyntopo last remeshed. Dyntopo runs
   * at its own `dynTopoSpacing`, not every dab; -Infinity makes the first dab
   * always remesh. */
  lastDynTopoS = -Infinity
  /** Whether the current stroke sample is a dyntopo-remesh sample. Decided once
   * on the primary dab (mirrorIdx 0) and reused by every mirror image so all
   * sides of a symmetric stroke remesh together (#38). */
  _dabDynTopoDue = false
  /** Poly-group id for the active stroke (computed once on the first dab:
   * a fresh maxFaceGroup()+1, or the sampled id under the cursor with shift). */
  strokeGroupId?: number
  /** Per-mirror-image previous dab object-local surface center, for grab brushes
   * (kelvinlet): grabTo = thisDab − prevDab. Index 0 = primary dab, 1..n =
   * SymAxisMap mirror images; each image traces its own path so its grab delta
   * must not be shared. Empty until the first dab of the stroke. */
  prevDabLocal: (Vector3 | undefined)[] = []
  /** Per-mirror-image grab anchor: the first dab's surface point (`co`) and the
   * stroke's fixed view direction (`nrm`, object-local). Grab-style brushes
   * (grab/snakehook/kelvinlet) project each later dab onto the plane through
   * `co` with normal `nrm` so they drag in the *view* plane, not along the
   * curved surface. Empty until the first dab. */
  grabAnchor: ({co: Vector3; nrm: Vector3} | undefined)[] = []

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
    SculptPaintOp.ensureMeshLog()
  }

  /** The single shared C++ undo stack for all mesh-mutating ops (sculpt strokes
   * + the litemesh layout-reorder op). Lazily constructed so any op can record
   * onto it before the first stroke. */
  static ensureMeshLog(): MeshLog {
    if (SculptPaintOp.meshLog === undefined) {
      const wasm = getWasmImmediate()!
      SculptPaintOp.meshLog = wasm.manager.construct('sculptcore::meshlog::MeshLog')
    }
    return SculptPaintOp.meshLog!
  }

  /** Build (or reuse) the executor + wasmBrush so the step can be opened via
   * `executor.beginStep` before the first dab. Sets the shared meshLog on it;
   * later dabs reuse the same executor through getBrush. */
  ensureExecutor(ctx: ToolContext): CommandExecutor {
    const brush = this.inputs.brush.getValue()
    const result = builSculptcoreBrush({
      wasm     : getWasmImmediate()!,
      brush,
      mesh     : ctx.object!.data as LiteMesh,
      radius   : this.calcRadius(brush.radius),
      invert   : false,
      wasmBrush: this.wasmBrush,
      wasmExec : this.executor,
      nonAccum : !(brush.flag & BrushFlags.ACCUMULATE),
      strokeGen: this.curStrokeGen,
    })
    this.wasmBrush = result.wasmBrush
    this.executor = result.wasmExec
    this.executor.meshLog = SculptPaintOp.meshLog
    return this.executor
  }

  undoPre(ctx: ToolContext) {
    const brush = this.inputs.brush.getValue()
    const hasDyntopo = brush.dynTopoSC.enabled

    this.strokeGroupId = undefined
    this.prevDabLocal = []
    this.grabAnchor = []
    this.dabSeed = 1
    this.lastDynTopoS = -Infinity
    this.curStrokeGen = ++SculptPaintOp.nextStrokeGen
    // Snapshot the live symmetry axes as an op input so a later exec replay
    // (which may see a different ctx.toolmode) mirrors the same way (A.4).
    this.inputs.symmetryAxes.setValue((ctx.toolmode as SculptCorePaintMode | undefined)?.symmetryAxes ?? 0)
    ;(ctx.toolmode as SculptCorePaintMode | undefined)?.resetDynTopoStats()
    if (SculptPaintOp.meshLog) {
      // The executor owns the meshlog step boundary; build it now so the step
      // is opened the same way every client (debug app, tests) opens one.
      const exec = this.ensureExecutor(ctx)
      exec.beginStep(hasDyntopo)
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

  /** Apply one evenly-spaced driver dab to the surface, plus a mirrored dab for
   * every active symmetry axis. The brush cursor overlay is drawn once here (for
   * the real, unmirrored sample); the per-dab work — including the object-local
   * ray reflection — lives in {@link applyDabOne}. */
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

    // Primary dab (identity reflection), then one dab per SymAxisMap mirror image
    // about the mesh's own local axis planes. Each image keeps its own grab state
    // (prevDabLocal[i]) and advances the dyntopo seed (A.5).
    this.applyDabOne(ctx, ps, undefined, 0)

    const sym = this.getSymmetryAxes(ctx)
    if (sym === 0) {
      return
    }
    const muls = SymAxisMap[sym]
    for (let i = 0; i < muls.length; i++) {
      this.applyDabOne(ctx, ps, muls[i], i + 1)
    }

    // When the poly-group edge overlay is enabled, refresh its boundaries each
    // dab so group painting shows live (#28). Cheap no-op when the overlay is off.
    if ((toolmode as unknown as {drawPolyGroupEdges?: boolean})?.drawPolyGroupEdges) {
      const mesh = ctx.object?.data as LiteMesh | undefined
      mesh?.markSeamsDirty?.()
    }
  }

  /** The live symmetry axes bitflag {X:1,Y:2,Z:4}: the value snapshotted in
   * undoPre, falling back to the toolmode for any non-snapshotted call (A.4). */
  getSymmetryAxes(ctx: ViewContext | ToolContext): number {
    const v = this.inputs.symmetryAxes.getValue()
    if (v !== undefined) {
      return v
    }
    return (ctx.toolmode as SculptCorePaintMode | undefined)?.symmetryAxes ?? 0
  }

  /** Apply one dab on the (optionally mirrored) side of the mesh: reflect the
   * object-local view ray by `mul` (a SymAxisMap component-sign multiplier;
   * undefined = primary dab), re-raycast to snap to the surface, then run the
   * sculptcore brush pipeline + optional dyntopo. `mirrorIdx` keys this image's
   * cross-dab grab state (0 = primary, 1..n = SymAxisMap order). */
  private applyDabOne(
    ctx: ViewContext | ToolContext,
    ps: PaintSample,
    mul: Vector3 | undefined,
    mirrorIdx: number
  ): void {
    const toolmode = ctx.toolmode as SculptCorePaintMode

    const {brush, wasmExec, wasmBrush} = this.getBrush(ctx, ps)
    const wasm = getWasmImmediate()!

    const mesh = ctx.object!.data as LiteMesh

    const imatrix = new Matrix4(ctx.object!.outputs.matrix.getValue())
    imatrix.invert()

    // Local copies — never mutate the shared ps, so every mirror image reflects
    // the same original ray (A.3).
    const origin = new Vector3(ps.vieworigin)
    const viewvec = new Vector3(ps.viewvec)
    viewvec.multVecMatrix(imatrix)
    origin.multVecMatrix(imatrix)

    if (mul !== undefined) {
      // Reflect about the local origin planes: a point reflection through 0 is
      // the same pure component sign-flip as a direction reflection.
      origin.mul(mul)
      viewvec.mul(mul)
    }

    const isect = mesh.rayCast(origin, viewvec)

    let radius = this.calcRadius(ps.radius)

    let p: Vector3
    let normal: Vector3
    let isectFace = -1
    if (isect !== undefined) {
      p = isect.p
      normal = isect.normal
      isectFace = isect.face
    } else {
      // Grab-family drag over empty space: once the stroke is anchored, keep
      // dragging in the anchor plane (the grab point comes from that plane, not a
      // fresh surface cast) instead of ending the stroke (#35). The first dab
      // still needs a surface hit to place the anchor; other brushes need a hit
      // every dab.
      const anchor = this.grabAnchor[mirrorIdx]
      if (!isGrabTool(brush.tool) || anchor === undefined) {
        return
      }
      const q = new Vector3(anchor.co)
      const denom = viewvec.dot(anchor.nrm)
      if (Math.abs(denom) > 1e-7) {
        const s = (anchor.co.dot(anchor.nrm) - origin.dot(anchor.nrm)) / denom
        q.load(new Vector3(viewvec).mulScalar(s).add(origin))
      }
      p = q
      normal = new Vector3(anchor.nrm)
    }

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
          if (ps.useAltBrush && isectFace >= 0) {
            const sampled = mesh.mesh.faceGroup(isectFace)
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

      // Dynamic topology config: build the params handle the executor uses to
      // remesh under the dab BEFORE the brush deform. `dist` is world-units-
      // per-pixel at the dab (computed above). Null params = dyntopo off.
      // Dyntopo runs at its own `dynTopoSpacing` along the stroke, not on every
      // dab (a dense deform stroke would otherwise remesh excessively). ps.strokeS
      // is the accumulated arc-length in units of 2·radius (same units as the
      // spacing param); remesh only once it has advanced past dynTopoSpacing.
      const dt = brush.dynTopoSC
      let params: DynTopoParams | undefined = undefined
      // Decide remesh-due once per stroke sample on the primary dab; mirror
      // images (mirrorIdx > 0) reuse it so every symmetric side remeshes on the
      // same samples. Updating lastDynTopoS per-image would make the primary dab
      // consume the budget and starve the mirror dabs of dyntopo (#38).
      const dynTopoDue =
        mirrorIdx === 0 ? ps.strokeS - this.lastDynTopoS >= dt.dynTopoSpacing : this._dabDynTopoDue
      if (mirrorIdx === 0) {
        this._dabDynTopoDue = dynTopoDue
      }
      if (dt.enabled && dynTopoDue) {
        const {l_max, l_min} = dt.resolveEdgeGoal(radius, dist)
        params = this.getDynTopoParams()
        configureDynTopoParams(params, dt, l_max, l_min)
        if (mirrorIdx === 0) {
          this.lastDynTopoS = ps.strokeS
        }
      }

      // Per-dab pen device samples (pressure/tilt/twist) drive the dynamics
      // stack that loadProps applies inside the deform.
      pushBrushDeviceInputs(wasmBrush, ps)

      // Build the per-dab command list (main brush + optional autosmooth).
      const prog = this.getProgram()
      buildBrushProgram(prog, brushType, brush, radius, mesh)
      // Plane brushes (Clay/Scrape/Fill) optionally project along the viewport
      // view vector instead of the center surface normal; viewvec is already
      // object-local here (same vector the dab raycast used).
      const dabNormal = resolvePlaneDabNormal(brush.tool, brush.planeNormalMode, normal, viewvec)

      // Grab-style brushes (grab/snakehook/kelvinlet): pull the region in the
      // stroke-movement direction (see applyGrabDabState). The displacement must
      // track the *view* plane, not the curved surface — otherwise dragging
      // snaps geometry along the surface normal plane (#18/#19/#34). Project each
      // dab's view ray onto the plane through the stroke anchor (first dab's
      // surface point) with the stroke's fixed view normal.
      let dabCenter: number[] | Vector3 = p
      // Node-filter radius. Grab/kelvinlet widen it by the cumulative drag below
      // (the falloff still uses the brush radius via wasmBrush.radius), so the
      // deformed region's leaves stay in the filter and can't shrink + tear (#35).
      let filterRadius = radius
      if (isGrabTool(brush.tool)) {
        let q = new Vector3(p)
        const anchor = this.grabAnchor[mirrorIdx]
        if (anchor === undefined) {
          const nrm = new Vector3(viewvec)
          nrm.normalize()
          this.grabAnchor[mirrorIdx] = {co: new Vector3(p), nrm}
        } else {
          const denom = viewvec.dot(anchor.nrm)
          if (Math.abs(denom) > 1e-7) {
            const s = (anchor.co.dot(anchor.nrm) - origin.dot(anchor.nrm)) / denom
            q = new Vector3(viewvec).mulScalar(s).add(origin)
          }
        }
        if (brush.tool === SculptTools.SNAKE) {
          // Snakehook: per-dab drag — grabFrom = current center, grabTo = step.
          this.prevDabLocal[mirrorIdx] = applyGrabDabState(wasmBrush, q, this.prevDabLocal[mirrorIdx])
        } else {
          // Grab / kelvinlet: deform a region FIXED at the stroke-start anchor,
          // from each vert's orig position (#35). grabFrom = anchor (fixed elastic
          // center); grabTo = CUMULATIVE drag (q − anchor), so the from-orig kernel
          // recomputes the absolute pull each dab and follows the cursor. dab center
          // = anchor so the falloff stays centered and the kernel reads orig. Widen
          // the node filter by the cumulative drag so moved leaves stay in the set.
          const a = this.grabAnchor[mirrorIdx]!.co
          const gf = wasmBrush.grabFrom.vec
          const gt = wasmBrush.grabTo.vec
          gf[0] = a[0]
          gf[1] = a[1]
          gf[2] = a[2]
          gt[0] = q[0] - a[0]
          gt[1] = q[1] - a[1]
          gt[2] = q[2] - a[2]
          dabCenter = a
          filterRadius = radius + new Vector3(q).sub(new Vector3(a)).vectorLength()
          // Symmetry: the primary image re-bases every touched vert from orig
          // (Absolute); mirror images add their pull onto it (Add) so shared verts
          // sum instead of the last pass overwriting.
          wasmExec.setGrabAccumAdd(mirrorIdx > 0)
        }
      }

      // One unified dab: dyntopo pre-pass (if params != null), node filter,
      // deform, and per-dab topo-chunk seal — all in the executor, one order
      // shared by every client. The seed only matters when dyntopo is on.
      wasmExec.applyDab(prog, wasm.float3(dabCenter), wasm.float3(dabNormal), filterRadius, params ?? (0 as never), dt.enabled ? this.dabSeed++ : 0)

      if (dt.enabled) {
        // Accumulate stats for the debug HUD (lastDynTopoStats holds this dab's
        // counts).
        const st = wasmExec.lastDynTopoStats
        const acc = toolmode.dynTopoStats
        acc.splits += st.splits
        acc.collapses += st.collapses
        acc.flips += st.flips
        acc.rounds = st.rounds
        acc.budgetHit = acc.budgetHit || st.budget_hit
      }
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
    if (SculptPaintOp.meshLog && this.inStep) {
      this.inStep = false
      // The executor closes the step it opened in undoPre (forwards to meshLog).
      this.executor?.endStep()
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
 * `SculptPaintOp.applyDab`'s per-dab work (builSculptcoreBrush + buildBrushProgram
 * + executor.applyDab) but takes world-space `p`/`normal` directly instead of
 * casting a view ray. Returns the dab count, or `skipped:true` when the tool has
 * no sculptcore kernel.
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
  /** Symmetry axes bitflag {X:1,Y:2,Z:4}: each dab is also applied at its
   * SymAxisMap mirror images (p/normal sign-flipped about the local origin),
   * exactly like `SculptPaintOp.applyDab`. The test scene is object-local at the
   * origin, so the world-space dabs here are already in mirror space. */
  symmetryAxes?: number
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

  // Mirror SculptPaintOp: show the painted attribute (color/polygroup).
  syncDisplayModeToBrush(mesh, brush.tool)

  // Poly-group: allocate a fresh incremented id (max existing + 1) for this
  // driver stroke. The interactive op also supports shift-to-extend; the driver
  // always starts a new group.
  const polyGroupId = brush.tool === SculptTools.POLYGROUP ? mesh.mesh.maxFaceGroup() + 1 : 0

  // Mirror the interactive op's non-accumulate handling (default = on; ACCUMULATE
  // bit re-enables accumulate) with one stroke-generation stamp for this stroke.
  const nonAccum = !(brush.flag & BrushFlags.ACCUMULATE)
  const strokeGen = ++SculptPaintOp.nextStrokeGen

  // Build the executor up-front so the step is opened via executor.beginStep —
  // the same boundary every client uses (the loop reuses this executor/brush).
  let {wasmExec, wasmBrush} = builSculptcoreBrush({
    wasm,
    brush,
    mesh,
    radius,
    invert: opts.invert ?? false,
    nonAccum,
    strokeGen,
  })
  wasmExec.meshLog = meshLog
  wasmExec.beginStep(brush.dynTopoSC.enabled)

  // Expand each input dab into its primary image plus SymAxisMap mirror images
  // (p/normal component-sign-flipped about the local origin), exactly like
  // SculptPaintOp.applyDab. Each image keeps its own previous-dab state so a
  // grab brush traces an independent path per mirror.
  const sym = opts.symmetryAxes ?? 0
  const muls = sym ? SymAxisMap[sym] : []
  const prevByImage: (Vector3 | undefined)[] = []
  const anchorByImage: (number[] | undefined)[] = []

  let dynParams: DynTopoParams | undefined = undefined
  let dabIdx = 0
  for (const dab of opts.dabs) {
    const images: {p: number[]; normal: number[]; image: number}[] = [{p: dab.p, normal: dab.normal, image: 0}]
    for (let i = 0; i < muls.length; i++) {
      const mul = muls[i]
      images.push({
        p: [dab.p[0] * mul[0], dab.p[1] * mul[1], dab.p[2] * mul[2]],
        normal: [dab.normal[0] * mul[0], dab.normal[1] * mul[1], dab.normal[2] * mul[2]],
        image: i + 1,
      })
    }

    for (const img of images) {
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

      if (brush.tool === SculptTools.POLYGROUP) {
        wasmBrush.activeGroup = polyGroupId
      }
      wasmBrush.strength = brush.strength
      wasmBrush.radius = radius
      wasmBrush.writeProps()
      wasmExec.meshLog = meshLog
      pushBrushDeviceInputs(wasmBrush, new PaintSample())

      // Dyntopo config before the deform (mirrors SculptPaintOp). Undefined = off.
      const dt = brush.dynTopoSC
      let params: DynTopoParams | undefined = undefined
      if (dt.enabled) {
        const {l_max, l_min} = dt.resolveEdgeGoal(radius, dist)
        if (!dynParams) {
          dynParams = wasm.manager.construct('sculptcore::dyntopo::DynTopoParams') as DynTopoParams
        }
        configureDynTopoParams(dynParams, dt, l_max, l_min)
        params = dynParams
      }

      // Grab-style brushes set grabFrom/grabTo; each mirror image traces its own
      // path. Mirrors the interactive op (#35): snakehook = per-dab; grab/kelvinlet
      // = anchored grabFrom + CUMULATIVE grabTo (from-orig kernel re-bases each dab)
      // + the dab centered on the anchor + the filter widened by the cumulative
      // drag. Symmetry: primary image re-bases from orig (Absolute), mirror images
      // add their pull onto it (Add).
      let dabCenter: number[] = img.p
      let filterRadius = radius
      if (isGrabTool(brush.tool)) {
        if (anchorByImage[img.image] === undefined) {
          anchorByImage[img.image] = [img.p[0], img.p[1], img.p[2]]
        }
        if (brush.tool === SculptTools.SNAKE) {
          prevByImage[img.image] = applyGrabDabState(wasmBrush, img.p, prevByImage[img.image])
        } else {
          const a = anchorByImage[img.image]!
          const gf = wasmBrush.grabFrom.vec
          const gt = wasmBrush.grabTo.vec
          gf[0] = a[0]
          gf[1] = a[1]
          gf[2] = a[2]
          gt[0] = img.p[0] - a[0]
          gt[1] = img.p[1] - a[1]
          gt[2] = img.p[2] - a[2]
          dabCenter = a
          filterRadius =
            radius + new Vector3(img.p).sub(new Vector3(a)).vectorLength()
          wasmExec.setGrabAccumAdd(img.image > 0)
        }
      }

      const prog = wasm.manager.construct('sculptcore::brush::BrushProgram') as BrushProgram
      buildBrushProgram(prog, brushType, brush, radius, mesh)
      wasmExec.applyDab(
        prog,
        wasm.float3(new Vector3(dabCenter)),
        wasm.float3(new Vector3(img.normal)),
        filterRadius,
        params ?? (0 as never),
        dabIdx + 1
      )
      prog[Symbol.dispose]()
      dabIdx++
    }
  }

  wasmExec.endDynTopoStroke()
  if (dynParams) {
    dynParams[Symbol.dispose]()
  }

  wasmExec.endStep()
  mesh.regenTreeBatch()
  return {dabs: opts.dabs.length, skipped: false}
}

// Headless/CDP-friendly entry point:
// _testSculptcoreStroke(toolInt, dabs?, radius?, symmetryAxes?)
// resolves the active LiteMesh + the default brush for the tool and runs a
// stroke. dabs are world-space [{p:[x,y,z], normal:[x,y,z]}]; symmetryAxes is
// the {X:1,Y:2,Z:4} bitflag (0 = none).
;(globalThis as unknown as any)._testSculptcoreStroke = function (
  toolInt: number,
  dabs?: {p: number[]; normal: number[]}[],
  radius?: number,
  symmetryAxes?: number
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
  return runSculptcoreStroke({
    mesh,
    brush,
    dabs: dabs ?? [{p: [0, 0, 0], normal: [0, 0, 1]}],
    radius,
    symmetryAxes,
  })
}

// Headless/CDP access to the sculpt undo log (created lazily by the first
// stroke); lets --eval probes drive MeshLog.undo/redo directly.
;(globalThis as unknown as any)._testSculptcoreMeshLog = () => SculptPaintOp.meshLog

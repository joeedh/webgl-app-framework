import {CommandExecutor, MeshLog, SpatialNode, Brush as WasmBrush, BrushProgram} from '@sculptcore/api'
import type {ToolContext} from '../../../core/context'
import {LiteMesh, LiteMeshDisplayMode} from '../../../lite-mesh/index'
import {AttrRef, Vector3LayerElem} from '../../../../addons/builtin/mesh/src/mesh_customdata'
import {Matrix4, ToolOp, Vector3, Vector4} from '../../../path.ux/pathux'
import {ISampleViewRet, PaintOpBase} from './pbvh_base'
import type {SculptCorePaintMode} from './sculptcore'
import {getWasmImmediate} from '@sculptcore/api/api'
import {pointer, StructType} from '@litestl/typescript-runtime'
import type {SculptBrush} from '../../../brush/index'
import {builSculptcoreBrush, toolToSculptBrush, buildBrushProgram, pushBrushDeviceInputs} from './sculptcore_bindings'
import {SculptTools} from '../../../brush/brush_base'

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
  let want: number | undefined
  if (tool === SculptTools.COLOR) {
    want = LiteMeshDisplayMode.VERTEX_COLOR
  } else if (tool === SculptTools.POLYGROUP) {
    want = LiteMeshDisplayMode.POLY_GROUP
  }
  if (want !== undefined && mesh.displayColorMode !== want) {
    mesh.displayColorMode = want
  }
}

export class SculptPaintOp extends PaintOpBase<LiteMesh, {}, {}> {
  wasmBrush?: WasmBrush
  executor?: CommandExecutor
  brushProgram?: BrushProgram

  static meshLog: MeshLog | undefined
  inStep = false

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
    if (SculptPaintOp.meshLog) {
      SculptPaintOp.meshLog.beginStep()
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

  calcMemSize(ctx: ToolContext): number {
    return 1
  }

  calcUndoMem(ctx: ToolContext): number {
    return 1
  }

  getSampler() {
    return this.modal_ctx!.object!.data as LiteMesh
  }

  initOrigData(mesh: LiteMesh) {
    return new AttrRef<Vector3LayerElem>(-1)
  }

  getSymflag() {
    // TODO: Implement
    return 0
  }

  getBrush(e: PointerEvent): IGetBrushRet {
    const brush = this.inputs.brush.getValue()
    const result = builSculptcoreBrush({
      wasm: getWasmImmediate()!,
      brush,
      mesh     : this.modal_ctx!.object!.data as LiteMesh,
      radius   : this.calcRadius(),
      invert   : this.getInvertFromEvent(e),
      wasmBrush: this.wasmBrush,
      wasmExec : this.executor,
    })

    this.wasmBrush = result.wasmBrush
    this.executor = result.wasmExec
    return {brush, ...result}
  }

  calcRadius() {
    return this.inputs.brush.getValue().radius
  }

  /** Lazily-constructed, reused-per-dab composite brush program (autosmooth). */
  getProgram(): BrushProgram {
    if (!this.brushProgram) {
      this.brushProgram = getWasmImmediate()!.manager.construct('sculptcore::brush::BrushProgram') as BrushProgram
    }
    return this.brushProgram
  }

  /** note: this runs in a special async loop */
  on_pointermove_intern(
    e: PointerEvent,
    x?: number,
    y?: number,
    in_timer?: boolean,
    isInterp?: boolean
  ): undefined | ISampleViewRet {
    const result = super.on_pointermove_intern(e, x, y, in_timer, isInterp)

    if (!this.inStep) {
      return
    }

    const ctx = this.modal_ctx!
    const view3d = ctx.view3d
    const toolmode = ctx.toolmode as SculptCorePaintMode

    view3d.resetDrawLines()

    toolmode.mpos[0] = e.x
    toolmode.mpos[1] = e.y
    toolmode.drawBrush(view3d, true, e.x, e.y)

    const {brush, wasmExec, wasmBrush} = this.getBrush(e)
    const wasm = getWasmImmediate()!

    const local = view3d.getLocalMouse(e.x, e.y)
    const viewvec = view3d.getViewVec(local[0], local[1])
    const origin = view3d.activeCamera.pos.copy()
    const mesh = ctx.object!.data as LiteMesh

    const r = this.sampleViewRay(view3d.activeCamera.rendermat, toolmode.mpos, viewvec, origin, 0.5, true, true)
    const imatrix = new Matrix4(ctx.object!.outputs.matrix.getValue())

    imatrix.invert()

    viewvec.multVecMatrix(imatrix)
    origin.multVecMatrix(imatrix)

    const isect = mesh.rayCast(origin, viewvec)

    let radius = this.calcRadius()

    if (isect !== undefined) {
      const {p, uv, normal} = isect

      const p4 = new Vector4().load3(p)
      p4[3] = 1.0
      p4.multVecMatrix(view3d.activeCamera.rendermat)
      const w = p4[3]

      const m1 = new Vector3(p)
      view3d.project(m1)
      const m2 = new Vector3(m1)
      m2[0] += 1

      view3d.unproject(m2)

      const dist = m2.vectorDistance(p)

      radius *= dist

      // @ts-expect-error
      const vecCls = wasm.manager.findVectorClass('sculptcore::spatial::SpatialNode*')
      const nodes = wasm.manager.constructWith(vecCls!.findDefaultConstructor()!) as unknown as any

      mesh.spatial.filterNodes(wasm.float3(p), radius, nodes)

      const brushType = toolToSculptBrush(brush.tool)
      if (brushType === undefined) {
        // TS tool with no sculptcore equivalent (e.g. Grab, Snake, Paint).
        // Skip the dab rather than silently running a Draw.
        console.warn(`sculptcore: no kernel for tool ${SculptTools[brush.tool] ?? brush.tool}; skipping dab`)
      } else {
        // Make the painted attribute visible (color/polygroup) without a manual
        // display-mode toggle.
        syncDisplayModeToBrush(mesh, brush.tool)

        wasmBrush.strength = brush.strength
        wasmBrush.radius = radius
        wasmBrush.writeProps()
        wasmExec.meshLog = SculptPaintOp.meshLog

        // Per-dab pen device samples (pressure/tilt/twist) drive the dynamics
        // stack that loadProps applies inside execProgram.
        pushBrushDeviceInputs(wasmBrush, e)

        // Build the per-dab command list (main brush + optional autosmooth) and
        // run it over the filtered node set.
        const prog = this.getProgram()
        buildBrushProgram(prog, brushType, brush, radius)
        // Pass the bound Vector itself (not the getBoundVector inspection proxy) —
        // execProgram's `Vector<SpatialNode*>*` param needs an unwrappable handle,
        // which `nodes` (the constructWith result) is on both backends.
        wasmExec.execProgram(prog, nodes, wasm.float3(p), wasm.float3(normal))
      }
    }

    mesh.regenTreeBatch()
    window.redraw_viewport()
    return result
  }

  modalEnd(was_cancelled: boolean): void {
    const result = super.modalEnd(was_cancelled)
    if (SculptPaintOp.meshLog) {
      this.inStep = false
      SculptPaintOp.meshLog.endStep()
    }
    if (this.brushProgram) {
      this.brushProgram[Symbol.dispose]()
      this.brushProgram = undefined
    }
    return result
  }

  exec() {
    console.error('TODO: support re-execution of sculptcore paint ops')
  }
}
ToolOp.register(SculptPaintOp)

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
}): {dabs: number; skipped: boolean} {
  const wasm = getWasmImmediate()!
  const {mesh, brush} = opts
  const radius = opts.radius ?? brush.radius

  const brushType = toolToSculptBrush(brush.tool)
  if (brushType === undefined) {
    return {dabs: 0, skipped: true}
  }

  if (SculptPaintOp.meshLog === undefined) {
    SculptPaintOp.meshLog = wasm.manager.construct('sculptcore::meshlog::MeshLog')
  }
  const meshLog = SculptPaintOp.meshLog!
  meshLog.beginStep()

  // Mirror SculptPaintOp: show the painted attribute (color/polygroup).
  syncDisplayModeToBrush(mesh, brush.tool)

  let wasmBrush: WasmBrush | undefined = undefined
  let wasmExec: CommandExecutor | undefined = undefined
  // Mouse-equivalent device sample (full pressure).
  const ev = {pointerType: 'mouse', pressure: 1.0, tiltX: 0, tiltY: 0} as unknown as PointerEvent

  for (const dab of opts.dabs) {
    const r = builSculptcoreBrush({wasm, brush, mesh, radius, invert: false, wasmBrush, wasmExec})
    wasmBrush = r.wasmBrush
    wasmExec = r.wasmExec

    // @ts-expect-error — runtime helper not in the typed binding surface.
    const vecCls = wasm.manager.findVectorClass('sculptcore::spatial::SpatialNode*')
    const nodes = wasm.manager.constructWith(vecCls!.findDefaultConstructor()!) as unknown as any
    mesh.spatial.filterNodes(wasm.float3(new Vector3(dab.p)), radius, nodes)

    wasmBrush.strength = brush.strength
    wasmBrush.radius = radius
    wasmBrush.writeProps()
    wasmExec.meshLog = meshLog
    pushBrushDeviceInputs(wasmBrush, ev)

    const prog = wasm.manager.construct('sculptcore::brush::BrushProgram') as BrushProgram
    buildBrushProgram(prog, brushType, brush, radius)
    wasmExec.execProgram(prog, nodes, wasm.float3(new Vector3(dab.p)), wasm.float3(new Vector3(dab.normal)))
    prog[Symbol.dispose]()
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

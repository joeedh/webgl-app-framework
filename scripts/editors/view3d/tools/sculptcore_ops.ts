import {CommandExecutor, MeshLog, SpatialNode, Brush as WasmBrush} from '@sculptcore/api'
import type {ToolContext} from '../../../core/context'
import {LiteMesh} from '../../../lite-mesh/index'
import {AttrRef, Vector3LayerElem} from '../../../../addons/builtin/mesh/src/mesh_customdata'
import {Matrix4, ToolOp, Vector3, Vector4} from '../../../path.ux/pathux'
import {ISampleViewRet, PaintOpBase} from './pbvh_base'
import type {SculptCorePaintMode} from './sculptcore'
import {getWasmImmediate} from '@sculptcore/api/api'
import {pointer, StructType} from '@litestl/typescript-runtime'
import type {SculptBrush} from '../../../brush/index'
import {builSculptcoreBrush} from './sculptcore_bindings'
import {SculptBrushes} from '@sculptcore/api/sculptcore/brush/SculptBrushes'

export interface IGetBrushRet {
  brush: SculptBrush
  wasmExec: CommandExecutor
  wasmBrush: WasmBrush
}

export class SculptPaintOp extends PaintOpBase<LiteMesh, {}, {}> {
  wasmBrush?: WasmBrush
  executor?: CommandExecutor

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
    console.log(r)
    const imatrix = new Matrix4(ctx.object!.outputs.matrix.getValue())

    imatrix.invert()

    viewvec.multVecMatrix(imatrix)
    origin.multVecMatrix(imatrix)

    const isect = mesh.rayCast(origin, viewvec)
    console.log('isect', isect)

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
      console.log('dist', dist)

      radius *= dist

      //radius *= w / view3d.glSize[1]
      console.log('radius', radius, w, w / view3d.glSize[1])

      // @ts-expect-error
      const vecCls = wasm.manager.findVectorClass('sculptcore::spatial::SpatialNode*')
      const nodes = wasm.manager.constructWith(vecCls!.findDefaultConstructor()!) as unknown as any

      mesh.spatial.filterNodes(wasm.float3(origin), radius, nodes)
      // Backend-agnostic inspection handle (array-like .length/[i]); the native
      // backend keeps the pointer in C++. See IWasmInterface.getBoundVector.
      const boundNodes = wasm.getBoundVector(vecCls!.buildFullName(), nodes) as any

      console.log('boundNodes', boundNodes, boundNodes.length, boundNodes.length > 0 ? boundNodes[0] : undefined)

      wasmBrush.strength = brush.strength * 0.01
      wasmBrush.radius = radius
      wasmBrush.writeProps()
      wasmExec.meshLog = SculptPaintOp.meshLog
      // Pass the bound Vector itself (not the getBoundVector inspection proxy) —
      // execBrush's `Vector<SpatialNode*>*` param needs an unwrappable handle,
      // which `nodes` (the constructWith result) is on both backends.
      wasmExec.execBrush(SculptBrushes.DRAW, nodes, wasm.float3(p), wasm.float3(normal))
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
    return result
  }

  exec() {
    console.error('TODO: support re-execution of sculptcore paint ops')
  }
}
ToolOp.register(SculptPaintOp)

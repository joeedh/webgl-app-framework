import {CommandExecutor, SpatialNode, Brush as WasmBrush} from '@sculptcore/api'
import type {ToolContext} from '../../../core/context'
import {LiteMesh} from '../../../lite-mesh'
import {AttrRef, Vector3LayerElem} from '../../../mesh/mesh_customdata'
import {Matrix4, ToolOp, Vector3, Vector4} from '../../../path.ux/pathux'
import {ISampleViewRet, PaintOpBase} from './pbvh_base'
import type {SculptCorePaintMode} from './sculptcore'
import {getWasmImmediate} from '@sculptcore/api/api'
import {pointer, StructType} from '@litestl/typescript-runtime'
import type {SculptBrush} from '../../../brush'
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

  static tooldef() {
    return {
      toolpath: 'sculptcore.paint',
      inputs  : {},
      outputs : {},
      is_modal: true,
    }
  }

  undoPre(ctx: ToolContext) {
    //do nothing for now
  }

  redo(ctx: ToolContext) {
    //do nothing for now
  }

  undo(ctx: ToolContext) {
    //do nothing for now
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
      const boundNodes = wasm.manager.getBoundVector(vecCls!.buildFullName(), nodes.ptr) as any

      console.log('boundNodes', boundNodes, boundNodes.length, boundNodes.length > 0 ? boundNodes[0] : undefined)
      wasmBrush.strength = brush.strength * 0.2
      wasmBrush.radius = radius
      wasmBrush.writeProps()
      wasmExec.execBrush(SculptBrushes.DRAW, boundNodes, wasm.float3(p), wasm.float3(normal))
    }

    mesh.regenTreeBatch()
    window.redraw_viewport()
    return result
  }
}
ToolOp.register(SculptPaintOp)

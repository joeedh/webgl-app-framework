import {CommandExecutor, Brush as WasmBrush} from '@sculptcore/api'
import type {ToolContext} from '../../../core/context'
import {LiteMesh} from '../../../lite-mesh'
import {AttrRef, Vector3LayerElem} from '../../../mesh/mesh_customdata'
import {ToolOp} from '../../../path.ux/pathux'
import {ISampleViewRet, PaintOpBase} from './pbvh_base'
import type {SculptCorePaintMode} from './sculptcore'
import {getWasmImmediate} from '@sculptcore/api/api'
import {StructType} from '@litestl/typescript-runtime'

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

  getBrush(e: PointerEvent) {
    const brush = this.inputs.brush.getValue()
    let wasmBrush = this.wasmBrush
    const wasm = getWasmImmediate()!

    if (wasmBrush === undefined) {
      wasmBrush = wasm.manager.construct('sculptcore::brush::Brush')
    }

    // sync properties
    wasmBrush.strength = brush.strength
    wasmBrush.radius = this.calcRadius()
    wasmBrush.invert = this.getInvertFromEvent(e)

    const mesh = this.modal_ctx!.object!.data as LiteMesh

    let exec = this.executor
    if (exec === undefined) {
      const st = wasm.manager.get('sculptcore::brush::CommandExecutor') as StructType
      const ctor = st.findConstructor('main')!
      exec = wasm.manager.constructWith(ctor, wasmBrush, mesh.spatial) as CommandExecutor
    }

    return {brush, exec}
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
    toolmode.mpos[0] = e.x
    toolmode.mpos[1] = e.y
    toolmode.drawBrush(view3d, true, e.x, e.y)

    console.log('pointermove')
    const {brush, exec} = this.getBrush(e)

    const wasm = getWasmImmediate()!
    //const vec = wasm.manager.construct('
    //const vec

    return result
  }
}
ToolOp.register(SculptPaintOp)

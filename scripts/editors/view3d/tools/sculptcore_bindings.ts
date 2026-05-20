import {CommandExecutor, Brush as WasmBrush} from '@sculptcore/api'
import {getWasmImmediate, IWasmInterface} from '@sculptcore/api/api'
import {SculptBrush} from '../../../brush/index'
import {INeededWasm, StructType} from '@litestl/typescript-runtime'
import {LiteMesh} from '../../../lite-mesh/index'

export function builSculptcoreBrush({
  wasm,
  brush,
  wasmBrush,
  radius,
  invert,
  wasmExec,
  mesh,
}: {
  wasm: IWasmInterface
  brush: SculptBrush
  wasmBrush?: WasmBrush
  radius: number
  invert: boolean
  wasmExec?: CommandExecutor
  mesh: LiteMesh
}) {
  if (wasmBrush === undefined) {
    wasmBrush = wasm.manager.construct('sculptcore::brush::Brush')
    if (wasmExec !== undefined) {
      wasmExec[Symbol.dispose]()
      wasmExec = undefined
    }
  }

  // sync properties
  wasmBrush.strength = brush.strength
  wasmBrush.radius = radius
  wasmBrush.invert = invert

  if (wasmExec === undefined) {
    const st = wasm.manager.get('sculptcore::brush::CommandExecutor') as StructType
    const ctor = st.findConstructor('main')!
    wasmExec = wasm.manager.constructWith(ctor, mesh.spatial, wasmBrush) as CommandExecutor
  }

  return {wasmExec, wasmBrush}
}

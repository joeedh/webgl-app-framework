import type {ToolMode} from '../editors/view3d/view3d_toolmode'
import {DataAPI, DataStruct} from '../path.ux/pathux'

export const toolModeStruct = new DataStruct()

export function updateToolModeAPI(api: DataAPI, toolModes: (typeof ToolMode)[]) {
  toolModeStruct.clear()
  for (const cls of toolModes) {
    const tdef = cls.toolModeDefine()
    if (!api.hasStruct(cls)) {
      cls.defineAPI(api)
    }
    const toolStruct = api.mapStruct(cls, false)
    toolModeStruct.struct(tdef.name, tdef.name, tdef.uiname, toolStruct)
  }
}

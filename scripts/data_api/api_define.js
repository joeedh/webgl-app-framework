import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

import {DataAPI} from '../path.ux/scripts/simple_controller.js';
import * as toolprop from '../path.ux/scripts/toolprop.js';
import {View3D} from '../editors/view3d/view3d.js';
import {NodeEditor} from '../editors/node/NodeEditor.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import {Context} from '../core/context.js';

let api = new DataAPI();
import {Icons} from '../editors/icon_enum.js';

export function api_define_view3d(pstruct) {
  let vstruct = api.mapStruct(View3D);
  
  pstruct.struct("view3d", "view3d", "Viewport", vstruct);
  let def = vstruct.enum("selectmode", "selectmode", SelMask, "Selection Mode", "Selection Mode");

  def.icons({
    VERTEX : Icons.VERT_MODE,
    EDGE   : Icons.EDGE_MODE,
    FACE   : Icons.FACE_MODE,
    OBJECT : Icons.CIRCLE_SEL
  });
}

export function getDataAPI() {
  let cstruct = api.mapStruct(Context);
  
  api_define_view3d(cstruct);
  return api;
}

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../../util/vectormath.js';
import * as util from '../../../util/util.js';
import {
  nstructjs, FloatProperty, Vec2Property, Vec3Property,
  BoolProperty, EnumProperty, FlagProperty, KeyMap, HotKey
} from '../../../path.ux/scripts/pathux.js';
import {ToolMode} from '../view3d_toolmode.js';
import {Shaders} from '../../../shaders/shaders.js';
import {TetMesh} from '../../../tet/tetgen.js';
import {Icons} from '../../icon_enum.js';
import {SelMask} from '../selectmode.js';

import '../../../tet/tet_ops.js';
import '../../../tet/tet_selectops.js';

export class TetMeshTool extends ToolMode {
  constructor() {
    super();
  }

  drawsObjectIdsExclusively(ob) {
    return false;
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("W", [], "tet.vertex_smooth()"),
      new HotKey("D", [], "tet.test()")
    ]);
  }

  static buildEditMenu() {
    return [
      "tet.from_mesh()",
      "tet.vertex_smooth()",
      "tet.hexes_to_tets()",
      "tet.fix_normals()",
    ];
  }

  static buildElementSettings(container) {

  }

  static buildSettings(container) {
    let panel, strip;

    panel = container.panel("Conversion");
    panel.useIcons(false);
    panel.prop("toolDefaults.tet.from_mesh.maxDepth");
    panel.prop("toolDefaults.tet.from_mesh.leafLimit");
    panel.tool("tet.from_mesh()");
    panel.tool("tet.to_mesh()");

    panel = container.panel("Tools");
    panel.tool("tet.vertex_smooth()");
    panel.tool("tet.hexes_to_tets()");
    panel.tool("tet.fix_normals()");
  }

  dataLink(scene, getblock, getblock_addUser) {

  }

  static buildHeader (header, addHeaderRow) {

  }

  static toolModeDefine() {
    return {
      name: "tetmesh",
      uiname: "Tetrahedron",
      icon: Icons.TETRAHEDRON,
      flag: 0,
      description: "Tetrahedral Mesh Tool",
      selectMode: SelMask.TETMESH, //if set, preferred selectmode, see SelModes
      transWidgets: [], //list of widget classes tied to this.transformWidget
    }
  }

  static nodedef() {return {
    name    : "tetmesh",
    uiname  : "tetmesh",
    inputs  : {},
    outputs : {}
  }}

  loadSTRUCT(reader) {
    super.loadSTRUCT(reader);
  }
}

TetMeshTool.STRUCT = nstructjs.inherit(TetMeshTool, ToolMode) + `
}`;
nstructjs.register(TetMeshTool);
ToolMode.register(TetMeshTool);


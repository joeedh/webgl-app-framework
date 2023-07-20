import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../scripts/util/vectormath.js';
import * as util from '../../scripts/util/util.js';
import {
  nstructjs, FloatProperty, Vec2Property, Vec3Property,
  BoolProperty, EnumProperty, FlagProperty, KeyMap, HotKey
} from '../../scripts/path.ux/pathux.js';
import {ToolMode} from '../../scripts/editors/view3d/view3d_toolmode.js';
import {Shaders} from '../../scripts/shaders/shaders.js';
import {Icons} from '../../scripts/editors/icon_enum.js';
import {SelMask} from '../../scripts/editors/view3d/selectmode.js';
import {StrandSet} from '../../scripts/hair/strand.js';

export function registerToolMode(api) {
  class StrandTool extends api.toolmode.ToolMode {
    constructor() {
      super();
    }

    drawsObjectIdsExclusively(ob) {
      return false;
    }

    defineKeyMap() {
      this.keymap = new KeyMap([]);
    }

    static buildEditMenu() {
      return [];
    }

    static buildElementSettings(container) {

    }

    static buildSettings(container) {
      let panel, strip;

      panel = container.panel("Tools");
    }

    dataLink(scene, getblock, getblock_addUser) {

    }

    static buildHeader(header, addHeaderRow) {

    }

    static toolModeDefine() {
      return {
        name        : "strandset",
        uiname      : "Strands",
        icon        : Icons.STRANDS,
        flag        : 0,
        description : "Hair/Fur Tool",
        selectMode  : SelMask.strandset, //if set, preferred selectmode, see SelModes
        transWidgets: [], //list of widget classes tied to this.transformWidget
      }
    }

    static nodedef() {
      return {
        name   : "strandset",
        uiname : "strandset",
        inputs : {},
        outputs: {}
      }
    }

    loadSTRUCT(reader) {
      super.loadSTRUCT(reader);
    }
  }

  StrandTool.STRUCT = nstructjs.inherit(StrandTool, ToolMode) + `
}`;

  api.register(StrandTool);
}

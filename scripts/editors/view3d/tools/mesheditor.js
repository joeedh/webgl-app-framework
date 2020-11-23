import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castViewRay, CastModes} from "../findnearest.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {HotKey, KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {Unit} from "../../../path.ux/scripts/core/units.js";
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/util/struct.js';
import {MeshToolBase} from "./meshtool.js";

let STRUCT = nstructjs.STRUCT;
import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../../../util/vectormath.js";
import {Shaders} from '../../../shaders/shaders.js';
import {MovableWidget} from '../widgets/widget_utils.js';
import {SnapModes} from "../transform/transform_ops.js";

import {Mesh, MeshDrawFlags} from "../../../mesh/mesh.js";
import {MeshTypes, MeshFeatures, MeshFlags, MeshError,
  MeshFeatureError} from '../../../mesh/mesh_base.js';
import {ObjectFlags} from "../../../sceneobject/sceneobject.js";
import {ContextOverlay} from "../../../path.ux/scripts/controller/context.js";
import {PackFlags} from "../../../path.ux/scripts/core/ui_base.js";

export class MeshEditor extends MeshToolBase {
  constructor(manager) {
    super(manager);

    this.selectMask = SelMask.VERTEX;
    this.drawSelectMask = this.selectMask;
  }

  static toolModeDefine() {return {
    name        : "mesh",
    uianme      : "Edit Geometry",
    icon       : Icons.MESHTOOL,
    flag        : 0,
    description : "Edit vertices/edges/faces"
  }}

  static buildEditMenu() {
    return [
      "mesh.delete_selected()",
      "mesh.toggle_select_all()",
      "mesh.subdivide_smooth()",
      "mesh.subdivide_simple()",
      "mesh.extrude_regions(transform=true)"
    ]
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("A", [], "mesh.toggle_select_all(mode='AUTO')"),
      new HotKey("A", ["ALT"], "mesh.toggle_select_all(mode='SUB')"),
      new HotKey("D", [], "mesh.subdivide_smooth()"),
      //new HotKey("D", [], "mesh.test_collapse_edge()"),
      new HotKey("G", [], "view3d.translate(selmask=17)"),
      new HotKey("X", [], "mesh.delete_selected()"),
      new HotKey("E", [], "mesh.extrude_regions(transform=true)")
    ]);

    return this.keymap;
  }

  static buildElementSettings(container) {
    super.buildElementSettings(container);
    let path = "scene.tools." + this.toolModeDefine().name;
  }

  static buildSettings(container) {
  }

  static buildHeader(header, addHeaderRow) {
    let strip = header.strip();

    strip.useIcons();
    strip.inherit_packflag |= PackFlags.HIDE_CHECK_MARKS;

    strip.prop("scene.selectMaskEnum[VERTEX]");
    if (this.haveHandles()) {

    }
    strip.prop("scene.selectMaskEnum[EDGE]");
    strip.prop("scene.selectMaskEnum[FACE]");

    strip.tool(`mesh.delete_selected`);

    strip.button("Add Grids", function() {
      console.log(arguments);
      strip.ctx.api.execTool(this.ctx, "mesh.ensure_grids()");
    });
  }

  static haveHandles() {
    let ctx = this.ctx;
    if (!ctx)
      return;
  }

  getMeshPaths() {
    let rets = [];

    //for (let ob of this.ctx.selectedMeshObjects) {
    //  let path  = `library.mesh[${ob.lib_id}]`
    //}

    if (this.meshPath === undefined) {
      this._getObject();

      if (this.sceneObject !== undefined) {
        let ob = this.sceneObject;
        //set path to parent SceneObject so resolveMesh knows to
        //set ownerMatrix and ownerId
        let path = `objects[${ob.lib_id}]`;
        return [path];
      } else {
        return [];
      }
      //let path = "scene.tools." + this.constructor.toolModeDefine().name;
      //path += ".mesh";
    }

    return [this.meshPath];
  }

  static defineAPI(api) {
    let tstruct = super.defineAPI(api);

    let mstruct = api.mapStruct(Mesh, false);

    tstruct.struct("mesh", "mesh", "Mesh", mstruct);

    let onchange = () => {
      window.redraw_viewport();
    };

    return tstruct;
  }

  on_mousedown(e, x, y, was_touch) {
    return super.on_mousedown(e, x, y, was_touch);
  }

  onActive() {
    super.onActive();
  }

  onInactive() {
    super.onInactive();
  }

  _getObject() {
    let ctx = this.ctx;

    if (!ctx || !ctx.object || !(ctx.object.data instanceof Mesh)) {
      this.sceneObject = undefined;
      this.mesh = undefined;

      return;
    }

    this.sceneObject = ctx.object;
    this.mesh = this.sceneObject.data;
    this.mesh.owningToolMode = this.constructor.toolModeDefine().name;
  }

  update() {
    this._getObject();

    super.update();
  }

  findnearest3d(view3d, x, y, selmask) {
    /*
    make sure findnearest api gets the right mesh
    */
    //let ctx = this.buildFakeContext(this.ctx);
    let ctx = this.ctx;
    return FindNearest(ctx, selmask, new Vector2([x, y]), view3d);
  }

  on_mousemove(e, x, y, was_touch) {
    return super.on_mousemove(e, x, y, was_touch);
  }

  on_drawstart(view3d, gl) {
    if (!this.ctx) return;

    this._getObject();

    let mask = this.ctx.selectMask;
    mask = mask | (SelMask.EDGE | SelMask.FACE);

    this.selectMask = this.ctx.selectMask;
    this.drawSelectMask = mask;

    if (this.mesh !== undefined) {
      if (this.mesh.drawflag !== this.drawflag) {
        this.mesh.drawflag = this.drawflag;
        this.mesh.regenRender();
      }
    }

    super.on_drawstart(view3d, gl);
  }

  dataLink(scene, getblock, getblock_addUser) {
    super.dataLink(...arguments);

    this.mesh = getblock_addUser(this.mesh, this);
  }

  loadSTRUCT(reader) {
    reader(this);
    if (super.loadSTRUCT) {
      super.loadSTRUCT(reader);
    }

    this.mesh.owningToolMode = this.constructor.toolModeDefine().name;
  }

}

MeshEditor.STRUCT = STRUCT.inherit(MeshEditor, ToolMode) + `
  mesh    : DataRef | DataRef.fromBlock(obj.mesh);
  drawflag : int;
}`;
nstructjs.manager.add_class(MeshEditor);
ToolMode.register(MeshEditor);

import {ExtrudeRegionsOp} from '../../mesh/mesh_ops.js';
import {ObjectFlags} from '../../core/sceneobject.js';
import {View3D_SubEditorIF} from './view3d_subeditor.js';
import {SelMask, SelOneToolModes, SelToolModes} from './selectmode.js';
import {Mesh, MeshTypes, MeshFlags, MeshModifierFlags} from '../../mesh/mesh.js';
import * as util from '../../util/util.js';
import {SimpleMesh, ChunkedSimpleMesh, LayerTypes} from '../../core/simplemesh.js';
import {BasicLineShader, Shaders} from './view3d_shaders.js'
import {FindnearestRet} from "./view3d_subeditor.js";
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../../util/vectormath.js';
import * as math from '../../util/math.js';
import {SelectOneOp} from '../../mesh/select_ops.js';
import {View3DFlags} from "./view3d_base.js";
import {KeyMap, HotKey} from "../editor_base.js";
import {keymap} from '../../path.ux/scripts/simple_events.js';
import {ToolOp, ToolFlags, UndoFlags, ToolMacro} from '../../path.ux/scripts/simple_toolsys.js';
import {BasicMeshDrawer} from './view3d_draw.js';
import {MeshCache} from './view3d_subeditor.js';
import {SubsurfDrawer} from '../../subsurf/subsurf_draw.js';
import {Light} from "../../light/light.js";

let _shift_temp = [0, 0];

//each subeditor should fill in these tools
export const ObjectTools = {
  SELECTONE         : SelectOneOp,
  TOGGLE_SELECT_ALL : undefined,
  CIRCLE_SELECT     : undefined,
  BOX_SELECT        : undefined,
  SELECT_LINKED     : undefined,
  DELETE            : undefined,
  DUPLICATE         : undefined
};

export class ObjectEditor extends View3D_SubEditorIF {
  constructor(view3d) {
    super();

    this._findnearest_rets = util.cachering.fromConstructor(FindnearestRet, 64);

    this.ctx = undefined; //is set by owning View3D
    this.view3d = view3d;

    this.defineKeyMap();
  }

  static define() {return {
    apiname  : "object",
    uiname   : "Object",
    icon     : -1,
    selmask  : SelMask.OBJECT,
    stdtools : ObjectTools //see StandardTools
  }}

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("A", [], "object.toggle_select_all(mode='AUTO')"),
      new HotKey("A", ["ALT"], "object.toggle_select_all(mode='SUB')")
    ]);

    return this.keymap;
  }

  clickselect(evt, x, y, selmask) {
    let ctx = this.view3d.ctx;

    if (!(this.view3d.selectmode & selmask)) {
      return;
    }

    console.log("click select!");
    let ret = this.findnearest(ctx, x, y);

    console.log("ob:", ret);

    if (ret === undefined) {
      return;
    }

    let ob = ret.data;
    let mode = SelOneToolModes.UNIQUE;

    if (evt.shiftKey) {
      mode = ob.flag & ObjectFlags.SELECT ? SelOneToolModes.SUB : SelOneToolModes.ADD;
    }

    let cmd = `object.selectone(objectId=${ob.lib_id} setActive=true mode=${mode})`;
    this.view3d.ctx.api.execTool(this.view3d.ctx, cmd);

    return true;
  }

  clearHighlight(ctx) {
    ctx.scene.objects.setHighlight(undefined);
  }

  on_mousemove(ctx, x, y, was_touch) {
    if (!(ctx.view3d.selectmode & SelMask.OBJECT)) {
      return;
    }

    let ret = this.findnearest(ctx, x, y);
    let scene = ctx.scene;

    //console.log(ret, ret !== undefined ? ret.object.data.name : undefined);

    if (ret !== undefined) {
      let ob = ret.object;

      if (ob !== scene.objects.highlight) {
        scene.objects.setHighlight(ob);
        window.redraw_viewport();
      }
    } else {
      scene.objects.setHighlight(undefined);
      window.redraw_viewport();
    }
  }

  on_drawstart(gl) {
  }

  /*
  * called for all objects;  returns true
  * if an object is valid for this editor (and was drawn)*/
  draw(gl, uniforms, program, object) {
    if (this.view3d.flag & (View3DFlags.SHOW_RENDER|View3DFlags.ONLY_RENDER)) {
      return;
    }

    uniforms.objectMatrix = object.outputs.matrix.getValue();
    uniforms.object_id = object.lib_id;
    uniforms.polygonOffset = -5.5;
    uniforms.shift = _shift_temp;
    uniforms.uColor = object.getEditorColor();

    program = Shaders.ObjectLineShader;


    let mask = gl.getParameter(gl.DEPTH_WRITEMASK);
    gl.depthMask(false);

    let size = gl.getParameter(gl.VIEWPORT);
    size = [size[2], size[3]];

    if (1) { //(object.data instanceof Mesh) || (object.data instanceof Light)) {
      let d = 1;
      for (let x=-d; x<=d; x++) {
        for (let y=-d; y<=d; y++) {
          uniforms.shift[0] = x/size[0]*3.0;
          uniforms.shift[1] = y/size[1]*3.0;
          object.drawWireframe(gl, uniforms, program);
        }
      }
      object.drawWireframe(gl, uniforms, program);

    }

    uniforms.shift = undefined;
    gl.depthMask(mask);
  }

  on_drawend(gl) {
  }

  destroy() {
  }

  findnearest(ctx, x, y, selmask, limit=25) {
    let view3d = this.view3d;
    let sbuf = view3d.selectbuf;

    limit = Math.max(~~limit, 1);

    x = ~~x;
    y = ~~y;

    x -= limit >> 1;
    y -= limit >> 1;

    let sample = sbuf.sampleBlock(ctx, this.view3d.gl, this.view3d, x, y, limit, limit);
    if (sample === undefined) {
      return;
    }

    let block = sample.data;
    let order = sample.order;

    for (let i of order) {
      let x2 = i % limit, y2 = ~~(i / limit);
      i *= 4;

      let idx = ~~(block[i] + 0.5), ob = ~~(block[i + 1] + 0.5);
      idx--;

      if (idx < 0)
        continue;

      let id = ob;
      ob = ctx.datalib.get(ob);

      if (ob === undefined || ob.data === undefined) {
        //console.warn("warning, invalid object", id);
        continue;
      }

      let ret = this._findnearest_rets.next();

      ret.data = ret.object = ob;
      ret.p3d = new Vector3();
      ret.p3d.multVecMatrix(ob.outputs.matrix.getValue());
      ret.dis = Math.sqrt(x2*x2 + y2*y2);

      let p = new Vector3(ret.p3d);
      view3d.project(p);

      ret.p2d.load(p);
      return ret;
    }
  }

  /*
  * called for all objects;  returns true
  * if an object is valid for this editor (and was drawn)
  *
  * id_offset offsets the ids.  note that I might not need it.
  * since if I use 16-bit textures I can pack a source object id
  * along with the element id
  * */
  drawIDs(gl, uniforms, object, mesh, id_offset) {
    if (this.view3d.selectmode & SelMask.MESH) {
      return;
    }

    let program = Shaders.MeshIDShader;

    object.draw(gl, uniforms, program);
  }
}
View3D_SubEditorIF.register(ObjectEditor);

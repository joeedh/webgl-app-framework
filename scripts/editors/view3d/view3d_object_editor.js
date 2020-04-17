import {FindNearest} from "./findnearest.js";
import {ExtrudeRegionsOp} from '../../mesh/mesh_ops.js';
import {ObjectFlags} from '../../sceneobject/sceneobject.js';
import {View3D_ToolMode} from './view3d_subeditor.js';
import {SelMask, SelOneToolModes, SelToolModes} from './selectmode.js';
import {Mesh, MeshTypes, MeshFlags, MeshModifierFlags} from '../../mesh/mesh.js';
import {PointSet} from '../../potree/potree_types.js';
import * as util from '../../util/util.js';
import {SimpleMesh, ChunkedSimpleMesh, LayerTypes} from '../../core/simplemesh.js';
import {BasicLineShader, Shaders} from './view3d_shaders.js'
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
import {TranslateOp} from "./transform_ops.js";
let STRUCT = nstructjs.STRUCT;
import {Icons} from '../icon_enum.js';

let _shift_temp = [0, 0];

export class ObjectEditor extends View3D_ToolMode {
  constructor(manager) {
    super(manager);

    this.start_mpos = new Vector2();

    this.ctx = undefined; //is set by owning View3D

    this.defineKeyMap();
  }

  static widgetDefine() {return {
    name        : "object",
    uiname      : "Object",
    description : "Select Scene Objects",
    icon        : Icons.CURSOR_ARROW,
    flag        : 0,
    selectMode  : SelMask.OBJECT
  }}

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("A", [], "object.toggle_select_all(mode='AUTO')"),
      new HotKey("A", ["ALT"], "object.toggle_select_all(mode='SUB')"),
      new HotKey("X", [], "object.delete_selected()"),
      new HotKey("DELETE", [], "object.delete_selected()")
    ]);

    return this.keymap;
  }

  clearHighlight(ctx) {
    ctx.scene.objects.setHighlight(undefined);
  }

  on_mousedown(e, x, y, was_touch) {
    let ctx = this.view3d.ctx;

    if (e.button == 0 || e.touches.length > 0) {
      this.start_mpos[0] = x;
      this.start_mpos[1] = y;
    }

    if (this.manager.widgets.highlight !== undefined) {
      return false;
    }

    this._updateHighlight(...arguments);

    console.log("click select!");
    let ret = this.findnearest(ctx, x, y);

    console.log("ob:", ret);

    if (ret === undefined) {
      return;
    }

    let ob = ret.data;
    let mode = SelOneToolModes.UNIQUE;

    if (e.shiftKey) {
      mode = ob.flag & ObjectFlags.SELECT ? SelOneToolModes.SUB : SelOneToolModes.ADD;
    }

    let cmd = `object.selectone(objectId=${ob.lib_id} setActive=true mode=${mode})`;
    this.view3d.ctx.api.execTool(this.view3d.ctx, cmd);

    return true;
  }

  on_mouseup(e, x, y, was_touch) {
    if (e.button == 0) {
      this.start_mpos[0] = x;
      this.start_mpos[1] = y;
    }

    return super.on_mouseup(e, x, y, was_touch);
  }

  on_mousemove(e, x, y, was_touch) {
    let ctx = this.view3d.ctx;

    if (this.manager.widgets.highlight !== undefined) {
      return false;
    }

    let mdown;

    if (was_touch) {
      mdown = !!(e.touches !== undefined && e.touches.length > 0);
    } else {
      mdown = e.buttons;
    }

    mdown = mdown & 1;

    if (!mdown && super.on_mousemove(e, x, y, was_touch)) {
      return true;
    }

    /*
    let's rely on transform widget for click-drag tweaking.
     
    if (mdown && !e.shiftKey && !e.ctrlKey && !e.altKey) {
      let mpos = new Vector2([x, y]);
      let dis = this.start_mpos.vectorDistance(mpos);
      console.log(mpos, this.start_mpos);

      if (dis > 35) {
        let tool = new TranslateOp(this.start_mpos);
        tool.inputs.selmask.setValue(ctx.selectMask);

        console.log("selectMask", ctx.selectMask);

        ctx.toolstack.execTool(tool, ctx);
        return true;
      }
    }//*/

    this._updateHighlight(...arguments);
  }

  _updateHighlight(e, x, y, was_touch) {
    let ctx = this.view3d.ctx;

    let ret = this.findnearest(ctx, x, y);
    let scene = ctx.scene;

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
  drawObject(gl, uniforms, program, object) {
    if (this.view3d.flag & (View3DFlags.SHOW_RENDER|View3DFlags.ONLY_RENDER)) {
      return;
    }

    uniforms.objectMatrix = object.outputs.matrix.getValue();
    uniforms.object_id = object.lib_id;
    uniforms.polygonOffset = -5.5;
    uniforms.shift = _shift_temp;
    uniforms.uColor = object.getEditorColor();

    program = Shaders.ObjectLineShader;

    /*
    let size = gl.getParameter(gl.VIEWPORT);
    size = [size[2], size[3]];

    let d = 1;
    for (let x=-d; x<=d; x++) {
      for (let y=-d; y<=d; y++) {
        uniforms.shift[0] = x/size[0]*3.0;
        uniforms.shift[1] = y/size[1]*3.0;

        this.view3d.threeCamera.pushUniforms(uniforms);
        object.drawOutline(this.view3d, gl, uniforms, program);
        this.view3d.threeCamera.popUniforms();
      }
    }
    //*/

    let draw_outline = object.flag & ObjectFlags.SELECT;
    draw_outline = draw_outline || object === this.view3d.ctx.scene.objects.highlight;

    if (draw_outline) {
      let mask = gl.getParameter(gl.DEPTH_WRITEMASK);
      gl.depthMask(false);

      this.view3d.threeCamera.pushUniforms(uniforms);
      object.drawOutline(this.view3d, gl, uniforms, program);
      this.view3d.threeCamera.popUniforms();

      //uniforms.shift = undefined;
      gl.depthMask(mask);
    }

    this.view3d.threeCamera.pushUniforms(uniforms);
    object.draw(this.view3d, gl, uniforms, program);
    this.view3d.threeCamera.popUniforms();

    return true;
  }

  on_drawend(gl) {
  }

  destroy() {
  }

  findnearest(ctx, x, y, selmask=SelMask.OBJECT, limit=25) {
    //let ret = findnearest()
    let ret = FindNearest(ctx, selmask, new Vector2([x, y]), this.view3d, limit);

    if (ret !== undefined && ret.length > 0) {
      return ret[0];
    }
  }

  findnearestOld(ctx, x, y, selmask, limit=25) {
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
}
ObjectEditor.STRUCT = STRUCT.inherit(ObjectEditor, View3D_ToolMode) + `
}`;

nstructjs.manager.add_class(ObjectEditor);
View3D_ToolMode.register(ObjectEditor);



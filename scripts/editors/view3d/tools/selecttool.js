import {FindNearest, castViewRay, CastModes} from "../findnearest.js";
import {ExtrudeRegionsOp} from '../../../mesh/mesh_ops.js';
import {ObjectFlags} from '../../../sceneobject/sceneobject.js';
import {ToolMode} from '../view3d_toolmode.js';
import {SelMask, SelOneToolModes, SelToolModes} from '../selectmode.js';
import {Mesh, MeshTypes, MeshFlags, MeshModifierFlags} from '../../../mesh/mesh.js';
import * as util from '../../../util/util.js';
import {SimpleMesh, ChunkedSimpleMesh, LayerTypes} from '../../../core/simplemesh.js';
import {BasicLineShader, Shaders} from '../../../shaders/shaders.js'
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../../../util/vectormath.js';
import * as math from '../../../util/math.js';
import {SelectOneOp} from '../../../mesh/select_ops.js';
import {View3DFlags} from "../view3d_base.js";
import {KeyMap, HotKey} from "../../editor_base.js";
import {keymap} from '../../../path.ux/scripts/util/simple_events.js';
import {ToolOp, ToolFlags, UndoFlags, ToolMacro} from '../../../path.ux/scripts/toolsys/simple_toolsys.js';
import {BasicMeshDrawer} from '../view3d_draw.js';
import {MeshCache} from '../view3d_toolmode.js';
import {SubsurfDrawer} from '../../../subsurf/subsurf_draw.js';
import {Light} from "../../../light/light.js";
import {TranslateOp} from "../transform/transform_ops.js";
import {nstructjs} from '../../../path.ux/scripts/pathux.js';
let STRUCT = nstructjs.STRUCT;
import {Icons} from '../../icon_enum.js';
import {TranslateWidget} from "../widgets/widget_tools.js";
import {FlagProperty} from "../../../path.ux/scripts/toolsys/toolprop.js";

let _shift_temp = [0, 0];

export class ObjectEditor extends ToolMode {
  constructor(manager) {
    super(manager);

    this.start_mpos = new Vector2();
    this.ctx = undefined; //is set by owning View3D

    this.transformWidget = 0;
    this._transformProp = this.constructor.getTransformProp();

    this.test = "yay";

    this.defineKeyMap();
  }

  static defineAPI(api) {
    let tstruct = super.defineAPI(api);

    return tstruct;
  }

  static toolModeDefine() {return {
    name        : "object",
    uiname      : "Object",
    description : "Select Scene Objects",
    icon        : Icons.CURSOR_ARROW,
    flag        : 0,
    selectMode  : SelMask.OBJECT,
    transWidgets: [TranslateWidget]
  }}

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("G", [], "view3d.translate(selmask='OBJECT')"),
      new HotKey("R", [], "view3d.rotate(selmask='OBJECT')"),
      new HotKey("A", [], "object.toggle_select_all(mode='AUTO')"),
      new HotKey("A", ["ALT"], "object.toggle_select_all(mode='SUB')"),
      new HotKey("X", [], "object.delete_selected()"),
      new HotKey("Delete", [], "object.delete_selected()")
    ]);

    return this.keymap;
  }

  clearHighlight(ctx) {
    ctx.scene.objects.setHighlight(undefined);
  }

  static buildSettings(container) {

    container.useIcons();
    let strip = container.strip();

    strip.label("Move Tool");
    strip.prop("scene.tool.transformWidget[translate]");
  }

  static buildHeader(header, addHeaderRow) {
    super.buildHeader(header, addHeaderRow);

    let row = header; //addHeaderRow();
    let strip;

    strip = row.strip();
    strip.prop("scene.tool.transformWidget[translate]");

    //strip = row.strip();
    //strip.tool("mesh.toggle_select_all()");
  }

  on_mousedown(e, x, y, was_touch) {
    let ctx = this.ctx;

    if (e.button === 0 || e.touches && e.touches.length > 0) {
      this.start_mpos[0] = x;
      this.start_mpos[1] = y;
    }

    console.log(this.hasWidgetHighlight());

    if (this.hasWidgetHighlight()) {
      return false;
    }

    if (e.button !== 0) {
      return false;
    }

    this._updateHighlight(...arguments);

    if (e.ctrlKey || e.altKey || e.commandKey) {
      return;
    }

    let ret = this.findnearest(ctx, x, y);

    if (ret === undefined || ret.object === undefined) {
      return;
    }

    let ob = ret.object;
    let mode = SelOneToolModes.UNIQUE;

    if (e.shiftKey) {
      mode = ob.flag & ObjectFlags.SELECT ? SelOneToolModes.SUB : SelOneToolModes.ADD;
    }

    let cmd = `object.selectone(objectId=${ob.lib_id} setActive=true mode=${mode})`;
    this.ctx.api.execTool(this.ctx, cmd);

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
    let ctx = this.ctx;

    if (this.hasWidgetHighlight()) {
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

    //(ctx, selectMask, p, view3d, mode=CastModes.FRAMEBUFFER) {
    //let mpos = new Vector2([x, y]);

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

        ctx.toolstack.execTool(ctx, tool);
        return true;
      }
    }//*/

    this._updateHighlight(...arguments);
  }

  _updateHighlight(e, x, y, was_touch) {
    let ctx = this.ctx;

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

  on_drawstart(view3d, gl) {
    super.on_drawstart(view3d, gl);
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

    let draw_outline = object.flag & ObjectFlags.SELECT;
    draw_outline = draw_outline || object === this.ctx.scene.objects.highlight;

    if (draw_outline) {
      let mask = gl.getParameter(gl.DEPTH_WRITEMASK);

      gl.depthMask(false);

      object.drawOutline(this.view3d, gl, uniforms, program);

      //uniforms.shift = undefined;
      gl.depthMask(mask);
    }

    program = Shaders.BasicLitMesh;
    object.draw(this.view3d, gl, uniforms, program);

    return true;
  }

  on_drawend(view3d, gl) {
    super.on_drawend(view3d, gl);
  }

  findnearest(ctx, x, y, selmask=SelMask.OBJECT, limit=25) {
    //let ret = findnearest()
    let ret = FindNearest(ctx, selmask, new Vector2([x, y]), this.view3d, limit);

    if (ret !== undefined && ret.length > 0) {
      return ret[0];
    }
  }
}
ObjectEditor.STRUCT = STRUCT.inherit(ObjectEditor, ToolMode) + `
}`;

nstructjs.manager.add_class(ObjectEditor);
ToolMode.register(ObjectEditor);



import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castViewRay, CastModes} from "../findnearest.js";
import {WidgetFlags, WidgetTool} from "../widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {HotKey, KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {Unit} from "../../../path.ux/scripts/units.js";
import {SelMask} from "../selectmode.js";
import {resolveMeshes} from "../../../mesh/mesh_ops_base.js";
import '../../../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../../../util/vectormath.js";
import {Shaders} from '../view3d_shaders.js';
import {MovableWidget} from '../widget_utils.js';
import {SnapModes} from "../transform_ops.js";
import {SelOneToolModes} from "../selectmode.js";
import {SavedContext} from "../../../core/context.js";

import {SceneObject} from "../../../sceneobject/sceneobject.js";
import {AddPointOp, MeasureOp} from "./measuretool_ops.js";
import {MeasurePoint, MeasureFlags} from "./measuretool_base.js";
import {Mesh} from "../../../mesh/mesh.js";
import {FindnearestMesh} from '../findnearest/findnearest_mesh.js';

//import '../../../mesh/select_ops.js';
//import '../../../mesh/mesh_ops.js';

import {MeshTypes, MeshFeatures, MeshFlags, MeshError,
  MeshFeatureError} from '../../../mesh/mesh_base.js';

export class MeshToolBase extends ToolMode {
  constructor(manager) {
    super(manager);

    this.meshPath = "mesh";
    this.selectMask = SelMask.GEOM;
  }

  defineKeyMap() {
    let makeHotKey = (toolstr) => {
      let this2 = this;
      return () => {
        let ctx = this.buildFakeContext(this.ctx);
        let tool = ctx.api.createTool(ctx, toolstr);

        ctx.api.execTool(ctx, tool);
      }
    };

    this.keymap = new KeyMap([
      new HotKey("A", [], makeHotKey("mesh.toggle_select_all(mode='AUTO')")),
      new HotKey("A", ["ALT"], "mesh.toggle_select_all(mode='SUB')"),
      new HotKey("D", [], "mesh.subdivide_smooth()"),
      new HotKey("G", [], makeHotKey("view3d.translate(selmask=17)"))
    ]);

    return this.keymap;
  }

  buildFakeContext(ctx) {
    let objs = [];
    let paths = this.getMeshPaths();

    //make copy
    let paths2 = [];
    for (let p of paths) {
      paths2.push(p);
    }
    paths = paths2;

    let getObjects = () => {
      for (let mesh of resolveMeshes(ctx, paths)) {
        let ob;
        if (mesh.ownerId !== undefined) {
          ob = ctx.datalib.get(mesh.ownerId);
        }

        if (ob === undefined) {
          ob = new SceneObject();
          ob.data = mesh;
        }

        objs.push(ob);
      }

      return objs;
    };

    let this2 = this;
    let selectMask = this.selectMask;

    return ctx.override({
      selectedMeshObjects : getObjects,
      selectedObjects : getObjects,
      selectMask : () => selectMask,
      mesh : function() {
        return this.api.getValue(this, paths[0]);
      }
    });
  }

  clearHighlight(ctx) {
    window.redraw_viewport();

    for (let mesh of resolveMeshes(ctx, this.getMeshPaths())) {
      for (let k in mesh.elists) {
        let list = mesh.elists[k];

        if (list.highlight !== undefined) {
          list.highlight = undefined;
          window.redraw_viewport();
        }
      }
    }
  }

  getMeshPaths() {
    return ["_all_objects_"];
  }

  static defineAPI(api) {
    let tstruct = super.defineAPI(api);

    return tstruct;
  }

  on_mousedown(e, x, y, was_touch) {
    let ctx = this.ctx;

    this.findHighlight(e, x, y);

    if (e.ctrlKey || e.altKey || e.commandKey) {
      return false;
    }

    if (this.manager.widgets.highlight !== undefined) {
      return false;
    }

    let mpos = new Vector3([x, y]);

    for (let mesh of resolveMeshes(this.ctx, this.getMeshPaths())) {
      for (let list of mesh.getElemLists()) {
        if (!(list.type & this.selectMask) || !list.highlight) {
          continue;
        }

        let elem = list.highlight;

        let mode;

        if (e.shiftKey) {
          mode = elem.flag & MeshFlags.SELECT ? SelOneToolModes.SUB : SelOneToolModes.ADD;
        } else {
          mode = SelOneToolModes.UNIQUE;
        }

        let tool = ctx.api.createTool(this.ctx, "mesh.selectone(setActiveObject=0)");
        tool.inputs.eid.setValue(elem.eid);
        tool.inputs.meshPaths.setValue(this.getMeshPaths());
        tool.inputs.mode.setValue(mode);

        ctx.toolstack.execTool(tool);

        return;
      }
    }
    let ret = castViewRay(ctx, ctx.selectMask, mpos, ctx.view3d, CastModes.FRAMEBUFFER);
    if (ret !== undefined) {
      let toolop = ctx.api.createTool(ctx, "mesh.extrude_one_vertex()");

      toolop.inputs.meshPaths.setValue(this.getMeshPaths());
      toolop.inputs.co.setValue(ret.p3d);
      ctx.toolstack.execTool(toolop);

      console.log(ret);
      return true;
    }

    return false;
  }

  getAABB() {
    let d = 1e17;
    let ret;

    function minmax(v) {
      if (ret === undefined) {
        ret = [new Vector3(v), new Vector3(v)];
      } else {
        ret[0].min(v);
        ret[1].max(v);
      }
    }

    for (let mesh of resolveMeshes(this.ctx, this.getMeshPaths())) {
      for (let v of mesh.verts) {
        if (v.flag & MeshFlags.HIDE)
          continue;

        minmax(v);
      }
      for (let h of mesh.verts) {
        if (h.flag & MeshFlags.HIDE)
          continue;

        minmax(h);
      }
    }

    return ret;
  }

  getViewCenter() {
    let ret = this.getAABB(this.ctx);

    if (ret !== undefined) {
      ret = new Vector3(ret[0]).interp(ret[1], 0.5);
    }

    return ret;
  }

  update() {
    super.update();
  }

  findHighlight(e, x, y) {
    let view3d = this.ctx.view3d;

    let ret = this.findnearest3d(view3d, x, y, this.selectMask);

    if (ret !== undefined && ret.length > 0) {
      ret = ret[0];
      let elem = ret.data;

      let mesh = ret.mesh;

      let redraw = mesh.getElemList(elem.type).highlight !== elem;

      mesh.setHighlight(elem);

      if (redraw) {
        window.redraw_viewport();
      }

      return {
        elem : elem,
        mesh : mesh
      };
    } else {
      let redraw = false;

      for (let mesh of resolveMeshes(this.ctx, this.getMeshPaths())) {
        for (let elist of mesh.getElemLists()) {
          if (elist.highlight) {
            redraw = true;
          }
        }

        mesh.clearHighlight();
      }

      if (redraw) {
        window.redraw_viewport();
      }
      return undefined;
    }
  }
  on_mousemove(e, x, y, was_touch) {
    let ctx = this.ctx;
    let view3d = this.ctx.view3d;

    if (e.ctrlKey || e.altKey || e.commandKey) {
      return false;
    }

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

    this.findHighlight(e, x, y);
  }

  findnearest3d(view3d, x, y, selmask) {
    return FindNearest(this.ctx, selmask, new Vector2([x, y]), view3d);
  }

  drawIDs(view3d, gl, uniforms, selmask=SelMask.GEOM) {
    view3d.camera.regen_mats();

    uniforms = Object.assign({}, uniforms);

    uniforms.projectionMatrix = view3d.camera.rendermat;
    uniforms.objectMatrix = new Matrix4();

    let camdist = view3d.camera.pos.vectorDistance(view3d.camera.target);

    for (let mesh of resolveMeshes(this.ctx, this.getMeshPaths())) {
      if (mesh.ownerMatrix && mesh.object_id !== undefined) {
        //scene object meshes are drawn elsewhere

        //uniforms.objectMatrix.setMatrix(mesh.ownerMatrix);
        //uniforms.object_id = mesh.ownerId;
        continue;
      } else {
        uniforms.objectMatrix.makeIdentity();
        //selection system needs some sort of object id
        uniforms.object_id = 131072;
      }

      //console.log("drawing elements");
      let program = Shaders.MeshIDShader;

      uniforms.pointSize = 15;
      uniforms.polygonOffset = 10 + camdist**2;
      //console.log("polygonOffset", uniforms.polygonOffset.toFixed(3));

      mesh.drawElements(view3d, gl, selmask, uniforms, program);
      //mesh.draw(view3d, gl, uniforms, program);
    }
  }

  drawSphere(gl, view3d, p, scale=0.01) {
    let cam = this.ctx.view3d.camera;
    let mat = new Matrix4();

    let co = new Vector4(p);
    mat.translate(co[0], co[1], co[2]);

    co[3]  = 1.0;
    co.multVecMatrix(cam.rendermat);

    scale = Math.abs(co[3] * scale);
    mat.scale(scale, scale, scale);

    Shapes.SPHERE.draw(gl, {
      projectionMatrix : cam.rendermat,
      objectMatrix : mat,
      color : [1, 0.4, 0.2, 1.0],
    }, Shaders.WidgetMeshShader)
  }

  on_drawstart(gl, manager) {
    let view3d = this.ctx.view3d;
    let cam = this.ctx.view3d.camera;

    let uniforms = {
      normalMatrix : cam.cameramat,
      projectionMatrix : cam.rendermat,
      objectMatrix : new Matrix4(),
      size : view3d.glSize,
      aspect : cam.aspect,
      near : cam.near,
      far : cam.far
    };

    let camdist = view3d.camera.pos.vectorDistance(view3d.camera.target);

    for (let mesh of resolveMeshes(this.ctx, this.getMeshPaths())) {
      if (mesh.ownerMatrix !== undefined) {
        uniforms.objectMatrix.load(mesh.ownerMatrix);
      } else {
        uniforms.objectMatrix.makeIdentity();
      }

      let program = Shaders.MeshEditShader;

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);

      uniforms.pointSize = 8;
      uniforms.polygonOffset = 1500 + camdist;

      mesh.drawElements(view3d, gl, SelMask.EDGE|SelMask.VERTEX|SelMask.HANDLE, uniforms, program);
    }

    this.drawCursor = this.manager.widgets.highlight === undefined;

    if (this.drawCursor && this.cursor !== undefined) {
      this.drawSphere(gl, view3d, this.cursor);
    }
  }

  loadSTRUCT(reader) {
    reader(this);
    if (super.loadSTRUCT) {
      super.loadSTRUCT(reader);
    }
  }

}

MeshToolBase.STRUCT = STRUCT.inherit(MeshToolBase, ToolMode) + `
}`;
nstructjs.manager.add_class(MeshToolBase);
ToolMode.register(MeshToolBase);

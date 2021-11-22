import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castViewRay, CastModes} from "../findnearest.js";
import {WidgetFlags} from "../widgets/widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {HotKey, KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {Unit} from "../../../path.ux/scripts/core/units.js";
import {SelMask} from "../selectmode.js";
import {resolveMeshes} from "../../../mesh/mesh_ops_base.js";
import '../../../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../../../util/vectormath.js";
import {Shaders} from '../../../shaders/shaders.js';
import {MovableWidget} from '../widgets/widget_utils.js';
import {SnapModes, TranslateOp} from "../transform/transform_ops.js";
import {SelOneToolModes} from "../selectmode.js";

import {ObjectFlags, SceneObject} from "../../../sceneobject/sceneobject.js";
import {Mesh} from "../../../mesh/mesh.js";
import {FindnearestMesh} from '../findnearest/findnearest_mesh.js';
import {ToggleFlagOp} from '../../../mesh/mesh_flagops.js';

//import '../../../mesh/select_ops.js';
//import '../../../mesh/mesh_ops.js';

import {MeshTypes, MeshFeatures, MeshFlags, MeshError,
  MeshFeatureError} from '../../../mesh/mesh_base.js';
import {SelectEdgeLoopOp} from '../../../mesh/select_ops.js';

export class MeshToolBase extends ToolMode {
  constructor() {
    super(...arguments);

    this.transformConstraint = undefined; //string, e.g. xy

    this.transparentMeshElements = false;
    this.drawOwnIds = true;
    this.meshPath = "object";
    this.selectMask = SelMask.GEOM;
    this.drawSelectMask = SelMask.EDGE|SelMask.VERTEX|SelMask.HANDLE;

    this.start_mpos = new Vector2();
    this.last_mpos = new Vector2();

    this.vertexPointSize = 8;
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("A", [], "mesh.toggle_select_all(mode='AUTO')"),
      new HotKey("A", ["ALT"], "mesh.toggle_select_all(mode='SUB')"),
      new HotKey("D", [], "mesh.subdivide()"),
      new HotKey("G", [], "view3d.translate(selmask=17)"),
      new HotKey("X", [], "mesh.delete_selected()"),
    ]);

    return this.keymap;
  }

  buildFakeContext(ctx) {
    return;
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

  static toolModeDefine() {return {
    name        : "basemesh",
    uianme      : "Edit Geometry",
    icon        : Icons.MESHTOOL,
    flag        : 0,
    selectMode  : SelMask.OBJECT,
    description : "Edit vertices/edges/faces"
  }}

  static defineAPI(api) {
    let tstruct = super.defineAPI(api);

    return tstruct;
  }

  on_mousedown(e, x, y, was_touch) {
    console.warn(e.type, e, x, y, was_touch, e.shiftKey);

    let ctx = this.ctx;

    this.start_mpos[0] = x;
    this.start_mpos[1] = y;

    this.findHighlight(e, x, y);

    if (this.hasWidgetHighlight()) {
      return false;
    }

    if (this.ctx.mesh && e.button === 0 && (e.ctrlKey && !e.altKey)) {
      let mesh = this.ctx.mesh;
      let edge = mesh.edges.highlight;

      if (edge) {
        let tool = SelectEdgeLoopOp.invoke(this.ctx, {});
        let mode;

        if (e.shiftKey) {
          mode = edge.flag & MeshFlags.SELECT ? SelOneToolModes.SUB : SelOneToolModes.ADD;
        } else {
          mode = SelOneToolModes.UNIQUE;
        }

        tool.inputs.mode.setValue(mode);
        tool.inputs.edgeEid.setValue(edge.eid);
        this.ctx.api.execTool(this.ctx, tool);

        return true;
      }
    }

    if (e.button === 1 || e.ctrlKey || e.altKey || e.commandKey) {
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
        tool.inputs.selmask.setValue(this.selectMask);

        ctx.toolstack.execTool(this.ctx, tool);

        return true;
      }
    }

    /*
    let ret = castViewRay(ctx, ctx.selectMask, mpos, ctx.view3d, CastModes.FRAMEBUFFER);
    let p;
    if (ret !== undefined) {
      p = ret.p3d;
    } else {
      p = new Vector3();
      p.multVecMatrix(this.ctx.view3d.cursor3D);
    }

    let toolop = ctx.api.createTool(ctx, "mesh.extrude_one_vertex()");

    toolop.inputs.meshPaths.setValue(this.getMeshPaths());
    toolop.inputs.co.setValue(p);
    ctx.toolstack.execTool(this.ctx, toolop);

    console.log(ret);
    return true;
    */

    return e.button === 0;// || (e.touches !== undefined && e.touches.length === 0);
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
      let matrix = new Matrix4();

      if (mesh.ownerId !== undefined) {
        let ob = this.ctx.datalib.get(mesh.ownerId);

        if (ob) {
          matrix.load(ob.outputs.matrix.getValue());
        }
      }

      let co = new Vector3();

      for (let v of mesh.verts.selected.editable) {
        co.load(v).multVecMatrix(matrix);
        minmax(co);
      }

      if (mesh.handles) {
        for (let h of mesh.handles.selected.editable) {
          co.load(h).multVecMatrix(matrix);
          minmax(co);
        }
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

  //ensure we don't have sculpt bvhs, which lack wire verts
  //and might include grid verts
  checkMeshBVHs(ctx=this.ctx) {
    for (let ob of ctx.selectedMeshObjects) {
      ob.data.getBVH(true, false, false, true);
    }
  }

  findHighlight(e, x, y, selectMask=this.selectMask) {
    let view3d = this.ctx.view3d;

    this.checkMeshBVHs(this.ctx);

    if (e.ctrlkey && !e.altKey) {
      selectMask = SelMask.EDGE;
    }

    let ret = this.findnearest3d(view3d, x, y, selectMask);
    let found = false;

    if (ret !== undefined && ret.length > 0) {
      for (let item of ret) {
        if (item.mesh) {
          ret = item;
          found = true;
          break;
        }
      }
    }

    if (found) {
      let elem = ret.data;
      let mesh = ret.mesh;

      let redraw = mesh.getElemList(elem.type).highlight !== elem;

      mesh.clearHighlight();
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

        if (redraw) {
          mesh.clearHighlight();
        }
      }

      if (redraw) {
        window.redraw_viewport();
      }

      return undefined;
    }
  }

  on_mousemove(e, x, y, was_touch) {
    this.last_mpos[0] = x;
    this.last_mpos[1] = y;

    let ctx = this.ctx;
    let view3d = this.ctx.view3d;

    if (e.ctrlKey || e.altKey || e.commandKey) {
      return false;
    }

    if (this.hasWidgetHighlight()) {
      return false;
    }

    let mdown;

    mdown = e.buttons || !!(e.touches !== undefined && e.touches.length > 0);
    mdown = mdown & 1;

    if (!mdown && super.on_mousemove(e, x, y, was_touch)) {
      return true;
    }

    if (mdown) {
      let dist = this.last_mpos.vectorDistance(this.start_mpos);
      let ok = false;

      for (let mesh of resolveMeshes(this.ctx, this.getMeshPaths())) {
        for (let v of mesh.verts.selected.editable) {
          ok = true;
          break;
        }
        for (let h of mesh.handles.selected.editable) {
          ok = true;
          break;
        }

        if (ok) {
          break;
        }
      }

      ok = ok && dist > 4;
      if (ok) {
        console.log("translate");
        let tool = TranslateOp.invoke(this.ctx, {});

        if (this.transformConstraint) {
          tool.setConstraintFromString(this.transformConstraint);
          console.log("TC", this.transformConstraint, tool.inputs.constraint.getValue());
        }

        tool.inputs.selmask.setValue(SelMask.GEOM);
        this.ctx.toolstack.execTool(this.ctx, tool);

        return true;
      }

    } else {
      let found = this.findHighlight(e, x, y);

      return found;
    }
  }

  findnearest3d(view3d, x, y, selmask) {
    return FindNearest(this.ctx, selmask, new Vector2([x, y]), view3d);
  }

  drawsObjectIdsExclusively(obj, check_mesh=false) {
    let ret = !check_mesh || obj.data instanceof Mesh;

    ret = ret && ((obj.flag & ObjectFlags.SELECT) || obj === this.ctx.scene.objects.active);
    ret = ret && !(obj.flag & ObjectFlags.HIDE);

    return ret;
  }

  drawIDs(view3d, gl, uniforms, selmask=undefined) {
    if (selmask === undefined) {
      selmask = this.ctx.selectMask;
    }

    if (!this.drawOwnIds) {
      return;
    }

    view3d.activeCamera.regen_mats();

    uniforms = Object.assign({}, uniforms);

    let matrix = new Matrix4(uniforms.objectMatrix);

    let camdist = view3d.activeCamera.pos.vectorDistance(view3d.activeCamera.target);

    for (let mesh of resolveMeshes(this.ctx, this.getMeshPaths())) {
      if (mesh.ownerMatrix && mesh.ownerId !== undefined) {
        uniforms.objectMatrix.load(matrix).multiply(mesh.ownerMatrix);
        uniforms.object_id = mesh.ownerId;
      } else {
        uniforms.objectMatrix.load(matrix);
        //selection system needs some sort of object id
        uniforms.object_id = 131072;
      }

      let program = Shaders.MeshIDShader;

      uniforms.pointSize = this.vertexPointSize*1.5;
      uniforms.polygonOffset = 1.0;

      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);

      gl.disable(gl.DITHER);
      gl.disable(gl.BLEND);

      uniforms.polygonOffset = 0.0;
      uniforms.alpha = 1.0;

      mesh.drawElements(view3d, gl, SelMask.FACE, uniforms, program);

      selmask &= ~SelMask.FACE;

      if (selmask) {
        uniforms.polygonOffset = 1.0;

        mesh.drawElements(view3d, gl, selmask, uniforms, program);
      }
    }
  }

  drawSphere(gl, view3d, p, scale=0.01, color=[1, 0.4, 0.2, 1.0]) {
    let cam = this.ctx.view3d.activeCamera;
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
      color : color,
    }, Shaders.WidgetMeshShader)
  }

  on_drawend(view3d, gl) {
    if (!this.ctx) {
      return;
    }

    let cam = this.ctx.view3d.activeCamera;

    let uniforms = {
      normalMatrix : cam.cameramat,
      projectionMatrix : cam.rendermat,
      objectMatrix : new Matrix4(),
      size : view3d.glSize,
      aspect : cam.aspect,
      near : cam.near,
      far : cam.far
    };

    let camdist = view3d.activeCamera.pos.vectorDistance(view3d.activeCamera.target);
    let datalib = this.ctx.datalib;

    for (let mesh of resolveMeshes(this.ctx, this.getMeshPaths())) {
      if (mesh === undefined) {
        console.warn("nonexistent mesh");
        continue;
      }

      let object;
      if (mesh.ownerId) {
        object = datalib.get(mesh.ownerId);
      }

      if (mesh.ownerMatrix !== undefined) {
        uniforms.objectMatrix.load(mesh.ownerMatrix);
      } else {
        uniforms.objectMatrix.makeIdentity();
      }

      let program = Shaders.MeshEditShader;

      if (!this.transparentMeshElements) {
        gl.enable(gl.DEPTH_TEST);
        gl.depthMask(true);
      } else {
        gl.depthMask(false);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.disable(gl.DEPTH_TEST);
      }

      uniforms.pointSize = this.vertexPointSize;
      uniforms.polygonOffset = 1.0;

      mesh.drawElements(view3d, gl, this.drawSelectMask, uniforms, program, object, true);

      if (this.transparentMeshElements) {
        gl.depthMask(true);
        gl.enable(gl.DEPTH_TEST);
      }
    }

    this.drawCursor = this.hasWidgetHighlight();

    if (this.drawCursor && this.cursor !== undefined) {
      this.drawSphere(gl, view3d, this.cursor);
    }
  }

  drawObject(gl, uniforms, program, object, mesh) {
    if (!(object.data instanceof Mesh)) {
      return super.drawObject(gl, uniforms, program, object, mesh);
    }

    let view3d = this.ctx.view3d;

    if (program === Shaders.BasicLitMesh) {
      let image = this.ctx.activeTexture;

      if (image && image.ready) {
        uniforms.texture = image.getGlTex(gl);
        program = Shaders.BasicLitMeshTexture;
      } else {
        uniforms.texture = undefined;
      }
    } else {
      uniforms.texture = undefined;
    }
    object.draw(view3d, gl, uniforms, program);

    return true;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }

}

MeshToolBase.STRUCT = STRUCT.inherit(MeshToolBase, ToolMode) + `
}`;
nstructjs.register(MeshToolBase);
//ToolMode.register(MeshToolBase);

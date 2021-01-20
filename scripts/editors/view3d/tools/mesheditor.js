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
import * as util from '../../../util/util.js';

import {Mesh, MeshDrawFlags} from "../../../mesh/mesh.js";
import {MeshTypes, MeshFeatures, MeshFlags, MeshError,
  MeshFeatureError} from '../../../mesh/mesh_base.js';
import {ObjectFlags} from "../../../sceneobject/sceneobject.js";
import {ContextOverlay} from "../../../path.ux/scripts/pathux.js";
import {PackFlags} from "../../../path.ux/scripts/core/ui_base.js";
import {RotateWidget, ScaleWidget, TranslateWidget} from '../widgets/widget_tools.js';
import {LayerTypes, PrimitiveTypes, SimpleMesh} from '../../../core/simplemesh.js';
import {buildCotanMap} from '../../../mesh/mesh_utils.js';

export class MeshEditor extends MeshToolBase {
  constructor(manager) {
    super(manager);

    this.loopMesh = undefined;

    this.selectMask = SelMask.VERTEX;
    this.drawSelectMask = this.selectMask;
    this.drawLoops = false;
    this.drawCurvatures = false;

    this._last_update_loop_key = "";
  }

  static toolModeDefine() {return {
    name        : "mesh",
    uianme      : "Edit Geometry",
    icon       : Icons.MESHTOOL,
    flag        : 0,
    description : "Edit vertices/edges/faces",
    transWidgets: [TranslateWidget, ScaleWidget, RotateWidget]
  }}

  static buildEditMenu() {
    return [
      "mesh.delete_selected()",
      "mesh.toggle_select_all()",
      "mesh.subdivide_smooth()",
      "mesh.subdivide_simple()",
      "mesh.extrude_regions(transform=true)",
      "mesh.vertex_smooth()",
      "mesh.select_more_less(mode='ADD')",
      "mesh.select_more_less(mode='SUB')",
      "mesh.select_linked(mode='ADD')",
      "mesh.create_face()",
    ]
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("A", [], "mesh.toggle_select_all(mode='AUTO')"),
      new HotKey("A", ["ALT"], "mesh.toggle_select_all(mode='SUB')"),
      new HotKey("J", ["ALT"], "mesh.tris_to_quads()"),
      new HotKey("J", [], "mesh.connect_verts()"),
      //new HotKey("D", [], "mesh.subdivide_smooth()"),
      //new HotKey("D", [], "mesh.subdivide_smooth_loop()"),
      new HotKey("D", [], "mesh.dissolve_verts()"),
      new HotKey("K", [], "mesh.subdiv_test()"),
      //new HotKey("D", [], "mesh.test_collapse_edge()"),
      new HotKey("F", [], "mesh.create_face()"),
      new HotKey("G", [], "view3d.translate(selmask=17)"),
      new HotKey("R", [], "view3d.rotate(selmask=17)"),
      new HotKey("L", [], "mesh.pick_select_linked()"),
      new HotKey("=", ["CTRL"], "mesh.select_more_less(mode='ADD')"),
      new HotKey("-", ["CTRL"], "mesh.select_more_less(mode='SUB')"),
      new HotKey("L", ["SHIFT"], "mesh.pick_select_linked(mode=\"SUB\")"),
      new HotKey("X", [], "mesh.delete_selected()"),
      new HotKey("E", [], "mesh.extrude_regions(transform=true)"),
      new HotKey("R", ["SHIFT"], "mesh.edgecut()"),
      new HotKey("I", ["CTRL"], "mesh.select_inverse()"),
    ]);

    return this.keymap;
  }

  static buildElementSettings(container) {
    super.buildElementSettings(container);
    let path = "scene.tools." + this.toolModeDefine().name;
  }

  static buildSettings(container) {
    container.useIcons();

    let strip;
    let panel;

    let path = "scene.tools." + this.toolModeDefine().name;

    panel = container.panel("Viewport");
    strip = panel.row().strip();
    strip.prop(path + ".drawLoops");
    strip.prop(path + ".drawCurvatures");

    panel = container.panel("Tools");
    strip = panel.row().strip();

    strip.tool("mesh.edgecut()");
    strip.tool(`mesh.delete_selected()`);

    strip = panel.row().strip();
    strip.tool("mesh.bisect()");
    strip.tool("mesh.symmetrize()");

    strip = panel.row().strip();
    strip.tool("mesh.flip_long_tris()");
    strip.tool("mesh.tris_to_quads()");
    strip.tool("mesh.triangulate()");

    strip = panel.row().strip().useIcons(false);
    strip.tool("mesh.remesh(remesher='UNIFORM_TRI')|Tri Remesh");
    strip.tool("mesh.remesh(remesher='UNIFORM_QUAD')|Quad Remesh");

    strip = panel.row().strip();
    strip.tool("mesh.test_multigrid_smooth()");

    strip = panel.row().strip();
    strip.tool("mesh.fix_normals()");
    strip.tool("mesh.split_edges_smart()");

    strip = panel.row().strip().useIcons(false);
    strip.tool("mesh.dissolve_verts()");
    strip.tool("mesh.cleanup_quads()");

    strip = panel.row().strip().useIcons(false);
    strip.tool("mesh.cleanup_tris()");
    strip.tool("mesh.rotate_edges()");

    strip = panel.row().strip().useIcons(false);
    strip.tool("mesh.dissolve_edges()");
    strip.tool("mesh.collapse_edges()");

    panel = container.panel("Transform");

    strip = panel.row().strip();
    strip.useIcons(true);
    strip.prop("scene.propEnabled");
    strip.useIcons(false);
    strip.prop("scene.propMode");

    strip = panel.row().strip();
    strip.prop("scene.propRadius");

    panel = container.panel("UV");

    strip = panel.col().strip();
    strip.useIcons(false);
    strip.tool("mesh.set_flag(elemMask='EDGE' flag='SEAM')", undefined, undefined, "Set Seam");
    strip.tool("mesh.clear_flag(elemMask='EDGE' flag='SEAM')", undefined, undefined, "Clear Seam");
    strip.tool("mesh.toggle_flag(elemMask='EDGE' flag='SEAM')", undefined, undefined, "Toggle Seam");

    panel = container.panel("MultiRes");

    strip = panel.row().strip();
    strip.tool("mesh.add_or_subdivide_grids()");
    strip.tool("mesh.reset_grids()");
    strip.tool("mesh.delete_grids()");

    strip = panel.row().strip();
    strip.tool("mesh.apply_grid_base()");
    strip.tool("mesh.smooth_grids()");
    strip.tool("mesh.grids_test()");

    panel = container.panel("Non-Manifold");
    strip = panel.row().strip();
    strip.tool("mesh.select_non_manifold");
    strip.tool("mesh.fix_manifold");
  }

  static buildHeader(header, addHeaderRow) {
    header.prop("mesh.symFlag");

    let row = addHeaderRow();

    let strip = row.strip();

    strip.useIcons();
    strip.inherit_packflag |= PackFlags.HIDE_CHECK_MARKS;

    strip.prop("scene.selectMaskEnum[VERTEX]");
    if (this.haveHandles()) {

    }
    strip.prop("scene.selectMaskEnum[EDGE]");
    strip.prop("scene.selectMaskEnum[FACE]");

    strip = row.strip();
    strip.tool("mesh.toggle_select_all()");

    strip = row.strip();
    strip.tool("mesh.edgecut()");
    strip.tool("mesh.subdivide_smooth()");

    strip = row.strip();
    strip.prop("scene.tool.transformWidget[translate]");
    strip.prop("scene.tool.transformWidget[scale]");
    strip.prop("scene.tool.transformWidget[rotate]");
    strip.prop("scene.tool.transformWidget[NONE]");


    /*
    strip.tool("mesh.add_or_subdivide_grids()");
    strip.tool("mesh.reset_grids()");
    strip.tool("mesh.delete_grids()");
    strip.tool("mesh.apply_grid_base()");
    strip.tool("mesh.smooth_grids()");
    strip.tool("mesh.grids_test()");
     */

    strip = row.strip();
    strip.tool("mesh.symmetrize()");
    strip.tool("mesh.bisect()");
    strip.tool(`mesh.delete_selected`);

    strip = row.strip();
    strip.pathlabel("mesh.triCount", "Triangles");
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
    tstruct.bool("drawLoops", "drawLoops", "Draw Loops");
    tstruct.bool("drawCurvatures", "drawCurvatures", "Draw Curvatures");

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

  updateCurvatureMesh(gl) {
    let mesh = this.mesh;
    let key = "" + mesh.lib_id + ":" + mesh.updateGen + ":" + mesh.verts.length + ":" + mesh.eidgen._cur;

    if (this.curvatureMesh && key === this._last_update_loop_key) {
      return;
    }

    if (this.curvatureMesh) {
      this.curvatureMesh.destroy(gl);
    }

    this._last_update_loop_key = key;

    let sm = this.curvatureMesh = new SimpleMesh(LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV);
    sm.primflag = PrimitiveTypes.LINES;

    let co1 = new Vector3();
    let co2 = new Vector3();

    let amat = new Float64Array(16);
    let mat = new Matrix4();

    for (let i=0; i<amat.length; i++) {
      amat[i] = 0.0;
    }

    let calcNorLen = (v) => {
      let tot = 0;
      let sum = 0;

      for (let v2 of v.neighbors) {
        sum += v2.vectorDistance(v);
        tot++;
      }

      return tot ? sum/tot : 1.0;
    }

    let no3 = new Vector3();

    let sumMat = (v, amat, w=1.0) => {
      no3.load(v.no);
      for (let v2 of v.neighbors) {
        no3.add(v2.no);
      }
      no3.normalize();
      v = no3;

      //v = v.no;

      amat[0] += v[0]*v[0]*w;
      amat[1] += v[0]*v[1]*w;
      amat[2] += v[0]*v[2]*w;

      //skip 3
      amat[4] += v[1]*v[0]*w;
      amat[5] += v[1]*v[1]*w;
      amat[6] += v[1]*v[2]*w;

      //skip 7
      amat[8] += v[2]*v[0]*w;
      amat[9] += v[2]*v[1]*w;
      amat[10] += v[2]*v[2]*w;
    }

    let vs = new Set(mesh.verts.selected.editable);
    for (let v of mesh.verts.selected.editable) {
      for (let v2 of v.neighbors) {
        vs.add(v2);
        for (let v3 of v2.neighbors) {
          vs.add(v3);
        }
      }
    }

    const cotanmap = buildCotanMap(mesh, vs);
    const VETOT = cotanmap.recordSize;

    console.log(cotanmap);

    let calcMat = (v, amat) => {
      for (let i=0; i<16; i++) {
        amat[i] = 0.0;
      }

      let tot = 0.0;
      let cot = cotanmap.get(v);

      if (Math.random() > 0.99) {
        console.log(cot);
      }

      let vi = 4;

      for (let e of v.edges) {
        let v2 = e.otherVertex(v);
        let area = cot[vi], ctan1 = cot[vi+1], ctan2 = cot[vi+2], w = cot[vi+3];

        w = area; //(ctan1 + ctan2)*area;

        sumMat(v2, amat, w);
        tot += w;

        vi += VETOT;
      }
      return;
      //sumMat(v, amat);

      let flag = MeshFlags.TEMP2;
      for (let f of v.faces) {
        f.flag &= ~flag;
      }

      for (let v2 of v.neighbors) {
        for (let e of v2.edges) {
          for (let l of e.loops) {
            l.f.flag &= ~flag;
          }
        }
      }

      for (let e of v.edges) {
        let v2 = e.otherVertex(v);
      //for (let l of v.loops) {//for (let v2 of v.neighbors) {
        //let v2 = l.e.otherVertex(v);

        let w = 1.0;

        let l = e.l;
        if (!l) {
          continue;
        }

        if (l.f.flag & flag) {
          l = l.radial_next;
        }

        if (l.f.flag & flag) {
          continue;
        }

        l.f.flag |= flag;

        w = l.f.area + 0.0000001;
        //w=1.0;

        sumMat(v2, amat, w);
        tot += w;

        //continue;

        for (let e2 of v2.edges) {
          let l2 = e2.l;
          let v3 = e2.otherVertex(v2);

          if (!l2) {
            continue;
          }

          if (l2.f.flag & flag) {
            l2 = l2.radial_next;
          }
          if (l2.f.flag & flag) {
            continue;
          }
          l2.f.flag |= flag;


          let w2 = l2.f.area + 0.00001;
          //w2 = 1.0;

          sumMat(v3, amat, w);
          tot += w2;
        }
      }

      if (!tot) {
        return;
      }

      tot = 1.0 / tot;
      for (let i=0; i<amat.length; i++) {
        amat[i] *= tot;
      }
    }

    let white = [1, 1, 1, 1];
    let black = [0, 0, 0, 1];

    let no = new Vector3();

    let wmap = new Map();
    let nomap = new Map();

    let steps = window.ddd || 245;
    let lastno = new Vector3();

    for (let v of vs) {
      if (v.valence === 0) {
        continue;
      }

      calcMat(v, amat);

      mat.makeIdentity();
      mat.load(amat);

      //console.log(amat);

      //mat.transpose();

      let e;
      for (let e1 of v.edges) {
        e = e1;
        break;
      }

      //no.load(e.otherVertex(v)).sub(v).normalize();
      no.load(v.no);
      lastno.zero();

      let i;
      for (i=0; i<steps; i++) {
        no.normalize();

        if (i > 0 && lastno.vectorDistanceSqr(no) < 0.0001) {
          //console.log(i);
          break;
        }

        lastno.load(no);
        no.multVecMatrix(mat);
      }

      no.cross(v.no);
      let l = no.vectorLength();
      no.normalize().cross(v.no).mulScalar(l);

      nomap.set(v, new Vector3(no));
    }

    let no2 = new Vector3();

    for (let v of mesh.verts.selected.editable) {
      if (v.valence === 0) {
        continue;
      }
      let len = calcNorLen(v);

      let no = nomap.get(v);
      /*
      no2.load(no);
      let tot = 1;

      for (let v2 of v.neighbors) {
        no = nomap.get(v2);
        no2.add(no);
      }
      no2.normalize();

      no = no2;
      //*/

      no.normalize();

      co1.load(v);
      co2.load(v).addFac(no, len);

      let line = sm.line(co1, co2);

      line.colors(white, white)

      continue;
      co1.load(v);
      co2.load(v).addFac(v.no, len);

      line = sm.line(co1, co2);
      line.colors(black, black);
      //line.ids(1, 1);
    }
  }

  updateLoopMesh(gl) {
    let mesh = this.mesh;
    let key = "" + mesh.lib_id + ":" + mesh.updateGen + ":" + mesh.verts.length + ":" + mesh.eidgen._cur;

    if (key === this._last_update_loop_key) {
      return;
    }

    this._last_update_loop_key = key;

    if (this.loopMesh) {
      this.loopMesh.destroy(gl);
    }

    let sm = this.loopMesh = new SimpleMesh(LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV);
    sm.primflag = PrimitiveTypes.LINES;

    let a = new Vector3(), b = new Vector3(), c = new Vector3();
    let d = new Vector3(), e = new Vector3();
    let color = [0, 0, 0, 1];

    let ctmps = util.cachering.fromConstructor(Vector3, 64);
    let rtmps = new util.cachering(() => [new Vector3(), new Vector3(), new Vector3()], 32);

    function calcloop(l) {
      let fac = 0.9;
      let f = l.f;

      let ret = rtmps.next();
      let a = ret[0], b = ret[1], c = ret[2];

      a.load(l.v).sub(f.cent).mulScalar(fac).add(f.cent);
      b.load(l.next.v).sub(f.cent).mulScalar(fac).add(f.cent);

      c.load(a).interp(b, 0.5);
      a.interp(c, 0.1);
      b.interp(c, 0.1);

      return ret;
    }

    for (let f of mesh.faces.selected) {
      f.calcCent();

      for (let l of f.loops) {
        let [a, b, c] = calcloop(l);

        let line = sm.line(a, b);
        line.colors(color, color);

        d.load(b).interp(f.cent, 0.1);

        line = sm.line(b, d);
        line.colors(color, color);

        if (l.radial_next !== l) {
          let [a2, b2, c2] = calcloop(l.radial_next);

          let t = Math.random()*0.5 + 0.5;

          d.load(a).interp(b, t);
          e.load(a2).interp(b2, 1.0-t);
          line = sm.line(d, e);
          line.colors(color, color);
        }
      }
    }
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

    if (this.drawCurvatures && this.mesh) {
      this.updateCurvatureMesh(gl);

      if (this.curvatureMesh) {
        let ob = this.ctx.object;
        let color = [1, 0.8, 0.7, 1.0];

        let uniforms = {
          projectionMatrix: view3d.activeCamera.rendermat,
          objectMatrix    : ob.outputs.matrix.getValue(),
          object_id       : ob.lib_id,
          aspect          : view3d.activeCamera.aspect,
          size            : view3d.glSize,
          near            : view3d.activeCamera.near,
          far             : view3d.activeCamera.far,
          color           : color,
          uColor          : color,
          alpha           : 1.0,
          opacity         : 1.0,
          polygonOffset   : 5.0
        };

        this.curvatureMesh.draw(gl, uniforms, Shaders.WidgetMeshShader);
      }
    }

    if (this.drawLoops && this.mesh) {
      this.updateLoopMesh(gl);

      if (this.loopMesh) {
        let ob = this.ctx.object;
        let color = [1, 0.8, 0.7, 1.0];

        let uniforms = {
          projectionMatrix : view3d.activeCamera.rendermat,
          objectMatrix : ob.outputs.matrix.getValue(),
          object_id : ob.lib_id,
          aspect : view3d.activeCamera.aspect,
          size : view3d.glSize,
          near : view3d.activeCamera.near,
          far : view3d.activeCamera.far,
          color : color,
          uColor : color,
          alpha : 1.0,
          opacity : 1.0,
          polygonOffset : 5.0
        };

        this.loopMesh.draw(gl, uniforms, Shaders.WidgetMeshShader);
      }
    }
    super.on_drawstart(view3d, gl);
  }

  dataLink(scene, getblock, getblock_addUser) {
    super.dataLink(...arguments);

    this.mesh = getblock_addUser(this.mesh);
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
  mesh      : DataRef | DataRef.fromBlock(obj.mesh);
  drawflag  : int;
  drawLoops : bool;
  drawCurvatures : bool;
}`;
nstructjs.manager.add_class(MeshEditor);
ToolMode.register(MeshEditor);

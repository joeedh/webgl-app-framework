import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../core/simplemesh.js';
import {
  IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property, Mat4Property, StringProperty,
  PropFlags, PropTypes, PropSubTypes, ToolOp, ToolMacro, ToolFlags, UndoFlags
} from '../path.ux/scripts/pathux.js';
import {TranslateOp} from "../editors/view3d/transform/transform_ops.js";
import {dist_to_line_2d} from '../path.ux/scripts/util/math.js';
import {CallbackNode, NodeFlags} from "../core/graph.js";
import {DependSocket} from '../core/graphsockets.js';
import * as util from '../util/util.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import {Icons} from '../editors/icon_enum.js';

import {MeshFlags, MeshTypes, MeshFeatures} from './mesh_base.js';
import {MeshOp} from './mesh_ops_base.js';
import {subdivide} from '../subsurf/subsurf_mesh.js';
import {MeshToolBase} from "../editors/view3d/tools/meshtool.js";
import {GridBase, Grid, gridSides, GridSettingFlags} from "./mesh_grids.js";
import {QuadTreeGrid, QuadTreeFields} from "./mesh_grids_quadtree.js";
import {CustomDataElem} from "./customdata.js";
import {bisectMesh, symmetrizeMesh} from "./mesh_utils.js";
import {QRecalcFlags} from "./mesh_grids.js";

import {buildGridsSubSurf} from "./mesh_grids_subsurf.js";
import {FindNearest} from "../editors/view3d/findnearest.js";
import {walkFaceLoop} from "./mesh_utils.js";

import '../util/floathalf.js';
import {DataRefProperty} from "../core/lib_api.js";

import {splitEdgesSmart} from './mesh_subdivide.js';

export class EdgeCutOp extends MeshOp {
  constructor() {
    super();

    this.mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.last_mpos = new Vector2();
    this.first = true;
  }

  static tooldef() {
    return {
      uiname: "Edge Loop Cut",
      is_modal : true,
      icon: Icons.EDGECUT,
      toolpath: "mesh.edgecut",
      inputs: ToolOp.inherit({
        edgeEid : new IntProperty(-1).private(),
        mesh : new DataRefProperty("mesh")
      }),
      outputs: ToolOp.inherit()
    }
  }

  modalStart(ctx) {
    super.modalStart(ctx);
    this.first = true;
  }

  on_pointermove(e) {
    let ctx = this.modal_ctx;
    let view3d = ctx.view3d;

    let mpos = view3d.getLocalMouse(e.x, e.y);
    view3d.resetDrawLines();

    let ret = FindNearest(ctx, SelMask.EDGE, mpos, view3d);

    if (!ret || ret.length === 0) {
      return;
    }

    //console.log(ret[0]);

    let e1 = ret[0].data;
    let mesh = ret[0].mesh;
    let ob = ret[0].object;

    let matrix = ob.outputs.matrix.getValue();

    function vco(v) {
      let v2 = new Vector3(v);
      v2.multVecMatrix(matrix);
      return v2;
    }

    view3d.makeDrawLine(vco(e1.v1), vco(e1.v2), "teal");

    let lastv;
    let firstv;
    let lastl = undefined;
    let firstl = undefined;

    for (let l of walkFaceLoop(e1)) {
      let v = vco(l.e.v1).interp(vco(l.e.v2), 0.5);

      if (!firstv) {
        firstl = l;
        firstv = v;
      }

      if (lastv) {
        view3d.makeDrawLine(lastv, v, "red");
      }
      //view3d.makeDrawLine(vco(l.e.v1), vco(l.e.v2), "red");
      lastv = v;
      lastl = l;
    }

    this.inputs.mesh.setValue(mesh);
    this.inputs.edgeEid.setValue(e1.eid);

    let connect = false;
    if (firstl && lastl) {
      connect = connect || firstl === lastl;
      connect = connect || firstl.f === lastl.f;
      connect = connect || firstl.f === lastl.radial_next.f;
    }

    if (connect) {
      view3d.makeDrawLine(lastv, firstv, "red");
    }
  }

  modalEnd(wasCancelled) {
    let ctx = this.modal_ctx;

    this.modal_ctx.view3d.resetDrawLines();
    super.modalEnd(wasCancelled);

    if (!wasCancelled && this.inputs.edgeEid.getValue() >= 0) {
      this.exec(ctx);
    }
  }

  on_pointerdown(e) {
    let ctx = this.modal_ctx;

    this.modalEnd(e.button !== 0);
  }

  on_pointerup(e) {
    let ctx = this.modal_ctx;

    this.modalEnd(e.button !== 0);
  }

  exec(ctx) {
    console.warn("mesh.edgecut");

    let e = this.inputs.edgeEid.getValue();
    console.log("e", e);

    let mesh = ctx.datalib.get(this.inputs.mesh.getValue());

    console.log("mesh", mesh);
    if (!mesh) {
      return;
    }

    e = mesh.eidmap[e];
    if (!e || !e.l) {
      return;
    }

    console.log(e)

    let loops = [];
    let verts = [];
    let vset = new Set();

    for (let l of walkFaceLoop(e)) {
      loops.push(l);
    }

    if (loops.length === 0) {
      return;
    }

    let firstl = loops[0], lastl = loops[loops.length-1];
    let firstv = firstl.v, lastv = lastl.v;

    let connect = false;
    if (firstl && lastl) {
      connect = connect || firstl === lastl;
      connect = connect || firstl.f === lastl.f;
      connect = connect || firstl.f === lastl.radial_next.f;
    }

    let es = new Set();
    for (let l of loops) {
      es.add(l.e);
      /*
      let v = mesh.splitEdge(l.e)[1];
      vset.add(v);
      verts.push(v);
       */
    }

    let sret = splitEdgesSmart(mesh, es);
    for (let v of sret.newvs) {
      vset.add(v);
      verts.push(v);
    }

    for (let i=0; i<loops.length; i++) {
      break;
      let f = loops[i].f;
      let l1, l2;

      for (let l of f.loops) {
        if (vset.has(l.v)) {
          if (!l1) {
            l1 = l;
          } else {
            l2 = l;
            break;
          }
        }
      }

      if (!l1 || !l2) {
        continue;
      }

      let bad = l1 === l2 || l1 === l2.next || l1 === l2.prev;

      if (!bad) {
        mesh.splitFace(f, l1, l2);
      }
    }

    mesh.regenTessellation();
    mesh.recalcNormals();
    mesh.regenBVH();
    mesh.graphUpdate();
    mesh.regenRender();

    window.redraw_viewport();
  }
}
ToolOp.register(EdgeCutOp);


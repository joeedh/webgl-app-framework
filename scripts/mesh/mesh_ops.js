import './mesh_loopops.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../core/simplemesh.js';
import {
  IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property, Mat4Property, StringProperty,
  PropFlags, PropTypes, PropSubTypes,
  ToolOp, ToolMacro, ToolFlags, UndoFlags
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
import {ccSmooth, subdivide, loopSubdivide} from '../subsurf/subsurf_mesh.js';
import {MeshToolBase} from "../editors/view3d/tools/meshtool.js";
import {splitEdgesSmart} from "./mesh_subdivide.js";
import {GridBase, Grid, gridSides, GridSettingFlags} from "./mesh_grids.js";
import {QuadTreeGrid, QuadTreeFields} from "./mesh_grids_quadtree.js";
import {CustomDataElem} from "./customdata.js";
import {
  bisectMesh, connectVerts, fixManifold, flipLongTriangles, recalcWindings, symmetrizeMesh, trianglesToQuads,
  TriQuadFlags
} from "./mesh_utils.js";
import {QRecalcFlags} from "./mesh_grids.js";

import {buildGridsSubSurf} from "./mesh_grids_subsurf.js";
import {FindNearest} from "../editors/view3d/findnearest.js";
import {walkFaceLoop} from "./mesh_utils.js";

import '../util/floathalf.js';
import {DataRefProperty} from "../core/lib_api.js";
import {CubicPatch, bernstein, bspline} from '../subsurf/subsurf_patch.js';
import {KdTreeGrid} from './mesh_grids_kdtree.js';
import {triangulateFan} from './mesh_utils.js';
import {triangulateFace, setMeshClass, applyTriangulation} from './mesh_tess.js';
import {Mesh} from './mesh.js';

setMeshClass(Mesh);

export class DeleteOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Delete Selected",
      icon    : Icons.DELETE,
      toolpath: "mesh.delete_selected",
      inputs  : ToolOp.inherit(),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.delete_selected");

    let selectmode = ctx.selectMask;
    console.log("selectmode:", selectmode);

    for (let mesh of this.getMeshes(ctx)) {
      let del = [];

      if (selectmode & SelMask.VERTEX) {
        for (let v of new Set(mesh.verts.selected.editable)) {
          mesh.killVertex(v);
        }
      } else if (selectmode & SelMask.EDGE) {
        let vset = new Set();

        for (let e of new Set(mesh.edges.selected.editable)) {
          vset.add(e.v1);
          vset.add(e.v2);

          mesh.killEdge(e);
        }

        for (let v of vset) {
          if (v.edges.length === 0) {
            mesh.killVertex(v);
          }
        }
      } else if (selectmode & SelMask.FACE) {
        let vset = new Set();
        let eset = new Set();

        for (let f of new Set(mesh.faces.selected.editable)) {
          for (let l of f.loops) {
            eset.add(l.e);
            vset.add(l.v);
          }

          mesh.killFace(f);
        }

        for (let e of eset) {
          if (!e.l) {
            mesh.killEdge(e);
          }
        }

        for (let v of vset) {
          if (v.edges.length === 0) {
            mesh.killVertex(v);
          }
        }
      }

      for (let v of del) {
        mesh.killVertex(v);
      }

      mesh.regenRender();
      mesh.regenTesellation();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(DeleteOp);

export class FlipLongTrisOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Flip Long Triangles",
      icon    : Icons.TRIANGLE_FLIPPER,
      toolpath: "mesh.flip_long_tris",
      inputs  : ToolOp.inherit(),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.delete_selected");

    let selectmode = ctx.selectMask;
    console.log("selectmode:", selectmode);

    for (let mesh of this.getMeshes(ctx)) {

      flipLongTriangles(mesh, mesh.faces.selected.editable);

      mesh.regenBVH();
      mesh.regenRender();
      mesh.regenTesellation();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(FlipLongTrisOp);


export class TriToQuadsOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Triangles To Quads",
      icon    : Icons.TRIS_TO_QUADS,
      toolpath: "mesh.tris_to_quads",
      inputs  : ToolOp.inherit({
        options: new FlagProperty(TriQuadFlags.DEFAULT, TriQuadFlags)
      }),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.tris_to_quads");

    for (let mesh of this.getMeshes(ctx)) {
      trianglesToQuads(mesh, mesh.faces.selected.editable, this.inputs.options.getValue());

      mesh.regenBVH();
      mesh.regenRender();
      mesh.regenTesellation();
      mesh.graphUpdate();
      mesh.recalcNormals();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(TriToQuadsOp);


export class SymmetrizeOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Symmetrize",
      toolpath: "mesh.symmetrize",
      icon    : Icons.SYMMETRIZE,
      inputs  : ToolOp.inherit({
        axis        : new EnumProperty(0, {X: 0, Y: 1, Z: 2}),
        side        : new EnumProperty(1, {LEFT: -1, RIGHT: 1}),
        selectedOnly: new BoolProperty(false)
      }),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.symmetrize");

    for (let mesh of this.getMeshes(ctx)) {
      let del = [];

      let fset;

      if (this.inputs.selectedOnly.getValue()) {
        fset = mesh.faces.selected.editable;
      } else {
        fset = mesh.faces;
      }

      fset = new Set(fset);

      let vector = new Vector3();
      let axis = this.inputs.axis.getValue();
      let side = this.inputs.side.getValue();

      vector[axis] = side;

      //force bvh update
      if (mesh.bvh) {
        mesh.bvh.destroy(mesh);
      }

      symmetrizeMesh(mesh, fset, axis, side);

      //force bvh update
      mesh.bvh = undefined;

      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(SymmetrizeOp);


export class BisectOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Bisect Mesh",
      toolpath: "mesh.bisect",
      icon    : Icons.BISECT,
      inputs  : ToolOp.inherit({
        axis        : new EnumProperty(0, {X: 0, Y: 1, Z: 2}),
        side        : new EnumProperty(1, {LEFT: -1, RIGHT: 1}),
        selectedOnly: new BoolProperty(false)
      }),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.bisect");

    for (let mesh of this.getMeshes(ctx)) {
      let del = [];

      let fset;

      if (this.inputs.selectedOnly.getValue()) {
        fset = mesh.faces.selected.editable;
      } else {
        fset = mesh.faces;
      }

      fset = new Set(fset);

      let vector = new Vector3();
      let axis = this.inputs.axis.getValue();
      let side = this.inputs.side.getValue();

      vector[axis] = side;

      //force bvh update
      if (mesh.bvh) {
        mesh.bvh.destroy(mesh);
      }

      let vs = new Set();

      for (let f of fset) {
        for (let l of f.loops) {
          vs.add(l.v);
        }
      }

      let ret = bisectMesh(mesh, fset, vector);

      for (let v of vs) {
        if (Math.sign(v[axis]) !== Math.sign(side) && Math.abs(v[axis]) > 0.0001) {
          mesh.killVertex(v);
        }
      }

      //force bvh update
      mesh.bvh = undefined;

      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(BisectOp);

export class TriangulateOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Triangulate",
      toolpath: "mesh.triangulate",
      inputs  : ToolOp.inherit(),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.triangulate");

    let tri = [0, 0, 0];

    for (let mesh of this.getMeshes(ctx)) {
      let del = [];

      let fs = new Set(mesh.faces.selected.editable);

      for (let f of fs) {
        f.calcNormal();
        applyTriangulation(mesh, f);
      }

      /*
      let ltris = mesh.loopTris;

      for (let i = 0; i < ltris.length; i += 3) {
        let l1 = ltris[i], l2 = ltris[i + 1], l3 = ltris[i + 2];

        if (fs.has(l1.f)) {
          tri.length = 3;
          tri[0] = l1.v;
          tri[1] = l2.v;
          tri[2] = l3.v;

          let f2 = mesh.makeFace(tri);
          let l = f2.lists[0].l;

          mesh.copyElemData(f2, l1.f);
          mesh.copyElemData(l, l1);
          mesh.copyElemData(l.next, l2);
          mesh.copyElemData(l.prev, l3);
        }
      }

      for (let f of fs) {
        mesh.killFace(f);
      }

      */

      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(TriangulateOp);

export class RemeshOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Remesh",
      toolpath: "mesh.remesh",
      inputs  : ToolOp.inherit(
        {
          remesher: new EnumProperty(Remeshers.UNIFORM_TRI, Remeshers)
        }
      ),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.remesh");

    let tri = [0, 0, 0];

    for (let mesh of this.getMeshes(ctx)) {
      remeshMesh(mesh, this.inputs.remesher.getValue());

      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(RemeshOp);


export class LoopSubdOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Subdivide Smooth (Loop)",
      toolpath: "mesh.subdivide_smooth_loop",
      inputs  : ToolOp.inherit(),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.subdivide_smooth_loop");

    let tri = [0, 0, 0];

    for (let mesh of this.getMeshes(ctx)) {
      let del = [];

      loopSubdivide(mesh, mesh.faces.selected.editable);

      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(LoopSubdOp);

export class ExtrudeOneVertexOp extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname     : "Extrude Vertex",
      icon       : Icons.EXTRUDE,
      toolpath   : "mesh.extrude_one_vertex",
      description: "Extrude one vertex",
      inputs     : ToolOp.inherit({
        co       : new Vec3Property(),
        select   : new BoolProperty(true),
        setActive: new BoolProperty(true)
      }),
      outputs    : ToolOp.inherit({
        vertex: new IntProperty(-1), //output vertex eid
        edge  : new IntProperty(-1) //output edge eid
      })
    }
  }

  exec(ctx) {
    let mesh = this.getActiveMesh(ctx);

    if (!(mesh.features & MeshFeatures.MAKE_VERT)) {
      ctx.error("Mesh doesn't support making new vertices");
      ctx.toolstack.toolCancel(ctx, this);
      return;
    }

    let co = this.inputs.co.getValue();
    let v = mesh.makeVertex(co);

    let ok = mesh.verts.active !== undefined;
    ok = ok && (mesh.features & MeshFeatures.MAKE_EDGE);
    ok = ok && v !== mesh.verts.active; //in case of auto-setting somewhere

    ok = ok && (mesh.verts.active.edges.length < 2 || (mesh.features & MeshFeatures.GREATER_TWO_VALENCE));

    this.outputs.vertex.setValue(v.eid);

    if (ok) {
      let e = mesh.makeEdge(mesh.verts.active, v);
      this.outputs.edge.setValue(e.eid);
    }

    if (this.inputs.select.getValue()) {
      mesh.setSelect(v, true);
    }

    if (this.inputs.setActive.getValue()) {
      mesh.setActive(v);
    }

    mesh.regenTesellation();
    mesh.regenRender();
  }
}

ToolOp.register(ExtrudeOneVertexOp);

export class ExtrudeRegionsOp extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname  : "Extrude Regions",
      icon    : -1,
      toolpath: "mesh.extrude_regions",
      undoflag: 0,
      flag    : 0,
      inputs  : ToolOp.inherit({}),
      outputs : {
        normal     : new Vec3Property(),
        normalSpace: new Mat4Property()
      }
    }
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if (args["transform"]) {
      let macro = new ToolMacro();
      macro.add(tool);

      let translate = new TranslateOp();
      translate.inputs.selmask.setValue(SelMask.GEOM);
      translate.inputs.constraint.setValue([0, 0, 1]);

      macro.add(translate);

      macro.connect(tool, "normalSpace", translate, "constraint_space");

      macro.connect(tool, translate, () => {
      //  translate.inputs.constraint_space.setValue(tool.outputs.normalSpace.getValue());
      });

      return macro;
    }

    return tool;
  }

  _exec_intern(ctx, mesh) {
    let fset = new util.set(mesh.faces.selected.editable);
    let vset = new util.set();
    let eset = new util.set();
    let boundary = new util.set();

    for (let f of fset) {
      for (let list of f.lists) {
        for (let l of list) {
          vset.add(l.v);
          eset.add(l.e);
        }
      }
    }

    for (let e of eset) {
      let l = e.l;

      if (l === undefined) {
        continue;
      }

      let _i = 0;
      do {
        if (!fset.has(l.f)) {
          boundary.add(e);
          break;
        }

        if (_i++ > 10000) {
          console.log("infinite loop detected");
          break;
        }
        l = l.radial_next;
      } while (l !== e.l);

      if (_i === 1) {
        boundary.add(e);
      }
    }

    let vmap = {}, emap = {};

    for (let v of vset) {
      let v2 = vmap[v.eid] = mesh.makeVertex(v);
      mesh.copyElemData(v2, v);
    }

    for (let e of eset) {
      let v1 = vmap[e.v1.eid];
      let v2 = vmap[e.v2.eid];

      let e2 = emap[e.eid] = mesh.makeEdge(v1, v2);
      mesh.copyElemData(e2, e);
    }

    for (let v of vset) {
      mesh.verts.setSelect(v, false);
    }

    for (let e of eset) {
      mesh.edges.setSelect(e, false);
    }

    let no = new Vector3();

    for (let f of fset) {
      no.add(f.no);

      let f2 = mesh.copyFace(f, vmap);

      if (f === mesh.faces.active) {
        mesh.setActive(f2);
      }

      mesh.faces.setSelect(f2, true);

      for (let list2 of f2.lists) {
        for (let l2 of list2) {
          mesh.edges.setSelect(l2.e, true);
        }
      }

      let quadvs = new Array(4);

      for (let i = 0; i < f2.lists.length; i++) {
        let list1 = f.lists[i];
        let list2 = f2.lists[i];

        let l1 = list1.l;
        let l2 = list2.l;
        let _i = 0;

        do {
          if (boundary.has(l1.e)) {
            quadvs[0] = l1.v;
            quadvs[1] = l1.next.v;
            quadvs[2] = l2.next.v;
            quadvs[3] = l2.v;

            let f3 = mesh.makeFace(quadvs);
            let l = f3.lists[0].l;

            mesh.copyElemData(l, l1);
            mesh.copyElemData(l.next, l1.next);
            mesh.copyElemData(l.next.next, l2.next);
            mesh.copyElemData(l.prev, l2);
          }

          if (_i++ > 100000) {
            console.warn("infinite loop detected");
            break;
          }

          l2 = l2.next;
          l1 = l1.next;
        } while (l1 !== list1.l);
      }

      mesh.killFace(f);
    }

    for (let e of mesh.edges) {
      e.flag &= ~MeshFlags.DRAW_DEBUG;
    }

    for (let e of boundary) {
      //mesh.edges.setSelect(e, true);
      e.flag |= MeshFlags.DRAW_DEBUG;
      //mesh.verts.setSelect(e.v1, true);
      //mesh.verts.setSelect(e.v2, true);
    }

    for (let e of eset) {
      if (!boundary.has(e) && e.l === undefined) {
        mesh.killEdge(e);
      }
    }

    for (let v of vset) {
      if (v.edges.length === 0) {
        mesh.killVertex(v);
      }
    }

    for (let k in vmap) {
      mesh.verts.setSelect(vmap[k], true);
    }

    no.normalize();
    if (no.dot(no) === 0.0) {
      no[2] = 1.0;
    }

    this.outputs.normalSpace.setValue(new Matrix4().makeNormalMatrix(no));
    this.outputs.normal.setValue(no);

    mesh.regenRender();
    mesh.regenTesellation();
    mesh.recalcNormals();
    mesh.graphUpdate();
    mesh.regenBVH();

    window.redraw_viewport();
  }

  exec(ctx) {
    for (let mesh of this.getMeshes(ctx)) {
      this._exec_intern(ctx, mesh);
    }
  }
}

ToolOp.register(ExtrudeRegionsOp);

import {meshSubdivideTest} from './mesh_subdivide.js';
import {UVWrangler, voxelUnwrap} from './unwrapping.js';
import {relaxUVs, UnWrapSolver} from './unwrapping_solve.js';
import {MeshOpBaseUV, UnwrapOpBase} from './mesh_uvops_base.js';
import {MultiGridSmoother} from './multigrid_smooth.js';
import {Remeshers, remeshMesh} from './mesh_remesh.js';

export class CatmullClarkeSubd extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname  : "Subdivide Smooth",
      icon    : Icons.SUBDIVIDE,
      toolpath: "mesh.subdivide_smooth",
      undoflag: 0,
      flag    : 0,
      inputs  : ToolOp.inherit({}),
    }
  }

  exec(ctx) {
    console.log("subdivide smooth!");

    for (let mesh of this.getMeshes(ctx)) {
      console.log("doing mesh", mesh.lib_id);

      subdivide(mesh, new Set(mesh.faces.selected.editable));

      mesh.regenRender();

      let es = new util.set();

      for (let e of mesh.edges.selected.editable) {
        if (!e.l) {
          es.add(e);
        }
      }

      //handle wire edges
      let vs = new util.set();

      for (let e of es) {
        vs.add(e.v1);
        vs.add(e.v2);

        let ret = mesh.splitEdge(e, 0.5);

        if (ret.length > 0) {
          vs.add(ret[1]);
          mesh.setSelect(ret[0], true);
          mesh.setSelect(ret[1], true);
        }
      }

      vertexSmooth(mesh, vs);

      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }
  }
}

ToolOp.register(CatmullClarkeSubd);

export class MeshSubdTest extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname  : "Test Subdiv Reversing",
      icon    : Icons.SUBDIVIDE,
      toolpath: "mesh.subdiv_test",
      undoflag: 0,
      flag    : 0,
      inputs  : ToolOp.inherit({}),
    }
  }

  exec(ctx) {
    for (let mesh of this.getMeshes(ctx)) {
      meshSubdivideTest(mesh);

      mesh.graphUpdate();
      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenBVH();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(MeshSubdTest);

export class SubdivideSimple extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname  : "Subdivide Simple",
      icon    : Icons.SUBDIVIDE,
      toolpath: "mesh.subdivide_simple",
      undoflag: 0,
      flag    : 0,
      inputs  : ToolOp.inherit({}),
    }
  }

  exec(ctx) {
    console.log("subdivide simple!");

    for (let mesh of this.getMeshes(ctx)) {
      console.log("doing mesh", mesh.lib_id);

      mesh.updateMirrorTags();

      subdivide(mesh, list(mesh.faces.selected.editable), true);

      mesh.regenRender();

      let es = new util.set();

      for (let e of mesh.edges.selected.editable) {
        if (!e.l) {
          es.add(e);
        }
      }

      //handle wire edges
      let vs = new util.set();

      for (let e of es) {
        vs.add(e.v1);
        vs.add(e.v2);

        let ret = mesh.splitEdge(e, 0.5);

        if (ret.length > 0) {
          vs.add(ret[1]);
          mesh.setSelect(ret[0], true);
          mesh.setSelect(ret[1], true);
        }
      }

      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }
  }
}

ToolOp.register(SubdivideSimple);


export class SplitEdgesOp extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname  : "Split Edges",
      icon    : Icons.SUBDIVIDE,
      toolpath: "mesh.split_edges",
      undoflag: 0,
      flag    : 0,
      inputs  : ToolOp.inherit({}),
    }
  }

  exec(ctx) {
    for (let mesh of this.getMeshes(ctx)) {
      mesh.updateMirrorTags();

      let es = new Set(mesh.edges.selected.editable);

      for (let e of es) {
        mesh.splitEdge(e);
      }

      mesh.regenBVH();
      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }
  }
}

ToolOp.register(SplitEdgesOp);

export function vertexSmooth_tst(mesh, verts = mesh.verts.selected.editable, fac = 0.5) {
  verts = new Set(verts);

  if (1) {
    let faces = new Set();

    for (let v of verts) {
      for (let f of v.faces) {
        faces.add(f);
      }
    }

    let ret = subdivide(mesh, faces, true);
    for (let v of ret.newVerts) {
      verts.add(v);
    }

    mesh.regenRender();
    mesh.regenTesellation();
  }

  for (let i = 0; i < 5; i++) {
    vertexSmooth1(mesh, verts, fac);
  }
}

export function vertexSmooth(mesh, verts = mesh.verts.selected.editable, fac = 0.5) {
  verts = new Set(verts);

  if (1) {
    let cos = new Map();

    for (let v of verts) {
      cos.set(v, new Vector3(ccSmooth(v)));
    }

    for (let [v, co] of cos) {
      v.interp(co, fac);
      v.flag |= MeshFlags.UPDATE;
    }
    return;
  }

  let cos = {};
  for (let v of verts) {
    cos[v.eid] = new Vector3(v);

    for (let e of v.edges) {
      let v2 = e.otherVertex(v);

      if (!(v2.eid in cos)) {
        cos[v2.eid] = new Vector3(v2);
      }
    }
  }

  let sym = mesh.symFlag;

  let c1 = new Vector3();
  let c2 = new Vector3();

  for (let v of verts) {
    v.zero();
    let tot = 0.0;

    c1.load(cos[v.eid]);
    //v.zero().addScalar(1.0);

    for (let e of v.edges) {
      let v2 = e.otherVertex(v);

      if (!(v2.eid in cos)) {
        //console.error("Mesh corruption error!!", v, v2, e);
        continue;
      }

      let w = 1.0;
      v.addFac(cos[v2.eid], w);
      tot += w;
    }

    if (tot === 0.0) {
      v.load(cos[v.eid]);
    } else {
      v.mulScalar(1.0/tot);
      /*
      for (let i=0; i<3; i++) {
        if (1||tot % 2 === 0) {
          v[i] = Math.pow(Math.abs(v[i]), 1.0/tot)*Math.sign(v[i]);
        } else {
          v[i] = Math.pow(v[i], 1.0/tot);
        }
        v[i] += c1[i] - off;
        //v[i] -= 10.0/v.edges.length;
        //v[i] = Math.pow(v[i], 1.0 / tot);
      }
      */

      v.interp(cos[v.eid], 1.0 - fac);
    }

    if ((v.flag & MeshFlags.MIRRORED) && (v.flag & MeshFlags.MIRROR_BOUNDARY)) {
      for (let i = 0; i < 3; i++) {
        if (sym & (1<<i)) {
          v[i] = 0.0;
        }
      }
    }
  }

  if (0) {
    let faces = new Set();

    for (let v of verts) {
      for (let f of v.faces) {
        faces.add(f);
      }
    }

    let ret = subdivide(mesh, faces, true);
    for (let v of ret.newVerts) {
      verts.add(v);
    }

    mesh.regenRender();
    mesh.regenTesellation();
  }

  for (let v of verts) {
    //mesh.flagElemUpdate(v);
    v.flag |= MeshFlags.UPDATE;
  }
}

export class VertexSmooth extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname  : "Vertex Smooth",
      icon    : -1,
      toolpath: "mesh.vertex_smooth",
      undoflag: 0,
      flag    : 0,
      inputs  : ToolOp.inherit({
        repeat: new IntProperty(1)
      }),
    }
  }

  exec(ctx) {
    console.log("smooth!");

    for (let mesh of this.getMeshes(ctx)) {
      let repeat = this.inputs.repeat.getValue();

      console.log("mesh:", mesh.lib_id, repeat);

      for (let i = 0; i < repeat; i++) {
        vertexSmooth(mesh, mesh.verts.selected.editable);
      }

      mesh.recalcNormals();
      mesh.regenPartial();
      mesh.regenRender();
      mesh.regenElementsDraw();
    }
  }
}

ToolOp.register(VertexSmooth);


export class TestSplitFaceOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Split Edges (smart)",
      //icon    : Icons.SPLIT_EDGE,
      toolpath: "mesh.split_edges_smart",
      inputs  : ToolOp.inherit(),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.test_split_face");

    for (let mesh of this.getMeshes(ctx)) {
      let vs = new Set();
      let es = new Set();

      for (let v of mesh.verts.selected.editable) {
        vs.add(v);
      }

      for (let v of vs) {
        for (let e of v.edges) {
          if (vs.has(e.otherVertex(v))) {
            es.add(e);
          }
        }
      }

      let {newvs, newfs} = splitEdgesSmart(mesh, es);
      console.log(newvs, newfs);

      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(TestSplitFaceOp);


export class TestCollapseOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Test Collapse Edge",
      icon    : Icons.TINY_X,
      toolpath: "mesh.test_collapse_edge",
      inputs  : ToolOp.inherit(),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.test_collapse_edge");

    for (let mesh of this.getMeshes(ctx)) {
      let vs = new Set();
      let es = new Set();

      for (let v of mesh.verts.selected.editable) {
        vs.add(v);
      }

      for (let v of vs) {
        for (let e of v.edges) {
          if (vs.has(e.otherVertex(v))) {
            es.add(e);
          }
        }
      }

      for (let e of es) {
        mesh.collapseEdge(e);
      }
      //let {newvs, newfs} = splitEdgesSmart(mesh, es);
      //console.log(newvs, newfs);

      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(TestCollapseOp);

let GridTypes = {
  SIMPLE  : 0,
  QUADTREE: 1,
  KDTREE  : 2
};

export class EnsureGridsOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Add/Subdivide Grids",
      toolpath: "mesh.add_or_subdivide_grids",
      icon    : Icons.ADD_GRIDS,
      inputs  : ToolOp.inherit({
        depth: new IntProperty(2),
        types: new EnumProperty(GridTypes.KDTREE, GridTypes)
      }),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.ensure_grids");

    let depth = this.inputs.depth.getValue();
    let dimen = gridSides[depth];

    console.log("DIMEN", dimen);

    let type = this.inputs.types.getValue();
    let cls;

    if (type === GridTypes.SIMPLE) {
      cls = Grid;
    } else if (type === GridTypes.QUADTREE) {
      cls = QuadTreeGrid;
    } else {
      cls = KdTreeGrid;
    }

    for (let mesh of this.getMeshes(ctx)) {
      let off = GridBase.meshGridOffset(mesh);

      if (off < 0) {
        console.log("Adding grids to mesh", mesh);

        cls.initMesh(mesh, dimen, -1)
        //QuadTreeGrid.initMesh(mesh, dimen, -1);
      } else {
        for (let l of mesh.loops) {
          let grid = l.customData[off];
          grid.update(mesh, l, off);
        }

        for (let l of mesh.loops) {
          let grid = l.customData[off];

          grid.subdivideAll(mesh, l, off);
          grid.stripExtraData();
        }

        for (let l of mesh.loops) {
          let grid = l.customData[off];
          grid.update(mesh, l, off);
        }
      }

      mesh.regenBVH();
      mesh.regenTesellation();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(EnsureGridsOp);


export class VoxelUnwrapOp extends UnwrapOpBase {
  static tooldef() {
    return {
      uiname  : "Voxel Unwrap",
      toolpath: "mesh.voxel_unwrap",
      icon    : -1,
      inputs  : ToolOp.inherit({
        setSeams: new BoolProperty(true)
      }),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.voxel_unwrap");


    for (let mesh of this.getMeshes(ctx)) {
      voxelUnwrap(mesh, mesh.faces.selected.editable, undefined, this.inputs.setSeams.getValue());

      mesh.regenBVH();
      mesh.regenTesellation();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(VoxelUnwrapOp);


export class RandomizeUVsOp extends MeshOpBaseUV {
  static tooldef() {
    return {
      uiname  : "Randomize UVs",
      toolpath: "mesh.randomize_uvs",
      icon    : -1,
      inputs  : ToolOp.inherit({
        setSeams: new BoolProperty(true),
        randAll: new BoolProperty(false)
      }),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.randomize_uvs");


    for (let mesh of this.getMeshes(ctx)) {
      let cd_uv = mesh.loops.customData.getLayerIndex("uv");
      if (cd_uv < 0) {
        continue;
      }

      let scale = 0.1;

      let randAll = this.inputs.randAll.getValue();
      if (randAll) {
        for (let l of mesh.loops) {
          let uv = l.customData[cd_uv].uv;

          uv[0] += (Math.random()-0.5)*scale;
          uv[1] += (Math.random()-0.5)*scale;
        }
        continue;
      }

      let wr = new UVWrangler(mesh, this.getFaces(ctx), cd_uv);
      wr.buildIslands();

      for (let island of wr.islands) {
        //scale = Math.min(island.boxsize[0], island.boxsize[1]) + 0.1;
        let newmin = new Vector2(island.min);
        newmin.fract();

        for (let v of island) {
          if (isNaN(v[0]) || isNaN(v[1])) {
            v[0] = Math.random();
            v[1] = Math.random();
          }

          v[0] += (Math.random() - 0.5)*scale;
          v[1] += (Math.random() - 0.5)*scale;

          //v.sub(island.min).add(newmin);
          v[2] = 0.0;
        }
      }

      //wr.packIslands();
      wr.finish();

      mesh.regenBVH();
      mesh.regenTesellation();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(RandomizeUVsOp);

let unwrap_solvers = window._unwrap_solvers = new Map();
unwrap_solvers.clear = function () {
  for (let k of new Set(unwrap_solvers.keys())) {
    unwrap_solvers.delete(k);
  }
}

export class UnwrapSolveOp extends UnwrapOpBase {
  static tooldef() {
    return {
      uiname  : "Unwrap Solve",
      toolpath: "mesh.unwrap_solve",
      icon    : -1,
      inputs  : ToolOp.inherit({
        preserveIslands: new BoolProperty(false).setFlag(PropFlags.SAVE_LAST_VALUE),
        enableSolve : new BoolProperty(true)
      }),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.unwrap_solve");

    let i = 0;
    let meshes = new Set(this.getMeshes(ctx));

    if (unwrap_solvers.size > 5) {
      unwrap_solvers = new Map();
    }

    let preserveIslands = this.inputs.preserveIslands.getValue();

    let time = util.time_ms();
    for (let mesh of meshes) {
      let faces = mesh.faces.selected.editable;

      /* not working
      let faces2 = new Set();
      for (let f of faces) {
        for (let l of f.loops) {
          if ((l.flag & MeshFlags.SELECT) && !(l.flag & MeshFlags.HIDE)) {
            faces2.add(f);
            break;
          }
        }
      }*/

      let solver;

      if (this.inputs.enableSolve.getValue()) {
        solver = UnWrapSolver.restoreOrRebuild(mesh, faces, unwrap_solvers.get(mesh.lib_id),
          undefined, preserveIslands, false);
      } else {
        solver = new UnWrapSolver(mesh, faces, mesh.loops.customData.getLayerIndex("uv"));
        solver.start();
      }

      if (this.inputs.enableSolve.getValue()) {
        while (util.time_ms() - time < 400) {
          solver.step();
        }
      }

      solver.finish();

      unwrap_solvers.set(mesh.lib_id, solver.save())

      mesh.regenBVH();
      mesh.regenUVEditor();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    console.log("unwrap_solvers:", unwrap_solvers);

    window.redraw_viewport();
  }
}

ToolOp.register(UnwrapSolveOp)

export class RelaxUVsOp extends MeshOpBaseUV {
  static tooldef() {
    return {
      uiname  : "Relax UVs",
      toolpath: "mesh.relax_uvs",
      icon    : -1,
      inputs  : ToolOp.inherit({}),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.relax_uvs");


    for (let mesh of this.getMeshes(ctx)) {
      let cd_uv = mesh.loops.customData.getLayerIndex("uv");

      if (cd_uv >= 0) {
        if (1) {
          let faces = mesh.faces.selected.editable;
          let solver = UnWrapSolver.restoreOrRebuild(mesh, faces, unwrap_solvers.get(mesh.lib_id), undefined, true);
          //let solver = new UnWrapSolver(mesh, faces, cd_uv, true);
          solver.step();
          solver.finish();

          unwrap_solvers.set(mesh.lib_id, solver.save())
        }

        relaxUVs(mesh, cd_uv, this.getLoops(ctx), false);

        /*
        let wr = new UVWrangler(mesh, mesh.faces);

        wr.buildIslands();
        wr.packIslands();
        wr.finish();
         */

        mesh.regenBVH();
        mesh.regenUVEditor();
        mesh.regenRender();
        mesh.regenElementsDraw();
        mesh.graphUpdate();
      }
    }

    window.redraw_viewport();
  }
}

ToolOp.register(RelaxUVsOp)


export class ResetUVs extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Reset UVs",
      toolpath: "mesh.reset_uvs",
      icon    : -1,
      inputs  : ToolOp.inherit({}),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.relax_uvs");


    for (let mesh of this.getMeshes(ctx)) {
      let cd_uv = mesh.loops.customData.getLayerIndex("uv");

      if (cd_uv >= 0) {
        for (let f of mesh.faces.selected.editable) {
          for (let list of f.lists) {
            let count = 0;
            for (let l of list) {
              count++;
            }

            let l = list.l;

            l.f.flag |= MeshFlags.UPDATE;

            l.customData[cd_uv].uv.loadXY(0, 0);
            l.next.customData[cd_uv].uv.loadXY(0, 1);
            l.next.next.customData[cd_uv].uv.loadXY(1, 1);

            if (count === 4) {
              l.prev.customData[cd_uv].uv.loadXY(1, 0);
            }
          }
        }

        /*
        let wr = new UVWrangler(mesh, mesh.faces);

        wr.buildIslands();
        wr.packIslands();
        wr.finish();
         */

        mesh.regenBVH();
        mesh.regenUVEditor();
        mesh.regenRender();
        mesh.regenElementsDraw();
        mesh.graphUpdate();
      }
    }

    window.redraw_viewport();
  }
}

ToolOp.register(ResetUVs)


export class GridUVs extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Grid UVs",
      toolpath: "mesh.grid_uvs",
      icon    : -1,
      inputs  : ToolOp.inherit({}),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.grid_uvs");


    for (let mesh of this.getMeshes(ctx)) {
      let cd_uv = mesh.loops.customData.getLayerIndex("uv");

      if (cd_uv >= 0) {
        let i = 0;
        let count = 0;

        for (let f of mesh.faces.selected.editable) {
          for (let list of f.lists) {
            for (let l of list) {
              //if ((l.flag & MeshFlags.SELECT) && !(l.flag & MeshFlags.HIDE)) {
              count++;
              //}
            }
          }
        }

        let dimen = Math.ceil(Math.sqrt(count*0.25));
        let idimen = 1.0/dimen;

        for (let f of mesh.faces.selected.editable) {
          for (let list of f.lists) {
            let count = 0;
            for (let l of list) {
              count++;
            }

            let l = list.l;

            l.f.flag |= MeshFlags.UPDATE;

            let x = i%dimen, y = ~~(i/dimen);
            x *= idimen;
            y *= idimen;

            let pad = idimen*0.025;

            l.customData[cd_uv].uv.loadXY(x + pad, y + pad);
            l.next.customData[cd_uv].uv.loadXY(x + pad, y + idimen - pad*2.0);
            l.next.next.customData[cd_uv].uv.loadXY(x + idimen - pad*2.0, y + idimen - pad*2.0);

            if (count === 4) {
              l.prev.customData[cd_uv].uv.loadXY(x + idimen - pad*2.0, y + pad);
            }

            i++;
          }

          let off = new Vector2().loadXY(Math.random(), Math.random());

          for (let l of f.loops) {
            // l.customData[cd_uv].uv.add(off);
          }
        }

        /*
        let wr = new UVWrangler(mesh, mesh.faces);

        wr.buildIslands();
        wr.packIslands();
        wr.finish();
        // */

        mesh.regenBVH();
        mesh.regenUVEditor();
        mesh.regenRender();
        mesh.regenElementsDraw();
        mesh.graphUpdate();
      }
    }

    window.redraw_viewport();
  }
}

ToolOp.register(GridUVs)


export class PackIslandsOp extends MeshOpBaseUV {
  static tooldef() {
    return {
      uiname  : "Pack UVs",
      toolpath: "mesh.pack_uvs",
      icon    : -1,
      inputs  : ToolOp.inherit({}),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.pack_uvs");


    for (let mesh of this.getMeshes(ctx)) {
      let cd_uv = mesh.loops.customData.getLayerIndex("uv");

      if (cd_uv >= 0) {
        let iter = this.inputs.selectedFacesOnly.getValue() ? mesh.faces.selected.editable : mesh.faces;

        let wr = new UVWrangler(mesh, iter);

        wr.buildIslands();
        wr.packIslands();
        wr.finish();

        mesh.regenBVH();
        mesh.regenUVEditor();
        mesh.regenRender();
        mesh.regenElementsDraw();
        mesh.graphUpdate();
      }
    }

    window.redraw_viewport();
  }
}

ToolOp.register(PackIslandsOp)

export class SubdivideGridsOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Subdivide Grids",
      toolpath: "mesh.subdivide_grids",
      inputs  : ToolOp.inherit({}),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.subdivide_grids");

    for (let mesh of this.getMeshes(ctx)) {
      let cd_grid = mesh.loops.customData.getLayerIndex(QuadTreeGrid);

      if (cd_grid >= 0) {
        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];

          grid.update(mesh, l, cd_grid);
          grid.subdivideAll(mesh, l, cd_grid);
          grid.update(mesh, l, cd_grid);
        }
      }

      mesh.regenBVH();
      mesh.regenTesellation();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(SubdivideGridsOp);


export class SmoothGridsOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Smooth Grids",
      toolpath: "mesh.smooth_grids",
      icon    : Icons.SMOOTH_GRIDS,
      inputs  : ToolOp.inherit({
        factor: new FloatProperty(0.25).setRange(0.01, 2.0)
      }),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.smooth_grids");

    let fac = this.inputs.factor.getValue();

    function doSmooth(mesh, cd_grid) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        //grid.stripExtraData();
      }

      for (let i = 0; i < 1; i++) {
        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];

          //grid.recalcFlag |= QRecalcFlags.ALL | QRecalcFlags.NORMALS | QRecalcFlags.LEAVES | QRecalcFlags.NEIGHBORS | QRecalcFlags.POINTHASH;
          //grid.recalcFlag |= QRecalcFlags.LEAF_POINTS | QRecalcFlags.LEAF_NODES;
          //grid.recalcFlag |= QRecalcFlags.ALL | QRecalcFlags.NORMALS | QRecalcFlags.LEAVES | QRecalcFlags.NEIGHBORS;

          grid.update(mesh, l, cd_grid);
        }
      }

      for (let i = 0; i < 3; i++) {
        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];
          let ps = grid.points;

          let p1 = ps[0];
          let p2 = ps[1];
          let p3 = ps[2];
          let p4 = ps[3];

          for (let p of grid.points) {
            grid.smoothPoint(p, fac);
          }
        }
      }

      for (let i = 0; i < 3; i++) {
        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];
          grid.stitchBoundaries();
        }
      }

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];
        grid.recalcFlag |= QRecalcFlags.ALL | QRecalcFlags.NORMALS | QRecalcFlags.LEAVES | QRecalcFlags.NEIGHBORS;
        grid.update(mesh, l, cd_grid);
      }
    }

    for (let mesh of this.getMeshes(ctx)) {
      let cd_grid = mesh.loops.customData.getLayerIndex(QuadTreeGrid);

      if (cd_grid < 0) {
        cd_grid = mesh.loops.customData.getLayerIndex(KdTreeGrid);
      }

      if (cd_grid < 0) {
        continue;
      }

      doSmooth(mesh, cd_grid);
      if (0) {
        let depth = 0;

        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];
          depth = Math.max(depth, grid.nodes[QuadTreeFields.QSUBTREE_DEPTH]);
        }
        console.log("MRES DEPTH", depth);

        let mres = mesh.loops.customData.getLayerSettings(QuadTreeGrid);
        let oldmres = mres.copy();

        let start = depth === 0 ? 0 : 1;

        for (let i = 1; i <= Math.ceil(depth/2); i++) {
          mres.flag |= GridSettingFlags.ENABLE_DEPTH_LIMIT;
          mres.depthLimit = i*2;

          doSmooth(mesh, cd_grid);
        }

        oldmres.copyTo(mres);
      }

      mesh.regenBVH();
      mesh.regenTesellation();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(SmoothGridsOp);

const staroffs = [
  [-1, 0],
  [1, 0],
  [0, 1],
  [0, -1]
]

const staroffs_origin = [
  [-1, 0],
  [1, 0],
  [0, 1],
  [0, -1],
  [0, 0],
]

let boxoffs = [];

for (let ix = -1; ix <= 1; ix++) {
  for (let iy = -1; iy <= 1; iy++) {
    boxoffs.push([ix, iy]);
  }
}

export class GridsTestOp2 extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Grid Test 2",
      toolpath: "mesh.grids_test",
      icon    : Icons.GRIDS_TEST,
      inputs  : ToolOp.inherit({
        factor   : new FloatProperty(0.25).setRange(0.01, 2.0),
        setColors: new BoolProperty(false)
      }),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    let mesh = ctx.mesh;

    let cd_grid = mesh.loops.customData.getLayerIndex(QuadTreeGrid);
    if (cd_grid < 0) {
      return;
    }

    for (let l of mesh.loops) {
      let grid = l.customData[cd_grid];

      grid.recalcFlag |= QRecalcFlags.TOPO | QRecalcFlags.POLYS;
      grid.update(mesh, l, cd_grid);
    }

    for (let l of mesh.loops) {
      let grid = l.customData[cd_grid];

      grid.recalcFlag |= QRecalcFlags.NEIGHBORS;
      grid.update(mesh, l, cd_grid);
    }

    for (let l of mesh.loops) {
      let grid = l.customData[cd_grid];

      for (let pi of grid.getLeafPoints()) {
        let p = grid.points[pi];

        p.load(p.sco);
      }

      grid.recalcFlag |= QRecalcFlags.NORMALS;
    }

    for (let l of mesh.loops) {
      let grid = l.customData[cd_grid];

      grid.update(mesh, l, cd_grid);
    }

    mesh.regenRender();
    mesh.regenBVH();
    mesh.graphUpdate();

    window.redraw_viewport(true);
  }
}

ToolOp.register(GridsTestOp2);

export class GridsTestOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Grids Debug Test",
      toolpath: "mesh.grids_test2",
      icon    : Icons.GRIDS_TEST,
      inputs  : ToolOp.inherit({
        factor   : new FloatProperty(0.25).setRange(0.01, 2.0),
        setColors: new BoolProperty(false)
      }),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.grids_test");

    let fac = this.inputs.factor.getValue();

    let view3d = _appstate.ctx.view3d;
    view3d.resetDrawLines();

    function makeDrawLine(a, b, color) {
      if (!window.dd) {
        return view3d.makeDrawLine(a, b, color);
      }
    }

    let QPOINT1 = QuadTreeFields.QPOINT1;
    let QPARENT = QuadTreeFields.QPARENT;
    let QDEPTH = QuadTreeFields.QDEPTH;
    let QSUBTREE_DEPTH = QuadTreeFields.QSUBTREE_DEPTH;
    let QMINU = QuadTreeFields.QMINU;
    let QMINV = QuadTreeFields.QMINV;
    let QMAXU = QuadTreeFields.QMAXU;
    let QMAXV = QuadTreeFields.QMAXV;

    if (1) { //for (let mesh of this.getMeshes(ctx)) {
      let mesh = ctx.mesh;
      let cd_grid = mesh.loops.customData.getLayerIndex(Grid);

      if (cd_grid >= 0) {
        buildGridsSubSurf(mesh, this.inputs.setColors.getValue());
      }

      cd_grid = mesh.loops.customData.getLayerIndex(QuadTreeGrid);
      if (cd_grid >= 0) {
        let p1 = new Vector3();
        let p2 = new Vector3();
        let temps = util.cachering.fromConstructor(Vector3, 64);

        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];

          grid.recalcFlag |= QRecalcFlags.TOPO;
          grid.update(mesh, l, cd_grid);
        }

        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];
          grid.update(mesh, l, cd_grid);

          grid.recalcNeighbors(mesh, l, cd_grid);
        }

        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];
          grid.update(mesh, l, cd_grid);

          for (let p of grid.points) {
            p.orig = new Vector3(p);
          }
        }


        function getp(p, o, depth, grid) {
          let co = new Vector3();

          let tot = 0.0;

          let dimen = gridSides[depth] - 1;
          let dt = 1.0/dimen;

          let uv = p.uv;

          for (let off of staroffs) {
            let u = uv[0] + off[0]*dt;
            let v = uv[1] + off[1]*dt;

            let co2 = grid.evaluate(u, v);
            co.add(co2);
            tot++;
          }

          if (tot) {
            co.mulScalar(1.0/tot);
            co.interp(p.orig, 1.0/2.0);
          } else {
            co.load(p.orig);
          }

          return co;
        }

        function makePatch(grid, ni, ns, p1, p2, p3, p4, o1, o2, o3, o4) {
          let p = new CubicPatch();

          let depth = ns[ni + QDEPTH];

          o1 = getp(p1, o1, depth, grid);
          o2 = getp(p2, o2, depth, grid);
          o3 = getp(p3, o3, depth, grid);
          o4 = getp(p4, o4, depth, grid);

          let clr = "green";
          //*
          makeDrawLine(p1.orig, p2.orig, clr);
          makeDrawLine(p2.orig, p3.orig, clr);
          makeDrawLine(p3.orig, p4.orig, clr);
          makeDrawLine(p4.orig, p1.orig, clr);
          //*/

          p.basis = bernstein;
          //let cent = new Vector3();
          //cent.load(o1).add(o2).add(o3).add(o4).mulScalar(1.0 / 4.0);

          function set(x, y, co) {
            for (let x2 = x; x2 < x + 2; x2++) {
              for (let y2 = y; y2 < y + 2; y2++) {
                p.setPoint(x2, y2, co);
              }
            }
          }

          let a = new Vector3();
          let b = new Vector3();
          let c = new Vector3();

          let disable = 0;

          for (let x = 0; x < 4; x++) {
            let u = x/3;

            for (let y = 0; y < 4; y++) {
              let v = y/3;

              if (!disable && x >= 1 && x <= 2 && y >= 1 && y <= 2) {
                continue;
              }
              a.load(o1).interp(o2, v);
              b.load(o4).interp(o3, v);
              a.interp(b, u);
              p.setPoint(x, y, a);
            }
          }

          if (disable) {
            return p;
          }

          let l1 = o1.vectorDistance(o2);
          let l3 = o3.vectorDistance(o4);

          let l2 = o2.vectorDistance(o3);
          let l4 = o4.vectorDistance(o1);

          let d = window.d2 ?? 1.0/3.0;
          let d2 = window.d3 ?? 0.0;

          let dfac = 1.0/Math.pow(2, depth);

          function gt(p) {
            return new Vector3(p).mulScalar(dfac);
          }

          function gn(p1, p2, t) {
            let n = new Vector3();

            let l = p1.vectorDistance(p2)*d2;
            n.load(p1.no).interp(p2.no, t).normalize().mulScalar(l);
            return n;

            let t1 = gt(p1.tan);
            let t2 = gt(p2.tan);
            let b1 = gt(p1.bin);
            let b2 = gt(p2.bin);

            t2.sub(t1);
            b2.sub(b1);

            n.load(b2).cross(t2).mulScalar(d2);
            l = n.vectorLength();

            n.load(p1.no).interp(p2.no, t).normalize().mulScalar(l);
            return n;
          }

          function sinterp(v2, t) {
            //return this.interp(v2, t);
            let v1 = this;
            let l1 = v1.vectorLength();
            let l2 = v2.vectorLength();

            v1.interp(v2, t).normalize().mulScalar(l1 + (l2 - l1)*t);
            return v1;
          }

          Vector3.prototype.sinterp = sinterp;

          if (!disable) {
            for (let i = 0; i < 2; i++) {
              let t = (i + 1.0)/3.0;

              let mul2 = l1 + (l3 - l1)*t;
              let mul1 = l2 + (l4 - l2)*t;

              //mul1 = -mul1;

              mul1 *= d;
              mul2 *= d;

              //let mul3 = (mul1+mul2)*0.5 * (window.d3 || 1.0);
              let mul3 = mul1*mul2*d2;
              let mul4 = mul2*mul1*d2;

              //*
              c.load(o1).interp(o2, t);
              b.load(gt(p1.tan)).sinterp(gt(p2.tan), t).mulScalar(d);
              a.load(c).addFac(b, 1.0);
              makeDrawLine(c, a, "red");

              p.addPoint(1, i + 1, a);
              a.load(gn(p1, p2, t));
              p.addPoint(1, i + 1, a, false);
              p.addPoint(0, i + 1, a, false);


              c.load(o4).interp(o3, t);
              b.load(gt(p4.tan)).sinterp(gt(p3.tan), t).mulScalar(d);
              a.load(c).addFac(b, -1.0);
              makeDrawLine(c, a, "red");

              p.addPoint(2, i + 1, a);
              a.load(gn(p4, p3, t));
              p.addPoint(2, i + 1, a, false);
              p.addPoint(3, i + 1, a, false);
              //*/


              //*
              c.load(o1).interp(o4, t);
              b.load(gt(p1.bin)).sinterp(gt(p4.bin), t).mulScalar(d);
              a.load(c).addFac(b, 1.0);
              makeDrawLine(c, a, "red");

              p.addPoint(i + 1, 1, a);
              a.load(gn(p1, p4, t));
              p.addPoint(i + 1, 1, a, false);
              p.addPoint(i + 1, 0, a, false);


              c.load(o2).interp(o3, t);
              b.load(gt(p2.bin)).sinterp(gt(p3.bin), t).mulScalar(d);
              a.load(c).addFac(b, -1.0);
              makeDrawLine(c, a, "red");

              p.addPoint(i + 1, 2, a, true);
              a.load(gn(p2, p3, t));
              p.addPoint(i + 1, 2, a, false);
              p.addPoint(i + 1, 3, a, false);
              //*/
            }


            let ww = window.d5 ?? 0.0;
            /*
            p.addPoint(0, 0, p1.sco, true, ww);
            p.addPoint(0, 1, p2.sco, true, ww);
            p.addPoint(1, 1, p3.sco, true, ww);
            p.addPoint(1, 0, p4.sco, true, ww);
            */

            /*
            p.addPoint(0, 0, p1.no, false, d*d2);
            p.addPoint(0, 1, p2.no, false, d*d2);
            p.addPoint(1, 1, p3.no, false, d*d2);
            p.addPoint(1, 0, p4.no, false, d*d2);
            */

            p.finishPoints();
          }

          clr = "orange";
          for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
              let a = p.getPoint(i, j);
              let b = p.getPoint(i, j + 1);
              let c = p.getPoint(i + 1, j + 1);
              let d = p.getPoint(i, j + 1);

              makeDrawLine(a, b, clr);
              makeDrawLine(b, c, clr);
              makeDrawLine(c, d, clr);
              makeDrawLine(d, a, clr);
            }
          }
          return p;
        }

        for (let l of mesh.loops) {
          let doneset = new WeakSet();

          let grid = l.customData[cd_grid];
          let ns = grid.nodes, ps = grid.points;

          let patches = new Map();

          let origco = new Map();
          for (let p of grid.points) {
            origco.set(p, new Vector3(p));
          }

          for (let ni of grid.getLeafNodes()) {
            if (ni === 0) {
              continue;
            }

            for (let i = 0; i < 4; i++) {
              let pi = ns[ni + QPOINT1 + i];
              let p = ps[pi];

              if (doneset.has(p)) {
                continue;
              }

              let uv = grid._getUV(ni, i);
              doneset.add(p);

              let ni2 = ns[ni + QPARENT];

              for (let j = 0; j < 2; j++) {
                if (ni2) {
                  ni2 = ns[ni2 + QPARENT];
                }
              }

              let u = (uv[0] - ns[ni2 + QMINU])/(ns[ni2 + QMAXU] - ns[ni2 + QMINU]);
              let v = (uv[1] - ns[ni2 + QMINV])/(ns[ni2 + QMAXV] - ns[ni2 + QMINV]);

              let p1 = ps[ns[ni2 + QPOINT1]];
              let p2 = ps[ns[ni2 + QPOINT1 + 1]];
              let p3 = ps[ns[ni2 + QPOINT1 + 2]];
              let p4 = ps[ns[ni2 + QPOINT1 + 3]];

              let p1b = origco.get(p1);
              let p2b = origco.get(p2);
              let p3b = origco.get(p3);
              let p4b = origco.get(p4);

              let a = temps.next();
              let b = temps.next();

              a.load(p1b).interp(p2b, v);
              b.load(p4b).interp(p3b, v);
              a.interp(b, u);

              let patch = patches.get(ni2);
              if (!patch) {
                patch = makePatch(grid, ni2, ns, p1, p2, p3, p4, p1b, p2b, p3b, p4b);
                patches.set(ni2, patch);
              }

              p.load(patch.evaluate(u, v));
              p.load(grid.subsurf.evaluate(uv[0], uv[1]));

            }
          }

          for (let pi of grid.getLeafPoints()) {
            break;
            let p = grid.points[pi];

            //p1.load(p).sub(p.sco);
            //p.addFac(p1, 0.5);
            p.load(p.sco);
          }

        }

        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];
          grid.recalcFlag |= QRecalcFlags.ALL;
          grid.update(mesh, l, cd_grid);
        }
      }

      mesh.regenBVH();
      mesh.regenTesellation();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }

  undo(ctx) {
    super.undo(ctx);

    let view3d = _appstate.ctx.view3d;
    if (view3d) {
      view3d.resetDrawLines();
    }
  }
}

ToolOp.register(GridsTestOp);

export class DeleteGridsOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Delete Grids",
      icon    : Icons.DELETE_GRIDS,
      toolpath: "mesh.delete_grids",
      inputs  : ToolOp.inherit({}),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.delete_grids");

    for (let mesh of this.getMeshes(ctx)) {
      let off = GridBase.meshGridOffset(mesh);

      if (off >= 0) {
        console.log("Deleting grids from mesh", mesh);

        mesh.loops.removeCustomDataLayer(off);
      }

      //force bvh update
      mesh.bvh = undefined;

      mesh.regenRender();
      mesh.regenTesellation();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }


    window.redraw_viewport();
  }
}

ToolOp.register(DeleteGridsOp);


export class ResetGridsOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Reset Grids",
      icon    : Icons.RESET_GRIDS,
      toolpath: "mesh.reset_grids",
      inputs  : ToolOp.inherit({}),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.reset_grids");

    for (let mesh of this.getMeshes(ctx)) {
      let off = GridBase.meshGridOffset(mesh);
      if (off < 0) {
        continue;
      }

      console.log("resetting grids");

      for (let f of mesh.faces) {
        f.calcCent();
      }

      for (let l of mesh.loops) {
        let grid = l.customData[off];

        grid.init(grid.dimen, mesh, l);
      }

      //force bvh reload
      if (mesh.bvh) {
        mesh.bvh.destroy(mesh);
      }
      mesh.bvh = undefined;

      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(ResetGridsOp);


export class ApplyGridBaseOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Apply Base",
      icon    : Icons.APPLY_GRIDS_BASE,
      toolpath: "mesh.apply_grid_base",
      inputs  : ToolOp.inherit({}),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.apply_grid_base");

    for (let mesh of this.getMeshes(ctx)) {
      let off = GridBase.meshGridOffset(mesh);
      if (off < 0) {
        continue;
      }

      for (let l of mesh.loops) {
        let grid = l.customData[off];

        grid.applyBase(mesh, l, off);
      }

      //force bvh reload
      if (mesh.bvh) {
        mesh.bvh.destroy(mesh);
      }
      mesh.bvh = undefined;

      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(ApplyGridBaseOp);

export class AddCDLayerOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Add Data Layer",
      icon    : Icons.SMALL_PLUS,
      toolpath: "mesh.add_cd_layer",
      inputs  : ToolOp.inherit({
        elemType : new EnumProperty(MeshTypes.VERTEX, MeshTypes),
        layerType: new StringProperty("uv"),
        name     : new StringProperty("")
      }),
      outputs : ToolOp.inherit({
        layerIndex: new IntProperty(-1)
      })
    }
  }

  exec(ctx) {
    console.warn("mesh.add_cd_layer");

    for (let mesh of this.getMeshes(ctx)) {
      let name = this.inputs.name.getValue().trim();
      if (name === "") {
        name = undefined;
      }

      let type = this.inputs.elemType.getValue();
      let elist = mesh.getElemList(type);

      let typecls = CustomDataElem.getTypeClass(this.inputs.layerType.getValue());
      if (!typecls) {
        this.ctx.error("Unknown layer type " + this.inputs.layerType.getValue());
        return;
      }

      let ret = elist.addCustomDataLayer(typecls, name);

      if (ret) {
        this.outputs.layerIndex.setValue(ret.index);
      }

      //XXX add support for MeshOp to only operate on active mesh
      break;
    }

    window.redraw_viewport();
  }
}

ToolOp.register(AddCDLayerOp);


export class RemCDLayerOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Remove Data Layer",
      icon    : Icons.SMALL_PLUS,
      toolpath: "mesh.remove_cd_layer",
      inputs  : ToolOp.inherit({
        elemType : new EnumProperty(MeshTypes.VERTEX, MeshTypes),
        layerType: new StringProperty("uv"),
        name     : new StringProperty("")
      }),
      outputs : ToolOp.inherit({
        layerIndex: new IntProperty(-1)
      })
    }
  }

  exec(ctx) {
    console.warn("mesh.remove_cd_layer");

    for (let mesh of this.getMeshes(ctx)) {
      let name = this.inputs.name.getValue().trim();
      if (name === "") {
        name = undefined;
      }

      let type = this.inputs.elemType.getValue();
      let elist = mesh.getElemList(type);

      let typecls = CustomDataElem.getTypeClass(this.inputs.layerType.getValue());
      if (!typecls) {
        this.ctx.error("Unknown layer type " + this.inputs.layerType.getValue());
        return;
      }

      let off = elist.customData.getLayerIndex(typecls);

      if (off < 0) {
        ctx.error("no cd layers");
        return;
      }
      let ret = elist.removeCustomDataLayer(off);

      if (ret) {
        this.outputs.layerIndex.setValue(ret.index);
      }

      //XXX add support for MeshOp to only operate on active mesh
      break;
    }

    window.redraw_viewport();
  }
}

ToolOp.register(RemCDLayerOp);

export class TestMultiGridSmoothOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Test MultiGrid Smoother",
      toolpath: "mesh.test_multigrid_smooth",
      inputs  : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.log("mesh.test_multigrid_smooth()");

    for (let mesh of this.getMeshes(ctx)) {
      let ms = new MultiGridSmoother(mesh);

      for (let v of mesh.verts) {
        ms.addVert(v);
      }
      ms.update();

      mesh.selectNone();

      for (let v of ms.levels[0].superVerts) {
        mesh.verts.setSelect(v, true);
        v.flag |= MeshFlags.UPDATE;

        //v.addFac(v.no, 0.5);
      }

      let supers = ms.getSuperVerts(mesh.verts); //mesh.verts.selected.editable);

      ms.smooth(supers, (v) => {
        return 1.0; //XXX

        if (v.flag & MeshFlags.SELECT) {
          return 1.0;
        }

        return 0.0;
      }, 0.5);

      console.log("SuperVerts:", supers);

      ms.finish();

      mesh.recalcNormals();
      mesh.regenElementsDraw();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport(true);
  }
}

ToolOp.register(TestMultiGridSmoothOp);

export class FixNormalsOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Recalc Normals",
      toolpath: "mesh.fix_normals",
      inputs  : ToolOp.inherit({
        outside : new BoolProperty(true)
      })
    }
  }

  exec(ctx) {
    console.log("mesh.test_multigrid_smooth()");

    for (let mesh of this.getMeshes(ctx)) {
      recalcWindings(mesh, mesh.faces.selected.editable);

      if (!this.inputs.outside.getValue()) {
        for (let f of mesh.faces.selected.editable) {
          mesh.reverseWinding(f);
        }
      }

      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenElementsDraw();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport(true);
  }
}

ToolOp.register(FixNormalsOp);


export class FixManifoldOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Fix Manifold",
      description : "Fix manifold errors (except for holes)",
      toolpath: "mesh.fix_manifold",
      inputs  : ToolOp.inherit({
      })
    }
  }

  exec(ctx) {
    console.log("mesh.test_multigrid_smooth()");

    function calcEulerPoincare(mesh) {
      let v = mesh.verts.length;
      let l = 0;
      for (let f of mesh.faces) {
        l += f.lists.length;
      }
      let e = mesh.edges.length;
      let s = 1;
      let g = 0;
      let f = mesh.faces.length;

      return v - e + f - (l - f) - 2*(s - g);
    }

    for (let mesh of this.getMeshes(ctx)) {
      console.log("euler-poincare:", calcEulerPoincare(mesh));

      mesh.fixLoops();

      for (let i=0; i<1000; i++) {
        if (!fixManifold(mesh)) {
          break;
        }
      }

      mesh.fixLoops();

      console.log("euler-poincare:", calcEulerPoincare(mesh));

      mesh.regenBVH();
      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenElementsDraw();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport(true);
  }
}

ToolOp.register(FixManifoldOp);

export class ConnectVertsOp extends MeshOp {
  static tooldef() {return {
    uiname : "Connect Verts",
    toolpath : "mesh.connect_verts",
    inputs : ToolOp.inherit({})
  }}

  exec(ctx) {
    for (let mesh of this.getMeshes(ctx)) {
      let vs = util.list(mesh.verts.selected.editable);

      if (vs.length === 2) {
        let v1 = vs[0], v2 = vs[1];

        connectVerts(mesh, v1, v2);
      }

      mesh.regenBVH();
      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }
  }
}
ToolOp.register(ConnectVertsOp);

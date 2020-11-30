import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../core/simplemesh.js';
import {
  IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property, Mat4Property, StringProperty,
  PropFlags, PropTypes, PropSubTypes
} from '../path.ux/scripts/toolsys/toolprop.js';
import {ToolOp, ToolMacro, ToolFlags, UndoFlags} from '../path.ux/scripts/toolsys/simple_toolsys.js';
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
import {splitEdgesSmart} from "./mesh_subdivide.js";
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

export class DeleteOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Delete Selected",
      icon: Icons.TINY_X,
      toolpath: "mesh.delete_selected",
      inputs: ToolOp.inherit(),
      outputs: ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.delete_selected");

    for (let mesh of this.getMeshes(ctx)) {
      let del = [];

      for (let v of mesh.verts.selected.editable) {
        del.push(v);
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


export class SymmetrizeOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Symmetrize",
      toolpath: "mesh.symmetrize",
      icon : Icons.SYMMETRIZE,
      inputs: ToolOp.inherit({
        axis: new EnumProperty(0, {X: 0, Y: 1, Z: 2}),
        side: new EnumProperty(1, {LEFT: -1, RIGHT: 1}),
        selectedOnly : new BoolProperty(false)
      }),
      outputs: ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.delete_selected");

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

      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenTesellation();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(SymmetrizeOp);



export class BisectOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Bisect Mesh",
      toolpath: "mesh.bisect",
      icon : Icons.BISECT,
      inputs: ToolOp.inherit({
        axis: new EnumProperty(0, {X: 0, Y: 1, Z: 2}),
        side: new EnumProperty(1, {LEFT: -1, RIGHT: 1}),
        selectedOnly : new BoolProperty(false)
      }),
      outputs: ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.delete_selected");

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

      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenTesellation();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(BisectOp);

export class TriangulateOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Triangulate",
      toolpath: "mesh.triangulate",
      inputs: ToolOp.inherit(),
      outputs: ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.delete_selected");

    let tri = [0, 0, 0];

    for (let mesh of this.getMeshes(ctx)) {
      let del = [];

      let fs = new Set(mesh.faces.selected.editable);

      let ltris = mesh.loopTris;

      for (let i=0; i<ltris.length; i += 3) {
        let l1 = ltris[i], l2 = ltris[i+1], l3 = ltris[i+2];

        if (fs.has(l1.f)) {
          tri.length = 3;
          tri[0] = l1.v;
          tri[1] = l2.v;
          tri[2] = l3.v;

          console.log(l1, l2, l3);
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

      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenTesellation();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(TriangulateOp);

export class ExtrudeOneVertexOp extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname: "Extrude Vertex",
      icon: Icons.EXTRUDE,
      toolpath: "mesh.extrude_one_vertex",
      description: "Extrude one vertex",
      inputs: ToolOp.inherit({
        co: new Vec3Property(),
        select: new BoolProperty(true),
        setActive: new BoolProperty(true)
      }),
      outputs: ToolOp.inherit({
        vertex: new IntProperty(-1), //output vertex eid
        edge: new IntProperty(-1) //output edge eid
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
      uiname: "Extrude Regions",
      icon: -1,
      toolpath: "mesh.extrude_regions",
      undoflag: 0,
      flag: 0,
      inputs: ToolOp.inherit({}),
      outputs: {
        normal: new Vec3Property(),
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

      macro.connect(tool, translate, () => {
        translate.inputs.constraint_space.setValue(tool.outputs.normalSpace.getValue());
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

      if (_i == 1) {
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
      if (v.edges.length == 0) {
        mesh.killVertex(v);
      }
    }

    for (let k in vmap) {
      mesh.verts.setSelect(vmap[k], true);
    }

    no.normalize();
    if (no.dot(no) == 0.0) {
      no[2] = 1.0;
    }

    this.outputs.normalSpace.setValue(new Matrix4().makeNormalMatrix(no));
    this.outputs.normal.setValue(no);

    mesh.tessellate();

    mesh.regenRender();
    mesh.regenTesellation();
    window.redraw_viewport();
  }

  exec(ctx) {
    for (let mesh of this.getMeshes(ctx)) {
      this._exec_intern(ctx, mesh);
    }
  }
}

ToolOp.register(ExtrudeRegionsOp);

export class CatmullClarkeSubd extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname: "Subdivide Smooth",
      icon: Icons.SUBDIVIDE,
      toolpath: "mesh.subdivide_smooth",
      undoflag: 0,
      flag: 0,
      inputs: ToolOp.inherit({}),
    }
  }

  exec(ctx) {
    console.log("subdivide smooth!");

    for (let mesh of this.getMeshes(ctx)) {
      console.log("doing mesh", mesh.lib_id);

      subdivide(mesh, list(mesh.faces.selected.editable));
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

      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenTesellation();
      mesh.graphUpdate();
    }
  }
}

ToolOp.register(CatmullClarkeSubd);

export class SubdivideSimple extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname: "Subdivide Simple",
      icon: Icons.SUBDIVIDE,
      toolpath: "mesh.subdivide_simple",
      undoflag: 0,
      flag: 0,
      inputs: ToolOp.inherit({}),
    }
  }

  exec(ctx) {
    console.log("subdivide smooth!");

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

      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenTesellation();
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
      uiname: "Split Edges",
      icon: Icons.SUBDIVIDE,
      toolpath: "mesh.split_edges",
      undoflag: 0,
      flag: 0,
      inputs: ToolOp.inherit({}),
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
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenTesellation();
      mesh.graphUpdate();
    }
  }
}
ToolOp.register(SplitEdgesOp);

export function vertexSmooth(mesh, verts = mesh.verts.selected.editable, fac = 0.5) {
  let cos = {};

  verts = new Set(verts);

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

  for (let v of verts) {
    v.zero();
    let tot = 0.0;

    for (let e of v.edges) {
      let v2 = e.otherVertex(v);

      if (!(v2.eid in cos)) {
        //console.error("Mesh corruption error!!", v, v2, e);
        continue;
      }

      v.add(cos[v2.eid]);
      tot++;
    }

    if (tot === 0.0) {
      v.load(cos[v.eid]);
    } else {
      v.mulScalar(1.0 / tot);
      v.interp(cos[v.eid], 1.0 - fac);
    }

    if ((v.flag & MeshFlags.MIRRORED) && (v.flag & MeshFlags.MIRROR_BOUNDARY)) {
      for (let i=0; i<3; i++) {
        if (sym & (1<<i)) {
          v[i] = 0.0;
        }
      }
    }
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
      uiname: "Vertex Smooth",
      icon: -1,
      toolpath: "mesh.vertex_smooth",
      undoflag: 0,
      flag: 0,
      inputs: ToolOp.inherit({
        repeat : new IntProperty(1)
      }),
    }
  }

  exec(ctx) {
    console.log("smooth!");

    for (let mesh of this.getMeshes(ctx)) {
      let repeat = this.inputs.repeat.getValue();

      console.log("mesh:", mesh.lib_id, repeat);

      for (let i=0; i<repeat; i++) {
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
      uiname: "Test Split Face",
      icon: Icons.TINY_X,
      toolpath: "mesh.test_split_face",
      inputs: ToolOp.inherit(),
      outputs: ToolOp.inherit()
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

      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenTesellation();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(TestSplitFaceOp);


export class TestCollapseOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Test Collapse Edge",
      icon: Icons.TINY_X,
      toolpath: "mesh.test_collapse_edge",
      inputs: ToolOp.inherit(),
      outputs: ToolOp.inherit()
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

      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenTesellation();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(TestCollapseOp);

export class EnsureGridsOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Add/Subdivide Grids",
      toolpath: "mesh.add_or_subdivide_grids",
      icon : Icons.ADD_GRIDS,
      inputs: ToolOp.inherit({
        depth: new IntProperty(2)
      }),
      outputs: ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.ensure_grids");

    let depth = this.inputs.depth.getValue();
    let dimen = gridSides[depth];

    console.log("DIMEN", dimen);

    for (let mesh of this.getMeshes(ctx)) {
      let off = GridBase.meshGridOffset(mesh);

      if (off < 0) {
        console.log("Adding grids to mesh", mesh);

        Grid.initMesh(mesh, dimen, -1)
        //QuadTreeGrid.initMesh(mesh, dimen, -1);
      } else if ((off = mesh.loops.customData.getLayerIndex(QuadTreeGrid)) >= 0){
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

export class SubdivideGridsOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Subdivide Grids",
      toolpath: "mesh.subdivide_grids",
      inputs: ToolOp.inherit({
      }),
      outputs: ToolOp.inherit()
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
      uiname: "Smooth Grids",
      toolpath: "mesh.smooth_grids",
      icon : Icons.SMOOTH_GRIDS,
      inputs: ToolOp.inherit({
        factor : new FloatProperty(0.25).setRange(0.01, 2.0)
      }),
      outputs: ToolOp.inherit()
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

      for (let i=0; i<1; i++) {
        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];

          //grid.recalcFlag |= QRecalcFlags.ALL | QRecalcFlags.NORMALS | QRecalcFlags.LEAVES | QRecalcFlags.NEIGHBORS | QRecalcFlags.POINTHASH;
          //grid.recalcFlag |= QRecalcFlags.LEAF_POINTS | QRecalcFlags.LEAF_NODES;
          //grid.recalcFlag |= QRecalcFlags.ALL | QRecalcFlags.NORMALS | QRecalcFlags.LEAVES | QRecalcFlags.NEIGHBORS;

          grid.update(mesh, l, cd_grid);
        }
      }

      for (let i=0; i<3; i++) {
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

      for (let i=0; i<3; i++) {
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

        for (let i = 1; i <= Math.ceil(depth / 2); i++) {
          mres.flag |= GridSettingFlags.ENABLE_DEPTH_LIMIT;
          mres.depthLimit = i * 2;

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

export class GridsTestOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Grids Debug Test",
      toolpath: "mesh.grids_test",
      icon : Icons.GRIDS_TEST,
      inputs: ToolOp.inherit({
        factor : new FloatProperty(0.25).setRange(0.01, 2.0),
        setColors : new BoolProperty(false)
      }),
      outputs: ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.grids_test");

    let fac = this.inputs.factor.getValue();

    for (let mesh of this.getMeshes(ctx)) {
      let cd_grid = mesh.loops.customData.getLayerIndex(Grid);

      if (cd_grid < 0) {
        continue;
      }

      buildGridsSubSurf(mesh, this.inputs.setColors.getValue());

      mesh.regenBVH();
      mesh.regenTesellation();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}
ToolOp.register(GridsTestOp);

export class DeleteGridsOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Delete Grids",
      icon: Icons.DELETE_GRIDS,
      toolpath: "mesh.delete_grids",
      inputs: ToolOp.inherit({
      }),
      outputs: ToolOp.inherit()
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
      uiname: "Reset Grids",
      icon: Icons.RESET_GRIDS,
      toolpath: "mesh.reset_grids",
      inputs: ToolOp.inherit({
      }),
      outputs: ToolOp.inherit()
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

      for (let l of mesh.loops) {
        let grid = l.customData[off];

        grid.init(grid.dimen, l);
      }

      //force bvh reload
      if (mesh.bvh) {
        mesh.bvh.destroy(mesh);
      }
      mesh.bvh = undefined;

      mesh.regenRender();
      mesh.regenTesellation();
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
      uiname: "Apply Base",
      icon: Icons.APPLY_GRIDS_BASE,
      toolpath: "mesh.apply_grid_base",
      inputs: ToolOp.inherit({
      }),
      outputs: ToolOp.inherit()
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

      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenTesellation();
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
      uiname: "Add Data Layer",
      icon: Icons.SMALL_PLUS,
      toolpath: "mesh.add_cd_layer",
      inputs: ToolOp.inherit({
        elemType : new EnumProperty(MeshTypes.VERTEX, MeshTypes),
        layerType : new StringProperty("uv"),
        name : new StringProperty("")
      }),
      outputs: ToolOp.inherit({
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
        edgeEid : new IntProperty(-1),
        mesh : new DataRefProperty("mesh")
      }),
      outputs: ToolOp.inherit()
    }
  }

  modalStart(ctx) {
    super.modalStart(ctx);
    this.first = true;
  }

  on_mousemove(e) {
    let ctx = this.modal_ctx;
    let view3d = ctx.view3d;

    let mpos = view3d.getLocalMouse(e.x, e.y);
    view3d.resetDrawLines();

    console.log(mpos);
    let ret = FindNearest(ctx, SelMask.EDGE, mpos, view3d);

    if (!ret || ret.length === 0) {
      return;
    }

    console.log(ret[0]);
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

  on_mouseup(e) {
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

    for (let l of loops) {
      let v = mesh.splitEdge(l.e)[1];
      vset.add(v);
      verts.push(v);
    }

    for (let i=0; i<loops.length; i++) {
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

      if (l1 && l2) {
        mesh.splitFace(f, l1, l2);
      }
    }

    mesh.graphUpdate();
    mesh.regenTesellation();
    mesh.regenRender();

    window.redraw_viewport();
  }
}
ToolOp.register(EdgeCutOp);


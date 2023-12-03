import './mesh_loopops.js';
import './mesh_curvature_test.js';

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {
  IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property, Mat4Property, StringProperty,
  PropFlags, PropTypes, PropSubTypes,
  ToolOp, ToolMacro, ToolFlags, UndoFlags, keymap, ToolDef
} from '../path.ux/scripts/pathux.js';
import {TranslateOp} from "../editors/view3d/transform/transform_ops.js";
import * as util from '../util/util.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import {Icons} from '../editors/icon_enum.js';

import {MeshFlags, MeshTypes, MeshFeatures, LogContext} from './mesh_base.js';
import {IMeshUndoData, MeshDeformOp, MeshOp} from './mesh_ops_base.js';
import {ccSmooth, subdivide, loopSubdivide} from '../subsurf/subsurf_mesh.js';
import {splitEdgesPreserveQuads, splitEdgesSimple2, splitEdgesSmart, splitEdgesSmart2} from "./mesh_subdivide.js";
import {GridBase, Grid, gridSides, GridSettingFlags} from "./mesh_grids.js";
import {QuadTreeGrid, QuadTreeFields} from "./mesh_grids_quadtree.js";
import {CDFlags, CustomDataElem} from "./customdata";
import {
  _testMVC,
  bisectMesh, connectVerts, cotanVertexSmooth, dissolveEdgeLoops, dissolveFaces, duplicateMesh, fixManifold,
  flipLongTriangles,
  pruneLooseGeometry,
  recalcWindings,
  symmetrizeMesh,
  trianglesToQuads, triangulateMesh,
  TriQuadFlags, vertexSmooth
} from "./mesh_utils.js";
import {QRecalcFlags} from "./mesh_grids.js";

import {buildGridsSubSurf} from "./mesh_grids_subsurf.js";

import '../util/floathalf.js';
import {CubicPatch, bernstein, bspline} from '../subsurf/subsurf_patch.js';
import {KdTreeGrid} from './mesh_grids_kdtree.js';
import {triangulateFace, setMeshClass, applyTriangulation} from './mesh_tess.js';
import {Edge, Element, Face, Handle, Mesh, Vertex} from './mesh.js';

setMeshClass(Mesh);

export class DeleteOp extends MeshOp<{}, {}> {
  static tooldef(): ToolDef {
    return {
      uiname: "Delete Selected",
      icon: Icons.DELETE,
      toolpath: "mesh.delete_selected",
      inputs: ToolOp.inherit({}),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
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
        let vset = new Set<Vertex>();

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
        let vset = new Set<Vertex>();
        let eset = new Set<Edge>();

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
      mesh.regenTessellation();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(DeleteOp);


export class DeleteOnlyFacesOp extends MeshOp {
  static tooldef(): ToolDef {
    return {
      uiname: "Delete Only Faces",
      icon: Icons.DELETE,
      toolpath: "mesh.delete_only_faces",
      inputs: ToolOp.inherit({}),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext): void {
    console.warn("mesh.delete_only_faces");

    let selectmode = ctx.selectMask;

    for (let mesh of this.getMeshes(ctx)) {
      for (let f of new Set(mesh.faces.selected.editable)) {
        mesh.killFace(f);
      }

      mesh.regenRender();
      mesh.regenUVEditor();
      mesh.regenUVWrangler();
      mesh.regenBVH();
      mesh.regenTessellation();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(DeleteOnlyFacesOp);

export class FlipLongTrisOp extends MeshOp {
  static tooldef(): ToolDef {
    return {
      uiname: "Flip Long Triangles",
      icon: Icons.TRIANGLE_FLIPPER,
      toolpath: "mesh.flip_long_tris",
      inputs: ToolOp.inherit({}),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    console.warn("mesh.delete_selected");

    let selectmode = ctx.selectMask;
    console.log("selectmode:", selectmode);

    for (let mesh of this.getMeshes(ctx)) {

      flipLongTriangles(mesh, mesh.faces.selected.editable);

      mesh.regenBVH();
      mesh.regenRender();
      mesh.regenTessellation();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(FlipLongTrisOp);

export class TriToQuadsOp extends MeshOp<{
  options: FlagProperty
}> {
  static tooldef() {
    return {
      uiname: "Triangles To Quads",
      icon: Icons.TRIS_TO_QUADS,
      toolpath: "mesh.tris_to_quads",
      inputs: ToolOp.inherit({
        options: new FlagProperty(TriQuadFlags.DEFAULT, TriQuadFlags).saveLastValue()
      }),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext): void {
    console.warn("mesh.tris_to_quads");

    for (let mesh of this.getMeshes(ctx)) {
      let fs = new Set(mesh.faces.selected.editable);

      for (let e of mesh.edges.selected.editable) {
        for (let l of e.loops) {
          fs.add(l.f);
        }
      }

      trianglesToQuads(mesh, fs, this.inputs.options.getValue());

      if (this.inputs.options.getValue()) {
        for (let f of mesh.faces.selected.editable) {
          for (let e of f.edges) {
            if (e.flag & MeshFlags.QUAD_EDGE) {
              e.flag |= MeshFlags.DRAW_DEBUG;
            } else {
              e.flag &= ~MeshFlags.DRAW_DEBUG;
            }

            e.flag |= MeshFlags.UPDATE;
            e.v1.flag |= MeshFlags.UPDATE;
            e.v2.flag |= MeshFlags.UPDATE;
          }
        }
      }

      mesh.regenBVH();
      mesh.regenRender();
      mesh.regenTessellation();
      mesh.graphUpdate();
      mesh.recalcNormals();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(TriToQuadsOp);


export class SymmetrizeOp extends MeshOp<{
  axis: EnumProperty,
  side: EnumProperty,
  selectedOnly: BoolProperty,
  threshold: FloatProperty
}> {
  static tooldef() {
    return {
      uiname: "Symmetrize",
      toolpath: "mesh.symmetrize",
      icon: Icons.SYMMETRIZE,
      inputs: ToolOp.inherit({
        axis: new EnumProperty(0, {X: 0, Y: 1, Z: 2})
          .saveLastValue(),
        side: new EnumProperty(1, {LEFT: -1, RIGHT: 1})
          .saveLastValue(),
        selectedOnly: new BoolProperty(false)
          .saveLastValue(),
        threshold: new FloatProperty(0.0001)
          .setRange(0.0, 2.0)
          .noUnits()
          .saveLastValue()
      }),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext): void {
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

      let threshold = this.inputs.threshold.getValue();
      symmetrizeMesh(mesh, fset, axis, side, threshold);

      //force bvh update
      mesh.bvh = undefined;

      mesh.regenTessellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(SymmetrizeOp);


export class BisectOp extends MeshOp<
  {
    axis: EnumProperty,
    side: EnumProperty,
    selectedOnly: BoolProperty
  }
> {
  static tooldef() {
    return {
      uiname: "Bisect Mesh",
      toolpath: "mesh.bisect",
      icon: Icons.BISECT,
      inputs: ToolOp.inherit({
        axis: new EnumProperty(0, {X: 0, Y: 1, Z: 2}),
        side: new EnumProperty(1, {LEFT: -1, RIGHT: 1}),
        selectedOnly: new BoolProperty(false)
      }),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    console.warn("mesh.bisect");

    for (let mesh of this.getMeshes(ctx)) {
      let del = [];

      let fset: Iterable<Face>;

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

      let vs = new Set<Vertex>();

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

      mesh.regenTessellation();
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
      uiname: "Triangulate",
      toolpath: "mesh.triangulate",
      inputs: ToolOp.inherit({}),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext): void {
    console.warn("mesh.triangulate");

    let tri = [0, 0, 0];

    for (let mesh of this.getMeshes(ctx)) {
      let del = [];

      let fs = new Set(mesh.faces.selected.editable);

      let lctx = new LogContext();
      lctx.onnew = (e) => {
        mesh.setSelect(e, true);

        if (e.type === MeshTypes.FACE) {

          for (let l of (e as Face).loops) {
            mesh.setSelect(l.v, true);
            mesh.setSelect(l.e, true);
          }
        }
      }

      for (let f of fs) {
        f.calcNormal();
        applyTriangulation(mesh, f, undefined, undefined, lctx);
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

      mesh.regenTessellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(TriangulateOp);

export const RemeshOpModes = {
  REMESH: 0,
  GEN_CROSSFIELD: 1,
  OPT_CROSSFIELD: 2
};

export class RemeshOp<InputSlots = {}> extends MeshOp<InputSlots & {
  flag: FlagProperty,
  remesher: EnumProperty,
  rakeFactor: FloatProperty,
  relax: FloatProperty,
  origFactor: FloatProperty,
  projection: FloatProperty,
  subdivideFac: FloatProperty,
  collapseFac: FloatProperty,
  goalType: EnumProperty,
  goal: FloatProperty,
  edgeRunPercent: FloatProperty,
  curveSmoothFac: FloatProperty,
  curveSmoothRepeat: IntProperty,
  rakeMode: EnumProperty,
  reproject: BoolProperty,
}> {
  static tooldef(): ToolDef {
    return {
      uiname: "Remesh",
      toolpath: "mesh.remesh",
      inputs: ToolOp.inherit(
        {
          flag: new FlagProperty(DefaultRemeshFlags, RemeshFlags),
          remesher: new EnumProperty(Remeshers.UNIFORM_TRI, Remeshers).saveLastValue(),
          rakeFactor: new FloatProperty(0.5).noUnits().setRange(0.0, 1.0).saveLastValue(),
          relax: new FloatProperty(0.25).noUnits().setRange(0.0, 1.0).saveLastValue(),
          origFactor: new FloatProperty(0.25).noUnits().setRange(0.0, 1.0).saveLastValue(),
          projection: new FloatProperty(0.8).noUnits().setRange(0.0, 1.0).saveLastValue(),
          subdivideFac: new FloatProperty(0.35).noUnits().setRange(0.01, 3.0).saveLastValue(),
          collapseFac: new FloatProperty(0.35).noUnits().setRange(0.01, 1.0).saveLastValue(),
          goalType: new EnumProperty(RemeshGoals.EDGE_AVERAGE, RemeshGoals).saveLastValue(),
          goal: new FloatProperty(1.0).noUnits().setRange(0, 1024 * 1024 * 32).saveLastValue(),
          edgeRunPercent: new FloatProperty(0.5).setRange(0.001, 1).noUnits().saveLastValue(),
          curveSmoothFac: new FloatProperty(0.0).noUnits().setRange(0.0, 1.0).saveLastValue(),
          curveSmoothRepeat: new IntProperty(4).noUnits().setRange(0, 50).saveLastValue(),
          rakeMode: new EnumProperty(RakeModes.CURVATURE, RakeModes).saveLastValue(),
          reproject: new BoolProperty(false).saveLastValue(),
        }
      ),
      outputs: ToolOp.inherit({})
    }
  }

  remesher?: Remesher;

  makeRemesher(ctx: ToolContext, mesh: Mesh, lctx: LogContext): Remesher {
    let goalType = this.inputs.goalType.getValue()
    let goalValue = this.inputs.goal.getValue()
    let rakeFactor = this.inputs.rakeFactor.getValue();
    let relax = this.inputs.relax.getValue();
    let origFactor = this.inputs.origFactor.getValue();
    let subdFac = this.inputs.subdivideFac.getValue();
    let collFac = this.inputs.collapseFac.getValue();
    let project = this.inputs.projection.getValue();
    let count = this.inputs.edgeRunPercent.getValue();
    let curveSmoothRepeat = this.inputs.curveSmoothRepeat.getValue();
    let curveSmoothFac = this.inputs.curveSmoothFac.getValue();
    let reproject = this.inputs.reproject.getValue();

    count = Math.ceil(mesh.edges.length * count);

    fixManifold(mesh, lctx);
    let cls = RemeshMap[this.inputs.remesher.getValue()];

    let remesher = new cls(mesh, lctx, goalType, goalValue);

    remesher.origFactor = origFactor;
    remesher.reproject = reproject;
    remesher.rakeMode = this.inputs.rakeMode.getValue();
    remesher.subdFac = subdFac;
    remesher.collFac = collFac;
    remesher.relax = relax;
    remesher.projection = project;
    remesher.rakeFactor = rakeFactor;
    remesher.flag = this.inputs.flag.getValue();
    remesher.smoothCurveRepeat = curveSmoothRepeat;
    remesher.smoothCurveFac = curveSmoothFac;

    remesher.start(count);

    return remesher;
  }

  exec(ctx: ToolContext) {
    console.warn("mesh.remesh");

    let tri = [0, 0, 0];

    for (let mesh of this.getMeshes(ctx)) {
      let lctx = new LogContext();

      lctx.onnew = (e) => {
        mesh.setSelect(e, true);
        if (e.type === MeshTypes.FACE) {
          for (let l of (e as Face).loops) {
            mesh.setSelect(l.v, true);
            mesh.setSelect(l.e, true);
          }
        }
      }

      let remesher = this.makeRemesher(ctx, mesh, lctx);
      let i = 0;

      while (!remesher.done && i++ < 5) {
        remesher.step();
      }

      remesher.finish();

      mesh.regenTessellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(RemeshOp);

export class InteractiveRemeshOp extends RemeshOp<{
  steps: IntProperty,
  mode: EnumProperty
}> {
  static tooldef(): ToolDef {
    return {
      uiname: "Remesh (Interactive)",
      toolpath: "mesh.interactive_remesh",
      inputs: ToolOp.inherit({
        steps: new IntProperty(5).private(),
        mode: new EnumProperty(RemeshOpModes.REMESH, RemeshOpModes)
      }),
      outputs: ToolOp.inherit({}),
      is_modal: true
    }
  }

  _redo?: {
    [k: string]: IMeshUndoData
  };
  lctx?: LogContext;
  last_time = 0;

  redo(ctx: ToolContext) {
    let undo = this._undo;

    this._undo = this._redo;
    this._redo = undefined;

    super.undo(ctx);

    this._undo = undo;
  }

  undo(ctx: ToolContext) {
    let undo = this._undo;

    this.undoPre(ctx);
    this._redo = this._undo;
    this._undo = undo;

    super.undo(ctx);
  }

  makeLogCtx(ctx: ToolContext, mesh: Mesh): LogContext {
    let lctx = new LogContext();

    lctx.onnew = (e: Element, tag?: any) => {
      /*
      mesh.setSelect(e, true);

      if (e.type === MeshTypes.FACE) {
        for (let l of (e as Face).loops) {
          mesh.setSelect(l.v, true);
          mesh.setSelect(l.e, true);
        }
      }
      */
    }

    return lctx;
  }

  on_mousedown(e: MouseEvent): void {
    this.modalEnd(false);
  }

  on_mouseup(e: MouseEvent): void {
    this.modalEnd(false);
  }

  modalEnd(wasCancelled?: boolean): void {
    this.remesher.finish();

    //prevent reference leaks
    this.remesher = undefined;
    this.lctx = undefined;

    let mesh = this.modal_ctx.mesh;
    if (mesh) {
      for (let v of mesh.verts) {
        v.flag |= MeshFlags.UPDATE;
      }
      mesh.regenAll();
      mesh.recalcNormals();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    }

    super.modalEnd(false)
  }

  modalStart(ctx: ToolContext): void {
    let mesh = ctx.mesh;

    mesh.compact();

    this.lctx = this.makeLogCtx(ctx, mesh)
    this.remesher = this.makeRemesher(ctx, mesh, this.lctx);
    (this.remesher as unknown as any).minEdges = -1;

    this.last_time = util.time_ms();

    return super.modalStart(ctx);
  }

  on_tick() {
    if (util.time_ms() - this.last_time < 50) {
      return;
    }

    let mesh = this.modal_ctx.mesh;

    let time = util.time_ms();
    while (this.remesher && util.time_ms() - time < 50 && !this.remesher.done) {
      let i = this.inputs.steps.getValue();
      this.inputs.steps.setValue(i + 1);

      this._step(this.modal_ctx, this.remesher, mesh, this.lctx);
    }

    if (!this.remesher) {
      this.modalEnd();
    }

    mesh.regenAll();
    mesh.graphUpdate();

    this.last_time = util.time_ms();
    window.redraw_viewport(true);
  }

  _step(ctx: ToolContext, remesher: Remesher, mesh: Mesh, lctx: LogContext): void {

    switch (this.inputs.mode.getValue()) {
      case RemeshOpModes.REMESH:
        remesher.step();
        break;
      case RemeshOpModes.GEN_CROSSFIELD:
        (remesher as unknown as any).solveRakeDirections();
        break;
      case RemeshOpModes.OPT_CROSSFIELD:
        (remesher as unknown as any).propRakeDirections();
        break;
    }
  }

  exec(ctx: ToolContext): void {
    let mesh = ctx.mesh;
    let lctx = this.makeLogCtx(ctx, mesh);

    mesh.compact();

    let remesher = this.makeRemesher(ctx, mesh, lctx);

    let steps = this.inputs.steps.getValue();

    for (let i = 0; i < steps; i++) {
      this._step(ctx, remesher, mesh, lctx);
    }

    remesher.finish();

    mesh.regenAll();
    mesh.recalcNormals();
    mesh.graphUpdate();
    window.redraw_viewport();
  }
}

ToolOp.register(InteractiveRemeshOp);

export class LoopSubdOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Subdivide Smooth (Loop)",
      toolpath: "mesh.subdivide_smooth_loop",
      inputs: ToolOp.inherit({}),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    console.warn("mesh.subdivide_smooth_loop");

    let tri = [0, 0, 0];

    for (let mesh of this.getMeshes(ctx)) {
      let del = [];

      loopSubdivide(mesh, mesh.faces.selected.editable);

      mesh.regenTessellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(LoopSubdOp);


import {meshSubdivideTest} from './mesh_subdivide.js';
import {UVWrangler, voxelUnwrap} from './unwrapping.js';
import {relaxUVs, fixSeams, UnWrapSolver} from './unwrapping_solve.js';
import {MeshOpBaseUV, UnwrapOpBase} from './mesh_uvops_base.js';
import {MultiGridSmoother} from './multigrid_smooth.js';
import {
  cleanupQuads,
  cleanupTris,
  DefaultRemeshFlags,
  RakeModes,
  Remesher,
  Remeshers,
  RemeshFlags,
  RemeshGoals,
  RemeshMap,
  remeshMesh,
  UniformTriRemesher
} from './mesh_remesh.js';

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
      outputs: ToolOp.inherit({}),
    }
  }

  exec(ctx: ToolContext) {
    console.log("subdivide smooth!");

    for (let mesh of this.getMeshes(ctx)) {
      console.log("doing mesh", mesh.lib_id);

      subdivide(mesh, new Set(mesh.faces.selected.editable));

      mesh.regenRender();
      mesh.regenTessellation();

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

      mesh.regenTessellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
      mesh.regenBVH();
    }
  }
}

ToolOp.register(CatmullClarkeSubd);

export const SymFlags = {
  X: 1,
  Y: 2,
  Z: 4,
  AUTO: 512
};

export class MeshSnapToMirror extends MeshOp<{
  symFlag: FlagProperty
}> {
  constructor() {
    super();
  }

  static tooldef(): ToolDef {
    return {
      uiname: "Snap Verts To Mirror Line",
      icon: -1,
      toolpath: "mesh.snap_to_mirror_axis",
      inputs: ToolOp.inherit({
        symFlag: new FlagProperty(SymFlags.AUTO, SymFlags)
      })
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      let axes = this.inputs.symFlag.getValue();

      if (axes & SymFlags.AUTO) {
        axes = mesh.symFlag;

        //check sculpt toolmode's symmetry settings too
        for (let mode of ctx.scene.toolmodes) {
          if (mode.constructor === BVHToolMode) {
            axes |= mode.symmetryAxes;
          }
        }
      }

      console.log("axes", axes);

      for (let v of mesh.verts.selected.editable) {
        let minaxis;
        let mindis;

        for (let i = 0; i < 3; i++) {
          if (!(axes & (1 << i))) {
            continue;
          }

          if (minaxis === undefined || Math.abs(v[i]) < mindis) {
            minaxis = i;
            mindis = Math.abs(v[i]);
          }
        }

        //console.log("minaxis", minaxis, v);

        if (minaxis !== undefined) {
          v[minaxis] = 0.0;
          v.flag |= MeshFlags.UPDATE;
        }
      }

      mesh.regenBVH();
      mesh.regenRender();
      mesh.recalcNormals();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(MeshSnapToMirror);

export class MeshSubdTest extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname: "Test Subdiv Reversing",
      icon: Icons.SUBDIVIDE,
      toolpath: "mesh.subdiv_test",
      undoflag: 0,
      flag: 0,
      inputs: ToolOp.inherit({}),
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      meshSubdivideTest(mesh);

      mesh.graphUpdate();
      mesh.regenTessellation();
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
      uiname: "Subdivide Simple",
      icon: Icons.SUBDIVIDE,
      toolpath: "mesh.subdivide_simple",
      undoflag: 0,
      flag: 0,
      inputs: ToolOp.inherit({}),
    }
  }

  exec(ctx: ToolContext) {
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

        e.v1.flag |= MeshFlags.UPDATE;
        e.v2.flag |= MeshFlags.UPDATE;

        let ret = mesh.splitEdge(e, 0.5);

        if (ret.length > 0) {
          vs.add(ret[1]);
          mesh.setSelect(ret[0], true);
          mesh.setSelect(ret[1], true);
        }
      }

      mesh.regenTessellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenBVH();
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

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      mesh.updateMirrorTags();

      let es = new Set(mesh.edges.selected.editable);

      for (let e of es) {
        mesh.splitEdge(e);
      }

      mesh.regenBVH();
      mesh.regenTessellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }
  }
}

ToolOp.register(SplitEdgesOp);

export function vertexSmooth_tst(mesh: Mesh, vertsInput = mesh.verts.selected.editable, fac = 0.5) {
  const verts = new Set<Vertex>(vertsInput);

  if (1) {
    let faces = new Set();

    for (let v of verts) {
      for (let f of v.faces) {
        faces.add(f);
      }
    }

    let ret = subdivide(mesh, faces, true);
    for (let v of (ret.newVerts as unknown as Iterable<Vertex>)) {
      verts.add(v);
    }

    mesh.regenRender();
    mesh.regenTessellation();
  }

  for (let i = 0; i < 5; i++) {
    vertexSmooth(mesh, verts, fac);
  }
}

export function ccVertexSmooth(mesh: Mesh,
                               vertsInput = mesh.verts.selected.editable,
                               fac = 0.5,
                               projection = 0.0): void {
  const verts = new Set<Vertex>(vertsInput);

  let cd_fset = getFaceSets(mesh, false);
  let cd_dyn_vert = getDynVerts(mesh);

  if (1) {
    let cos = new Map();

    for (let v of verts) {
      cos.set(v, new Vector3(ccSmooth(v, cd_fset, cd_dyn_vert, projection)));
    }

    for (let [v, co] of cos) {
      v.co.interp(co, fac);
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
    v.co.zero();
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
      v.co.addFac(cos[v2.eid], w);
      tot += w;
    }

    if (tot === 0.0) {
      v.co.load(cos[v.eid]);
    } else {
      v.co.mulScalar(1.0 / tot);
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

      v.co.interp(cos[v.eid], 1.0 - fac);
    }

    if ((v.flag & MeshFlags.MIRRORED) && (v.flag & MeshFlags.MIRROR_BOUNDARY)) {
      for (let i = 0; i < 3; i++) {
        if (sym & (1 << i)) {
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
    mesh.regenTessellation();
  }

  for (let v of verts) {
    //mesh.flagElemUpdate(v);
    v.flag |= MeshFlags.UPDATE;
  }
}

export const SmoothTypes = {
  CC: 1,
  COTAN: 2,
  UNIFORM: 4
};

export class SmoothCurvaturesOp extends MeshDeformOp<{
  repeat: IntProperty,
  projection: FloatProperty,
  factor: FloatProperty,
}> {
  constructor() {
    super();
  }


  static tooldef(): ToolDef {
    return {
      uiname: "Smooth Curvatures",
      icon: Icons.SCULPT_SMOOTH,
      toolpath: "mesh.smooth_curvature_directions",
      undoflag: 0,
      flag: 0,
      inputs: ToolOp.inherit({
        repeat: new IntProperty(1).saveLastValue().noUnits().setRange(1, 256),
        projection: new FloatProperty(0.0).saveLastValue().setRange(0.0, 1.0).noUnits(),
        factor: new FloatProperty(0.5).saveLastValue().setRange(0.0, 1.0).noUnits()
      }),
    }
  }

  exec(ctx: ToolContext) {
    let fac = this.inputs.factor.getValue();
    let repeat = this.inputs.repeat.getValue();
    let proj = this.inputs.projection.getValue();

    for (let mesh of this.getMeshes(ctx)) {
      let cd_curv = getCurveVerts(mesh);

      for (let i = 0; i < repeat; i++) {
        smoothCurvatures(mesh, mesh.verts.selected.editable, fac, proj);
      }

      mesh.regenRender();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(SmoothCurvaturesOp);

export class MarkSingularitiesOp extends MeshOp {
  static tooldef() {
    return {
      uiname: 'Mark Singularity',
      toolpath: 'mesh.mark_singularity',
      inputs: ToolOp.inherit({}),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      for (let v of mesh.verts.selected.editable) {
        v.flag |= MeshFlags.SINGULARITY | MeshFlags.UPDATE;
      }

      mesh.regenRender();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(MarkSingularitiesOp);


export class UnmarkSingularitiesOp extends MeshOp {
  static tooldef() {
    return {
      uiname: 'Unmark Singularity',
      toolpath: 'mesh.unmark_singularity',
      inputs: ToolOp.inherit({}),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      for (let v of mesh.verts.selected.editable) {
        v.flag &= ~MeshFlags.SINGULARITY;
        v.flag |= MeshFlags.UPDATE;
      }

      mesh.regenRender();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(UnmarkSingularitiesOp);

export class RelaxRakeUVCells extends MeshOp {
  static tooldef() {
    return {
      uiname: "Relax Rake Cells",
      toolpath: "mesh.relax_rake_uv_cells",
      inputs: ToolOp.inherit({}),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    let mesh = ctx.mesh;

    let cd_curv = getCurveVerts(mesh);
    //let remesh = new UniformTriRemesher(mesh);
    let cd_fset = getFaceSets(mesh, false);

    for (let v of mesh.verts) {//.selected.editable) {
      let cv = v.customData[cd_curv];

      //cv.check(v, -1, undefined, cd_fset);

      cv._blendStep(v, -1, cd_fset);
      cv.relaxUvCells(v, cd_curv);
      v.flag |= MeshFlags.UPDATE;
    }

    for (let v of mesh.verts) {//.verts.selected.editable) {
      let cv = v.customData[cd_curv];
      cv._ignoreUpdate(v, -1);
    }

    mesh.regenRender();
    mesh.recalcNormals();
    window.redraw_viewport(true);
  }
}

ToolOp.register(RelaxRakeUVCells);

export class VertexSmooth extends MeshDeformOp<{
  repeat: IntProperty,
  type: EnumProperty,
  projection: FloatProperty,
  factor: FloatProperty
}> {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname: "Vertex Smooth",
      icon: Icons.SCULPT_SMOOTH,
      toolpath: "mesh.vertex_smooth",
      undoflag: 0,
      flag: 0,
      inputs: ToolOp.inherit({
        repeat: new IntProperty(1).saveLastValue().noUnits().setRange(1, 256),
        type: new EnumProperty(1, SmoothTypes).saveLastValue(),
        projection: new FloatProperty(0.0).saveLastValue().setRange(0.0, 1.0).noUnits(),
        factor: new FloatProperty(0.5).saveLastValue().setRange(0.0, 1.0).noUnits()
      }),
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      let repeat = this.inputs.repeat.getValue();

      let fac = this.inputs.factor.getValue();
      let proj = this.inputs.projection.getValue();

      let mirrorvs = new Set<Vertex>();

      for (let v of mesh.verts.selected.editable) {
        v.flag |= MeshFlags.UPDATE;

        if (v.flag & MeshFlags.MIRROR_BOUNDARY) {
          mirrorvs.add(v);
        }
      }

      for (let i = 0; i < repeat; i++) {
        switch (this.inputs.type.getValue()) {
          case SmoothTypes.CC:
            ccVertexSmooth(mesh, mesh.verts.selected.editable, fac, proj);
            break;
          case SmoothTypes.COTAN:
            cotanVertexSmooth(mesh, mesh.verts.selected.editable, fac, proj);
            break;
          case SmoothTypes.UNIFORM:
            vertexSmooth(mesh, mesh.verts.selected.editable, fac, proj);
            break;
        }

        for (let v of mirrorvs) {
          if (v.flag & MeshFlags.MIRROREDX) {
            v[0] = 0.0;
          }

          if (v.flag & MeshFlags.MIRROREDY) {
            v[1] = 0.0;
          }

          if (v.flag & MeshFlags.MIRROREDZ) {
            v[2] = 0.0;
          }
        }
      }

      mesh.regenTessellation();
      mesh.recalcNormals();

      mesh.regenRender();
      mesh.regenElementsDraw();

      mesh.graphUpdate();
    }
  }
}

ToolOp.register(VertexSmooth);

let SplitMethods = {
  SMART1: 0,
  SMART2: 1,
  SIMPLE: 2
}

export class TestSplitFaceOp extends MeshOp<{
  method: EnumProperty
}> {
  static tooldef() {
    return {
      uiname: "Split Edges (smart)",
      //icon    : Icons.SPLIT_EDGE,
      toolpath: "mesh.split_edges_smart",
      inputs: ToolOp.inherit({
        method: new EnumProperty(SplitMethods.SMART2, SplitMethods).saveLastValue()
      }),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    console.warn("mesh.test_split_face");

    for (let mesh of this.getMeshes(ctx)) {
      let vs = new Set();
      let es = new Set();

      /*
      for (let v of vs) {
        for (let e of v.edges) {
          if (vs.has(e.otherVertex(v))) {
            es.add(e);
          }
        }
      }*/

      es = new Set(mesh.edges.selected.editable);

      let lctx = new LogContext();

      lctx.onnew = (e) => {
        mesh.setSelect(e, true);

        if (e.type === MeshTypes.FACE) {
          for (let l of (e as Face).loops) {
            l.v.flag |= MeshFlags.UPDATE;
            l.e.flag |= MeshFlags.UPDATE;

            mesh.setSelect(l.e, true);
            mesh.setSelect(l.v, true);
          }
        } else if (e instanceof Edge) {
          e.v1.flag |= MeshFlags.UPDATE;
          e.v2.flag |= MeshFlags.UPDATE;

          mesh.setSelect(e.v1, true);
          mesh.setSelect(e.v2, true);

          for (let l2 of e.loops) {
            mesh.setSelect(l2.f, true);
          }
        }

        e.flag |= MeshFlags.UPDATE;
      }

      let method = this.inputs.method.getValue();

      switch (method) {
        case SplitMethods.SMART1:
          splitEdgesSmart(mesh, es, lctx);
          break;
        case SplitMethods.SMART2:
          splitEdgesSmart2(mesh, es, undefined, lctx);
          break;
        case SplitMethods.SIMPLE:
          splitEdgesSimple2(mesh, es, undefined, lctx);
          break;
      }
      //splitEdgesPreserveQuads(mesh, es, undefined, lctx);

      //console.log(newvs, newfs);

      mesh.regenTessellation();
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
      uiname: "Test Collapse Edge",
      icon: Icons.TINY_X,
      toolpath: "mesh.test_collapse_edge",
      inputs: ToolOp.inherit({}),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    console.warn("mesh.test_collapse_edge");

    for (let mesh of this.getMeshes(ctx)) {
      let vs = new Set<Vertex>();
      let es = new Set<Edge>();

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

      mesh.regenTessellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(TestCollapseOp);

let GridTypes = {
  SIMPLE: 0,
  QUADTREE: 1,
  KDTREE: 2
};

export class EnsureGridsOp extends MeshOp<{
  depth: IntProperty,
  types: EnumProperty,
}> {
  static tooldef() {
    return {
      uiname: "Add/Subdivide Grids",
      toolpath: "mesh.add_or_subdivide_grids",
      icon: Icons.ADD_GRIDS,
      inputs: ToolOp.inherit({
        depth: new IntProperty(4),
        types: new EnumProperty(GridTypes.SIMPLE, GridTypes)
      }),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
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
          let grid = l.customData[off] as unknown as Grid;
          grid.update(mesh, l, off);
        }

        for (let l of mesh.loops) {
          let grid = l.customData[off] as unknown as QuadTreeGrid;

          grid.subdivideAll(mesh, l, off);
          grid.stripExtraData();
        }

        for (let l of mesh.loops) {
          let grid = l.customData[off] as unknown as Grid;
          grid.update(mesh, l, off);
        }
      }

      mesh.regenBVH();
      mesh.regenTessellation();
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
      inputs: ToolOp.inherit({}),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    console.warn("mesh.subdivide_grids");

    for (let mesh of this.getMeshes(ctx)) {
      let cd_grid = mesh.loops.customData.getLayerIndex(QuadTreeGrid);

      if (cd_grid >= 0) {
        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid] as unknown as QuadTreeGrid;

          grid.update(mesh, l, cd_grid);
          grid.subdivideAll(mesh, l, cd_grid);
          grid.update(mesh, l, cd_grid);
        }
      }

      mesh.regenBVH();
      mesh.regenTessellation();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(SubdivideGridsOp);


export class SmoothGridsOp extends MeshOp<{
  factor: FloatProperty
}> {
  static tooldef() {
    return {
      uiname: "Smooth Grids",
      toolpath: "mesh.smooth_grids",
      icon: Icons.SMOOTH_GRIDS,
      inputs: ToolOp.inherit({
        factor: new FloatProperty(0.25).setRange(0.01, 2.0)
      }),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    console.warn("mesh.smooth_grids");

    let fac = this.inputs.factor.getValue();

    function doSmooth(mesh: Mesh, cd_grid: number) {
      for (let i = 0; i < 1; i++) {
        for (let l of mesh.loops) {
          let grid = l.customData.get<Grid>(cd_grid);

          //grid.recalcFlag |= QRecalcFlags.ALL | QRecalcFlags.NORMALS | QRecalcFlags.LEAVES | QRecalcFlags.NEIGHBORS | QRecalcFlags.POINTHASH;
          //grid.recalcFlag |= QRecalcFlags.LEAF_POINTS | QRecalcFlags.LEAF_NODES;
          //grid.recalcFlag |= QRecalcFlags.ALL | QRecalcFlags.NORMALS | QRecalcFlags.LEAVES | QRecalcFlags.NEIGHBORS;

          grid.update(mesh, l, cd_grid);
        }
      }

      for (let i = 0; i < 3; i++) {
        for (let l of mesh.loops) {
          let grid = l.customData.get<QuadTreeGrid>(cd_grid);
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
          let grid = l.customData.get<QuadTreeGrid>(cd_grid);
          grid.stitchBoundaries();
        }
      }

      for (let l of mesh.loops) {
        let grid = l.customData.get<Grid>(cd_grid);
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
          let grid = l.customData.get<QuadTreeGrid>(cd_grid);
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
      mesh.regenTessellation();
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

export class GridsTestOp2 extends MeshOp<{
  factor: FloatProperty,
  setColors: BoolProperty
}> {
  static tooldef(): ToolDef {
    return {
      uiname: "Grid Test 2",
      toolpath: "mesh.grids_test",
      icon: Icons.GRIDS_TEST,
      inputs: ToolOp.inherit({
        factor: new FloatProperty(0.25).setRange(0.01, 2.0),
        setColors: new BoolProperty(false)
      }),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
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

export class GridsTestOp extends MeshOp<{
  factor: FloatProperty,
  setColors: BoolProperty,
}> {
  static tooldef() {
    return {
      uiname: "Grids Debug Test",
      toolpath: "mesh.grids_test2",
      icon: Icons.GRIDS_TEST,
      inputs: ToolOp.inherit({
        factor: new FloatProperty(0.25).setRange(0.01, 2.0),
        setColors: new BoolProperty(false)
      }),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    console.warn("mesh.grids_test");

    let fac = this.inputs.factor.getValue();

    /*XXX*/
    let view3d = ctx.state.ctx.view3d;
    view3d.resetDrawLines();

    function makeDrawLine(a, b, color) {
      if (!("dd" in window)) {
        return view3d.makeDrawLine(a, b, color);
      }
    }

    const QPOINT1 = QuadTreeFields.QPOINT1;
    const QPARENT = QuadTreeFields.QPARENT;
    const QDEPTH = QuadTreeFields.QDEPTH;
    const QSUBTREE_DEPTH = QuadTreeFields.QSUBTREE_DEPTH;
    const QMINU = QuadTreeFields.QMINU;
    const QMINV = QuadTreeFields.QMINV;
    const QMAXU = QuadTreeFields.QMAXU;
    const QMAXV = QuadTreeFields.QMAXV;

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
          let dt = 1.0 / dimen;

          let uv = p.uv;

          for (let off of staroffs) {
            let u = uv[0] + off[0] * dt;
            let v = uv[1] + off[1] * dt;

            let co2 = grid.evaluate(u, v);
            co.add(co2);
            tot++;
          }

          if (tot) {
            co.mulScalar(1.0 / tot);
            co.interp(p.orig, 1.0 / 2.0);
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
            let u = x / 3;

            for (let y = 0; y < 4; y++) {
              let v = y / 3;

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

          let d = 1.0 / 3.0; //window.d2 ?? 1.0 / 3.0;
          let d2 = 0.0; //window.d3 ?? 0.0;

          let dfac = 1.0 / Math.pow(2, depth);

          function gt(p) {
            return new Vector3(p).mulScalar(dfac);
          }

          function gn(p1, p2, t) {
            let n = new Vector3();

            let l = p1.vectorDistance(p2) * d2;
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

          /*
          function sinterp(v2, t) {
            let l1 = v1.vectorLength();
            let l2 = v2.vectorLength();

            v1.interp(v2, t).normalize().mulScalar(l1 + (l2 - l1) * t);
            return v1;
          }

          Vector3.prototype.sinterp = sinterp;
          */

          if (!disable) {
            for (let i = 0; i < 2; i++) {
              let t = (i + 1.0) / 3.0;

              let mul2 = l1 + (l3 - l1) * t;
              let mul1 = l2 + (l4 - l2) * t;

              //mul1 = -mul1;

              mul1 *= d;
              mul2 *= d;

              //let mul3 = (mul1+mul2)*0.5 * (window.d3 || 1.0);
              let mul3 = mul1 * mul2 * d2;
              let mul4 = mul2 * mul1 * d2;

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


            /*
            let ww = window.d5 ?? 0.0;
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

              let u = (uv[0] - ns[ni2 + QMINU]) / (ns[ni2 + QMAXU] - ns[ni2 + QMINU]);
              let v = (uv[1] - ns[ni2 + QMINV]) / (ns[ni2 + QMAXV] - ns[ni2 + QMINV]);

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

          /*
          for (let pi of grid.getLeafPoints()) {
            let p = grid.points[pi];

            //p1.load(p).sub(p.sco);
            //p.addFac(p1, 0.5);
            p.load(p.sco);
          }
          */

        }

        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];
          grid.recalcFlag |= QRecalcFlags.ALL;
          grid.update(mesh, l, cd_grid);
        }
      }

      mesh.regenBVH();
      mesh.regenTessellation();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }

  undo(ctx: ToolContext) {
    super.undo(ctx);

    let view3d = ctx.state.ctx.view3d as unknown as View3D;
    if (view3d) {
      view3d.resetDrawLines();
    }
  }
}

ToolOp.register(GridsTestOp);

export class DeleteGridsOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Delete Grids",
      icon: Icons.DELETE_GRIDS,
      toolpath: "mesh.delete_grids",
      inputs: ToolOp.inherit({}),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
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
      mesh.regenTessellation();
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
      inputs: ToolOp.inherit({}),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
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
        let grid = l.customData.get<Grid>(off);

        grid.init(grid.dimen, mesh, l, off);
      }

      //force bvh reload
      if (mesh.bvh) {
        mesh.bvh.destroy(mesh);
      }
      mesh.bvh = undefined;

      mesh.regenTessellation();
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
      uiname: "Apply Base",
      icon: Icons.APPLY_GRIDS_BASE,
      toolpath: "mesh.apply_grid_base",
      inputs: ToolOp.inherit({}),
      outputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    console.warn("mesh.apply_grid_base");

    for (let mesh of this.getMeshes(ctx)) {
      let off = GridBase.meshGridOffset(mesh);
      if (off < 0) {
        continue;
      }

      for (let l of mesh.loops) {
        let grid = l.customData.get<Grid>(off);

        grid.applyBase(mesh, l, off);
      }

      //force bvh reload
      if (mesh.bvh) {
        mesh.bvh.destroy(mesh);
      }
      mesh.bvh = undefined;

      mesh.regenTessellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(ApplyGridBaseOp);

export class AddCDLayerOp extends MeshOp<{
  elemType: EnumProperty,
  layerType: StringProperty,
  name: StringProperty
}, {
  layerIndex: IntProperty
}> {
  static tooldef() {
    return {
      uiname: "Add Data Layer",
      icon: Icons.SMALL_PLUS,
      toolpath: "mesh.add_cd_layer",
      inputs: ToolOp.inherit({
        elemType: new EnumProperty(MeshTypes.VERTEX, MeshTypes),
        layerType: new StringProperty("uv"),
        name: new StringProperty("")
      }),
      outputs: ToolOp.inherit({
        layerIndex: new IntProperty(-1)
      })
    }
  }

  exec(ctx: ToolContext) {
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
        ctx.error("Unknown layer type " + this.inputs.layerType.getValue());
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


export class RemCDLayerOp extends MeshOp<{
  elemType: EnumProperty,
  layerType: StringProperty,
  name: StringProperty,
}> {
  static tooldef() {
    return {
      uiname: "Remove Data Layer",
      icon: Icons.SMALL_PLUS,
      toolpath: "mesh.remove_cd_layer",
      inputs: ToolOp.inherit({
        elemType: new EnumProperty(MeshTypes.VERTEX, MeshTypes),
        layerType: new StringProperty("uv"),
        name: new StringProperty("")
      })
    }
  }

  exec(ctx: ToolContext) {
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
        ctx.error("Unknown layer type " + this.inputs.layerType.getValue());
        continue;
      }

      let off = elist.customData.getLayerIndex(typecls);

      if (off < 0) {
        ctx.error("no cd layers");
        continue;
      }

      elist.removeCustomDataLayer(off);

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
      uiname: "Test MultiGrid Smoother",
      toolpath: "mesh.test_multigrid_smooth",
      inputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
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

      let supers = ms.getSuperVerts(mesh.verts) as Set<Vertex>;

      ms.smooth(supers as unknown as any[], (v: Vertex): number => {
        return 1.0; //XXX
        /*
        if (v.flag & MeshFlags.SELECT) {
          return 1.0;
        }

        return 0.0;
        */
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

export class FixNormalsOp extends MeshOp<{
  outside: BoolProperty
}> {
  static tooldef() {
    return {
      uiname: "Recalc Normals",
      toolpath: "mesh.fix_normals",
      inputs: ToolOp.inherit({
        outside: new BoolProperty(true)
      })
    }
  }

  exec(ctx: ToolContext) {
    console.log("mesh.test_multigrid_smooth()");

    for (let mesh of this.getMeshes(ctx)) {
      recalcWindings(mesh, mesh.faces.selected.editable);

      if (!this.inputs.outside.getValue()) {
        for (let f of mesh.faces.selected.editable) {
          mesh.reverseWinding(f);
        }
      }

      mesh.regenTessellation();
      mesh.recalcNormals();
      mesh.regenElementsDraw();
      mesh.regenRender();
      mesh.graphUpdate();
    }

    window.redraw_viewport(true);
  }
}

ToolOp.register(FixNormalsOp);


export class FixManifoldOp extends MeshOp<{
  fixLooseGeometry: BoolProperty,
  minIslandVerts: IntProperty,
}> {
  static tooldef() {
    return {
      uiname: "Fix Manifold",
      description: "Fix manifold errors (except for holes)",
      toolpath: "mesh.fix_manifold",
      inputs: ToolOp.inherit({
        fixLooseGeometry: new BoolProperty(true).saveLastValue(),
        minIslandVerts: new IntProperty(5).noUnits().setRange(0, 1024 * 16).setStep(5).saveLastValue()
      })
    }
  }

  exec(ctx: ToolContext) {
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

      return v - e + f - (l - f) - 2 * (s - g);
    }

    for (let mesh of this.getMeshes(ctx)) {
      mesh.validateMesh();

      console.log("euler-poincare:", calcEulerPoincare(mesh));

      let lctx = new LogContext();

      lctx.onnew = (e) => {
        mesh.setSelect(e, true);

        if (e.type === MeshTypes.FACE) {
          for (let l of (e as Face).loops) {
            mesh.setSelect(l.v, true);
            mesh.setSelect(l.e, true);
          }
        }
      }

      for (let i = 0; i < 1000; i++) {
        if (!fixManifold(mesh, lctx)) {
          break;
        }
      }

      if (this.inputs.fixLooseGeometry.getValue()) {
        let minverts = this.inputs.minIslandVerts.getValue();
        pruneLooseGeometry(mesh, lctx, minverts);
      }

      recalcWindings(mesh, mesh.faces, lctx);

      mesh.fixLoops();

      console.log("euler-poincare:", calcEulerPoincare(mesh));

      mesh.regenBVH();
      mesh.regenTessellation();
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
  static tooldef() {
    return {
      uiname: "Connect Verts",
      toolpath: "mesh.connect_verts",
      inputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      let vs = util.list(mesh.verts.selected.editable);

      if (vs.length === 2) {
        let v1 = vs[0], v2 = vs[1];

        connectVerts(mesh, v1, v2);
        let e = mesh.getEdge(v1, v2);

        if (e) {
          mesh.setSelect(e, true);
        }
      }

      //mesh.selectFlush();

      mesh.regenBVH();
      mesh.regenTessellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.graphUpdate();
    }
  }
}

ToolOp.register(ConnectVertsOp);

export class DissolveVertOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Dissolve Vertices",
      toolpath: "mesh.dissolve_verts",
      inputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      let vs = new Set(mesh.verts.selected.editable);
      if (vs.size === 0) {
        continue;
      }

      let lctx = new LogContext();
      lctx.onnew = (e) => {
        e.flag |= MeshFlags.UPDATE;

        if (e.type === MeshTypes.FACE) {
          for (let l of (e as Face).loops) {
            mesh.setSelect(l.v, true);
            mesh.setSelect(l.e, true);
          }
        }

        mesh.setSelect(e, true);
      }

      for (let v of vs) {
        if (v.valence === 2) {
          mesh.joinTwoEdges(v, lctx);
        } else {
          mesh.dissolveVertex(v, lctx);
        }
      }

      mesh.regenAll();
      mesh.recalcNormals();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(DissolveVertOp);

export class CleanupQuads extends MeshOp {
  static tooldef() {
    return {
      uiname: "Cleanup Quads",
      toolpath: "mesh.cleanup_quads",
      inputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      let faces = new Set(mesh.faces.selected.editable);

      let lctx = new LogContext();
      let newfs = new Set<Face>();

      lctx.onnew = (e) => {
        mesh.setSelect(e, true);

        if (e.type === MeshTypes.FACE) {
          newfs.add(e as Face);
        }
      }

      trianglesToQuads(mesh, faces, undefined, lctx);

      for (let f of faces) {
        if (f.eid >= 0) {
          newfs.add(f);
        }
      }

      newfs = newfs.filter((f: Face) => f.eid >= 0);
      cleanupQuads(mesh, new Set(newfs), lctx);

      let vs = new Set();
      for (let f of newfs) {
        if (f.eid < 0) {
          continue;
        }

        for (let l of f.loops) {
          vs.add(l.v);
        }
      }

      mesh.updateBoundaryFlags();

      for (let i = 0; i < 1; i++) {
        vertexSmooth(mesh, vs, 0.5, 0.5, true);
      }

      mesh.regenAll();
      mesh.recalcNormals();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(CleanupQuads);

export class CleanupTris extends MeshOp {
  static tooldef() {
    return {
      uiname: "Cleanup Tris",
      toolpath: "mesh.cleanup_tris",
      inputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      let faces = new Set(mesh.faces.selected.editable);

      let lctx = new LogContext();
      let newfs = new Set<Face>();

      lctx.onnew = (e: Element): void => {
        mesh.setSelect(e, true);

        if (e.type === MeshTypes.FACE) {
          newfs.add(e as Face);
        }
      }

      for (let i = 0; i < 5; i++) {
        faces = new Set(mesh.faces.selected.editable);
        cleanupTris(mesh, faces, lctx);
      }

      let vs = new Set<Vertex>();
      for (let f of newfs) {
        if (f.eid < 0) {
          continue;
        }

        for (let l of f.loops) {
          vs.add(l.v);
        }
      }

      vertexSmooth(mesh, vs, 0.5, 0.5);

      mesh.regenAll();
      mesh.recalcNormals();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(CleanupTris);

export class DissolveEdgesOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Dissolve Edges",
      toolpath: "mesh.dissolve_edges",
      inputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      let lctx = new LogContext();
      lctx.onnew = (e) => {
        mesh.setSelect(e, true);
      }

      for (let e of new Set(mesh.edges.selected.editable)) {
        if (e.eid < 0) {
          continue;
        }

        mesh.dissolveEdge(e, lctx);
      }


      mesh.regenAll();
      mesh.recalcNormals();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(DissolveEdgesOp);

export const RotateEdgeModes = {
  FORWARD: 0,
  BACKWARD: 1
};

export class RotateEdgeOp extends MeshOp<{
  mode: EnumProperty
}> {
  static tooldef() {
    return {
      uiname: "Rotate Edges",
      toolpath: "mesh.rotate_edges",
      inputs: ToolOp.inherit({
        mode: new EnumProperty(0, RotateEdgeModes)
      })
    }
  }

  exec(ctx: ToolContext) {
    let mode = this.inputs.mode.getValue();

    for (let mesh of this.getMeshes(ctx)) {
      let lctx = new LogContext();
      lctx.onnew = (e) => {
        if (e.type !== MeshTypes.FACE) {
          mesh.setSelect(e, true);
        }
      }

      for (let e of new Set(mesh.edges.selected.editable)) {
        if (e.eid >= 0) {
          mesh.rotateEdge(e, !mode ? 1 : -1, lctx);
        }
      }

      //rotating edges messes up partial GL update,
      //as topology changes happen without changing the
      //element count
      mesh._clearGPUMeshes();

      mesh.regenAll();
      mesh.regenTessellation();
      mesh.recalcNormals();
      mesh.graphUpdate();

      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(RotateEdgeOp);


export class CollapseEdgesOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Collapse Edges",
      toolpath: "mesh.collapse_edges",
      inputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      let lctx = new LogContext();
      lctx.onnew = (e) => {
        mesh.setSelect(e, true);
      }

      for (let e of new Set(mesh.edges.selected.editable)) {
        if (e.eid < 0) {
          continue;
        }

        mesh.collapseEdge(e, undefined, lctx);
      }

      mesh.regenAll();
      mesh.recalcNormals();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(CollapseEdgesOp);

export class RandomCollapseOp extends MeshOp<{
  probability: FloatProperty
}> {
  static tooldef() {
    return {
      uiname: "Random Flip",
      toolpath: "mesh.random_flip_edges",
      inputs: ToolOp.inherit({
        probability: new FloatProperty(0.85).saveLastValue()
      })
    }
  }

  exec(ctx: ToolContext) {
    let prob = this.inputs.probability.getValue();

    for (let mesh of this.getMeshes(ctx)) {
      let es = new Set<Edge>();

      for (let e of mesh.edges.selected.editable) {
        if (Math.random() > 0.8) {
          continue;
        }

        let bad = false;

        for (let i = 0; i < 2; i++) {
          let v = i ? e.v2 : e.v1;
          for (let e2 of v.edges) {
            if (es.has(e2)) {
              bad = true;
            }
          }
        }

        if (!bad) {
          es.add(e);
        }
      }

      for (let e of es) {
        if (e.eid < 0) {
          continue;
        }

        if (Math.random() > prob) {
          continue;
        }

        e.v1.flag |= MeshFlags.UPDATE;
        e.v2.flag |= MeshFlags.UPDATE;
        e.flag |= MeshFlags.UPDATE;

        mesh.rotateEdge(e, Math.random() > 0.5 ? 1 : -1);
      }

      //rotating edges messes up partial GL update,
      //as topology changes happen without changing the
      //element count
      mesh._clearGPUMeshes(window._gl);

      mesh.regenAll();
      mesh.recalcNormals();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(RandomCollapseOp);

export class DissolveEdgeLoopsOp extends MeshOp<{
  ensureQuads: BoolProperty,
  selectFaces: BoolProperty,
}> {
  static tooldef() {
    return {
      uiname: "Dissolve Loops",
      toolpath: "mesh.dissolve_edgeloops",
      inputs: ToolOp.inherit({
        ensureQuads: new BoolProperty(false).saveLastValue(),
        selectFaces: new BoolProperty(false).saveLastValue()
      })
    }
  }

  exec(ctx: ToolContext) {
    let ensureQuads = this.inputs.ensureQuads.getValue();
    let selmask = ctx.selectMask;

    for (let mesh of this.getMeshes(ctx)) {
      let lctx = new LogContext();

      let es = new Set(mesh.edges.selected.editable);

      if (this.inputs.selectFaces.getValue()) {
        for (let e of es) {
          for (let l of e.loops) {
            mesh.setSelect(l.f, true);

            for (let l2 of l.f.loops) {
              if (selmask & MeshTypes.EDGE) {
                l2.e.flag |= MeshFlags.UPDATE;
                l2.v.flag |= MeshFlags.UPDATE;
                mesh.setSelect(l2.e, true);
              }

              if (selmask & MeshTypes.VERTEX) {
                l2.v.flag |= MeshFlags.UPDATE;
                mesh.setSelect(l2.v, true);
              }
            }

            l.f.flag |= MeshFlags.UPDATE;
          }
        }
      }

      lctx.onnew = (elem) => {
        elem.flag |= MeshFlags.UPDATE;
        mesh.setSelect(elem, true);
      }

      dissolveEdgeLoops(mesh, es, ensureQuads, lctx);

      mesh.regenAll();
      mesh.recalcNormals();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(DissolveEdgeLoopsOp);

export class FlipNormalsOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Flip Normals",
      toolpath: "mesh.flip_normals",
      inputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      for (let f of mesh.faces.selected.editable) {
        mesh.reverseWinding(f);
        f.flag |= MeshFlags.UPDATE;

        for (let v of f.verts) {
          v.flag |= MeshFlags.UPDATE;
        }
      }

      mesh.regenAll();
      mesh.recalcNormals();
      mesh.graphUpdate();

      window.updateDataGraph();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(FlipNormalsOp);

export class QuadSmoothOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Quad Smooth Test",
      toolpath: "mesh.quad_smooth",
      inputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      let lctx = new LogContext();

      lctx.onnew = (elem) => {
        mesh.setSelect(elem, true);
        elem.flag |= MeshFlags.UPDATE;
      }

      function smooth() {
        for (let i = 0; i < 1; i++) {
          vertexSmooth(mesh, vs);
        }
      }

      let vs = new Set();
      for (let f of mesh.faces.selected.editable) {
        for (let v of f.verts) {
          vs.add(v);
        }
      }

      triangulateMesh(mesh, mesh.faces.selected.editable, lctx);
      smooth();
      mesh.recalcNormals();

      trianglesToQuads(mesh, mesh.faces.selected.editable, undefined, lctx);
      smooth();

      mesh.regenAll();
      mesh.recalcNormals();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(QuadSmoothOp);

export class TestSmoothOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Test Color Smooth",
      toolpath: "mesh.test_color_smooth",
      inputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      _testMVC()

      mesh.regenAll();
      mesh.recalcNormals();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(TestSmoothOp);

export class DissolveFacesOp extends MeshOp {
  static tooldef() {
    return {
      uiname: "Dissolve Faces",
      toolpath: "mesh.dissolve_faces",
      inputs: ToolOp.inherit({})
    }
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      let faces = mesh.faces.selected.editable;

      dissolveFaces(mesh, faces);

      mesh.regenAll();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(DissolveFacesOp);

export class OptRemeshParams extends ToolOp<{
  edgeGoal: FloatProperty
}> {
  remesher?: Remesher;

  constructor() {
    super();

    this.remesher = undefined;
  }

  static tooldef() {
    return {
      uiname: "Optimize Remesh Params",
      toolpath: "mesh.opt_remesh_params",
      undoflag: UndoFlags.NO_UNDO,
      inputs: {
        edgeGoal: new FloatProperty(0.75)
      },
      outputs: {},
      is_modal: true
    }
  }

  on_mouseup(e: MouseEvent) {
    this.modalEnd(false);
  }

  modalEnd(wasCancelled: boolean) {
    if (this.remesher) {
      (this.remesher as unknown as any).endOptTimer();
      this.remesher = undefined;
    }

    super.modalEnd(wasCancelled);
  }

  modalStart(ctx: ToolContext) {
    super.modalStart(ctx);

    let mesh = ctx.mesh;
    if (!mesh) {
      this.modalEnd(true);
    }

    let goal = this.inputs.edgeGoal.getValue();

    this.remesher = new UniformTriRemesher(mesh, undefined, RemeshGoals.EDGE_AVERAGE, goal);
    (this.remesher as unknown as any).optimizeParams(ctx);
  }
}

ToolOp.register(OptRemeshParams);

import {SolverElem, SolverSettings, Solver, DiffConstraint, VelConstraint} from './mesh_solver.js';
import {BVHToolMode} from '../editors/view3d/tools/pbvh.js';
import {getCurveVerts, smoothCurvatures} from './mesh_curvature.js';
import {getFaceSets} from './mesh_facesets.js';
import {getDynVerts} from '../util/bvh.js';
import {ToolContext} from "../../types/scripts/core/context";
import {View3D} from "../../types/scripts/editors/view3d/view3d";

export class SolverOpBase<InputSet = {}, OutputSet = {}> extends MeshOp<InputSet & {
  steps: IntProperty,
  dt: FloatProperty,
  implicitSteps: IntProperty,
  damp: FloatProperty
}, OutputSet> {
  solver?: Solver;

  constructor() {
    super();

    this.solver = undefined;
  }

  static tooldef(): ToolDef {
    return {
      toolpath: "",
      inputs: ToolOp.inherit({
        steps: new IntProperty(1).private(),
        dt: new FloatProperty(0.5).noUnits().setRange(0.0001, 1.0).saveLastValue(),
        implicitSteps: new IntProperty(5).noUnits().setRange(0, 45).saveLastValue(),
        damp: new FloatProperty(0.99).noUnits().setRange(0.0, 1.0).saveLastValue()
      }),
      is_modal: true,
      outputs: ToolOp.inherit({})
    }
  }

  on_keydown(e) {
    switch (e.keyCode) {
      case keymap["Escape"]:
      case keymap["Enter"]:
      case keymap["Space"]:
        this.modalEnd(false);
        break;
    }
  }

  getSolver(mesh) {
    let solver = new Solver();
    solver.start(mesh);

    solver.implicitSteps = this.inputs.implicitSteps.getValue();

    return solver;
  }

  execStep(mesh, solver) {
    let dt = this.inputs.dt.getValue();

    try {
      solver.solve(1, dt);
    } catch (error) {
      console.log(error.stack);
      console.log(error.message);
      if (this.modalRunning) {
        this.modalEnd(false);
      }

      return;
    }

    mesh.regenRender();
    mesh.recalcNormals();
    mesh.graphUpdate();

    window.redraw_viewport();
  }

  on_tick() {
    let time = util.time_ms();

    let solver = this.solver, mesh = solver.mesh;

    while (util.time_ms() - time < 150) {
      this.execStep(mesh, solver);
      this.inputs.steps.setValue(this.inputs.steps.getValue() + 1);

      if (!this.modalRunning) {
        break;
      }

      //XXX
      //this.modalEnd(false);
    }
  }

  modalStart(ctx: ToolContext) {
    super.modalStart(ctx);

    this.inputs.steps.setValue(0);
    this.solver = this.getSolver(ctx.mesh);
  }

  exec(ctx: ToolContext) {
    let steps = this.inputs.steps.getValue();
    let mesh = ctx.mesh;
    let solver = this.getSolver(mesh);

    for (let i = 0; i < steps; i++) {
      this.execStep(mesh, solver);
    }

    solver.finish();
  }

  on_mouseup(e) {
    this.modalEnd(false);
  }

  modalEnd(was_cancelled) {
    super.modalEnd(was_cancelled);

    if (this.solver) {
      this.solver.finish();
      this.solver = undefined;
    }
  }
}

export class TestSolverOp extends SolverOpBase<{
  springK: FloatProperty,
  inflate: FloatProperty,
  edgeLenMul: FloatProperty,
}> {
  constructor() {
    super();

    this.solver = undefined;
  }

  static tooldef() {
    return {
      uiname: "Test Solver",
      toolpath: "mesh.test_solver",
      inputs: ToolOp.inherit({
        springK: new FloatProperty(5.5).noUnits().setRange(0.0, 55.0).saveLastValue(),
        inflate: new FloatProperty(0.25).noUnits().setRange(0.0001, 2.0).saveLastValue(),
        edgeLenMul: new FloatProperty(1.85).noUnits().setRange(0.01, 5.0).saveLastValue(),
      }),
      is_modal: true,
      outputs: ToolOp.inherit({})
    }
  }

  execStep(mesh, solver) {
    let vs = solver.clientData;
    let cd_slv = solver.cd_slv;
    let inflate = this.inputs.inflate.getValue() * 0.01;
    let dt = this.inputs.dt.getValue();
    let damp = this.inputs.damp.getValue();

    for (let v of vs) {
      let sv = v.customData[cd_slv];

      sv.oldco.load(v);
      sv.vel.mulScalar(damp);

      sv.force.zero();
      sv.scratch.zero();

      sv.force.addFac(v.no, 0.1 * dt * inflate / sv.mass);

      if (isNaN(sv.vel.dot(sv.vel))) {
        console.error("NaN!");
        if (this.modalRunning) {
          this.modalEnd(false);
        }

        return;
      }

      //v.addFac(sv.vel, dt);
      v.flag |= MeshFlags.UPDATE;
    }

    mesh.regenRender();
    mesh.recalcNormals();
    mesh.graphUpdate();
    window.redraw_viewport(true);

    super.execStep(mesh, solver);

    for (let v of vs) {
      let sv = v.customData[cd_slv];

      if (sv.mass > 100) {
        v.load(sv.oldco);
      }
      //sv.vel.load(v).sub(sv.oldco);
    }
  }

  getSolver(mesh: Mesh): Solver {
    let solver = super.getSolver(mesh);

    let vs = new Set(mesh.verts.selected.editable);
    let es = new Set<Edge>();
    let fs = new Set<Face>();

    solver.clientData = vs;

    for (let v of vs) {
      for (let e of v.edges) {
        es.add(e);

        for (let l of e.loops) {
          fs.add(e.l.f);
        }
      }
    }

    if (0) {
      let cdname = "__solve_idx";
      let cd_idx = mesh.edges.customData.getNamedLayerIndex(cdname, "int");

      if (cd_idx < 0) {
        let layer = mesh.edges.addCustomDataLayer("int", cdname);
        cd_idx = layer.index;
        layer.flag |= CDFlags.TEMPORARY;
      }
    }

    let sk = this.inputs.springK.getValue();
    let cd_slv = solver.cd_slv;

    function debug(...args: any[]) {
      //return console.log(...arguments);
    }

    function spring_c(_params: any): number {
      const params: [Vertex, Vertex, number, number] = _params;
      let [v1, v2, rlen, sk] = params;

      //let m1 = v1.customData[cd_slv].mass;
      //let m2 = v1.customData[cd_slv].mass;

      return Math.abs(v1.co.vectorDistance(v2.co) - rlen);
    }

    function spring_c_vel(_params: any, klst: number[], glst: number[]): void {
      let [v1, v2, rlen, sk] = _params as [Vertex, Vertex, number, number];

      let [g1, g2] = glst;

      let err = v1.co.vectorDistance(v2.co) - rlen;

      for (let j = 0; j < 3; j++) {
        g1[j] = (v2[j] - v1[j]) * err * sk;
        g2[j] = (v1[j] - v2[j]) * err * sk;
      }

      debug(g1, g2);
    }

    function spring_c_acc(_params: any, klst: number, hlst: Array<Array<number>>): void {
      let [v1, v2, rlen, sk] = _params as [Vertex, Vertex, number, number];

      let [h1, h2] = hlst;

      let err = v1.co.vectorDistance(v2.co) - rlen;

      for (let j = 0; j < 3; j++) {
        h1[j] = -err * sk;
        h2[j] = err * sk;
      }
    }

    let boundary = new Set<Vertex>();

    for (let e of es) {
      if (!vs.has(e.v1)) {
        boundary.add(e.v1);
      }
      if (!vs.has(e.v2)) {
        boundary.add(e.v2);
      }
    }

    for (let v of vs) {
      v.customData.get<SolverElem>(cd_slv).mass = 1.0;
    }

    for (let i = 0; i < 5; i++) {
      let boundary2 = new Set<Vertex>();

      for (let v of boundary) {
        for (let v2 of v.neighbors) {
          if (!vs.has(v2) && !boundary.has(v2)) {
            boundary2.add(v2);
          }
        }

        v.customData.get<SolverElem>(cd_slv).mass = 100000000.0;
        vs.add(v);
      }

      boundary = boundary2;
    }

    for (let v of boundary) {
      v.customData.get<SolverElem>(cd_slv).mass = 100000000.0;
      vs.add(v);
    }

    for (let v of vs) {
      for (let e of v.edges) {
        if (vs.has(e.v1) && vs.has(e.v2)) {
          es.add(e);
        }
      }
    }

    let edgeLenMul = this.inputs.edgeLenMul.getValue();

    for (let e of es) {
      let sv1 = e.v1.customData.get<SolverElem>(cd_slv);
      let sv2 = e.v1.customData.get<SolverElem>(cd_slv);
      let wlst = [sv1.mass, sv2.mass];
      let vel_lst = [sv1.vel, sv2.vel];
      let flst = [sv1.force, sv2.force];
      let slst = [sv1.scratch, sv2.scratch];

      let params = [e.v1, e.v2, e.v1.co.vectorDistance(e.v2.co) * edgeLenMul, sk];
      let con = new VelConstraint(spring_c, spring_c_vel, spring_c_acc, [e.v1,
        e.v2], params, wlst, vel_lst, flst, slst);
      solver.add(con);
    }

    return solver;
  }
}

ToolOp.register(TestSolverOp);

export class DuplicateMeshOp extends MeshOp<{
  selectMask: FlagProperty
}> {
  static tooldef() {
    return {
      uiname: "Duplicate Geometry",
      toolpath: "mesh.duplicate",
      inputs: ToolOp.inherit({
        selectMask: new FlagProperty(0, MeshTypes).private()
      }),
      outputs: ToolOp.inherit({})
    }
  }

  static invoke(ctx: ToolContext, args) {
    let tool = super.invoke(ctx, args) as unknown as DuplicateMeshOp;

    if (!("selMask" in args)) {
      tool.inputs.selectMask.setValue(ctx.selectMask);
    }

    let macro = new ToolMacro();
    macro.add(tool);

    let grab = new TranslateOp();
    macro.add(grab);

    return macro;
  }

  exec(ctx: ToolContext) {
    for (let mesh of this.getMeshes(ctx)) {
      let selmask = this.inputs.selectMask.getValue();

      let geoms = [];

      if (selmask & MeshTypes.VERTEX) {
        geoms.push(util.list(mesh.verts.selected.editable));
      }
      if (selmask & MeshTypes.EDGE) {
        geoms.push(util.list(mesh.edges.selected.editable));
      }
      if (selmask & MeshTypes.FACE) {
        geoms.push(util.list(mesh.faces.selected.editable));
      }

      let geom = [];
      for (let i = 0; i < geoms.length; i++) {
        geom = geom.concat(geoms[i]);
      }

      console.log(selmask);
      console.log(geoms);
      console.log("GEOM", geom);

      mesh.selectNone();
      let ret = duplicateMesh(mesh, geom);

      for (let v of ret.newVerts) {
        v.flag |= MeshFlags.UPDATE;
        mesh.verts.setSelect(v, true);
      }

      for (let e of ret.newEdges) {
        mesh.edges.setSelect(e, true);
      }

      for (let f of ret.newFaces) {
        mesh.faces.setSelect(f, true);
      }

      mesh.regenTessellation();
      mesh.regenBVH();
      mesh.regenRender();
      mesh.graphUpdate();
    }
  }
}

ToolOp.register(DuplicateMeshOp);

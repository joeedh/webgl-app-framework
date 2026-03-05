import * as util from '../../../util/util.js';
import {
  BoolProperty,
  Curve1DProperty,
  EnumProperty, FlagProperty, FloatArrayProperty, FloatProperty, IntProperty, Matrix4, Quat, ToolOp, Vec3Property,
  Vec4Property,
  Vector2, Vector3,
  Vector4, closest_point_on_line
} from '../../../path.ux/scripts/pathux.js';
import {Grid, GridBase, QRecalcFlags} from '../../../mesh/mesh_grids.js';
import {CDFlags} from '../../../mesh/customdata.js';
import {BrushFlags, DynTopoFlags, SculptTools} from '../../../brush/brush.ts';
import {LogContext, Loop, Mesh, MeshFlags, MeshTypes} from '../../../mesh/mesh.js';
import {BVHFlags, BVHTriFlags} from '../../../util/bvh.js';
import {QuadTreeFields, QuadTreeFlags, QuadTreeGrid} from '../../../mesh/mesh_grids_quadtree.js';
import {KdTreeFields, KdTreeFlags, KdTreeGrid} from '../../../mesh/mesh_grids_kdtree.js';
import {splitEdgesSmart, splitEdgesSimple, splitEdgesSmart2} from '../../../mesh/mesh_subdivide.js';
import {BrushProperty, calcConcave, PaintOpBase, PaintSample, PaintSampleProperty, SymAxisMap} from './pbvh_base.ts';
import {trianglesToQuads, triangulateFan} from '../../../mesh/mesh_utils.js';
import {applyTriangulation, triangulateFace} from '../../../mesh/mesh_tess.js';
import {MeshLog} from '../../../mesh/mesh_log.js';

import {MultiGridSmoother} from '../../../mesh/multigrid_smooth.js';

export function fillHoleFromVert(mesh: any, bvh: any, startv: any, visit: WeakSet<any>, lctx: any): void {
  let count: number = 0;

  let _i: number = 0;
  let vs: any[] = [];
  let v: any = startv;
  let laste: any;

  while (1) {
    if (_i++ > 100000) {
      console.warn("Infinite loop error");
      break;
    }

    vs.push(v);
    visit.add(v);

    let e: any;
    for (let e2 of v.edges) {
      if (!e2.l || e2.l.radial_next === e2.l) {
        count++;

        if (!e && !visit.has(e2)) {
          e = e2;
          visit.add(e2);
        }
      }
    }

    if (!e) {
      break;
    }

    v = e.otherVertex(v);

    laste = e;
  }

  let flag1: number = MeshFlags.TEMP3;
  let flag2: number = MeshFlags.TEMP4;

  let vi: number = 0;
  for (let v of vs) {
    v.flag &= ~flag1;
  }

  for (let v of vs) {
    if (!(v.flag & flag1)) {
      v.flag |= flag1;
      vs[vi++] = v;
    }
  }

  console.log("vs", vs.length, vi);

  vs.length = vi;

  if (vs.length < 3) {
    return;
  }

  if (!lctx) {
    lctx = new LogContext();
  }

  let updateflag: number = BVHFlags.UPDATE_UNIQUE_VERTS|BVHFlags.UPDATE_OTHER_VERTS;
  updateflag = updateflag | BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_DRAW;
  updateflag = updateflag | BVHFlags.UPDATE_COLORS | BVHFlags.UPDATE_INDEX_VERTS;
  updateflag = updateflag | BVHFlags.UPDATE_TOTTRI;

  let oldnew: ((e: any) => void) | undefined = lctx.onnew;
  lctx.onnew = (e: any): void => {
    if (e.type === MeshTypes.FACE && e.isTri()) {
      let l: any = e.lists[0].l;

      let tri: any = bvh.addTri(e.eid, bvh._nextTriIdx(), l.v, l.next.v, l.prev.v, undefined, l, l.next, l.prev);
      tri.flag |= BVHTriFlags.LOOPTRI_INVALID;

      for (let node of tri.nodes) {
        node.setUpdateFlag(updateflag);
      }
    }

    if (oldnew) {
      oldnew(e);
    }
  }

  let f: any = mesh.makeFace(vs, undefined, undefined, lctx);
  let badf: number = 0;

  for (let l of f.loops) {
    badf += l.radial_next !== l && l.radial_next.v === l.v ? 1 : -1;
  }
  if (badf > 0.0) {
    mesh.reverseWinding(f);
  }

  let first: boolean = true;

  for (let l of f.loops) {
    if (l.radial_next !== l) {
      mesh.copyElemData(l, l.radial_next);

      if (first) {
        mesh.copyElemData(f, l.radial_next.f);
        first = false;
      }
    }
  }

  if (!f.isTri()) {
    applyTriangulation(mesh, f, undefined, undefined, lctx);
  }
}

export function fillBoundaryHoles(mesh: any, bvh: any, vs: any, lctx: any): void {
  let visit: WeakSet<any> = new WeakSet();

  for (let v of vs) {
    if (!v.isBoundary()) {
      continue;
    }

    if (!visit.has(v)) {
      fillHoleFromVert(mesh, bvh, v, visit, lctx);
    }
  }
}

export class HoleFillPaintOp extends PaintOpBase {
  last_mpos: Vector3;
  start_mpos: Vector3;
  _undo: any;

  constructor() {
    super();

    this.last_mpos = new Vector3();
    this.start_mpos = new Vector3();
  }

  static tooldef(): object {
    return {
      uiname  : "paintop",
      toolpath: "bvh.hole_filler",
      is_modal: true,
      inputs  : ToolOp.inherit({
        brush: new BrushProperty(),
        samples: new PaintSampleProperty(),
        symmetryAxes: new FlagProperty(undefined, {X: 1, Y: 2, Z: 4})
      })
    }
  }

  calcUndoMem(ctx: any): number {
    if (!this._undo) {
      return 0;
    }

    return this._undo.log.calcMemSize();
  }

  undoPre(ctx: any): void {
    let ud: any = this._undo = {};

    let mesh: any = ctx.mesh;

    if (mesh) {
      ud.mesh = mesh.lib_id;
    }

    ud.log = new MeshLog();
  }

  undo(ctx: any): void {
    let ud: any = this._undo;

    if (ud.mesh === undefined) {
      return;
    }

    let mesh: any = ctx.datalib.get(ud.mesh);

    if (!mesh) {
      console.error("Could not find mesh " + ud.mesh);
      return;
    }

    ud.log.undo(mesh);
    mesh.regenBVH();
    mesh.regenAll();

    window.redraw_viewport(true);
  }

  on_mousemove_intern(e: any, x: number, y: number, in_timer: boolean = false, isInterp: boolean = false): void {
    let ctx: any = this.modal_ctx;
    if (!ctx.mesh) {
      return;
    }

    let ret: any = super.on_mousemove_intern(e, x, y, in_timer);

    if (!ret) {
      return;
    }

    let mesh: any = this.mesh;

    let {origco, p, view, vec, w, mpos, radius, getchannel} = ret;

    let brush: any = this.inputs.brush.getValue();
    let strength: number = getchannel("strength", brush.strength);
    let autosmooth: number = getchannel("autosmooth", brush.autosmooth);

    let ps: PaintSample = new PaintSample();

    ps.p.load(p);
    ps.dp.load(p).sub(this.last_p);
    ps.radius = radius;
    ps.strength = strength;
    ps.autosmooth = autosmooth;
    ps.w = w;
    ps.isInterp = isInterp;

    let list: any = this.inputs.samples.getValue();
    let lastps: PaintSample | undefined;

    if (list.length > 0) {
      lastps = list[list.length-1];
    }

    list.push(ps);

    this.execDot(ctx, ps, lastps);
    window.redraw_viewport(true);
  }

  exec(ctx: any): void {
    let lastps: PaintSample | undefined;

    if (!ctx.mesh) {
      return;
    }

    for (let ps of this.inputs.samples.getValue()) {
      this.execDot(ctx, ps, lastps);

      lastps = ps;
    }

    window.redraw_viewport(true);
  }

  execDot(ctx: any, ps: PaintSample, lastps: PaintSample | undefined): void {
    let mesh: any = ctx.mesh;

    if (!mesh) {
      return;
    }

    let bvh: any = mesh.getBVH({autoUpdate: false});
    let log: any = this._undo.log;

    log.checkStart(mesh);

    let lctx: any = new LogContext();
    lctx.onnew = (e: any): void => {
      if (!(e.type & (MeshTypes.HANDLE|MeshTypes.LOOP))) {
        log.logAdd(e);
      }
    }

    lctx.onkill = (e: any): void => {
      if (!(e.type & (MeshTypes.HANDLE|MeshTypes.LOOP))) {
        log.logKill(e);
      }
    }

    let vs: any = bvh.closestVerts(ps.p, ps.radius);

    for (let v of new Set(vs)) {
      for (let v2 of v.neighbors) {
        vs.add(v2);

        /*
        for (let v3 of v2.neighbors) {
          vs.add(v3);
        }//*/
      }
    }

    for (let v of vs) {
      if (v.valence === 0) {
        mesh.killVertex(v, undefined, lctx);
        continue;
      }

      let ok: boolean = false;

      for (let e of v.edges) {
        if (e.l) {
          ok = true;
        }
      }

      if (!ok) {
        mesh.killVertex(v, undefined, lctx);
      }
    }

    vs = vs.filter((v: any) => v.eid >= 0 && v.isBoundary(false));
    console.log(vs);

    if (vs.size === 0) {
      return;
    }

    for (let v of vs) {
      log.ensure(v);
    }

    fillBoundaryHoles(mesh, bvh, vs, lctx);

    bvh.update();
  }
}
ToolOp.register(HoleFillPaintOp);

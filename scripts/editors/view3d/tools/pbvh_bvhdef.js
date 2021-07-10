import * as util from '../../../util/util.js';
import {
  BoolProperty,
  Curve1DProperty,
  EnumProperty, FlagProperty, FloatArrayProperty, FloatProperty, IntProperty, Matrix4, Quat, ToolOp, Vec3Property,
  Vec4Property, math, trilinear_co, trilinear_v3, point_in_hex,
  Vector2, Vector3,
  Vector4, closest_point_on_line, normal_quad
} from '../../../path.ux/scripts/pathux.js';
import {Grid, GridBase, QRecalcFlags} from '../../../mesh/mesh_grids.js';
import {CDFlags} from '../../../mesh/customdata.js';
import {BrushFlags, DynTopoFlags, SculptTools} from '../../../brush/brush.js';
import {LogContext, Loop, Mesh, MeshFlags, MeshTypes} from '../../../mesh/mesh.js';
import {BVHFlags, BVHTriFlags} from '../../../util/bvh.js';
import {QuadTreeFields, QuadTreeFlags, QuadTreeGrid} from '../../../mesh/mesh_grids_quadtree.js';
import {KdTreeFields, KdTreeFlags, KdTreeGrid} from '../../../mesh/mesh_grids_kdtree.js';
import {splitEdgesSmart, splitEdgesSimple, splitEdgesSmart2} from '../../../mesh/mesh_subdivide.js';
import {BrushProperty, calcConcave, PaintOpBase, PaintSample, PaintSampleProperty, SymAxisMap} from './pbvh_base.js';
import {trianglesToQuads, triangulateFan} from '../../../mesh/mesh_utils.js';
import {applyTriangulation, triangulateFace} from '../../../mesh/mesh_tess.js';
import {MeshLog} from '../../../mesh/mesh_log.js';

import {MultiGridSmoother} from '../../../mesh/multigrid_smooth.js';

window.testTrilinear = function (seed = 0, d = 0.5) {
  let boxverts = [
    [-d, -d, -d],
    [-d, d, -d],
    [d, d, -d],
    [d, -d, -d],

    [-d, -d, d],
    [-d, d, d],
    [d, d, d],
    [d, -d, d],
  ];

  boxverts = boxverts.map(b => new Vector3(b));

  let rand = new util.MersenneRandom(seed);

  for (let i = 0; i < 5; i++) {
    let co = new Vector3();

    for (let j = 0; j < 3; j++) {
      co[j] = (rand.random() - 0.5)*2.0*d;
    }

    let a = trilinear_co(co, boxverts);
    let b = trilinear_v3(a, boxverts);
    console.log(co.vectorDistance(b));
    console.log("\n");
  }
}

export class BVHDeformPaintOp extends PaintOpBase {
  constructor() {
    super();

    this.bvhfirst = true;
    this.bGrabVerts = undefined;
    this.grabMode = true;

    this.randSeed = 0;
    this.rand = new util.MersenneRandom();
    this.rand.seed(this.randSeed);

    this.last_mpos = new Vector3();
    this.start_mpos = new Vector3();
  }

  static tooldef() {
    return {
      uiname  : "bvh deform paintop",
      toolpath: "bvh.bvh_deform",
      is_modal: true,
      inputs  : ToolOp.inherit({
        brush       : new BrushProperty(),
        samples     : new PaintSampleProperty(),
        symmetryAxes: new FlagProperty(undefined, {X: 1, Y: 2, Z: 4})
      })
    }
  }

  calcUndoMem(ctx) {
    if (!this._undo) {
      return 0;
    }

    //XXX implement me
    return 32;
  }

  on_mousemove_intern(e, x, y, in_timer = false, isInterp = false) {
    let ctx = this.modal_ctx;
    if (!ctx.mesh) {
      return;
    }

    let ret = super.on_mousemove_intern(e, x, y, in_timer);

    if (!ret) {
      return;
    }

    let mesh = ctx.mesh;

    let {origco, p, view, vec, w, mpos, radius, getchannel} = ret;

    let brush = this.inputs.brush.getValue();
    let strength = getchannel("strength", brush.strength);
    let autosmooth = getchannel("autosmooth", brush.autosmooth);

    let ps = new PaintSample();

    ps.p.load(p);
    ps.dp.load(p).sub(this.last_p);
    this.last_p.load(p);

    ps.radius = radius;
    ps.strength = strength;
    ps.autosmooth = autosmooth;
    ps.w = w;
    ps.isInterp = isInterp;

    let bvh = this.getBVH(mesh);

    if (this.bvhfirst) {
      console.error("Setting grab verts!");

      this.bvhfirst = false;
      let bvs = this.bGrabVerts = new Map();

      for (let node of bvh.leaves) {
        for (let bv of node.boxverts) {
          let dis = bv.vectorDistance(ps.p);
          bv.origco.load(bv);

          if (dis < radius) {
            bvs.set(bv, dis);
          }
        }
      }
    }

    let list = this.inputs.samples.getValue();
    let lastps;

    if (list.length > 0) {
      lastps = list[list.length - 1];
    }

    list.push(ps);

    this.execDot(ctx, ps, lastps);
    window.redraw_viewport(true);
  }

  on_mousemove(e, in_timer) {
    return super.on_mousemove(e, in_timer);
  }

  undoPre(ctx) {
    let ud = this._undo = {
      vmap : new Map(),
      nvset : new WeakSet(),
      vlist : []
    };

    let mesh = ctx.mesh;
    ud.mesh = mesh ? mesh.lib_id : -1;
  }

  _doUndo(v) {
    let vmap = this._undo.vmap;
    let vlist = this._undo.vlist;

    if (!vmap.has(v.eid)) {
      vmap.set(v.eid, vlist.length);
      vlist.push(v.eid);

      vlist.push(v[0]);
      vlist.push(v[1]);
      vlist.push(v[2]);

      vlist.push(v.no[0]);
      vlist.push(v.no[1]);
      vlist.push(v.no[2]);
    }
  }

  undo(ctx) {
    let ud = this._undo;

    if (ud.mesh === undefined) {
      return;
    }

    let mesh = ctx.datalib.get(ud.mesh);

    if (!mesh) {
      console.error("Could not find mesh " + ud.mesh);
      return;
    }

    let bvh = mesh.bvh;
    let cd_node = bvh ? bvh.cd_node : -1;

    let i = 0;
    let vlist = ud.vlist;
    while (i < vlist.length) {
      let eid = vlist[i++];

      let x = vlist[i++];
      let y = vlist[i++];
      let z = vlist[i++];

      let nx = vlist[i++];
      let ny = vlist[i++];
      let nz = vlist[i++];

      let v = mesh.eidMap.get(eid);
      if (!v) {
        console.error("Could not find vertex " + eid, v);
        continue;
      }

      v[0] = x;
      v[1] = y;
      v[2] = z;
      v.no[0] = nx;
      v.no[1] = ny;
      v.no[2] = nz;

      v.flag |= MeshFlags.UPDATE;

      if (bvh) {
        let node = v.customData[cd_node].node;
        if (node) {
          if (node.boxverts) {
            for (let bv of node.boxverts) {
              bv.load(bv.origco);
            }
          }

          node.setUpdateFlag(BVHFlags.UPDATE_DRAW|BVHFlags.UPDATE_BOUNDS);
        }
      }
    }

    if (bvh) {
      bvh.update();
    }

    window.redraw_viewport(true);
  }

  exec(ctx) {
    let lastps;

    if (!ctx.mesh) {
      return;
    }

    for (let ps of this.inputs.samples.getValue()) {
      this.execDot(ctx, ps, lastps);

      lastps = ps;
    }

    window.redraw_viewport(true);
  }

  getBVH(mesh) {
    return mesh.getBVH({
      auto_update: false,
      deformMode : true,
      onCreate   : this.onBind.bind(this)
    });
  }

  onBind(bvh) {
    console.warn("Bind!");
    bvh.splitToUniformDepth();

    //abuse the velocity field of BVHNodeElem
    const cd_node = bvh.cd_node;

    for (let node of bvh.leaves) {
      node.boxvdata = new Map();

      /*
      for (let i=0; i<2; i++) {
        let set = !i ? node.uniqueVerts : node.otherVerts;

        for (let v of set) {
          node.boxvdata.set(v, new Vector3(trilinear_co(v, node.boxverts)));
        }
      }*/

      for (let v of node.uniqueVerts) {
        node.boxvdata.set(v, new Vector3(trilinear_co(v, node.boxverts)));
      }

      node.setUpdateFlag(BVHFlags.UPDATE_DRAW);
    }

    bvh.update();
    console.log("done.");
  }

  modalEnd(wascanceled) {
    let ctx = this.modal_ctx ?? _appstate.ctx;
    super.modalEnd(wascanceled);

    if (!wascanceled) {
      let bvh = this.getBVH(ctx.mesh);

      this._applyDef(bvh);

      bvh.update();
      window.redraw_viewport();
    }
  }

  _applyDef(bvh) {
    //return;
    const cd_node = bvh.cd_node;

    console.log("Apply Def");

    for (let node of bvh.leaves) {
      for (let v of node.uniqueVerts) {
        let uvw = node.boxvdata.get(v);

        this._doUndo(v);

        v.load(trilinear_v3(uvw, node.boxverts));
        v.flag |= MeshFlags.UPDATE;
      }

      let flag = BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS;
      flag |= BVHFlags.UPDATE_BOUNDS;

      node.setUpdateFlag(flag);
    }
  }

  execDot(ctx, ps, lastps) {
    let ob = ctx.object;
    let mesh = ctx.mesh;

    if (!mesh) {
      console.warn("No mesh!");
      return;
    }

    let ud = this._undo;

    let fac = 0.1;

    let bvh = this.getBVH(mesh);

    let radius = ps.radius;
    let brush = this.inputs.brush.getValue();
    let falloff = brush.falloff;

    let visit = new WeakSet();
    let bvs = [];

    let vset = new Set();

    vset = this.bGrabVerts;

    /*
    for (let n of bvh.leaves) {
      for (let bv of n.boxverts) {
        vset.add(bv);
      }
    }*/

    for (let bv of vset.keys()) {
      if (visit.has(bv)) {
        continue;
      }

      visit.add(bv);

      if (!ud.nvset.has(bv)) {
        ud.nvset.add(bv);
        bv.origco.load(bv);
      }

      let dis = vset.get(bv);
      if (dis >= radius) {
        //continue;
      }

      let w = 1.0 - dis / radius;
      w = falloff.evaluate(w);
      w = Math.min(Math.max(w, 0.0), 1.0);

      bv.addFac(ps.dp, w*ps.strength);

      bvs.push(bv);
      bvs.push(w);

      //bv[0] += (this.rand.random() - 0.25)*fac;
      //bv[1] += (this.rand.random() - 0.25)*fac;
      //bv[2] += (this.rand.random() - 0.25)*fac;
    }

    let tmp = new Vector3();

    let smooth = (bv, fac=0.5) => {
      let co = tmp.zero();
      let tot = 0.0;

      for (let e of bv.edges){
        let bv2 = e.otherVertex(bv);

        if (vset.has(bv2)) {
          co.add(bv2);
          tot++;
        }
      }

      if (tot > 0.0) {
        co.mulScalar(1.0 / tot);
        bv.interp(co, fac);
      }
    }

    for (let i=0; i<bvs.length; i += 2) {
      let bv = bvs[i];
      let w =  (1.0-bvs[i+1]) * ps.autosmooth;

      smooth(bv, w);
    }

    if (!this.modalRunning) {
      this._applyDef(bvh);

      for (let node of bvh.leaves) {
        node.setUpdateFlag(BVHFlags.UPDATE_BOUNDS);
      }

      bvh.update();
    }

    window.redraw_viewport(true);
  }
}

ToolOp.register(BVHDeformPaintOp);

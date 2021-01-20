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
import {BrushFlags, DynamicsMask, DynTopoFlags, SculptTools} from '../../../brush/brush.js';
import {LogContext, Loop, Mesh, MeshFlags, MeshTypes} from '../../../mesh/mesh.js';
import {BVHFlags, BVHTriFlags, IsectRet} from '../../../util/bvh.js';
import {QuadTreeFields, QuadTreeFlags, QuadTreeGrid} from '../../../mesh/mesh_grids_quadtree.js';
import {KdTreeFields, KdTreeFlags, KdTreeGrid} from '../../../mesh/mesh_grids_kdtree.js';
import {splitEdgesSmart, splitEdgesSimple, splitEdgesSmart2} from '../../../mesh/mesh_subdivide.js';
import {BrushProperty, calcConcave, PaintOpBase, PaintSample, PaintSampleProperty, SymAxisMap} from './pbvh_base.js';
import {trianglesToQuads, triangulateFan} from '../../../mesh/mesh_utils.js';
import {applyTriangulation, triangulateFace} from '../../../mesh/mesh_tess.js';
import {MeshLog} from '../../../mesh/mesh_log.js';

import {MultiGridSmoother} from '../../../mesh/multigrid_smooth.js';

const GEID                                                               = 0, GEID2 = 1, GDIS                                          = 2, GSX = 3, GSY = 4, GSZ = 5,
      GAX = 6, GAY = 7, GAZ = 8, GOFFX = 9, GOFFY = 10, GOFFZ = 11, GTOT = 12;

let UGTOT = 9;

let ENABLE_DYNTOPO_EDGE_WEIGHTS = true;
let DYNTOPO_T_GOAL = 7;

/*
let GVEID = 0, GVTOT=1;
let GGEID_LOOP=0, GGEID_GRIDVERT=1, GGTOT=2;
*/

/*
BrushProperty works by copying SculptBrush.  It also copies any
textures inside of them, but not anything those textures references (e.g. images).

WARNING: this means there could conceivably be reference leaks here with the undo stack
*/


let cfrets = util.cachering.fromConstructor(Vector4, 128);
export let colorfilterfuncs = [0, 0];

colorfilterfuncs[1] = function (v, cd_color, fac = 0.5) {
  if (cd_color < 0) {
    return;
  }

  let ret = cfrets.next().zero();
  let tot = 0.0;
  fac = 1.0 - fac;

  for (let v2 of v.neighbors) {
    let clr = v2.customData[cd_color].color;
    let w = 1.0;

    tot += w;
    ret.addFac(clr, w);
  }

  if (tot === 0.0) {
    ret.load(v.customData[cd_color].color);
  } else {
    ret.mulScalar(1.0/tot);
    ret.interp(v.customData[cd_color].color, fac);
  }

  return ret;
}

colorfilterfuncs[0] = function (v, cd_color, fac = 0.5) {
  if (cd_color < 0) {
    return;
  }

  let ret = cfrets.next().zero();
  let tot = 0.0;
  fac = 1.0 - fac;

  for (let e of v.edges) {
    let v2 = e.otherVertex(v);
    let clr = v2.customData[cd_color].color;
    let w = 1.0;

    tot += w;
    ret.addFac(clr, w);
  }

  if (tot === 0.0) {
    ret.load(v.customData[cd_color].color);
  } else {
    ret.mulScalar(1.0/tot);
    ret.interp(v.customData[cd_color].color, fac);
  }

  return ret;
}


export class PaintOp extends PaintOpBase {
  constructor() {
    super();

    this._last_enable_mres = "";

    this.grabEidMap = undefined;
    this.grabDists = undefined;

    this.last_mpos = new Vector2();
    this.last_p = new Vector3();
    this.last_origco = new Vector4();
    this._first = true;
    this.last_radius = 0;
    this.last_vec = new Vector3();

    this.smoother = undefined;
  }

  static tooldef() {
    return {
      uiname  : "paintop",
      toolpath: "bvh.paint",
      is_modal: true,
      inputs  : {
        brush  : new BrushProperty(),
        samples: new PaintSampleProperty(),

        grabData: new FloatArrayProperty(),
        grabCo  : new Vec3Property(),

        falloff: new Curve1DProperty(),

        dynTopoLength   : new FloatProperty(25),
        dynTopoDepth    : new IntProperty(20),
        useDynTopo      : new BoolProperty(false),
        useMultiResDepth: new BoolProperty(false),

        symmetryAxes: new FlagProperty(undefined, {X: 1, Y: 2, Z: 4})
      }
    }
  }

  ensureSmoother(mesh) {
    if (!this.smoother) {
      this.smoother = MultiGridSmoother.ensureSmoother(mesh, true, undefined, true);
    }
  }

  initOrigData(mesh) {
    let cd_grid = GridBase.meshGridOffset(mesh);

    let cd_orig;
    let haveGrids = cd_grid >= 0;

    if (haveGrids) {
      cd_orig = mesh.loops.customData.getNamedLayerIndex("__orig_co", "vec3");
      if (cd_orig < 0) {
        let layer = mesh.loops.addCustomDataLayer("vec3", "__orig_co");
        layer.flag |= CDFlags.TEMPORARY;
        cd_orig = layer.index;
      }
    } else {
      cd_orig = mesh.verts.customData.getNamedLayerIndex("__orig_co", "vec3");
      if (cd_orig < 0) {
        let layer = mesh.verts.addCustomDataLayer("vec3", "__orig_co");
        layer.flag |= CDFlags.TEMPORARY;
        cd_orig = layer.index;
      }
    }

    return cd_orig;
  }

  calcUndoMem(ctx) {
    let ud = this._undo;
    let tot = 0;

    tot += ud.vmap.size*(8 + 3*8);
    tot += ud.gmap.size*(16*8); //approximate size of gmap
    tot += ud.gdata.length*8;
    tot += ud.gset.size*8;
    tot += ud.log.calcMemSize();

    return tot;
  }

  undoPre(ctx) {
    let mesh;
    if (ctx.object && ctx.object.data instanceof Mesh) {
      mesh = ctx.object.data;
    }

    let cd_grid = -1, cd_mask = -1;

    if (mesh) {
      cd_grid = GridBase.meshGridOffset(mesh);

      if (cd_grid >= 0) {
        cd_mask = mesh.loops.customData.getLayerIndex("mask");
      } else {
        cd_mask = mesh.verts.customData.getLayerIndex("mask");
      }
    }

    this._undo = {
      mesh : mesh ? mesh.lib_id : -1,
      mode : this.inputs.brush.getValue().tool,
      vmap : new Map(),
      gmap : new Map(),
      mmap : new Map(), //mask data for nongrid verts
      cd_mask,
      gdata: [],
      log  : new MeshLog(),
      gset : new Set()
    };

    if (mesh) {
      this._undo.log.start(mesh);
    }
  }

  undo(ctx) {
    console.log("BVH UNDO!");

    let undo = this._undo;
    let mesh = ctx.datalib.get(undo.mesh);

    if (!mesh) {
      console.warn("eek! no mesh!");
      return;
    }

    let cd_mask = undo.cd_mask;

    let bvh = mesh.bvh;
    let cd_node;

    if (bvh) {
      cd_node = bvh.cd_node;
    }

    let cd_grid = GridBase.meshGridOffset(mesh);
    let gd = undo.gdata;

    console.log("CD_GRID", cd_grid);

    if (cd_grid < 0 && this._undo.log.log.length > 0) {
      let log = this._undo.log;

      log.undo(mesh);
      mesh.regenTesellation();
      mesh.regenBVH();
      bvh = mesh.getBVH();
    }

    let doColors = () => {
      let cd_color = mesh.loops.customData.getLayerIndex("color");

      for (let i = 0; i < gd.length; i += UGTOT) {
        let l = gd[i], index = gd[i + 1], r = gd[i + 2], g = gd[i + 3], b = gd[i + 4], a = gd[i + 5];

        l = mesh.eidmap[l];
        if (!l || !(l instanceof Loop)) {
          console.error("undo error");
          continue;
        }

        let grid = l.customData[cd_grid];
        let p = grid.points[index];

        let c = p.customData[cd_color].color;
        c[0] = r;
        c[1] = g;
        c[2] = b;
        c[3] = a;

        let node = p.customData[cd_node].node;

        if (node) {
          node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS;

          bvh.updateNodes.add(node);
        }
      }

      cd_color = mesh.verts.customData.getLayerIndex("color");

      if (cd_color < 0) {
        return;
      }

      for (let eid of undo.vmap.keys()) {
        let v = mesh.eidmap[eid];

        if (v) {
          v.flag |= MeshFlags.UPDATE;
          v.customData[cd_color].color.load(undo.vmap.get(eid));

          if (bvh) {
            let node = v.customData[cd_node].node;
            if (node) {
              node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS;
            }
          }
        }
      }

      //XXX for now, regen bvh on undo
      mesh.regenBVH();

      mesh.regenRender();
      mesh.regenPartial();
    }

    let doMasks = () => {
      if (cd_mask < 0) {
        return;
      }

      let mmap = undo.mmap;

      for (let i = 0; i < gd.length; i += UGTOT) {
        let l = gd[i], index = gd[i + 1], mask = gd[i + 2];

        l = mesh.eidmap[l];
        if (!l || !(l instanceof Loop)) {
          console.error("undo error");
          continue;
        }

        let grid = l.customData[cd_grid];
        let p = grid.points[index];

        p.customData[cd_mask].value = mask;

        let node = p.customData[cd_node].node;

        if (node) {
          node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS;
          bvh.updateNodes.add(node);
        }
      }

      for (let [veid, mask] of mmap) {
        let v = mesh.eidmap[veid];

        if (!v) {
          continue;
        }

        v.customData[cd_mask].value = mask;
        let node = v.customData[cd_node].node;

        if (node) {
          node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_MASK;
          bvh.updateNodes.add(node);
        }
      }
    }

    let doCoords = () => {
      for (let i = 0; i < gd.length; i += UGTOT) {
        let l = gd[i], index = gd[i + 1], x = gd[i + 2], y = gd[i + 3], z = gd[i + 4];
        let nx = gd[i + 5], ny = gd[i + 6], nz = gd[i + 7];

        l = mesh.eidmap[l];
        if (!l || !(l instanceof Loop)) {
          console.error("undo error");
          continue;
        }

        let grid = l.customData[cd_grid];
        let p = grid.points[index];

        p[0] = x;
        p[1] = y;
        p[2] = z;
        p.no[0] = nx;
        p.no[1] = ny;
        p.no[2] = nz;

        let node = p.customData[cd_node].node;

        if (node) {
          node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS;
          bvh.updateNodes.add(node);
        }
      }

      for (let eid of undo.vmap.keys()) {
        let v = mesh.eidmap[eid];

        if (v) {
          v.flag |= MeshFlags.UPDATE;
          v.load(undo.vmap.get(eid));

          if (bvh) {
            let node = v.customData[cd_node].node;

            if (node) {
              node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS;
              bvh.updateNodes.add(node);
            }
          }
        }
      }

      bvh.update();

      if (cd_grid < 0) {
        mesh.recalcNormals();
      }

      mesh.regenRender();
      mesh.regenPartial();
    }

    let doQuadTreeGrids = () => {
      console.log("gmap:", undo.gmap);
      let gmap = undo.gmap;

      let cd_node = mesh.loops.customData.getLayerIndex("bvh");
      let cd_grid = GridBase.meshGridOffset(mesh);

      let updateloops = new Set();
      let killloops = new Set();

      for (let l of gmap.keys()) {
        let grid1 = l.customData[cd_grid];
        let grid2 = gmap.get(l);

        //forcably unlink verts from uniqueVerts in bvh tree nodes
        //except we're destroy the bvh anyway, and mesh.bvh does this for us
        /*
        if (cd_node >= 0) {
          for (let p of grid1.points) {
            let node = p.customData[cd_node];
            if (node && node.node && node.node.uniqueVerts) {
              node.node.uniqueVerts.delete(p);
            }
            if (node) {
              node.node = undefined;
            }
          }
        }*/

        //bvh.removeFace(l.eid, true);

        grid2.copyTo(grid1, true);

        grid1.recalcFlag |= QRecalcFlags.MIRROR | QRecalcFlags.ALL | QRecalcFlags.TOPO;

        killloops.add(l);

        updateloops.add(l);
        updateloops.add(l.prev.radial_next);
        updateloops.add(l.radial_next.next);
        updateloops.add(l.prev);
        updateloops.add(l.next);
      }

      //bvh.update();

      //let updateflag = QRecalcFlags.NEIGHBORS|QRecalcFlags.POLYS|QRecalcFlags.TOPO|QRecalcFlags.CHECK_CUSTOMDATA;
      let updateflag = QRecalcFlags.ALL | QRecalcFlags.MIRROR;

      for (let l of killloops) {
        let grid = l.customData[cd_grid];

        //bvh.removeFace(l.eid, true);
        grid.recalcFlag |= updateflag;
      }

      //do modified grids first
      for (let l of killloops) {
        let grid = l.customData[cd_grid];

        grid.update(mesh, l, cd_grid);
      }

      //now do neightboring grids
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        grid.update(mesh, l, cd_grid);
      }


      //just regenerate entire bvh tree on undo for now
      if (bvh) {
        bvh.destroy(mesh);
        mesh.bvh = undefined;
      }

      //bvh = mesh.getBVH();
      bvh = undefined;

      if (0) {
        let trisout = [];

        for (let l of killloops) {
          let grid = l.customData[cd_grid];
          grid.makeBVHTris(mesh, bvh, l, cd_grid, trisout);
        }

        while (trisout.length > 0) {
          let ri = (~~(Math.random()*trisout.length/5.0*0.99999))*5;
          let ri2 = trisout.length - 5;

          let eid = trisout[ri];
          let id = trisout[ri + 1];
          let v1 = trisout[ri + 2];
          let v2 = trisout[ri + 3];
          let v3 = trisout[ri + 4];

          bvh.addTri(eid, id, v1, v2, v3);

          for (let j = 0; j < 5; j++) {
            trisout[ri + j] = trisout[ri2 + j];
          }

          trisout.length -= 5;
        }
      }
    }

    let haveQuadTreeGrids = false;
    if (cd_grid >= 0) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        if (grid instanceof QuadTreeGrid) {
          haveQuadTreeGrids = true;
        }

        if (grid instanceof KdTreeGrid) {
          haveQuadTreeGrids = true;
        }
        break;
      }
    }
    let mode = undo.mode;
    let isPaintColor = mode === SculptTools.PAINT || mode === SculptTools.PAINT_SMOOTH;

    if (mode === SculptTools.MASK_PAINT) {
      doMasks();
    } else if (haveQuadTreeGrids) {
      doQuadTreeGrids();
    } else if (isPaintColor) {
      doColors();
    } else {
      doCoords();
    }

    if (bvh) {
      bvh.update();
    }
    window.redraw_viewport(true);
  }


  sampleViewRay(rendermat, _mpos, view, origin, pressure, invert) {
    let ctx = this.modal_ctx;
    let view3d = ctx.view3d, mesh = ctx.mesh;

    if (!mesh || !view3d) {
      return;
    }

    let bvh = mesh.getBVH(false);
    let brush = this.inputs.brush.getValue();
    let mode = brush.tool;

    let ret = super.sampleViewRay(rendermat, _mpos, view, origin, pressure, invert);

    if (!ret) {
      return;
    }

    let {ob, origco, p, isect, radius, vec, mpos, getchannel, w} = ret;
    view = ret.view;

    let strength = brush.strength;
    let planeoff = brush.planeoff;
    let autosmooth = brush.autosmooth;
    let concaveFilter = brush.concaveFilter;
    let pinch = brush.pinch;
    let smoothProj = brush.smoothProj;

    strength = getchannel("strength", strength);
    autosmooth = getchannel("autosmooth", autosmooth);
    concaveFilter = getchannel("concaveFilter", concaveFilter);
    pinch = getchannel("pinch", pinch);
    smoothProj = getchannel("smoothProj", smoothProj);
    let rake = getchannel("rake", brush.rake);

    let haveOrigData = PaintOpBase.needOrig(brush);
    let cd_orig = -1;
    let cd_grid = GridBase.meshGridOffset(mesh);

    if (haveOrigData) {
      cd_orig = this.initOrigData(mesh);
    }

    let p3 = new Vector4(isect.p);
    p3[3] = 1.0;

    let matrix = new Matrix4(ob.outputs.matrix.getValue());
    p3.multVecMatrix(view3d.activeCamera.rendermat);

    if (mode !== SculptTools.SNAKE && mode !== SculptTools.GRAB) {
      vec = new Vector3(isect.tri.v1.no);
      vec.add(isect.tri.v2.no);
      vec.add(isect.tri.v3.no);
      vec.normalize();

      view.negate();
      if (vec.dot(view) < 0) {
        view.negate();
      }
      view.normalize();

      //if (mode !== SculptTools.SMOOTH) {
      vec.interp(view, 1.0 - brush.normalfac).normalize();
      //}
    } else if (!this._first) {
      vec = new Vector3(isect.p).sub(this.last_p);
      let p1 = new Vector3(isect.p);
      let p2 = new Vector3(this.last_p);

      view3d.project(p1);
      view3d.project(p2);

      p1[2] = p2[2];

      view3d.unproject(p1);
      view3d.unproject(p2);

      vec.load(p1).sub(p2);
    }

    //console.log("first", this._first);

    window.redraw_viewport(true);

    if (this._first) {
      this.last_mpos.load(mpos);
      this.last_p.load(isect.p);
      this.last_origco.load(origco);
      this.last_vec.load(vec);
      this.last_radius = radius;
      this._first = false;

      if (mode === SculptTools.GRAB) {
        this.inputs.grabCo.setValue(isect.p);
        this.initGrabData(mesh, isect.p, radius);
      }

      return;
    }
    let spacing = this.inputs.brush.getValue().spacing;
    let steps = this.last_p.vectorDistance(isect.p)/(radius*spacing);

    if (mode === SculptTools.GRAB) {
      steps = 1;
    }

    if (steps < 1) {
      return;
    }
    steps = Math.max(Math.ceil(steps), 1);

    //console.log("STEPS", steps, radius, spacing, this._first);

    const DRAW                                                            = SculptTools.DRAW, SHARP                                  = SculptTools.SHARP, FILL = SculptTools.FILL,
          SMOOTH                                                          = SculptTools.SMOOTH, CLAY                               = SculptTools.CLAY, SCRAPE = SculptTools.SCRAPE,
          PAINT = SculptTools.PAINT, INFLATE = SculptTools.INFLATE, SNAKE = SculptTools.SNAKE,
          PAINT_SMOOTH                                                    = SculptTools.PAINT_SMOOTH, GRAB = SculptTools.GRAB;

    if (mode === SHARP) {
      invert ^= true;
    }

    for (let i = 0; i < steps; i++) {
      let s = (i + 1)/steps;

      let isplane = false;

      switch (mode) {
        case FILL:
        case CLAY:
        case SCRAPE:
          isplane = true;
          break;
        default:
          isplane = false;
          break;
      }

      let sco = new Vector4(this.last_p).interp(isect.p, s);
      sco[3] = 1.0;
      view3d.project(sco);

      let p2 = new Vector3(this.last_p).interp(isect.p, s);
      let op2 = new Vector4(this.last_origco).interp(origco, s);

      p3.load(p2);
      p3[3] = 1.0;
      p3.multVecMatrix(view3d.activeCamera.rendermat);

      let w = p3[3]*matrix.$matrix.m11;

      let vec2 = new Vector3(this.last_vec).interp(vec, s);

      //view3d.makeDrawLine(isect.p, p2, [1, 0, 0, 1]);

      //console.log(isect, isect.tri);

      //vec.load(view);

      let esize = brush.dynTopo.edgeSize;

      esize /= view3d.glSize[1]; //Math.min(view3d.glSize[0], view3d.glSize[1]);
      esize *= w;

      let radius2 = radius + (this.last_radius - radius)*s;

      if (invert) {
        if (isplane) {
          //planeoff = -planeoff;
        } else {
          //strength = -strength;
        }
      }

      let ps = new PaintSample();

      ps.smoothProj = smoothProj;
      ps.pinch = pinch;
      ps.sp.load(sco);
      ps.rake = rake;
      ps.invert = invert;
      ps.origp.load(op2);
      ps.p.load(p2);
      ps.p[3] = w;
      ps.viewPlane.load(view).normalize();

      ps.concaveFilter = concaveFilter;
      ps.autosmooth = autosmooth;
      ps.esize = esize;
      ps.vec.load(vec2);
      ps.planeoff = planeoff;
      ps.radius = radius2;
      ps.strength = strength;

      let lastps;
      let data = this.inputs.samples.data;

      if (data.length > 0) {
        lastps = data[data.length - 1];

        ps.dsp.load(ps.sp).sub(lastps.sp);
        ps.angle = Math.atan2(ps.dsp[1], ps.dsp[0]);

        ps.dvec.load(ps.vec).sub(lastps.vec);
        ps.dp.load(ps.p).sub(lastps.p);
      }

      this.inputs.samples.push(ps);

      if (this.modalRunning) {
        this.execDotWithMirror(ctx, ps, lastps);
      }
    }

    this.last_mpos.load(mpos);
    this.last_p.load(isect.p);
    this.last_origco.load(origco);
    this.last_vec.load(vec);
    this.last_r = radius;
  }

  on_mousemove_old(e) {
    let brush = this.inputs.brush.getValue();
    let mode = brush.tool;
    let pressure = 1.0;

    if (e.was_touch && e.targetTouches && e.targetTouches.length > 0) {
      let t = e.targetTouches[0];

      if (t.pressure !== undefined) {
        pressure = t.pressure;
      } else {
        pressure = t.force;
      }
    }

    let ctx = this.modal_ctx;

    if (!ctx.object || !(ctx.object.data instanceof Mesh)) {
      return;
    }

    let toolmode = ctx.toolmode;
    let view3d = ctx.view3d;

    //the bvh toolmode is responsible for drawing brush circle,
    //make sure it has up to date info for that
    toolmode.mpos[0] = e.x;
    toolmode.mpos[1] = e.y;

    let mpos = view3d.getLocalMouse(e.x, e.y);
    let x = mpos[0], y = mpos[1];

    /*
    let falloff = this.inputs.falloff.getValue();
    let strengthMul = falloff.integrate(1.0) - falloff.integrate(0.0);
    strengthMul = Math.abs(strengthMul !== 0.0 ? 1.0 / strengthMul : strengthMul);
    */

    let radius = brush.radius;
    let strength = brush.strength;
    let planeoff = brush.planeoff;
    let autosmooth = brush.autosmooth;
    let concaveFilter = brush.concaveFilter;
    let pinch = brush.pinch;
    let smoothProj = brush.smoothProj;

    let ch;

    let getdyn = (key, val) => {
      let ch = brush.dynamics.getChannel(key);
      if (ch.useDynamics) {
        return val*ch.curve.evaluate(pressure);
      } else {
        return val;
      }
    }

    strength = getdyn("strength", strength);
    radius = getdyn("radius", radius);
    autosmooth = getdyn("autosmooth", autosmooth);
    concaveFilter = getdyn("concaveFilter", concaveFilter);
    pinch = getdyn("pinch", pinch);
    smoothProj = getdyn("smoothProj", smoothProj);

    let rake = getdyn("rake", brush.rake);

    if (toolmode) {
      toolmode._radius = radius;
    }

    //console.log("pressure", pressure, strength, dynmask);

    let view = view3d.getViewVec(x, y);
    let origin = view3d.activeCamera.pos;

    let ob = ctx.object;
    let mesh = ob.data;

    let bvh = mesh.getBVH(false);

    let axes = [-1];
    let sym = mesh.symFlag;

    for (let i = 0; i < 3; i++) {
      if (mesh.symFlag & (1<<i)) {
        axes.push(i);
      }
    }

    let haveOrigData = PaintOpBase.needOrig(brush);
    let cd_orig = -1;
    let cd_grid = GridBase.meshGridOffset(mesh);

    if (haveOrigData) {
      cd_orig = this.initOrigData(mesh);
    }

    let isect;
    let obmat = ob.outputs.matrix.getValue();
    let matinv = new Matrix4(obmat);
    matinv.invert();

    origin = new Vector3(origin);
    origin.multVecMatrix(matinv);

    view = new Vector4(view);
    view[3] = 0.0;
    view.multVecMatrix(matinv);
    view = new Vector3(view).normalize();

    for (let axis of axes) {
      let view2 = new Vector3(view);
      let origin2 = new Vector3(origin);

      if (axis !== -1) {
        origin2[axis] = -origin2[axis];
        view2[axis] = -view2[axis];
      }

      origin2 = new Vector3(origin2);
      view2 = new Vector3(view2);

      let isect2 = bvh.castRay(origin2, view2);

      //console.log(isect2);

      if (isect2 && (!isect || isect2.dist < isect.dist)) {
        isect = isect2.copy();
        origin = origin2;
        view = view2;
      }
    }

    let origco = new Vector4();

    if (!isect) {
      if ((mode === SculptTools.GRAB || (mode === SculptTools.SNAKE)) && !this._first) {
        let p = new Vector3(this.last_p);
        p.multVecMatrix(obmat);

        view3d.project(p);

        p[0] = mpos[0];
        p[1] = mpos[1];

        view3d.unproject(p);
        p.multVecMatrix(matinv);

        let dis = p.vectorDistance(origin);

        isect = new IsectRet();
        isect.p = p;
        isect.dis = dis;
        isect.tri = undefined;
      } else {
        return;
      }
    } else {
      let tri = isect.tri;

      if (haveOrigData) {
        let o1 = this.getOrigCo(mesh, tri.v1, cd_grid, cd_orig);
        let o2 = this.getOrigCo(mesh, tri.v2, cd_grid, cd_orig);
        let o3 = this.getOrigCo(mesh, tri.v3, cd_grid, cd_orig);

        for (let i = 0; i < 3; i++) {
          origco[i] = o1[i]*isect.uv[0] + o2[i]*isect.uv[1] + o3[i]*(1.0 - isect.uv[0] - isect.uv[1]);
        }

        origco[3] = 1.0;
      } else {
        origco.load(isect.p);
        origco[3] = 1.0;
      }
    }

    let p3 = new Vector4(isect.p);
    p3[3] = 1.0;

    let matrix = new Matrix4(ob.outputs.matrix.getValue());
    p3.multVecMatrix(view3d.activeCamera.rendermat);


    let w = p3[3]*matrix.$matrix.m11;
    //let w2 = Math.cbrt(w);

    if (w <= 0) return;

    radius /= Math.max(view3d.glSize[0], view3d.glSize[1]);
    radius *= Math.abs(w);

    let vec;

    if (mode !== SculptTools.SNAKE && mode !== SculptTools.GRAB) {
      vec = new Vector3(isect.tri.v1.no);
      vec.add(isect.tri.v2.no);
      vec.add(isect.tri.v3.no);
      vec.normalize();

      view.negate();
      if (vec.dot(view) < 0) {
        view.negate();
      }
      view.normalize();

      //if (mode !== SculptTools.SMOOTH) {
      vec.interp(view, 1.0 - brush.normalfac).normalize();
      //}
    } else if (!this._first) {
      vec = new Vector3(isect.p).sub(this.last_p);
      let p1 = new Vector3(isect.p);
      let p2 = new Vector3(this.last_p);

      view3d.project(p1);
      view3d.project(p2);

      p1[2] = p2[2];

      view3d.unproject(p1);
      view3d.unproject(p2);

      vec.load(p1).sub(p2);
    }

    //console.log("first", this._first);

    if (this._first) {
      this.last_mpos.load(mpos);
      this.last_p.load(isect.p);
      this.last_origco.load(origco);
      this.last_vec.load(vec);
      this.last_radius = radius;
      this._first = false;

      if (mode === SculptTools.GRAB) {
        this.inputs.grabCo.setValue(isect.p);
        this.initGrabData(mesh, isect.p, radius);
      }

      return;
    }

    let spacing = this.inputs.brush.getValue().spacing;
    let steps = this.last_p.vectorDistance(isect.p)/(radius*spacing);

    if (mode === SculptTools.GRAB) {
      steps = 1;
    }

    if (steps < 1) {
      return;
    }
    steps = Math.max(Math.ceil(steps), 1);

    //console.log("STEPS", steps, radius, spacing, this._first);

    const DRAW                                                            = SculptTools.DRAW, SHARP                                  = SculptTools.SHARP, FILL = SculptTools.FILL,
          SMOOTH                                                          = SculptTools.SMOOTH, CLAY                               = SculptTools.CLAY, SCRAPE = SculptTools.SCRAPE,
          PAINT = SculptTools.PAINT, INFLATE = SculptTools.INFLATE, SNAKE = SculptTools.SNAKE,
          PAINT_SMOOTH                                                    = SculptTools.PAINT_SMOOTH, GRAB = SculptTools.GRAB;

    let invert = false;
    if (mode === SHARP) {
      invert = true;
    }

    if (e.ctrlKey) {
      //if (mode === SculptTools.INFLATE || mode === SculptTools.SHARP) {
      //}
      if (mode !== SculptTools.PAINT && mode !== SculptTools.PAINT_SMOOTH) {
        invert ^= true;
      }
    }

    for (let i = 0; i < steps; i++) {
      let s = (i + 1)/steps;

      let isplane = false;

      if (e.shiftKey) {
        mode = SMOOTH;
      }

      switch (mode) {
        case FILL:
        case CLAY:
        case SCRAPE:
          isplane = true;
          break;
        default:
          isplane = false;
          break;
      }

      let sco = new Vector4(this.last_p).interp(isect.p, s);
      sco[3] = 1.0;
      view3d.project(sco);

      let p2 = new Vector3(this.last_p).interp(isect.p, s);
      let op2 = new Vector4(this.last_origco).interp(origco, s);

      p3.load(p2);
      p3[3] = 1.0;
      p3.multVecMatrix(view3d.activeCamera.rendermat);

      let w = p3[3]*matrix.$matrix.m11;

      let vec2 = new Vector3(this.last_vec).interp(vec, s);

      //view3d.makeDrawLine(isect.p, p2, [1, 0, 0, 1]);

      //console.log(isect, isect.tri);

      //vec.load(view);

      let esize = brush.dynTopo.edgeSize;

      esize /= view3d.glSize[1]; //Math.min(view3d.glSize[0], view3d.glSize[1]);
      esize *= w;

      let radius2 = radius + (this.last_radius - radius)*s;

      if (invert) {
        if (isplane) {
          //planeoff = -planeoff;
        } else {
          //strength = -strength;
        }
      }

      let ps = new PaintSample();

      ps.smoothProj = smoothProj;
      ps.pinch = pinch;
      ps.sp.load(sco);
      ps.rake = rake;
      ps.invert = invert;
      ps.origp.load(op2);
      ps.p.load(p2);
      ps.p[3] = w;
      ps.viewPlane.load(view).normalize();

      ps.concaveFilter = concaveFilter;
      ps.autosmooth = autosmooth;
      ps.esize = esize;
      ps.vec.load(vec2);
      ps.planeoff = planeoff;
      ps.radius = radius2;
      ps.strength = strength;

      let lastps;
      let data = this.inputs.samples.data;

      if (data.length > 0) {
        lastps = data[data.length - 1];

        ps.dsp.load(ps.sp).sub(lastps.sp);
        ps.angle = Math.atan2(ps.dsp[1], ps.dsp[0]);

        ps.dvec.load(ps.vec).sub(lastps.vec);
        ps.dp.load(ps.p).sub(lastps.p);
      }

      this.inputs.samples.push(ps);
      this.execDotWithMirror(ctx, ps, lastps);
    }

    this.last_mpos.load(mpos);
    this.last_p.load(isect.p);
    this.last_origco.load(origco);
    this.last_vec.load(vec);
    this.last_r = radius;

    window.redraw_viewport(true);
  }

  initGrabData(mesh, co, radius) {
    let sym = this.inputs.symmetryAxes.getValue();
    let axismap = SymAxisMap;

    let bvh = mesh.getBVH(false);
    let vs = bvh.closestVerts(co, radius);
    let co2 = new Vector3();

    let offs = axismap[sym];
    if (offs) {
      for (let off of offs) {
        co2.load(co).mul(off);
        let vs2 = bvh.closestVerts(co2, radius);

        for (let v of vs2) {
          vs.add(v);
        }
      }
    }

    let gd = [];
    let cd_grid = GridBase.meshGridOffset(mesh);
    let haveGrids = cd_grid >= 0;
    let gdists = this.grabDists = [];
    let sign = new Vector3();
    let add = new Vector3();

    if (haveGrids) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];
        grid.update(mesh, l, cd_grid);
      }

      this.grabEidMap = new Map();

      for (let v of vs) {
        gd.push(v.loopEid);
        gd.push(v.eid);

        let dis = v.vectorDistance(co);
        let offs = axismap[sym];

        if (offs) {
          for (let off of offs) {
            co2.load(co).mul(off);
            let dis2 = v.vectorDistance(co2);
            if (dis2 < dis) {
              for (let i = 0; i < 3; i++) {
                if (off[i] < 0) {
                  //dis2 = Math.min(dis2, Math.abs(v[i]-co2[i]));
                }
              }
              dis = dis2;
              sign.load(off);
            }
          }
        }

        gd.push(dis);

        gd.push(sign[0]);
        gd.push(sign[1]);
        gd.push(sign[2]);

        gd.push(add[0]);
        gd.push(add[1]);
        gd.push(add[2]);

        gd.push(0);
        gd.push(0);
        gd.push(0);

        gdists.push(dis);

        this.grabEidMap.set(v.eid, v);
      }
    } else {
      for (let v of vs) {
        gd.push(v.eid);
        gd.push(0);

        add.zero();
        sign[0] = sign[1] = sign[2] = 1.0;

        let offs = axismap[sym];

        let dis = v.vectorDistance(co);
        if (sym && offs) {
          for (let off of offs) {
            for (let i = 0; i < 3; i++) {
              if (off[i] > 0) {
                continue;
              }

              //dis2 = Math.min(dis2, Math.abs(v[i]-co2[i]));
              let f = Math.abs(co[i]) + 0.00001;
              let ratio = radius/f;

              //add[i] = -Math.abs(co[i]);
              sign[i] *= ratio;
            }
          }
        }

        if (offs) {
          for (let off of offs) {
            co2.load(co).mul(off);
            let dis2 = v.vectorDistance(co2);
            if (dis2 < dis) {
              dis = dis2;
              sign.load(off);
              add.zero();

              for (let i = 0; i < 3; i++) {
                if (off[i] > 0) {
                  continue;
                }

                //dis2 = Math.min(dis2, Math.abs(v[i]-co2[i]));
                let f = Math.abs(co2[i]) + 0.00001;
                let ratio = radius/f;

                //add[i] = -Math.abs(co[i]);
                sign[i] *= ratio;
              }

              dis = dis2;
            }
          }
        }

        gd.push(dis);

        gd.push(sign[0]);
        gd.push(sign[1]);
        gd.push(sign[2]);

        gd.push(add[0]);
        gd.push(add[1]);
        gd.push(add[2]);

        gd.push(0);
        gd.push(0);
        gd.push(0);

        gdists.push(dis);
      }
    }

    this.inputs.grabData.setValue(gd);
  }

  execPost() {
    //prevent nasty reference leak in undo stack
    this.grabEidMap = undefined;

    if (this.smoother) {
      //this.smoother.finish();
      this.smoother = undefined;
    }
  }

  _ensureGrabEidMap(ctx) {
    let mesh = ctx.mesh;

    if (!this.grabEidMap) {
      let gdists = this.grabDists = [];

      let gmap = this.grabEidMap = new Map();
      let grids = new WeakSet();
      let gd = this.inputs.grabData.getValue();

      let cd_grid = GridBase.meshGridOffset(mesh);

      if (cd_grid >= 0) {
        for (let i = 0; i < gd.length; i += GTOT) {
          let l = gd[i], p = gd[i + 1], dis = gd[i + 2];

          gdists.push(dis);

          l = mesh.eidmap[l];
          if (!l) {
            console.error("error, missing loop " + l);
            continue;
          }

          let grid = l.customData[cd_grid];
          if (!grids.has(grid)) {
            grids.add(grid);
            grid.update(mesh, l, cd_grid);

            for (let p of grid.points) {
              gmap.set(p.eid, p);
            }
          }
        }
      } else {
        for (let i = 0; i < gd.length; i += GTOT) {
          let eid = gd[i], dis = gd[i + 2];

          let v = mesh.eidmap[eid];
          if (!v) {
            console.warn("Missing vertex error: " + eid + " was missing");
            continue;
          }

          gdists.push(dis);
          gmap.set(v.eid, v);
        }
      }
    }
  }

  execDotWithMirror(ctx, ps, lastps) {
    let sym = this.inputs.symmetryAxes.getValue();

    if (!sym) {
      this.execDot(ctx, ps, lastps);
      return;
    }


    this.execDot(ctx, ps.copy(), lastps ? lastps.copy() : undefined);

    let offs = SymAxisMap[sym];

    let mode = this.inputs.brush.getValue().tool;
    if (mode === SculptTools.GRAB || mode === SculptTools.SNAKE) {
      return;
    }

    if (!offs) {
      return;
    }

    for (let off of offs) {
      off = new Vector4(off);
      off[3] = 1.0;

      let mps = ps.copy();
      let mlastps = lastps ? lastps.copy().mirror(off) : undefined;

      mps.mirror(off);

      let gco = this.inputs.grabCo.getValue();
      let orig = new Vector3(gco);

      gco.mul(off);
      this.inputs.grabCo.setValue(gco);

      this.execDot(ctx, mps, mlastps);

      this.inputs.grabCo.setValue(orig);
    }
  }

  exec(ctx) {
    let i = 0;
    let lastps;

    if (!this.modalRunning) {
      let mesh = ctx.mesh;
      let brush = this.inputs.brush.getValue();

      let haveOrigData = PaintOpBase.needOrig(brush);

      if (haveOrigData) {
        this.initOrigData(mesh);
      }

      if (mesh) {
        mesh.getBVH();
      }
    }

    for (let ps of this.inputs.samples) {
      this.execDotWithMirror(ctx, ps, lastps);
      lastps = ps;
    }

    /*
    for (let p of this.inputs.points) {
      this.execDot(ctx, p, this.inputs.vecs.getListItem(i), this.inputs.extra.getListItem(i), lastp);
      lastp = p;
      i++;
    }*/

    window.redraw_viewport(true);
  }

  getOrigCo(mesh, v, cd_grid, cd_orig) {
    let gset = this._undo.gset;
    let gmap = this._undo.gmap;
    let vmap = this._undo.vmap;

    if (cd_grid >= 0 && mesh.eidmap[v.loopEid]) {
      let l = mesh.eidmap[v.loopEid];
      let grid = l.customData[cd_grid];

      if (grid instanceof Grid) {
        let gdimen = grid.dimen;
        let id = v.loopEid*gdimen*gdimen + v.index;

        //let execDot set orig data
        if (!gset.has(id)) {
          return v;
        }
      } else {
        if (!gmap.has(l)) {
          return v;
        }
      }
    } else {
      //let execDot set orig data
      if (!vmap.has(v.eid)) {
        return v;
        //v.customData[cd_orig].value.load(v);
        //vmap.set(v.eid, new Vector3(v));
      }
    }

    //ok, we have valid orig data? return it
    return v.customData[cd_orig].value;
  }

  sampleNormal(ctx, mesh, bvh, p, radius) {
    let vs = bvh.closestVerts(p, radius);

    let no = new Vector3();

    for (let v of vs) {
      no.add(v.no);
    }

    no.normalize();
    return no;
  }

  execDot(ctx, ps, lastps) {//ctx, p3, vec, extra, lastp3 = p3) {
    let brush = this.inputs.brush.getValue();
    let falloff = brush.falloff;
    let haveTex = brush.texUser.texture !== undefined;
    let texScale = 1.0;
    let tex = brush.texUser.texture;

    if (this.inputs.brush.getValue().tool === SculptTools.GRAB) {
      this._ensureGrabEidMap(ctx);
    }

    const DRAW                                                            = SculptTools.DRAW, SHARP = SculptTools.SHARP, FILL = SculptTools.FILL,
          SMOOTH                                                          = SculptTools.SMOOTH, CLAY                               = SculptTools.CLAY, SCRAPE = SculptTools.SCRAPE,
          PAINT = SculptTools.PAINT, INFLATE = SculptTools.INFLATE, SNAKE = SculptTools.SNAKE,
          PAINT_SMOOTH                                                    = SculptTools.PAINT_SMOOTH, GRAB = SculptTools.GRAB,
          COLOR_BOUNDARY                                                  = SculptTools.COLOR_BOUNDARY,
          MASK_PAINT                                                      = SculptTools.MASK_PAINT,
          WING_SCRAPE                                                     = SculptTools.WING_SCRAPE;

    if (!ctx.object || !(ctx.object.data instanceof Mesh)) {
      console.log("ERROR!");
      return;
    }

    let mode = this.inputs.brush.getValue().tool;
    let haveOrigData = PaintOpBase.needOrig(brush);

    let undo = this._undo;
    let vmap = undo.vmap;
    let gset = undo.gset;
    let gmap = undo.gmap;
    let gdata = undo.gdata;

    let ob = ctx.object;
    let obmat = ob.outputs.matrix.getValue();
    let mesh = ob.data;

    let mres, oldmres;

    let bvh = mesh.getBVH(false);
    let vsw;

    /* test deforming base (well, level 1) of grid but displaying full thing
    if (GridBase.meshGridOffset(mesh) >= 0) {
      let cd_grid = GridBase.meshGridOffset(mesh);
      let layer = mesh.loops.customData.flatlist[cd_grid];

      mres = mesh.loops.customData.getLayerSettings(layer.typeName);
      if (mres) {
        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];
          let co = new Vector3();

          for (let p of grid.points) {
            co.load(p);
            let tot = 1;

            for (let pr of p.bRing) {
              co.add(pr);
              tot++;
            }

            co.mulScalar(1.0 / tot);
            p.load(co);
          }

          grid.recalcFlag |= QRecalcFlags.NORMALS|QRecalcFlags.TOPO|QRecalcFlags.NEIGHBORS;
          grid.update(mesh, l, cd_grid);
        }

        oldmres = mres.copy();

        mres.flag |= GridSettingFlags.ENABLE_DEPTH_LIMIT;
        mres.depthLimit = 1;

        mesh.regenBVH();
        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];

          grid.recalcFlag |= QRecalcFlags.NORMALS|QRecalcFlags.TOPO|QRecalcFlags.NEIGHBORS;
          grid.update(mesh, l, cd_grid);
        }
        bvh = mesh.getBVH(false);
      }
    }
    //*/

    let pinch = ps.pinch;
    let radius = ps.radius;
    let strength = ps.strength;

    let smoothProj = ps.smoothProj;
    let cd_mask;


    let haveGrids = bvh.cd_grid >= 0;
    let cd_grid = bvh.cd_grid;

    if (haveGrids) {
      cd_mask = mesh.loops.customData.getLayerIndex("mask");
    } else {
      cd_mask = mesh.verts.customData.getLayerIndex("mask");
    }

    if (mode === MASK_PAINT && cd_mask < 0) {
      if (haveGrids) {
        mesh.verts.addCustomDataLayer("mask");
        GridBase.syncVertexLayers(mesh);

        cd_mask = mesh.loops.customData.getLayerIndex("mask");
      } else {
        cd_mask = mesh.verts.addCustomDataLayer("mask").index;
      }
    }

    let doTopo = mode === SculptTools.TOPOLOGY || (brush.dynTopo.flag & DynTopoFlags.ENABLED);
    doTopo = doTopo && !this.inputs.useMultiResDepth.getValue();

    let isPaintMode = mode === PAINT || mode === PAINT_SMOOTH;
    let isMaskMode = mode === MASK_PAINT;

    let planeoff = ps.planeoff;
    let pinchpower = 1.0;
    let pinchmul = 1.0;

    let isplane = false;

    let vec = new Vector3(ps.vec);
    let planep = new Vector3(ps.p);

    let esize = ps.esize;

    let w = ps.p[3];

    if (haveTex) {
      texScale *= 10.0/w;
    }

    switch (mode) {
      case SMOOTH:
      case PAINT_SMOOTH:
        vsw = Math.abs(strength) + ps.autosmooth;
        break;
      default:
        vsw = ps.autosmooth; //autosmooth
        break;
    }

    let wvec1 = new Vector3();
    let wvec2 = new Vector3();
    let wtan = new Vector3();
    let wtmp1 = new Vector3();
    let wtmp2 = new Vector3();
    let wtmp3 = new Vector3();
    let wno = new Vector3();
    let woff = planeoff;
    let wplanep1 = new Vector3();
    let wplanep2 = new Vector3();

    if (mode === WING_SCRAPE) {
      isplane = true;

      pinchpower = 3.0;
      pinchmul = 0.25;

      //sample normal
      let no = this.sampleNormal(ctx, mesh, bvh, ps.p, radius*0.25);
      let tan = new Vector3(ps.dp);

      let d = no.dot(tan);
      tan.addFac(no, -d).normalize();

      let len = vec.vectorLength();
      let quat = new Quat();

      let th = Math.PI*0.2;
      quat.axisAngleToQuat(tan, -th);
      quat.normalize();
      let mat = quat.toMatrix();

      wvec1.load(no)//.mulScalar(len);
      wvec1.multVecMatrix(mat);

      quat.axisAngleToQuat(tan, th);
      quat.normalize();
      mat = quat.toMatrix();

      wvec2.load(no)//.mulScalar(len);
      wvec2.multVecMatrix(mat);

      wno.load(no);
      wtan.load(tan);

      //planep.load(ps.p).addFac(wno, woff);

      woff = ps.planeoff*0.25;

      wplanep1.load(ps.p).addFac(wvec1, -0.005);
      wplanep2.load(ps.p).addFac(wvec2, -0.005);

      //wplanep1.addFac(wno, woff);
      //wplanep2.addFac(wno, woff);

      planeoff = 0;
      //vec.multVecMatrix(mat);
      //vec.load(tan).mulScalar(len);
      //
    } else if (mode === MASK_PAINT) {
      strength = Math.abs(strength);
    } else if (mode === SCRAPE) {
      planeoff += -1.0;
      //strength *= 5.0;
      isplane = true;
    } else if (mode === FILL) {
      planeoff -= 0.1;

      strength *= 0.5;
      isplane = true;
    } else if (mode === CLAY) {
      planeoff += 0.5;

      //strength *= 2.0;

      isplane = true;
    } else if (mode === SMOOTH) {
      isplane = !(brush.flag & BrushFlags.MULTIGRID_SMOOTH);
      isplane = isplane && (brush.flag & BrushFlags.PLANAR_SMOOTH);

      if (brush.flag & BrushFlags.MULTIGRID_SMOOTH) {
        strength *= 0.15;
      }

      //if (1 || (brush.flag & BrushFlags.MULTIGRID_SMOOTH)) {
      radius *= 1.0 + vsw*vsw;

      //}
    } else if (mode === PAINT) {

    } else if (mode === SHARP) {
      let t1 = new Vector3(ps.dp);

      //isplane = true;
      //planeoff += 3.0;
      //strength *= 2.0;
    } else if (mode === GRAB) {
      strength *= 5.0;
      isplane = false;
    } else if (mode === SNAKE) {
      isplane = false;
    }

    if (ps.invert) {//isplane && strength < 0) {
      //strength = Math.abs(strength);
      if (isplane) {
        planeoff = -planeoff;
      } else if (mode !== SMOOTH && mode !== PAINT_SMOOTH) {
        strength *= -1;
      }
    }

    let updateflag = BVHFlags.UPDATE_DRAW;
    if (mode !== PAINT && mode !== PAINT_SMOOTH) {
      updateflag |= BVHFlags.UPDATE_NORMALS;
    } else {
      updateflag |= BVHFlags.UPDATE_COLORS;
    }

    let cd_orig = -1;

    if (haveOrigData) {
      cd_orig = this.initOrigData(mesh);
    }

    let sym = mesh.symFlag;

    if (mode !== SNAKE) {
      //let w2 = Math.pow(Math.abs(w), 0.5)*Math.sign(w);
      let w2 = Math.pow(Math.abs(radius), 0.5)*Math.sign(radius);

      planeoff *= w2;

      vec.mulScalar(strength*0.1*w2);
    }


    let vlen = vec.vectorLength();
    let nvec = new Vector3(vec).normalize();
    let nvec2 = new Vector3(nvec);

    planep.addFac(nvec, planeoff*radius*0.5);

    if (0 && mode === SHARP) {
      let q = new Quat();
      let pth = Math.PI*0.35;

      q.axisAngleToQuat(nvec, pth);
      let mat = q.toMatrix();

      nvec.multVecMatrix(mat);

      q.axisAngleToQuat(nvec2, -pth);
      mat = q.toMatrix();

      nvec2.multVecMatrix(mat);
    }

    let p3 = new Vector3(ps.p);

    //query bvh tree
    let vs;
    let gd;
    let signs = [];
    let goffs = [];
    let gidxs = [];

    if (mode === GRAB) {
      let gmap = this.grabEidMap;
      gd = this.inputs.grabData.getValue();
      vs = new Set();

      if (haveGrids) {
        for (let i = 0; i < gd.length; i += GTOT) {
          let leid = gd[i], peid = gd[i + 1], dis = gd[i + 2];

          let v = gmap.get(peid);
          if (!v) {
            console.warn("Missing grid vert " + peid);
            throw new Error("missing grid vert");
            continue;
          }

          let sx = gd[i + 3], sy = gd[i + 4], sz = gd[i + 5];
          signs.push(sx);
          signs.push(sy);
          signs.push(sz);

          let ox = gd[i + 6], oy = gd[i + 7], oz = gd[i + 8];

          goffs.push(ox);
          goffs.push(oy);
          goffs.push(oz);

          vs.add(v);
          gidxs.push(i);
        }
      } else {
        for (let i = 0; i < gd.length; i += GTOT) {
          let v = mesh.eidmap[gd[i]];

          if (!v) {
            console.warn("Missing vert " + gd[i]);
            //signs.length += 3;
            //goffs.length += 3;
            //vs.push(new Vector3());

            continue;
          }

          let sx = gd[i + 3], sy = gd[i + 4], sz = gd[i + 5];
          signs.push(sx);
          signs.push(sy);
          signs.push(sz);

          let ox = gd[i + 6], oy = gd[i + 7], oz = gd[i + 8];

          goffs.push(ox);
          goffs.push(oy);
          goffs.push(oz);

          vs.add(v);
          gidxs.push(i);
        }
      }
    } else {
      vs = bvh.closestVerts(p3, radius);
    }

    if (doTopo && !haveGrids) {
      let log = this._undo.log;
      log.checkStart(mesh);

      for (let v of vs) {
        log.ensure(v);
      }
    }


    if (mode === SNAKE) {
      p3.zero();
      let tot = 0.0;

      for (let v of vs) {
        p3.add(v);
        tot++;
      }

      if (tot) {
        p3.mulScalar(1.0/tot);
      }
    }

    let rmat;

    if (mode === SNAKE && lastps) {
      rmat = new Matrix4();

      let t1 = new Vector3(ps.dp).normalize();
      let t2 = new Vector3(lastps.dp).normalize();
      let t3 = new Vector3(t2).cross(t1);
      let c = lastps.p;

      if (1 || t1.dot(t2) > 0.05) {
        let quat = new Quat();

        t1.cross(ps.viewPlane).normalize();
        t2.cross(ps.viewPlane).normalize();

        let th = t1.dot(t2)*0.99999;
        th = Math.acos(th);

        if (t3.dot(ps.viewPlane) < 0) {
          th = -th;
        }

        //th *= 0.75;
        //th *= 1.25;
        th *= 0.98;

        quat.axisAngleToQuat(ps.viewPlane, th);

        let tmat = new Matrix4();
        tmat.makeIdentity().translate(c[0], c[1], c[2]);

        quat.toMatrix(rmat);
        rmat.preMultiply(tmat);

        tmat.makeIdentity().translate(-c[0], -c[1], -c[2]);
        rmat.multiply(tmat);
      }
    } else if (mode === SNAKE) {
      rmat = new Matrix4();
    }


    let _tmp = new Vector3();

    let vsmooth, gdimen, cd_color, have_color;
    let haveQuadTreeGrids = false;

    if (haveGrids) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        if (grid instanceof QuadTreeGrid) {
          haveQuadTreeGrids = true;
        } else if (grid instanceof KdTreeGrid) {
          haveQuadTreeGrids = true;
        }

        break;
      }
    }

    let origset = new WeakSet();
    let mmap = this._undo.mmap;

    function doUndo(v) {
      if (!haveGrids && mode === MASK_PAINT && cd_mask >= 0 && !mmap.has(v.eid)) {
        mmap.set(v.eid, v.customData[cd_mask].value);
      }

      if (doTopo && !haveGrids) {
        if (haveOrigData && !vmap.has(v)) {
          let data = v.customData[cd_orig].value;

          data.load(v);

          if (isPaintMode && have_color) {
            vmap.set(v.eid, new Vector4(v.customData[cd_color].color));
          } else {
            vmap.set(v.eid, new Vector3(data));
          }
        }

        return;
      }

      if (!haveGrids && !vmap.has(v.eid)) {
        if (haveOrigData) {
          v.customData[cd_orig].value.load(v);
        }

        if (isPaintMode && have_color) {
          vmap.set(v.eid, new Vector4(v.customData[cd_color].color));
        } else if (!isPaintMode) {
          vmap.set(v.eid, new Vector3(v));
        }
      } else if (haveQuadTreeGrids) {
        let node = v.customData[cd_node];
        if (node.node) {
          node.node.flag |= updateflag;
        }

        if (v.loopEid !== undefined) {
          let l = mesh.eidmap[v.loopEid];

          if (l && l instanceof Loop && l.eid === v.loopEid) {
            let grid = l.customData[cd_grid];

            if (!gmap.has(l)) {
              if (haveOrigData) {
                for (let p of grid.points) {
                  p.customData[cd_orig].value.load(p);
                }
              }

              grid.recalcFlag |= QRecalcFlags.MIRROR;

              let gridcpy = new grid.constructor();
              grid.copyTo(gridcpy, true);

              gmap.set(l, gridcpy)
              grid.update(mesh, l, cd_grid);
              grid.relinkCustomData();
            }
          }
        }
      } else if (haveGrids) {
        let id = v.loopEid*gdimen*gdimen + v.index;

        if (!gset.has(id)) {
          if (haveOrigData) {
            v.customData[cd_orig].value.load(v);
          }

          gset.add(id);

          let gi = gdata.length;
          gdata.length += UGTOT;

          gdata[gi++] = v.loopEid;
          gdata[gi++] = v.index;

          if (isPaintMode) {
            let c = v.customData[cd_color].color;
            gdata[gi++] = c[0];
            gdata[gi++] = c[1];
            gdata[gi++] = c[2];
            gdata[gi++] = c[3];
          } else if (isMaskMode) {
            let mask = 1.0;

            if (cd_mask >= 0) {
              mask = v.customData[cd_mask].value;
            }

            gdata[gi++] = mask;
          } else {
            gdata[gi++] = v[0];
            gdata[gi++] = v[1];
            gdata[gi++] = v[2];
            gdata[gi++] = v.no[0];
            gdata[gi++] = v.no[1];
            gdata[gi++] = v.no[2];
          }
        }
      }
    }

    function doGridBoundary(v) {
      //return;
      doUndo(v.bLink.v1);

      if (v.bLink.v2) {
        //doUndo(v.bLink.v2);
      }

      if (isPaintMode && have_color) {
        let c1 = v.customData[cd_color].color;
        let c2 = v.bLink.getColor(cd_color);

        c1.interp(c2, 0.5);

        //if (isNaN(c1.dot(c1))) {
        //  c1.load(c2);
        //}

        if (!v.bLink.v2) {
          let c2 = v.bLink.v1.customData[cd_color].color;
          c2.load(c1);
        }
      } else if (!isPaintMode) {
        let co = v.bLink.get();

        if (!v.bLink.v2) {
          v.interp(co, 0.5);
          v.bLink.v1.load(v, true);
        } else {
          v.load(co);
        }
      }
      let node = v.bLink.v1.customData[cd_node].node;

      if (node) {
        bvh.updateNodes.add(node);
        node.flag |= updateflag;
      }

      if (v.bLink.v2) {
        node = v.bLink.v2.customData[cd_node].node;

        if (node) {
          bvh.updateNodes.add(node);
          node.flag |= updateflag;
        }
      }
    }

    let colorfilter;
    let smoothmap = new Map();

    if (haveGrids) {
      colorfilter = colorfilterfuncs[1];

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        gdimen = grid.dimen;
        break;
      }

      vsmooth = (v, fac) => {
        _tmp.zero();
        let w = 0.0;

        for (let vr of v.bRing) {//v.neighbors) {
          doUndo(vr);
          vr.interp(v, 0.5);
          v.load(vr, true);
        }

        for (let vr of v.bRing) {
          for (let v2 of vr.neighbors) {
            if (v2 === vr || v2.loopEid !== vr.loopEid) {
              continue;
            }

            let w2 = 1.0;
            _tmp.addFac(v2, w2);
            w += w2;
          }
        }

        for (let v2 of v.neighbors) {
          if (v2.loopEid !== v.loopEid) {
            continue;
          }

          _tmp.add(v2);
          w++;
        }

        if (w !== 0.0) {
          _tmp.mulScalar(1.0/w);
          v.interp(_tmp, fac);
        }

        /*
        for (let v2 of v.bRing) {
          v2[0] = v[0];
          v2[1] = v[1];
          v2[2] = v[2];
        }//*/
      };
    } else if (!(brush.flag & BrushFlags.MULTIGRID_SMOOTH)) {
      colorfilter = colorfilterfuncs[0];
      let _tmp2 = new Vector3();
      let _tmp3 = new Vector3();
      let _tmp4 = new Vector3();

      let velfac = window.dd !== undefined ? window.dd : 0.75;
      if (mode !== GRAB) {
        velfac *= (strength*0.5 + 0.5);
        velfac *= (1.0 - smoothProj)*0.75 + 0.25;
      } else {
        velfac = 0.5;
        velfac *= (1.0 - smoothProj)*0.75 + 0.25;
      }

      vsmooth = (v, fac) => {
        let vel = v.customData[cd_node].vel;

        _tmp2.zero();
        let count = 0;
        let totw = 0.0;

        for (let v2 of v.neighbors) {
          let w = 1.0;
          //w = Math.sqrt(w);
          //w *= w;

          if (smoothProj !== 0.0) {
            let w2 = v2.vectorDistanceSqr(v);
            w += (w2 - w)*smoothProj;

            let t = _tmp4.load(v2).sub(v);
            let d = t.dot(v.no);

            t.addFac(v.no, -d).add(v);

            _tmp2.addFac(t, smoothProj*w);
            _tmp2.addFac(v2, (1.0 - smoothProj)*w);
          } else {
            _tmp2.addFac(v2, w);
          }
          let vel2 = v2.customData[cd_node].vel;

          vel2.interp(vel, 0.2*velfac);

          totw += w;
          count++;
        }

        if (count === 0.0) {
          return;
        }

        //let w2 = totw/count*0.1;
        //_tmp2.addFac(v, w2);
        //totw += w2;
        //count++;

        _tmp2.mulScalar(1.0/totw);
        _tmp3.load(v);

        v.interp(_tmp2, fac);
        v.addFac(vel, 0.5*velfac);

        _tmp3.sub(v).negate();
        vel.interp(_tmp3, 0.5);
      }
    } else {
      colorfilter = colorfilterfuncs[0];

      vsmooth = (v, fac = 0.5) => {
        this.ensureSmoother(mesh);
        smoothmap.set(v, fac/vsw);
      }
    }

    let _rtmp = new Vector3();
    let _rtmp2 = new Vector3();
    let _rdir = new Vector3();
    _rdir.load(ps.dp).normalize();

    let rakefac = ps.rake;

    let rtmps = util.cachering.fromConstructor(Vector3, 64);

    function rerror(v) {
      let d1 = rtmps.next();
      let d2 = rtmps.next();
      let err = 0.0;

      d1.load(ps.dp).normalize();
      let d = d1.dot(v.no);

      d1.addFac(v.no, -d).normalize();

      if (Math.random() > 0.999) {
        console.log("d1", d1.dot(v.no));
      }
      for (let v2 of v.neighbors) {
        d2.load(v2).sub(v);

        let d = d2.dot(v.no);
        d2.addFac(v.no, -d).normalize();

        let w = d1.dot(d2);

        w = Math.abs(w);
        w = 1.0 - Math.abs(w - 0.5)*2.0;
        w = 1.0 - Math.abs(w - 0.5)*2.0;

        err += w*w;
      }

      return err;
    }

    let rake2 = (v, fac = 0.5) => {
      let co = _rtmp.zero();
      let g = _rtmp2.zero();

      let df = 0.0001;

      let r1 = rerror(v);
      let totg = 0.0;

      for (let i = 0; i < 3; i++) {
        let orig = v[i];

        v[i] += df;
        let r2 = rerror(v);
        v[i] = orig;

        g[i] = (r2 - r1)/df;
        totg += g[i]*g[i];
      }

      if (totg === 0.0) {
        return;
      }

      r1 /= totg;
      g.mulScalar(-r1);

      //co.load(v).add(g);

      if (Math.random() > 0.999) {
        console.log(co, v[0], v[1], v[2]);
      }

      v.addFac(g, 0.25*fac);
    }

    let _rtmp3 = new Vector3();

    let rake = (v, fac = 0.5) => {
      //return rake2(v, fac);

      if (fac === 0.0) {
        return;
      }

      let co = _rtmp.zero();
      let tot = 0.0;

      let d1 = _rdir;
      let d2 = _rtmp2;
      //let d3 = _rtmp3;

      d1.load(ps.dp);
      let d = d1.dot(v.no);
      d1.addFac(v.no, -d).normalize();

      if (Math.abs(ps.angle) > Math.PI) {
        d1.negate();
      }

      let pad = 0.025;//5*(1.35 - fac);

      for (let v2 of v.neighbors) {
        d2.load(v2).sub(v);

        let nfac = -d2.dot(v.no);
        d2.addFac(v.no, nfac);
        d2.normalize();

        let w;

        if (0) {
          let w2 = d1.dot(d2);
          w = d2.cross(d1).vectorLength();
          //let w = d1.dot(d2);
          //w = 1.0 - Math.abs(w-0.5)*2.0;

          w = 1.0 - w;
          w *= w*w*w;

          w2 = 1.0 - Math.abs(w2);
          w2 *= w2*w2*w2;

          w = w*0.5 + w2*0.5;
        } else {
          w = d1.dot(d2);
          w = Math.acos(w*0.99999)/Math.PI;
          w = 1.0 - Math.tent(w);
          //w = Math.abs(w);

          w = Math.tent(w - 0.5);
        }

        w = w*(1.0 - pad) + pad;
        co.addFac(v2, w);
        co.addFac(v.no, nfac*w);
        tot += w;
      }

      if (tot === 0.0) {
        return;
      }

      co.mulScalar(1.0/tot);
      v.interp(co, fac);
    }

    let dopinch = (v, f) => {
      f = Math.pow(f, pinchpower);

      let f3 = f*Math.abs(strength);

      let height = radius*2.0;

      let oco = v.customData[cd_orig].value;

      conetmp.load(ps.p).addFac(nvec, planeoff*radius*0.25 + 0.5);
      planetmp.load(conetmp).addFac(nvec, height);

      let r = closest_point_on_line(v, conetmp, planetmp, false);

      let origdis = v.vectorDistance(oco);
      let fac = 1.0 - Math.min(2.0*origdis/radius, 1.0);

      planetmp.load(v).sub(r[0]).mulScalar(0.5).add(r[0]);
      v.interp(planetmp, pinchmul*f3*pinch*fac);
    }

    let _ctmp = new Vector3();
    let abs = Math.abs;

    let colorboundary = (v, fac) => {
      let co = _ctmp.zero();
      let c1 = v.customData[cd_color].color;

      co.add(v);
      let tot = 1.0;

      for (let v2 of v.neighbors) {
        let c2 = v2.customData[cd_color].color;

        let dr = abs(c1[0] - c2[0]);
        let dg = abs(c1[1] - c2[1]);
        let db = abs(c1[2] - c2[2]);

        let w = (dr*1.25 + dg*1.5 + db)*0.25;
        //w *= w;

        co.addFac(v2, w);
        tot += w;
      }

      if (tot === 0.0) {
        return;
      }

      co.mulScalar(1.0/tot);

      v.interp(co, fac);
    };

    let cd_node = bvh.cd_node;
    let ws = new Array(vs.size);

    if (bvh.cd_grid >= 0) {
      cd_color = mesh.loops.customData.getLayerIndex("color");
    } else {
      cd_color = mesh.verts.customData.getLayerIndex("color");
    }
    have_color = cd_color >= 0;

    if (isPaintMode && !have_color) {
      cd_color = mesh.verts.addCustomDataLayer("color").index;

      if (bvh.cd_grid >= 0) {
        GridBase.syncVertexLayers(mesh);
        cd_color = mesh.loops.customData.getLayerIndex("color");
      }

      have_color = true;
    }

    let color, concaveFilter = ps.concaveFilter;
    let invertConcave = brush.flag & BrushFlags.INVERT_CONCAVE_FILTER;

    if (have_color) {
      color = new Vector4(this.inputs.brush.getValue().color);
    }

    if (mode === COLOR_BOUNDARY && !have_color) {
      return;
    }

    let wi = 0;

    let planetmp = new Vector3();
    let conetmp = new Vector3();
    let planetmp2 = new Vector3();
    let planetmp3 = new Vector3();

    if (isPaintMode && !have_color) {
      return;
    }

    let astrength = Math.abs(strength);
    let bLinks = new Set();

    let gdists = this.grabDists, idis = 0;

    wi = 0;
    let vi = 0;

    for (let v of vs) {
      doUndo(v);

      let pco = p3;
      if (mode === SHARP) {// || (mode === SMOOTH && (brush.flag & BrushFlags.MULTIGRID_SMOOTH))) {
        //vco = v.customData[cd_orig].value;
        pco = ps.origp || ps.p;
      }

      let dis = mode === GRAB ? gdists[idis++] : v.vectorDistance(pco);


      let f = Math.max(1.0 - dis/radius, 0.0);
      let w1 = f;
      let f2 = f;

      f = falloff.evaluate(f);

      let texf = 1.0;

      if (haveTex) {
        texf = tex.evaluate(v, texScale);
        f *= texf;
      }

      if (mode !== MASK_PAINT && cd_mask >= 0) {
        f *= v.customData[cd_mask].value;
      }

      /*if (mode === SHARP) {
        let d = 1.0 - Math.max(v.no.dot(nvec), 0.0);

        //d = 1.0 - d;
        //d *= d*d*d*d;
        d *= d;
        //d = 1.0 - d;

        f2 *= f2;

        //v.addFac(v.no, -vlen*d*f2*0.5*strength);
        v.addFac(vec, f);//
      } else */
      if (mode === WING_SCRAPE) {
        f2 = f*strength;

        let t = wtmp1.load(v).sub(ps.p);
        let d = t.dot(wno);
        t.addFac(wno, -d).normalize();
        t.cross(wtan);

        let nvec;

        t.normalize();
        let th = t.dot(wno);
        let doboth = false;

        //let d2 = wtmp2.load(v).sub(ps.p).dot(t);

        f2 *= 0.3;

        if (th < 0.0 || doboth) {
          nvec = wvec1;

          let co = planetmp.load(v);
          co.sub(wplanep1);

          d = co.dot(nvec);
          v.addFac(nvec, -d*f2);
        }

        if (th >= 0.0 || doboth) {
          nvec = wvec2;

          let co = planetmp.load(v);
          co.sub(wplanep2);

          d = co.dot(nvec);
          v.addFac(nvec, -d*f2);
        }
      } else if (mode === MASK_PAINT) {
        let f2 = ps.invert ? astrength*0.5 : -astrength*0.5;

        let mask = v.customData[cd_mask];
        let val = mask.value;

        val += f2;
        val = Math.min(Math.max(val, 0.0), 1.0);

        val = mask.value + (val - mask.value)*f;
        mask.value = val;

        v.flag |= MeshFlags.UPDATE;

        let node = v.customData[cd_node].node;
        if (node) {
          node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_MASK;
          bvh.updateNodes.add(node);
        }
      } else if (mode === SHARP) {
        v.addFac(vec, f);
      } else if (mode === SMOOTH && isplane) {
        planetmp.load(v);
        vsmooth(v, f*strength);
        let dist = planetmp.vectorDistance(v);

        f2 = w1*w1*(3.0 - 2.0*w1)*w1;
        f2 *= strength*0.25;

        let co = planetmp.load(v);
        co.sub(planep);

        let n = planetmp2.load(nvec);

        let nco = planetmp3.load(co);
        nco.normalize();

        if (n.dot(co) < -0.5) {
          f2 = -f2;
        }

        let d = co.dot(n);

        let s1 = Math.sign(d);
        d = Math.max((Math.abs(d) - dist), 0)*s1;

        v.addFac(n, -d*f2);
      } else if (isplane) {
        f2 = f*strength;

        let co = planetmp.load(v);
        co.sub(planep);
        co.addFac(nvec, -f*radius*0.25*(ps.invert ? -1 : 1));

        let d = co.dot(nvec);

        v.addFac(nvec2, -d*f2*0.2);
      } else if (mode === DRAW) {
        v.addFac(vec, f);//
      } else if (have_color && mode === PAINT) {
        if (concaveFilter !== 0.0) {
          let cf = calcConcave(v);

          if (invertConcave) {
            cf = 1.0 - cf;
          }

          cf = Math.pow(cf*1.25, (concaveFilter + 1.0)*4.0);
          cf = cf < 0.0 ? 0.0 : cf;
          cf = cf > 1.0 ? 1.0 : cf;

          f *= cf;
        }
        let c = v.customData[cd_color];

        c.color.interp(color, f*strength);
      } else if (mode === INFLATE) {
        v.addFac(v.no, f*strength*0.025);
      } else if (mode === SNAKE) {
        v.interp(v.customData[cd_orig].value, 0.1*f);
        v.addFac(vec, f*strength);

        _tmp.load(v).multVecMatrix(rmat);
        v.interp(_tmp, f*strength);
      } else if (mode === GRAB) {
        //v.load(v.customData[cd_orig].value);

        let i = vi*3;
        let gi = gidxs[vi];

        let gx = goffs[i];
        let gy = goffs[i + 1];
        let gz = goffs[i + 2];

        let disx = (dis + gx)*Math.abs(signs[i]);
        let disy = (dis + gy)*Math.abs(signs[i + 1]);
        let disz = (dis + gz)*Math.abs(signs[i + 2]);

        //disx = disy = disz = dis;

        let fx = Math.max(1.0 - disx/radius, 0.0);
        let fy = Math.max(1.0 - disy/radius, 0.0);
        let fz = Math.max(1.0 - disz/radius, 0.0);

        fx = falloff.evaluate(fx)*texf;
        fy = falloff.evaluate(fy)*texf;
        fz = falloff.evaluate(fz)*texf;

        if (1) { //purely delta mode
          v[0] += vec[0]*fx*Math.sign(signs[i]);
          v[1] += vec[1]*fy*Math.sign(signs[i + 1]);
          v[2] += vec[2]*fz*Math.sign(signs[i + 2]);
        } else { //accumulated delta mode
          v.load(v.customData[cd_orig].value);

          gd[gi + GOFFX] += vec[0]*fx*Math.sign(signs[i]);
          gd[gi + GOFFY] += vec[1]*fy*Math.sign(signs[i + 1]);
          gd[gi + GOFFZ] += vec[2]*fz*Math.sign(signs[i + 2]);

          v[0] += gd[gi + GOFFX];
          v[1] += gd[gi + GOFFY];
          v[2] += gd[gi + GOFFZ];
        }

        f = 1.0 - f; //make sure smooth uses inverse falloff
        f = Math.sqrt(f);
        //f = 1.0;

        //v.addFac(vec, f);
      } else if (mode === COLOR_BOUNDARY) {
        colorboundary(v, f*strength);
      }

      if (haveGrids && v.bLink) {
        bLinks.add(v);
        doGridBoundary(v);
      }

      ws[wi++] = f;

      v.flag |= MeshFlags.UPDATE;
      vi++;
    }

    //let es = new Set();
    wi = 0;

    let smoothvs = vs;

    if (mode === SNAKE) {
      smoothvs = new Set(vs);

      if (haveGrids) {
        /*
        for (let v of vs) {
          for (let v2 of v.neighbors) {
            smoothvs.add(v2);
          }
        }
        //*/
      } else {
        let vs2 = vs;

        for (let i = 0; i < 1; i++) {
          let boundary = new Set();

          for (let v of vs2) {
            for (let e of v.edges) {
              let v2 = e.otherVertex(v);

              if (!smoothvs.has(v2)) {
                boundary.add(v2);
                doUndo(v2);
              }

              smoothvs.add(v2);
            }
          }

          vs2 = boundary;
        }

        console.log("smoothvs", smoothvs.size, vs.size);
      }
    }

    for (let v of vs) {
      let node = v.customData[cd_node].node;

      if (node) {
        bvh.updateNodes.add(node);
        node.flag |= updateflag;
      }

      //for (let e of v.edges) {
      //  es.add(e);
      //}

      if (!isPaintMode && rakefac > 0.0) {
        rake(v, rakefac*ws[wi]);
      }

      if (vsw > 0) {
        if (isPaintMode) {
          v.customData[cd_color].color.load(colorfilter(v, cd_color, vsw*ws[wi]));
        } else {
          vsmooth(v, vsw*ws[wi]);
        }
      }

      if (!isPaintMode && pinch !== 0.0) {
        dopinch(v, ws[wi]);
      }

      wi++;

      if ((v.flag & MeshFlags.MIRRORED) && (v.flag & MeshFlags.MIRROR_BOUNDARY)) {
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

      v.flag |= MeshFlags.UPDATE;
    }

    if (haveGrids && vsw > 0.0) {
      let steps = ~~(vsw*4.0);
      steps = Math.min(Math.max(steps, 2), 4);

      for (let i = 0; i < steps; i++) {
        for (let v of bLinks) {
          doGridBoundary(v);
        }
      }
    }

    if (this.smoother && vsw > 0.0) {
      let update = false;
      let smoother = this.smoother;

      for (let v of vs) {
        update |= smoother.ensureVert(v);
      }

      if (update) {
        smoother.update();
      }

      let wfunc = function (v) {
        let w = smoothmap.get(v);

        if (w === undefined) {
          return 0.0;
        }

        return w;
      }

      let wfac = vsw;

      let sverts = smoother.getSuperVerts(vs);
      smoother.smooth(sverts, wfunc, wfac);
    }

    let doDynTopo = (vs) => {
      if (haveGrids && haveQuadTreeGrids) {
        let vs2 = new Set(vs);

        for (let v of vs) {
          for (let v2 of v.neighbors) {
            vs2.add(v2);
          }
        }

        this.doQuadTopo(mesh, bvh, esize, vs2, p3, radius, brush);
      } else if (!haveGrids && mode !== SMOOTH) {
        let es = new Set();

        let log = this._undo.log;
        log.checkStart(mesh);

        if (0) {
          let bades = new Set();

          for (let v of vs) {
            for (let e of v.edges) {
              es.add(e);

              continue;

              for (let l of e.loops) {
                for (let l2 of l.f.loops) {
                  if (l2.e.v1.vectorDistanceSqr(l2.e.v2) < 0.000001) {
                    bades.add(l2.e);
                  }

                  es.add(l2.e);
                }
              }

              let v2 = e.otherVertex(v);

              //*
              for (let e2 of v2.edges) {
                //let v3 = e2.otherVertex(v2);
                //log.ensure(v3);

                es.add(e2);
              }//*/
            }
          }

          for (let e of bades) {
            es.delete(e);
          }
        } else {
          let tris = bvh.closestTris(ps.p, radius);
          for (let tri of tris) {
            for (let e of tri.v1.edges) {
              es.add(e);
            }
            for (let e of tri.v2.edges) {
              es.add(e);
            }
            for (let e of tri.v3.edges) {
              es.add(e);
            }
          }
        }

        let maxedges = brush.dynTopo.edgeCount;

        /*
        //try to subdivide long edges extra
        let eratio = (e) => {
          let mindis = 1e17;
          let tot = 0;

          for (let i=0; i<2; i++) {
            let v = i ? e.v2 : e.v1;

            for (let e2 of v.edges) {
              mindis = Math.min(mindis, e2.v1.vectorDistanceSqr(e2.v2));
              tot++;
            }
          }

          if (!tot) {
            return 1.0;
          }

          let ret = e.v1.vectorDistance(e.v2) / Math.sqrt(mindis + 0.000001);

          if (ret < 1.0) {
            return 1.0 / ret;
          }

          return ret;
        }

        let rec = (e, depth = 0) => {
          if (depth > 3) {
            return;
          }

          //let len = e.v1.vectorDistanceSqr(e.v2);
          if (eratio(e) > 4.0) {//len > (esize*8.0)**2) {
            es.add(e);

            for (let i = 0; i < 2; i++) {
              let v = i ? e.v2 : e.v1;

              for (let e2 of v.edges) {
                if (!es.has(e2)) {
                  maxedges++;
                  rec(e2, depth + 1);
                }
              }
            }
          } else if (depth > 0) {
            //add leaves to es anyway
            for (let i = 0; i < 2; i++) {
              let v = i ? e.v2 : e.v1;

              for (let e2 of v.edges) {
                es.add(e2);
              }
            }
          }
        }

        if (0) {
          let vs2 = bvh.closestVerts(ps.p, radius*2);
          let evisit = new WeakSet();

          for (let e of es) {
            evisit.add(e);
          }

          for (let v of vs2) {
            for (let e of v.edges) {
              if (!evisit.has(e)) {
                evisit.add(e);
                rec(e);
              }
            }
          }
        }

        for (let e of new Set(es)) {
          rec(e);
        }

        //*/

        for (let e of es) {
          vs.add(e.v1);
          vs.add(e.v2);
        }

        for (let v of vs) {
          log.ensure(v);
        }

        this.doTopology(mesh, maxedges, bvh, esize, vs, es, radius, brush);
      }
    }

    if (doTopo) {
      doDynTopo(vs);

      //sample bvh again for snake tool dyntopo
      if (mode === SNAKE) {
        for (let i = 0; i < 4; i++) {
          let vs2 = bvh.closestVerts(ps.p, radius*2);
          doDynTopo(vs2);
        }
      }
    }
    //*/

    bvh.update();

    if (mres && oldmres) {
      oldmres.copyTo(mres);

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        grid.recalcFlag |= QRecalcFlags.NORMALS | QRecalcFlags.TOPO | QRecalcFlags.NEIGHBORS;
        grid.update(mesh, l, cd_grid);
      }

      mesh.regenBVH();
      mesh.getBVH(false).update();
    }

    if (!this.modalRunning) {
      mesh.regenTesellation();
    }

    //flag mesh to upload to gpu after exiting pbvh toolmode
    mesh.regenRender();
  }

  doTopology(mesh, maxedges, bvh, esize, vs, es, radius, brush) {
    DYNTOPO_T_GOAL = brush.dynTopo.valenceGoal;

    ENABLE_DYNTOPO_EDGE_WEIGHTS = brush.dynTopo.flag & DynTopoFlags.FANCY_EDGE_WEIGHTS;

    //if (util.time_ms() - this._last_time < 50) {
    //  return;
    //}
    this._last_time = util.time_ms();

    let elen = 0, tot = 0;
    for (let e of es) {
      elen += e.v2.vectorDistance(e.v1);
      tot++;
    }

    if (elen === 0.0) {
      return;
    }

    let ratio = elen/esize;
    ratio = Math.min(Math.max(ratio, 0.05), 20.0);

    let max1 = Math.ceil(maxedges/ratio), max2 = Math.ceil(maxedges*ratio);

    let log = this._undo.log;
    log.checkStart(mesh);

    let dosmooth = (vs) => {
      let co = new Vector3();
      let co2 = new Vector3();

      for (let v of vs) {
        let tot = 0;
        co.zero();

        log.ensure(v);

        for (let v2 of v.neighbors) {
          co2.load(v2).sub(v);
          let d = co2.dot(v.no);

          co2.addFac(v.no, -d).add(v);
          co.add(co2);

          //co.add(v2);
          tot++;
        }

        if (tot > 0) {
          co.mulScalar(1.0/tot);
          v.interp(co, 0.2675);
          v.flag |= MeshFlags.UPDATE;
        }
      }
    }

    //this._runLogUndo(mesh, bvh);

    let newes = new Set();

    //if (brush.dynTopo.flag & DynTopoFlags.COLLAPSE) {
    //  this.doTopologyCollapse(mesh, max2, bvh, esize, vs, es, radius, brush);
    //  es = es.filter(e => e.eid >= 0);
    //}

    if (brush.dynTopo.flag & DynTopoFlags.SUBDIVIDE) {
      for (let i = 0; i < 1; i++) {
        es = this.doTopologySubdivide(mesh, max1, bvh, esize, vs, es, radius, brush, newes);
        es = es.filter(e => e.eid >= 0);

        for (let e of new Set(es)) {
          for (let i = 0; i < 2; i++) {
            let v = i ? e.v2 : e.v1;
            for (let e2 of v.edges) {
              es.add(e2);
            }
          }
        }
      }
    }

    //dosmooth(vs);

    if (brush.dynTopo.flag & DynTopoFlags.COLLAPSE) {
      this.doTopologyCollapse(mesh, max2, bvh, esize, vs, es, radius, brush);

      if (brush.dynTopo.flag & DynTopoFlags.QUAD_COLLAPSE) {
        es = es.filter(e => e.eid >= 0);
        this.doTopologyCollapseTris2Quads(mesh, max2, bvh, esize, vs, es, radius, brush);
        es = es.filter(e => e.eid >= 0);
      }
    } else if (0) {
      newes = newes.filter(e => e.eid >= 0);
      let newvs = new Set();

      let esize2 = 0;
      let tot = 0;

      for (let e of new Set(newes)) {
        esize2 += e.v1.vectorDistance(e.v2);
        tot++;

        for (let i = 0; i < 2; i++) {
          let v = i ? e.v2 : e.v1;

          for (let e2 of v.edges) {
            newes.add(e2);

            let v2 = e2.otherVertex(v);
            newvs.add(v2);

            for (let e3 of v2.edges) {
              //  newes.add(e3);
            }
          }
        }

        newvs.add(e.v1);
        newvs.add(e.v2);
      }

      if (tot) {
        esize2 /= tot;
      } else {
        esize2 = esize;
      }

      console.log("NEWES", newes, newvs);

      //esize *= 2.0;

      this.doTopologyCollapse(mesh, max2, bvh, esize2, newvs, newes, radius, brush);
    }

    for (let e of es) {
      if (e.eid < 0) {
        continue;
      }

      vs.add(e.v1);
      vs.add(e.v2);
    }

    dosmooth(vs);

    mesh.regenTesellation();
  }

  edist_simple(e, v1, v2, mode) {
    return v1.vectorDistanceSqr(v2);
  }

  edist(e, v1, v2, mode = 0) {
    let dis = v1.vectorDistanceSqr(v2);
    //return dis;

    let val1 = v1.valence;
    let val2 = v2.valence;

    let d = val1 + val2;

    if (0) {
      //d = (val1+val2)*0.5;
      d = Math.max(val1, val2);

      let t = DYNTOPO_T_GOAL;

      let dis2 = dis;

      if (mode) {//collapse
        dis2 /= 1.0 + Math.max((d - t)*Math.random(), -0.75);

        if (d > t) {
          // dis2 /= 1.0 + (d - t)*Math.random();
        }
      } else { //subdivide
        dis2 /= 1.0 + Math.max((t - d)*Math.random(), -0.75);

        if (d < t) {
          //dis2 /= 1.0 + (t - d)*Math.random();
        }
      }

      dis += (dis2 - dis)*0.5;
      return dis;
    }

    d = 0.5 + d*0.25;

    d += -2.0;
    d = Math.pow(Math.max(d, 0.0), 2);
    d *= 0.5;

    //let fac = window.dd1 || 0.5; //0.3;
    //d += window.dd2 || -2.0;
    //d = Math.pow(d, window.dd3 || 0.5);

    if (d !== 0.0) {
      if (!mode) {
        //d = 1.0 / d;
        //d = (val1 + val2)*0.5 - 6;
        //d = Math.max(d, 0.0) + 1.0;
        //d = 1.0;
      }

      dis *= d;
    }

    //try to avoid four-valence verts with all triangles
    if (mode && (val1 === 4 || val2 === 4) && Math.random() > 0.8) {
      //dis /= 3.0;
    }

    if (0) {//!mode) {
      let minsize = 1e17;
      for (let i = 0; i < 2; i++) {
        let v = i ? v2 : v1;
        for (let e of v.edges) {
          minsize = Math.min(minsize, e.v1.vectorDistance(e.v2));
        }
      }
      let dist = v1.vectorDistance(v2);

      minsize = Math.min(minsize, dist);
      let ratio = dist/(minsize + 0.00001);

      ratio = Math.max(ratio, 1.0);

      let p = 1.0 - 1.0/ratio;

      p *= p;

      if (Math.random() < p) {
        return dis*0.5;
      }
    }

    //dihedral angle
    /*
    if (e.l) {
      let th = Math.abs(e.l.f.no.dot(e.l.radial_next.f.no));
      th *= th;
      th = 1.0 - th;
      //th *= th;

      dis += (dis*9.0 - dis)*th;
    }//*/

    return dis*1.25;
  }

  //calculates edge size from density and radius
  calcESize2(totedge, radius) {
    if (totedge === 0) {
      return 0.0;
    }

    let area = Math.PI*radius**2;

    //let density1 = area / ((k*esize)**2);
    //esize2 is density1 solved for esize

    return Math.sqrt(area/totedge);
  }

  doTopologyCollapseTris2Quads(mesh, max, bvh, esize, vs, es, radius, brush) {
    let es2 = [];

    esize /= 1.0 + (0.75*brush.dynTopo.decimateFactor);

    let edist = ENABLE_DYNTOPO_EDGE_WEIGHTS ? this.edist : this.edist_simple;

    let log = this._undo.log;
    log.checkStart(mesh);

    let esize2 = this.calcESize2(es.size, radius);

    if (esize2 < esize) {
      esize += (esize2 - esize)*0.75;
    }
    esize *= 2.0;

    let esqr = esize*esize;
    let fs = new Set();

    for (let e of es) {
      let dist = edist(e, e.v1, e.v2, true);

      if (dist <= esqr) {
        for (let l of e.loops) {
          if (l.f.lists.length === 1 && l.f.lists[0].length === 3) {
            fs.add(l.f);
          }
        }
      }
    }

    let updateflag = BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_COLORS;
    updateflag = updateflag | BVHFlags.UPDATE_TOTTRI | BVHFlags.UPDATE_INDEX_VERTS;
    updateflag = updateflag | BVHFlags.UPDATE_UNIQUE_VERTS | BVHFlags.UPDATE_OTHER_VERTS;

    let cd_node = bvh.cd_node;

    for (let f of fs) {
      for (let l of f.loops) {
        let node = l.v.customData[cd_node].node;
        if (node) {
          node.flag |= updateflag;
          bvh.updateNodes.add(node);
        }
      }

      bvh.removeFace(f.eid);
    }

    let newfs = new Set(fs);

    let lctx = new LogContext();
    lctx.onnew = (e) => {
      if (e.type === MeshTypes.FACE) {
        newfs.add(e);
      }
    }

    trianglesToQuads(mesh, fs, undefined, lctx);

    newfs = newfs.filter(f => f.eid >= 0);

    let looptris = [];

    for (let f of newfs) {
      triangulateFace(f, looptris);
    }

    for (let i = 0; i < looptris.length; i += 3) {
      let l1 = looptris[i], l2 = looptris[i + 1], l3 = looptris[i + 2];
      let f = l1.f;

      let tri = bvh.addTri(f.eid, bvh._nextTriIdx(), l1.v, l2.v, l3.v, true, l1, l2, l3);
      tri.flag |= BVHTriFlags.LOOPTRI_INVALID;
    }
  }

  doTopologyCollapse(mesh, max, bvh, esize, vs, es, radius, brush) {
    //return;
    let es2 = [];

    esize /= 1.0 + (0.75*brush.dynTopo.decimateFactor);

    let edist = ENABLE_DYNTOPO_EDGE_WEIGHTS ? this.edist : this.edist_simple;

    let log = this._undo.log;
    log.checkStart(mesh);

    let fs = new Set();
    let fmap = new Map();

    let cd_face_node = bvh.cd_face_node;

    if (es.size === 0) {
      return;
    }

    let esize2 = this.calcESize2(es.size, radius);

    if (esize2 < esize) {
      esize += (esize2 - esize)*0.75;
    }

    let esqr = esize*esize;

    let es0 = [];
    for (let e of es) {
      es0.push(e);
    }
    es = es0;

    for (let e of es) {
      let ri = ~~(Math.random()*es.length*0.9999);
      e = es[ri];

      if (es2.length >= max) {
        break;
      }

      if (!e.l) {
        continue;
      }

      let lensqr = edist(e, e.v1, e.v2, true);

      if (Math.random() > lensqr/esqr) {
        continue;
      }

      if (lensqr <= esqr) {
        let l = e.l;
        let _i = 0;

        do {
          fs.add(l.f);
          l = l.radial_next;
        } while (l !== e.l && _i++ < 100);

        es2.push(e);
      }
    }

    let fs2 = new Set();
    let es3 = new Set();

    for (let e1 of es2) {
      es3.add(e1);

      log.ensure(e1.v1);
      log.ensure(e1.v2);
      log.ensure(e1);

      for (let i = 0; i < 2; i++) {
        let v = i ? e1.v2 : e1.v1;

        for (let e of v.edges) {
          es3.add(e);

          if (!e.l) {
            continue;
          }

          let l = e.l;
          let _i = 0;

          do {
            fs2.add(l.f);

            //let node = l.f.customData[cd_face_node].node;
            //if (node) {
            //  fmap.set(l.f, node);
            //}

            bvh.removeFace(l.f.eid);
            l = l.radial_next;
          } while (l !== e.l && _i++ < 10);
        }
      }
    }

    let kills = new Map();
    for (let f of fs2) {
      if (f.eid >= 0) {
        kills.set(f, log.logKillFace(f));
      }
    }

    for (let e of es3) {
      if (e.eid >= 0) {
        kills.set(e, log.logKillEdge(e));
      }
    }

    //console.log("es2", es2);

    let lctx = new LogContext();
    let typemask = MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.FACE;

    lctx.onkill = (elem) => {
      if (!(elem.type & typemask)) {
        return;
      }
      if (kills.has(elem)) {
        return;
      }

      log.logKill(elem);
    }

    lctx.onnew = (elem) => {
      if (elem.type & typemask) {
        //if (kills.has(elem)) {
        //  kills.delete(elem);
        //}

        log.logAdd(elem);
      }
    }

    /*
    let flag = MeshFlags.TEMP2;

    function logStart(v) {
      v.flag |= flag;

      log.ensure(v);

      for (let v2 of v.neighbors) {
        if (!(v2.flag & flag)) {
          v2.flag |= flag;

          log.ensure(v2);
        }
      }
    }

    for (let e of es2) {
      for (let i=0; i<2; i++) {
        let v = i ? e.v2 : e.v1;

        v.flag &= ~flag;

        for (let v2 of v.neighbors) {
          v2.flag &= ~flag;
        }
      }
    }

    for (let e of es2) {
      if (!(e.v1.flag & flag)) {
        logStart(e.v1);
      }
      if (!(e.v2.flag & flag)) {
        logStart(e.v2);
      }
    }//*/

    for (let e of es2) {
      if (e.eid < 0) {
        continue;
      }

      mesh.collapseEdge(e, lctx);
    }

    for (let e of es3) {
      if (e.eid >= 0) {
        let le = kills.get(e);

        if (le) {
          //log.cancelEntry(le);
          log.logAddEdge(e);
        }
      }
    }

    for (let f of fs2) {
      if (f.eid >= 0) {
        //log.cancelEntry(kills.get(f));
        log.logAddFace(f);
      }
    }

    let cd_node = bvh.cd_node;
    let updateflag = BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_UNIQUE_VERTS | BVHFlags.UPDATE_DRAW;

    for (let f of fs2) {
      if (f.eid < 0) {
        continue; //face was deleted
      }

      let startl = f.lists[0].l;
      let l = startl.next;
      let _i = 0;

      do {
        let v1 = startl.v;
        let v2 = l.v;
        let v3 = l.next.v;

        for (let i = 0; i < l.v.edges.length; i++) {
          let e = l.v.edges[i];

          let node = l.v.customData[cd_node];

          if (node && node.node) {
            if ((node.node.flag & updateflag) !== updateflag) {
              bvh.updateNodes.add(node.node);
            }

            node.node.flag |= updateflag;
          }

          if (!e.l) {
            mesh.killEdge(e);
            i--;
          }
        }

        //let tri = bvh.getTrackById(f.eid, bvh._nextTriIdx(), v1, v2, v3);

        let tri = bvh.addTri(f.eid, bvh._nextTriIdx(), v1, v2, v3, true, startl, l, l.next);
        tri.flag |= BVHTriFlags.LOOPTRI_INVALID;

        l = l.next;
      } while (l !== f.lists[0].l.prev && _i++ < 1000);
    }

    for (let v of vs) {
      if (v.eid < 0) {
        continue;
      }

      let count = 0;

      let ok;

      do {
        ok = false;
        count = 0;

        for (let e of v.edges) {
          if (!e.l) {
            mesh.killEdge(e);
            ok = true;
            break;
          }

          count++;
        }
      } while (ok);

      if (!count) {
        mesh.killVertex(v);
      }
    }
  }

  /*

  on factor;

  m := mat((m11, m12, m13), (m21, m22, m23), (m31, m32, m33));

  m := mat((n1x*n1x, n1x*n1y, n1x*n1z), (n1y*n1x, n1y*n1y, n1y*n1z), (n1z*n1x, n1z*n1y, n1z*n1z));
  m2 := mat((n2x*n2x, n2x*n2y, n2x*n2z), (n2y*n2x, n2y*n2y, n2y*n2z), (n2z*n2x, n2z*n2y, n2z*n2z));
  m3 := mat((n3x*n3x, n3x*n3y, n3x*n3z), (n3y*n3x, n3y*n3y, n3y*n3z), (n3z*n3x, n3z*n3y, n3z*n3z));
  m := m + m2 + m3;

  eg := mateigen(m, x);

  tm := mat((x, 0, 0), (0, x, 0), (0, 0, x));

  f1 := det (tm - m);
  solve(f1, x);

  l1 := part(eg, 1, 1);
  l2 := part(eg, 2, 1);

  * */

  doQuadTopo(mesh, bvh, esize, vs, brushco, brushradius, brush) {
    //console.log("quadtree topo!")
    //if (util.time_ms() - this._last_time < 15) {
    //  return;
    //}

    //ensure bounds are correct
    bvh.update();

    let cd_grid = bvh.cd_grid;
    let cd_node = bvh.cd_node;

    const esize1 = esize*(1.0 + 0.75*brush.dynTopo.subdivideFactor);
    const esize2 = esize*(1.0 - 0.75*brush.dynTopo.decimateFactor);

    const esqr1 = esize1*esize1;
    const esqr2 = esize2*esize2;

    let haveKdTree = false;
    let layer = mesh.loops.customData.flatlist[bvh.cd_grid];
    if (layer.typeName === "KdTreeGrid") {
      haveKdTree = true;
    }

    let MAXCHILD = haveKdTree ? 2 : 4;
    let data = [];
    const DGRID = 0, DNODE = 1, DLOOP = 2, DMODE = 3, DTOT = 4;

    const SUBDIVIDE = 0, COLLAPSE = 1;

    let QFLAG   = QuadTreeFields.QFLAG,
        QDEPTH  = QuadTreeFields.QDEPTH,
        QPARENT = QuadTreeFields.QPARENT,
        QPOINT1 = QuadTreeFields.QPOINT1;

    let LEAF = QuadTreeFlags.LEAF,
        DEAD = QuadTreeFlags.DEAD;

    if (haveKdTree) {
      QFLAG = KdTreeFields.QFLAG;
      QDEPTH = KdTreeFields.QDEPTH;
      QPARENT = KdTreeFields.QPARENT;
      QPOINT1 = KdTreeFields.QPOINT1;
      LEAF = KdTreeFlags.LEAF;
      DEAD = KdTreeFlags.DEAD;
    }

    const updateflag = BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_DRAW;

    let vs2 = new Set();
    let grids = new Set();
    let gridmap = new Map();

    let visit = new Set();
    let updateloops = new Set();
    let bnodes = new Set();

    let maxDepth = this.inputs.dynTopoDepth.getValue();

    if (haveKdTree) {
      maxDepth *= 2;
    }

    let visits = new Map();
    let tot = 0;

    let vs3 = [];
    for (let v of vs) {
      vs3.push(v);
    }
    vs = vs3;

    let dn1 = new Vector3();
    let dn2 = new Vector3();
    let dn3 = new Vector3();
    let dn4 = new Vector3();
    let dn5 = new Vector3();

    let rsqr = brushradius*brushradius;

    //vs.sort((a, b) => a.vectorDistanceSqr(brushco) - b.vectorDistanceSqr(brushco));

    let limit = 555;

    for (let _i = 0; _i < vs.length; _i++) {
      let ri = ~~(Math.random()*vs.length*0.99999);
      let v = vs[ri];

      //for (let v of vs) {
      if (tot >= limit) {
        break;
      }

      let l = v.loopEid;
      l = mesh.eidmap[l];

      if (l === undefined || !(l instanceof Loop)) {
        continue;
      }

      let ok = false;
      let dtot = 0, ntot = 0;
      let etot = 0;
      let maxlen = 0;
      let minlen = 1e17;

      for (let v2 of v.neighbors) {
        if (v2.bLink && v2.loopEid !== v.loopEid) {
          continue;
        }

        let distsqr = v.vectorDistanceSqr(v2);

        maxlen = Math.max(maxlen, distsqr);
        minlen = Math.min(minlen, distsqr);

        if (distsqr > esqr1) {
          dtot++;
        } else if (distsqr < esqr2) {
          etot++;
        }

        ntot++;
      }

      etot = maxlen < esqr2 ? 1 : 0;

      if (dtot > 0 || etot > 0) {//>= ntot*0.5) {
        ok = true;
      }


      if (ok) {
        vs2.add(v);

        let grid = l.customData[cd_grid];

        if (!grids.has(grid)) {
          grid.recalcPointIndices();
          visits.set(grid, new Set());
          gridmap.set(grid, l);

          grids.add(grid);
          grid.update(mesh, l, cd_grid);
        }

        let visit2 = visits.get(grid);

        let topo = grid.getTopo();
        let ns = grid.nodes;

        let v2 = topo.vmap[v.index];

        if (!v2) {
          //console.log("error", v.index);
          continue;
        }

        let ok = false;

        for (let ni of v2.nodes) {
          if (tot >= limit) {
            break;
          }

          let found = false;
          for (let i = 0; i < 4; i++) {
            let p = grid.points[ns[ni + QPOINT1 + i]];
            let p2 = grid.points[ns[ni + QPOINT1 + ((i + 1)%4)]];

            if (!p2 || !p) {
              console.warn("eek!", ni);
              continue;
            }

            let dist = p.vectorDistanceSqr(brushco);

            if (dist <= rsqr) {
              found = true;
              break;
            }

            let t = dn1.load(p2).sub(p);
            let len = t.vectorLength();

            if (len > 0.000001) {
              t.mulScalar(1.0/len);
            }

            let co = dn2.load(brushco).sub(p);

            let dt = t.dot(co)/len;

            dt = Math.min(Math.max(dt, 0.0), 1.0);

            co.load(p).interp(p2, dt);
            dist = p.vectorDistanceSqr(co);

            if (dist < rsqr) {
              found = true;
              break;
            }
          }

          if (!found) {
            continue;
          }

          if (!visit2.has(ni) && (ns[ni + QFLAG] & LEAF) && !(ns[ni + QFLAG] & DEAD)) {
            let mode;

            mode = etot < dtot ? SUBDIVIDE : COLLAPSE;

            if (Math.random() > 0.9) {
              mode = COLLAPSE;
            } else if (!etot && !dtot) {
              continue;
            }

            /*
            if (Math.random() > 0.97) {
              etot = 1;
            }

            if (etot) {
              mode = COLLAPSE;
            } else if (dtot) {
              mode = SUBDIVIDE;
            } else {
              continue;
            }
            //*/

            //let mode = dtot > etot ? SUBDIVIDE : COLLAPSE;

            if (mode === SUBDIVIDE && ns[ni + QDEPTH] >= maxDepth) {
              continue;
            }

            if (mode === COLLAPSE) {
              if (!ni || visit2.has(grid.nodes[ni + QPARENT])) {
                continue;
              }

              ni = grid.nodes[ni + QPARENT];
            }

            updateloops.add(l);

            data.push(grid);
            data.push(ni);
            data.push(l);
            //data.push(COLLAPSE);
            data.push(mode);

            visit2.add(ni);

            ok = true;
            tot++;
          }
        }

        if (ok) {
          let node = v.customData[cd_node].node;

          if (node) {
            bvh.updateNodes.add(node);
            node.flag |= updateflag;
            bnodes.add(node);
          }
        }
      }
    }

    /*
    for (let n of bvh.nodes) {//bnodes) {
      if (n.id < 0) {
        continue;
      }

      //bvh.checkJoin(n);
    }*/

    //console.log(data);
    //updateloops = new Set(mesh.loops);

    cd_node = mesh.loops.customData.getLayerIndex("bvh");

    for (let l of updateloops) {
      let grid = l.customData[cd_grid];

      //forcibly unlink vert node refs
      for (let p of grid.points) {
        let node = p.customData[cd_node];

        if (node.node && node.node.uniqueVerts) {
          node.node.uniqueVerts.delete(p);
        }

        node.node = undefined;
      }

      bvh.removeFace(l.eid, true, false);
    }

    /*
    for (let grid of visits.keys()) {
      let qnodes = visits.get(grid);
      let idmul = grid.idmul;
      let l = gridmap.get(grid);

      let id = l.eid*idmul;
      for (let ni of qnodes) {
        bvh.removeFace(id + ni);
      }
    }
    //*/

    for (let node of bnodes) {
      if (node.id < 0) { //node died at some point?
        continue;
      }
    }
    bvh.updateTriCounts();

    let maxdimen = 1;
    for (let grid of grids) {
      maxdimen = Math.max(maxdimen, grid.dimen);
    }

    let idmul = (maxdimen + 2)*(maxdimen + 2)*128;

    //console.log(data.length / DTOT);
    for (let grid of grids) {
      grid.recalcFlag |= QRecalcFlags.TOPO;

      //grid._rebuildHash();
      //grid.checkCustomDataLayout(mesh);
      //grid.relinkCustomData();
    }

    let compactgrids = new Set();

    for (let di = 0; di < data.length; di += DTOT) {
      let grid = data[di], ni = data[di + 1], l = data[di + 2];
      let mode = data[di + 3];

      let ns = grid.nodes, ps = grid.points;

      let key = l.eid*idmul + ni;
      if (visit.has(key) || (grid.nodes[ni + QFLAG] & DEAD)) {
        continue;
      }

      visit.add(key);
      if (mode === SUBDIVIDE && grid.points.length < 512*512) {// && (ns[ni + QFLAG] & LEAF)) {
        grid.subdivide(ni, l.eid, mesh);
      } else if (mode === COLLAPSE) {
        grid.collapse(ni);
      }

      if (grid.freelist.length > 32) {
        compactgrids.add(grid);
      }
      //console.log(ni, "depth:", ns[ni+QDEPTH], "key", key);
    }

    if (compactgrids.size > 0) {
      console.log("COMPACT", compactgrids);
    }

    for (let grid of compactgrids) {
      grid.compactNodes();
    }

    //console.log(bvh.nodes.length, bvh.root.tottri);

    let trisout = [];

    let visit2 = new Set();

    let updateloops2 = new Set();

    for (let l of updateloops) {
      let grid = l.customData[cd_grid];

      let l2 = l.radial_next;
      updateloops2.add(l2);

      l2 = l.prev.radial_next;
      updateloops2.add(l2);

      l2 = l.next.radial_next;
      updateloops2.add(l2);

      l2 = l.radial_next.next;
      updateloops2.add(l2);

      l2 = l.radial_next.prev;
      updateloops2.add(l2);

      l2 = l.next;
      updateloops2.add(l2);

      l2 = l.prev;
      updateloops2.add(l2);

      updateloops2.add(l);
    }

    for (let l of updateloops2) {
      let grid = l.customData[cd_grid];
      let updateflag2 = QRecalcFlags.NEIGHBORS | QRecalcFlags.TOPO;

      grid.recalcFlag |= updateflag2;
      grid.update(mesh, l, cd_grid);
    }

    for (let l of updateloops) {
      let grid = l.customData[cd_grid];

      if (visit2.has(grid)) {
        throw new Error("eek!");
      }
      visit2.add(grid);

      let a = trisout.length;

      grid.makeBVHTris(mesh, bvh, l, cd_grid, trisout);
      //console.log("tris", (trisout.length-a)/5);
    }

    //console.log("bnodes", bnodes);
    //console.log("trisout", trisout.length/5, updateloops, updateloops.size);

    let _tmp = [0, 0, 0];

    function sort3(a, b, c) {
      _tmp[0] = a;
      _tmp[1] = b;
      _tmp[2] = c;
      _tmp.sort();

      return _tmp;
    }

    let _i = 0;
    while (trisout.length > 0) {
      let ri = (~~(Math.random()*trisout.length/5*0.999999))*5;
      //let ri = 0;

      let feid = trisout[ri];
      let id = trisout[ri + 1];
      let v1 = trisout[ri + 2];
      let v2 = trisout[ri + 3];
      let v3 = trisout[ri + 4];

      //let sort = sort3(v1.index, v2.index, v3.index);
      //let key = `${feid}:${id}:${sort[0]}:${sort[1]}:${sort[2]}`
      //if (visit2.has(key)) {
      //throw new Error("eek2");
      //} else {

      //console.log("feid", feid);
      //if (!bvh.hasTri(id)) {

      if (!bvh.hasTri(feid, id)) {
        bvh.addTri(feid, id, v1, v2, v3);
      }
      //}
      //}

      //swap with last for fast pop
      let ri2 = trisout.length - 5;

      for (let j = 0; j < 5; j++) {
        trisout[ri + j] = trisout[ri2 + j];
      }

      trisout.length -= 5;

      if (_i++ >= 97) {
        //  break;
      }
    }

    for (let grid of grids) {
      grid.recalcFlag |= QRecalcFlags.ALL;
    }
    /*

        update_grid(l); //will do l.prev/.next too
        update_grid(l.radial_next);


    * */
  }

  _runLogUndo(mesh, bvh) {
    let log = this._undo.log;

    if (!log.checkStart(mesh)) {
      log.undo(mesh, (f) => {
        if (f.lists[0].length === 3 && f.lists.length === 1) {
          let l = f.lists[0].l;
          let tri2 = bvh.addTri(f.eid, bvh._nextTriIdx(), l.v, l.next.v, l.prev.v, undefined, l, l.next, l.prev);
          tri2.flag |= BVHTriFlags.LOOPTRI_INVALID;
        } else {
          let ltris = triangulateFace(f);
          for (let i = 0; i < ltris.length; i += 3) {
            let l1 = ltris[i], l2 = ltris[i + 1], l3 = ltris[i + 2];

            let tri2 = bvh.addTri(f.eid, bvh._nextTriIdx(), l1.v, l2.v, l3.v, undefined, l1, l2, l3);
            tri2.flag |= BVHTriFlags.LOOPTRI_INVALID;
          }
        }
      }, (f) => {
        bvh.removeFace(f.eid);
      });

      log.reset();
      log.start(mesh);
    }
  }

  doTopologySubdivide(mesh, max, bvh, esize, vs, es, radius, brush, newes_out) {
    let esetin = es;

    esize *= 1.0 + (brush.dynTopo.subdivideFactor*0.75);

    let esize2 = this.calcESize2(es.size, radius);

    //console.log(esize, esize2);

    if (esize2 > esize) {
      esize += (esize2 - esize)*0.35;
    }
    //esize = esize2;

    let edist = ENABLE_DYNTOPO_EDGE_WEIGHTS ? this.edist : this.edist_simple;

    let es2 = [];

    let es0 = [];
    for (let e of es) {
      es0.push(e);
    }
    es = es0;


    let log = this._undo.log;

    log.checkStart(mesh);

    let esqr = esize*esize;
    let fs = new Set();
    let fmap = new Map();

    //let cd_face_node = bvh.cd_face_node;

    let max2 = max;

    if (max2 < 10) {
      max2 = 32;
    } else {
      max2 *= 4;
    }

    let lens = [];

    for (let e of es) {
      let ri = ~~(Math.random()*0.9999*es.length);
      e = es[ri];

      if (es2.length >= max2) {
        break;
      }

      if (!e.l) {
        continue;
      }

      let lensqr = edist(e, e.v1, e.v2, false);

      if (lensqr >= esqr) {
        let ok = true;

        let l = e.l;
        let _i = 0;
        let esqr2 = (esize*0.5)**2;
        //let esqr3 = (esize*1.75)**2;

        do {
          fs.add(l.f);

          /*
          for (let l2 of l.f.loops) {
            let dis2 = l2.e.v1.vectorDistanceSqr(l2.e.v2);

            if (dis2 < esqr2) {
              ok = false;
              break;
            }
          }//*/

          l = l.radial_next;
        } while (l !== e.l && _i++ < 100);

        if (ok) {
          e.index = es2.length;

          es2.push(e);
          lens.push(lensqr);
        }
      }
    }

    if (es2.length === 0) {
      return new Set(es);
    }

    es2.sort((a, b) => (lens[b.index] - lens[a.index]));
    if (es2.length > max) {
      es2 = es2.slice(0, ~~(max));
    }

    let ws = [];
    for (let e of es2) {
      ws.push(-lens[e.index]);
    }

    let heap = new util.MinHeapQueue(es2, ws);

    es2 = new Set(es2);

    let test = (e) => {
      let dis = edist(e, e.v1, e.v2, false);
      return dis >= esqr;
    }

    let lctx = new LogContext();

    let es3 = new Set(es);
    let newvs = new Set(), newfs = new Set(), killfs = new Set(), newes = new Set();

    lctx.onkill = (e) => {
      log.logKill(e);

      if (e.type === MeshTypes.FACE) {
        killfs.add(e);
      }
    }

    lctx.onnew = (e) => {
      if (e.type === MeshTypes.EDGE) {
        es3.add(e);
        newes.add(e);
      } else if (e.type === MeshTypes.FACE) {
        newfs.add(e);
        for (let l of e.loops) {
          newes.add(l.e);
          es3.add(l.e);
        }
      } else if (e.type === MeshTypes.VERTEX) {
        newvs.add(e);
      }

      log.logAdd(e);
    }

    /*
    let i2 = 0;
    while (heap.length > 0 && i2 < max) {
      i2++;

      let e = heap.pop();

      if (e.eid < 0) {
        continue;
      }

      for (let f of e.faces) {
        let tris = bvh.fmap.get(f.eid);
        if (tris) {
          for (let tri of tris) {
            let node = tri.node;

            if (node) {
              node.flag |= BVHFlags.UPDATE_UNIQUE_VERTS;
              bvh.updateNodes.add(node);
              fmap.set(f, node);
            }
          }
        }

        bvh.removeFace(f.eid);
      }

      let es3 = new Set([e]);

      let ret = splitEdgesSimple(mesh, es3, test, lctx);

      for (let item of ret.newvs) {
        newvs.add(item);
      }
      for (let item of ret.newfs) {
        newfs.add(item);
      }
      for (let item of ret.killfs) {
        killfs.add(item);
      }
      for (let e of ret.newes) {
        heap.push(e, -edist(e, e.v1, e.v2, false));
        newes.add(e);
      }
    }
    //*/

    let es4 = es2;

    let oldnew = lctx.onnew;
    let updateflag = BVHFlags.UPDATE_UNIQUE_VERTS | BVHFlags.UPDATE_OTHER_VERTS;
    updateflag = updateflag | BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_TOTTRI;
    updateflag = updateflag | BVHFlags.UPDATE_INDEX_VERTS;

    for (let step = 0; step < 2; step++) {
      let newes2 = new Set();

      let flag = MeshFlags.TEMP2;

      for (let e of es4) {
        for (let l of e.loops) {
          l.f.flag &= ~flag;
        }
      }

      for (let e of es4) {
        for (let l of e.loops) {
          let f = l.f;

          if (f.flag & flag) {
            continue;
          }
          f.flag |= flag;

          let tris = bvh.fmap.get(f.eid);
          if (tris) {
            for (let tri of tris) {
              let node = tri.node;

              if (node) {
                node.flag |= updateflag;
                bvh.updateNodes.add(node);
                fmap.set(f, node);
              }
            }

            bvh.removeFace(f.eid);
          }
        }
      }

      lctx.onnew = (e) => {
        if (e.type === MeshTypes.EDGE) {
          if (edist(e, e.v1, e.v2, false) >= esqr) {
            newes2.add(e);
          } else {
            newes_out.add(e);
          }
        } else if (e.type === MeshTypes.FACE) {
          for (let l of e.loops) {
            if (edist(l.e, l.e.v1, l.e.v2, false) >= esqr) {
              newes2.add(l.e);
            } else {
              newes_out.add(l.e);
            }
          }
        }

        oldnew(e);
      }

      let ret = splitEdgesSmart2(mesh, es4, test, lctx);

      es4 = newes2;

      for (let e of es4) {
        if (e.eid >= 0) {
          newes_out.add(e);
        }
      }
    }

    newfs = newfs.filter(f => f.eid >= 0);

    for (let e of newes) {
      if (e.eid >= 0) {
        newes_out.add(e);
      }
    }

    for (let v of newvs) {
      for (let e of v.edges) {
        es3.add(e);
      }
    }

    /*
    for (let v of newvs) {
      log.logAddVertex(v);
    }

    for (let e of es2) {
      log.logAddEdge(e);
    }

    for (let e of newes) {
      log.logAddEdge(e);
    }

    for (let f of newfs) {
      if (f.eid < 0) {
        console.warn(f);
        throw new Error("newfs error");
      }

      log.logAddFace(f);
    }*/

    //let newvs = new Set();
    //let newfs = new Set();
    //let killfs = new Set();

    let fs2 = new Set();

    fs = fs.filter(f => f.eid >= 0);
    newfs = newfs.filter(f => f.eid >= 0);

    for (let f of fs) {
      fs2.add(f);
    }

    //console.log("NEW", newvs, newfs, es2, esize);
    //return;
    //let newvs = new Set(), newfs = fs;

    //console.log("new", newvs.size, newes.size, newfs.size, killfs.size);

    //mesh.regenTesellation();

    for (let i = 0; i < 2; i++) {
      let fsiter = i ? fs2 : newfs;

      for (let f of fsiter) {
        if (0 && f.lists[0].length > 3) {
          let newfaces = new Set();
          let newedges = new Set();

          //log.logKillFace(f);

          f.calcNormal();
          applyTriangulation(mesh, f, newfaces, newedges, lctx);

          for (let e of newedges) {
            newes_out.add(e);
            //log.logAddEdge(e);
          }

          for (let tri of newfaces) {
            //log.logAddFace(tri);

            tri.calcNormal();
            let l = tri.lists[0].l;
            let v1 = l.v, v2 = l.next.v, v3 = l.prev.v;

            let tri2 = bvh.addTri(tri.eid, bvh._nextTriIdx(), v1, v2, v3, undefined, l, l.next, l.prev);
            tri2.flag |= BVHTriFlags.LOOPTRI_INVALID;
          }

          continue;
        }

        f.calcNormal();

        if (f.eid < 0) {
          console.warn("eek!", f);
          continue;
        }

        let l = f.lists[0].l;
        let firstl = l;
        let _i = 0;

        l = l.next;

        do {
          let v1 = firstl.v;
          let v2 = l.v;
          let v3 = l.next.v;

          //v1[0] += (Math.random()-0.5)*esize*0.2;
          //v1[1] += (Math.random()-0.5)*esize*0.2;
          //v1[2] += (Math.random()-0.5)*esize*0.2;

          let tri = bvh.addTri(f.eid, bvh._nextTriIdx(), v1, v2, v3, undefined, firstl, l, l.next);
          tri.flag |= BVHTriFlags.LOOPTRI_INVALID;

          if (_i++ > 1000) {
            console.error("infinite loop detected!");
            break;
          }

          l = l.next;
        } while (l !== firstl.prev);
      }
    }


    bvh.update();

    if (0) {
      for (let e of new Set(es3)) {
        if (e.eid < 0) {
          continue;
        }

        for (let step = 0; step < 2; step++) {
          let v = step ? e.v2 : e.v1;
          for (let e2 of v.edges) {
            es3.add(e2);
          }
        }
      }
    }

    return es3;
  }

  modalStart(ctx) {
    this._first = true;
    return super.modalStart(ctx);
  }

  modalEnd() {
    let ctx = this.modal_ctx;

    //prevent reference leaks
    this.grabEidMap = undefined;
    if (this.smoother) {
      //this.smoother.finish();
      this.smoother = undefined;
    }

    let ret = super.modalEnd(...arguments);

    if (ctx.toolmode) {
      //stop custom radius drawing for brush circle
      ctx.toolmode._radius = undefined;
    }

    return ret;
  }

  on_mouseup(e) {
    let ob = this.modal_ctx.object;
    let mesh = ob ? ob.data : undefined;

    this.modal_ctx.view3d.resetDrawLines();
    this.modalEnd();

    //auto-rebuild bvh if topology changed?
    //if (mesh instanceof Mesh) {
    //mesh.getBVH(true);
    //}
  }
}

ToolOp.register(PaintOp);


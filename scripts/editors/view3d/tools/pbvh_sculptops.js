import * as util from '../../../util/util.js';
import {
  BoolProperty,
  Curve1DProperty,
  EnumProperty, FlagProperty, FloatArrayProperty, FloatProperty, IntProperty, Matrix4, Quat, ToolOp, Vec3Property,
  Vec4Property,
  Vector2, Vector3,
  Vector4
} from '../../../path.ux/scripts/pathux.js';
import {GridBase, QRecalcFlags} from '../../../mesh/mesh_grids.js';
import {CDFlags} from '../../../mesh/customdata.js';
import {DynamicsMask, SculptTools} from '../../../brush/brush.js';
import {Loop, Mesh, MeshFlags} from '../../../mesh/mesh.js';
import {BVHFlags} from '../../../util/bvh.js';
import {QuadTreeFields, QuadTreeFlags, QuadTreeGrid} from '../../../mesh/mesh_grids_quadtree.js';
import {KdTreeFields, KdTreeFlags, KdTreeGrid} from '../../../mesh/mesh_grids_kdtree.js';
import {splitEdgesSmart} from '../../../mesh/mesh_subdivide.js';
import {BrushProperty, PaintSample, PaintSampleProperty} from './pbvh_base.js';

let GEID =0, GEID2 =1, GDIS =2, GTOT =3;

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
    ret.mulScalar(1.0 / tot);
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
    ret.mulScalar(1.0 / tot);
    ret.interp(v.customData[cd_color].color, fac);
  }

  return ret;
}


export class PaintOp extends ToolOp {
  constructor() {
    super();

    this._last_enable_mres = "";

    this.grabEidMap = undefined;
    this.grabDists = undefined;

    this.last_mpos = new Vector2();
    this.last_p = new Vector3();
    this._first = true;
    this.last_radius = 0;
    this.last_vec = new Vector3();
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

  static tooldef() {
    return {
      name: "paintop",
      toolpath: "bvh.paint",
      is_modal: true,
      inputs: {
        brush : new BrushProperty(),

        samples : new PaintSampleProperty(),

        grabData : new FloatArrayProperty(),
        grabCo : new Vec3Property(),

        tool: new EnumProperty("CLAY", SculptTools),

        strength: new FloatProperty(1.0),
        radius: new FloatProperty(55.0),
        planeoff: new FloatProperty(0.0),
        autosmooth: new FloatProperty(0.0),
        spacing: new FloatProperty(0.07),
        color: new Vec4Property([1, 1, 0, 1]),

        falloff: new Curve1DProperty(),

        dynamicsMask: new FlagProperty(0, DynamicsMask),
        strengthCurve: new Curve1DProperty(),
        radiusCurve: new Curve1DProperty(),
        autosmoothCurve: new Curve1DProperty(),

        dynTopoLength : new FloatProperty(25),
        dynTopoDepth : new IntProperty(20),
        useDynTopo : new BoolProperty(false),
        useMultiResDepth : new BoolProperty(false)
      }
    }
  }

  undoPre(ctx) {
    let mesh;
    if (ctx.object && ctx.object.data instanceof Mesh) {
      mesh = ctx.object.data;
    }

    this._undo = {
      mesh: mesh ? mesh.lib_id : -1,
      mode: this.inputs.brush.getValue().tool,
      vmap: new Map(),
      gmap: new Map(),
      gdata: [],
      gset: new Set()
    };
  }

  undo(ctx) {
    console.log("BVH UNDO!");

    let undo = this._undo;
    let mesh = ctx.datalib.get(undo.mesh);

    if (!mesh) {
      console.warn("eek! no mesh!");
      return;
    }

    let bvh = mesh.bvh;
    let cd_node;

    if (bvh) {
      cd_node = bvh.cd_node;
    }

    let cd_grid = GridBase.meshGridOffset(mesh);
    let gd = undo.gdata;

    let doColors = () => {
      let cd_color = mesh.loops.customData.getLayerIndex("color");

      for (let i = 0; i < gd.length; i += 6) {
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

    let doCoords = () => {
      for (let i = 0; i < gd.length; i += 8) {
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
            }
          }
        }
      }

      mesh.recalcNormals();
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

        grid1.recalcFlag |= QRecalcFlags.MIRROR|QRecalcFlags.ALL|QRecalcFlags.TOPO;

        killloops.add(l);

        updateloops.add(l);
        updateloops.add(l.prev.radial_next);
        updateloops.add(l.radial_next.next);
        updateloops.add(l.prev);
        updateloops.add(l.next);
      }

      //bvh.update();

      //let updateflag = QRecalcFlags.NEIGHBORS|QRecalcFlags.POLYS|QRecalcFlags.TOPO|QRecalcFlags.CHECK_CUSTOMDATA;
      let updateflag = QRecalcFlags.ALL|QRecalcFlags.MIRROR;

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
          let ri = (~~(Math.random() * trisout.length / 5.0 * 0.99999)) * 5;
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

    if (haveQuadTreeGrids) {
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

  on_mousemove(e) {
    let mode = this.inputs.brush.getValue().tool;
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

    let radius = this.inputs.brush.getValue().radius;
    let strength = this.inputs.brush.getValue().strength; //*strengthMul
    let planeoff = this.inputs.brush.getValue().planeoff;
    let dynmask = this.inputs.dynamicsMask.getValue();

    if (dynmask & DynamicsMask.STRENGTH) {
      strength *= this.inputs.strengthCurve.evaluate(pressure);
    }

    if (dynmask & DynamicsMask.RADIUS) {
      radius *= this.inputs.radiusCurve.evaluate(pressure);
    }

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
      if (mesh.symFlag & (1 << i)) {
        axes.push(i);
      }
    }

    let isect;

    for (let axis of axes) {
      let origin2 = origin, view2 = view;

      if (axis !== -1) {
        let obmat = ob.outputs.matrix.getValue();
        let mat = new Matrix4(ob.outputs.matrix.getValue());
        mat.invert();

        origin2 = new Vector4(origin);
        origin2[3] = 1.0;
        view2 = new Vector4(view);
        view2[3] = 0.0;

        origin2.multVecMatrix(mat);
        origin2[axis] = -origin2[axis];

        view2.multVecMatrix(mat);
        view2[axis] = -view2[axis];

        origin2[3] = 1.0;
        view2[3] = 0.0;

        origin2.multVecMatrix(obmat);
        view2.multVecMatrix(obmat);
        view2.normalize();

        origin2 = new Vector3(origin2);
        view2 = new Vector3(view2);

        //console.log(origin2, view2);
      }

      let isect2 = bvh.castRay(origin2, view2);

      //console.log(isect2);

      if (isect2 && (!isect || isect2.dist < isect.dist)) {
        isect = isect2.copy();
      }
    }

    if (!isect) {
      if ((mode === SculptTools.GRAB || mode === SculptTools.SNAKE) && !this._first) {
        let p = new Vector3(this.last_p);
        view3d.project(p);

        p[0] = mpos[0];
        p[1] = mpos[1];

        view3d.unproject(p);

        let dis = p.vectorDistance(origin);

        isect = {p, dis};
      } else {
        return;
      }
    }

    let p3 = new Vector4(isect.p);
    p3[3] = 1.0;

    let matrix = new Matrix4(ob.outputs.matrix.getValue());
    p3.multVecMatrix(view3d.activeCamera.rendermat);


    let w = p3[3] * matrix.$matrix.m11;
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

      vec.add(view).normalize();
    } else {
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
    let steps = this.last_p.vectorDistance(isect.p) / (radius * spacing);

    if (mode === SculptTools.GRAB) {
      steps = 1;
    }

    if (steps < 1) {
      return;
    }
    steps = Math.max(Math.ceil(steps), 1);

    //console.log("STEPS", steps, radius, spacing, this._first);

    const DRAW = SculptTools.DRAW, SHARP = SculptTools.SHARP, FILL = SculptTools.FILL,
          SMOOTH = SculptTools.SMOOTH, CLAY = SculptTools.CLAY, SCRAPE = SculptTools.SCRAPE,
          PAINT = SculptTools.PAINT, INFLATE = SculptTools.INFLATE, SNAKE = SculptTools.SNAKE,
          PAINT_SMOOTH = SculptTools.PAINT_SMOOTH, GRAB = SculptTools.GRAB;

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
      let s = (i + 1) / steps;

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

      let p2 = new Vector3(this.last_p).interp(isect.p, s);

      p3.load(p2);
      p3[3] = 1.0;
      p3.multVecMatrix(view3d.activeCamera.rendermat);

      let w = p3[3] * matrix.$matrix.m11;

      let vec2 = new Vector3(this.last_vec).interp(vec, s);

      //view3d.makeDrawLine(isect.p, p2, [1, 0, 0, 1]);

      //console.log(isect, isect.tri);

      //vec.load(view);

      let esize = this.inputs.dynTopoLength.getValue();

      esize /= view3d.glSize[1]; //Math.min(view3d.glSize[0], view3d.glSize[1]);
      esize *= w;

      let radius2 = radius + (this.last_radius - radius) * s;

      if (invert) {
        if (isplane) {
          //planeoff = -planeoff;
        } else {
          //strength = -strength;
        }
      }

      let autosmooth = this.inputs.brush.getValue().autosmooth;

      if (dynmask & DynamicsMask.AUTOSMOOTH) {
        autosmooth *= this.inputs.autosmoothCurve.evaluate(pressure);
      }

      let ps = new PaintSample();

      ps.invert = invert;
      ps.p.load(p2);
      ps.p[3] = w;
      ps.viewPlane.load(view).normalize();

      ps.autosmooth = autosmooth;
      ps.esize = esize;
      ps.vec.load(vec2);
      ps.planeoff = planeoff;
      ps.radius = radius2;
      ps.strength = strength;

      let lastps;
      let data = this.inputs.samples.data;

      if (data.length > 0) {
        lastps = data[data.length-1];

        ps.dvec.load(ps.vec).sub(lastps.vec);
        ps.dp.load(ps.p).sub(lastps.p);
      }

      this.inputs.samples.push(ps);
      this.execDot(ctx, ps, lastps);
    }

    this.last_mpos.load(mpos);
    this.last_p.load(isect.p);
    this.last_vec.load(vec);
    this.last_r = radius;

    window.redraw_viewport(true);
  }

  initGrabData(mesh, co, radius) {
    let bvh = mesh.getBVH(false);
    let vs = bvh.closestVerts(co, radius);

    let gd = [];
    let cd_grid = GridBase.meshGridOffset(mesh);
    let haveGrids = cd_grid >= 0;
    let gdists = this.grabDists = [];

    if (haveGrids) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];
        grid.update(mesh, l, cd_grid);
      }

      this.grabEidMap = new Map();

      for (let v of vs) {
        gd.push(v.loopEid);
        gd.push(v.eid);
        gd.push(v.vectorDistance(co));

        gdists.push(v.vectorDistance(co));
        this.grabEidMap.set(v.eid, v);
      }
    } else {
      for (let v of vs) {
        gd.push(v.eid);
        gd.push(0);
        gd.push(v.vectorDistance(co));

        gdists.push(v.vectorDistance(co));
      }
    }

    this.inputs.grabData.setValue(gd);
  }

  execPost() {
    //prevent nasty reference leak in undo stack
    this.grabEidMap = undefined;
  }

  _ensuregrabEidMap(ctx) {
    let mesh = ctx.mesh;

    if (!this.grabEidMap) {
      let gdists = this.grabDists = [];

      let gmap = this.grabEidMap = new Map();
      let grids = new WeakSet();
      let gd = this.inputs.grabData.getValue();

      let cd_grid = GridBase.meshGridOffset(mesh);

      if (cd_grid >= 0) {
        for (let i = 0; i < gd.length; i += GTOT) {
          let l = gd[i], p = gd[i+1], dis = gd[i+2];

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
        for (let i=0; i<gd.length; i += GTOT) {
          let eid = gd[i], dis = gd[i+2];

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

  exec(ctx) {
    let i = 0;
    let lastps;

    for (let ps of this.inputs.samples) {
      this.execDot(ctx, ps, lastps);
    }

    /*
    for (let p of this.inputs.points) {
      this.execDot(ctx, p, this.inputs.vecs.getListItem(i), this.inputs.extra.getListItem(i), lastp);
      lastp = p;
      i++;
    }*/

    window.redraw_viewport(true);
  }

  execDot(ctx, ps, lastps) {//ctx, p3, vec, extra, lastp3 = p3) {
    let falloff = this.inputs.falloff.getValue();
    let brush = this.inputs.brush.getValue();
    let haveTex = brush.texUser.texture !== undefined;
    let texScale = 1.0;
    let tex = brush.texUser.texture;

    if (this.inputs.brush.getValue().tool === SculptTools.GRAB) {
      this._ensuregrabEidMap(ctx);
    }

    const DRAW = SculptTools.DRAW, SHARP = SculptTools.SHARP, FILL = SculptTools.FILL,
          SMOOTH = SculptTools.SMOOTH, CLAY = SculptTools.CLAY, SCRAPE = SculptTools.SCRAPE,
          PAINT = SculptTools.PAINT, INFLATE = SculptTools.INFLATE, SNAKE = SculptTools.SNAKE,
          PAINT_SMOOTH = SculptTools.PAINT_SMOOTH, GRAB = SculptTools.GRAB,
          COLOR_BOUNDARY = SculptTools.COLOR_BOUNDARY;

    if (!ctx.object || !(ctx.object.data instanceof Mesh)) {
      console.log("ERROR!");
      return;
    }

    let haveOrigData = false;

    let undo = this._undo;
    let vmap = undo.vmap;
    let gset = undo.gset;
    let gmap = undo.gmap;
    let gdata = undo.gdata;

    let ob = ctx.object;
    let mesh = ob.data;

    let mres, oldmres;

    let bvh = mesh.getBVH(false);

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

    let mode = this.inputs.brush.getValue().tool;
    let radius = ps.radius;
    let strength = ps.strength;

    let haveGrids = bvh.cd_grid >= 0;
    let cd_grid = bvh.cd_grid;

    let isPaintMode = mode === PAINT || mode === PAINT_SMOOTH;

    let planeoff = ps.planeoff;

    let isplane = false;

    let esize = ps.esize;

    let w = ps.p[3];

    if (haveTex) {
      texScale *= 10.0/w;
    }

    if (mode === SCRAPE) {
      planeoff += -0.5;
      //strength *= 5.0;
      isplane = true;
    } else if (mode === FILL) {
      strength *= 0.5;
      isplane = true;
    } else if (mode === CLAY) {
      planeoff += 1.5;

      strength *= 2.0;

      isplane = true;
    } else if (mode === SMOOTH) {
      isplane = true;
    } else if (mode === PAINT) {

    } else if (mode === SHARP) {
      isplane = true;
      planeoff += 3.0;
      strength *= 2.0;
    } else if (mode === GRAB) {
      haveOrigData = true;
      strength *= 5.0;
      isplane = false;
    } else if (mode === SNAKE) {
      haveOrigData = true;
      isplane = false;
    }

    let vec = new Vector3(ps.vec);

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
    }

    let cd_orig = -1;

    if (haveOrigData) {
      cd_orig = this.initOrigData(mesh);
    }

    let sym = mesh.symFlag;

    if (mode !== SNAKE) {
      //let w2 = Math.pow(Math.abs(w), 0.5)*Math.sign(w);
      let w2 = Math.pow(Math.abs(radius), 0.5)*Math.sign(radius);

      vec.mulScalar(strength * 0.1 * w2);
    }

    let vlen = vec.vectorLength();
    let nvec = new Vector3(vec).normalize();
    let planep = new Vector3(ps.p);

    planep.addFac(vec, planeoff);

    let p3 = new Vector3(ps.p);

    //query bvh tree
    let vs;
    if (mode === GRAB) {
      let gmap = this.grabEidMap;
      let gd = this.inputs.grabData.getValue();
      vs = new Set();

      if (haveGrids) {
        for (let i = 0; i < gd.length; i += GTOT) {
          let leid = gd[i], peid = gd[i+1];
          let v = gmap.get(peid);
          if (!v) {
            console.warn("Missing grid vert " + peid);
            throw new Error("missing grid vert");
            continue;
          }

          vs.add(v);
        }
      } else {
        for (let i=0; i<gd.length; i += GTOT) {
          let v = mesh.eidmap[gd[i]];
          if (!v) {
            console.warn("Missing vert " + gd[i]);
            continue;
          }

          vs.add(v);
        }
      }
    } else {
      vs = bvh.closestVerts(p3, radius);
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

      if (1||t1.dot(t2) > 0.05) {
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


    let vsw;
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

    function doUndo(v) {
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
          node.node.flag |= BVHFlags.UPDATE_NORMALS|BVHFlags.UPDATE_DRAW;
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
        let id = v.loopEid * gdimen * gdimen + v.index;

        if (!gset.has(id)) {
          if (haveOrigData) {
            v.customData[cd_orig].value.load(v);
          }

          gset.add(id);
          gdata.push(v.loopEid);
          gdata.push(v.index);

          if (isPaintMode) {
            let c = v.customData[cd_color].color;
            gdata.push(c[0]);
            gdata.push(c[1]);
            gdata.push(c[2]);
            gdata.push(c[3]);
          } else {
            gdata.push(v[0]);
            gdata.push(v[1]);
            gdata.push(v[2]);
            gdata.push(v.no[0]);
            gdata.push(v.no[1]);
            gdata.push(v.no[2]);
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
          _tmp.mulScalar(1.0 / w);
          v.interp(_tmp, fac);
        }

        /*
        for (let v2 of v.bRing) {
          v2[0] = v[0];
          v2[1] = v[1];
          v2[2] = v[2];
        }//*/
      };
    } else {
      colorfilter = colorfilterfuncs[0];
      let _tmp2 = new Vector3();

      vsmooth = (v, fac) => {
        _tmp2.load(v);
        let w = 1.0;

        for (let v2 of v.neighbors) {
          _tmp2.add(v2);
          w++;
        }

        _tmp2.mulScalar(1.0 / w);
        v.interp(_tmp2, fac);
      }
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

        let dr = abs(c1[0]-c2[0]);
        let dg = abs(c1[1]-c2[1]);
        let db = abs(c1[2]-c2[2]);

        let w = (dr*1.25 + dg*1.5 + db)*0.25;
        //w *= w;

        co.addFac(v2, w);
        tot += w;
      }

      if (tot === 0.0) {
        return;
      }

      co.mulScalar(1.0 / tot);

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

    let color;
    if (have_color) {
      color = new Vector4(this.inputs.brush.getValue().color);
    }

    if (mode === COLOR_BOUNDARY && !have_color) {
      return;
    }

    let wi = 0;

    let planetmp = new Vector3();

    switch (mode) {
      case SMOOTH:
      case PAINT_SMOOTH:
        vsw = Math.abs(strength) + ps.autosmooth;
        break;
      default:
        vsw = ps.autosmooth; //autosmooth
        break;
    }

    if (isPaintMode && !have_color) {
      return;
    }

    let astrength = Math.abs(strength);
    let bLinks = new Set();

    let gdists = this.grabDists, idis = 0;

    wi = 0;
    for (let v of vs) {
      doUndo(v);

      let dis = mode === GRAB ? gdists[idis++] : v.vectorDistance(p3);


      let f = Math.max(1.0 - dis / radius, 0.0);
      let f2 = f;

      f = falloff.evaluate(f);

      if (haveTex) {
        f *= tex.evaluate(v, texScale);
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
      if (isplane) {
        f2 = f * strength;

        if (mode === SMOOTH) {
          f2 *= f2 * f2 * 0.1;
        }

        let co = planetmp.load(v);
        co.sub(planep);

        let d = co.dot(nvec);
        v.addFac(vec, -d * f2);
      } else if (mode === DRAW) {
        v.addFac(vec, f);//
      } else if (have_color && mode === PAINT) {
        let c = v.customData[cd_color];

        c.color.interp(color, f * strength);
      } else if (mode === INFLATE) {
        v.addFac(v.no, f * strength * 0.025);
      } else if (mode === SNAKE) {
        v.interp(v.customData[cd_orig].value, 0.1*f);
        v.addFac(vec, f * strength);

        _tmp.load(v).multVecMatrix(rmat);
        v.interp(_tmp, f*strength);
      } else if (mode === GRAB) {
        //v.load(v.customData[cd_orig].value);
        v.addFac(vec, f);
      } else if (mode === COLOR_BOUNDARY) {
        colorboundary(v, f*strength);
      }

      if (haveGrids && v.bLink) {
        bLinks.add(v);
        doGridBoundary(v);
      }

      ws[wi++] = f;

      v.flag |= MeshFlags.UPDATE;
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

        for (let i=0; i<1; i++) {
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

      if (vsw > 0) {
        if (isPaintMode) {
          v.customData[cd_color].color.load(colorfilter(v, cd_color, vsw * ws[wi++]));
        } else {
          vsmooth(v, vsw*ws[wi++]);
        }
      }

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

      for (let i=0; i<steps; i++) {
        for (let v of bLinks) {
          doGridBoundary(v);
        }
      }
    }

    let doTopo = mode === SculptTools.TOPOLOGY || this.inputs.useDynTopo.getValue();
    doTopo = doTopo && !this.inputs.useMultiResDepth.getValue();

    if (haveGrids && haveQuadTreeGrids && doTopo) {
      let vs2 = new Set(vs);

      for (let v of vs) {
        for (let v2 of v.neighbors) {
          vs2.add(v2);
        }
      }

      this.doQuadTopo(mesh, bvh, esize, vs2, p3, radius);
    }
    /*
    if (!haveGrids && mode !== SMOOTH) {
      let es = new Set();

      for (let v of vs) {
        for (let e of v.edges) {
          es.add(e);
        }
      }

      this.doTopology(mesh, bvh, esize, vs, es);
    }
    //*/

    bvh.update();

    if (mres && oldmres) {
      oldmres.copyTo(mres);

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        grid.recalcFlag |= QRecalcFlags.NORMALS|QRecalcFlags.TOPO|QRecalcFlags.NEIGHBORS;
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

  doTopology(mesh, bvh, esize, vs, es) {
    if (util.time_ms() - this._last_time < 50) {
      return;
    }
    this._last_time = util.time_ms();

    this.doTopologySubdivide(mesh, bvh, esize, vs, es);

    //cull deleted edges
    let es2 = new Set();

    for (let e of es) {
      if (e.eid >= 0) {
        es2.add(e);
      }
    }
    es = es2;

    this.doTopologyCollapse(mesh, bvh, esize, vs, es);
  }

  doTopologyCollapse(mesh, bvh, esize, vs, es) {
    let es2 = [];

    esize /= 2.0;

    let esqr = esize * esize;
    let fs = new Set();
    let fmap = new Map();

    let cd_face_node = bvh.cd_face_node;

    let max = 18;

    let es0 = [];
    for (let e of es) {
      es0.push(e);
    }
    es = es0;

    for (let e of es) {
      let ri = ~~(Math.random() * es.length * 0.9999);
      e = es[ri];

      if (es2.length >= max) {
        break;
      }

      if (!e.l) {
        continue;
      }

      let lensqr = e.v1.vectorDistanceSqr(e.v2);

      if (Math.random() > lensqr / esqr) {
        continue;
      }

      if (lensqr < esqr) {
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

    for (let e1 of es2) {
      for (let i = 0; i < 2; i++) {
        let v = i ? e1.v2 : e1.v1;

        for (let e of v.edges) {
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

    //console.log("es2", es2);

    for (let e of es2) {
      if (e.eid < 0) {
        continue;
      }
      mesh.collapseEdge(e);
    }

    for (let f of fs2) {
      let node = f.customData[cd_face_node].node;
      if (node) {
        node.flag |= BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_UNIQUE_VERTS | BVHFlags.UPDATE_DRAW;
        bvh.updateNodes.add(node);
      }

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


        //let tri = bvh.getTrackById(f.eid, bvh._nextTriIdx(), v1, v2, v3);

        bvh.addTri(f.eid, bvh._nextTriIdx(), v1, v2, v3, true);

        l = l.next;
      } while (l !== f.lists[0].l.prev && _i++ < 1000);
    }
  }

  doQuadTopo(mesh, bvh, esize, vs, brushco, brushradius) {
    //console.log("quadtree topo!")
    if (util.time_ms() - this._last_time < 15) {
      return;
    }
    //ensure bounds are correct
    bvh.update();

    let cd_grid = bvh.cd_grid;
    let cd_node = bvh.cd_node;

    const esize1 = esize*1.5;
    const esize2 = esize;

    const esqr1 = esize1 * esize1;
    const esqr2 = esize2 * esize2;

    let haveKdTree = false;
    let layer = mesh.loops.customData.flatlist[bvh.cd_grid];
    if (layer.typeName === "KdTreeGrid") {
      haveKdTree = true;
    }

    let MAXCHILD = haveKdTree ? 2 : 4;
    let data = [];
    const DGRID = 0, DNODE = 1, DLOOP = 2, DMODE=3, DTOT = 4;

    const SUBDIVIDE = 0, COLLAPSE = 1;

    let QFLAG = QuadTreeFields.QFLAG,
        QDEPTH = QuadTreeFields.QDEPTH,
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

    for (let _i=0; _i<vs.length; _i++) {
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
      let dtot=0, ntot=0;
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
          for (let i=0; i<4; i++) {
            let p = grid.points[ns[ni+QPOINT1+i]];
            let p2 = grid.points[ns[ni+QPOINT1+((i+1)%4)]];

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
              t.mulScalar(1.0 / len);
            }

            let co = dn2.load(brushco).sub(p);

            let dt = t.dot(co) / len;

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

            if (mode === SUBDIVIDE && ns[ni+QDEPTH] >= maxDepth) {
              continue;
            }

            if (mode === COLLAPSE) {
              if (!ni || visit2.has(grid.nodes[ni+QPARENT])) {
                continue;
              }

              ni = grid.nodes[ni+QPARENT];
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

    let idmul = (maxdimen + 2) * (maxdimen + 2) * 128;

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
      let mode = data[di+3];

      let ns = grid.nodes, ps = grid.points;

      let key = l.eid * idmul + ni;
      if (visit.has(key) || (grid.nodes[ni+QFLAG] & DEAD)) {
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
      let updateflag2 = QRecalcFlags.NEIGHBORS|QRecalcFlags.TOPO;

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

    let _tmp = [0,0 ,0];
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
      let id = trisout[ri+1];
      let v1 = trisout[ri+2];
      let v2 = trisout[ri+3];
      let v3 = trisout[ri+4];

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

      for (let j=0; j < 5; j++) {
        trisout[ri+j] = trisout[ri2+j];
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

  doTopologySubdivide(mesh, bvh, esize, vs, es) {
    let esetin = es;

    let es2 = [];

    let es0 = [];
    for (let e of es) {
      es0.push(e);
    }
    es = es0;

    esize *= 1.5;

    let esqr = esize * esize;
    let fs = new Set();
    let fmap = new Map();

    let cd_face_node = bvh.cd_face_node;

    let pad = 4;
    let max = 18 * pad;

    let lens = [];

    for (let e of es) {
      let ri = ~~(Math.random() * 0.9999 * es.length);
      e = es[ri];

      if (es2.length >= max) {
        break;
      }

      if (!e.l) {
        continue;
      }

      let lensqr = e.v1.vectorDistanceSqr(e.v2);
      if (lensqr >= esqr) {
        let l = e.l;
        let _i = 0;

        do {
          fs.add(l.f);
          l = l.radial_next;
        } while (l !== e.l && _i++ < 100);

        e.index = es2.length;
        es2.push(e);

        lens.push(lensqr);
      }
    }

    es2.sort((a, b) => lens[a.index] - lens[b.index]);
    es2 = es2.slice(0, max / pad);
    es2 = new Set(es2);

    for (let f of fs) {
      let tris = bvh.fmap.get(f.eid);
      if (tris && tris.length > 0) {
        let node = tris[0].node;
        f.customData[cd_face_node].node = node;
        node.flag |= BVHFlags.UPDATE_UNIQUE_VERTS;
        bvh.updateNodes.add(node);
        fmap.set(f, node);
      }

      bvh.removeFace(f.eid);
    }

    let {newvs, newfs, killfs} = splitEdgesSmart(mesh, es2);

    for (let f of killfs) {
      fs.delete(f);
    }

    let fs2 = new Set();

    for (let f of newfs) {
      for (let list of f.lists) {
        for (let l of list) {
          let lr = l.radial_next;

          if (lr !== l) {// && !lr.f.customData[cd_face_node].node) {
            fs2.add(lr.f);
          }
        }
      }
    }

    //console.log("NEW", newvs, newfs, es2, esize);
    //return;
    //let newvs = new Set(), newfs = fs;

    //console.log("new", newvs.size, newfs.size, killfs.size);

    if (newvs.size > 0 || newfs.size > 0) {
      mesh.regenTesellation();

      for (let i = 0; i < 2; i++) {
        let fsiter = i ? fs2 : newfs;

        for (let f of fsiter) {
          f.calcNormal();

          if (killfs.has(f) || f.eid < 0) {
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

            let node;

            node = f.customData[cd_face_node].node;

            if (!node) {
              let f2 = fmap.get(f);

              if (f2) {
                node = f.customData[cd_face_node].node;
              }
            }

            //v1[0] += (Math.random()-0.5)*esize*0.2;
            //v1[1] += (Math.random()-0.5)*esize*0.2;
            //v1[2] += (Math.random()-0.5)*esize*0.2;

            let r = Math.random();

            if (0) {//node) {
              if (!node.leaf) {
                node.addTri(f.eid, bvh._nextTriIdx(), v1, v2, v3, true);
              } else {
                let tri = node.bvh._getTri(f.eid, bvh._nextTriIdx(), v1, v2, v3);

                node.uniqueTris.add(tri);
                node.allTris.add(tri);

                bvh.updateNodes.add(node);
                node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_UNIQUE_VERTS | BVHFlags.UPDATE_NORMALS;
              }
            } else {
              bvh.addTri(f.eid, bvh._nextTriIdx(), v1, v2, v3, true);

              let node = f.customData[cd_face_node].node;
              if (node) {
                bvh.updateNodes.add(node);
                node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS;
              }
            }

            l = l.next;
          } while (l !== firstl.prev && _i++ < 1000);
        }
      }
    }
  }

  modalStart(ctx) {
    this._first = true;
    return super.modalStart(ctx);
  }

  modalEnd() {
    let ctx = this.modal_ctx;

    this.grabEidMap = undefined;

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

    //auto-rebuild bvh if topology changed
    if (mesh instanceof Mesh) {
      mesh.getBVH(true);
    }
  }
}

ToolOp.register(PaintOp);

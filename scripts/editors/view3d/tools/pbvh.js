import {WidgetFlags} from "../widgets/widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {BVH, BVHFlags} from "../../../util/bvh.js";
import {KeyMap, HotKey} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/util/struct.js';
import {TranslateWidget} from "../widgets/widget_tools.js";
import * as util from '../../../util/util.js';

let STRUCT = nstructjs.STRUCT;
import {Loop, Mesh} from '../../../mesh/mesh.js';
import {Shapes} from '../../../core/simplemesh_shapes.js';
import {Shaders} from "../../../shaders/shaders.js";
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../../../util/vectormath.js';
import {
  ToolOp,
  Vec4Property,
  FloatProperty,
  IntProperty,
  BoolProperty,
  EnumProperty,
  FlagProperty,
  math,
  ListProperty,
  PackFlags,
  Curve1D, Curve1DProperty, SplineTemplates
} from "../../../path.ux/scripts/pathux.js";
import {MeshFlags} from "../../../mesh/mesh.js";
import {SimpleMesh, LayerTypes, PrimitiveTypes} from "../../../core/simplemesh.js";
import {splitEdgesSmart} from "../../../mesh/mesh_subdivide.js";
import {
  GridBase,
  GridSettingFlags,
  QRecalcFlags,
} from "../../../mesh/mesh_grids.js";
import {
  QuadTreeFields,
  QuadTreeFlags,
  QuadTreeGrid
} from "../../../mesh/mesh_grids_quadtree.js";

let _triverts = new Array(3);

import {
  DynamicsMask, SculptTools, BrushDynamics, SculptBrush,
  BrushDynChannel, DefaultBrushes, SculptIcons, PaintToolSlot, BrushFlags
} from "../../../brush/brush.js";
import {DataRefProperty} from "../../../core/lib_api.js";


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

    this.last_mpos = new Vector2();
    this.last_p = new Vector3();
    this._first = true;
    this.last_radius = 0;
    this.last_vec = new Vector3();
  }

  static tooldef() {
    return {
      name: "paintop",
      toolpath: "bvh.paint",
      is_modal: true,
      inputs: {
        points: new ListProperty(Vec4Property), //fourth component is radius
        vecs: new ListProperty(Vec4Property), //displacements, fourth component
        extra: new ListProperty(Vec4Property), //stores strength

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
      mode: this.inputs.tool.getValue(),
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

        grid2.copyTo(grid1);

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
    window.redraw_viewport();
  }

  on_mousemove(e) {
    let mode = this.inputs.tool.getValue();
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

    let radius = this.inputs.radius.getValue();
    let strength = this.inputs.strength.getValue();
    let planeoff = this.inputs.planeoff.getValue();
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
      return;
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

    if (mode !== SculptTools.SNAKE) {
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

      return;
    }

    let spacing = this.inputs.spacing.getValue();
    let steps = this.last_p.vectorDistance(isect.p) / (radius * spacing);

    if (steps < 1) {
      return;
    }
    steps = Math.max(Math.ceil(steps), 1);

    //console.log("STEPS", steps, radius, spacing, this._first);

    for (let i = 0; i < steps; i++) {
      let s = (i + 1) / steps;

      const DRAW = SculptTools.DRAW, SHARP = SculptTools.SHARP, FILL = SculptTools.FILL,
        SMOOTH = SculptTools.SMOOTH, CLAY = SculptTools.CLAY, SCRAPE = SculptTools.SCRAPE,
        PAINT = SculptTools.PAINT, INFLATE = SculptTools.INFLATE, SNAKE = SculptTools.SNAKE,
        PAINT_SMOOTH = SculptTools.PAINT_SMOOTH;

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

      if (mode === SHARP) {
        strength *= -1;
      }

      if (e.ctrlKey) {
        //if (mode === SculptTools.INFLATE || mode === SculptTools.SHARP) {
        //}
        if (mode !== SculptTools.PAINT && mode !== SculptTools.PAINT_SMOOTH) {
          strength *= -1;
        }
      }

      let esize = this.inputs.dynTopoLength.getValue();

      esize /= view3d.glSize[1]; //Math.min(view3d.glSize[0], view3d.glSize[1]);
      esize *= w;

      let radius2 = radius + (this.last_radius - radius) * s;

      p3.load(p2);
      p3[3] = radius2;

      let vec4 = new Vector4(vec2);
      vec4[3] = this.inputs.planeoff.getValue();

      let extra = new Vector4();
      extra[0] = strength;

      let autosmooth = this.inputs.autosmooth.getValue();

      if (dynmask & DynamicsMask.AUTOSMOOTH) {
        autosmooth *= this.inputs.autosmoothCurve.evaluate(pressure);
      }

      extra[1] = autosmooth;
      extra[2] = esize;
      extra[3] = w;

      this.inputs.points.push(p3);
      this.inputs.vecs.push(vec4);
      this.inputs.extra.push(extra);

      this.execDot(ctx, p3, vec4, extra);
    }

    this.last_mpos.load(mpos);
    this.last_p.load(isect.p);
    this.last_vec.load(vec);
    this.last_r = radius;

    window.redraw_viewport();
  }

  exec(ctx) {
    let i = 0;
    let lastp;

    for (let p of this.inputs.points) {
      this.execDot(ctx, p, this.inputs.vecs.getListItem(i), this.inputs.extra.getListItem(i), lastp);
      lastp = p;
      i++;
    }

    window.redraw_viewport();
  }

  execDot(ctx, p3, vec, extra, lastp3 = p3) {
    let falloff = this.inputs.falloff.getValue();

    const DRAW = SculptTools.DRAW, SHARP = SculptTools.SHARP, FILL = SculptTools.FILL,
      SMOOTH = SculptTools.SMOOTH, CLAY = SculptTools.CLAY, SCRAPE = SculptTools.SCRAPE,
      PAINT = SculptTools.PAINT, INFLATE = SculptTools.INFLATE, SNAKE = SculptTools.SNAKE,
      PAINT_SMOOTH = SculptTools.PAINT_SMOOTH;

    if (!ctx.object || !(ctx.object.data instanceof Mesh)) {
      console.log("ERROR!");
      return;
    }

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

    let mode = this.inputs.tool.getValue();
    let radius = p3[3];
    let strength = extra[0];

    let isPaintMode = mode === PAINT || mode === PAINT_SMOOTH;

    let planeoff = vec[3];
    let isplane = false;

    let esize = extra[2];
    let w = extra[3];

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
    }

    let updateflag = BVHFlags.UPDATE_DRAW;
    if (mode !== PAINT && mode !== PAINT_SMOOTH) {
      updateflag |= BVHFlags.UPDATE_NORMALS;
    }

    let sym = mesh.symFlag;

    vec = new Vector3(vec);
    if (mode !== SNAKE) {
      //let w2 = Math.pow(Math.abs(w), 0.5)*Math.sign(w);
      let w2 = Math.pow(Math.abs(radius), 0.5)*Math.sign(radius);

      vec.mulScalar(strength * 0.1 * w2);
    }

    let vlen = vec.vectorLength();
    let nvec = new Vector3(vec).normalize();
    let planep = new Vector3(p3);

    if (isplane && strength < 0.0) {
      //nvec.negate();
      //vec.negate();
      planeoff *= 1.5;
      strength = Math.abs(strength);
    }

    planep.addFac(vec, planeoff);

    //console.log(w);

    //console.log("radius", radius);

    p3 = new Vector3(p3);
    let vs = bvh.closestVerts(p3, radius);

    //console.log(vs, p3);

    let vsw;
    let _tmp = new Vector3();

    let haveGrids = bvh.cd_grid >= 0;
    let cd_grid = bvh.cd_grid;

    let vsmooth, gdimen, cd_color, have_color;
    let haveQuadTreeGrids = false;

    if (haveGrids) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        if (grid instanceof QuadTreeGrid) {
          haveQuadTreeGrids = true;
        }

        break;
      }
    }

    function doUndo(v) {
      if (!haveGrids && !vmap.has(v.eid)) {
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
              grid.recalcFlag |= QRecalcFlags.MIRROR;
              gmap.set(l, grid.copy())
              grid.update(mesh, l, cd_grid);
              grid.relinkCustomData();
            }
          }
        }
      } else if (haveGrids) {
        let id = v.loopEid * gdimen * gdimen + v.index;
        if (!gset.has(id)) {
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
          v.interp(_tmp, vsw * fac);
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

      vsmooth = (v, fac) => {
        _tmp.load(v);
        let w = 1.0;

        for (let e of v.edges) {
          let v2 = e.otherVertex(v);

          _tmp.add(v2);
          w++;
        }

        _tmp.mulScalar(1.0 / w);
        v.interp(_tmp, vsw * fac);
      }
    }

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
      color = this.inputs.color.getValue();
    }

    let wi = 0;

    let planetmp = new Vector3();

    switch (mode) {
      case SMOOTH:
      case PAINT_SMOOTH:
        vsw = Math.abs(strength) + extra[1];
        break;
      default:
        vsw = extra[1]; //autosmooth
        break;
    }

    //vsw += extra[1];

    if (isPaintMode && !have_color) {
      return;
    }

    let astrength = Math.abs(strength);
    let bLinks = new Set();

    wi = 0;
    for (let v of vs) {
      doUndo(v);

      let f = Math.max(1.0 - v.vectorDistance(p3) / radius, 0.0);
      let f2 = f;

      f = falloff.evaluate(f);

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
        v.addFac(vec, f * strength);
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
          vsmooth(v, ws[wi++]);
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

    //mesh.recalcNormals();
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
    const esize2 = esize*0.75;

    const esqr1 = esize1 * esize1;
    const esqr2 = esize2 * esize2;

    let data = [];
    const DGRID = 0, DNODE = 1, DLOOP = 2, DMODE=3, DTOT = 4;

    const SUBDIVIDE = 0, COLLAPSE = 1;

    const QFLAG = QuadTreeFields.QFLAG,
      QDEPTH = QuadTreeFields.QDEPTH,
      QPARENT = QuadTreeFields.QPARENT,
      QPOINT1 = QuadTreeFields.QPOINT1;

    const LEAF = QuadTreeFlags.LEAF,
      DEAD = QuadTreeFlags.DEAD;

    const updateflag = BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_DRAW;

    let vs2 = new Set();
    let grids = new Set();
    let gridmap = new Map();

    let visit = new Set();
    let updateloops = new Set();
    let bnodes = new Set();

    let maxDepth = this.inputs.dynTopoDepth.getValue();

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

    let limit = 55;

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
            let mode;// = etot ? COLLAPSE : SUBDIVIDE;
            if (etot) {
              mode = COLLAPSE;
            } else if (dtot) {
              mode = SUBDIVIDE;
            } else {
              continue;
            }
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
        grid.subdivide(ni, l.eid);
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

export class SetBrushRadius extends ToolOp {
  constructor() {
    super();

    this.last_mpos = new Vector2();
    this.mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.cent_mpos = new Vector2();
    this.first = true;
  }

  static canRun(ctx) {
    return ctx.toolmode && ctx.toolmode instanceof BVHToolMode;
  }

  static tooldef() {
    return {
      uiname: "Set Brush Radius",
      toolpath: "brush.set_radius",
      inputs: {
        radius: new FloatProperty(15.0),
        brush: new DataRefProperty(SculptBrush)
      },
      is_modal: true
    }
  }

  modalStart(ctx) {
    this.first = true;
    return super.modalStart(ctx);
  }

  on_mousemove(e) {
    let mpos = this.mpos;

    mpos[0] = e.x;
    mpos[1] = e.y;

    if (this.first) {
      this.first = false;
      this.cent_mpos.load(mpos).subScalar(this.inputs.radius.getValue() / devicePixelRatio / Math.sqrt(2.0));

      this.start_mpos.load(mpos);
      this.last_mpos.load(mpos);
      return;
    }


    let ctx = this.modal_ctx;

    let brush = ctx.datalib.get(this.inputs.brush.getValue());
    if (!brush) {
      return;
    }

    let l1 = mpos.vectorDistance(this.cent_mpos);
    let l2 = this.last_mpos.vectorDistance(this.cent_mpos);

    if (l2 === 0.0 || l1 === 0.0) {
      return;
    }

    this.resetTempGeom();
    this.makeTempLine(this.cent_mpos, this.mpos, "rgba(25,25,25,0.25)");

    let toolmode = ctx.toolmode;
    if (toolmode && toolmode instanceof BVHToolMode) {
      toolmode.mpos.load(this.cent_mpos);
    }

    let ratio = l1 / l2;
    let radius;

    if (brush.flag & BrushFlags.SHARED_SIZE) {
      let bvhtool = ctx.scene.toolmode_namemap.bvh;
      if (bvhtool) {
        radius = bvhtool.sharedBrushRadius;
      } else {
        radius = brush.radius;
      }
    } else {
      radius = brush.radius;
    }

    radius *= ratio;
    console.log("F", ratio, radius);

    this.last_mpos.load(mpos);
    this.inputs.radius.setValue(radius);

    this.exec(ctx);
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    let toolmode = ctx.toolmode;
    if (!toolmode || !(toolmode instanceof BVHToolMode)) {
      return tool;
    }

    let brush = toolmode.getBrush();
    if (!brush) {
      return tool;
    }

    if (!("brush" in args)) {
      tool.inputs.brush.setValue(brush);
    }

    if (!("radius" in args)) {
      let radius = brush.flag & BrushFlags.SHARED_SIZE ? toolmode.sharedBrushRadius : brush.radius;
      tool.inputs.radius.setValue(radius);
    }

    return tool;
  }

  on_mouseup(e) {
    this.modalEnd(false);
  }

  exec(ctx) {
    let brush = ctx.datalib.get(this.inputs.brush.getValue());

    if (brush) {
      if (brush.flag & BrushFlags.SHARED_SIZE) {
        let toolmode = ctx.scene.toolmode_namemap.bvh;

        if (toolmode) {
          toolmode.sharedBrushRadius = this.inputs.radius.getValue();
        }
      } else {
        brush.radius = this.inputs.radius.getValue();
      }
    }
  }

  undoPre(ctx) {
    let brush = ctx.datalib.get(this.inputs.brush.getValue());

    this._undo = {};

    if (brush) {
      this._undo.radius = brush.radius;
      this._undo.brushref = DataRef.fromBlock(brush);
    }
  }

  undo(ctx) {
    let undo = this._undo;

    if (!undo.brushref) {
      return;
    }

    let brush = ctx.datalib.get(undo.brushref);
    if (!brush) {
      return;
    }

    if (brush.flag & BrushFlags.SHARED_SIZE) {
      let toolmode = ctx.scene.toolmode_namemap.bvh;

      if (toolmode) {
        toolmode.sharedBrushRadius = undo.radius;
      }
    } else {
      brush.radius = undo.radius;
    }
  }

  on_keydown(e) {
    super.on_keydown(e);
  }
}

ToolOp.register(SetBrushRadius);

export class BVHToolMode extends ToolMode {
  constructor(manager) {
    super(manager);

    this.sharedBrushRadius = 55;

    this.gridEditDepth = 2;
    this.enableMaxEditDepth = false;
    this.dynTopoLength = 30;
    this.dynTopoDepth = 4;

    this.mpos = new Vector2();
    this._radius = undefined;

    this.drawFlat = false;
    this.flag |= WidgetFlags.ALL_EVENTS;

    this.tool = SculptTools.CLAY;
    //this.brush = new SculptBrush();
    this.slots = {};

    this._brush_lines = [];

    for (let k in SculptTools) {
      let tool = SculptTools[k];
      this.slots[tool] = new PaintToolSlot(tool);
    }

    this.drawBVH = false;
    this.drawNodeIds = false;
    this.drawWireframe = false;

    this._last_bvh_key = "";
    this.view3d = manager !== undefined ? manager.view3d : undefined;
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("F", [], "brush.set_radius()")
    ]);
  }

  static buildEditMenu() {
    return ["brush.set_radius()"];
  }

  getBrush(tool = this.tool) {
    if (!this.ctx) {
      return undefined;
    }

    return this.slots[tool].resolveBrush(this.ctx);
  }

  drawBrush(view3d) {
    for (let l of this._brush_lines) {
      l.remove();
    }
    this._brush_lines.length = 0;

    let drawCircle = (x, y, r, mat = new Matrix4(), z = 0.0) => {
      let p = new Vector3(), lastp = new Vector3();
      let steps = Math.max(Math.ceil((Math.PI * r * 2) / 20), 8);
      let th = -Math.PI, dth = (2.0 * Math.PI) / (steps - 1);

      r /= devicePixelRatio;
      let mpos = view3d.getLocalMouse(x, y);
      x = mpos[0];
      y = mpos[1];
      //y -= r * 0.5;

      for (let i = 0; i < steps; i++, th += dth) {
        p[0] = x + Math.cos(th) * r;
        p[1] = y + Math.sin(th) * r;
        p[2] = z;

        p.multVecMatrix(mat);
        if (i > 0) {
          this._brush_lines.push(view3d.overdraw.line(lastp, p, "red"));
        }
        lastp.load(p);
      }
    }

    let brush = this.getBrush();
    if (!brush) {
      return;
    }

    let radius = brush.flag & BrushFlags.SHARED_SIZE ? this.sharedBrushRadius : brush.radius;

    let r = this._radius !== undefined ? this._radius : radius;
    drawCircle(this.mpos[0], this.mpos[1], r);
  }

  static register(cls) {
    ToolModes.push(cls);
    //WidgetTool.register(cls);
  }

  static toolModeDefine() {
    return {
      name: "bvh",
      uiname: "bvh test",
      icon: Icons.FACE_MODE,
      flag: 0,
      description: "Test bvh",
      selectMode: SelMask.OBJECT | SelMask.GEOM, //if set, preferred selectmode, see SelModes
      transWidgets: []
    }
  }

  static buildSettings(container) {
    let name = this.toolModeDefine().name;
    let path = `scene.tools.${name}`

    let browser = document.createElement("data-block-browser-x");
    browser.blockClass = SculptBrush;
    browser.setAttribute("datapath", path + ".brush");
    browser.filterFunc = function (brush) {
      if (!browser.ctx) {
        return false;
      }

      let toolmode = browser.ctx.toolmode;
      return brush.tool === toolmode.tool;
    }

    container.add(browser);

    let col = container.col();
    let strip, panel;

    function doChannel(name) {
      let col2 = col.col();


      col2.style["padding"] = "7px";
      col2.style["margin"] = "2px";
      col2.style["border"] = "1px solid rgba(25,25,25,0.25)";
      col2.style["border-radius"] = "15px";

      if (name === "radius") {
        col2.prop(path + `.brushRadius`);
      } else {
        col2.prop(path + `.brush.${name}`);
      }

      panel = col2.panel("Dynamics");

      panel._panel.overrideDefault("padding-top", 0);
      panel._panel.overrideDefault("padding-bottom", 0);
      panel.prop(path + `.brush.dynamics.${name}.useDynamics`);
      panel.prop(path + `.brush.dynamics.${name}.curve`);
      panel.closed = true;
      panel.setCSS();
    }

    panel = col.panel("Falloff");
    let i1 = 1;

    function makebutton(k) {
      panel.button("" + (i1++), () => {
        let curve = panel.ctx.toolmode.getBrush().falloff;
        curve.setGenerator("bspline");

        let bspline = curve.generators.active;
        bspline.loadTemplate(SplineTemplates[k]);
      });
    }

    for (let k in SplineTemplates) {
      makebutton(k);
    }

    panel.prop(path + ".brush.falloff");
    panel.closed = true;

    doChannel("radius");
    doChannel("strength");
    doChannel("autosmooth");

    col.prop(path + ".brush.spacing");
    col.prop(path + ".brush.color");
    col.prop(path + ".brush.bgcolor");

    col.prop(path + ".brush.planeoff");

    strip = col.row();
    strip.useIcons();
    strip.tool("mesh.add_or_subdivide_grids()");
    strip.tool("mesh.reset_grids()");
    strip.tool("mesh.delete_grids()");

    col.prop(path + ".dynTopoLength");
    col.prop(path + ".brush.flag[DYNTOPO]");

    col.tool("mesh.smooth_grids()");
    col.tool("mesh.grids_test()");

    panel = col.panel("Multi Resolution");
    panel.prop(path + ".dynTopoDepth").setAttribute("labelOnTop", true);


    strip = panel.strip();
    strip.prop(path + ".enableMaxEditDepth");
    strip.prop(path + ".gridEditDepth");

    panel.tool("mesh.subdivide_grids()");

    //panel
    container.flushUpdate();
  }

  static buildHeader(header, addHeaderRow) {
    super.buildHeader(header, addHeaderRow);

    let name = this.toolModeDefine().name;

    let strip = header.strip();
    strip.prop(`scene.tools.${name}.drawBVH`);
    strip.prop(`scene.tools.${name}.drawFlat`);
    strip.prop(`scene.tools.${name}.drawWireframe`);
    strip.prop(`scene.tools.${name}.drawNodeIds`);

    let row = addHeaderRow();
    let path = `scene.tools.${name}.brush`

    strip = row.strip();
    //strip.listenum(path + ".tool");
    strip.prop(`scene.tools.${name}.tool`);
    strip.tool("mesh.symmetrize()");

    strip = addHeaderRow().strip();
    strip.prop(`scene.tools.${name}.brushRadius`);
    strip.prop(path + ".strength");
    strip.prop(path + ".flag[SHARED_SIZE]", PackFlags.HIDE_CHECK_MARKS);

    header.flushUpdate();
  }

  get _brushSizeHelper() {
    let brush = this.getBrush();

    if (!brush) {
      return 55.0;
    }

    if (brush.flag & BrushFlags.SHARED_SIZE) {
      return this.sharedBrushRadius;
    } else {
      return brush.radius;
    }
  }

  set _brushSizeHelper(val) {
    let brush = this.getBrush();

    if (!brush) {
      return 55;
    }

    if (brush.flag & BrushFlags.SHARED_SIZE) {
      this.sharedBrushRadius = val;
    } else {
      brush.radius = val;
    }
  }

  get _apiBrushHelper() {
    return this.getBrush();
  }

  set _apiBrushHelper(brush) {
    if (brush === undefined) {
      return;
    }

    let oldbrush = this.getBrush();
    if (oldbrush === brush) {
      return;
    }

    let scene = this.ctx ? this.ctx.scene : undefined;
    this.slots[this.tool].setBrush(brush, scene);
  }

  static defineAPI(api) {
    let st = super.defineAPI(api);

    st.float("sharedBrushRadius", "sharedBrushRadius", "Shared Radius").noUnits().range(0, 450);
    st.float("_brushSizeHelper", "brushRadius", "Radius").noUnits().range(0, 450).step(1.0);

    st.bool("drawWireframe", "drawWireframe", "Draw Wireframe");
    st.bool("drawBVH", "drawBVH", "Draw BVH");
    st.bool("drawNodeIds", "drawNodeIds", "Draw BVH Vertex IDs");
    st.bool("drawFlat", "drawFlat", "Draw Flat");
    st.enum("tool", "tool", SculptTools).icons(SculptIcons);
    st.float("dynTopoLength", "dynTopoLength", "Detail Size").range(1.0, 75.0).noUnits();
    st.int("dynTopoDepth", "dynTopoDepth", "DynTopo Depth", "Maximum quad tree grid subdivision level").range(0, 15).noUnits();
    st.bool("enableMaxEditDepth", "enableMaxEditDepth", "Multi Resolution Editing");
    st.int("gridEditDepth", "gridEditDepth", "Edit Depth", "Maximum quad tree grid edit level").range(0, 15).noUnits();

    st.struct("_apiBrushHelper", "brush", "Brush", api.mapStruct(SculptBrush));

    return st;
  }

  getBVH(mesh, useGrids = true) {
    return mesh.bvh ? mesh.bvh : mesh.getBVH(false);
  }

  on_mousemove(e, x, y, was_touch) {
    let ret = super.on_mousemove(e, x, y, was_touch);

    this.mpos[0] = e.x;
    this.mpos[1] = e.y;

    if (this.ctx && this.ctx.view3d) {
      this.drawBrush(this.ctx.view3d)
    }

    return ret;
  }

  on_mousedown(e, x, y) {
    super.on_mousedown(e, x, y);

    this.mpos[0] = e.x;
    this.mpos[1] = e.y;

    if (e.button === 0 && !e.altKey) {
      let brush = this.getBrush();

      let isColor = brush.tool === SculptTools.PAINT || brush.tool === SculptTools.PAINT_SMOOTH;
      let smoothtool = isColor ? SculptTools.PAINT_SMOOTH : SculptTools.SMOOTH;

      let dynmask = 0;

      if (e.shiftKey) {
        brush = this.getBrush(smoothtool);
      }

      if (brush.dynamics.radius.useDynamics) {
        dynmask |= DynamicsMask.RADIUS;
      }
      if (brush.dynamics.strength.useDynamics) {
        dynmask |= DynamicsMask.STRENGTH;
      }
      if (brush.dynamics.autosmooth.useDynamics) {
        dynmask |= DynamicsMask.AUTOSMOOTH;
      }

      console.log("dynmask", dynmask);

      let radius = brush.flag & BrushFlags.SHARED_SIZE ? this.sharedBrushRadius : brush.radius;

      this.ctx.api.execTool(this.ctx, "bvh.paint()", {
        strength: brush.strength,
        tool: e.shiftKey ? smoothtool : brush.tool,
        radius: radius,
        autosmooth: brush.autosmooth,
        planeoff: brush.planeoff,
        spacing: brush.spacing,
        color: e.ctrlKey ? brush.bgcolor : brush.color,

        dynamicsMask: dynmask,
        radiusCurve: brush.radius.curve,
        strengthCurve: brush.strength.curve,
        autosmoothCurve: brush.autosmooth.curve,
        falloff: brush.falloff,

        dynTopoLength : this.dynTopoLength,
        dynTopoDepth : this.dynTopoDepth,
        useDynTopo: brush.flag & BrushFlags.DYNTOPO,
        useMultiResDepth : this.enableMaxEditDepth
      });
      return true;
    }

    window.redraw_viewport();

    return false;
  }

  on_mouseup(e, x, y) {
    super.on_mouseup(e, x, y);

    this.mdown = false;

    return false;
  }

  getMeshMresSettings(mesh) {
    let cd_grid = GridBase.meshGridOffset(mesh);

    if (cd_grid >= 0) {
      return mesh.loops.customData.flatlist[cd_grid].getTypeSettings();
    }

    return undefined;
  }

  updateMeshMres(mesh) {
    let cd_grid = GridBase.meshGridOffset(mesh);

    if (cd_grid < 0) {
      return;
    }

    let mres = this.getMeshMresSettings(mesh);
    let flag = mres.flag;

    if (this.enableMaxEditDepth) {
      flag |= GridSettingFlags.ENABLE_DEPTH_LIMIT;
    } else {
      flag &= ~GridSettingFlags.ENABLE_DEPTH_LIMIT;
    }

    let update = flag !== mres.flag || this.gridEditDepth !== mres.depthLimit;

    mres.depthLimit = this.gridEditDepth;
    mres.flag = flag;

    if (update) {
      console.log("MRES SETTINGS UPDATE");

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

  update() {
    super.update();

    if (!this.ctx || !this.ctx.object || !(this.ctx.object.data instanceof Mesh)) {
      return;
    }

    let key = "" + this.enableMaxEditDepth;
    if (this.enableMaxEditDepth) {
      key += ":" + this.gridEditDepth;
    }

    key += ":" + this.ctx.object.data.lib_id;

    if (key !== this._last_enable_mres) {
      this._last_enable_mres = key;
      console.log(key);

      this.updateMeshMres(this.ctx.object.data);
    }
  }

  destroy() {
  }

  onInactive() {
    if (!this.ctx || !this.ctx.object) {
      return;
    }
    let ctx = this.ctx;

    super.onInactive();

    let ob = ctx.object;
    if (ob.data instanceof Mesh && ob.data.bvh) {
      ob.data.bvh.destroy(ob.data);
      ob.data.bvh = undefined;
    }
  }

  on_drawend(view3d, gl) {
    if (!this.ctx || !this.ctx.scene) {
      return;
    }

    this.drawBrush(view3d);

    let ctx = this.ctx, scene = ctx.scene;

    let uniforms = {
      projectionMatrix: view3d.activeCamera.rendermat,
      objectMatrix: new Matrix4(),
      object_id: -1,
      size: view3d.glSize,
      near: view3d.activeCamera.near,
      far: view3d.activeCamera.far,
      aspect: view3d.activeCamera.aspect,
      polygonOffset: 0.0,
      color: [1, 0, 0, 1],
      alpha: 1.0
    };

    let program = Shaders.WidgetMeshShader;

    let drawNodeAABB = (node, matrix) => {
      if (!node.leaf) {
        for (let c of node.children) {
          drawNodeAABB(c, matrix);
        }

        return;
      }

      matrix = new Matrix4(matrix);
      uniforms.objectMatrix = matrix;

      let size = new Vector3(node.max).sub(node.min);

      let smat = new Matrix4();
      smat.scale(size[0], size[1], size[2]);

      let tmat = new Matrix4();
      tmat.translate(node.min[0] + size[0] * 0.5, node.min[1] + size[1] * 0.5, node.min[2] + size[2] * 0.5);

      matrix.multiply(tmat);
      matrix.multiply(smat);

      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);

      uniforms.objectMatrix.load(matrix);

      let f = node.id * 0.1;
      uniforms.color[0] = Math.fract(f * Math.sqrt(3.0));
      uniforms.color[1] = Math.fract(f * Math.sqrt(5.0) + 0.234);
      uniforms.color[2] = Math.fract(f * Math.sqrt(2.0) + 0.8234);
      uniforms.color[3] = 1.0;
      //console.log(uniforms);

      //ob.data.draw(view3d, gl, uniforms, program, ob);
      Shapes.CUBE.drawLines(gl, uniforms, program);

      //console.log(matrix.toString());
    }

    for (let ob of scene.objects.selected.editable) {
      if (!(ob.data instanceof Mesh)) {
        continue;
      }

      let matrix = new Matrix4(ob.outputs.matrix.getValue());

      uniforms.object_id = ob.lib_id;

      let mesh = ob.data;
      let bvh = this.getBVH(mesh);

      //console.log("BVH", bvh.nodes.length);
      if (this.drawBVH) {
        drawNodeAABB(bvh.root, matrix);
      }
      //console.log("BVH", bvh, Shapes.CUBE);
    }
  }

  /*
  * called for all objects;  returns true
  * if an object if the toolmode drew the object
  * itself
  */
  drawObject(gl, uniforms, program, object, mesh) {
    //return true;
    if (!(this.ctx && this.ctx.object && mesh === this.ctx.object.data)) {
      return false;
    }

    let symflag = mesh.symFlag;
    let axes = [-1];
    for (let i = 0; i < 3; i++) {
      if (symflag & (1 << i)) {
        axes.push(i);
      }
    }

    let drawFlat = this.drawFlat;

    let drawNode = (node, matrix) => {
      if (!node.leaf) {
        for (let c of node.children) {
          drawNode(c, matrix);
        }

        return;
      }

      matrix = new Matrix4(matrix);
      uniforms.objectMatrix = matrix;

      let size = new Vector3(node.max).sub(node.min);

      let smat = new Matrix4();
      smat.scale(size[0], size[1], size[2]);

      let tmat = new Matrix4();
      tmat.translate(node.min[0] + size[0] * 0.5, node.min[1] + size[1] * 0.5, node.min[2] + size[2] * 0.5);

      matrix.multiply(tmat);
      matrix.multiply(smat);

      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);

      uniforms.objectMatrix.load(matrix);
    }

    let ob = object;//let ob = this.ctx.object;
    let bvh = mesh.getBVH(false);

    //*
    for (let node of new Set(bvh.nodes)) {
      if (!node || node.id < 0) {
        continue;
      }

      bvh.checkJoin(node);
    }
    //bvh.update();
     //*/

    let parentoff = bvh.drawLevelOffset;

    let fullDraw = false;

    let grid_off = GridBase.meshGridOffset(mesh);
    let have_grids = grid_off >= 0;
    let white = [1, 1, 1, 1];
    let red = [1, 0, 0, 1];

    let cd_color = -1;
    let have_color;

    let drawkey = "";

    if (have_grids) {
      GridBase.syncVertexLayers(mesh);
      cd_color = mesh.loops.customData.getLayerIndex("color");
      have_color = cd_color >= 0;
    } else {
      cd_color = mesh.verts.customData.getLayerIndex("color");
      have_color = cd_color >= 0;
    }

    drawkey += ":" + cd_color + ":" + object.lib_id + ":" + mesh.lib_id;

    if (drawkey !== this._last_draw_key) {
      console.log("Full draw:", drawkey);

      this._last_draw_key = drawkey;
      fullDraw = true;
    }

    for (let node of bvh.nodes) {
      node.flag &= ~BVHFlags.TEMP_TAG;

      if (fullDraw && node.leaf) {
        node.flag |= BVHFlags.UPDATE_DRAW;
      }
    }

    let drawnodes = new Set();

    for (let node of bvh.nodes) {
      if (!node.leaf) {
        continue;
      }

      let p = node;
      //get parent parentoff levels up

      for (let i = 0; i < parentoff; i++) {
        if (p.flag & BVHFlags.TEMP_TAG) {
          break;
        }

        p = p.parent ? p.parent : p;
        /*
        let p2 = p.parent ? p.parent : p;

        let d;
        let bad = false;

        for (let c of p2.children) {
          if (d === undefined) {
            d = c.subtreeDepth;
          } else {
            bad = bad || c.subtreeDepth !== d;
          }
        }

        if (!bad) {
          p = p2;
        } else {
          break;
        }
        */
      }

      p.flag |= BVHFlags.TEMP_TAG;

      drawnodes.add(p);

      if (node.flag & BVHFlags.UPDATE_DRAW) {
        p.flag |= BVHFlags.UPDATE_DRAW;
      }
    }

    for (let node of new Set(drawnodes)) {
      let p2 = node.parent;
      while (p2) {
        if (p2.flag & BVHFlags.TEMP_TAG) {
          node.flag &= ~BVHFlags.TEMP_TAG;
          p2.flag |= node.flag & BVHFlags.UPDATE_DRAW;
          break;
        }
        p2 = p2.parent;
      }
    }

    let t1 = new Vector3();
    let t2 = new Vector3();
    let t3 = new Vector3();

    let drawBVH = this.drawBVH;
    let drawNodeIds = this.drawNodeIds;
    let puv3 = [0, 0];
    let puv2 = [0, 1];
    let puv1 = [1, 0];

    let drawWireframe = this.drawWireframe;

    let tstart = util.time_ms();

    function genNodeMesh(node) {
      if (util.time_ms() - tstart > 15) {
        //return;
      }

      if (node.drawData) {
        node.drawData.reset(gl);
      }

      let lflag = LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV | LayerTypes.NORMAL | LayerTypes.ID;

      lflag |= LayerTypes.CUSTOM;

      let sm = node.drawData || new SimpleMesh(lflag);

      //primflag, type, size=TypeSizes[type], name=LayerTypeNames[type]) {

      //let primc1 = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc1");
      //let primc2 = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc2");
      //let primc3 = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc3");

      let primuv = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 2, "primUV");


      let cfrets = util.cachering.fromConstructor(Vector4, 16);
      let colorfilter;

      if (have_grids) {
        colorfilter = function (v, fac = 0.5) {
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
      } else {
        colorfilter = function (v, fac = 0.5) {
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
      }

      let tc1 = new Vector4();
      let tc2 = new Vector4();
      let tc3 = new Vector4();
      tc1[3] = tc2[3] = tc3[3] = 1.0;
      let cd_node = have_grids ? mesh.loops.customData.getLayerIndex("bvh") : mesh.verts.customData.getLayerIndex("bvh");

      function rec(node) {
        if (!node.leaf) {
          for (let c of node.children) {
            rec(c);
          }

          return;
        }

        let n = new Vector3();
        let id = object.lib_id;


        for (let tri of node.uniqueTris) {
          /*
          t1.load(tri.v1);
          t2.load(tri.v2);
          t3.load(tri.v3);


          for (let i=0; i<3; i++) {
            t1[i] += (Math.random()-0.5)*0.05;
            t2[i] += (Math.random()-0.5)*0.05;
            t3[i] += (Math.random()-0.5)*0.05;

          }//*/

          //*
          t1 = tri.v1;
          t2 = tri.v2;
          t3 = tri.v3;
          //*/

          //*
          if (drawWireframe) {
            sm.line(t1, t2);
            sm.line(t2, t3);
            sm.line(t3, t1);
          }
          //*/

          let tri2 = sm.tri(t1, t2, t3);

          //n.load(tri.v1.no).add(tri.v2.no).add(tri.v3.no).normalize();

          if (!drawFlat) {
            tri2.normals(tri.v1.no, tri.v2.no, tri.v3.no);
          } else {
            //n.load(tri.no);
            //n.load(tri.v1.no).add(tri.v2.no).add(tri.v3.no).normalize();
            n.load(math.normal_tri(tri.v1, tri.v2, tri.v3));
            tri2.normals(n, n, n);
          }

          tri2.custom(primuv, puv1, puv2, puv3);

          tri2.ids(id, id, id);

          if (drawNodeIds && cd_node >= 0) {
            let node1 = tri.v1.customData[cd_node].node;
            let node2 = tri.v2.customData[cd_node].node;
            let node3 = tri.v3.customData[cd_node].node;

            let id1 = node1 ? node1._id : 0;
            let id2 = node2 ? node2._id : 0;
            let id3 = node3 ? node3._id : 0;

            tc1[0] = Math.fract(id1*3.234344);
            tc2[0] = Math.fract(id2*3.234344);
            tc3[0] = Math.fract(id3*3.234344);

            tc1[1] = tc2[1] = tc3[1] = 0.5;

            tri2.colors(tc1, tc2, tc3);
          } else if (have_color) {
            //*
            let c1 = tri.v1.customData[cd_color].color;
            let c2 = tri.v2.customData[cd_color].color;
            let c3 = tri.v3.customData[cd_color].color;
            //*/

            if (!c1 || !c2 || !c3) {
              let v = !c1 ? tri.v1 : undefined;

              v = !v && !c2 ? tri.v2 : v;
              v = !v && !c3 ? tri.v3 : v;

              let l = v.loopEid;
              l = mesh.eidmap[l];
              if (l && l.eid === v.loopEid) {
                l.customData[bvh.cd_grid].checkCustomDataLayout(mesh);

                console.log(l, l.customData[bvh.cd_grid]);
              }
              console.error("customdata error", c1, c2, c3, tri);
              tri2.colors(red, red, red);
              continue;
            }
            /*
            let c1 = colorfilter(tri.v1);
            let c2 = colorfilter(tri.v2);
            let c3 = colorfilter(tri.v3);
            //*/

            //tri2.custom(primc1, c1, c1, c1);
            //tri2.custom(primc2, c2, c2, c2);
            //tri2.custom(primc3, c3, c3, c3);

            tri2.colors(c1, c2, c3);
          } else {
            tri2.colors(white, white, white);
          }
        }
      }

      //console.log("updating draw data for bvh node", node.id);

      rec(node);
      sm.gen = 0;
      node.drawData = sm;
    }

    let axismat = new Matrix4();

    for (let node of bvh.nodes) {
      if (node.drawData && !(node.flag & BVHFlags.TEMP_TAG)) {
        node.drawData.destroy(gl);
        node.drawData = undefined;
        continue;
      }

      if (node.flag & BVHFlags.TEMP_TAG) {
        let update = node.flag & BVHFlags.UPDATE_DRAW;
        update = update || !node.drawData;

        if (update) {
          genNodeMesh(node);
        }

        if (!node.drawData) {
          continue;
        }

        let f = node.id * 0.1 * Math.sqrt(3.0);
        f = Math.fract(f * 10.0);

        let program2 = Shaders.SculptShader;

        if (!drawBVH) {
          uniforms.uColor = [1, 1, 1, 1];
        } else {
          uniforms.uColor = [f, Math.fract(f * 3.23423 + 0.432), Math.fract(f * 5.234 + .13432), 1.0];
        }
        uniforms.alpha = 1.0;

        if (node.drawData.gen === 0) {
          //  uniforms.uColor = [f, f, f, 1.0];
        }

        for (let axis of axes) {
          let oldmat = uniforms.objectMatrix;

          if (axis !== -1) {
            let scale = [1, 1, 1];
            scale[axis] = -1;

            //let imat = new Matrix4(object.outputs.matrix.getValue());
            //let mat2 = new Matrix4(uniforms.objectMatrix);

            //imat.invert();
            //mat2.multiply(imat);

            let mat2 = new Matrix4();
            mat2.scale(scale[0], scale[1], scale[2]);

            mat2.preMultiply(object.outputs.matrix.getValue());

            uniforms.objectMatrix = mat2;

          }

          if (drawWireframe) {
            uniforms.polygonOffset = window.d || 10.0;
            node.drawData.drawLines(gl, uniforms, program2);
            uniforms.polygonOffset = 0.0;
          }

          node.drawData.primflag &= ~PrimitiveTypes.LINES;
          node.drawData.draw(gl, uniforms, program2);

          if (drawWireframe) {
           // uniforms.polygonOffset = window.d || 10.0;
            //node.drawData.drawLines(gl, uniforms, program2);
            //uniforms.polygonOffset = 0.0;
          }

          uniforms.objectMatrix = oldmat;
        }

        if (0) {
          uniforms.alpha = 0.5;

          gl.depthMask(false);
          gl.disable(gl.DEPTH_TEST);
          gl.enable(gl.CULL_FACE);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

          node.drawData.draw(gl, uniforms, program2);

          gl.depthMask(true);
          gl.disable(gl.CULL_FACE);
          gl.disable(gl.BLEND);
          gl.enable(gl.DEPTH_TEST);
        }


        gl.disable(gl.CULL_FACE);
        node.drawData.gen++;
      }

      node.flag &= ~(BVHFlags.TEMP_TAG | BVHFlags.UPDATE_DRAW);
    }
    return true;
  }

  dataLink(scene, getblock, getblock_addUser) {
    for (let k in this.slots) {
      this.slots[k].dataLink(scene, getblock, getblock_addUser);
    }

    for (let k in SculptTools) {
      let tool = SculptTools[k];

      if (!(tool in this.slots)) {
        this.slots[tool] = new PaintToolSlot(tool);
      }
    }
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    //deal with old files
    if (Array.isArray(this.slots)) {
      let slots = this.slots;
      this.slots = {};

      for (let slot of slots) {
        this.slots[slot.tool] = slot;
      }
    }

    //also happens in old files
    if (this.brush) {
      this.tool = this.brush.tool;
      delete this.brush;
    }
  }
}

BVHToolMode.STRUCT = STRUCT.inherit(BVHToolMode, ToolMode) + `
  drawBVH                : bool;
  drawFlat               : bool;
  drawWireframe          : bool;
  drawNodeIds            : bool;
  dynTopoLength          : float;
  dynTopoDepth           : int;
  gridEditDepth          : int;
  enableMaxEditDepth     : bool;
  tool                   : int;
  slots                  : iterkeys(PaintToolSlot);
  sharedBrushRadius      : float; 
}`;
nstructjs.manager.add_class(BVHToolMode);

ToolMode.register(BVHToolMode);

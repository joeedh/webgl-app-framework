import {WidgetFlags} from "../widgets/widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {BVH, BVHFlags} from "../../../util/bvh.js";
import {KeyMap} from "../../editor_base.js";
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
  EnumProperty,
  FlagProperty,
  ListProperty,
  Curve1D, Curve1DProperty
} from "../../../path.ux/scripts/pathux.js";
import {MeshFlags} from "../../../mesh/mesh.js";
import {SimpleMesh, LayerTypes, PrimitiveTypes} from "../../../core/simplemesh.js";
import {splitEdgesSmart} from "../../../mesh/mesh_subdivide.js";
import {GridBase} from "../../../mesh/mesh_grids.js";

let _triverts = new Array(3);

import {
  DynamicsMask, SculptTools, BrushDynamics, SculptBrush,
  BrushDynChannel, DefaultBrushes, SculptIcons, PaintToolSlot
} from "../../../brush/brush.js";

export function dynTopoExec(verts, esize) {
  let edges = new Set();

  for (let v of verts) {
    for (let e of v.edges) {
      edges.add(e);
    }
  }
}

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


        dynamicsMask: new FlagProperty(0, DynamicsMask),
        strengthCurve: new Curve1DProperty(),
        radiusCurve: new Curve1DProperty(),
        autosmoothCurve: new Curve1DProperty()
      }
    }
  }

  undoPre(ctx) {
    let mesh;
    if (ctx.object && ctx.object.data instanceof Mesh) {
      mesh = ctx.object.data;
    }

    this._undo = {mesh: mesh ? mesh.lib_id : -1, vmap: new Map(), gdata: [], gset: new Set()};
  }

  undo(ctx) {
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

    let view3d = ctx.view3d;

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

    console.log("pressure", pressure, strength, dynmask);

    let view = view3d.getViewVec(x, y);
    let origin = view3d.activeCamera.pos;

    let ob = ctx.object;
    let mesh = ob.data;

    let bvh = mesh.getBVH(false);

    let isect = bvh.castRay(origin, view);

    if (!isect) {
      return;
    }

    let p3 = new Vector4(isect.p);
    p3[3] = 1.0;

    let matrix = new Matrix4(ob.outputs.matrix.getValue());
    p3.multVecMatrix(view3d.activeCamera.rendermat);


    let w = p3[3] * matrix.$matrix.m11;
    if (w <= 0) return;

    radius /= Math.max(view3d.glSize[0], view3d.glSize[1]);
    radius *= w;

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

    console.log("STEPS", steps, radius, spacing, this._first);

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

      p3.load(p2).multVecMatrix(view3d.activeCamera.rendermat);
      let w = p3[3] * matrix.$matrix.m11;

      let vec2 = new Vector3(this.last_vec).interp(vec, s);

      //view3d.makeDrawLine(isect.p, p2, [1, 0, 0, 1]);

      //console.log(isect, isect.tri);

      //vec.load(view);

      if (mode === SHARP) {
        vec2.negate();
      }

      if (e.ctrlKey) {
        vec2.negate();
        if (mode === SculptTools.INFLATE) {
          strength *= -1;
        }
      }

      let esize = 8.0;

      esize /= Math.max(view3d.glSize[0], view3d.glSize[1]);

      esize *= matrix.$matrix.m11;
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
    let gdata = undo.gdata;

    let ob = ctx.object;
    let mesh = ob.data;

    let bvh = mesh.getBVH(false);

    let mode = this.inputs.tool.getValue();
    let radius = p3[3];
    let strength = extra[0];

    let planeoff = vec[3];
    let isplane = false;

    let esize = 8.0;

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

    }

    vec = new Vector3(vec);
    if (mode !== SNAKE) {
      vec.mulScalar(strength * 0.1 * radius);
    }

    let vlen = vec.vectorLength();
    let nvec = new Vector3(vec).normalize();
    let planep = new Vector3(p3);

    planep.addFac(vec, planeoff);

    //console.log(w);

    //console.log("radius", radius);

    p3 = new Vector3(p3);
    let vs = bvh.closestVerts(p3, radius);

    //console.log(vs, p3);

    let vsw;
    let _tmp = new Vector3();

    let haveGrids = bvh.cd_grid >= 0;
    let vsmooth, gdimen;

    function doGridBoundary(v) {
      v.interp(v.bLink, 0.5);
      v.bLink.load(v, true);

      let node = v.bLink.customData[cd_node].node;

      if (node) {
        bvh.updateNodes.add(node);
        node.flag |= BVHFlags.UPDATE_NORMALS | BVHFlags.UPDATE_DRAW;
      }
    }

    let colorfilter;

    if (haveGrids) {
      colorfilter = colorfilterfuncs[1];

      for (let l of mesh.loops) {
        let grid = l.customData[bvh.cd_grid];
        gdimen = grid.dimen;
        break;
      }

      vsmooth = (v, fac) => {
        _tmp.load(v);
        let w = 1.0;

        for (let v2 of v.neighbors) {
          _tmp.add(v2);
          w++;
        }

        _tmp.mulScalar(1.0 / w);
        v.interp(_tmp, vsw * fac);
      }
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

    let isPaintMode = mode === PAINT || mode === PAINT_SMOOTH;

    let cd_node = bvh.cd_node;
    let ws = new Array(vs.size);

    let cd_color, have_color;

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
        vsw = strength + extra[1];
        break;
      default:
        vsw = extra[1]; //autosmooth
        break;
    }

    //vsw += extra[1];

    wi = 0;
    for (let v of vs) {
      if (!haveGrids && !vmap.has(v.eid)) {
        vmap.set(v.eid, new Vector3(v));
      } else if (haveGrids) {
        let id = v.loopEid * gdimen * gdimen + v.index;
        if (!gset.has(id)) {
          gset.add(id);
          gdata.push(v.loopEid);
          gdata.push(v.index);
          gdata.push(v[0]);
          gdata.push(v[1]);
          gdata.push(v[2]);
          gdata.push(v.no[0]);
          gdata.push(v.no[1]);
          gdata.push(v.no[2]);
        }
      }

      let f = Math.max(1.0 - v.vectorDistance(p3) / radius, 0.0);
      let f2 = f;

      if (mode === SHARP) {
        f *= f;
        //f2 = Math.pow(f2, 0.5);
      } else if (mode === FILL) {
        //f = f * f * (3.0 - 2.0 * f);
        f = Math.sqrt(f);
      } else if (mode === SCRAPE) {
        f = Math.pow(f, 0.2);
        f = 1.0;
      } else if (mode === CLAY) {
        f = Math.sqrt(f);
      } else if (mode === SMOOTH) {
        //f = f*f*(3.0-2.0*f);
        f *= f;
        f *= strength;
      } else {
        f = f * f * (3.0 - 2.0 * f);
      }

      /*
      f = 1.0 - f;
      f = 1.0 - Math.exp(-f*10.0);
      f = 1.0 - f;
      //*/

      //f=1.0

      if (mode === SHARP) {
        f *= 1.0;
        f2 *= 0.25;

        let d = 1.0 - Math.max(v.no.dot(nvec), 0.0);

        //d = 1.0 - d;
        //d *= d*d*d*d;
        d *= d;
        //d = 1.0 - d;

        v.addFac(v.no, vlen * d * f2);
        v.addFac(vec, f);//
      } else if (isplane) {
        let co = planetmp.load(v);
        co.sub(planep);

        let d = co.dot(nvec);
        v.addFac(vec, -d * f);
      } else if (mode === DRAW) {
        v.addFac(vec, f);//
      } else if (have_color && mode === PAINT) {
        let c = v.customData[cd_color];

        c.color.interp(color, f * strength);
      } else if (mode === INFLATE) {
        v.addFac(v.no, f * strength * 0.1);
      } else if (mode === SNAKE) {
        f = f * f * (3.0 - 2.0 * f);
        v.addFac(vec, f * strength);
      } else if (mode === PAINT_SMOOTH) {
        f = f * f * (3.0 - 2.0 * f);
      }

      if (haveGrids && v.bLink) {
        doGridBoundary(v);
      }

      ws[wi++] = f;

      v.flag |= MeshFlags.UPDATE;
    }

    console.log("strength", strength);

    //let es = new Set();
    wi = 0;

    for (let v of vs) {
      let node = v.customData[cd_node].node;

      if (node) {
        bvh.updateNodes.add(node);
        node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_NORMALS;
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

      if (haveGrids && v.bLink) {
        doGridBoundary(v);
      }

      v.flag |= MeshFlags.UPDATE;
    }

    //this.doTopology(mesh, bvh, esize, vs, es);

    if (!this.modalRunning) {
      mesh.regenTesellation();
    }

    //mesh.recalcNormals();
    mesh.regenRender();

    bvh.update();
  }

  doTopology(mesh, bvh, esize, vs, es) {
    let es2 = new Set();

    let esqr = esize * esize;
    let fs = new Set();
    let fmap = new Map();

    let cd_face_node = bvh.cd_face_node;

    let max = 128;

    for (let e of es) {
      if (es2.size > max) {
        break;
      }

      if (!e.l) {
        continue;
      }

      if (e.v1.vectorDistanceSqr(e.v2) >= esqr) {
        let l = e.l;
        let _i = 0;

        do {
          fs.add(l.f);
          l = l.radial_next;
        } while (l !== e.l && _i++ < 100);

        es2.add(e);
      }
    }

    for (let f of fs) {
      let tris = bvh.fmap.get(f.eid);
      if (tris && tris.length > 0) {
        let node = tris[0].node;
        f.customData[cd_face_node].node = node;
        fmap.set(f, node);
      }

      bvh.removeFace(f.eid);
    }

    let {newvs, newfs} = splitEdgesSmart(mesh, es2);
    //let newvs = new Set(), newfs = fs;

    //console.log(newfs, newfs.size);

    if (newvs.size > 0 || newfs.size > 0) {
      mesh.regenTesellation();
      for (let i = 0; i < 2; i++) {
        let fsiter = i ? newfs : fs;

        for (let f of fsiter) {
          let l = f.lists[0].l;
          let firstl = l;
          let _i = 0;

          l = l.next;

          do {
            let v1 = firstl.v;
            let v2 = l.v;
            let v3 = l.next.v;

            let node;

            //bvh.addTri(f.eid, bvh._nextTriIdx(), v1, v2, v3);
            if (i === 0) {
              node = fmap.get(f);
            } else {
              node = f.customData[cd_face_node].node;
            }

            if (node) {
              if (!node.leaf) {
                //node.addTri(f.eid, bvh._nextTriIdx(), v1, v2, v3);
              } else {
                let tri = node.bvh._getTri(f.eid, bvh._nextTriIdx(), v1, v2, v3);

                node.uniqueTris.add(tri);
                node.allTris.add(tri);

                bvh.updateNodes.add(node);
                node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_UNIQUE_VERTS | BVHFlags.UPDATE_NORMALS;
              }
            } else {
              //bvh.addTri(f.eid, bvh._nextTriIdx(), v1, v2, v3);
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

export class BVHToolMode extends ToolMode {
  constructor(manager) {
    super(manager);

    this.flag |= WidgetFlags.ALL_EVENTS;

    this.tool = SculptTools.CLAY;
    //this.brush = new SculptBrush();
    this.slots = {};

    for (let k in SculptTools) {
      let tool = SculptTools[k];
      this.slots[tool] = new PaintToolSlot(tool);
    }

    this.drawBVH = false;

    this._last_bvh_key = "";
    this.view3d = manager !== undefined ? manager.view3d : undefined;
  }

  getBrush(tool=this.tool) {
    if (!this.ctx) {
      return undefined;
    }

    return this.slots[tool].resolveBrush(this.ctx);
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

  }

  static buildHeader(header, addHeaderRow) {
    super.buildHeader(header, addHeaderRow);

    let name = this.toolModeDefine().name;

    let strip = header.strip();
    strip.prop(`scene.tools.${name}.drawBVH`);

    let row = addHeaderRow();
    let path = `scene.tools.${name}.brush`
    let panel;

    function doChannel(name) {
      strip = addHeaderRow().strip();
      strip.prop(path + `.${name}`);
      strip.prop(path + `.dynamics.${name}.useDynamics`);
      panel = strip.panel();
      panel.prop(path + `.dynamics.${name}.curve`);
      panel.closed = true;
    }

    strip = row.strip();
    //strip.listenum(path + ".tool");
    strip.prop(`scene.tools.${name}.tool`);

    doChannel("radius");
    doChannel("strength");
    doChannel("autosmooth");

    strip = addHeaderRow().strip();
    strip.prop(path + ".planeoff");
    strip.prop(path + ".spacing");

    strip.tool("mesh.reset_grids()");
    strip.tool("mesh.delete_grids()");

    strip = addHeaderRow().strip();
    strip.prop(path + ".color");
    strip.prop(path + ".bgcolor");

    header.flushUpdate();
  }

  get _apiBrushHelper() {
    return this.getBrush();
  }

  static defineAPI(api) {
    let st = super.defineAPI(api);

    st.bool("drawBVH", "drawBVH", "drawBVH");
    st.enum("tool", "tool", SculptTools).icons(SculptIcons);

    let bst = st.struct("_apiBrushHelper", "brush", "Brush");

    bst.float("strength", "strength", "Strength").range(0.001, 2.0).noUnits();
    bst.float("radius", "radius", "Radius").range(0.1, 150.0).noUnits();
    bst.enum("tool", "tool", SculptTools).icons(SculptIcons);
    bst.float("autosmooth", "autosmooth", "Autosmooth").range(0.0, 2.0).noUnits();
    bst.float("planeoff", "planeoff", "planeoff").range(-1.0, 1.0).noUnits();
    bst.float("spacing", "spacing", "Spacing").range(0.01, 2.0).noUnits();
    bst.color4("color", "color", "Primary Color");
    bst.color4("bgcolor", "bgcolor", "Secondary Color");

    let dst;

    if (!api.hasStruct(BrushDynamics)) {
      let cst = api.mapStruct(BrushDynChannel, true);
      cst.bool("useDynamics", "useDynamics", "Use Dynamics");
      cst.curve1d("curve", "curve", "Curve");

      dst = api.mapStruct(BrushDynamics, true);
      let b = new BrushDynamics();
      for (let ch of b.channels) {
        dst.struct(ch.name, ch.name, ch.name, cst);
      }
    } else {
      dst = api.mapStruct(BrushDynamics);
    }

    bst.struct("dynamics", "dynamics", "Dynamics", dst);

    return st;
  }

  getBVH(mesh, useGrids = true) {
    return mesh.bvh ? mesh.bvh : mesh.getBVH(false);
  }

  on_mousedown(e, x, y) {
    super.on_mousedown(e, x, y);

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

      this.ctx.api.execTool(this.ctx, "bvh.paint()", {
        strength: brush.strength,
        tool: e.shiftKey ? smoothtool : brush.tool,
        radius: brush.radius,
        autosmooth: brush.autosmooth,
        planeoff: brush.planeoff,
        spacing: brush.spacing,
        color: e.ctrlKey ? brush.bgcolor : brush.color,

        dynamicsMask: dynmask,
        radiusCurve: brush.radius.curve,
        strengthCurve: brush.strength.curve,
        autosmoothCurve: brush.autosmooth.curve
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

  update() {
    super.update();
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
    if (!(this.ctx && this.ctx.object && mesh === this.ctx.object.data)) {
      return false;
    }

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

    let parentoff = bvh.drawLevelOffset;

    let fullDraw = false;

    let grid_off = GridBase.meshGridOffset(mesh);
    let have_grids = grid_off >= 0;
    let white = [1, 1, 1, 1];
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
    let puv3 = [0, 0];
    let puv2 = [0, 1];
    let puv1 = [1, 0];

    function genNodeMesh(node) {
      let lflag = LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV | LayerTypes.NORMAL | LayerTypes.ID;

      lflag |= LayerTypes.CUSTOM;

      let sm = new SimpleMesh(lflag);
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
            t1[i] += (Math.random()-0.5)*0.01;
            t2[i] += (Math.random()-0.5)*0.01;
            t3[i] += (Math.random()-0.5)*0.01;

          }*/

          //*
          t1 = tri.v1;
          t2 = tri.v2;
          t3 = tri.v3;
          //*/

          let tri2 = sm.tri(t1, t2, t3);

          //n.load(tri.v1.no).add(tri.v2.no).add(tri.v3.no).normalize();
          n.load(tri.no);

          if (have_color) {
            tri2.normals(tri.v1.no, tri.v2.no, tri.v3.no);
          } else {
            tri2.normals(n, n, n);
          }

          tri2.custom(primuv, puv1, puv2, puv3);

          tri2.ids(id, id, id);

          if (have_color) {
            //*
            let c1 = tri.v1.customData[cd_color].color;
            let c2 = tri.v2.customData[cd_color].color;
            let c3 = tri.v3.customData[cd_color].color;
            //*/

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

      if (node.drawData) {
        node.drawData.destroy(gl);
      }

      //console.log("updating draw data for bvh node", node.id);

      rec(node);
      sm.gen = 0;
      node.drawData = sm;
    }

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
        node.drawData.draw(gl, uniforms, program2);

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
  drawBVH : bool;
  tool    : int;
  slots   : iterkeys(PaintToolSlot); 
}`;
nstructjs.manager.add_class(BVHToolMode);

ToolMode.register(BVHToolMode);

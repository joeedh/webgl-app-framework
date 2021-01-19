//grab data field definition
import {
  Curve1DProperty,
  FlagProperty, FloatProperty, Matrix4, ToolOp, ToolProperty, Vector2, Vector3, Vector4
} from '../../../path.ux/scripts/pathux.js';
import {BrushFlags, SculptBrush, SculptTools} from '../../../brush/brush.js';
import {ProceduralTex} from '../../../texture/proceduralTex.js';
import {DataRefProperty} from '../../../core/lib_api.js';
import {BVHToolMode} from './pbvh.js';
import {CDFlags} from '../../../mesh/customdata.js';
import {Mesh} from '../../../mesh/mesh.js';
import {GridBase} from '../../../mesh/mesh_grids.js';
import {BVHFlags} from '../../../util/bvh.js';
import {MeshFlags} from '../../../mesh/mesh.js';

export const SymAxisMap = [
  [],
  [[-1,1,1]], //x
  [[1,-1,1]], //y
  [[-1,1,1],[-1,-1,1],[1,-1,1]], //x + y

  [[1, 1, -1]], //z
  [[-1,1,1], [1,1,-1], [-1,1,-1]], //x+z
  [[1,-1,1], [1, 1, -1], [1, -1, -1]], //y+z

  [[-1, 1, 1], [1, -1, 1], [1, 1, -1], [-1, -1, 1], [-1, -1, -1], [-1, 1, -1], [1, -1, -1]] //x+y+z
];


export let BRUSH_PROP_TYPE;
export class BrushProperty extends ToolProperty {
  constructor(value) {
    super(BRUSH_PROP_TYPE);

    this.brush = new SculptBrush();
    this._texture = new ProceduralTex();

    if (value) {
      this.setValue(value);
    }
  }

  calcMemSize() {
    return this.brush.calcMemSize() + this._texture.calcMemSize();
  }

  setDynTopoSettings(dynTopo) {
    this.brush.dynTopo.load(dynTopo);
  }

  setValue(brush) {
    brush.copyTo(this.brush, true);

    if (this.brush.texUser.texture) {
      this.brush.texUser.texture.copyTo(this._texture, true);
      this.brush.texUser.texture = this._texture;
    }

    return this;
  }

  getValue() {
    return this.brush;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader)

    let texuser = this.brush.texUser;
    if (this.hasTex) { //texuser.texture !== undefined && texuser.texture !== -1) {
      delete this.hasTex;
      this.brush.texUser.texture = this._texture;
    } else {
      this.brush.texUser.texture = undefined;
    }
  }
}

BrushProperty.STRUCT = nstructjs.inherit(BrushProperty, ToolProperty) + `
  brush    : SculptBrush;
  _texture : ProceduralTex;
  hasTex   : bool | !!this.brush.texUser.texture;
}`;

nstructjs.register(BrushProperty);
BRUSH_PROP_TYPE = ToolProperty.register(BrushProperty);

export class PaintSample {
  constructor() {
    this.origp = new Vector4();
    this.p = new Vector4();
    this.dp = new Vector4();
    this.viewPlane = new Vector3();

    this.smoothProj = 0.0;

    this.pinch = 0.0;

    //screen coordinates
    this.sp = new Vector4();
    this.dsp = new Vector4();

    this.invert = false;

    this.w = 0.0;

    this.color = new Vector4();
    this.angle = 0;

    this.viewvec = new Vector3();
    this.vieworigin = new Vector3();

    this.vec = new Vector3();
    this.dvec = new Vector3();

    this.concaveFilter = 0.0;
    this.strength = 0.0;
    this.radius = 0.0;
    this.rake = 0.0;
    this.autosmooth = 0.0;
    this.esize = 0.0;
    this.planeoff = 0.0;
  }

  static getMemSize() {
    let tot = 13*8;
    tot += 5*3*8 + 8*5;
    tot += 5*4*8 + 8*5;

    return tot;
  }

  mirror(mul=new Vector4([1, 1, 1, 1])) {
    this.p.mul(mul);
    this.dp.mul(mul);
    this.origp.mul(mul);

    //this.sp.mulScalar(mul);
    this.dsp.mul(mul);
    this.viewvec.mul(mul);

    this.vec.mul(mul);
    this.dvec.mul(mul);

    this.angle *= mul[0]*mul[1]*mul[2];

    return this;
  }

  copyTo(b) {
    b.smoothProj = this.smoothProj;

    b.viewPlane.load(this.viewPlane);
    b.viewvec.load(this.viewvec);
    b.vieworigin.load(this.vieworigin);
    b.angle = this.angle;
    b.invert = this.invert;

    b.origp.load(this.origp);

    b.sp.load(this.sp);
    b.dsp.load(this.dsp);

    b.vec.load(this.vec);
    b.dvec.load(this.dvec);

    b.p.load(this.p);
    b.dp.load(this.dp);

    b.w = this.w;
    b.esize = this.esize;

    b.color.load(this.color);

    b.pinch = this.pinch;
    b.rake = this.rake;
    b.strength =  this.strength;
    b.radius = this.radius;
    b.autosmooth = this.autosmooth;
    b.planeoff = this.planeoff;
    b.concaveFilter = this.concaveFilter;
  }

  copy()  {
    let ret = new PaintSample();

    this.copyTo(ret);

    return ret;
  }
}
PaintSample.STRUCT = `
PaintSample {
  p              : vec4;
  dp             : vec4;
  sp             : vec4;
  dsp            : vec4;
  origp          : vec4;

  vec            : vec3;
  dvec           : vec3;

  color          : vec4;

  viewvec        : vec3;
  vieworigin     : vec3;
  viewPlane      : vec3;

  planeoff       : float;
  rake           : float;
  strength       : float;
  angle          : float;
  radius         : float;
  w              : float;
  pinch          : float;
  smoothProj     : float;
  autosmooth     : float;
  concaveFilter  : float;
  invert         : bool;
  esize          : float;
}`;
nstructjs.register(PaintSample);

export let PAINT_SAMPLE_TYPE;
export class PaintSampleProperty extends ToolProperty {
  constructor() {
    super(PAINT_SAMPLE_TYPE);
    this.data = [];
  }

  calcMemSize() {
    let tot = super.calcMemSize();

    tot += PaintSample.getMemSize()*this.data.length;

    return tot;
  }

  push(sample) {
    this.data.push(sample);
    return this;
  }

  getValue() {
    return this.data;
  }

  setValue(b) {
    super.setValue(b);

    this.data.length = 0;
    for (let item of b) {
      this.data.push(item);
    }

    return this;
  }

  copy() {
    let ret = new PaintSampleProperty();

    for (let item of this) {
      ret.push(item.copy());
    }

    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }

  [Symbol.iterator]() {
    return this.data[Symbol.iterator]();
  }
}
PaintSampleProperty.STRUCT = nstructjs.inherit(PaintSampleProperty, ToolProperty) + `
  data : array(PaintSample);
}`;

nstructjs.register(PaintSampleProperty);
PAINT_SAMPLE_TYPE = ToolProperty.register(PaintSampleProperty);

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

    let ctx = this.modal_ctx;

    let brush = ctx.datalib.get(this.inputs.brush.getValue());
    if (!brush) {
      return;
    }


    if (this.first) {
      this.first = false;
      this.cent_mpos.load(mpos).subScalar(brush.radius / devicePixelRatio / Math.sqrt(2.0));

      this.start_mpos.load(mpos);
      this.last_mpos.load(mpos);
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

let co = new Vector3();
let t1 = new Vector3();
let t2 = new Vector3();

export function calcConcave(v) {
  co.zero();
  let tot = 0.0;
  let elen = 0;

  for (let v2 of v.neighbors) {
    co.add(v2);
    elen += v2.vectorDistance(v);

    tot++;
  }

  if (tot === 0.0) {
    return 0.5;
  }

  elen /= tot;

  co.mulScalar(1.0 / tot);
  t1.load(v).sub(co).mulScalar(1.0 / elen);
  let fac = t1.dot(v.no)*0.5 + 0.5;

  return 1.0 - fac;
}

export function calcConcaveLayer(mesh) {
  let name = "_paint_concave";

  let cd_concave = mesh.verts.customData.getNamedLayerIndex(name, "float");
  if (cd_concave < 0) {
    let layer = mesh.verts.addCustomDataLayer("float", name);
    layer.flag |= CDFlags.TEMPORARY;

    cd_concave = layer.index;
  }



  for (let v of mesh.verts) {

  }
}

export class PaintOpBase extends ToolOp {
  constructor() {
    super();

    this.last_mpos = new Vector2();
    this.last_p = new Vector3();
    this.last_origco = new Vector4();
    this._first = true;
    this.last_radius = 0;
    this.last_vec = new Vector3();
  }

  static tooldef() {
    return {
      inputs : {
        brush: new BrushProperty(),
        samples: new PaintSampleProperty(),
        symmetryAxes: new FlagProperty(undefined, {X: 1, Y: 2, Z: 4}),
        falloff: new Curve1DProperty(),
      }
    }
  }

  static needOrig(mode) {
    let ret = mode === SculptTools.SHARP || mode === SculptTools.GRAB;
    ret = ret || mode === SculptTools.SNAKE; // || mode === SculptTools.SMOOTH;

    return ret;
  }

  on_mousemove(e) {
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

    //the pbvh toolmode is responsible for drawing brush circle,
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

    let ch;

    let getchannel = (key, val) => {
      let ch = brush.dynamics.getChannel(key);
      if (ch.useDynamics) {
        return val*ch.curve.evaluate(pressure);
      } else {
        return val;
      }
    }

    radius = getchannel("radius", radius);

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

    let haveOrigData = PaintOpBase.needOrig(brush.tool);
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

        isect = {p, dis};
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

    let vec = new Vector3(isect.tri.v1.no);
    vec.add(isect.tri.v2.no);
    vec.add(isect.tri.v3.no);
    vec.normalize();

    view.negate();
    if (vec.dot(view) < 0) {
      view.negate();
    }
    view.normalize();

    vec.interp(view, 1.0 - brush.normalfac).normalize();

    if (this._first) {
      this.last_mpos.load(mpos);
      this.last_p.load(isect.p);
      this.last_origco.load(origco);
      this.last_vec.load(vec);
      this.last_radius = radius;
      this._first = false;

      return undefined;
    }

    return {
      origco, p: isect.p, radius, vec, mpos, view, getchannel, w
    }
  }

  on_mouseup(e) {
    this.modalEnd(false);
  }

  undoPre(ctx) {
    throw new Error("implement me!");
  }

  calcUndoMem(ctx) {
    throw new Error("implement me!");
  }

  modalStart(ctx) {
    this._first = true;
    super.modalStart(ctx);
  }

  undo(ctx) {
    throw new Error("implement me!");
  }
}

export class MaskOpBase extends ToolOp {
  constructor() {
    super();
  }

  calcUndoMem(ctx) {
    let ud = this._undo;

    if (ud.gridData) {
      return ud.gridData.length*8;
    }

    if (ud.vertData) {
      return ud.vertData.length*8;
    }

    return 0;
  }

  undoPre(ctx) {
    let mesh = ctx.mesh;

    let ud = this._undo = {mesh : -1};

    if (!mesh) {
      return;
    }

    ud.mesh = mesh.lib_id;

    let cd_grid = GridBase.meshGridOffset(mesh);
    let cd_mask;

    ud.cd_grid = cd_grid;

    if (cd_grid >= 0) {
      let gd = ud.gridData = [];
      cd_mask = ud.cd_mask = mesh.loops.customData.getLayerIndex("mask");

      if (cd_mask < 0) {
        return;
      }

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        for (let p of grid.points) {
          if (p.flag & MeshFlags.HIDE) {
            continue;
          }

          gd.push(l.eid);
          gd.push(p.eid);
          gd.push(p.customData[cd_mask].value);
        }
      }
    } else {
      cd_mask = ud.cd_mask = mesh.verts.customData.getLayerIndex("mask");

      if (cd_mask < 0) {
        return;
      }
      let vd = ud.vertData = [];

      for (let v of mesh.verts) {
        if (v.flag & MeshFlags.HIDE) {
          continue;
        }

        vd.push(v.eid);
        vd.push(v.customData[cd_mask].value);
      }
    }
  }

  undo(ctx) {
    let ud = this._undo;
    let mesh = ctx.datalib.get(ud.mesh);

    if (!mesh) {
      return;
    }

    let cd_grid = GridBase.meshGridOffset(mesh);
    let cd_mask;
    let cd_node = mesh.bvh ? mesh.bvh.cd_node : -1;

    ud.cd_grid = cd_grid;
    let updateflag = BVHFlags.UPDATE_MASK|BVHFlags.UPDATE_DRAW;

    if (cd_grid >= 0) {
      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];
        grid.regenEIDMap();
      }

      let gd = ud.gridData;
      cd_mask = ud.cd_mask = mesh.loops.customData.getLayerIndex("mask");

      if (cd_mask < 0) {
        return;
      }

      for (let gi=0; gi<gd.length; gi += 3) {
        let leid = gd[gi], peid = gd[gi+1], mask = gd[gi+2];

        let l = mesh.eidmap[leid];
        if (!l) {
          console.error("Missing loop " + leid);
          continue;
        }

        let grid = l.customData[cd_grid];
        let eidmap = grid.getEIDMap(mesh);

        let p = eidmap[peid];

        if (!p) {
          console.warn("Missing grid vert:" + peid);
          continue;
        }

        p.customData[cd_mask].value = mask;
        p.flag |= MeshFlags.UPDATE;

        if (cd_node >= 0) {
          let node = p.customData[cd_node].node;

          if (node) {
            node.flag |= updateflag;
            mesh.bvh.updateNodes.add(node);
          }
        }
      }
    } else {
      cd_mask = ud.cd_mask = mesh.verts.customData.getLayerIndex("mask");

      if (cd_mask < 0) {
        return;
      }
      let vd = ud.vertData;

      for (let vi=0; vi<vd.length; vi += 2) {
        let veid = vd[vi], mask = vd[vi+1];

        let v = mesh.eidmap[veid];

        if (!v) {
          console.warn("Missing vertex " + veid);
          continue;
        }

        v.customData[cd_mask].value = mask;
        v.flag |= MeshFlags.UPDATE;

        if (cd_node) {
          let node = v.customData[cd_node].node;
          if (node) {
            node.flag |= updateflag;
            mesh.bvh.updateNodes.add(node);
          }
        }
      }
    }

    mesh.regenRender();
    mesh.graphUpdate();
    window.redraw_viewport(true);
  }

  getCDMask(mesh) {
    let cd_grid = GridBase.meshGridOffset(mesh);

    if (cd_grid >= 0){
      return mesh.loops.customData.getLayerIndex("mask");
    } else {
      return mesh.verts.customData.getLayerIndex("mask");
    }
  }

  getVerts(mesh, updateBVHNodes=true) {
    let this2 = this;

    let cd_node = mesh.bvh ? mesh.bvh.cd_node : -1;
    let bvh = mesh.bvh ? mesh.bvh : undefined;

    updateBVHNodes = updateBVHNodes && cd_node >= 0;

    let updateflag = BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_MASK;

    return (function*() {
      let cd_mask = this2.getCDMask(mesh);
      let cd_grid = GridBase.meshGridOffset(mesh);

      if (cd_mask < 0) {
        return;
      }

      if (cd_grid >= 0) {
        for (let l of mesh.loops) {
          let grid = l.customData[cd_grid];
          for (let p of grid.points) {
            yield p;

            if (updateBVHNodes) {
              let node = p.customData[cd_node].node;
              if (node) {
                node.flag |= updateflag;
                bvh.updateNodes.add(node);
              }
            }
          }
        }
      } else {
        for (let v of mesh.verts) {
          yield v;

          if (updateBVHNodes) {
            let node = v.customData[cd_node].node;
            if (node) {
              node.flag |= updateflag;
              bvh.updateNodes.add(node);
            }
          }
        }
      }

      mesh.regenRender();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    })();
  }
}

export class ClearMaskOp extends MaskOpBase {
  static tooldef() {return {
    uiname : "Clear Mask",
    toolpath : "paint.clear_mask",
    inputs : {
      value : new FloatProperty(1.0)
    }
  }}

  exec(ctx) {
    let mesh = ctx.mesh;
    if (!mesh) {
      return;
    }

    let cd_mask = this.getCDMask(mesh);
    if (cd_mask < 0) {
      return;
    }

    let value = this.inputs.value.getValue();

    for (let v of this.getVerts(mesh, true)) {
      v.customData[cd_mask].value = value;
    }
  }
}
ToolOp.register(ClearMaskOp);

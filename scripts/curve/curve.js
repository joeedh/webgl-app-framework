import {nstructjs, Vector2, Vector3, Vector4, Quat, Matrix4} from '../path.ux/scripts/pathux.js';

import {Mesh} from "../mesh/mesh.js";
import {MeshTypes, MeshFlags, MeshFeatures, MeshFeatureError, MeshDrawFlags, MeshError} from "../mesh/mesh_base.js";
import {ObjectFlags} from "../sceneobject/sceneobject.js";
import {SceneObjectData} from "../sceneobject/sceneobject_base.js";
import {NodeFlags} from "../core/graph.js";
import {DataBlock} from "../core/lib_api.js";
import {CDElemMap, CDElemTypes, CustomData, CustomDataElem} from "../mesh/customdata.js";
import {CustomDataLayer} from "../mesh/customdata.js";
import {MeshTools} from "../mesh/mesh_stdtools.js";
import {SelMask} from "../editors/view3d/selectmode.js";
import {LayerTypes, SimpleMesh} from "../core/simplemesh.js";
let STRUCT = nstructjs.STRUCT;
import * as util from '../util/util.js';
import {Node} from '../core/graph.js';

export function basis(ks, t, i, deg) {
  let len = ks.length;

  function safe_inv(n) {
    return n === 0 ? 0 : 1.0 / n;
  }

  function bas(s, i, n) {
    var kp = Math.min(Math.max(i-1, 0), len-1);
    var kn = Math.min(Math.max(i+1, 0), len-1);
    var knn = Math.min(Math.max(i+n, 0), len-1);
    var knn1 = Math.min(Math.max(i+n+1, 0), len-1);
    var ki = Math.min(Math.max(i, 0), len-1);

    if (n == 0) {
      return s >= ks[ki] && s < ks[kn] ? 1 : 0;
    } else {

      let a = (s-ks[ki]) * safe_inv(ks[knn]-ks[ki]+0.0001);
      let b = (ks[knn1] - s) * safe_inv(ks[knn1] - ks[kn] + 0.0001);

      return a*bas(s, i, n-1) + b*bas(s, i+1, n-1);
    }
  }

  return bas(t, i-deg, deg);
}

export const KnotFlags = {
};

export class KnotDataLayer extends CustomDataElem {
  constructor() {
    super();
    this.knot = 1.0;
    this.computedKnot = 0.0;
    this.flag = 0.0;
    this.tilt = 0.0;
  }

  static apiDefine(api, dstruct) {
    super.apiDefine(api, dstruct);

    dstruct.float("knot", "speed", "Point Speed").on("change", function() {
      window.redraw_viewport();
    }).range(0.0, 10.0);

    dstruct.float("computedKnot", "computedKnot", "computedKnot").readOnly();
    dstruct.float("tilt", "tilt", "Point Tilt").range(-Math.PI*2.0, Math.PI*2.0).baseUnit("radian").displayUnit("degree").on('change', () => {
      window.redraw_viewport();
    });
  }

  copyTo(b) {
    b.knot = this.knot;
    b.computedKnot = this.computedKnot;
    b.flag = this.flag;
    b.tilt = this.tilt;
  }

  copy() {
    let ret = new KnotDataLayer();
    ret.load(this);
    return ret;
  }

  interp(dest, datas, ws) {
    dest.knot = dest.computedKnot = dest.tilt = 0.0;

    let sum = 0.0;

    for (let i=0; i<datas.length; i++) {
      dest.knot += datas[i].knot*ws[i];
      dest.computedKnot += datas[i].computedKnot*ws[i];
      dest.tilt += datas[i].tilt*ws[i];
      sum += ws[i];
    }

    if (sum !== 0.0) {
      dest.knot /= sum;
      dest.computedKnot /= sum;
      dest.tilt /= sum;
    }
  }

  validate() {
    return true;
  }

  static define() {return {
    elemTypeMask : MeshTypes.VERTEX|MeshTypes.HANDLE, //see MeshTypes in mesh.js
    typeName     : "knot",
    uiTypeName   : "Knot",
    defaultName  : "Knot Layer",
    //elemSize     : 3,
    flag         : 0
  }};
}
KnotDataLayer.STRUCT = STRUCT.inherit(KnotDataLayer, CustomDataElem, "mesh.KnotDataLayer") + `
  knot         : float;
  computedKnot : float;
  flag         : float;
  tilt         : float;
}`;

nstructjs.register(KnotDataLayer);
CustomDataElem.register(KnotDataLayer);

export function getKnot(v) {
  for (let cd of v.customData) {
    if (cd instanceof KnotDataLayer) {
      return cd;
    }
  }
}

export class WalkRet {
  constructor(v, e) {
    this.v = v;
    this.e = e;
  }

  load(v, e) {
    this.v = v;
    this.e = e;

    return this;
  }
}

let WalkRets = util.cachering.fromConstructor(WalkRet, 1024);

export class CurveSpline extends Mesh {
  constructor() {
    let features = MeshFeatures.MAKE_VERT|MeshFeatures.KILL_VERT;

    features |= MeshFeatures.MAKE_EDGE|MeshFeatures.KILL_EDGE;
    features |= MeshFeatures.SPLIT_EDGE|MeshFeatures.JOIN_EDGE;
    features |= MeshFeatures.EDGE_HANDLES | MeshFeatures.EDGE_CURVES_ONLY;
    features |= MeshFeatures.SINGLE_SHELL;
    features &= ~MeshFeatures.BVH;

    super(features);

    this.isClosed = false;
    this.knots = [];
    this.degree = 3;
    this.knotpad = undefined;

    //owning tool mode, if we're owned by a tool mode
    this.owningToolMode = "";

    this._evaluate_vs = util.cachering.fromConstructor(Vector3, 512);

    this._length = 0;
    this.speedLength = 0;

    this.verts.customData.addLayer(KnotDataLayer);
    this.handles.customData.addLayer(KnotDataLayer);

    this.regenRender();
  }

  getBoundingBox() {
    let d = 5;

    return [
      new Vector3([d, d, d]),
      new Vector3([d, d, d])
    ]
  }
  
  copy() {
    let ret = super.copy();

    ret.owningToolMode = this.owningToolMode;
    ret.degree = this.degree;
    ret.speedLength = this.speedLength;
    ret._length = this._length;

    return ret;
  }

  *walk(all_verts=false) {
    if (this.verts.length === 0 || this.verts.first.valence === 0) {
      return; //empty mesh
    }

    //set flip flags
    let v = this.verts.first;
    let e = v.edges[0];

    let pv;
    if (v.valence > 1) {
      pv = v.edges[1].otherVertex(v);
    }

    let _i = 0;
    do {
      let ret = WalkRets.next().load(v, e);

      /*
      if (v === pv && !all_verts) {
        break;
      }
      //*/

      yield ret;

      if (_i++ > 10000) {
        console.warn("mesh integrity error");
        break;
      }

      let v2 = e.otherVertex(v);

      if (v2.valence < 2) {
        if (all_verts) {
          ret = WalkRets.next().load(v2, e);
          yield ret;
        }

        break;
      }

      e = v2.otherEdge(e);
      v = v2;
    } while (v !== this.verts.first)
  }

  get length() {
    return this._length;
  }

  updateKnots() {
    if (this.verts.length === 0 || this.edges.length === 0.0)
      return;

    this.sortVerts();

    this.knotpad = this.degree;

    let t = 0.0;
    let laste, lastv;

    this.knots = [];
    let vs = [];
    let es = [];
    let e, v;

    for ({v, e} of this.walk()) {
      break;
    }

    for (let i=0; i<this.knotpad; i++) {
      let k = 0.0;

      k = getKnot(v).knot;
      t += e.length * k;

      this.knots.push(k);
    }

    for (let {v, e} of this.walk()) {
      let knot = getKnot(v);

      knot.computedKnot = t;
      t += e.length * knot.knot;
      laste = e;
      lastv = v;

      vs.push(v);
      es.push(e);

      this.knots.push(t);
    }

    if (laste && !this.isClosed) {
      let v2 = laste.otherVertex(lastv);
      getKnot(v2).computedKnot = t;
    }

    for (let i=0; i<this.knotpad; i++) {
      if (this.isClosed) {
        let i2 = (vs.length + i - 1) % vs.length;

        let k = getKnot(vs[i2]).knot;

        //t += es[i2].length*k;
      }

      this.knots.push(t);
    }

    this.speedLength = t;
    return this.speedLength;
  }

  update() {
    super.update();

    if (this.verts.length === 0 || this.verts.first.valence === 0) {
      return; //empty mesh
    }

    for (let e of this.edges) {
      e.update(true);
    }

    this._length = 0;

    let i = 0;
    for (let v of this.verts) {
      if (v.valence < 2) {
        if (i > 0) {
          console.warn("start of curve moved; fixing.")
          this.verts.swap(v, this.verts.first);
        }

        break;
      }
    }

    this.sortVerts();

    //set flip flags
    for (let {v, e} of this.walk()) {
      this._length += e.length;
      if (v !== e.v1) {
        e.flag |= MeshFlags.CURVE_FLIP;
      } else {
        e.flag &= ~MeshFlags.CURVE_FLIP;
      }
    }

    this.updateKnots();
  }

  _genRenderElements() {
    this.update();
    return super._genRenderElements(...arguments);
  }

  genRender() {
    this.update();
    return super.genRender(...arguments);
  }

  switchDirection() {
    this.verts.reverse();
    this.update();
  }

  static blockDefine() { return {
    typeName    : "curve",
    defaultName : "Curve",
    uiName      : "Curve",
    flag        : 0,
    icon        : -1
  }}

  static nodedef() {return {
    name   : "curve",
    uiname : "Curve",
    flag   : NodeFlags.SAVE_PROXY,
    inputs : Node.inherit(), //can inherit from parent class by wrapping in Node.inherit({})
    outputs : Node.inherit()
  }}

  static dataDefine() {return {
    name       : "Curve",
    selectMask : SelMask.MESH,
    tools      : MeshTools
  }}

  exec() {
    super.exec(...arguments);

    this.checkUpdate();
  }

  sortVerts() {
    let vs = [];

    for (let {v} of this.walk(true)) {
      vs.push(v);
    }

    if (vs.length !== this.verts.length) {
      console.warn("Vertex sorting error", vs.length, this.verts.length);
      for (let v of this.verts) {
        if (vs.indexOf(v) < 0) {
          vs.push(v);
        }
      }
    }

    if (vs.length !== this.verts.length) {
      console.warn("Major sorting error! Aborting.");
      return;
    }

    this.verts.compact();

    for (let i=0; i<vs.length; i++) {
      this.verts.list[i] = vs[i];
    }

    return this;
  }

  evaluateSpeed2(s) {
    return s / this.length * this.speedLength*0.999999;
  }

  evaluateSpeed(s) {
    if (s < 0) return 0;
    if (s > this.length) return this.length;

    s = s * this.speedLength / this.length*0.999999;

    let vs = this.verts.list; //compacted in sortVerts
    let ks = this.knots;
    let sum = 0.0;

    for (let i=0; i<ks.length; i++) {
      let i2;
      if (this.isClosed) {
        i2 = (i - this.knotpad + vs.length) % vs.length;
      } else {
        i2 = Math.min(Math.max(i - this.knotpad, 0), vs.length-1);
      }

      let w = basis(ks, s, i, this.degree);

      sum += w*ks[i];
    }

    return sum * this.length / this.speedLength*0.999;
  }

  /**
   *
   * @param s_out: array to hold [s, ds]
   * */
  evaluate(s, dv_out=undefined, no_out=undefined, e_out=undefined, s_out=undefined) {
    s = Math.min(Math.max(s, 0.0), this.length);
    s = this.evaluateSpeed(s);

    let laste, lastv, ok=false, firste;

    if (this.verts.length === 0) {
      return this._evaluate_vs.next().zero();
    }

    let knotIval = 1.0;
    let lastknot;
    let ds, firstds, lastds;
    let t = 0.0;
    let i = 0;

    for (let {v, e} of this.walk()) {
      let knot = getKnot(v);
      let t2 = t + e.length;

      if (firste === undefined) {
        firste = laste = e;
      }

      let v2 = e.otherVertex(v);
      let knot2 = getKnot(v2);

      knotIval = t2-t;//(knot2.computedKnot - knot.computedKnot);

      if (firstds === undefined) {
        firstds = knotIval;
      }


      if (s <= t2) {//knot2.computedKnot) {
        ok = true;
        s = ((s - t) / knotIval) * e.length;
        ds = lastds = knotIval;

        laste = e;
        lastv = v;
        lastknot = knot2;
        break;
      }

      t += e.length;
      laste = e;
      lastv = v;
      lastknot = knot2;
      lastds = knotIval;
      i++;
    }

    let p = this._evaluate_vs.next();

    if (!ok) {
      s = s < this.length/2.0 ? 0 : laste.length;
      if (s_out) {
        s_out[0] = s;
        s_out[1] = lastds !== undefined ? lastds : laste.length;
      }

      if (e_out) e_out[0] = laste;
      if (dv_out) dv_out.load(laste.arcDerivative(s));
      if (no_out) no_out.load(laste.arcNormal(s));
      return p.load(laste.arcEvaluate(s));
    } else {
      if (s_out) {
        s_out[0] = s;
        s_out[1] = ds;
      }
      if (e_out) e_out[0] = laste;
      if (dv_out) dv_out.load(laste.arcDerivative(s));
      if (no_out) no_out.load(laste.arcNormal(s));

      return laste.arcEvaluate(s);
    }
  }

  genRender_curves(gl, combinedWireframe, view3d,
                   layers=LayerTypes.LOC|LayerTypes.UV|LayerTypes.ID) {
    //let smesh

    let steps = 48*this.edges.length;
    let s=0, ds = this.length / (steps - 1)*1.4;
    let drawnormals = this.drawflag & MeshDrawFlags.SHOW_NORMALS;
    let sm = new SimpleMesh(layers);
    let lastco = undefined;
    let no = new Vector3();
    let color1 = new Vector4(), color2 = new Vector4();
    let eout = [0], sout = [0, 0];

    for (let i=0; i<steps; i++, s += ds) {
      let co = this.evaluate(s, undefined, no, eout, sout);
      let e = eout[0];
      let s2 = sout[0];
      let elen = e.length;
      let t = s2 / elen;

      color2.load(e.v1.color).interp(e.v2.color, t);

      //console.log(s, co, this.speedLength);
      if (drawnormals) {
        let line;

        let n = no;

        let co2 = new Vector3(co);
        co2.addFac(n, 0.1*this.length/this.edges.length);

        line = sm.line(co, co2);
        if (layers & LayerTypes.COLOR) {
          if (e.flag & MeshFlags.CURVE_FLIP) {
            color1[0] = color1[1] = 1.0;
            color1[2] = 0.0; color1[3] = 1.0;
          }
          line.colors(color1, color1);
        }
        if (layers & LayerTypes.ID) {
          line.ids(e.eid, e.eid);
        }
      }

      if (i > 0) {
        let line = sm.line(lastco, co);

        if (layers & LayerTypes.COLOR) {
          line.colors(color1, color2);
        }

        if (layers & LayerTypes.ID) {
          line.ids(e.eid, e.eid);
        }
      }

      color1.load(color2);
      lastco = co;
    }

    return sm;
    for (let {v, e} of this.walk()) {
      if (e.flag & MeshFlags.HIDE) {
        continue;
      }

      let len;

      if (view3d !== undefined) {
        len = e.calcScreenLength(view3d);
      } else {
        len = e.length;
      }

      let steps = Math.max(Math.floor(len / 5), 8);
      let t = 0, dt = 1.0 / (steps - 1);
      let s = 0, ds = e.length / (steps - 1);
      let lastco = undefined;
      let black = [0,0,0,1];
      let color1 = new Vector4();
      let color2 = new Vector4();

      for (let i=0; i<steps; i++, t += dt, s += ds) {
        let co = e.arcEvaluate(s);

        if (layers & LayerTypes.COLOR) {
          color1.load(e.v1.color).interp(e.v2.color, t);
          color2.load(e.v1.color).interp(e.v2.color, t+dt);
        }

        if (drawnormals) {
          let line;

          if (lastco !== undefined) {
            line = sm.line(co, lastco);
            line.colors([0, 0, 0, 1], [1, 1, 1, 1]);
          }

          let n = e.arcNormal(s);

          let co2 = new Vector3(co);
          co2.addFac(n, e.length*0.05);

          line = sm.line(co, co2);
          if (layers & LayerTypes.COLOR) {
            if (e.flag & MeshFlags.CURVE_FLIP) {
              color1[0] = color1[1] = 1.0;
              color1[2] = 0.0; color1[3] = 1.0;
            }
            line.colors(color1, color1);
          }
          if (layers & LayerTypes.ID) {
            line.ids(e.eid, e.eid);
          }
        }

        if (i > 0) {
          let line = sm.line(lastco, co);

          if (layers & LayerTypes.COLOR) {
            line.colors(color1, color2);
          }

          if (layers & LayerTypes.UV) {
            line.uvs([t, t], [t, t]);
          }

          if (layers & LayerTypes.ID) {
            line.ids(e.eid, e.eid);
          }
        }

        lastco = co;
      }
    }

    return sm;
  }

  closestPoint(p, mode) {

  }

  checkClosed() {
    let v, e;
    if (this.verts.length === 0 || this.edges.length === 0) {
      return;
    }

    for ({v, e} of this.walk()) {
      break;
    }

    let closed = v.valence > 1;
    if (!!closed !== !!this.isClosed) {
      this.sortVerts();

      if (closed) {
        for (let e of v.edges) {
          if (e.otherVertex(v) !== this.verts.list[1]) {
            this.killEdge(e);
            break;
          }
        }
      } else {
        this.makeEdge(this.verts.first, this.verts.last);
      }

      for (let e of this.edges) {
        e.update();
      }
    }
  }

  checkUpdate() {
    this.checkClosed();

    //let hash = "";
    let key = this.isClosed;

    for (let v of this.verts) {
      let knot = getKnot(v);
      let key2 = knot.knot*((1<<24)-1);
      let key3 = knot.tilt*((1<<24)-1);

      key = key ^ key2;
      key = key ^ key3;
    }

    if (key !== this._last_check_key) {
      console.log("detected knot update");
      this._last_check_key = key;

      this.update();
      this.regenRender();
    }
  }

  draw() {
    this.checkUpdate();
    return super.draw(...arguments);
  }

  drawElements() {
    this.checkUpdate();
    return super.drawElements(...arguments);
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
};

CurveSpline.STRUCT = STRUCT.inherit(CurveSpline, Mesh, "mesh.CurveSpline") + `
  _length        : float;
  speedLength    : float;
  degree         : int;
  owningToolMode : string;
  isClosed       : bool;
}
`;

nstructjs.register(CurveSpline);
DataBlock.register(CurveSpline);
SceneObjectData.register(CurveSpline);

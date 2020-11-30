import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import {nstructjs} from '../path.ux/scripts/pathux.js';
import {BinomialTable} from "../util/binomial_table.js";

let KPOINTS = 0, KTOT = KPOINTS + 16 * 3;

export const CubicPatchFields = {
  KPOINTS, KTOT
};

export const CubicPatchFlags = {
  SELECT: 1,
  UPDATE: 2
};


export function bernstein(v, x, n) {
  let eps = 0.00001;
  x = eps + (1.0 - eps*2.0)*x;
  //v++;
  let f = BinomialTable[n][v];

  return f * Math.pow(x, v) * Math.pow(1.0 - x, n - v);
}

bernstein.derivative = function (v, x, n) {
  let eps = 0.00001;
  x = eps + (1.0 - eps*2.0)*x;

  let f = BinomialTable[n][v];

  f = Math.pow(x, v) * Math.pow(1.0 - x, n) * f * (n * x - v);
  f /= Math.pow(1.0 - x, v) * x * (x - 1);

  return f;
}

//uniform bspline basis
export function bspline(i, s, degree) {
  function impulse(s, a, b) {
    return s >= a && s < b ? 1 : 0;
  }

  let i1 = i;

  return ((((s+3.0-i1)*impulse(s,i1-3.0,i1-2.0)-(s+1.0-i1)*
     impulse(s,i1-2.0,i1-1.0))*(s+3.0-i1)+((s+2.0-i1)*
     impulse(s,i1-2.0,i1-
     1.0)+(i1-s)*impulse(s,i1-1.0,i1))*(i1-s))*(s+3.0-i1)-(((s+2.0-
     i1)*impulse(s,i1-2.0,i1-1.0)+(i1-s)*impulse(s,i1-1.0,i1))*(s+
     2.0-i1)-((s+1.0-i1)*impulse(s,i1-1.0,i1)-(s-1.0-i1)*impulse(s,
     i1,i1+1.0))*(s-1.0-i1))*(s-1.0-i1))/6.0;

  let n = degree;
  s *= n - 2;
  //let tdiv = 1.0;

  //uniform cox de boor
  function deboor(i, n) {
    let i2 = i - 3

    let ti = i2
    let ti2 = i2 + 1
    let tip = i2 + n
    let tip2 = i2 + n + 1

    /*
    let ti *= tdiv
    let ti2 *= tdiv
    let tip *= tdiv
    let tip2 *= tdiv
    */

    if (n === 0) {
      return s >= ti && s < ti2 ? 1 : 0;
    } else {
      let a = (s - ti) / (tip - ti)
      let b = (tip2 - s) / (tip2 - ti2)

      return deboor(i, n - 1) * a + deboor(i + 1, n - 1) * b;
    }
  }

  return deboor(i, n);
}

bspline.derivative = function (i, s, degree) {
  let i1 = i;

  function impulse(s, a, b) {
    return s >= a && s < b ? 1 : 0;
  }

  return  (impulse(s,i1-3.0,i1-2.0)*i1**2-2.0*impulse(s,i1-3.0,i1-2.0
    )*i1*s-6.0*impulse(s,i1-3.0,i1-2.0)*i1+impulse(s,i1-3.0,i1-2.0
    )*s**2+6.0*impulse(s,i1-3.0,i1-2.0)*s+9.0*impulse(s,i1-3.0,i1-
    2.0)-3.0*impulse(s,i1-2.0,i1-1.0)*i1**2+6.0*impulse(s,i1-2.0,
    i1-1.0)*i1*s+10.0*impulse(s,i1-2.0,i1-1.0)*i1-3.0*impulse(s,i1
    -2.0,i1-1.0)*s**2-10.0*impulse(s,i1-2.0,i1-1.0)*s-7.0*impulse(
    s,i1-2.0,i1-1.0)+3.0*impulse(s,i1-1.0,i1)*i1**2-6.0*impulse(s,
    i1-1.0,i1)*i1*s-2.0*impulse(s,i1-1.0,i1)*i1+3.0*impulse(s,i1-
    1.0,i1)*s**2+2.0*impulse(s,i1-1.0,i1)*s-impulse(s,i1-1.0,i1)-
    impulse(s,i1,i1+1.0)*i1**2+2.0*impulse(s,i1,i1+1.0)*i1*s-2.0*
    impulse(s,i1,i1+1.0)*i1-impulse(s,i1,i1+1.0)*s**2+2.0*impulse(
    s,i1,i1+1.0)*s-impulse(s,i1,i1+1.0))/2.0;

  /*
  on factor;
  operator impulse;
  for all s,a,b let df(impulse(s, a, b), s) = 0;

  procedure basis1(i, n, degree); begin scalar n, s2, i2, ti, ti2, tip, tip2, a, b;
    i2 := i - 3;
    s2 := s*(degree - 2);

    ti := i2;
    ti2 := i2 + 1;
    tip := i2 + n;
    tip2 := i2 + n + 1;

    return if n=0 then
      impulse(s2, ti, ti2)
    else <<
      a := (s2 - ti) / (tip - ti);
      b := (tip2 - s2) / (tip2 - ti2);

      basis1(i, n-1, degree)*a + basis1(i+1, n-1, degree)*b
      >>
  end;


  procedure basis(i, n);
    basis1(i, n, n);

  f1 := basis(i1, 2);
  f2 := basis(i1, 3);

  on factor;
  on fort;

  f1;
  f2;
  df(f1, s);
  df(f2, s);

  off fort;



  for (let i=0; i<4; i++) {
    for (let j=0; j<4; j++) {
      let w = basis(i, u, degree)*basis(j,v,degree);

      let pi = (j*4 + i)*3;
      ret[0] += ps[pi]*w;
      ret[1] += ps[pi+1]*w;
      ret[2] += ps[pi+2]*w;
    }
  }

  */
}

let getpoints_ret = util.cachering.fromConstructor(Vector3, 64);

//uniform cubic bspline patch
export class CubicPatch {
  constructor() {
    this._patch = new Float64Array(KTOT);
    for (let i = 0; i < KTOT; i++) {
      this._patch[i] = 0;
    }

    this.evaluate_rets = util.cachering.fromConstructor(Vector3, 64);
    this.dv_rets = util.cachering.fromConstructor(Vector3, 64);
    this.dv2_rets = util.cachering.fromConstructor(Vector3, 64);
    this.normal_rets = util.cachering.fromConstructor(Vector3, 64);

    this.basis = bspline;
    this.scratchu = new Vector3();
    this.scratchv = new Vector3();
    //this.basis = bernstein;
  }

  setPoint(x, y, p) {
    let i = (y * 4 + x) * 3;
    let ps = this._patch;

    ps[i] = p[0];
    ps[i + 1] = p[1];
    ps[i + 2] = p[2];

    this.flag |= CubicPatchFlags.UPDATE;
  }

  getPoint(x, y) {
    let p = getpoints_ret.next();
    let ps = this._patch;

    let idx = (y*4 + x)*3;

    p[0] = ps[idx];
    p[1] = ps[idx+1];
    p[2] = ps[idx+2];

    return p;
  }

  evaluate(u, v, dv_u_out, dv_v_out, normal_out) {
    //we do not have derivatives everywhere
    let eps = 0.000005;
    u = eps + u*(1.0 - eps*2);
    v = eps + v*(1.0 - eps*2);

    let ret = this.evaluate_rets.next().zero();
    let order = 4;
    let degree = 3;
    let ps = this._patch;

    let basis = this.basis;

    let dvu, dvv;

    if (dv_u_out) {
      dvu = dv_u_out;
    } else {
      dvu = this.scratchu;
    }

    if (dv_v_out) {
      dvv = dv_v_out;
    } else {
      dvv = this.scratchv;
    }

    dvu[0] = dvu[1] = dvu[2] = 0.0;
    dvv[0] = dvv[1] = dvv[2] = 0.0;

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let wu = basis(i, u, degree);
        let wv = basis(j, v, degree);

        let dwu = basis.derivative(i, u, degree);
        let dwv = basis.derivative(j, v, degree);

        let w = wu*wv;

        let pi = (j * 4 + i) * 3;

        ret[0] += ps[pi] * w;
        ret[1] += ps[pi + 1] * w;
        ret[2] += ps[pi + 2] * w;

        dvu[0] += ps[pi]*dwu*wv;
        dvu[1] += ps[pi+1]*dwu*wv;
        dvu[2] += ps[pi+2]*dwu*wv;

        dvv[0] += ps[pi]*dwv*wu;
        dvv[1] += ps[pi+1]*dwv*wu;
        dvv[2] += ps[pi+2]*dwv*wu;
      }
    }

    if (normal_out) {
      normal_out.load(dvv).cross(dvu).normalize();
      if (this.basis === bernstein) {
        //normal_out.negate();
      }
    }

    return ret;
  }

  derivative(u, v) {
    let ret = this.dv_rets.next().zero();

  }

  derivative2(u, v) {
    let ret = this.dv2_rets.next().zero();

  }

  normal(u, v) {
    let ret = this.normal_rets.next().zero();
  }
}

export class SSPatch {
  constructor(patch, loop) {
    this.patch = patch;
    this.l = loop;
  }

  evaluate(u, v, dv_u, dv_v, norout) {
    return this.patch.evaluate(u, v, dv_u, dv_v, norout);
  }

  derivative(u, v) {
    return this.patch.derivative(u, v);
  }

  derivative2(u, v) {
    return this.patch.derivative2(u, v);
  }

  normal(u, v) {
    return this.patch.normal(u, v);
  }
}

let zeropatch = new CubicPatch();

export class Patch4 {
  constructor(p1, p2, p3, p4) {
    this.patches = [p1, p2, p3, p4];
    this.dv_urets = util.cachering.fromConstructor(Vector3, 8);
    this.dv_vrets = util.cachering.fromConstructor(Vector3, 8);
    this.nor_rets = util.cachering.fromConstructor(Vector3, 8);
  }

  evaluate(u, v, dv_u, dv_v, norout) {
    let p;

    let su = u, sv = v;

    //return this.patches[0].evaluate(...arguments);

    if (u <= 0.5 && v <= 0.5) {
      let t = u;
      u = v;
      v = t;

      u = 1.0 - u * 2.0;
      v = 1.0 - v * 2.0;

      p = this.patches[0];
    } else if (u <= 0.5 && v >= 0.5) {
      u *= 2.0;
      v = (v - 0.5) * 2.0;

      u = 1.0 - u;

      p = this.patches[1];
    } else if (u >= 0.5 && v >= 0.5) {
      let t = u;
      u = v;
      v = t;

      u = (u - 0.5) * 2.0;
      v = (v - 0.5) * 2.0;
      p = this.patches[2];
    } else {
      u = (u - 0.5) * 2.0;
      v = 1.0 - v * 2.0;

      p = this.patches[3];
    }

    let co = p.evaluate(v, u, dv_u, dv_v, norout);

    //co[2] += su*0.5;

    return co;
  }

  derivativeU(u, v) {
    let dv = this.dv_urets.next().zero();
    this.evaluate(u, v, dv);

    return dv;
  }

  derivativeV(u, v) {
    let dv = this.dv_vrets.next().zero();
    this.evaluate(u, v, undefined, dv);

    return dv;
  }

  normal(u, v) {
    let dv = this.nor_rets.next().zero();
    this.evaluate(u, v, undefined, undefined, dv);

    return dv;
  }
}

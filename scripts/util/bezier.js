import * as util from './util.js';
import {Vector2, Vector3} from './vectormath.js';
import {nstructjs} from '../path.ux/scripts/pathux.js';

/*

on factor;

procedure bez(a, b);
 a + (b - a)*s;

lin := bez(k1, k2);
quad := bez(lin, sub(k2=k3, k1=k2, lin));
cubic := bez(quad, sub(k3=k4, k2=k3, k1=k2, quad));

x := sub(k1=x1, k2=x2, k3=x3, quad);
y := sub(k1=y1, k2=y2, k3=y3, quad);
z := sub(k1=z1, k2=z2, k3=z3, quad);

dx := df(x, s);
dy := df(y, s);
dz := df(z, s);

px := 0;
py := 0;
pz := 0;

f1 := x*dy - y*dx;

ff := solve(f1, s);
on fort;
part(ff, 1);
part(ff, 2);
off fort;

f1 := dx*x + dy*y + dz*z;

*/

let closestrets = new util.cachering(() => {
  return {
    p      : new Vector3(),
    t      : 0,
    distSqr: 0
  };
}, 512);
let _tmp = new Vector2();

export function closest_bez3_v2(p, a, b, c) {
  let x1 = a[0] - p[0], y1 = a[1] - p[1];
  let x2 = b[0] - p[0], y2 = b[1] - p[1];
  let x3 = c[0] - p[0], y3 = c[1] - p[1];

  let sqr = -2.0*((y1*y3 - 2.0*y2**2)*x3 + 2.0*x2*y2*y3)*x1 + (4.0*x2**2*y3 - 4.0*x2*x3*y2 + x3**2*y1)*y1 + x1**2*y3**2;
  //sqr = Math.max(sqr, 0.0);
  sqr = Math.abs(sqr);

  let B = Math.sqrt(sqr);
  let A = -((2.0*y2 - y3)*x1 - B) + (2.0*x2 - x3)*y1;
  let C = (2.0*((y1 - y3)*x2 - (y2 - y3)*x1) - 2.0*(y1 - y2)*x3);

  if (C === 0.0) {
    //return undefined;
    C = 0.00001;
  }

  let r1 = (A - B)/C;
  let r2 = (A + B)/C;
  let r, dis;

  if (r2 < 0 || r2 > 1.0) {
    r = r1;
  } else if (r1 < 0 || r1 > 1.0) {
    r = r2;
  } else {
    let p2 = _tmp;

    p2[0] = bez3(a[0], b[0], c[0], r1);
    p2[1] = bez3(a[1], b[1], c[1], r1);

    let l1 = p2.vectorLengthSqr();

    p2[0] = bez3(a[0], b[0], c[0], r2);
    p2[1] = bez3(a[1], b[1], c[1], r2);

    let l2 = p2.vectorLengthSqr();

    if (l1 < l2) {
      r = r1;
      dis = l1;
    } else {
      r = r2;
      dis = l2;
    }
  }

  if (dis === undefined) {
    let p2 = _tmp;
    p2[0] = bez3(a[0], b[0], c[0], r);
    p2[1] = bez3(a[1], b[1], c[1], r);

    if (r === undefined) {
      r = 0.0;
    }

    dis = p2.vectorLengthSqr();
  }

  let ret = closestrets.next();

  r = Math.min(Math.max(r, 0.0), 1.0);

  ret.p[0] = bez3(a[0], b[0], c[0], r);
  ret.p[1] = bez3(a[1], b[1], c[1], r);

  ret.distSqr = ret.p.vectorDistanceSqr(p);
  ret.t = r;

  return ret;
}


export function bez3(k1, k2, k3, s) {
  return ((k1 - k2)*s - k1 - ((k2 - k3)*s - k2))*s - ((k1 - k2)*s - k1);
}

export function dbez3(k1, k2, k3, s) {
  return 2.0*(k1*s - k1 - 2.0*k2*s + k2 + k3*s);
}

let bez3_v2_rets = util.cachering.fromConstructor(Vector2, 512);

export function bez3_v2(a, b, c, t) {
  let p = bez3_v2_rets.next();

  p[0] = bez3(a[0], b[0], c[0], t);
  p[1] = bez3(a[1], b[1], c[1], t);

  return p;
}

export function dbez3_v2(a, b, c, t) {
  let p = bez3_v2_rets.next();

  p[0] = dbez3(a[0], b[0], c[0], t);
  p[1] = dbez3(a[1], b[1], c[1], t);

  return p;
}

export function bez4(a, b, c, d, t) {
  var r1 = bez3(a, b, c, t);
  var r2 = bez3(b, c, d, t);

  return r1 + (r2 - r1)*t;
}

export function dbez4(k1, k2, k3, k4, s) {
  return -3.0*((s - 1.0)**2*k1 - k4*s**2 + (3.0*s - 2.0)*k3*s - (3.0*s - 1.0)*(s - 1.0)*k2);
}

export function d2bez4(k1, k2, k3, k4, s) {
  return -6.0*(k1*s-k1-3.0*k2*s+2.0*k2+3.0*k3*s-k3-k4*s);
}

export function d3bez4(k1, k2, k3, k4, s) {
  return -6.0*(k1-3.0*k2+3.0*k3-k4);
}

export class QuadClosestRet3 {
  constructor() {
    this.p = new Vector3();
    this.t = 0.0;
    this.dist = 0.0;
  }
}

let quad_closest_tmps3 = util.cachering.fromConstructor(Vector3, 64);
let quad_closest_tmps2 = util.cachering.fromConstructor(Vector2, 64);
let quad_rets = util.cachering.fromConstructor(QuadClosestRet3, 64);
let quad_eval_rets = util.cachering.fromConstructor(Vector3, 64);

export class Quad {
  constructor(a, b, c) {
    this.a = new Vector3(a);
    this.b = new Vector3(b);
    this.c = new Vector3(c);
  }

  evaluate(t) {
    let co = quad_eval_rets.next();

    let a = this.a, b = this.b, c = this.c;

    for (let i=0; i<3; i++) {
      co[i] = bez3(a[i], b[i], c[i], t);
    }

    return co;
  }

  closestPoint(p) {
    //find projection axis

    let dv = quad_closest_tmps3.next().load(this.c).sub(this.a);
    dv.abs();

    let axis1, axis2;

    if (dv[0] >= dv[1] && dv[0] >= dv[2]) {
      axis1 = 1;
      axis2 = 2;
    } else if (dv[1] >= dv[0] && dv[1] >= dv[2]) {
      axis1 = 0;
      axis2 = 2;
    } else {
      axis1 = 0;
      axis2 = 1;
    }

    let a = quad_closest_tmps2.next().zero();
    let b = quad_closest_tmps2.next().zero();
    let c = quad_closest_tmps2.next().zero();

    a[0] = this.a[axis1];
    a[1] = this.a[axis2];

    b[0] = this.b[axis1];
    b[1] = this.b[axis2];

    c[0] = this.c[axis1];
    c[1] = this.c[axis2];

    let p2 = quad_closest_tmps2.next();
    p2[0] = p[axis1];
    p2[1] = p[axis2];

    let ret = closest_bez3_v2(p2, a, b, c);

    let ret2 = quad_rets.next();

    ret2.dist = Math.sqrt(ret.distSqr);
    ret2.t = ret.t;
    ret2.p.load(this.evaluate(ret.t));

    return ret2;
  }
}
Quad.STRUCT = `
bezier.Quad {
  a : vec3;
  b : vec3;
  c : vec3;
}
`;
nstructjs.register(Quad);

let dv_rets = util.cachering.fromConstructor(Vector3, 128);
let eval_rets = util.cachering.fromConstructor(Vector3, 128);

export class Bezier {
  constructor(a, b, c, d) {
    this.a = new Vector3(a);
    this.b = new Vector3(b);
    this.c = new Vector3(c);
    this.d = new Vector3(d);

    this.quads = [];
  }

  derivative(s) {
    let dv = dv_rets.next();
    let a = this.a, b = this.b, c = this.c, d = this.d;

    for (let i=0; i<3; i++) {
      dv[i] = dbez4(a[i], b[i], c[i], d[i], s);
    }

    return dv;
  }

  derivative2(s) {
    let dv = dv_rets.next();
    let a = this.a, b = this.b, c = this.c, d = this.d;

    for (let i=0; i<3; i++) {
      dv[i] = d2bez4(a[i], b[i], c[i], d[i], s);
    }

    return dv;
  }

  closestPoint(p) {
    if (1) {
      let steps = 64;
      let ret = quad_rets.next();

      let s = 0.0, ds = 1.0 / (steps - 1);

      for (let i=0; i<steps; i++, s += ds) {
        let p2 = this.evaluate(s);

        let dist = p2.vectorDistance(p);

        if (i === 0 || dist < ret.dist) {
          ret.dist = dist;
          ret.t = s;
          ret.p.load(p);
        }
      }

      return ret;
    }

    let mindis, minp;

    for (let q of this.quads) {
      let p2 = q.closestPoint(p);
      let dist = p2.dist;

      if (mindis === undefined || dist < mindis) {
        minp = p2;
        mindis = dist;
      }
    }

    return minp;
  }

  derivative3(s) {
    let dv = dv_rets.next();
    let a = this.a, b = this.b, c = this.c, d = this.d;

    for (let i=0; i<3; i++) {
      dv[i] = d3bez4(a[i], b[i], c[i], d[i], s);
    }

    return dv;
  }


  curvature(s) {
    let dv = this.derivative(s);
    let dv2 = this.derivative2(s);

    return (dv[0]*dv2[1] - dv[1]*dv2[0]) / Math.pow(dv.dot(dv), 3.0/2.0);
  }

  evaluate(s) {
    let co = eval_rets.next();
    let a = this.a, b = this.b, c = this.c, d = this.d;

    for (let i=0; i<3; i++) {
      co[i] = bez4(a[i], b[i], c[i], d[i], s);
    }

    return co;
  }

  createQuads() {
    let steps = 7;
    let ds = 1.0 / steps;
    let s = 0;
    let lastdv;

    let splits = [0.0];
    let totsplit = 3;

    for (let i=0; i<steps; i++, s += ds) {
      let dv = this.derivative(s);

      if (lastdv && dv.dot(lastdv) < 0) {
        if (splits.length < 3) {
          splits.push(s - ds*0.5);
        }
      }
    }

    if (splits.length < 2) {
      splits.push(0.5);
    }

    splits.push(1.0);

    for (let i=0; i<splits.length-1; i++) {
      let s1 = splits[i];
      let s2 = splits[i+1];

      let a = this.evaluate(s1);
      let c = this.evaluate(s2);

      let d1 = this.derivative(s1);
      let d2 = this.derivative(s2);

      d1.interp(d2, 0.5);

      d1.mulScalar(1.0/3.0).add(a);

      let quad = new Quad(a, d1, c);
      this.quads.push(quad);
    }

    return this;
  }
}

Bezier.STRUCT = `
bezier.Bezier {
  a     : vec3;
  b     : vec3;
  c     : vec3;
  d     : vec3;
  quads : array(bezier.Quad);
}
`;
nstructjs.register(Bezier);

export function makeBezier(a, b, c, d, s) {
  return new Bezier(a, b, c, d);
}

export function testInit() {
  let canvas = document.createElement("canvas");
  document.body.appendChild(canvas);

  let dpi = devicePixelRatio;
  let w = ~~(window.innerWidth*dpi - 32);
  let h = ~~(window.innerHeight*dpi - 32);

  canvas.width = w;
  canvas.height = h;
  canvas.style["width"] = (w/dpi) + "px";
  canvas.style["height"] = (h/dpi) + "px";

  let g = canvas.getContext("2d");
  let cur_s = 0.5;

  let req = undefined;

  let bez = [new Vector2(), new Vector2(), new Vector2()];
  for (let i = 0; i < bez.length; i++) {
    bez[i][0] = Math.random()*512;
    bez[i][1] = Math.random()*512;
  }

  function draw() {
    req = undefined;

    g.clearRect(0, 0, canvas.width, canvas.height);
    g.strokeStyle = "black";

    g.beginPath()
    let lastp;

    for (let i = 0; i < bez.length; i++) {
      let p = bez[i];
      let w = 5;
      g.rect(p[0] - w*0.5, p[1] - w*0.5, w, w);

      if (lastp) {
        g.moveTo(lastp[0], lastp[1]);
        g.lineTo(p[0], p[1]);
      }

      lastp = p;
    }

    g.stroke();
    g.beginPath()

    let p = new Vector2();

    let steps = 12;
    let ds = 1.0/(steps - 1), s = 0;

    function evalbez(p, s) {
      p[0] = bez3(bez[0][0], bez[1][0], bez[2][0], s);
      p[1] = bez3(bez[0][1], bez[1][1], bez[2][1], s);
    }

    for (let i = 0; i < steps; i++, s += ds) {
      evalbez(p, s);

      if (i > 1) {
        g.lineTo(p[0], p[1]);
      } else {
        g.moveTo(p[0], p[1]);
      }
    }

    g.stroke();

    w = 10;

    evalbez(p, cur_s);
    g.fillStyle = "orange";
    g.strokeStyle = "orange";

    g.beginPath();

    g.rect(p[0] - w*0.5, p[1] - w*0.5, w, w);
    g.fill();
  }

  function redraw() {
    if (req !== undefined) {
      return;
    }

    req = requestAnimationFrame(draw);
  }

  redraw();

  window.addEventListener("mousemove", (e) => {
    let dpi = devicePixelRatio;
    let p = new Vector2([e.x*dpi, e.y*dpi]);

    let ret = closest_bez3_v2(p, bez[0], bez[1], bez[2]);

    if (ret) {
      let t = ret.t;
      t = Math.min(Math.max(t, 0.0), 1.0);
      cur_s = t;
      redraw();
    }
  })
}
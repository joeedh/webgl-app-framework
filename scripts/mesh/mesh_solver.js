export const FloatArrayClass = Float64Array;

import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {CDFlags, CustomDataElem, LayerSettingsBase} from './customdata.js';
import {nstructjs} from '../path.ux/pathux.js';

export const DerivFlags = {
  FIRST  : 1,
  SECOND : 2,
  DEFAULT: 1 | 2
};

export class SolverSettings extends LayerSettingsBase {
  constructor() {
    super();
    this.speed = 1.0;
  }
}

SolverSettings.STRUCT = nstructjs.inherit(SolverSettings, LayerSettingsBase) + `
  speed : float;
}
`;
nstructjs.register(SolverSettings);

export class SolverElem extends CustomDataElem {
  constructor() {
    super();

    this.oldco = new Vector3();
    this.oldvel = new Vector3();
    this.vel = new Vector3();
    this.force = new Vector3();
    this.scratch = new Vector4();
    this.mass = 1.0;
  }

  static apiDefine(api) {
    let st = super.apiDefine(api);
    return st;
  }

  static define() {
    return {
      typeName   : "solvevert",
      uiTypeName : "solvevert",
      defaultName: "solvevert",
      valueSize  : undefined,
      flag       : CDFlags.TEMPORARY,

      //if not undefined, a LayerSettingsBase child class defining overall settings that's not per-element
      settingsClass: SolverSettings,
    }
  }

  calcMemSize() {
    return 8*3*5;
  }

  clear() {
    this.oldvel.zero();
    this.force.zero();
    this.oldco.zero();
    this.vel.zero();
    this.mass = 1.0;

    return this;
  }

  copyTo(b) {
    b.force.load(this.force);
    b.oldco.load(this.oldco);
    b.vel.load(this.vel);
    b.mass = this.mass;
  }
}

SolverElem.STRUCT = nstructjs.inherit(SolverElem, CustomDataElem) + `
}
`;
nstructjs.register(SolverElem);
CustomDataElem.register(SolverElem);


export class Constraint {
  constructor(klst, params, wlst = undefined, vel_lst=undefined, force_lst=undefined, scratch_lst) {
    if (wlst === undefined) {
      wlst = [];
      for (let ks of klst) {
        //let ws = new FloatArrayClass(ks.length);
        //ws.fill(1.0);

        wlst.push(1.0);
      }
    }

    let glst2 = [];

    for (let ks of klst) {
      let gs2 = new FloatArrayClass(ks.length);
      gs2.fill(0.0);

      glst2.push(gs2);
    }

    if (vel_lst === undefined) {
      throw new Error("no vel");
      vel_lst = [];
      for (let ks of klst) {
        let gs2 = new FloatArrayClass(ks.length);
        gs2.fill(0.0);

        vel_lst.push(gs2);
      }
    }

    if (force_lst === undefined) {
      throw new Error("no force");
      force_lst = [];
      for (let ks of klst) {
        let gs2 = new FloatArrayClass(ks.length);
        gs2.fill(0.0);

        force_lst.push(gs2);
      }
    }

    if (scratch_lst === undefined) {
      throw new Error("no scratch");
    }

    this.bad = false;

    this.slst = scratch_lst;
    this.flst = force_lst;
    this.vlst = vel_lst;
    this.wlst = wlst;
    this.glst2 = glst2; //scratch
    this.glst3 = []; //scratch
    this.glst = [];
    this.hlst = []; //heissan
    this.klst = [];
    this.klst2 = []; //solver scratch
    this.klst3 = []; //scratch

    for (let ks of klst) {
      let gs = new FloatArrayClass(ks.length);
      let hs = new FloatArrayClass(ks.length);
      let gs3 = new FloatArrayClass(ks.length);
      let ks2 = new FloatArrayClass(ks.length);
      let ks3 = new FloatArrayClass(ks.length);

      this.glst3.push(gs3);
      this.glst.push(gs);
      this.hlst.push(hs);
      this.klst.push(ks);
      this.klst2.push(ks2);
      this.klst3.push(ks3);
    }

    this.params = params;
    this.df = 0.00001;
  }

  set(klst, wlst = undefined, params = undefined) {
    for (let i = 0; i < klst.length; i++) {
      this.klst[i] = klst[i];

      if (wlst) {
        this.wlst[i] = wlst[i];
      }
    }

    if (params) {
      this.params = params;
    }

    return this;
  }

  evaluate(deriveFlag = DerivFlags.DEFAULT) {
  }

  applyMass() {
    //return;
    let wlst = this.wlst;
    let klst = this.klst;
    let glst = this.glst;

    let totw = 0.0;

    for (let i=0; i<klst.length; i++) {
      totw += 1.0 / (wlst[i] + 0.000001);
      //totw += wlst[i];
    }

    if (totw !== 0.0) {
      totw = 1.0 / totw;
    }

    if (isNaN(totw)) {
      console.log(wlst, klst, glst);
      throw new Error("NaN!");
    }

    for (let i=0; i<klst.length; i++) {
      let gs = this.glst[i];
      let w = (1.0 / this.wlst[i]) * totw;
      //let w = this.wlst[i] * totw;

      if (isNaN(w)) {
        throw new Error("NaN!");
      }

      for (let j=0; j<gs.length; j++) {
        if (isNaN(gs[j])) {
          throw new Error("NaN!");
        }

        gs[j] *= w;
      }
    }
  }
}

export class DiffConstraint extends Constraint {
  constructor(func, klst, params, wlst, vlst, flst, slst) {
    super(klst, params, wlst, vlst, flst, slst);

    this.func = func;

  }

  evaluate(derivFlag = DerivFlags.DEFAULT) {
    let r1 = this.func(this.params);

    if (derivFlag === 0) {
      return r1;
    }

    let df = this.df;

    let first = derivFlag & DerivFlags.FIRST;
    let second = derivFlag & DerivFlags.SECOND;

    for (let i=0; i<this.klst.length; i++) {
      let ks = this.klst[i];
      let gs = this.glst[i];
      let hs = this.hlst[i];

      for (let j=0; j<ks.length; j++) {
        let orig = ks[j];

        ks[j] += df;
        let r2 = this.func(this.params);

        let dv1 = (r2 - r1) / df;

        if (first) {
          gs[j] = -dv1;
        }

        if (second) {
          ks[j] += df;

          let r3 = this.func(this.params);
          let dv2 = (r3 - r2) / df;
          dv2 = (dv2 - dv1) / df;

          hs[j] = -dv2;
        }

        ks[j] = orig;
      }
    }
  }
}

export class VelConstraint extends Constraint {
  constructor(func, velfunc, accfunc, klst, params, wlst, vlst, flst, slst) {
    super(klst, params, wlst, vlst, flst, slst);

    this.func = func;
    this.velfunc = velfunc;
    this.accfunc = accfunc;
  }

  evaluate(derivFlag = DerivFlags.DEFAULT) {
    let r1 = this.func(this.params);

    if (derivFlag === 0) {
      return r1;
    }

    let df = this.df;

    let first = derivFlag & DerivFlags.FIRST;
    let second = derivFlag & DerivFlags.SECOND;

    this.velfunc(this.params, this.klst, this.glst);
    if (this.accfunc) {
      this.accfunc(this.params, this.klst, this.hlst);
      return r1;
    }

    for (let i=0; i<this.klst.length; i++) {
      let ks = this.klst[i];
      let gs = this.glst[i];
      let hs = this.hlst[i];
      let gs2 = this.glst2[i];

      for (let j=0; j<ks.length; j++) {
        let orig = ks[j];

        ks[j] += df;
        this.velfunc(this.params, this.klst, this.glst3);

        for (let j=0; j<ks.length; j++) {
          hs[j] = -(gs3[j] - gs[j]) / df;
        }

        ks[j] = orig;
      }
    }

    return r1;
  }
}

export class Solver {
  constructor() {
    this.gk = 0.99;
    this.cons = [];
    this.implicitSteps = 5;
    this.mesh = undefined;
    this.cd_slv = -1;
    this.last_print_time = 0.0;
    this.last_print_time_2 = 0.0;

    this.clientData = undefined;
  }

  [Symbol.iterator]() {
    return this.cons[Symbol.iterator]();
  }

  start(mesh) {
    this.mesh = mesh;

    let cd_slv = mesh.verts.customData.getLayerIndex("solvevert");
    if (cd_slv < 0) {
      let layer = mesh.verts.addCustomDataLayer("solvevert");
      cd_slv = layer.index;
    }

    this.cd_slv = cd_slv;
    for (let v of mesh.verts) {
      let sv = v.customData[cd_slv];

      sv.oldco.load(v);
      sv.vel.zero();
    }
  }

  finish() {
    this.mesh = undefined;
  }

  add(con) {
    this.cons.push(con);
  }

  remove(con) {
    this.cons.remove(con);
  }

  solve_intern(gk=1.0) {
    gk *= this.gk;

    const dvflag = DerivFlags.DEFAULT;
    const implicitSteps = this.implicitSteps;

    let err = 0.0;

    for (let con of this.cons) {
      if (con.bad) {
        err += 1000.0;
        continue;
      }

      let r1 = con.evaluate(dvflag);
      con.applyMass();

      let totg = 0.0;

      err += Math.abs(r1);

      //console.log("r1", r1);

      let klst = con.klst, glst = con.glst, wlst = con.wlst, glst2 = con.glst2;
      let klst2 = con.klst2, hlst = con.hlst;
      let glst3 = con.glst3;
      let vlst = con.vlst;
      let flst = con.flst;
      let slst = con.slst;

      let k = gk;

      for (let i = 0; i < klst.length; i++) {
        let ks = klst[i];
        let w = wlst[i];
        let gs = glst[i];
        let gs2 = glst2[i];
        let gs3 = glst3[i];
        let ks2 = klst2[i];
        let hs = hlst[i];
        let vel = vlst[i];
        let fs = flst[i];

        ks2.set(ks);
        gs2.set(gs);
        gs3.set(gs);

        if (implicitSteps > 0) {
          for (let j = 0; j < gs2.length; j++) {
            //fs[j] += 0.5*k*hs[j]; //build guess with taylor expansion
          }
        }
      }
    }


    let doprint2 = util.time_ms() - this.last_print_time_2 > 100;

    if (doprint2) {
      console.log("\n");
      this.last_print_time_2 = util.time_ms();
    }

    let k = gk;

    let scratches = new Set();

    for (let con of this.cons) {
      for (let scratch of con.slst) {
        scratches.add(scratch);
      }
    }

    for (let step=0; step<implicitSteps; step++) {
      for (let scratch of scratches) {
        for (let j=0; j<scratch.length; j++) {
          scratch[j] = 0.0;
        }
      }

      for (let con of this.cons) {
        let doprint = doprint2 && con === this.cons[0];

        let klst = con.klst, glst = con.glst, wlst = con.wlst, glst2 = con.glst2;
        let klst2 = con.klst2, hlst = con.hlst;
        let glst3 = con.glst3, klst3 = con.klst3;
        let vlst = con.vlst;
        let flst = con.flst;
        let slst = con.slst;

        //*
        let totws = 0.0;
        for (let i = 0; i < klst.length; i++) {
          totws += 1.0/wlst[i];
        }

        totws = 1.0/totws;
        //*/

        for (let step = 0; step < 1; step++) {
          for (let i = 0; i < klst.length; i++) {
            let ks3 = klst3[i];
            let ks2 = klst2[i];
            let ks = klst[i];
            let w = (1.0/wlst[i])*totws;
            let gs = glst[i];
            let gs2 = glst2[i];
            let hs = hlst[i];
            let vel = vlst[i];
            let fs = flst[i];
            let scratch = slst[i];

            ks.set(ks2);

            for (let j = 0; j < ks.length; j++) {
              if (isNaN(fs[j])) {
                //throw new Error("NaN!");
                console.warn("NaN!");
                continue;
              }

              //let dx = ((vel[j] + gs2[j])*k*gs[j] + hs[j]*gs2[j])*k;

              ks[j] += (vel[j] + fs[j]*k)*k;
            }
          }

          let err2 = 0.0;
          //con.bad = false;

          con.evaluate(dvflag);
          con.applyMass();

          for (let i=0; i<klst.length; i++) {
            let ks = klst[i];
            let ks2 = klst2[i];
            let ks3 = klst3[i];

            ks.set(ks2); //ks3);
          }

          for (let i = 0; i < klst.length; i++) {
            let ks = klst[i];
            let ks2 = klst2[i];
            let w = wlst[i];
            let gs = glst[i];
            let gs2 = glst2[i];
            let gs3 = glst3[i];
            let vel = vlst[i];
            let hs = hlst[i];
            let fs = flst[i];
            let scratch = slst[i];

            for (let j = 0; j < ks.length; j++) {
              scratch[j] += hs[j]//*k/w + gs[j]/w;

              if (isNaN(fs[j])) {
                con.bad = true;

                //throw new Error("NaN!");
                break;

              }
            }

            scratch[ks.length] += 1.0;
          }

          if (con.bad) {
            continue;
          }

          /*
          for (let i = 0; i < klst.length; i++) {
            let ks = klst[i];
            let ks2 = klst2[i];

            ks.set(ks2);
          }//*/

          if (doprint) {
            //console.log("  err2", err2.toFixed(4));
          }
        }
      }

      for (let s of scratches) {
        let tot = s[s.length-1];

        if (tot === 0.0) {
          continue;
        }

        tot = 1.0 / tot;

        //for (let i=0; i<s.length-1; i++) {
          //s[i] *= tot;
        //}
      }

      for (let con of this.cons) {
        let klst = con.klst;
        let glst2 = con.glst2;
        let slst = con.slst;
        let flst = con.flst;

        for (let i=0; i<klst.length; i++) {
          let gs2 = glst2[i];
          let scratch = slst[i];
          let force = flst[i];

          for (let j=0; j<gs2.length; j++) {
            if (doprint2 && con === this.cons[0]) {
              let err2 = Math.abs(scratch[j] - force[j]);
              console.log("  err2", err2.toFixed(4));
            }

            force[j] = (scratch[j] - force[j])*0.5;
          }
        }
      }
    }

    for (let con of this.cons) {
      let klst = con.klst;
      let klst2 = con.klst2;
      let vlst = con.vlst;
      let glst2 = con.glst2;
      let glst = con.glst;
      let hlst = con.hlst;
      let flst = con.flst;
      let wlst = con.wlst;

      for (let i=0; i<klst.length; i++) {
        let ks = klst[i];
        let ks2 = klst2[i];
        let vel = vlst[i];
        let gs2 = glst2[i];
        let gs = glst[i];
        let hs = hlst[i];
        let fs = flst[i];
        let w = wlst[i];

        ks.set(ks2);

        for (let j=0; j<ks.length; j++) {
          vel[j] += fs[j]*k;
          ks[j] += vel[j]*k;

          if (Math.random() > 0.99999) {
            console.log("v", vel);
          }
        }
      }
    }

    return err;
  }

  solve(steps=1, gk=1.0) {
    let err = 0.0;

    for (let i=0; i<steps; i++) {
      err = this.solve_intern(gk);

      if (util.time_ms() - this.last_print_time > 400) {
        console.log("err", err.toFixed(3));
        this.last_print_time = util.time_ms();
      }
    }

    return err;
  }
}
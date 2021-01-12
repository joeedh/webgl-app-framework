import {Vector2, Vector3, Vector4, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {MeshTypes, MeshFlags} from './mesh_base.js';

export const LogTypes = {
  VERTEX   : 1,
  EDGE     : 2,
  FACE     : 8,
  GEOM_MASK: 1 | 2 | 4 | 8,
  ADD      : 512,
  REMOVE   : 1024
}

let _temphash = new util.HashDigest();

export const VertLayout = {
  FLAG : 0,
  INDEX: 1,
  X    : 2,
  Y    : 3,
  Z    : 4,
  NX   : 5,
  NY   : 6,
  NZ   : 7
};
export const LoopLayout = {
  FLAG : 0,
  INDEX: 1,
  V    : 2,
  E    : 3,
  F    : 4
};
export const EdgeLayout = {
  FLAG : 0,
  INDEX: 1,
  V1   : 2,
  V2   : 3
};

export class LogEntry {
  constructor(type, eid, customData) {
    this.type = type;
    this.cancel = false;
    this.eid = eid;
    this.customData = customData;
    this.data = [];
    this.parent = undefined;
  }

  calcMemSize() {
    let tot = 8 * 4;

    for (let cd of this.customData) {
      tot += cd.calcMemSize();
    }

    tot += this.data.length*8;
    return tot + 32;
  }

  static newEntry(elem, subtype = 0) {
    let cd2 = [];

    for (let cd of elem.customData) {
      cd2.push(cd.copy());
    }

    let ret = new LogEntry(elem.type | subtype, elem.eid, cd2);

    ret.data.push(elem.flag);
    ret.data.push(elem.index);

    switch (elem.type) {
      case MeshTypes.VERTEX:
        ret.data.push(elem[0]);
        ret.data.push(elem[1]);
        ret.data.push(elem[2]);
        ret.data.push(elem.no[0]);
        ret.data.push(elem.no[1]);
        ret.data.push(elem.no[2]);
        break;
      case MeshTypes.EDGE:
        ret.data.push(elem.v1.eid);
        ret.data.push(elem.v2.eid);
        break;
      case MeshTypes.LOOP:
        ret.data.push(elem.v.eid);
        ret.data.push(elem.e.eid);
        ret.data.push(elem.f.eid);
        break;
      case MeshTypes.FACE:
        ret.data.push(elem.lists.length);
        for (let list of elem.lists) {
          ret.data.push(list.length);
          for (let l of list) {
            ret.data.push(l.eid);
            ret.data.push(l.v.eid);
            ret.data.push(l.e.eid);
          }
        }

        break;
    }

    return ret;
  }
}

export class MeshLog {
  constructor() {
    this.log = [];

    this.startEid = -1;
    this.eidmap = {};
  }

  logVertex(v, subtype = 0) {
    let le = LogEntry.newEntry(v, subtype);
    this._logAdd(le);
    return le;
  }

  logEdge(e, subtype = 0) {
    let le = LogEntry.newEntry(e, subtype);
    this._logAdd(le);
    return le;
  }

  logLoop(l, subtype = 0) {
    let le = LogEntry.newEntry(l, subtype);
    this._logAdd(le);
    return le;
  }

  calcMemSize() {
    let tot = 0;

    for (let item of this.log) {
      tot += item.calcMemSize();
    }

    for (let k in this.eidmap) {
      tot += 8;
    }

    return tot + 256;
  }

  _logAdd(le, eid=le.eid) {
    if (this.eidmap[eid]) {
      le.parent = this.eidmap[eid];
    }
    this.eidmap[eid] = le;
    this.log.push(le);
  }

  logFace(f, subtype = 0) {
    let le = LogEntry.newEntry(f, subtype);
    this._logAdd(le);
    return le;
  }

  cancelEntry(le) {
    if (le.cancel) {
      return; //already canceled
    }

    if (le.parent) {
      this.eidmap[le.eid] = le.parent;
    } else {
      delete this.eidmap[le.eid];
    }

    le.cancel = true;
  }

  ensure(elem) {
    if (!(elem.eid in this.eidmap)) {
      return this.logElem(elem);
    }

    return undefined;
  }

  logElem(elem) {
    switch (elem.type) {
      case MeshTypes.VERTEX:
        return this.logVertex(elem);
      case MeshTypes.EDGE:
        return this.logEdge(elem);
      case MeshTypes.LOOP:
        return this.logLoop(elem);
      case MeshTypes.FACE:
        return this.logFace(elem);
    }
  }

  start(mesh) {
    this.startEid = mesh.eidgen._cur;
  }

  reset() {
    this.startEid = -1;
    this.log.length = 0;
    this.eidmap = {};

    return this;
  }

  checkStart(mesh) {
    if (this.startEid < 0) {
      this.start(mesh);
      return true;
    }

    return false;
  }

  logKillVertex(v) {
    for (let e of v.edges) {
      this.ensure(e);
    }

    for (let f of v.faces) {
      this.ensure(f);
    }

    return this.logVertex(v, LogTypes.REMOVE);
  }

  logKill(elem) {
    switch (elem.type) {
      case MeshTypes.VERTEX:
        return this.logKillVertex(elem);
      case MeshTypes.EDGE:
        return this.logKillEdge(elem);
      case MeshTypes.FACE:
        return this.logKillFace(elem);
    }

    console.warn(elem);
    throw new Error("invalid element " + elem);
  }

  logAdd(elem) {
    switch (elem.type) {
      case MeshTypes.VERTEX:
        return this.logAddVertex(elem);
      case MeshTypes.EDGE:
        return this.logAddEdge(elem);
      case MeshTypes.FACE:
        return this.logAddFace(elem);
    }

    console.warn(elem);
    throw new Error("invalid element " + elem);
  }

  logKillEdge(e) {
    for (let f of e.faces) {
      this.ensure(f);
    }

    return this.logEdge(e, LogTypes.REMOVE);
  }

  logKillFace(f) {
    return this.logFace(f, LogTypes.REMOVE);
  }

  logAddVertex(v) {
    return this.logVertex(v, LogTypes.ADD);
  }

  logAddEdge(e) {
    this.ensure(e.v1);
    this.ensure(e.v2);

    return this.logEdge(e, LogTypes.ADD);
  }

  logAddFace(f) {
    for (let l of f.loops) {
      this.ensure(l.v);
      this.ensure(l.e);
      this.ensure(l);
    }

    return this.logFace(f, LogTypes.ADD);
  }

  undo(mesh, onnew, ondel) {
    //console.log("Log undo!");

    let finalfaces = new Set();

    let loadCustomData = (le, elem) => {
      let mask = 0;

      for (let j=0; j<le.customData.length; j++) {
        let cd1 = le.customData[j];
        let cd2;

        for (let k=0; k<elem.customData.length; k++) {
          let cd3 = elem.customData[k];

          let bad = mask & (1<<k);
          bad = bad || cd1.constructor !== cd3.constructor;

          if (bad) {
            continue;
          }

          mask |= 1<<k;
          cd2 = cd3;
          break;
        }

        if (!cd2) {
          console.warn("Missing customdata layer");
          continue;
        }

        cd1.copyTo(cd2);
      }
    }

    let loadElem = (le, elem) => {
      loadCustomData(le, elem);

      let data = le.data;

      if (data[0] & MeshFlags.SELECT) {
        mesh.setSelect(elem, true);
      } else {
        mesh.setSelect(elem, false);
      }

      elem.flag = data[0];
      elem.index = data[1];

      switch (elem.type) {
        case MeshTypes.VERTEX:
          elem[0] = data[2];
          elem[1] = data[3];
          elem[2] = data[4];

          elem.no[0] = data[5];
          elem.no[1] = data[6];
          elem.no[2] = data[7];
          break;
      }
    }

    for (let i = this.log.length - 1; i >= 0; i--) {
      let le = this.log[i];
      let subtype = le.type & ~LogTypes.GEOM_MASK;
      let elem;

      if (le.cancel) {
        continue;
      }

      //console.log(le.type & LogTypes.GEOM_MASK, subtype, le);

      if (subtype === LogTypes.ADD) {
        elem = mesh.eidmap[le.eid];

        if (!elem) {
          //console.log(le.type & LogTypes.GEOM_MASK, le);
          //console.warn("Invalid Element " + le.eid);
          continue;
          throw new Error("invalid element " + le.eid);
        }

        //console.log("Killing element", elem);

        if (ondel && elem.type === MeshTypes.FACE) {
          ondel(elem);
          //finalfaces.add(elem);
        }

        mesh.killElem(elem);
        continue;
      } else if (subtype === LogTypes.REMOVE) {
        let data = le.data;

        switch (le.type & LogTypes.GEOM_MASK) {
          case MeshTypes.VERTEX:
            elem = mesh.makeVertex(undefined, le.eid);

            if (data[0] & MeshFlags.SELECT) {
              mesh.setSelect(elem, true);
            }

            //console.log("VERT", elem.eid, le.eid);

            elem.flag = data[0];
            elem.index = data[1];

            elem[0] = data[2];
            elem[1] = data[3];
            elem[2] = data[4];
            elem.no[0] = data[5];
            elem.no[1] = data[6];
            elem.no[2] = data[7];
            break;
          case MeshTypes.EDGE:
            let v1 = mesh.eidmap[data[2]];
            let v2 = mesh.eidmap[data[3]];

            elem = mesh.makeEdge(v1, v2, undefined, le.eid);
            //console.log("EDGE", elem.eid, le.eid);

            if (data[0] & MeshFlags.SELECT) {
              mesh.setSelect(elem, true);
            }

            elem.flag = data[0];
            elem.index = data[1];

            break;
          case MeshTypes.LOOP: //ignore
            break;
          case MeshTypes.FACE:
            let j = 2;

            let totlist = data[j++];
            for (let il=0; il<totlist; il++) {
              let totloop = data[j++];
              let vs = [];
              let es = [];
              let ls = [];

              for (let k=0; k<totloop; k++) {
                let leid = data[j++];
                let veid = data[j++];
                let eeid = data[j++];

                vs.push(mesh.eidmap[veid]);
                ls.push(leid);
              }

              if (il === 0) {
                elem = mesh.makeFace(vs, le.eid, ls);

                finalfaces.add(elem);

                //console.log("FACE", elem.eid, le.eid);

                if (data[0] & MeshFlags.SELECT) {
                  mesh.setSelect(elem, true);
                }

                elem.flag = data[0];
                elem.index = data[1];
              } else {
                mesh.makeHole(elem, vs, ls);
              }
            }

            //load loop customdata
            for (let l of elem.loops) {
              let le2 = this.eidmap[l.eid];
              if (le2) {
                loadCustomData(le2, l);
              }
            }

            break;
        }

        if (!(le.type & MeshTypes.LOOP)) {
          loadCustomData(le, elem);
        }
      } else {
        //load customdata
        elem = mesh.eidmap[le.eid];

        if (elem) { //elem can be undefined, like for loops
          elem.flag = le.data[0];
          elem.index = le.data[1];

          loadElem(le, elem);
        }
      }
    }

    //console.log("finalfaces", finalfaces);
    if (onnew || ondel) {
      for (let f of finalfaces) {
        if (f.eid >= 0) {
          if (onnew) {
            onnew(f);
          }
        }
      }
    }

    //destroy any remaining geometry
    let eid = mesh.eidgen._cur;
    let start = this.startEid;

    //console.log("START", start, "END", eid);

  }
}

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

let LTYPE=0, LCANCEL=1, LEID=2, LPARENT=3, LTOTCD=4, LTOTDATA=5, LTOT=6;
let CTYPE=0, CLEN=1, CTOT=2;

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

export class CustomDataList extends Array {
  constructor(list) {
    super();

    this.list = list;
  }

  loadSTRUCT(reader) {
    reader(this);
  }
}
CustomDataList.STRUCT = `
mesh_log.CustomDataList {
  list : array(abstract(mesh.CustomDataElem));
}
`;
nstructjs.register(CustomDataList);

let _cdtmp = new CustomDataList();
let _cdReadMem = new Uint8Array(1024*1024*4);
let _cdReadView = new DataView(_cdReadMem.buffer);

const disableLog = false;

export class MeshLog {
  constructor() {
    this.log = [];
    this.logstarts = [];

    this.startEid = -1;
    this.eidmap = {};
  }

  _newEntry(elem, subtype) {
    let log = this.log;

    let li = this.log.length;
    this.logstarts.push(li);

    log.length += LTOT;

    let cdlist = _cdtmp;
    cdlist.list = elem.customData;

    nstructjs.writeObject(log, cdlist);

    log[li+LTOTCD] = log.length - li - LTOT;

    log[li+LTYPE] = elem.type | subtype;
    log[li+LCANCEL] = false;
    log[li+LEID] = elem.eid;

    let i = log.length;

    //let ret = new LogEntry(elem.type | subtype, elem.eid, cd2);
    log.push(elem.flag);
    log.push(elem.index);

    switch (elem.type) {
      case MeshTypes.VERTEX:
        log.push(elem[0]);
        log.push(elem[1]);
        log.push(elem[2]);
        log.push(elem.no[0]);
        log.push(elem.no[1]);
        log.push(elem.no[2]);
        break;
      case MeshTypes.EDGE:
        log.push(elem.v1.eid);
        log.push(elem.v2.eid);
        break;
      case MeshTypes.LOOP:
        log.push(elem.v.eid);
        log.push(elem.e.eid);
        log.push(elem.f.eid);
        break;
      case MeshTypes.FACE:
        log.push(elem.lists.length);

        for (let list of elem.lists) {
          log.push(list.length);

          for (let l of list) {
            log.push(l.eid);
            log.push(l.v.eid);
            log.push(l.e.eid);
          }
        }

        break;
    }

    log[li+LTOTDATA] = log.length - i;

    return li;
  }

  logVertex(v, subtype = 0) {
    if (disableLog) return;

    let li = this._newEntry(v, subtype);
    this._logAdd(li);
    return li;
  }

  logEdge(e, subtype = 0) {
    if (disableLog) return;

    let li = this._newEntry(e, subtype);
    this._logAdd(li);
    return li;
  }

  logLoop(l, subtype = 0) {
    if (disableLog) return;

    let li = this._newEntry(l, subtype);
    this._logAdd(li);
    return li;
  }

  calcMemSize() {
    if (disableLog) return 0;

    let tot = 0;

    tot += this.log.length*8;
    tot += this.logstarts.length*8;

    //for (let item of this.log) {
    //  tot += item.calcMemSize();
    //}

    for (let k in this.eidmap) {
      tot += 8;
    }

    return tot + 256;
  }

  _logAdd(li, eid=undefined) {
    let log = this.log;

    if (eid === undefined) {
      eid = log[li+LEID];
    }

    log[li+LPARENT] = this.eidmap[eid];
    this.eidmap[eid] = li;
  }

  logFace(f, subtype = 0) {
    if (disableLog) return;

    let li = this._newEntry(f, subtype);
    this._logAdd(li);
    return li;
  }

  cancelEntry(li) {
    if (disableLog) return;

    let log = this.log;

    if (log[li+LCANCEL]) {
      return; //already canceled
    }

    let parent = log[li+LPARENT];
    let eid = log[li+LEID];

    if (parent) {
      this.eidmap[eid] = parent;
    } else {
      delete this.eidmap[eid];
    }

    log[li+LCANCEL] = true;
  }

  ensure(elem) {
    if (disableLog) return;

    if (!(elem.eid in this.eidmap)) {
      return this.logElem(elem);
    }

    return undefined;
  }

  logElem(elem) {
    if (disableLog) return;

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
    if (disableLog) return;

    this.startEid = -1;
    this.log.length = 0;
    this.eidmap = {};

    return this;
  }

  checkStart(mesh) {
    if (disableLog) return;

    if (this.startEid < 0) {
      this.start(mesh);
      return true;
    }

    return false;
  }

  logKillVertex(v) {
    if (disableLog) return;

    for (let e of v.edges) {
      this.ensure(e);
    }

    for (let f of v.faces) {
      this.ensure(f);
    }

    return this.logVertex(v, LogTypes.REMOVE);
  }

  logKill(elem) {
    if (disableLog) return;

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
    if (disableLog) return;

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
    if (disableLog) return;

    for (let f of e.faces) {
      this.ensure(f);
    }

    return this.logEdge(e, LogTypes.REMOVE);
  }

  logKillFace(f) {
    if (disableLog) return;

    return this.logFace(f, LogTypes.REMOVE);
  }

  logAddVertex(v) {
    if (disableLog) return;

    return this.logVertex(v, LogTypes.ADD);
  }

  logAddEdge(e) {
    if (disableLog) return;

    this.ensure(e.v1);
    this.ensure(e.v2);

    return this.logEdge(e, LogTypes.ADD);
  }

  logAddFace(f) {
    if (disableLog) return;

    for (let l of f.loops) {
      this.ensure(l.v);
      this.ensure(l.e);
      this.ensure(l);
    }

    return this.logFace(f, LogTypes.ADD);
  }

  undo(mesh, onnew, ondel) {
    if (disableLog) return;

    //console.log("Log undo!");

    let finalfaces = new Set();
    let log = this.log, logstarts = this.logstarts;

    let loadCustomData = (li, elem, cdidx, cdlen) => {
      let mask = 0;

      let mem = _cdReadMem;
      for (let i=0; i<cdlen; i++) {
        mem[i] = log[cdidx+i];
      }

      let customData = nstructjs.readObject(_cdReadView, CustomDataList).list;

      for (let j=0; j<customData.length; j++) {
        let cd1 = customData[j];
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

    let loadElem = (li, elem) => {
      let cdidx = li + LTOT;
      let cdlen = log[li+LTOTCD];

      loadCustomData(li, elem, cdidx, cdlen);

      let i = li + LTOT + cdlen;

      if (log[i] & MeshFlags.SELECT) {
        mesh.setSelect(elem, true);
      } else {
        mesh.setSelect(elem, false);
      }

      elem.flag = log[i++];
      elem.index = log[i++];

      switch (elem.type) {
        case MeshTypes.VERTEX:
          elem[0] = log[i++];
          elem[1] = log[i++];
          elem[2] = log[i++];

          elem.no[0] = log[i++];
          elem.no[1] = log[i++];
          elem.no[2] = log[i++];
          break;
      }
    }

    for (let i=logstarts.length-1; i >= 0; i--) {
      let li = logstarts[i];
      let type = log[li+LTYPE];
      let eid = log[li+LEID];
      let data_start = li + LTOT + log[li+LTOTCD];

      let subtype = type & ~LogTypes.GEOM_MASK;
      let elem;

      if (log[li+LCANCEL]) {
        continue;
      }

      //console.log(le.type & LogTypes.GEOM_MASK, subtype, le);
      let di = data_start;

      if (subtype === LogTypes.ADD) {
        elem = mesh.eidmap[eid];

        if (!elem) {
          //console.log(le.type & LogTypes.GEOM_MASK, le);
          //console.warn("Invalid Element " + le.eid);
          continue;
          throw new Error("invalid element " + eid);
        }

        //console.log("Killing element", elem);

        if (ondel && elem.type === MeshTypes.FACE) {
          ondel(elem);
          //finalfaces.add(elem);
        }

        mesh.killElem(elem);
        continue;
      } else if (subtype === LogTypes.REMOVE) {
        switch (type & LogTypes.GEOM_MASK) {
          case MeshTypes.VERTEX:
            if (eid in mesh.eidmap) {
              elem = mesh.eidmap[eid];
              if (elem.type !== MeshTypes.VERTEX) {
                console.log(elem.eid, elem);
                throw new Error("Mesh undo log corruption");
              }
            } else {
              elem = mesh.makeVertex(undefined, eid);
            }

            if (log[di] & MeshFlags.SELECT) {
              mesh.setSelect(elem, true);
            }

            //console.log("VERT", elem.eid, le.eid);

            elem.flag = log[di++];
            elem.index = log[di++];

            elem[0] = log[di++];
            elem[1] = log[di++];
            elem[2] = log[di++];
            elem.no[0] = log[di++];
            elem.no[1] = log[di++];
            elem.no[2] = log[di++];
            break;
          case MeshTypes.EDGE:
            let v1 = mesh.eidmap[log[di+2]];
            let v2 = mesh.eidmap[log[di+3]];

            elem = mesh.makeEdge(v1, v2, true, eid);
            //console.log("EDGE", elem.eid, le.eid);

            if (log[di] & MeshFlags.SELECT) {
              mesh.setSelect(elem, true);
            }

            elem.flag = log[di];
            elem.index = log[di+1];

            break;
          case MeshTypes.LOOP: //ignore
            break;
          case MeshTypes.FACE:
            let j = di + 2;

            let totlist = log[j++];
            for (let il=0; il<totlist; il++) {
              let totloop = log[j++];
              let vs = [];
              let es = [];
              let ls = [];

              for (let k=0; k<totloop; k++) {
                let leid = log[j++];
                let veid = log[j++];
                let eeid = log[j++];

                vs.push(mesh.eidmap[veid]);
                ls.push(leid);
              }

              if (il === 0) {
                elem = mesh.makeFace(vs, eid, ls);

                finalfaces.add(elem);

                //console.log("FACE", elem.eid, le.eid);

                if (log[di] & MeshFlags.SELECT) {
                  mesh.setSelect(elem, true);
                }

                elem.flag = log[di];
                elem.index = log[di+1];
              } else {
                mesh.makeHole(elem, vs, ls);
              }
            }

            //load loop customdata
            for (let l of elem.loops) {
              let li2 = this.eidmap[l.eid];

              if (li2) {
                let cdlen = log[li2+LTOTCD];
                let cdidx = li2 + LTOT;

                loadCustomData(li2, l, cdidx, cdlen);
              }
            }

            break;
        }

        if (!(type & MeshTypes.LOOP)) {
          let cdidx = li + LTOT;
          let cdlen = log[li+LTOTCD];

          loadCustomData(li, elem, cdidx, cdlen);
        }
      } else {
        //load customdata
        elem = mesh.eidmap[eid];

        if (elem) { //elem can be undefined, like for loops
          loadElem(li, elem);
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

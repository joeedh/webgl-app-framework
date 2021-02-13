import {Vector2, Vector3, Vector4, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {MeshTypes, MeshFlags, LogTags} from './mesh_base.js';
import {Face} from './mesh_types.js';

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

let LTYPE=0, LCANCEL=1, LEID=2, LPARENT=3, LTAG=4, LTOTCD=5, LTOTDATA=6, LTOT=7;

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
    this.eidMap = new Map();
  }

  _newEntry(elem, subtype, tag) {
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
    log[li+LEID] = elem._old_eid;
    log[li+LTAG] = tag;

    let i = log.length;

    //let ret = new LogEntry(elem.type | subtype, elem._old_eid, cd2);
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
        log.push(elem.v1._old_eid);
        log.push(elem.v2._old_eid);
        break;
      case MeshTypes.LOOP:
        log.push(elem.v._old_eid);
        log.push(elem.e._old_eid);
        log.push(elem.f._old_eid);
        break;
      case MeshTypes.FACE:
        log.push(elem.lists.length);

        for (let list of elem.lists) {
          log.push(list.length);

          for (let l of list) {
            log.push(l._old_eid);
            log.push(l.v._old_eid);
            log.push(l.e._old_eid);
          }
        }

        break;
    }

    log[li+LTOTDATA] = log.length - i;

    return li;
  }

  logVertex(v, subtype = 0, tag=0) {
    if (disableLog) return;

    let eid = v ? v._old_eid : undefined;

    let li = this._newEntry(v, subtype, tag);
    this._logAdd(li, eid, tag);
    return li;
  }

  logEdge(e, subtype = 0, tag=0) {
    if (disableLog) return;

    let eid = e ? e._old_eid : undefined;

    let li = this._newEntry(e, subtype, tag);
    this._logAdd(li, eid, tag);
    return li;
  }

  logLoop(l, subtype = 0, tag=0) {
    if (disableLog) return;

    let eid = l ? l._old_eid : undefined;

    let li = this._newEntry(l, subtype, tag);
    this._logAdd(li, eid, tag);
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

    for (let k in this.eidMap.keys()) {
      tot += 8;
    }

    return tot + 256;
  }

  _logAdd(li, eid=undefined, tag=0) {
    if (eid < 0) {
      throw new Error("_logAdd: eid was < 0");
    }

    let log = this.log;

    if (eid === undefined) {
      eid = log[li+LEID];
    }

    log[li+LPARENT] = this.eidMap.get(eid);
    log[li+LTAG] = tag;

    this.eidMap.set(eid, li);
  }

  logFace(f, subtype = 0, tag=0) {
    if (f.eid < 0) {
      throw new Error("_logAdd: eid was < 0");
    }

    let eid = f ? f._old_eid : undefined;

    if (disableLog) return;

    let li = this._newEntry(f, subtype, tag);
    this._logAdd(li, eid, tag=0);
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
      this.eidMap.set(eid, parent);
    } else {
      this.eidMap.delete(eid);
    }

    log[li+LCANCEL] = true;
  }

  ensure(elem, tag) {
    if (disableLog) return;

    if (!this.eidMap.has(elem._old_eid)) {
      return this.logElem(elem, tag);
    }

    return undefined;
  }

  logElem(elem, tag) {
    if (disableLog) return;

    switch (elem.type) {
      case MeshTypes.VERTEX:
        return this.logVertex(elem, undefined, tag);
      case MeshTypes.EDGE:
        return this.logEdge(elem, undefined, tag);
      case MeshTypes.LOOP:
        return this.logLoop(elem, undefined, tag);
      case MeshTypes.FACE:
        return this.logFace(elem, undefined, tag);
    }
  }

  start(mesh) {
    this.startEid = mesh.eidgen._cur;
  }

  reset() {
    if (disableLog) return;

    this.startEid = -1;
    this.log.length = 0;
    this.eidMap = new Map();

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

  logKillVertex(v, tag) {
    if (disableLog) return;

    for (let e of v.edges) {
      this.ensure(e, tag);
    }

    for (let f of v.faces) {
      this.ensure(f, tag);
    }

    return this.logVertex(v, LogTypes.REMOVE, tag);
  }

  logKill(elem, tag) {
    if (disableLog) return;

    switch (elem.type) {
      case MeshTypes.VERTEX:
        return this.logKillVertex(elem, tag);
      case MeshTypes.EDGE:
        return this.logKillEdge(elem, tag);
      case MeshTypes.FACE:
        return this.logKillFace(elem, tag);
    }

    console.warn(elem);
    throw new Error("invalid element " + elem);
  }

  logAdd(elem, tag) {
    if (disableLog) return;

    switch (elem.type) {
      case MeshTypes.VERTEX:
        return this.logAddVertex(elem, tag);
      case MeshTypes.EDGE:
        return this.logAddEdge(elem, tag);
      case MeshTypes.FACE:
        return this.logAddFace(elem, tag);
    }

    console.warn(elem);
    throw new Error("invalid element " + elem);
  }

  logKillEdge(e, tag) {
    if (disableLog) return;

    this.ensure(e.v1, tag);
    this.ensure(e.v2, tag);

    for (let l of e.loops) {
      this.ensure(l.f, tag);
    }

    return this.logEdge(e, LogTypes.REMOVE, tag);
  }

  logKillFace(f, tag) {
    if (disableLog) return;

    for (let l of f.loops) {
      this.ensure(l.v, tag);
      this.ensure(l.e, tag);
    }

    return this.logFace(f, LogTypes.REMOVE, tag);
  }

  logAddVertex(v, tag) {
    if (disableLog) return;

    return this.logVertex(v, LogTypes.ADD, tag);
  }

  logAddEdge(e, tag) {
    if (disableLog) return;

    this.ensure(e.v1);
    this.ensure(e.v2);

    return this.logEdge(e, LogTypes.ADD, tag);
  }

  logAddFace(f, tag) {
    if (disableLog) return;

    for (let l of f.loops) {
      this.ensure(l.v);
      this.ensure(l.e);
      this.ensure(l);
    }

    return this.logFace(f, LogTypes.ADD, tag);
  }

  printLog(start=0) {
    let log = this.log;
    let map = {};
    for (let k in LogTags) {
      map[LogTags[k]] = k;
    }

    let ret = [];

    for (let li of this.logstarts.slice(start, this.logstarts.length)) {
      let k;

      let etype = (log[li+LTYPE] & 15);
      let eid = log[li+LEID];

      if (log[li+LTYPE] & LogTypes.ADD) {
        k = "A" + etype + " " + eid;
      } else if (log[li+LTYPE] & LogTypes.REMOVE) {
        k = "R" + etype + " " + eid;
      } else {
        k = "u" + etype + " " + eid;
      }

      ret.push(map[log[li+LTAG]]);
      ret.push(k);
    }

    return ret;
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

    let lasttag, lasttag_i;
    function gettag(i) {
      while (i >= 0) {
        let tag = logstarts[i];
        tag = log[tag + LTAG];

        if (tag) {
          return tag;
        }
        i--;
      }
    }

    for (let i=logstarts.length-1; i >= 0; i--) {
      let li = logstarts[i];
      let type = log[li+LTYPE];
      let eid = log[li+LEID];
      let data_start = li + LTOT + log[li+LTOTCD];
      let tag = log[li+LTAG];
      let gtag = gettag;

      if (tag) {
        lasttag = tag;
        lasttag_i = i;
      }

      let subtype = type & ~LogTypes.GEOM_MASK;
      let elem;

      if (log[li+LCANCEL]) {
        continue;
      }

      //console.log(le.type & LogTypes.GEOM_MASK, subtype, le);
      let di = data_start;

      if (subtype === LogTypes.ADD) {
        elem = mesh.eidMap.get(eid);

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

        if (elem.eid < 0) {
          console.log(tag, gtag(i), lasttag, lasttag_i);
          throw new Error("elem already freed");
        }

        mesh.killElem(elem);
        continue;
      } else if (subtype === LogTypes.REMOVE) {
        switch (type & LogTypes.GEOM_MASK) {
          case MeshTypes.VERTEX:
            if (mesh.eidMap.has(eid)) {
              elem = mesh.eidMap.get(eid);
              
              if (elem.type !== MeshTypes.VERTEX) {
                console.log(elem._old_eid, elem);
                throw new Error("Mesh undo log corruption");
              }
            } else {
              elem = mesh.makeVertex(undefined, eid);
            }

            if (log[di] & MeshFlags.SELECT) {
              mesh.setSelect(elem, true);
            }

            //console.log("VERT", elem._old_eid, le._old_eid);

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
            let v1 = mesh.eidMap.get(log[di+2]);
            let v2 = mesh.eidMap.get(log[di+3]);

            if (!v1 || !v2 || v1 === v2) {
              console.warn("Undo log corruption", v1, v2);
              continue;
            }

            try {
              elem = mesh.makeEdge(v1, v2, true, eid);
            } catch (error) {
              console.log("Tag:", tag, lasttag, gettag(i), "lasttag_i", lasttag_i);
              throw error;
            }

            //console.log("EDGE", elem._old_eid, le._old_eid);

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

            let bad = false;

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

                let v = mesh.eidMap.get(veid);
                if (!v) {
                  console.warn("Undo log corruption", veid);
                  bad = true;
                  break;
                }

                vs.push(v);
                ls.push(leid);
              }

              if (bad) {
                break;
              }

              if (il === 0) {
                elem = mesh.eidMap.get(eid);
                if (elem === undefined || !(elem instanceof Face)) {
                  try {
                    elem = mesh.makeFace(vs, eid, ls);
                  } catch (error) {
                    console.log("Tag:", tag, lasttag, gettag(i), "lasttag_i", lasttag_i);
                    throw error;
                    //bad = true;
                    //continue;
                  }
                }

                finalfaces.add(elem);

                //console.log("FACE", elem._old_eid, le._old_eid);

                if (log[di] & MeshFlags.SELECT) {
                  mesh.setSelect(elem, true);
                }

                elem.flag = log[di];
                elem.index = log[di+1];
              } else {
                mesh.makeHole(elem, vs, ls);
              }
            }

            if (bad) {
              continue;
            }

            //load loop customdata
            for (let l of elem.loops) {
              let li2 = this.eidMap.get(l._old_eid);

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
        elem = mesh.eidMap.get(eid);

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

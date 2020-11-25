import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js';

import {MeshFlags, MeshTypes} from "./mesh_base.js";
import {CustomData, CustomDataElem} from "./customdata.js";
import {nstructjs} from '../path.ux/scripts/pathux.js';
import {ChunkedSimpleMesh} from "../core/simplemesh.js";

/*
okay, so turned out my idea of having grids
overlap on two edges is problematic, as it requires
non-quads for joining corners on extroidinary vertices
*/
let interptemp1 = [];

const IDX=-1, IDXINV=-2;

export const NeighborKeys = {
  L   : 1, //loop
  LP  : 2, //loop.prev
  LN  : 4, //loop.next
  LR  : 8, //loop.radial_next
  LRP : 16, //loop.radial_next.prev
  LRN : 32, //loop.radial_next.prev
  LPR : 64, //loop.prev.radial_next
  LNR : 128, //loop.next.radial_next
};

export class ResolveValue {
  constructor() {
    this.x1 = 0;
    this.y1 = 0;
    this.x2 = 0;
    this.y2 = 0;
  }
}

let resolve_rets = util.cachering.fromConstructor(ResolveValue, 512);

export class NeighborMap {
  constructor(dimen) {
    this.dimen = dimen;

    let masks = {
      l  : 1,
      lp : 2,
      ln : 4,
      lr : 8,
      lrp : 16,
      lrn : 32,
      lpr : 64,
      lnr : 128
    };

    function lmask(a, b) {
      return masks[a] | masks[b];
    }
/*
    let maps = {
//      [bitmask, [
  //        [x1, y1], l1.v==l2.v([x2, y2]), l1.v!=l2.v([x2, y2])
    //    ]
      //]

      [lmask("l", "lp")] : [[IDX, dimen-1], [undefined,undefined], [0, IDXINV]],
      [lmask("l", "ln")] : [[0, IDX], [undefined,undefined], [IDXINV, dimen-1]],
      [lmask("l", "lrn")] : [[IDX, 0], [dimen-1, IDXINV], [undefined, IDX]],
      [lmask("l", "lpr")] : [[dimen-1, IDX], [IDXINV, 0], [undefined, IDX]],
    }

    let cases = [
      {mask : lmask("l", "lp"), l1 : masks.l, l2 : masks.lp},
      {mask : lmask("l", "ln"), l1 : masks.l, l2 : masks.ln},
      {mask : lmask("l", "lrn"),  l1 : masks.l, l2 : masks.lrn},
      {mask : lmask("l", "lpr"),  l1 : masks.l, l2 : masks.lpr},
    ];
*/

    let maps = {
      /*
      [bitmask, [
          [x1, y1], l1.v==l2.v([x2, y2]), l1.v!=l2.v([x2, y2])
        ]
      ]

      */

      [lmask("l", "lp")] : [[0, IDX], [undefined,undefined], [IDX, 0]],
      [lmask("l", "lpr")] : [[IDX, dimen-1], [dimen-1, IDX], [undefined, IDX]],
    }

    let cases = [
      {mask : lmask("l", "lp"), l1 : masks.l, l2 : masks.lp},
      {mask : lmask("l", "lpr"),  l1 : masks.l, l2 : masks.lpr},
    ];

    this.maps = maps;
    this.cases = cases;
  }

  getmap(f, i) {
    if (f === IDX) {
      return i;
    } else if (f === IDXINV) {
      return this.dimen-1-i;
    } else {
      return f;
    }
  }

  resolve(i1, l1, l2, l1mask, l2mask, i2=i1) {
    let mask = l1mask | l2mask;
    let dimen = this.dimen;

    let map = this.maps[mask];
    let x1, y1, x2, y2;

    x1 = this.getmap(map[0][0], i1);
    y1 = this.getmap(map[0][1], i1);

    if (l1.v === l2.v) {
      //i2 = Math.max(i2-1, 0);
      x2 = this.getmap(map[1][0], i2);
      y2 = this.getmap(map[1][1], i2);
    } else {
      x2 = this.getmap(map[2][0], i2);
      y2 = this.getmap(map[2][1], i2);
    }

    let ret = resolve_rets.next();

    ret.x1 = x1;
    ret.y1 = y1;
    ret.x2 = x2;
    ret.y2 = y2;

    return ret;
  }
}

let maps = {};
export function getNeighborMap(dimen) {
  if (!(dimen in maps)) {
    maps[dimen] = new NeighborMap(dimen);
  }

  return maps[dimen];
}

export class GridVert extends Vector3 {
  constructor(index=0, loopEid) {
    super();

    this.no = new Vector3();
    this.flag = 0;
    this.index = index;
    this.loopEid = loopEid;
    this.customData = [];
    this.neighbors = []; //is not saved

    this.bLink = undefined;
    this.bNext = this.bPrev = undefined; //boundary next/prev
  }

  load(b, coOnly=false) {
    if (!b) {
      return;
    }

    super.load(b);

    if (!coOnly && b instanceof GridVert) {
      b.no.load(this.no);
      b.flag = this.flag;
    }

    return this;
  }
}
GridVert.STRUCT = nstructjs.inherit(GridVert, Vector3, "mesh.GridVert") + `
  no         : vec3;
  flag       : int;
  index      : int; 
}`;
nstructjs.register(GridVert);

export function genGridDimens(depth= 16) {
  let dimen = 2;
  let ret = [0];

  for (let i=0; i<depth; i++) {
    dimen = (dimen-1)*2 + 1;
    ret.push(dimen);
  }

  return ret;
}

export const gridSides = genGridDimens();

export class GridBase extends CustomDataElem {
  constructor() {
    super();

    this.cdmap = new Array(32);
    this.cdmap_reverse = new Array(32);
    this._max_cd_i = 0;

    this.dimen = 0;
    this.points = [];
    this.customDatas = [];
  }

  static syncVertexLayers(mesh) {
    if (this.meshGridOffset(mesh) < 0) {
      return; //no grid data
    }

    let validtypes = new Set(["normal", "color"]);

    for (let layer of mesh.verts.customData.flatlist) {
      if (!validtypes.has(layer.typeName)) {
        continue;
      }

      let name2 = "_v_" + layer.name;
      if (!mesh.loops.customData.hasNamedLayer(name2, layer.typeName)) {
        console.log("Adding grid data layer", name2);
        mesh.loops.addCustomDataLayer(layer.typeName, name2);
      }

      let layer2 = mesh.loops.customData.getNamedLayer(name2, layer.typeName);
      if (layer === mesh.verts.customData.getActiveLayer(layer.typeName)) {
        mesh.loops.customData.setActiveLayer(layer2.index);
      }
    }
  }

  static meshGridOffset(mesh) {
    let i = 0;

    for (let layer of mesh.loops.customData.flatlist) {
      let cls = CustomDataElem.getTypeClass(layer.typeName);

      if (new cls() instanceof GridBase) {
        return i;
      }

      i++;
    }

    return -1;
  }

  /** loop is allowed to be undefined, if not is used to init point positions */
  init(dimen, loop=undefined) {
    throw new Error("implement me");
  }

  onRemoveLayer(layercls, layer_i) {
    let i = this.cdmap[layer_i];

    let i2 = i;
    while (i2 < this.customDatas.length-1) {
      this.customDatas[i2] = this.customDatas[i2+1];
      i2++;
    }
    this.customDatas[i2] = undefined;
    this.customDatas[i2].length--;

    for (let p of this.points) {
      let i2 = i;

      while (i2 < p.customData.length-1) {
        p.customData[i2] = p.customData[i2+1];
        let li = this.cdmap_reverse[i2+1];

        if (li !== undefined) {
          this.cdmap[li] = i2;
          this.cdmap_reverse[i2] = li;
        }

        i2++;
      }

      p.customData.length--;
    }
  }
  onNewLayer(layercls, layer_i=undefined) {
    let totpoint = this.points.length;

    if (layer_i !== undefined) {
      this._max_cd_i = Math.max(this._max_cd_i, layer_i);
    } else {
      layer_i = ++this._max_cd_i;
    }

    this.cdmap[layer_i] = this.customDatas.length;
    this.cdmap_reverse[this.customDatas.length] = layer_i;

    let cd = [];
    this.customDatas.push(cd);


    let ps = this.points;
    for (let i=0; i<totpoint; i++) {
      let data = new layercls();

      cd.push(data);

      ps[i].customData.length = this._max_cd_i+1;
      ps[i].customData[layer_i] = data;
    }
  }

  setValue(b) {
    this.copyTo(b);
  }

  copyTo(b) {
    let totpoint = this.points.length;

    if (b.points.length === 0 || b.dimen !== this.dimen) {
      //init points
      b.init(this.dimen);
    }

    //copy customdata layers
    if (b.customDatas.length !== this.customDatas.length) {
      b.cdmap = this.cdmap.concat([]);
      b.cdmap_reverse = this.cdmap_reverse.concat([]);
      b.customDatas.length = 0;

      let i = 0;
      for (let cl of this.customDatas) {
        let cls = cl[0].constructor;
        let cl2 = [];
        b.customDatas.push(cl2);

        for (let i=0; i<cl.length; i++) {
          let data = new cls();

          cl2.push(data);
          cl[i].copyTo(data);
        }

        i++;
      }

      b.relinkCustomData();
    }

    let ps1 = this.points, ps2 = b.points;

    for (let i=0; i<totpoint; i++) {
      ps2[i].load(ps1[i]);
    }

    let cd1 = this.customDatas, cd2 = b.customDatas;
    for (let i=0; i<cd1.length; i++) {
      let c1 = cd1[i];
      let c2 = cd2[i];

      for (let j=0; j<cd1.length; j++) {
        c1[j].copyTo(c2[j]);
      }
    }

    return this;
  }

  getValue() {
    return this;
  }

  makeDrawTris(mesh, smesh, loop, cd_grid) {
    throw new Error("implement me");
  }

  makeBVHTris(mesh, bvh, loop, cd_grid, randmap, bridgeEdges=false) {
    throw new Error("implement me");
  }

  recalcNeighbors(mesh, loop, cd_grid) {
    throw new Error("implement me");
  }

  static initMesh(mesh, dimen, cd_off= mesh.loop.customData.getLayerIndex(this)) {
    if (cd_off === -1) {
      mesh.loops.addCustomDataLayer(this, "grid");
      cd_off = mesh.loops.customData.getLayerIndex(this);
    }

    let cdlayers = [];
    let i = 0;

    for (let layer of mesh.loops.customData.flatlist) {
      let cls = CustomDataElem.getTypeClass(layer.typeName);
      let ok = cls;

      ok = ok && !(new cls() instanceof GridBase);

      if (ok) {
        cdlayers.push([i, cls]);
      }

      i++;
    }

    for (let l of mesh.loops) {
      let grid = l.customData[cd_off];

      grid.init(dimen, l);

      for (let [i, cls] of cdlayers) {
        grid.onNewLayer(cls, i);
      }
    }

    mesh.regenRender();
    mesh.regenElementsDraw();
  }

  relinkCustomData() {
    let pi = 0;

    for (let p of this.points) {
      p.customData.length = this._max_cd_i;
      for (let i=0; i<p.customData.length; i++) {
        p.customData[i] = undefined;
      }

      let i = 0;
      for (let cd of this.customDatas) {
        let li = this.cdmap_reverse[i];

        p.customData[li] = cd[pi];
        i++;
      }

      pi++;
    }
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    for (let i=0; i<this.cdmap.length; i++) {
      if (this.cdmap[i] === -1) {
        this.cdmap[i] = undefined;
      }
    }

    for (let i=0; i<this.cdmap_reverse.length; i++) {
      if (this.cdmap_reverse[i] === -1) {
        this.cdmap_reverse[i] = undefined;
      }
    }

    this._max_cd_i = 0;
    for (let idx of this.cdmap) {
      if (idx !== undefined && idx >= 0) {
        this._max_cd_i = Math.max(this._max_cd_i, idx);
      }
    }

    this.relinkCustomData();
  }
};

GridBase.STRUCT = nstructjs.inherit(GridBase, CustomDataElem, "mesh.GridBase") + `
  dimen         : int;
  points        : array(mesh.GridVert);
  customDatas   : array(array(abstract(mesh.CustomDataElem)));
  cdmap         : array(e, int) | e !== undefined ? e : -1;
  cdmap_reverse : array(e, int) | e !== undefined ? e : -1;
}`;
nstructjs.register(GridBase);

let recttemps = new util.cachering(() => [new Vector3(),new Vector3(),new Vector3(),new Vector3()], 64);

export class Grid extends GridBase {
  constructor() {
    super();

    this.dimen = gridSides[2];
  }

  getQuad(loop) {
    let ret = recttemps.next();

    ret[0].load(loop.f.cent);
    ret[1].load(loop.v).interp(loop.prev.v, 0.5);
    ret[2].load(loop.v);
    ret[3].load(loop.v).interp(loop.next.v, 0.5);

    return ret;
  }

  init(dimen, loop) {
    if (dimen !== this.dimen) {
      this.points.length = 0;
      this.dimen = dimen;
    }
    let totpoint = dimen*dimen;

    if (this.points.length === 0) {
      for (let i = 0; i < totpoint; i++) {
        this.points.push(new GridVert(i, loop ? loop.eid : -1));
      }
    }

    if (loop !== undefined) {
      let quad = this.getQuad(loop);

      let a = new Vector3();
      let b = new Vector3();

      for (let iu=0; iu<dimen; iu++) {
        let u = (iu) / (dimen-1);

        for (let iv=0; iv<dimen; iv++) {
          let v = (iv) / (dimen-1);
          let idx = iv*dimen + iu;

          let p = this.points[idx];

          a.load(quad[0]).interp(quad[1], v);
          b.load(quad[3]).interp(quad[2], v);

          p.load(a).interp(b, u);
        }
      }

      this.recalcNormals();
    }

    this.relinkCustomData();

    return this;
  }

  recalcNormals() {
    throw new Error("implement me");
  }

  static define() {return {
    elemTypeMask : MeshTypes.LOOP, //see MeshTypes in mesh.js
    typeName     : "grid",
    uiTypeName   : "Grid",
    defaultName  : "grid",
    valueSize    : undefined,
    flag         : 0
  }};

  _ensure(mesh, loop, cd_grid) {
    if (this.points.length === 0) {
      //try to get grid dimen
      for (let l of mesh.loops) {
        if (l !== loop) {
          let grid = l.customData[cd_grid];
          this.dimen = grid.dimen;
          break;
        }
      }

      this.init(this.dimen, loop);
      let layeri = 0, i=0;

      console.log("INIT", this);

      this.customDatas.length = 0;

      for (let layer of mesh.loops.customData.flatlist) {
        let cls = CustomDataElem.getTypeClass(layer.typeName);

        if (new cls() instanceof GridBase) {
          layeri++;
          continue;
        }

        this.onNewLayer(cls, layeri);
        i++;
      }
    }
  }

  makeDrawTris(mesh, smesh, loop, cd_grid) {
    this._ensure(mesh, loop, cd_grid);

    let quad = this.getQuad(loop);
    let dimen = this.dimen;

    let chunkmode = smesh instanceof ChunkedSimpleMesh;

    let cd_uv = mesh.loops.customData.getLayerIndex("uv");
    let have_uvs = cd_uv >= 0;

    let ps = this.points;
    let uvs = have_uvs ? this.customDatas[this.cdmap[cd_uv]] : undefined;
    let eid = loop.f.eid;

    let id = loop.eid*dimen*dimen*2;

    for (let x=0; x<dimen-1; x++) {
      for (let y=0; y<dimen-1; y++) {
        let i1 = y*dimen + x;
        let i2 = ((y+1)*dimen + x);
        let i3 = ((y+1)*dimen + x+1);
        let i4 = (y*dimen + x+1);

        let tri;

        if (chunkmode) {
          tri = smesh.tri(id + i1 * 2, ps[i1], ps[i2], ps[i3], ps[i4]);
        } else {
          tri = smesh.tri(ps[i1], ps[i2], ps[i3], ps[i4]);
        }
        let n = math.normal_tri(ps[i1], ps[i2], ps[i3]);

        tri.normals(n, n, n);
        if (uvs) {
          tri.uvs(uvs[i1].uv, uvs[i2].uv, uvs[i3].uv);
        }
        tri.ids(eid, eid, eid);

        //*
        if (chunkmode) {
          tri = smesh.tri(id + i1 * 2 + 1, ps[i1], ps[i3], ps[i4]);
        } else {
          tri = smesh.tri(ps[i1], ps[i3], ps[i4]);
        }

        tri.normals(n, n, n);
        if (uvs) {
          tri.uvs(uvs[i1].uv, uvs[i3].uv, uvs[i4].uv);
        }
        tri.ids(eid, eid, eid);
        //*/
      }
    }
  }

  recalcNormals() {
    let dimen = this.dimen;
    let ps = this.points;
    let n = new Vector3();

    for (let p of this.points) {
      p.no.zero();
    }

    for (let x=0; x<dimen-1; x++) {
      for (let y = 0; y < dimen - 1; y++) {
        let i1 = y * dimen + x;
        let i2 = ((y + 1) * dimen + x);
        let i3 = ((y + 1) * dimen + x + 1);
        let i4 = (y * dimen + x + 1);

        let p1 = ps[i1];
        let p2 = ps[i2];
        let p3 = ps[i3];
        let p4 = ps[i4];

        n.load(math.normal_tri(p1, p2, p3)).add(math.normal_tri(p1, p3, p4)).normalize();

        p1.no.add(n);
        p2.no.add(n);
        p3.no.add(n);
        p4.no.add(n);
      }
    }

    for (let p of this.points) {
      p.no.normalize();
    }
  }

  recalcNeighbors(mesh, loop, cd_grid) {
    for (let p of this.points) {
      p.neighbors.length = 0;
      p.loopEid = loop.eid;
    }

    let ps = this.points, dimen = this.dimen;

    let l = loop;
    let lp = l.prev, ln = l.next;
    let lr = l.radial_next;
    let lrp = lr.prev, lrn = lr.next;
    let lpr = l.prev.radial_next, lnr = l.next.radial_next;

    let lmap = {
      [NeighborKeys.L] : l,
      [NeighborKeys.LP] : lp,
      [NeighborKeys.LN] : ln,
      [NeighborKeys.LR] : lr,
      [NeighborKeys.LRP] : lrp,
      [NeighborKeys.LRN] : lrn,
      [NeighborKeys.LPR] : lpr,
      [NeighborKeys.LNR] : lnr
    };

    let map = getNeighborMap(this.dimen);
    for (let i=0; i<this.dimen; i++) {
      for (let c of map.cases) {
        let l1mask = c.l1, l2mask = c.l2;
        let l1 = lmap[l1mask];
        let l2 = lmap[l2mask];

        let ret = map.resolve(i, l1, l2, l1mask, l2mask);
        let x1 = ret.x1, y1 = ret.y1, x2 = ret.x2, y2 = ret.y2;

        let ps2 = l2.customData[cd_grid].points;

        let i1 = y1*dimen + x1;
        let i2 = y2*dimen + x2;

        if (!ps2 || !ps2[i2]) {
          continue;
        }

        //*
        ps[i1].bLink = ps2[i2];

        if (!ps2[i2].bLink) {
          ps2[i2].bLink = ps[i1];
        }

        //*/

        //ps2[i2] = ps[i1];
        //ps[i1] = ps2[i2];

        //ps[i1].neighbors.push(ps2[i2]);
      }
    }

    for (let i=0; i<dimen; i++) {
      for (let j=0; j<dimen; j++) {
        let i1 = j*dimen + i;

        if (j < dimen-1) {
          let i2 = (j + 1) * dimen + i;
          ps[i1].neighbors.push(ps[i2]);
        }

        if (j > 0) {
          let i3 = (j - 1) * dimen + i;
          ps[i1].neighbors.push(ps[i3]);
        }

        if (i < dimen-1) {
          let i4 = j * dimen + i + 1;
          ps[i1].neighbors.push(ps[i4]);
        }

        if (i > 0) {
          let i5 = j * dimen + i - 1;
          ps[i1].neighbors.push(ps[i5]);
        }
      }
    }
  }

  makeBVHTris(mesh, bvh, loop, cd_grid, randmap, bridgeEdges=false) {
    this._ensure(mesh, loop, cd_grid);

    let dimen = this.dimen;

    let id = loop.eid*((this.dimen+1)*(this.dimen+1))*2;//+4*this.dimen)*2;

    let feid = loop.f.eid;
    let ps = this.points;

    let map = getNeighborMap(this.dimen);

    let l = loop;
    let lp = l.prev, ln = l.next;
    let lr = l.radial_next;
    let lrp = lr.prev, lrn = lr.next;
    let lpr = l.prev.radial_next, lnr = l.next.radial_next;

    let lmap = {
      [NeighborKeys.L] : l,
      [NeighborKeys.LP] : lp,
      [NeighborKeys.LN] : ln,
      [NeighborKeys.LR] : lr,
      [NeighborKeys.LRP] : lrp,
      [NeighborKeys.LRN] : lrn,
      [NeighborKeys.LPR] : lpr,
      [NeighborKeys.LNR] : lnr
    };

    if (bridgeEdges) {
      return;
    }
    if (bridgeEdges) {
      let cases = [
        {l1 : NeighborKeys.L, l2 : NeighborKeys.LP},
        {l1 : NeighborKeys.L, l2 : NeighborKeys.LPR}
      ];

      id += dimen*dimen*2;
      let ci = 0;

      for (let c of cases) {
        for (let i = 0; i < dimen - 1; i++) {
          let l1 = lmap[c.l1];
          let l2 = lmap[c.l2];

          let ps1 = l1.customData[cd_grid].points;
          let ps2 = l2.customData[cd_grid].points;

          let ret = map.resolve(i, l1, l2, c.l1, c.l2);
          let i1 = ret.y1 * dimen + ret.x1;
          let i2 = ret.y2 * dimen + ret.x2;

          ret = map.resolve(i+1, l1, l2, c.l1, c.l2);
          let i3 = ret.y1 * dimen + ret.x1;
          let i4 = ret.y2 * dimen + ret.x2;

          let id2 = id + i*2;

          //id2 = Math.random();

          //bvh.addTri(feid, id2, ps1[i1], ps2[i2], ps2[i4]);
          //bvh.addTri(feid, id2+1, ps1[i1], ps2[i4], ps1[i3]);

          if (ci === 0) {
            bvh.addTri(feid, id2, ps1[i1], ps2[i2], ps2[i4]);
            bvh.addTri(feid, id2+1, ps1[i1], ps2[i4], ps1[i3]);
          } else {
            bvh.addTri(feid, id2, ps2[i4], ps2[i2], ps1[i1]);
            bvh.addTri(feid, id2 + 1, ps1[i3], ps2[i4], ps1[i1]);
          }
        }

        id += dimen*2;
        ci++;
      }

      return;
    }

    //return;

    for (let _i=0; _i<randmap.length; _i++) {
      let ri = randmap[_i];
      let x = ri % (dimen-1);
      let y = ~~(ri / (dimen-1));

      let i1 = y * dimen + x;
      let i2 = ((y + 1) * dimen + x);
      let i3 = ((y + 1) * dimen + x + 1);
      let i4 = (y * dimen + x + 1);

      let id2 = id + i1*2;

      //id2 = Math.random();

      bvh.addTri(feid, id2, ps[i1], ps[i2], ps[i3]);
      bvh.addTri(feid, id2+1, ps[i1], ps[i3], ps[i4]);
    }
    /*
    for (let x=0; x<dimen-1; x++) {
      for (let y = 0; y < dimen - 1; y++) {
        let i1 = y * dimen + x;
        let i2 = ((y + 1) * dimen + x);
        let i3 = ((y + 1) * dimen + x + 1);
        let i4 = (y * dimen + x + 1);

        let id2 = id + i1*2;

        bvh.addTri(feid, id2, ps[i1], ps[i2], ps[i3]);
        bvh.addTri(feid, id2+1, ps[i1], ps[i3], ps[i4]);
      }
    }

    //*/
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);
  }
}
Grid.STRUCT = nstructjs.inherit(Grid, GridBase, "mesh.Grid") + `
}`;
nstructjs.register(Grid);
CustomDataElem.register(Grid);

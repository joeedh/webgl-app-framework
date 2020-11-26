import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js';

import {MeshFlags, MeshTypes} from "./mesh_base.js";
import {CustomData, CustomDataElem} from "./customdata.js";
import {nstructjs} from '../path.ux/scripts/pathux.js';
import {ChunkedSimpleMesh} from "../core/simplemesh.js";
import {FloatElem} from "./mesh_customdata.js";

/*
okay, so turned out my idea of having grids
overlap on two edges is problematic, as it requires
non-quads for joining corners on extroidinary vertices
*/
let interptemp1 = [];

const IDX = -1, IDXINV = -2;

export const NeighborKeys = {
  L: 1, //loop
  LP: 2, //loop.prev
  LN: 4, //loop.next
  LR: 8, //loop.radial_next
  LRP: 16, //loop.radial_next.prev
  LRN: 32, //loop.radial_next.prev
  LPR: 64, //loop.prev.radial_next
  LNR: 128, //loop.next.radial_next
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
      l: 1,
      lp: 2,
      ln: 4,
      lr: 8,
      lrp: 16,
      lrn: 32,
      lpr: 64,
      lnr: 128
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

      [lmask("l", "lp")]: [[0, IDX], [undefined, undefined], [IDX, 0]],
      [lmask("l", "lpr")]: [[IDX, dimen - 1], [dimen - 1, IDX], [undefined, IDX]],
    }

    let cases = [
      {mask: lmask("l", "lp"), l1: masks.l, l2: masks.lp},
      {mask: lmask("l", "lpr"), l1: masks.l, l2: masks.lpr},
    ];

    this.maps = maps;
    this.cases = cases;
  }

  getmap(f, i) {
    if (f === IDX) {
      return i;
    } else if (f === IDXINV) {
      return this.dimen - 1 - i;
    } else {
      return f;
    }
  }

  resolve(i1, l1, l2, l1mask, l2mask, i2 = i1) {
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
  constructor(index = 0, loopEid) {
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

  load(b, coOnly = false) {
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

export function genGridDimens(depth = 32) {
  let dimen = 2;
  let ret = [2];

  for (let i = 0; i < depth; i++) {
    dimen = (dimen - 1) * 2 + 1;
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
    this.customDataLayout = [];
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
  init(dimen, loop = undefined) {
    throw new Error("implement me");
  }

  onRemoveLayer(layercls, layer_i) {
    let i = this.cdmap[layer_i];

    let i2 = i;
    while (i2 < this.customDatas.length - 1) {
      this.customDatas[i2] = this.customDatas[i2 + 1];
      this.customDataLayout[i2] = this.customDataLayout[i2 + 1];

      i2++;
    }

    this.customDataLayout.length--;
    this.customDatas[i2] = undefined;
    this.customDatas.length--;

    for (let p of this.points) {
      let i2 = i;

      while (i2 < p.customData.length - 1) {
        p.customData[i2] = p.customData[i2 + 1];
        let li = this.cdmap_reverse[i2 + 1];

        if (li !== undefined) {
          this.cdmap[li] = i2;
          this.cdmap_reverse[i2] = li;
        }

        i2++;
      }

      p.customData.length--;
    }
  }

  onNewLayer(layercls, layer_i = undefined) {
    let totpoint = this.points.length;

    if (layer_i !== undefined) {
      this._max_cd_i = Math.max(this._max_cd_i, layer_i);
    } else {
      layer_i = ++this._max_cd_i;
    }

    if (new layercls() instanceof GridBase) {
      return;
    }

    this.cdmap[layer_i] = this.customDatas.length;
    this.cdmap_reverse[this.customDatas.length] = layer_i;

    let cd = [];
    this.customDatas.push(cd);
    this.customDataLayout.push(layercls);

    let ps = this.points;
    for (let i = 0; i < totpoint; i++) {
      let data = new layercls();

      cd.push(data);

      ps[i].customData.length = this._max_cd_i + 1;
      ps[i].customData[layer_i] = data;
    }
  }

  setValue(b) {
    this.copyTo(b);
  }

  copyTo(b) {
    let totpoint = this.points.length;

    if (b.points.length === 0) {
      //init points
      b.init(this.dimen);
    }

    //copy customdata layers
    if (b.customDatas.length !== this.customDatas.length) {
      b.cdmap = this.cdmap.concat([]);
      b.cdmap_reverse = this.cdmap_reverse.concat([]);
      b.customDatas.length = 0;

      b.customDataLayout = this.customDataLayout.concat([]);

      let i = 0;
      for (let cl of this.customDatas) {
        let cls = this.customDataLayout[i];
        let cl2 = [];

        if (!cls) {
          cls = this.customDataLayout[i] = cl[0].constructor;
        }

        b.customDatas.push(cl2);

        for (let j = 0; j < cl.length; j++) {
          let data = new cls();

          cl2.push(data);
          cl[i].copyTo(data);
        }

        i++;
      }

      b.relinkCustomData();
    }

    let ps1 = this.points, ps2 = b.points;

    for (let i = 0; i < totpoint; i++) {
      ps2[i].load(ps1[i]);
    }

    let cd1 = this.customDatas, cd2 = b.customDatas;
    for (let i = 0; i < cd1.length; i++) {
      let c1 = cd1[i];
      let c2 = cd2[i];

      for (let j = 0; j < cd1.length; j++) {
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

  makeBVHTris(mesh, bvh, loop, cd_grid, trisout) {//, randmap, bridgeEdges = false) {
    throw new Error("implement me");
  }

  recalcNeighbors(mesh, loop, cd_grid) {
    throw new Error("implement me");
  }

  static initMesh(mesh, dimen, cd_off = mesh.loop.customData.getLayerIndex(this)) {
    if (cd_off === -1) {
      mesh.loops.addCustomDataLayer(this, this.define().typeName);
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
      for (let i = 0; i < p.customData.length; i++) {
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

    for (let i = 0; i < this.cdmap.length; i++) {
      if (this.cdmap[i] === -1) {
        this.cdmap[i] = undefined;
      }
    }

    for (let i = 0; i < this.cdmap_reverse.length; i++) {
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

    let layout = [];
    let i = 0;

    for (let i = 0; i < this.customDatas.length; i++) {
      let name = this.customDataLayout[i];

      let cls = name ? CustomDataElem.getTypeClass(name) : undefined;

      if (!cls) {
        cls = this.customDatas[i][0].constructor;
      }

      if (!cls) { //add a dummy class to maintain data structure integrity
        console.error("Warning: unknown customdata type", name, "in multires grids code");
        cls = FloatElem;
      }

      layout.push(cls);
      i++;
    }

    this.customDataLayout = layout;

    this.relinkCustomData();
  }
};

GridBase.STRUCT = nstructjs.inherit(GridBase, CustomDataElem, "mesh.GridBase") + `
  dimen            : int;
  points           : array(mesh.GridVert);
  customDatas      : array(array(abstract(mesh.CustomDataElem)));
  cdmap            : array(e, int) | e !== undefined ? e : -1;
  cdmap_reverse    : array(e, int) | e !== undefined ? e : -1;
  customDataLayout : array(e, string) | e.define().typeName;
}`;
nstructjs.register(GridBase);

let recttemps = new util.cachering(() => [new Vector3(), new Vector3(), new Vector3(), new Vector3()], 64);

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
    let totpoint = dimen * dimen;

    if (this.points.length === 0) {
      for (let i = 0; i < totpoint; i++) {
        this.points.push(new GridVert(i, loop ? loop.eid : -1));
      }
    }

    if (loop !== undefined) {
      let quad = this.getQuad(loop);

      let a = new Vector3();
      let b = new Vector3();

      for (let iu = 0; iu < dimen; iu++) {
        let u = (iu) / (dimen - 1);

        for (let iv = 0; iv < dimen; iv++) {
          let v = (iv) / (dimen - 1);
          let idx = iv * dimen + iu;

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

  static define() {
    return {
      elemTypeMask: MeshTypes.LOOP, //see MeshTypes in mesh.js
      typeName: "grid",
      uiTypeName: "Grid",
      defaultName: "grid",
      valueSize: undefined,
      flag: 0
    }
  };

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
      let layeri = 0, i = 0;

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

    let id = loop.eid * dimen * dimen * 2;

    for (let x = 0; x < dimen - 1; x++) {
      for (let y = 0; y < dimen - 1; y++) {
        let i1 = y * dimen + x;
        let i2 = ((y + 1) * dimen + x);
        let i3 = ((y + 1) * dimen + x + 1);
        let i4 = (y * dimen + x + 1);

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

    for (let x = 0; x < dimen - 1; x++) {
      for (let y = 0; y < dimen - 1; y++) {
        let i1 = y * dimen + x;
        let i2 = ((y + 1) * dimen + x);
        let i3 = ((y + 1) * dimen + x + 1);
        let i4 = (y * dimen + x + 1);

        let p1 = ps[i1];
        let p2 = ps[i2];
        let p3 = ps[i3];
        let p4 = ps[i4];

        let dx1 = p2[0] - p1[0];
        let dy1 = p2[1] - p1[1];
        let dz1 = p2[2] - p1[2];

        let dx2 = p3[0] - p1[0];
        let dy2 = p3[1] - p1[1];
        let dz2 = p3[2] - p1[2];

        let nx = dy1 * dz2 - dz1 * dy2;
        let ny = dz1 * dx2 - dx1 * dz2;
        let nz = dx1 * dy2 - dy1 * dx2;

        let l = Math.sqrt(nx * nx + ny * ny + nz * nz);
        if (l > 0.0001) {
          nx /= l;
          ny /= l;
          nz /= l;
        }
        //n.load(math.normal_tri(p1, p2, p3)).add(math.normal_tri(p1, p3, p4)).normalize();

        p1.no[0] += nx;
        p1.no[1] += ny;
        p1.no[2] += nz;

        p2.no[0] += nx;
        p2.no[1] += ny;
        p2.no[2] += nz;

        p3.no[0] += nx;
        p3.no[1] += ny;
        p3.no[2] += nz;

        p4.no[0] += nx;
        p4.no[1] += ny;
        p4.no[2] += nz;
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
      [NeighborKeys.L]: l,
      [NeighborKeys.LP]: lp,
      [NeighborKeys.LN]: ln,
      [NeighborKeys.LR]: lr,
      [NeighborKeys.LRP]: lrp,
      [NeighborKeys.LRN]: lrn,
      [NeighborKeys.LPR]: lpr,
      [NeighborKeys.LNR]: lnr
    };

    let map = getNeighborMap(this.dimen);
    for (let i = 0; i < this.dimen; i++) {
      for (let c of map.cases) {
        let l1mask = c.l1, l2mask = c.l2;
        let l1 = lmap[l1mask];
        let l2 = lmap[l2mask];

        let ret = map.resolve(i, l1, l2, l1mask, l2mask);
        let x1 = ret.x1, y1 = ret.y1, x2 = ret.x2, y2 = ret.y2;

        let ps2 = l2.customData[cd_grid].points;

        let i1 = y1 * dimen + x1;
        let i2 = y2 * dimen + x2;

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

    for (let i = 0; i < dimen; i++) {
      for (let j = 0; j < dimen; j++) {
        let i1 = j * dimen + i;

        if (j < dimen - 1) {
          let i2 = (j + 1) * dimen + i;
          ps[i1].neighbors.push(ps[i2]);
        }

        if (j > 0) {
          let i3 = (j - 1) * dimen + i;
          ps[i1].neighbors.push(ps[i3]);
        }

        if (i < dimen - 1) {
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

  makeBVHTris(mesh, bvh, loop, cd_grid, trisout) {// randmap, bridgeEdges = false) {
    this._ensure(mesh, loop, cd_grid);

    let dimen = this.dimen;

    let id = loop.eid * ((this.dimen + 1) * (this.dimen + 1)) * 2;//+4*this.dimen)*2;

    let feid = loop.f.eid;
    let ps = this.points;

    let map = getNeighborMap(this.dimen);

    let l = loop;
    let lp = l.prev, ln = l.next;
    let lr = l.radial_next;
    let lrp = lr.prev, lrn = lr.next;
    let lpr = l.prev.radial_next, lnr = l.next.radial_next;

    let lmap = {
      [NeighborKeys.L]: l,
      [NeighborKeys.LP]: lp,
      [NeighborKeys.LN]: ln,
      [NeighborKeys.LR]: lr,
      [NeighborKeys.LRP]: lrp,
      [NeighborKeys.LRN]: lrn,
      [NeighborKeys.LPR]: lpr,
      [NeighborKeys.LNR]: lnr
    };

    //if (bridgeEdges) {
    //  return;
    //}
    if (0) { //bridgeEdges) {
      let cases = [
        {l1: NeighborKeys.L, l2: NeighborKeys.LP},
        {l1: NeighborKeys.L, l2: NeighborKeys.LPR}
      ];

      id += dimen * dimen * 2;
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

          ret = map.resolve(i + 1, l1, l2, c.l1, c.l2);
          let i3 = ret.y1 * dimen + ret.x1;
          let i4 = ret.y2 * dimen + ret.x2;

          let id2 = id + i * 2;

          //id2 = Math.random();

          //bvh.addTri(feid, id2, ps1[i1], ps2[i2], ps2[i4]);
          //bvh.addTri(feid, id2+1, ps1[i1], ps2[i4], ps1[i3]);

          if (ci === 0) {
            //bvh.addTri(feid, id2, ps1[i1], ps2[i2], ps2[i4]);
            //bvh.addTri(feid, id2 + 1, ps1[i1], ps2[i4], ps1[i3]);

            /*
            trisout.push(feid);
            trisout.push(id2);
            trisout.push(ps1[i1]);
            trisout.push(ps2[i2]);
            trisout.push(ps2[i4]);

            trisout.push(feid);
            trisout.push(id2+1);
            trisout.push(ps1[i1]);
            trisout.push(ps2[i4]);
            trisout.push(ps1[i3]);

             //*/
          } else {
            //bvh.addTri(feid, id2, ps2[i4], ps2[i2], ps1[i1]);
            //bvh.addTri(feid, id2 + 1, ps1[i3], ps2[i4], ps1[i1]);
            /*
            trisout.push(feid);
            trisout.push(id2);
            trisout.push(ps2[i4]);
            trisout.push(ps2[i2]);
            trisout.push(ps1[i1]);
            //*/

            /*
            trisout.push(feid);
            trisout.push(id2+1);
            trisout.push(ps1[i3]);
            trisout.push(ps2[i4]);
            trisout.push(ps1[i1]);
            */
          }
        }

        id += dimen * 2;
        ci++;
      }

      return;
    }

    //return;

    let rilen = (dimen - 1) * (dimen - 1);

    for (let ri = 0; ri < rilen; ri++) {
      let x = ri % (dimen - 1);
      let y = ~~(ri / (dimen - 1));

      let i1 = y * dimen + x;
      let i2 = ((y + 1) * dimen + x);
      let i3 = ((y + 1) * dimen + x + 1);
      let i4 = (y * dimen + x + 1);

      let id2 = id + i1 * 2;

      //id2 = Math.random();

      trisout.push(feid);
      trisout.push(id2);
      trisout.push(ps[i1]);
      trisout.push(ps[i2]);
      trisout.push(ps[i3]);

      trisout.push(feid);
      trisout.push(id2 + 1);
      trisout.push(ps[i1]);
      trisout.push(ps[i3]);
      trisout.push(ps[i4]);

      //bvh.addTri(feid, id2, ps[i1], ps[i2], ps[i3]);
      //bvh.addTri(feid, id2 + 1, ps[i1], ps[i3], ps[i4]);
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


export const QuadTreeFields = {
  QFLAG: 0,
  QCHILD1: 1,
  QCHILD2: 2,
  QCHILD3: 3,
  QCHILD4: 4,
  QMINU: 5,
  QMINV: 6,
  QMAXU: 7,
  QMAXV: 8,
  QCENTU: 9,
  QCENTV: 10,
  QDEPTH: 11,
  QLEFT: 12,
  QRIGHT: 13,
  QUP: 14,
  QDOWN: 15,
  QPOINT1: 16,
  QPOINT2: 17,
  QPOINT3: 18,
  QPOINT4: 19,
  QPOINT5: 20,
  QID: 21,
  QPARENT: 22,
  QSUBTREE_DEPTH: 23,
  QQUADIDX: 24,
  QPOLYSTART: 25,
  QPOLYEND: 26,
  QTOT: 32 //reserve some space for future expansion
};

let QFLAG = QuadTreeFields.QFLAG,
  QCHILD1 = QuadTreeFields.QCHILD1,
  QCHILD2 = QuadTreeFields.QCHILD2,
  QCHILD3 = QuadTreeFields.QCHILD3,
  QCHILD4 = QuadTreeFields.QCHILD4,
  QMINU = QuadTreeFields.QMINU,
  QMAXU = QuadTreeFields.QMAXU,
  QMINV = QuadTreeFields.QMINV,
  QCENTU = QuadTreeFields.QCENTU,
  QCENTV = QuadTreeFields.QCENTV,
  QMAXV = QuadTreeFields.QMAXV,
  QDEPTH = QuadTreeFields.QDEPTH,
  QLEFT = QuadTreeFields.QLEFT,
  QRIGHT = QuadTreeFields.QRIGHT,
  QUP = QuadTreeFields.QUP,
  QDOWN = QuadTreeFields.QDOWN,
  QPOINT1 = QuadTreeFields.QPOINT1,
  QPOINT2 = QuadTreeFields.QPOINT2,
  QPOINT3 = QuadTreeFields.QPOINT3,
  QPOINT4 = QuadTreeFields.QPOINT4,
  QPOINT5 = QuadTreeFields.QPOINT5,
  QID = QuadTreeFields.QID,
  QPARENT = QuadTreeFields.QPARENT,
  QSUBTREE_DEPTH = QuadTreeFields.QSUBTREE_DEPTH,
  QQUADIDX = QuadTreeFields.QQUADIDX,
  QPOLYSTART = QuadTreeFields.QPOLYSTART,
  QPOLYEND = QuadTreeFields.QPOLYEND,
  QTOT = QuadTreeFields.QTOT;

let SELECT = 1, LEAF = 2;

export class QuadTreeGrid extends GridBase {
  constructor() {
    super();

    this.dimen = 1;
    this.pmap = {};
    this.nodes = [];
    this.polys = [];

    this.needsPolysRebuild = true;
    this.needsTopoRebuild = true;

    this.nodeFieldSize = QTOT;
    this.subdtemps = util.cachering.fromConstructor(Vector3, 32);
  }

  copyTo(b) {
    b.dimen = this.dimen;
    b.nodes = this.nodes.concat([]);
    b.points.length = 0;

    for (let p of this.points) {
      let p2 = new GridVert(p.index, -1);

      p2.load(p);
      p2.no.load(p.no);

      b.points.push(p2);
    }

    b.customDataLayout = this.customDataLayout.concat([]);
    b.customDatas = [];

    for (let i=0; i<this.customDatas.length; i++) {
      let cd1 = this.customDatas[i];
      let cd2 = [];
      b.customDatas.push(cd2);

      for (let c of cd1) {
        cd2.push(c.copy());
      }
    }

    b.cdmap = this.cdmap.concat([]);
    b.cdmap_reverse = this.cdmap_reverse.concat([]);

    b.relinkCustomData();
  }

  getQuad(loop) {
    let ret = recttemps.next();

    ret[0].load(loop.f.cent);
    ret[1].load(loop.v).interp(loop.prev.v, 0.5);
    ret[2].load(loop.v);
    ret[3].load(loop.v).interp(loop.next.v, 0.5);

    return ret;
  }

  _hashPoint(u, v) {
    return u.toFixed(5) + ":" + v.toFixed(5);
  }

  _getPoint(u, v, loopEid, isNewOut) {
    let key = this._hashPoint(u, v);

    if (key in this.pmap) {
      if (isNewOut) {
        isNewOut[0] = false;
      }
      return this.pmap[key];
    }

    if (isNewOut) {
      isNewOut[0] = true;
    }

    let p = this.pmap[key] = new GridVert(this.points.length, loopEid);
    p.neighbors = new Set();

    for (let i=0; i<this.customDataLayout.length; i++) {
      let cls = this.customDataLayout[i];

      let layer = this.customDatas[i];
      layer.push(new cls());
    }

    this.points.push(p);

    return p;
  }

  _rebuildHash() {
    let nodes = this.nodes;

    this.pmap = {};

    function donode(ni, a, b, pi) {
      let u, v;

      u = nodes[ni + a];
      v = nodes[ni + b];

      let key = this._hashPoint(u, v);
      this.pmap[key] = this.points[nodes[ni + QPOINT1 + pi]];
    }

    for (let ni = 0; ni < nodes; ni += QTOT) {
      let u, v;

      donode(ni, QMINU, QMINV, 0);
      donode(ni, QMINU, QMAXV, 1);
      donode(ni, QMAXU, QMAXV, 2);
      donode(ni, QMAXU, QMINV, 3);
      donode(ni, QCENTU, QCENTV, 4);
    }
  }

  _newNode() {
    let nodes = this.nodes;

    let ni = nodes.length;
    nodes.length += QTOT;

    for (let i = 0; i < QTOT; i++) {
      nodes[ni + i] = 0.0;
    }

    nodes[ni + QID] = Math.random();
    nodes[ni + QFLAG] = LEAF;

    return ni;
  }

  _ensureNodePoint(ni, pidx, loopEid = undefined, isNewOut) {
    let nodes = this.nodes;

    let u, v;
    switch (pidx) {
      case 0:
        u = nodes[ni + QMINU];
        v = nodes[ni + QMINV];
        break;
      case 1:
        u = nodes[ni + QMINU];
        v = nodes[ni + QMAXV];
        break;
      case 2:
        u = nodes[ni + QMAXU];
        v = nodes[ni + QMAXV];
        break;
      case 3:
        u = nodes[ni + QMAXU];
        v = nodes[ni + QMINV];
        break;
      case 4:
        u = nodes[ni + QMINU] * 0.5 + nodes[ni + QMAXU] * 0.5;
        v = nodes[ni + QMINV] * 0.5 + nodes[ni + QMAXV] * 0.5;
        break;
    }

    let p = this._getPoint(u, v, loopEid, isNewOut);

    this.nodes[ni + QPOINT1 + pidx] = p.index;

    return p;
  }

  init(dimen, loop) {
    this.dimen = dimen;
    this.polys.length = 0;
    this.points.length = 0;
    this.nodes.length = 0;
    this.needsPolysRebuild = true;

    this.pmap = {};

    if (loop !== undefined) {
      let quad = this.getQuad(loop);
      let nodes = this.nodes;

      let ni = this._newNode();

      nodes[ni + QMINU] = nodes[ni + QMINV] = 0.0;
      nodes[ni + QMAXU] = nodes[ni + QMAXV] = 1.0;
      nodes[ni + QCENTU] = nodes[ni + QCENTV] = 0.5;
      nodes[ni + QFLAG] = LEAF;


      let p1 = this._ensureNodePoint(ni, 0, loop.eid);
      let p2 = this._ensureNodePoint(ni, 1, loop.eid);
      let p3 = this._ensureNodePoint(ni, 2, loop.eid);
      let p4 = this._ensureNodePoint(ni, 3, loop.eid);
      let p5 = this._ensureNodePoint(ni, 4, loop.eid);

      p1.load(quad[0]);
      p2.load(quad[1]);
      p3.load(quad[2]);
      p4.load(quad[3]);
      p5.load(p1).add(p2).add(p3).add(p4).mulScalar(0.25);

      let rec = (ni, depth) => {
        if (depth === 0) {
          return;
        }

        this.subdivide(ni);

        for (let i = 0; i < 4; i++) {
          if (Math.random() > 0.85) {
          //  continue;
          }
          rec(nodes[ni + QCHILD1 + i], depth - 1);
        }
      }

      rec(ni, 3);

      let ps = this.points;
      for (let i = 0; i < ps.length; i++) {
        break;
        ps[i][0] += Math.random() * 0.09;
        ps[i][1] += Math.random() * 0.09;
        ps[i][2] += Math.random() * 0.09;
      }

      this.rebuildNodePolys();
      this.recalcNormals();
    }

    this.relinkCustomData();

    return this;
  }

  printNodes() {
    let s = "";
    let ns = this.nodes;

    let alignlen = 0;
    for (let k in QuadTreeFields) {
      alignlen = Math.max(alignlen, k.length + 1);
    }

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      s += `==========${ni}=========\n`;

      for (let k in QuadTreeFields) {
        let k2 = k;
        let v = QuadTreeFields[k];

        while (k2.length < alignlen) {
          k2 = " " + k2;
        }

        s += `  ${k2} : ${ns[ni + v]}\n`;
      }

      s += "\n";
    }

    return s;
  }

  getTopo() {
    if (!this.needsTopoRebuild && this.topo) {
      return this.topo;
    }

    this.topo = undefined;
    this.needsTopoRebuild = false;

    let ns = this.nodes;
    let ps = this.points;

    let vmap = [];

    for (let i = 0; i < ps.length; i++) {
      ps[i].index = i;

      vmap.push({
        edges: [],
        nodes: [],
        index: i,
        uv: [-1, -1],
        p: ps[i]
      });
    }


    //get dimen of grid fine enough for deepest node

    let maxdepth = 0;
    for (let ni = 0; ni < ns.length; ni += QTOT) {
      maxdepth = Math.max(maxdepth, ns[ni + QDEPTH]);
    }
    let dimen = this.dimen = gridSides[maxdepth] - 1;

    let emap = {};
    let idgen = 0;

    function ekey(a, b) {
      return Math.min(a, b) + ":" + Math.max(a, b);
    }

    function getedge(a, b) {
      let key = ekey(a, b);

      if (!(key in emap)) {
        let e = {
          v1: a,
          v2: b,
          p1: ps[a],
          p2: ps[b],
          id: idgen++,
          nodes: []
        }

        vmap[a].edges.push(e);
        vmap[b].edges.push(e);

        emap[key] = e;
        return e;
      }

      return emap[key];
    }

    let uvmap = {};

    function uvkey(u, v) {
      let dimen2 = dimen*16;

      u = ~~(u * dimen2 + 0.0001);
      v = ~~(v * dimen2 + 0.0001);
      return v * dimen2 + u;
    }

    function setuv(v1, u, v) {
      let was_set = v1.uv[0] >= 0;

      if (was_set && (u !== v1.uv[0] || v !== v1.uv[1])) {
        console.log(v1, v1.uv[0], v1.uv[1], u, v);
        throw new Error("u, v differ");
      }

      v1.uv[0] = u;
      v1.uv[1] = v;
    }

    function addedge(ni, a, b, u, v) {
      let v1 = vmap[a], v2 = vmap[b];

      setuv(v1, u, v);

      let e = getedge(a, b);
      e.nodes.push(ni);
    }

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      if (!(ns[ni + QFLAG] & LEAF)) {
        continue;
      }

      let ip1 = ns[ni + QPOINT1];
      let ip2 = ns[ni + QPOINT2];
      let ip3 = ns[ni + QPOINT3];
      let ip4 = ns[ni + QPOINT4];
      let ip5 = ns[ni + QPOINT5];

      let minu = ns[ni + QMINU];
      let minv = ns[ni + QMINV];
      let maxu = ns[ni + QMAXU];
      let maxv = ns[ni + QMAXV];

      let du = maxu - minu;
      let dv = maxv - minv;

      addedge(ni, ip1, ip2, minu, minv);
      addedge(ni, ip2, ip3, minu, minv + dv);
      addedge(ni, ip3, ip4, minu + du, minv + dv);
      addedge(ni, ip4, ip1, minu + du, minv);

      let centu = (minu+maxu)*0.5;
      let centv = (minv+maxv)*0.5;

      addedge(ni, ip5, ip1, centu, centv);
      addedge(ni, ip5, ip2, centu, centv);
      addedge(ni, ip5, ip3, centu, centv);
      addedge(ni, ip5, ip4, centu, centv);

      let v5 = vmap[ip5];
      setuv(v5, minu + du * 0.5, minv + dv * 0.5);

      for (let i = 0; i < 5; i++) {
        let ip = ns[ni + QPOINT1 + i];
        let v = vmap[ip];

        v.nodes.push(ni);
      }
    }

    for (let i = 0; i < ps.length; i++) {
      let v = vmap[i];
      let key = uvkey(v.uv[0], v.uv[1]);

      uvmap[key] = i;
    }

    this.topo = {
      maxdepth, vmap, emap, uvmap, dimen, uvkey
    };

    return this.topo;
  }

  rebuildNodePolys() {
    this.needsPolysRebuild = false;

    let ns = this.nodes, ps = this.points;
    let {maxdepth, vmap, emap, uvmap, dimen, uvkey} = this.getTopo();

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      ns[ni + QLEFT] = ns[ni + QRIGHT] = 0;
      ns[ni + QUP] = ns[ni + QDOWN] = 0;
    }

    console.log("maxdepth", maxdepth);
    console.log("vmap", vmap);
    console.log("emap", emap);
    console.log("uvmap", uvmap);

    let du = 1.0 / dimen;
    let dv = 1.0 / dimen;

    let polygons = [];
    let duv = new Vector2();
    duv[0] = du;
    duv[1] = dv;

    let duv1 = new Vector2();
    let uv2 = new Vector2();

    let polys = this.polys = [];

    for (let ni = 0; ni < ns.length; ni += QTOT) {
      if (!(ns[ni + QFLAG] & LEAF)) {
        continue;
      }

      let ip5 = ns[ni + QPOINT5];

      //let poly = [];

      ns[ni + QPOLYSTART] = polys.length;

      //if (1) {
        //let i = 1;
      for (let i = 0; i < 4; i++) {
        let ip1 = ns[ni + QPOINT1 + i];
        let ip2 = ns[ni + QPOINT1 + ((i + 1) % 4)];
        let v1 = vmap[ip1];
        let v2 = vmap[ip2];

        polys.push(ip5);
        //poly.push(ip5);

        duv1.load(v2.uv).sub(v1.uv);

        let axis = (i & 1) ^ 1;

        let steps = Math.abs(duv1[axis] / duv[axis]) + 0.00001;
        steps += 1;

        let sign1 = Math.sign(duv1[0]);
        let sign2 = Math.sign(duv1[1]);

        //console.log("steps:", ~~steps, axis, i, steps);
        steps = ~~steps;

        uv2[0] = v1.uv[0];
        uv2[1] = v1.uv[1];

        //console.log(uv2[0]*dimen+0.00001, uv2[1]*dimen+0.00001, uv2[1]*(dimen-1)+0.00001, uv2[1]*(dimen+1)+0.00001);

        let dt = duv[axis] * Math.sign(duv1[axis]);

        for (let j = 0; j < steps; j++) {
          if (uv2[axis] < 0 || uv2[axis] > 1) {
            continue;
          }

          let key = uvkey(uv2[0], uv2[1]);
          if (key in uvmap) {
            //console.log("found", uvmap[key], uv2[axis]);
            //poly.push(uvmap[key]);
            polys.push(uvmap[key]);
          }

          uv2[axis] += dt;
        }
      }

      ns[ni + QPOLYEND] = polys.length;

      //console.log("poly", poly);
    }

    return {
      vmap: vmap,
      emap: emap,
      dimen: dimen,
      uvmap: uvmap
    };
    //rec2(0);
  }

  subdivide(ni, loopEid) {
    this.needsPolysRebuild = true;
    this.needsTopoRebuild = true;

    let nodes = this.nodes;

    if (!(nodes[ni + QFLAG] & LEAF)) {
      console.error("cannot subdivide already subdivided node");
      return;
    }

    let ni2 = ni;
    while (ni2) {
      nodes[ni2 + QSUBTREE_DEPTH]++;
      ni2 = nodes[ni2 + QPARENT];
    }
    //increment root too
    nodes[ni2 + QSUBTREE_DEPTH]++;

    nodes[ni + QFLAG] &= ~LEAF;

    let du = (nodes[ni + QMAXU] - nodes[ni + QMINU]) * 0.5;
    let dv = (nodes[ni + QMAXV] - nodes[ni + QMINV]) * 0.5;

    let p1 = this._ensureNodePoint(ni, 0, loopEid);
    let p2 = this._ensureNodePoint(ni, 1, loopEid);
    let p3 = this._ensureNodePoint(ni, 2, loopEid);
    let p4 = this._ensureNodePoint(ni, 3, loopEid);
    let p5 = this._ensureNodePoint(ni, 4, loopEid);

    let news = [[0], [0], [0], [0], [0]];
    let bs = new Array(5);

    let depth = nodes[ni + QDEPTH];

    p1 = this.subdtemps.next().load(p1);
    p2 = this.subdtemps.next().load(p2);
    p3 = this.subdtemps.next().load(p3);
    p4 = this.subdtemps.next().load(p4);
    p5 = this.subdtemps.next().load(p5);
    let tmp1 = this.subdtemps.next(), tmp2 = this.subdtemps.next();

    let uvs = new Array(5);
    for (let i = 0; i < uvs.length; i++) {
      uvs[i] = new Vector2();
    }

    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        let u = i * 0.5, v = j * 0.5;

        let ni2 = this._newNode();

        nodes[ni + QCHILD1 + (j * 2 + i)] = ni2;

        nodes[ni2 + QPARENT] = ni;
        nodes[ni2 + QQUADIDX] = j * 2 + i;

        nodes[ni2 + QMINU] = nodes[ni + QMINU] + du * i;
        nodes[ni2 + QMINV] = nodes[ni + QMINV] + dv * j;

        nodes[ni2 + QMAXU] = nodes[ni2 + QMINU] + du;
        nodes[ni2 + QMAXV] = nodes[ni2 + QMINV] + dv;

        nodes[ni2 + QCENTU] = nodes[ni2 + QMINU] * 0.5 + nodes[ni2 + QMAXU] * 0.5;
        nodes[ni2 + QCENTV] = nodes[ni2 + QMINV] * 0.5 + nodes[ni2 + QMAXV] * 0.5;

        nodes[ni2 + QFLAG] = LEAF;
        nodes[ni2 + QDEPTH] = depth + 1;

        let b1 = this._ensureNodePoint(ni2, 0, loopEid, news[0]);
        let b2 = this._ensureNodePoint(ni2, 1, loopEid, news[1]);
        let b3 = this._ensureNodePoint(ni2, 2, loopEid, news[2]);
        let b4 = this._ensureNodePoint(ni2, 3, loopEid, news[3]);
        let b5 = this._ensureNodePoint(ni2, 4, loopEid, news[4]);

        bs[0] = b1;
        bs[1] = b2;
        bs[2] = b3;
        bs[3] = b4;
        bs[4] = b5;

        u = i * 0.5;
        v = j * 0.5;

        uvs[0][0] = u;
        uvs[0][1] = v;

        uvs[1][0] = u;
        uvs[1][1] = v + 0.5;

        uvs[2][0] = u + 0.5;
        uvs[2][1] = v + 0.5;

        uvs[3][0] = u + 0.5;
        uvs[3][1] = v;

        for (let k = 0; k < 5; k++) {
          if (!news[k][0]) {
            continue;
          }

          let u2 = uvs[k][0];
          let v2 = uvs[k][1];

          tmp1.load(p1).interp(p2, v2);
          tmp2.load(p4).interp(p3, v2);
          tmp1.interp(tmp2, u2);

          bs[k].load(tmp1);
        }

        b5.load(b1).add(b2).add(b3).add(b4).mulScalar(0.25);
      }
    }
  }

  static define() {
    return {
      elemTypeMask: MeshTypes.LOOP, //see MeshTypes in mesh.js
      typeName: "QuadTreeGrid",
      uiTypeName: "QuadTreeGrid",
      defaultName: "QuadTreeGrid",
      valueSize: undefined,
      flag: 0
    }
  };

  _ensure(mesh, loop, cd_grid) {
    if (this.points.length === 0) {
      this.init(this.dimen, loop);
      let layeri = 0, i = 0;

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
    if (this.needsPolysRebuild) {
      this.rebuildNodePolys();
    }

    let nodes = this.nodes;
    let ps = this.points;

    for (let i = 0; i < ps.length; i++) {
      ps[i].index = i;
    }

    let polys = this.polys;

    let ischunk = smesh instanceof ChunkedSimpleMesh;
    let feid = loop.f.eid;

    let cd_color = mesh.loops.customData.getLayerIndex("color");
    let have_color = cd_color >= 0;

    let idmul = this.dimen * this.dimen;
    idmul = Math.max(idmul, this.polys.length);

    for (let ni = 0; ni < nodes.length; ni += QTOT) {
      if (!(nodes[ni + QFLAG] & LEAF)) {
        continue;
      }

      let start = nodes[ni + QPOLYSTART];
      let end = nodes[ni + QPOLYEND];

      let p1 = ps[polys[start]];

      if (end - start < 3) {
        continue;
      }
      //continue;

      for (let i = start + 1; i < end - 1; i++) {
        let p2 = ps[polys[i]];
        let p3 = ps[polys[i + 1]];

        let tri;
        //let id = Math.random();
        let id = loop.eid * idmul + i;

        if (ischunk) {
          tri = smesh.tri(id, p1, p2, p3);
        } else {
          tri = smesh.tri(p1, p2, p3);
        }

        if (have_color) {
          let c1 = p1.customData[cd_color].color;
          let c2 = p2.customData[cd_color].color;
          let c3 = p3.customData[cd_color].color;
          tri.colors(c1, c2, c3);
        }

        tri.normals(p1.no, p2.no, p3.no);
      }
    }
  }

  recalcNormals() {
    let nodes = this.nodes;
    let ps = this.points;

    for (let i = 0; i < ps.length; i++) {
      ps[i].no.zero();
    }

    let rec = (ni) => {
      if (!(nodes[ni + QFLAG] & LEAF)) {
        for (let i = 0; i < 4; i++) {
          if (nodes[ni + QCHILD1 + i]) {
            rec(nodes[ni + QCHILD1 + i]);
          }
        }

        return;
      }

      let p1 = ps[nodes[ni + QPOINT1]];
      let p2 = ps[nodes[ni + QPOINT2]];
      let p3 = ps[nodes[ni + QPOINT3]];
      let p4 = ps[nodes[ni + QPOINT4]];
      let p5 = ps[nodes[ni + QPOINT5]];

      let n;

      n = math.normal_tri(p1, p2, p5);
      p1.no.add(n);
      p2.no.add(n);
      p5.no.add(n);

      n = math.normal_tri(p2, p3, p5);
      p2.no.add(n);
      p3.no.add(n);
      p5.no.add(n);

      n = math.normal_tri(p3, p4, p5);
      p3.no.add(n);
      p4.no.add(n);
      p5.no.add(n);

      n = math.normal_tri(p4, p1, p5);
      p4.no.add(n);
      p1.no.add(n);
      p5.no.add(n);
    }

    rec(0);

    for (let p of this.points) {
      p.no.normalize();
    }
  }

  recalcNeighbors(mesh, loop, cd_grid) {
    let topo = this.getTopo();
    let ps = this.points;

    for (let i=0; i<ps.length; i++) {
      ps[i].index = i;
    }

    for (let v of topo.vmap) {
      let p = v.p;
      p.neighbors = new Set();

      for (let e of v.edges) {
        let v2 = e.v1 === v.index ? e.v2 : e.v1;
        v2 = topo.vmap[v2];

        p.neighbors.add(v2.p);
      }
    }

    let uvs = [
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0]
    ];

    let uv = new Vector2();
    let duv = new Vector2();

    let dimen = topo.dimen;
    let uvmap = topo.uvmap;
    let uvkey = topo.uvkey;

    let l = loop;
    let lr = loop.radial_next;
    let lrn = loop.radial_next.next;

    let lrtopo;
    let lrps = lr.customData[cd_grid].points;

    let lrntopo;
    let lrnps = lrn.customData[cd_grid].points;

    let lpr = l.prev.radial_next;
    let lprtopo, lprps;

    let lprbad = false;

    if (lpr.v !== l.v) {
      lpr = lpr.next;
      lprbad = true;
    }

    lprtopo = lpr.customData[cd_grid].getTopo();
    lprps = lpr.customData[cd_grid].points;


    if (lr !== l) {
      lrtopo = lr.customData[cd_grid].getTopo();
      lrntopo = lrn.customData[cd_grid].getTopo();
    }

    let ln = l.next, lp = l.prev;
    let lntopo = ln.customData[cd_grid].getTopo();
    let lptopo = lp.customData[cd_grid].getTopo();
    let lnps = ln.customData[cd_grid].points;
    let lpps = lp.customData[cd_grid].points;

    for (let i=0; i<4; i++) {
      let uv1 = uvs[i], uv2 = uvs[(i+1)%4];
      let axis = (i+1) & 1;

      uv.load(uv1);
      duv.load(uv2).sub(uv1);

      let dt = duv[axis] / dimen;

      for (let j=0; j<dimen+1; j++) {
        let val = uv[axis];
        let key = uvkey(uv[0], uv[1]);
        let p1 = uvmap[key];

        if (p1 === undefined) {
          continue;
        }

        p1 = ps[p1];

        if (0 && i === 0 && !lprbad) {
          let u = val;
          let v = 1.0;

          let key = lrtopo.uvkey(u, v);

          let p2 = lrntopo.uvmap[key];
          if (p2 !== undefined) {
            p2 = lrnps[p2];

            //console.log("found", axis, uv[0], uv[1], u, v, key in lrntopo.uvmap);
            p1.neighbors.add(p2);
            p1.bLink = p2;
          }
        } else if (i === 2 && lr !== l && lr.v !== l.v) {
          let u = val;
          let v = 1.0;

          let key = lrtopo.uvkey(u, v);

          let p2 = lrntopo.uvmap[key];
          if (p2 !== undefined) {
            p2 = lrnps[p2];

            //console.log("found", axis, uv[0], uv[1], u, v, key in lrntopo.uvmap);
            p1.neighbors.add(p2);
            p1.bLink = p2;
          }
        } else if (i === 3) {
          let u = 0.0;
          let v = val;

          let key = lntopo.uvkey(u, v);
          let p2 = lntopo.uvmap[key];

          if (p2 !== undefined) {
            p2 = lnps[p2];

            console.log("found", axis, uv[0], uv[1], u, v, key in lntopo.uvmap);
            p1.neighbors.add(p2);
            p1.bLink = p2;
          }
        } else if (i === 0) {
          let u = val;
          let v = 0;

          let key = lptopo.uvkey(u, v);
          let p2 = lptopo.uvmap[key];

          if (p2 !== undefined) {
            p2 = lpps[p2];

            console.log("found", axis, uv[0], uv[1], u, v, key in lptopo.uvmap);
            p1.neighbors.add(p2);
            p1.bLink = p2;
          }
        }

        uv[axis] += dt;
      }
    }
  }

  makeBVHTris(mesh, bvh, loop, cd_grid, trisout) {
    if (this.needsPolysRebuild) {
      this.rebuildNodePolys();
    }

    let nodes = this.nodes;
    let ps = this.points;

    for (let i = 0; i < ps.length; i++) {
      ps[i].index = i;
    }

    let polys = this.polys;

    let feid = loop.f.eid;

    let idmul = this.dimen * this.dimen;
    idmul = Math.max(idmul, this.polys.length);

    for (let ni = 0; ni < nodes.length; ni += QTOT) {
      if (!(nodes[ni + QFLAG] & LEAF)) {
        continue;
      }

      let start = nodes[ni + QPOLYSTART];
      let end = nodes[ni + QPOLYEND];

      let p1 = ps[polys[start]];

      if (end - start < 3) {
        continue;
      }
      //continue;

      for (let i = start + 1; i < end - 1; i++) {
        let p2 = ps[polys[i]];
        let p3 = ps[polys[i + 1]];

        let tri;
        //let id = Math.random();
        let id = loop.eid * idmul + i;

        trisout.push(feid);
        trisout.push(id);
        trisout.push(p1);
        trisout.push(p2);
        trisout.push(p3);
      }
    }
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    if (this.nodeFieldSize !== QTOT) {
      console.warn("Old quadtree structure detected; converting. . .");

      let ns1 = this.nodes;
      let qtot_old = this.nodeFieldSize;
      let cpylen = Math.min(qtot_old, QTOT);
      let extra = Math.max(QTOT - cpylen, 0);
      let ns2 = [];
      let map = [], mapi = 0;

      for (let ni = 0; ni < ns1.length; ni += qtot_old) {
        for (let j = 0; j < cpylen; j++) {
          ns2.push(ns1[ni + j]);
        }

        for (let j = 0; j < extra; j++) {
          ns2.push(0);
        }

        map.push(mapi);
        mapi += QTOT;
      }

      for (let ni = 0; ni < ns2.length; ni += QTOT) {
        let idx = ni / QTOT;

        ns2[ni + QCHILD1] = map[ns2[ni + QCHILD1]];
        ns2[ni + QCHILD2] = map[ns2[ni + QCHILD2]];
        ns2[ni + QCHILD3] = map[ns2[ni + QCHILD3]];
        ns2[ni + QCHILD4] = map[ns2[ni + QCHILD4]];
        ns2[ni + QPARENT] = map[ns2[ni + QPARENT]];
      }

      this.nodes = ns2;
      this.nodeFieldSize = QTOT;
    }
    //TODO: test _rebuildHash()
    //this._rebuildHash();
  }
}

QuadTreeGrid.STRUCT = nstructjs.inherit(QuadTreeGrid, GridBase, "mesh.QuadTreeGrid") + `
  nodes         : array(float);
  nodeFieldSize : int;  
}`;

nstructjs.register(QuadTreeGrid);
CustomDataElem.register(QuadTreeGrid);

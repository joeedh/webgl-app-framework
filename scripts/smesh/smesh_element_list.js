import {AttrTypeClasses, Float3Attr, GeoAttr, Int32Attr} from './smesh_attributes.js';
import {nstructjs, math, Vector2, Vector3, Vector4, Quat, Matrix4, util} from '../path.ux/scripts/pathux.js';
import {MAX_FACE_VERTS, MAX_VERT_EDGES, SMeshTypes, SMeshAttrFlags, SMeshFlags} from './smesh_base.js';

function typedArrayStruct(typedclass, structType) {
  let structName = typedclass.name;

  if (typedclass.STRUCT !== undefined) {
    return;
  }

  typedclass.STRUCT = `
${structName} {
  this : array(${structType}); 
}
`;

  typedclass.newSTRUCT = function(reader) {
    let dummy = [];
    reader(dummy);

    return new typedclass(dummy);
  }

  nstructjs.register(typedclass);
}

typedArrayStruct(Float64Array, "double");
typedArrayStruct(Float32Array, "float");

typedArrayStruct(Int32Array, "int");
typedArrayStruct(Int16Array, "short");
typedArrayStruct(Int8Array, "sbyte");

typedArrayStruct(Uint32Array, "uint");
typedArrayStruct(Uint16Array, "ushort");
typedArrayStruct(Uint8Array, "byte");

export class ElementAttr {
  constructor(typecls, name, elemType, index, category="", defval=undefined) {
    this.data = [];
    this.name = name;
    this.defaultValue = defval;
    this.typeClass = typecls;
    this.index = index;
    this.elemType = elemType;
    this.category = category;
    this.flag = 0; //see SMeshAttrFlags

    if (typecls) {
      this.typeName = typecls.attrDefine().typeName;
      this.dataCount = typecls.attrDefine.dataCount;
    } else {
      this.typeName = this.dataCount = undefined;
    }

    this.id = -1;

    if (this.constructor === ElementAttr) {
      Object.seal(this);
    }
  }

  resize(newsize) {
    let old = this.data;
    let def = this.typeClass.attrDefine();

    let tcls = AttrTypeClasses[def.dataType];

    let data = this.data = new tcls(newsize*def.dataCount);
    for (let i=0; i<old.length; i++) {
      data[i] = old[i];
    }

    for (let i=old.length; i<data.length; i++) {
      data[i] = 0;
    }

    return this;
  }

  setDefault(ei) {
    let val = this.defaultValue;

    if (val === undefined) {
      val = 0;
    }

    ei *= this.dataCount;
    let data = this.data;

    if (Array.isArray(val)) {
      for (let i=0; i<val.length; i++) {
        data[ei+i] = val[i];
      }
    } else if (typeof val === "number") {
      data[ei] = val;
    }

    return this;
  }

  loadSTRUCT(reader) {
    reader(this);

    this.typeClass = GeoAttr.getClass(this.typeName);
    this.dataCount = this.typeClass.attrDefine().dataCount;
  }
}
ElementAttr.STRUCT = `
smesh.ElementAttr {
  data     : abstract(Object);
  elemType : int;
  typeName : string;
  index    : int;
  category : string;
  name     : string;
  id       : int;
  flag     : int;
}
`;
nstructjs.register(ElementAttr);

export class BitMap {
  constructor(size=128) {
    size = Math.max(size, 8);
    this.size = size;
    this.map = undefined;

    this.resize(size);
  }

  clear() {
    for (let i=0; i<this.map.length; i++) {
      this.map[i] = 0;
    }

    return this;
  }

  resize(size) {
    size = Math.max(size, 8);
    let old = this.map;

    this.size = size;

    let bytes = size>>4;
    let map = this.map = new Uint16Array(bytes);

    if (old) {
      for (let i = 0; i < old.length; i++) {
        map[i] = old[i];
      }

      for (let i = old.length; i < map.length; i++) {
        map[i] = 0;
      }
    } else {
      for (let i=0; i<map.length; i++) {
        map[i] = 0;
      }
    }

    return this;
  }

  test(bit) {
    let byte = bit >> 4;
    bit = 1 << (bit & 15);

    return this.map[byte] & bit;
  }

  set(bit, state) {
    let byte = bit >> 4;
    bit = 1 << (bit & 15);

    if (state) {
      this.map[byte] |= bit;
    } else {
      this.map[byte] &= ~bit;
    }
  }
}

export class ElementIter {
  constructor(list) {
    this.done = true;
    this.list = list;
    this.i = 0;
    this.ret = {done : true, value : undefined};
  }

  reset(list) {
    this.done = false;
    this.list = list;
    this.i = 0;
    this.ret.done = false;
    this.ret.value = undefined;

    return this;
  }

  next() {
    let list = this.list, i = this.i;

    while (i < list._size && list.freemap.test(i)) {
      i++;
    }

    if (i >= list._size) {
      return this.finish();
    }

    this.ret.value = i;
    this.i = i + 1;

    return this.ret;
  }

  finish() {
    if (!this.done) {
      this.done = true;
      this.list.iterstack.cur--;
      this.ret.done = true;
      this.ret.value = undefined;
    }

    return this.ret;
  }

  return() {
    return this.finish();
  }
}
export class ElementList {
  constructor(type, smesh) {
    this.smesh = smesh;
    this.attrs = [];
    this.a = [];
    this.freelist = [];
    this.freemap = new BitMap();

    this.length = 0;
    this._size = 0;

    this.type = type;
    this.attrIdGen = 0;

    this.selected = new Set();
    this.active = -1;
    this.highlight = -1;

    this.iterstack = new Array(256);
    for (let i=0; i<this.iterstack.length; i++) {
      this.iterstack[i] = new ElementIter(this);
    }
    this.iterstack.cur = 0;

    this.resize(128);
    this.bind();
  }

  [Symbol.iterator]() {
    return this.iterstack[this.iterstack.cur++].reset(this);
  }

  setSelect(ei, state) {
    if (state) {
      this.selected.add(ei);
      this.flag[ei] |= SMeshFlags.SELECT;
    } else {
      this.selected.delete(ei);
      this.flag[ei] &= ~SMeshFlags.SELECT;
    }
  }

  copyElemData(dst, src) {
    for (let attr of this.attrs) {
      if (attr.flag & SMeshAttrFlags.NO_COPY) {
        continue;
      }

      let count = attr.dataCount;
      dst *= count;
      src *= count;

      let data = attr.data;

      for (let i=0; i<count; i++) {
        data[dst++] = data[src++];
      }
    }
  }

  resize(newsize, setFreelist=true) {
    let old = this._size;

    this.freemap.resize(newsize);

    for (let attr of this.attrs) {
      attr.resize(newsize);
      this.a[attr.index] = attr.typeClass.bind(attr.data);
    }

    this._size = newsize;

    if (setFreelist) {
      for (let i=this._size-1; i>=old; i--) {
      //for (let i=old; i<this._size; i++) {
        this.freelist.push(i);
        this.freemap.set(i, true);
      }
    }
  }

  addAttr(attrcls, name, defval, flag) {
    let attr = new ElementAttr(attrcls, name, this.type, undefined, undefined, defval);
    attr.resize(this._size);

    if (flag !== undefined) {
      attr.flag = flag;
    }

    attr.index = this.attrs.length;
    attr.id = this.attrIdGen++;

    this.attrs.push(attr);
    this.a.push(attr.typeClass.bind(attr.data));

    return this.a[this.a.length-1];
  }

  alloc() {
    let ei = this._alloc();

    this.length++;

    for (let attr of this.attrs) {
      attr.setDefault(ei);
    }

    return ei;
  }

  _alloc() {
    if (this.freelist.length > 0) {
      let i = this.freelist.pop();
      this.freemap.set(i, false);

      return i;
    }

    let newsize = ~~(this._size*1.5);
    this.resize(newsize);

    return this.alloc();
  }

  free(ei) {
    if (this.freemap.get(ei)) {
      throw new Error("element " + ei + " was already freed");
    }

    this.selected.delete(ei);

    this.smesh.eidgen.free(this.eid[ei]);

    this.freelist.push(ei);
    this.freemap.set(ei, true);
    this.length--;
  }

  getAttr(attrcls, name, defaultval, flag) {
    for (let attr of this.attrs) {
      if (attr.name === name) {
        return this.a[attr.index];
      }
    }

    return this.addAttr(attrcls, name, defaultval, flag);
  }

  bind() {
    this.eid = this.getAttr(Int32Attr, "eid", -1, SMeshAttrFlags.NO_COPY|SMeshAttrFlags.PRIVATE);
    this.flag = this.getAttr(Int32Attr, "flag", SMeshFlags.UPDATE);
    this.index = this.getAttr(Int32Attr, "index", -1, SMeshAttrFlags.NO_COPY);
  }

  loadSTRUCT(reader) {
    reader(this);

    this.a = [];

    for (let attr of this.attrs) {
      this.a.push(attr.typeClass.bind(attr.data));
    }

    this.freemap.clear();
    this.freemap.resize(this._size);

    let freemap = this.freemap;
    for (let i of this.freelist) {
      freemap.set(i, true);
    }

    let flag = this.flag;
    let SELECT = SMeshFlags.SELECT;

    for (let ei of this) {
      if (flag[ei] & SELECT) {
        this.selected.add(ei);
      }
    }

    this.bind();
  }
}
ElementList.STRUCT = `
smesh.ElementList {
  length    : int;
  _size     : int;
  attrs     : array(smesh.ElementAttr);
  freelist  : array(int);
  attrIdGen : int;
  type      : int;
  active    : int;
  highlight : int;
}
`;
nstructjs.register(ElementList);

export class VertexList extends ElementList {
  constructor(smesh) {
    super(SMeshTypes.VERTEX, smesh);
  }

  bind() {
    super.bind(); //will bind .eid

    this.co = this.getAttr(Float3Attr, "co");
    this.no = this.getAttr(Float3Attr, "no");
    this.e = this.getAttr(Int32Attr, "e");
    this.valence = this.getAttr(Int32Attr, "valence");
  }

  * neighbors(vi) {
    let edges = this.smesh.edges;

    for (let ei of this.edges(vi)) {
      yield edges.otherVertex(ei, vi);
    }
  }

  * edges(vi) {
    let e = this.e[vi];

    if (e === -1) {
      return;
    }

    let es = this.smesh.edges;

    let _i = 0;
    do {
      yield e;

      if (vi === es.v1[e]) {
        e = es.v1_next[e];
      } else if (vi === es.v2[e]) {
        e = es.v2_next[e];
      } else {
        throw new Error("internal mesh error");
      }

      if (_i++ > MAX_VERT_EDGES) {
        console.error("Infinite loop error");
        break;
      }
    } while (e !== this.e[vi]);
  }
}
VertexList.STRUCT = nstructjs.inherit(VertexList, ElementList, "smesh.VertexList") + `
}`;
nstructjs.register(VertexList);

export class EdgeList extends ElementList {
  constructor(smesh) {
    super(SMeshTypes.EDGE, smesh);
  }

  otherVertex(ei, vi) {
    if (vi === this.v1[ei]) {
      return this.v2[ei];
    } else if (vi === this.v2[ei]) {
      return this.v1[ei];
    } else {
      console.error("vertex " + vi + " is not in edge " + ei);
      return undefined;
    }
  }

  bind() {
    super.bind(); //will bind .eid

    this.v1 = this.getAttr(Int32Attr, "v1");
    this.v2 = this.getAttr(Int32Attr, "v2");

    this.v1_next = this.getAttr(Int32Attr, "v1_next");
    this.v1_prev = this.getAttr(Int32Attr, "v1_prev");

    this.v2_next = this.getAttr(Int32Attr, "v2_next");
    this.v2_prev = this.getAttr(Int32Attr, "v2_prev");

    this.l = this.getAttr(Int32Attr, "l", -1);
  }
}
EdgeList.STRUCT = nstructjs.inherit(EdgeList, ElementList, "smesh.EdgeList") + `
}`;
nstructjs.register(EdgeList);

export class LoopElemList extends ElementList {
  constructor(smesh) {
    super(SMeshTypes.LOOP, smesh);
  }

  bind() {
    super.bind();

    this.v = this.getAttr(Int32Attr, "v");
    this.e = this.getAttr(Int32Attr, "e");
    this.f = this.getAttr(Int32Attr, "f");
    this.radial_next = this.getAttr(Int32Attr, "radial_next");
    this.radial_prev = this.getAttr(Int32Attr, "radial_prev");
    this.next = this.getAttr(Int32Attr, "next");
    this.prev = this.getAttr(Int32Attr, "prev");
  }
}
LoopElemList.STRUCT = nstructjs.inherit(LoopElemList, ElementList, "smesh.LoopElemList") + `
}`;
nstructjs.register(LoopElemList);

let fliterstack = new Array(1024);
fliterstack.cur = 0;

export class FaceLoopIter {
  constructor() {
    this.ret = {done : true, value : undefined};
    this.done = true;
    this.fi = 0;
    this.li = 0;
    this.faces = undefined;
    this.loops = undefined;
    this._i = 0;
  }

  [Symbol.iterator]() {
    return this;
  }

  reset(faces, fi) {
    this.loops = faces.smesh.loops;
    this.fi = fi;
    this.faces = faces;
    this.li = faces.l[fi];
    this.done = false;
    this.ret.done = false;
    this.ret.value = undefined;
    this._i = 0;

    return this;
  }

  next() {
    let li = this.li, fi = this.fi;
    let faces = this.faces, loops = this.loops;

    if (this.li === -1) {
      return this.finish();
    }

    this.ret.value = li;

    if (this._i++ > MAX_FACE_VERTS) {
      console.error("Infinite loop error");
      return this.finish();
    }

    li = loops.next[li];

    if (li === faces.l[fi]) {
      this.li = -1;
    } else {
      this.li = li;
    }

    return this.ret;
  }

  finish() {
    if (!this.done) {
      this.done = true;
      this.ret.value = undefined;
      this.ret.done = true;
      fliterstack.cur--;
    }

    return this.ret;
  }

  return() {
    return this.finish();
  }
}

for (let i=0; i<fliterstack.length; i++) {
  fliterstack[i] = new FaceLoopIter();
}

let cotmp = new Vector3();

export class FaceList extends ElementList {
  constructor(smesh) {
    super(SMeshTypes.FACE, smesh);
  }

  bind() {
    super.bind();

    this.l = this.getAttr(Int32Attr, "l");
    this.no = this.getAttr(Float3Attr, "no");
    this.cent = this.getAttr(Float3Attr, "cent");
  }

  loops(fi) {
    return fliterstack[fliterstack.cur++].reset(this, fi);
  }

  * _loops(fi) {
    let _i = 0;
    let l = this.l[fi];
    let ls = this.smesh.loops;

    do {
      yield l;

      if (_i++ > MAX_FACE_VERTS) {
        console.error("Infinite loop error");
        break;
      }

      l = ls.next[l];
    } while (l !== this.l[fi]);
  }

  recalcNormal(fi) {
    let loops = this.smesh.loops;

    let l1 = this.l[fi];
    let l2 = loops.next[l1];
    let l3 = loops.next[l2];

    let verts = this.smesh.verts;

    let v1 = loops.v[l1];
    let v2 = loops.v[l2];
    let v3 = loops.v[l3];

    v1 = verts.co[v1];
    v2 = verts.co[v2];
    v3 = verts.co[v3];

    cotmp.zero();
    let tot = 0;

    for (let li of this.loops(fi)) {
      let vi = loops.v[li];
      cotmp.add(verts.co[vi]);
      tot++;
    }

    if (tot > 0) {
      cotmp.mulScalar(1.0 / tot);
    }

    this.cent[fi].load(cotmp);

    let n = math.normal_tri(v1, v2, v3);
    this.no[fi].load(n);
  }
}
FaceList.STRUCT = nstructjs.inherit(FaceList, ElementList, "smesh.FaceList") + `
}`;
nstructjs.register(FaceList);

export const ElementLists = {
  [SMeshTypes.VERTEX] : VertexList,
  [SMeshTypes.EDGE] : EdgeList,
  [SMeshTypes.LOOP] : LoopElemList,
  [SMeshTypes.FACE] : FaceList
};

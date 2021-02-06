import {AttrTypeClasses, Float3Attr, GeoAttr, Int32Attr} from './smesh_attributes.js';
import {nstructjs} from '../path.ux/scripts/pathux.js';
import {MAX_FACE_VERTS, MAX_VERT_EDGES, SMeshTypes} from './smesh_base.js';

function typedArrayStruct(typedclass,structType) {
  let name = typedclass.name;

  if (typedclass.STRUCT !== undefined) {
    return;
  }

  typedclass.STRUCT = `
${structName} {
  this : array(${structType}); 
}
`;

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
  constructor(typecls, name, elemType, index, category="") {
    this.data = [];
    this.type = type;
    this.name = name;
    this.typeClass = typecls;
    this.index = index;
    this.elemType = elemType;
    this.category = category;
    this.typeName = typecls.attrDefine().typeName;
    this.id = -1;
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

  loadSTRUCT(reader) {
    reader(this);

    this.typeClass = GeoAttr.getClass(this.typeName);
  }
}
ElementAttr.STRUCT = `
smesh.ElementAttr {
  data     : abstract(Object);
  type     : int;
  elemType : int;
  typeName : string;
  index    : int;
  category : string;
  name     : string;
  id       : int;
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
    }

    for (let i=old.length; i<map.length; i++) {
      map[i] = 0;
    }
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

  resize(newsize, setFreelist=true) {
    let old = this._size;

    this.freemap.resize(newsize);

    for (let attr of this.attrs) {
      attr.resize(newsize);
      this.a[attr.index] = attr.typeClass.bind(attr.data);
    }

    this._size = newsize;

    if (setFreelist) {
      for (let i=old; i<this._size; i++) {
        this.freelist.push(i);
      }
    }
  }

  addAttr(attrcls, name) {
    let attr = new ElementAttr(attrcls, name, this.type);
    attr.resize(this._size);

    attr.index = this.attrs.length;
    attr.id = this.attrIdGen++;

    this.attrs.push(attr);
    this.a.push(attr.typeClass.bind(attr.data));

    return this.a[this.a.length-1];
  }

  alloc() {
    if (this.freelist.length > 0) {
      let i = this.freelist.pop();
      this.freemap.set(i, false);

      return i;
    }

    let newsize = ~~(this._size*1.5);
    this.resize(newsize);

    return this.alloc();
  }

  getAttr(attrcls, name) {
    for (let attr of this.attrs) {
      if (attr.name === name) {
        return this.a[attr.index];
      }
    }

    return this.addAttr(attrcls, name);
  }

  bind() {
    this.eid = this.getAttr(Int32Attr, "eid");
    this.flag = this.getAttr(Int32Attr, "flag");
    this.index = this.getAttr(Int32Attr, "index");

    //throw new Error("implement me");
  }

  loadSTRUCT(reader) {
    reader(this);

    this.a = [];

    for (let attr of this.attrs) {
      this.a.push(attr.typeClass.bind(attr.data));
    }

    let freemap = this.freemap.resize(this._size);

    for (let i of this.freelist) {
      freemap.set(i, true);
    }

    this.bind();
  }
}
ElementList.STRUCT = `
smesh.ElementList {
  attrs     : array(ElementAttr);
  freelist  : array(intattrIdGen);
  _size     : int;
  attrIdGen : int;
  type      : int;
}
`;

export class VertexList extends ElementList {
  constructor(smesh) {
    super(SMeshTypes.VERTEX, smesh);
  }

  bind() {
    super.bind(); //will bind .eid

    this.co = this.getAttr(Float3Attr, "co");
    this.no = this.getAttr(Float3Attr, "no");
    this.e = this.getAttr(Int32Attr, "e");
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
      } else {
        e = es.v2_next[e];
      }

      if (_i++ > MAX_VERT_EDGES) {
        console.error("Infinite loop error");
        break;
      }
    } while (e !== this.e[vi]);
  }
}

export class EdgeList extends ElementList {
  constructor(smesh) {
    super(SMeshTypes.EDGE, smesh);
  }

  bind() {
    super.bind(); //will bind .eid

    this.v1 = this.getAttr(Int32Attr, "v1");
    this.v2 = this.getAttr(Int32Attr, "v2");

    this.v1_next = this.getAttr(Int32Attr, "v1_next");
    this.v1_prev = this.getAttr(Int32Attr, "v1_prev");

    this.v2_next = this.getAttr(Int32Attr, "v2_next");
    this.v2_prev = this.getAttr(Int32Attr, "v2_prev");

    this.l = this.getAttr(Int32Attr, "l");
  }
}

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

export class FaceList extends ElementList {
  constructor(smesh) {
    super(SMeshTypes.FACE, smesh);
  }

  * loops(fi) {
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

  bind() {
    super.bind();

    this.l = this.getAttr(Int32Attr, "l");
    this.no = this.getAttr(Float3Attr, "no");
    this.cent = this.getAttr(Float3Attr, "cent");
  }
}

export const ElementLists = {
  [SMeshTypes.VERTEX] : VertexList,
  [SMeshTypes.EDGE] : EdgeList,
  [SMeshTypes.LOOP] : LoopElemList,
  [SMeshTypes.FACE] : FaceList
};

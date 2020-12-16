import {EnumKeyPair, Matrix4, Vector2, Vector3, Vector4, util, nstructjs} from '../path.ux/scripts/pathux.js';
import {NodeSocketType, NodeFlags, SocketFlags} from './graph.js';

export class Matrix4Socket extends NodeSocketType {
  constructor(uiname, flag, default_value) {
    super(uiname, flag);

    this.value = new Matrix4(default_value);

    if (default_value === undefined) {
      this.value.makeIdentity();
    }
  }

  addToUpdateHash(digest) {
    digest.add(this.value);
  }

  static apiDefine(api, sockstruct) {
    let def = sockstruct.struct("value", "value", "Value", api.mapStruct(Matrix4));
    //def.on('change', function() { this.dataref.graphUpdate(true)});
  }

  static nodedef() {return {
    name : "mat4",
    uiname : "Matrix",
    color : [1,0.5,0.25,1]
  }}

  copy() {
    let ret = new Matrix4Socket(this.uiname, this.flag);
    this.copyTo(ret);
    return ret;
  }

  copyTo(b) {
    super.copyTo(b);

    b.value.load(this.value);
  }

  cmpValue(b) {
    return -1;
  }

  copyValue() {
    return new Matrix4(this.value);
  }

  diffValue(b) {
    let m1 = this.value.$matrix;
    let m2 = b.$matrix;

    let diff = 0.0, tot=0.0;

    for (let k in m1) {
      let a = m1[k], b = m2[k];

      diff += Math.abs(a-b);
      tot += 1.0;
    }

    return tot != 0.0 ? diff / tot : 0.0;
  }

  getValue() {
    return this.value;
  }

  setValue(val) {
    this.value.load(val);
  }
};
Matrix4Socket.STRUCT = nstructjs.inherit(Matrix4Socket, NodeSocketType, "graph.Matrix4Socket") + `
  value : mat4;
}
`;
nstructjs.register(Matrix4Socket);
NodeSocketType.register(Matrix4Socket);

export class DependSocket extends NodeSocketType {
  constructor(uiname, flag) {
    super(uiname, flag);

    this.value = false;
  }

  addToUpdateHash(digest) {
    //digest.add(0);
  }

  static nodedef() {return {
    name : "dep",
    uiname : "Dependency",
    color : [0.0,0.75,0.25,1]
  }}

  diffValue(b) {
    return (!!this.value != !!b)*0.001;
  }

  copyValue() {
    return this.value;
  }

  getValue() {
    return this.value;
  }

  setValue(b) {
    this.value = !!b;
  }

  cmpValue(b) {
    return !!this.value == !!b;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    this.value = !!this.value;
  }
};
DependSocket.STRUCT = nstructjs.inherit(DependSocket, NodeSocketType, "graph.DependSocket") + `
  value : int;
}
`;
nstructjs.register(DependSocket);
NodeSocketType.register(DependSocket);


export class IntSocket extends NodeSocketType {
  constructor(uiname, flag) {
    super(uiname, flag);

    this.value = 0;
  }

  static apiDefine(api, sockstruct) {
    let def = sockstruct.int("value", "value", "value");

    def.on('change', function() { this.dataref.graphUpdate(true)});

    if (this.graph_flag & SocketFlags.NO_UNITS) {
      def.noUnits();
    }
  }

  static nodedef() {return {
    name : "int",
    uiname : "Integer",
    color : [0.0,0.75,0.25,1]
  }}

  diffValue(b) {
    return (this.value - b);
  }

  copyValue() {
    return ~~this.value;
  }

  getValue() {
    return ~~this.value;
  }

  setValue(b) {
    this.value = ~~b;
  }

  cmpValue(b) {
    return ~~this.value !== ~~b;
  }

  addToUpdateHash(digest) {
    digest.add(this.value);
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    this.value = ~~this.value;
  }
};
IntSocket.STRUCT = nstructjs.inherit(IntSocket, NodeSocketType, "graph.IntSocket") + `
  value : int;
}
`;
nstructjs.register(IntSocket);
NodeSocketType.register(IntSocket);

export class Vec2Socket extends NodeSocketType {
  constructor(uiname, flag, default_value) {
    super(uiname, flag);

    this.value = new Vector2(default_value);
  }

  static apiDefine(api, sockstruct) {
    let def = sockstruct.vec2('value', 'value', 'value');

    def.on('change', function() { this.dataref.graphUpdate(true)});

    if (this.graph_flag & SocketFlags.NO_UNITS) {
      def.noUnits();
    }
  }

  static nodedef() {return {
    name : "Vec2",
    uiname : "Vector",
    color : [0.25, 0.45, 1.0, 1]
  }}

  addToUpdateHash(digest) {
    digest.add(this.value[0]);
    digest.add(this.value[1]);
  }

  copyTo(b) {
    super.copyTo(b);
    b.value.load(this.value);
  }

  diffValue(b) {
    return this.value.vectorDistance(b);
  }

  copyValue() {
    return new Vector2(this.value);
  }

  getValue() {
    return this.value;
  }

  setValue(b) {
    this.value.load(b);
  }

  //eh. . .dot product?
  cmpValue(b) {
    return this.value.dot(b);
  }
};
Vec2Socket.STRUCT = nstructjs.inherit(Vec2Socket, NodeSocketType, "graph.Vec2Socket") + `
  value : vec2;
}
`;
nstructjs.register(Vec2Socket);
NodeSocketType.register(Vec2Socket);

//abstract base class
export class VecSocket extends NodeSocketType {
  buildUI(container) {
    if (this.edges.length === 0) {
      container.vecpopup("value");
    } else {
      container.label(this.uiname);
    }
  }

}

export class Vec3Socket extends VecSocket {
  constructor(uiname, flag, default_value) {
    super(uiname, flag);

    this.value = new Vector3(default_value);
  }

  static apiDefine(api, sockstruct) {
    let cb = NodeSocketType._api_uiname;
    let def = sockstruct.vec3('value', 'value', 'value').uiNameGetter(cb);

    def.on('change', function() { this.dataref.graphUpdate(true)});

    //if (this.graph_flag & SocketFlags.NO_UNITS) {
      def.noUnits();
    //}
  }

  static nodedef() {return {
    name : "vec3",
    uiname : "Vector",
    color : [0.25, 0.45, 1.0, 1]
  }}

  addToUpdateHash(digest) {
    digest.add(this.value[0]);
    digest.add(this.value[1]);
    digest.add(this.value[2]);
  }

  copyTo(b) {
    super.copyTo(b);

    b.value.load(this.value);
  }

  diffValue(b) {
    return this.value.vectorDistance(b);
  }

  copyValue() {
    return new Vector3(this.value);
  }

  getValue() {
    return this.value;
  }

  setValue(b) {
    this.value.load(b);
  }

  //eh. . .dot product?
  cmpValue(b) {
    return this.value.dot(b);
  }
};
Vec3Socket.STRUCT = nstructjs.inherit(Vec3Socket, NodeSocketType, "graph.Vec3Socket") + `
  value : vec3;
}
`;
nstructjs.register(Vec3Socket);
NodeSocketType.register(Vec3Socket);

export class Vec4Socket extends NodeSocketType {
  constructor(uiname, flag, default_value) {
    super(uiname, flag);

    this.value = new Vector4(default_value);
  }

  static nodedef() {return {
    name : "vec4",
    uiname : "Vector4",
    color : [0.25, 0.45, 1.0, 1]
  }}

  static apiDefine(api, sockstruct) {
    let def = sockstruct.vec4('value', 'value', 'value');

    def.on('change', function() { this.dataref.graphUpdate(true)});

    if (this.graph_flag & SocketFlags.NO_UNITS) {
      def.noUnits();
    }
  }

  addToUpdateHash(digest) {
    digest.add(this.value[0]);
    digest.add(this.value[1]);
    digest.add(this.value[2]);
    digest.add(this.value[3]);
  }


  diffValue(b) {
    return this.value.vectorDistance(b);
  }

  copyValue() {
    return new Vector4(this.value);
  }

  getValue() {
    return this.value;
  }

  copyTo(b) {
    super.copyTo(b);

    b.value.load(this.value);
  }

  setValue(b) {
    if (isNaN(this.value.dot(b))) {
      console.warn(this, b);
      throw new Error("NaN!");
    }
    this.value.load(b);
  }

  //eh. . .dot product?
  cmpValue(b) {
    return this.value.dot(b);
  }
};
Vec4Socket.STRUCT = nstructjs.inherit(Vec4Socket, NodeSocketType, "graph.Vec4Socket") + `
  value : vec4;
}
`;
nstructjs.register(Vec4Socket);
NodeSocketType.register(Vec4Socket);


export class RGBSocket extends Vec3Socket {
  constructor(uiname, flag, default_value=[0.5, 0.5, 0.5]) {
    super(uiname, flag, default_value);
  }

  static nodedef() {return {
    name : "rgb",
    uiname : "Color",
    color : [1.0, 0.7, 0.7, 1]
  }}

  static apiDefine(api, sockstruct) {
    let def = sockstruct.color3('value', 'value', 'value').uiNameGetter(NodeSocketType._api_uiname);

    def.on('change', function() { this.dataref.graphUpdate(true)});
  }

  buildUI(container, onchange) {
    if (this.edges.length === 0) {
      container.colorbutton("value");
      /*
      container.button(this.uiname, () => {
        console.log("edit color, yay");

        let colorpicker = container.ctx.screen.popup(container);
        let widget = colorpicker.colorPicker("value");

        widget.onchange = onchange;
      });//*/
    } else {
      container.label(this.uiname);
    }
  }
}
RGBSocket.STRUCT = nstructjs.inherit(RGBSocket, Vec3Socket, 'graph.RGBSocket') + `
}
`;
nstructjs.register(RGBSocket);
NodeSocketType.register(RGBSocket);

export class RGBASocket extends Vec4Socket {
  constructor(uiname, flag, default_value=[0.5, 0.5, 0.5, 1.0]) {
    super(uiname, flag, default_value);
  }

  static nodedef() {return {
    name : "rgba",
    uiname : "Color",
    color : [1.0, 0.7, 0.4, 1]
  }}

  static apiDefine(api, sockstruct) {
    let def = sockstruct.color4('value', 'value', 'value').uiNameGetter(NodeSocketType._api_uiname);

    def.on('change', function() { this.dataref.graphUpdate(true)});
  }

  buildUI(container, onchange) {
    if (this.edges.length === 0) {
      container.colorbutton("value");
      /*
      container.button(this.uiname, () => {
        console.log("edit color, yay");

        let colorpicker = container.ctx.screen.popup(container);
        let widget = colorpicker.colorPicker("value");

        widget.onchange = onchange;
      });//*/
    } else {
      container.label(this.uiname);
    }
  }
}
RGBASocket.STRUCT = nstructjs.inherit(RGBASocket, Vec4Socket, 'graph.RGBASocket') + `
}
`;
nstructjs.register(RGBASocket);
NodeSocketType.register(RGBASocket);

export class FloatSocket extends NodeSocketType {
  constructor(uiname, flag, default_value=0.0) {
    super(uiname, flag);

    this.value = default_value;
  }

  addToUpdateHash(digest) {
    digest.add(this.value);
  }

  static apiDefine(api, sockstruct) {
    let def = sockstruct.float('value', 'value', 'value');

    if (this.graph_flag & SocketFlags.NO_UNITS) {
      def.noUnits();
    }

    def.on('change', function() { this.dataref.graphUpdate(true)});
  }

  static nodedef() {return {
    name : "float",
    uiname : "Value",
    color : [1.25, 0.45, 1.0, 1]
  }}

  buildUI(container, onchange) {
    if (this.edges.length === 0) {
      let ret = container.prop("value");
      ret.setAttribute("name", this.uiname);

      ret.onchange = onchange;
    } else {
      container.label(this.uiname);
    }
  }

  diffValue(b) {
    return Math.abs(this.value - b);
  }

  copyValue() {
    return this.value;
  }

  getValue() {
    return this.value;
  }

  copyTo(b) {
    super.copyTo(b);

    b.value = this.value;
  }

  setValue(b) {
    if (isNaN(b)) {
      console.warn(this, b);
      throw new Error("NaN!");
    }

    this.value = b;
  }

  //eh. . .dot product?
  cmpValue(b) {
    return this.value - b;
  }
};
FloatSocket.STRUCT = nstructjs.inherit(FloatSocket, NodeSocketType, "graph.FloatSocket") + `
  value : float;
}
`;
nstructjs.register(FloatSocket);
NodeSocketType.register(FloatSocket);

export class EnumSocket extends IntSocket {
  constructor(uiname, items={}, flag, default_value=undefined) {
    super(uiname, flag);

    this.graph_flag |= SocketFlags.INSTANCE_API_DEFINE;

    this.items = {};
    this.value = 0;

    if (items !== undefined) {
      for (let k in items) {
        this.items[k] = items[k];
      }
    }

    if (default_value !== undefined) {
      this.value = default_value;
    }

    this.uimap = {};
    for (let k in this.items) {
      let k2 = k.split("-_ ");
      let uiname = "";

      for (let item of k2) {
        uiname += k[0].toUpperCase() + k.slice(1, k.length).toLowerCase() + " ";
      }

      let v = this.items[k];
      this.uimap[k] = uiname.trim();
    }
  }


  addToUpdateHash(digest) {
    digest.add(this.value);
  }

  apiDefine(api, sockstruct) {
    let def;

    def = sockstruct.enum('value', 'value', this.items, this.uiname).uiNames(this.uimap);
    def.on('change', function() {
      this.dataref.graphUpdate(true);
    });
  }

  addUiItems(items) {
    for (let k in items) {
      this.uimap[k] = items[k];
    }
  }
  static nodedef() {return {
    name : "enum",
    uiname : "Enumeration",
    graph_flag : SocketFlags.INSTANCE_API_DEFINE,
    color : [0.0,0.75,0.25,1]
  }}

  diffValue(b) {
    return (this.value - b);
  }

  copyValue() {
    return ~~this.value;
  }

  copyTo(b) {
    super.copyTo(b);

    b.items = Object.assign({}, this.items);
    b.uimap = Object.assign({}, this.uimap);

    return this;
  }

  getValue() {
    return ~~this.value;
  }

  setValue(b) {
    if (b === undefined || b === "") {
      return;
    }

    if (typeof b === "string") {
      if (b in this.items) {
        b = this.items[b];
      } else {
        throw new Error("bad enum item" + b);
      }
    }

    this.value = ~~b;
  }

  _saveMap(obj) {
    obj = obj === undefined ? {} : obj;
    let ret = [];

    for (let k in obj) {
      ret.push(new EnumKeyPair(k, obj[k]));
    }

    return ret;
  }

  onFileLoad(socketTemplate) {
    this.items = Object.assign({}, socketTemplate.items);
    this.uimap = Object.assign({}, socketTemplate.uimap);
    //console.log("Enumeration type load!", this.graph_id, this.items);
  }

  _loadMap(obj) {
    if (!obj || !Array.isArray(obj)) {
      return {};
    }

    let ret = {};
    for (let k of obj) {
      ret[k.key] = k.val;
    }

    return ret;
  }

  /*
  get items() {
    return this._items;
  }
  set items(v) {
    console.error(this.graph_id, "items set", v);
    this._items = v;
  }//*/

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    //note that onFileLoad overwrites this in
    //most cases
    this.items = this._loadMap(this.items);
    this.uimap = this._loadMap(this.uimap);

    //force this flag
    this.graph_flag |= SocketFlags.INSTANCE_API_DEFINE;
  }

  cmpValue(b) {
    return ~~this.value !== ~~b;
  }
};
EnumSocket.STRUCT = nstructjs.inherit(EnumSocket, IntSocket, "graph.EnumSocket") + `
  items : array(EnumKeyPair) | this._saveMap(this.items);
  uimap : array(EnumKeyPair) | this._saveMap(this.uimap);
}
`;
nstructjs.register(EnumSocket);
NodeSocketType.register(EnumSocket);


export class BoolSocket extends NodeSocketType {
  constructor(uiname, flag) {
    super(uiname, flag);

    this.value = 0;
  }

  static apiDefine(api, sockstruct) {
    sockstruct.bool("value", "value", "value");
  }

  static nodedef() {return {
    name : "bool",
    uiname : "Boolean",
    color : [0.0,0.75,0.25,1]
  }}

  addToUpdateHash(digest) {
    digest.add(this.value);
  }

  diffValue(b) {
    return (this.value - b);
  }

  copyValue() {
    return ~~this.value;
  }

  getValue() {
    return !!this.value;
  }

  setValue(b) {
    this.value = !!b;
  }

  cmpValue(b) {
    return !!this.value !== !!b;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    this.value = !!this.value;
  }
};
BoolSocket.STRUCT = nstructjs.inherit(BoolSocket, NodeSocketType, "graph.BoolSocket") + `
  value : bool;
}
`;
nstructjs.register(BoolSocket);
NodeSocketType.register(BoolSocket);

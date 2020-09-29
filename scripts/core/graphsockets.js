import {Matrix4, Vector2, Vector3, Vector4, util, nstructjs} from '../path.ux/scripts/pathux.js';
import {NodeSocketType, NodeFlags, SocketFlags} from './graph.js';

export class Matrix4Socket extends NodeSocketType {
  constructor(uiname, flag, default_value) {
    super(uiname, flag);

    this.value = new Matrix4(default_value);

    if (default_value === undefined) {
      this.value.makeIdentity();
    }
  }

  static apiDefine(api, sockstruct) {
    sockstruct.struct("value", "value", "Value", api.mapStruct(Matrix4));
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
    sockstruct.int("value", "value", "value");
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

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    this.value = !!this.value;
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
    sockstruct.vec2('value', 'value', 'value');
  }

  static nodedef() {return {
    name : "Vec2",
    uiname : "Vector",
    color : [0.25, 0.45, 1.0, 1]
  }}

  copyTo(b) {
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
    sockstruct.vec3('value', 'value', 'value');
  }

  static nodedef() {return {
    name : "vec3",
    uiname : "Vector",
    color : [0.25, 0.45, 1.0, 1]
  }}

  copyTo(b) {
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
    sockstruct.vec4('value', 'value', 'value');
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
    sockstruct.color4('value', 'value', 'value');
  }

  buildUI(container, onchange) {
    if (this.edges.length === 0) {
      container.colorbutton(container._joinPrefix("value"));
      /*
      container.button(this.uiname, () => {
        console.log("edit color, yay");

        let colorpicker = container.ctx.screen.popup(container);
        let widget = colorpicker.colorPicker(container._joinPrefix("value"));

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

  static apiDefine(api, sockstruct) {
    sockstruct.float('value', 'value', 'value');
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

    this.items = {};
    this.value = 0;

    if (default_value !== undefined) {
      this.value = default_value;
    }

    this.uimap = {};
    for (let k in this.items) {
      let k2 = k2.split("-_ ");
      let uiname = "";

      for (let item of k2) {
        uiname += k[0].toUpperCase() + k.slice(1, k.length).toLowerCase() + " ";
      }

      let v = this.items[k];
      this.uimap[k] = this.items[v] = uiname.trim();
    }
  }

  static apiDefine(api, sockstruct) {
    sockstruct.enum('value', 'value', this.items, 'value').uiNames(this.uimap);
  }

  addUiItems(items) {
    for (let k in items) {
      this.uimap[k] = items[k];
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

  cmpValue(b) {
    return ~~this.value !== ~~b;
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    this.value = !!this.value;
  }
};
EnumSocket.STRUCT = nstructjs.inherit(EnumSocket, IntSocket, "graph.EnumSocket") + `
}
`;
nstructjs.register(EnumSocket);
NodeSocketType.register(EnumSocket);

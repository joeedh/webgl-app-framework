let _graph = undefined;

define([
  "util", "vectormath", "simplemesh"
], function(util, vectormath, simplemesh) {
  "use strict";
  
  let exports = _graph = {};
  
  let Matrix4 = vectormath.Matrix4;
  let Vector3 = vectormath.Vector3;
  let Vector4 = vectormath.Vector4;
  
  let GraphCycleError = exports.GraphCycleError = class GraphCycleError extends Error {};
  
  let SocketFlags = exports.SocketFlags = {
    SELECT : 1, //for use by ui
    UPDATE : 2,
    MULTI  : 4, //socket can have multiple connections, enable by default for outputs
    NO_MULTI_OUTPUTS : 8 //don't flag outputs with MULTI by default
  };
  
  let NodeFlags = exports.NodeFlags = {
    SELECT    : 1, //for use by ui
    UPDATE    : 2,
    SORT_TAG  : 4,
    CYCLE_TAG : 8,
    DISABLED  : 16
  };
  
  let GraphFlags = exports.GraphFlags = {
    SELECT : 1, //for use by ui
    RESORT : 2,
    CYCLIC_ALLOWED : 4, //graph may have cycles, set by user
    CYCLIC : 8 //graph has cycles, is set in graph.sort()
  };
  
  //used by Node.inherit
  class InheritFlag {
    constructor(data) {
      this.data = data;
    }
  };
  
  let NodeSocketType = exports.NodeSocketType = class NodeSocketType {
    constructor(uiname=undefined, flag=0) {
      if (uiname === undefined) {
        uiname = this.constructor.nodedef().uiname;
      }
      
      this.uiname = uiname;
      this.name = this.constructor.nodedef().name;
      
      let def = this.constructor.nodedef();
      if (def.flag !== undefined) {
        flag |= def.flag;
      }
      
      this.edges = [];
      this.node = undefined;
      this.flag = flag;
      this.id = -1;
    }
    
    copyValue() {
      throw new Error("implement me");
    }
    
    cmpValue(b) {
      throw new Error("implement me");
    }
    
    //return float value representing difference with value b
    diffValue(b) {
      throw new Error("implement me");
    }
    
    connect(sock) {
      this.edges.push(sock);
      sock.edges.push(this);
      
      this.node.update();
      sock.node.update();
      this.node.graph.flagResort();
      
      return this;
    }
    
    disconnect(sock) {
      this.edges.remove(sock);
      sock.edges.remove(this);
      
      this.node.update();
      sock.node.update();
      this.node.graph.flagResort();
      
      return this;
    }
    
    static nodedef() { return {
      name   : "name",
      uiname : "uiname",
      color  : undefined,
      flag   : 0
    }}
    
    //for the sake of sane, performant code,
    //this is allowed to return a reference, but client
    //code is *only allowed to modify that reference's data
    //inside of the owning Node class's exec method*
    getValue() {
      throw new Error("implement me!");
    }
    
    setValue(val) {
      throw new Error("implement me!");
    }
    
    copyTo(b) {
      b.flag = this.flag;
      b.name = this.name;
      b.uiname = this.uiname;
      b.node = this.node;
    }
    
    update(_exclude=undefined) {
      if (this === _exclude)
        return;
      
      this.flag |= NodeFlags.UPDATE;
      
      for (let sock of this.edges) {
        sock.setValue(this.getValue());
        sock.node.update();
      }
      
      return this;
    }
    
    copy() {
      let ret = new this.constructor();
      this.copyTo(ret);
      
      return ret;
    }
  }
  
  let Node = exports.Node = class Node {
    constructor(flag=0) {
      let def = this.constructor.nodedef();

      if (def.flag !== undefined) {
        flag |= def.flag;
      }

      this.flag = flag | NodeFlags.UPDATE;
      this.id = -1;
      this.graph = undefined;
      
      let getsocks = (key) => {
        let obj = def[key];
        let ret = {};
        
        if (obj instanceof InheritFlag) {
          let p = this.constructor;
          
          while (p !== null && p !== undefined && p !== Object && p !== Node) {
            if (p.nodedef === undefined) continue;
            let obj2 = p.nodedef()[key];
            
            if (obj2 !== undefined) {
              for (let k in obj2) {
                if (!(k in ret)) {
                  ret[k] = obj2[k].copy();
                }
              }
            }
            
            p = p.prototype.__proto__.constructor;
          }
        } else if (obj !== undefined) {
          for (let k in obj) {
            ret[k] = obj[k].copy();
          }
        }
        
        for (let k in ret) {
          ret[k].node = this;
        }
        
        return ret;
      }
      
      this.inputs = getsocks("inputs");
      this.outputs = getsocks("outputs");
      
      for (let sock of this.allsockets) {
        sock.node = this;
      }
      
      for (let k in this.inputs) {
        this.inputs[k].node = this;
      }
      for (let k in this.outputs) {
        this.outputs[k].node = this;
      }
      
      for (let k in this.outputs) {
        let sock = this.outputs[k];
        
        if (!(sock.flag & SocketFlags.NO_MULTI_OUTPUTS)) {
          sock.flag |= SocketFlags.MULTI;
        }
      }
      
      this.icon = -1;
    }
    
    static nodedef() {return {
      name   : "name",
      uiname : "uiname",
      flag   : 0,
      inputs : {}, //can inherit from parent class by wrapping in Node.inherit({})
      outputs : {}        
    }}
    
    static inherit(obj) {
      return new InheritFlag(obj);
    }
    
    get allsockets() {
      let this2 = this;
      return (function*() {
        for (let k in this2.inputs) {
          yield this2.inputs[k];
        }
        for (let k in this2.outputs) {
          yield this2.outputs[k];
        }
      })();
    }
    copyTo(b) {
      b.name = this.name;
      b.uiname = this.uiname;
      b.icon = this.icon;
      b.flag = this.flag;
      
      for (let i=0; i<2; i++) {
        let sockets1 = i ? this.outputs : this.inputs;
        let sockets2 = i ? b.outputs : b.inputs;
        
        for (let k in sockets1) {
          let sock1 = sockets1[k];
          
          if (!k in sockets2) {
            sockets2[k] = sock1.copy();
          }
          
          let sock2 = sockets2[k];
          sock2.setValue(sock1.getValue());
        }
      }
    }
    
    copy() {
      let ret = new this.constructor();
      this.copyTo(ret);
      
      return ret;
    }
    
    /**state is provided by client code
     *exec should call update on output sockets itself
     *DO NOT call super() unless you want to send an update signal to all
     *output sockets
     */
    exec(state) {
      //default implementation simply flags all output sockets
      for (let k in this.outputs) {
        this.outputs[k].update();
      }
    }
    
    update() {
      this.flag |= NodeFlags.UPDATE;
      return this;
    }
  }
  
  let Graph = exports.Graph = class Graph {
    constructor() {
      this.nodes = [];
      this.sortlist = [];
      this.flag = 0;
      this.max_cycle_steps = 64;
      this.cycle_stop_threshold = 0.0005; //stop cyclic solver when change per socket is less than this

      this.idgen = 0;
      this.node_idmap = {};
    }
    
    flagResort() {
      this.flag |= GraphFlags.RESORT;
    }
    
    sort() {
      let sortlist = this.sortlist;
      let nodes = this.nodes;
      
      this.flag &= ~NodeFlags.CYCLIC;
      
      sortlist.length = 0;

      for (let n of nodes) {
        n.flag &= ~(NodeFlags.SORT_TAG|NodeFlags.CYCLE_TAG);
      }
      
      let dosort = (n) => {
        if (n.flag & NodeFlags.CYCLE_TAG) {
          console.warn("Warning: graph cycle detected!");
          this.flag |= GraphFlags.CYCLIC;
          return;
        }
        
        if (n.flag & NodeFlags.SORT_TAG) {
          return;
        }
        
        n.flag |= NodeFlags.SORT_TAG;
        n.flag |= NodeFlags.CYCLE_TAG;
        
        for (let k in n.inputs) {
          let s1 = n.inputs[k];
          
          for (let s2 of s1.edges) {
            let n2 = s2.node;
            
            if (!(n2.flag & NodeFlags.SORT_TAG)) {
              dosort(n2);
            }
          }
        }
        
        sortlist.push(n);
        
        n.flag &= ~NodeFlags.CYCLE_TAG;
      }
      
      for (let n of nodes) {
        dosort(n);
      }

      //we may not have caught all cycle cases
      
      let cyclesearch = (n) => {
        if (n.flag & NodeFlags.CYCLE_TAG) {
          console.warn("Warning: graph cycle detected!");
          this.flag |= GraphFlags.CYCLIC;
          return true;
        }
        
        for (let k in n.outputs) {
          let s1 = n.outputs[k];
          
          n.flag |= NodeFlags.CYCLE_TAG;
          for (let s2 of s1.edges) { 
            let ret = cyclesearch(s2.node);
            if (ret)
              return ret;
          }
          n.flag &= ~NodeFlags.CYCLE_TAG;
        }
      }
      
      for (let n of this.nodes) {
        if (cyclesearch(n))
          break;
      }
      
      this.flag &= ~GraphFlags.RESORT;
    }
    
    _cyclic_step(context) {
      let sortlist = this.sortlist;
      
      for (let n of sortlist) {
        if (n.flag & NodeFlags.DISABLED) {
          continue;
        }
        if (!(n.flag & NodeFlags.UPDATE)) {
          continue;
        }
        
        n.flag &= ~NodeFlags.UPDATE;
        n.exec(context);
      }

      let change = 0.0;//, tot = 0.0;
      
      for (let n of sortlist) {
        if (n.flag & NodeFlags.DISABLED) {
          continue;
        }
        if (!(n.flag & NodeFlags.UPDATE)) {
          continue;
        }
        
        for (let sock of n.allsockets) {
          let diff = Math.abs(sock.diffValue(sock._old));
          
          if (isNaN(diff)) {
            console.warn("Got NaN from a socket's diffValue method!", sock);
            continue;
          }
          
          change += diff;
          //tot += 1.0;
          
          sock._old = sock.copyValue();
        }
      }
      
      return change; //tot > 0.0 ? change : 0.0;
    }
    
    _cyclic_exec(context) {
      //console.log("cycle exec", this.sortlist.length, this.nodes.length);
      
      let sortlist = this.sortlist;
      
      for (let n of sortlist) {
        if (n.flag & NodeFlags.DISABLED) {
          continue;
        }
        
        for (let sock of n.allsockets) {
          sock._old = sock.copyValue();
        }
      }
      
      for (let i=0; i<this.max_cycle_steps; i++) {
        let limit = this.cycle_stop_threshold;
        let change = this._cyclic_step(context);
        
        //console.log("change", change.toFixed(5), limit);
        
        if (Math.abs(change) < limit) {
          break;
        }
      }
    }
    
    //context is provided by client code
    exec(context, force_single_solve=false) {
      if (this.flag & GraphFlags.RESORT) {
        console.log("resorting graph");
        this.sort();
      }
      
      if ((this.flag & GraphFlags.CYCLIC) && !(this.flag & GraphFlags.CYCLIC_ALLOWED)) {
        throw new Error("cycles in graph now allowed");
      } else if (!force_single_solve && (this.flag & GraphFlags.CYCLIC)) {
        return this._cyclic_exec(context);
      }
      
      let sortlist = this.sortlist;
      
      for (let node of sortlist) {
        if (node.flag & NodeFlags.DISABLED) {
          continue;
        }
        
        if (node.flag & NodeFlags.UPDATE) {
          node.flag &= ~NodeFlags.UPDATE;
          node.exec(context);
        }
      }
    }
    
    update() {
    }
    
    remove(node) {
      if (node.id == -1) {
        console.warn("Warning, twiced to remove node not in graph (double remove?)", node.id, node);
        return;
      }
      
      delete this.node_idmap[node.id];
      this.nodes.remove(node);
      node.id = -1;
    }
    
    add(node) {
      if (node.id !== -1) {
        console.warn("Warning, tried to add same node twice", node.id, node);
        return;
      }
      
      node.graph = this;
      node.id = this.idgen++;
      
      for (let k in node.inputs) {
        let sock = node.inputs[k];
        sock.id = this.idgen++;
      }
      
      for (let k in node.outputs) {
        let sock = node.outputs[k];
        sock.id = this.idgen++;
      }
      
      this.node_idmap[node.id] = node;
      this.nodes.push(node);
      
      this.flagResort();
      node.flag |= NodeFlags.UPDATE;
      
      return this;
    }
  }
  
  let Matrix4Socket = exports.Matrix4Socket = class Matrix4Socket extends NodeSocketType {
    constructor(uiname, flag) {
      super(uiname, flag);
      
      this.value = new Matrix4();
    }
    
    static nodedef() {return {
      name : "mat4",
      uiname : "Matrix",
      color : [1,,0.5,0.25,1]
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
  
  let DependSocket = exports.DependSocket = class DependSocket extends NodeSocketType {
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
  };
  
  let Vec3Socket = exports.Vec3Socket =  class Vec3Socket extends NodeSocketType {
    constructor(uiname, flag) {
      super(uiname, flag);
      
      this.value = new Vector3();
    }
    
    static nodedef() {return {
      name : "vec3",
      uiname : "Vector",
      color : [0.25, 0.45, 1.0, 1]
    }}
    
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
  
  let Vec4Socket = exports.Vec4Socket =  class Vec4Socket extends NodeSocketType {
    constructor(uiname, flag) {
      super(uiname, flag);
      
      this.value = new Vector4();
    }
    
    static nodedef() {return {
      name : "vec4",
      uiname : "Vector4",
      color : [0.25, 0.45, 1.0, 1]
    }}
    
    diffValue(b) {
      return this.value.vectorDistance(b);
    }
    
    copyValue() {
      return new Vector4(this.value);
    }
    
    getValue() {
      return this.value;
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
  
  exports.test = function test(exec_cycles=true) {
    let ob1, ob2;
    
    class SceneObject extends Node {
      constructor(mesh) {
        super();
        this.mesh = mesh;
      }
      
      static nodedef() {return {
        inputs : {
          depend : new DependSocket("depend", SocketFlags.MULTI),
          matrix : new Matrix4Socket("matrix"),
          color  : new Vec4Socket("color"),
          loc    : new Vec3Socket("loc")
        },
        
        outputs : {
          color : new Vec4Socket("color"),
          matrix : new Matrix4Socket("matrix"),
          depend : new DependSocket("depend")
        }
      }}
      
      getLoc() {
        let p = new Vector3();
        
        p.multVecMatrix(this.outputs.matrix.getValue());
        
        return p;
      }
      
      exec() {
        let pmat = this.inputs.matrix.getValue();
        if (this.inputs.matrix.edges.length > 0) {
          pmat = this.inputs.matrix.edges[0].getValue();
        }
        let loc = this.inputs.loc.getValue();
        
        let mat = this.outputs.matrix.getValue();
        
        mat.makeIdentity();
        mat.translate(loc[0], loc[1], loc[2]);
        mat.multiply(pmat);
        
        this.outputs.matrix.setValue(mat);
        this.outputs.depend.setValue(true);

        this.outputs.matrix.update();
        this.outputs.depend.update();
        
        let color = this.inputs.color.getValue();
        
        if (this.inputs.color.edges.length > 0) {
          let ob1 = this, ob2 = this.inputs.color.edges[0].node;
          let p1 = ob1.getLoc(), p2 = ob2.getLoc();
          
          let f = p1.vectorDistance(p2);
          
          color[0] = color[1] = f;
          color[3] = 1.0;
        }
        
        this.outputs.color.setValue(color);
        this.outputs.color.update();
        
        this.mesh.uniforms.objectMatrix = this.outputs.matrix.getValue();
        //console.log("node exec", this.id, this.graph.sortlist[0].id, this.graph.sortlist[1].id);
      }
    }
    
    let mesh = new simplemesh.SimpleMesh();
    let gl = _appstate.gl;
    mesh.program = gl.program;
    
    let m1 = mesh.island;
    let m2 = mesh.add_island();
    
    m1.tri([-1, -1, 0], [0, 1, 0], [1, -1, 0]); 
    m2.tri([-1, -1, 0.1], [0, 1, 0.1], [1, -1, 0.1]);
    
    m1.uniforms = {};
    m2.uniforms = {};
    
    ob1 = new SceneObject(m1);
    ob2 = new SceneObject(m2);
    
    let graph = new Graph();
    graph.flag |= GraphFlags.CYCLIC_ALLOWED;
    graph.add(ob1);
    graph.add(ob2);

    ob1.inputs.color.setValue(new Vector4([0, 0, 0, 1]));
    ob2.inputs.color.setValue(new Vector4([1, 0.55, 0.25, 1]));
    
    //console.log(list(ob1.allsockets));
    
    ob1.outputs.matrix.connect(ob2.inputs.matrix);
    ob2.outputs.color.connect(ob1.inputs.color);
    
    let last = ob2;
    let x = 1.0;
    let z = .2;
    
    //make a chain!
    for (let i=0; i<35; i++) {
      let m2 = mesh.add_island();
      
      m2.tri([-1, -1, z], [0, 1, z], [1, -1, z]);
      z += .001;
      m2.uniforms = {};
      
      let ob = new SceneObject(m2);
      graph.add(ob);
      
      ob.inputs.loc.setValue(new Vector3([x-0.3, i*0.01, 0.0]));
      
      last.inputs.color.connect(ob.outputs.color);
      last.outputs.matrix.connect(ob.inputs.matrix);
      
      last = ob;
      m2.uniforms.objectMatrix = ob.outputs.matrix.getValue();
      m2.uniforms.uColor = ob.outputs.color.getValue();
      
      x += 0.001;
    }
    //don't start out in topological order
    //graph.nodes.reverse();
    
    _appstate.mesh = mesh;

    let loc = new Vector3();
    
    let t = 0.0;
    
    ob2.inputs.loc.setValue(new Vector3([0.5, 0.0, 0.0]));
    window.d = 0;
    
    window.setInterval(() => {
      loc[0] = Math.cos(t+window.d)*0.95 + window.d;
      loc[1] = Math.sin(t)*0.95;
      
      ob1.inputs.loc.setValue(loc);
      ob1.update();
      
      graph.max_cycle_steps = 128;
      graph.exec(undefined, !exec_cycles);
      
      m1.uniforms.objectMatrix = ob1.outputs.matrix.getValue();
      m2.uniforms.objectMatrix = ob2.outputs.matrix.getValue();
      
      m1.uniforms.uColor = ob1.outputs.color.getValue();
      m2.uniforms.uColor = [0, 0, 0, 1];//ob2.outputs.color.getValue();
      
      t += 0.05;
      window.redraw_all();
    }, 10);    
  }
  
  return exports;
});

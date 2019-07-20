let _graph = undefined;

import {Matrix4, Vector2, Vector3, Vector4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

export class GraphCycleError extends Error {};

export const SocketFlags = {
  SELECT : 1, //for use by ui
  UPDATE : 2,
  MULTI  : 4, //socket can have multiple connections, enable by default for outputs
  NO_MULTI_OUTPUTS : 8 //don't flag outputs with MULTI by default
};

export const NodeFlags = {
  SELECT    : 1, //for use by ui
  UPDATE    : 2,
  SORT_TAG  : 4,
  CYCLE_TAG : 8,
  DISABLED  : 16,
  ZOMBIE    : 32, /** zombie nodes aren't saved (actually they're not *loaded*).*/

  /**proxy nodes are replaced during saving with a lightwieght proxy,
    that can be replaced with real object on load.  for dealing with
    nodes that are saved outside of the Graph data structure.*/
  SAVE_PROXY     : 64
};

export const GraphFlags = {
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

export class NodeSocketType {
  constructor(uiname=undefined, flag=0) {
    if (uiname === undefined) {
      uiname = this.constructor.nodedef().uiname;
    }
    
    this.uiname = uiname;
    this.name = this.constructor.nodedef().name;
    
    let def = this.constructor.nodedef();
    if (def.graph_flag !== undefined) {
      flag |= def.graph_flag;
    }
    
    this.edges = [];
    this.node = undefined;
    this.graph_flag = flag;
    this.graph_id = -1;
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
    this.edges.remove(sock, true);
    sock.edges.remove(this, true);
    
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
    b.graph_flag = this.graph_flag;
    b.name = this.name;
    b.uiname = this.uiname;
    b.node = this.node;
  }

  get hasEdges() {
    return this.edges.length > 0;
  }

  update(_exclude=undefined) {
    if (this === _exclude)
      return;
    
    this.graph_flag |= NodeFlags.UPDATE;

    //make sure a graph update is queued up
    //only one update will be queued at a time
    //via setTimeout
    window.updateDataGraph();

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

  static fromSTRUCT(reader) {
    let ret = new this();

    reader(ret);

    return ret;
  }
}

NodeSocketType.STRUCT = `
graph.NodeSocketType {
  id     : int;
  node   : int | obj.node.graph_id;
  edges  : array(e, int) | e.graph_id;
  uiname : string;
  name   : string;
  flag   : int;
}
`;
nstructjs.manager.add_class(NodeSocketType);

export class KeyValPair {
 constructor(key, val) {
   this.key = key;
   this.val = val;
 }

 static fromSTRUCT(reader) {
   let ret = new KeyValPair();
   reader(ret);
   return ret;
 }
}
KeyValPair.STRUCT = `
graph.KeyValPair {
  key : string;
  val : abstract(Object);
}
`;
nstructjs.manager.add_class(KeyValPair);

export class Node {
  constructor(flag=0) {
    let def = this.constructor.nodedef();

    if (def.graph_flag !== undefined) {
      flag |= def.graph_flag;
    }

    this.graph_ui_pos = new Vector2();
    this.graph_ui_size = new Vector2([128, 330]);
    this.graph_ui_flag = 0;
    
    this.graph_flag = flag | NodeFlags.UPDATE;
    this.graph_id = -1;
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
      
      if (!(sock.graph_flag & SocketFlags.NO_MULTI_OUTPUTS)) {
        sock.graph_flag |= SocketFlags.MULTI;
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
    b.graph_name = this.graph_name;
    b.uiname = this.uiname;
    b.icon = this.icon;
    b.graph_flag = this.graph_flag;
    
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
    this.graph_flag |= NodeFlags.UPDATE;
    return this;
  }

  afterSTRUCT() {
    let ins = {};
    let outs = {};

    for (let pair of this.inputs) {
      ins[pair.key] = pair.val;
    }

    for (let pair of this.outputs) {
      outs[pair.key] = pair.val;
    }

    this.inputs = ins;
    this.outputs = outs;

    return this;
  }

  _save_map(map) {
    let ret = [];
    
    for (let k in map) {
      ret.push(new KeyValPair(k, map[k]));
    }
    
    return ret;
  }
}
Node.STRUCT = `
graph.Node {
  graph_id      : int;
  graph_flag    : int;
  inputs        : array(graph.KeyValPair) | obj._save_map(obj.inputs);
  outputs       : array(graph.KeyValPair) | obj._save_map(obj.outputs);
  graph_ui_pos  : vec2;
  graph_ui_size : vec2;
  graph_ui_flag : int;
}
`;

nstructjs.manager.add_class(Node);

/*proxy nodes are stand-ins for nodes that are
  saved/loaded from outside the Graph data structure
 */
export class ProxyNode extends Node {
  constructor() {
    super();

    this.className = "";
  }

  nodedef() {return {
    inputs  : {},
    outputs : {},
    flag    : NodeFlags.SAVE_PROXY
  }}

  static fromNode(node) {
    let ret = new ProxyNode();

    ret.graph_id = node.graph_id;

    for (let i=0; i<2; i++) {
      let socks1 = i ? node.outputs : node.inputs;
      let socks2 = i ? ret.outputs : ret.inputs;

      for (let k in socks1) {
        let s1 = socks1[k];
        let s2 = s1.copy();

        s2.graph_id = s1.graph_id;
        for (let e of s1.edges) {
          s2.edges.push(e);
        }

        socks2[k] = s2;
        s2.node = ret;
      }
    }

    return ret;
  }

  static fromSTRUCT(reader) {
    let ret = new ProxyNode();
    reader(ret);
    return ret;
  }
}

ProxyNode.STRUCT = STRUCT.inherit(ProxyNode, Node, "graph.ProxyNode") + `
  className : string; 
}
`;
nstructjs.manager.add_class(ProxyNode);

export class CallbackNode extends Node {
  constructor() {
    super();

    this.callback = undefined;
    this.flag |= NodeFlags.ZOMBIE;
  }

  exec(ctx) {
    if (this.callback !== undefined) {
      this.callback(ctx, this);
    }
  }

  static nodedef() {return {
    name     : "callback node",
    inputs   : {},
    outputs  : {},
    flag     : NodeFlags.ZOMBIE
  }}

  static create(name, callback, inputs={}, outputs={}) {
    let ret = new CallbackNode();

    ret.name = name;
    ret.callback = callback;

    ret.inputs = inputs;
    ret.outputs = outputs;

    for (let k in inputs) {
      ret.inputs[k].node = this;
    }

    for (let k in outputs) {
      ret.outputs[k].node = this;
    }

    return ret;
  }
}

CallbackNode.STRUCT = STRUCT.inherit(CallbackNode, Node, "graph.CallbackNode") + `
}
`;
nstructjs.manager.add_class(CallbackNode);


export class Graph {
  constructor() {
    this.nodes = [];
    this.sortlist = [];
    this.graph_flag = 0;
    this.max_cycle_steps = 64;
    this.cycle_stop_threshold = 0.0005; //stop cyclic solver when change per socket is less than this

    this.graph_idgen = new util.IDGen();
    this.node_idmap = {};
  }
  
  flagResort() {
    this.graph_flag |= GraphFlags.RESORT;
  }
  
  sort() {
    let sortlist = this.sortlist;
    let nodes = this.nodes;
    
    this.graph_flag &= ~NodeFlags.CYCLIC;
    
    sortlist.length = 0;

    for (let n of nodes) {
      n.graph_flag &= ~(NodeFlags.SORT_TAG|NodeFlags.CYCLE_TAG);
    }
    
    let dosort = (n) => {
      if (n.graph_flag & NodeFlags.CYCLE_TAG) {
        console.warn("Warning: graph cycle detected!");
        this.graph_flag |= GraphFlags.CYCLIC;
        return;
      }
      
      if (n.graph_flag & NodeFlags.SORT_TAG) {
        return;
      }
      
      n.graph_flag |= NodeFlags.SORT_TAG;
      n.graph_flag |= NodeFlags.CYCLE_TAG;
      
      for (let k in n.inputs) {
        let s1 = n.inputs[k];
        
        for (let s2 of s1.edges) {
          let n2 = s2.node;
          
          if (!(n2.graph_flag & NodeFlags.SORT_TAG)) {
            dosort(n2);
          }
        }
      }
      
      sortlist.push(n);
      
      n.graph_flag &= ~NodeFlags.CYCLE_TAG;
    }
    
    for (let n of nodes) {
      dosort(n);
    }

    //we may not have caught all cycle cases
    
    let cyclesearch = (n) => {
      if (n.graph_flag & NodeFlags.CYCLE_TAG) {
        console.warn("Warning: graph cycle detected!");
        this.graph_flag |= GraphFlags.CYCLIC;
        return true;
      }
      
      for (let k in n.outputs) {
        let s1 = n.outputs[k];
        
        n.graph_flag |= NodeFlags.CYCLE_TAG;
        for (let s2 of s1.edges) { 
          let ret = cyclesearch(s2.node);
          if (ret)
            return ret;
        }
        n.graph_flag &= ~NodeFlags.CYCLE_TAG;
      }
    }
    
    for (let n of this.nodes) {
      if (cyclesearch(n))
        break;
    }
    
    this.graph_flag &= ~GraphFlags.RESORT;
  }
  
  _cyclic_step(context) {
    let sortlist = this.sortlist;
    
    for (let n of sortlist) {
      if (n.graph_flag & NodeFlags.DISABLED) {
        continue;
      }
      if (!(n.graph_flag & NodeFlags.UPDATE)) {
        continue;
      }
      
      n.graph_flag &= ~NodeFlags.UPDATE;
      n.exec(context);
    }

    let change = 0.0;//, tot = 0.0;
    
    for (let n of sortlist) {
      if (n.graph_flag & NodeFlags.DISABLED) {
        continue;
      }
      if (!(n.graph_flag & NodeFlags.UPDATE)) {
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
      if (n.graph_flag & NodeFlags.DISABLED) {
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
    if (this.graph_flag & GraphFlags.RESORT) {
      console.log("resorting graph");
      this.sort();
    }
    
    if ((this.graph_flag & GraphFlags.CYCLIC) && !(this.graph_flag & GraphFlags.CYCLIC_ALLOWED)) {
      throw new Error("cycles in graph now allowed");
    } else if (!force_single_solve && (this.graph_flag & GraphFlags.CYCLIC)) {
      return this._cyclic_exec(context);
    }
    
    let sortlist = this.sortlist;
    
    for (let node of sortlist) {
      if (node.graph_flag & NodeFlags.DISABLED) {
        continue;
      }
      
      if (node.graph_flag & NodeFlags.UPDATE) {
        node.graph_flag &= ~NodeFlags.UPDATE;
        node.exec(context);
      }
    }
  }
  
  update() {
  }
  
  remove(node) {
    if (node.graph_id == -1) {
      console.warn("Warning, twiced to remove node not in graph (double remove?)", node.graph_id, node);
      return;
    }

    for (let s of node.allsockets) {
      let _i = 0;

      while (s.edges.length > 0) {
        s.disconnect(s.edges[0]);

        if (_i++ > 10000) {
          console.warn("infinite loop detected");
          break;
        }
      }
    }

    delete this.node_idmap[node.graph_id];
    this.nodes.remove(node);
    node.graph_id = -1;
  }

  has(node) {
    let ok = node !== undefined;
    ok = ok && node.graph_id !== undefined;
    ok = ok && node === this.node_idmap[node.graph_id];

    return ok;
  }

  add(node) {
    if (node.graph_id !== -1) {
      console.warn("Warning, tried to add same node twice", node.graph_id, node);
      return;
    }
    
    node.graph = this;
    node.graph_id = this.graph_idgen.next();
    
    for (let k in node.inputs) {
      let sock = node.inputs[k];
      sock.node = node;
      sock.graph_id = this.graph_idgen.next();
    }
    
    for (let k in node.outputs) {
      let sock = node.outputs[k];
      sock.node = node;
      sock.graph_id = this.graph_idgen.next();
    }
    
    this.node_idmap[node.graph_id] = node;
    this.nodes.push(node);
    
    this.flagResort();
    node.graph_flag |= NodeFlags.UPDATE;
    
    return this;
  }

  static fromSTRUCT(reader) {
    let ret = new Graph();
    reader(ret);

    console.log("NODES", ret.nodes);
    let idmap = ret.node_idmap;

    for (let n of ret.nodes) {
      n.afterSTRUCT();
    }

    for (let n of ret.nodes) {
      idmap[n.graph_id] = n;
      n.graph = ret;

      for (let s of n.allsockets) {
        s.node = n;
        idmap[s.graph_id] = s;
      }
    }

    for (let n of ret.nodes) {
      for (let s of n.allsockets) {
        for (let i=0; i<s.edges.length; i++) {
          s.edges[i] = idmap[s.edges[i]];
        }
      }
    }

    //prune zombie nodes
    for (let node of ret.nodes) {
      if (node.flag & NodeFlags.ZOMBIE) {
        ret.remove(node);
      }
    }

    ret.flagResort();

    return ret;
  }

  //substitute proxy with original node
  relinkProxyOwner(n) {
    let ok = n !== undefined && n.graph_id in this.node_idmap;
    ok = ok && this.node_idmap[n.graph_id] instanceof ProxyNode;

    if (!ok) {
      console.warn("structural error in Graph: relinkProxyOwner was called in error", n, this);
      return;
    }

    let n2 = this.node_idmap[n.graph_id];
    let idmap = this.node_idmap;

    n.graph = this;

    this.nodes.replace(n2, n);

    idmap[n2.graph_id] = n;

    for (let i=0; i<2; i++) {
      let socks1 = i ? n.outputs  : n.inputs;
      let socks2 = i ? n2.outputs : n2.inputs;

      for (let k in socks1) {
        let s1 = socks1[k];
        idmap[s1.graph_id] = s1;

        if (!(k in socks2)) {
          continue;
        }

        let s2 = socks2[k];
        for (let e of s2.edges) {
          s1.edges.push(e);
          e.edges.replace(s2, s1);
        }

        s2.copyTo(s1);
      }
    }

    this.flagResort();
    n.update();
    window.updateDataGraph();
  }

  _save_nodes() {
    let ret = [];
    //replace nodes with proxies, for nodes who request it
    for (let n of this.nodes) {
      if (n.graph_flag & NodeFlags.SAVE_PROXY) {
        n = ProxyNode.fromNode(n);
      }

      ret.push(n);
    }

    return ret;
  }
}
Graph.STRUCT = `
graph.Graph {
  graph_idgen : IDGen; 
  nodes       : iter(abstract(graph.Node)) | obj._save_nodes();
}
`;
nstructjs.manager.add_class(Graph);

export function test(exec_cycles=true) {
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
      //console.log("node exec", this.graph_id, this.graph.sortlist[0].graph_id, this.graph.sortlist[1].graph_id);
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
  graph.graph_flag |= GraphFlags.CYCLIC_ALLOWED;
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

let _graph = undefined;


import {Matrix4, Vector2, Vector3, Vector4, util, nstructjs} from '../path.ux/scripts/pathux.js';
let STRUCT = nstructjs.STRUCT;

export class GraphCycleError extends Error {};

export const SocketTypes = {
  INPUT  : 0,
  OUTPUT : 1
};

/**
 Socket flags

 @example
 export const SocketFlags = {
   SELECT           : 1, //for use by ui
   UPDATE           : 2,
   MULTI            : 4, //socket can have multiple connections, enabled by default for outputs
   NO_MULTI_OUTPUTS : 8  //don't flag outputs with MULTI by default
 };
 */
export const SocketFlags = {
  SELECT : 1, //for use by ui
  UPDATE : 2,
  MULTI  : 4, //socket can have multiple connections, enable by default for outputs
  NO_MULTI_OUTPUTS : 8, //don't flag outputs with MULTI by default
  PRIVATE : 16
};

/**
 Node flags

 @example
 export const NodeFlags = {
   SELECT    : 1,  // for use by ui
   UPDATE    : 2,  // node needs execution
   SORT_TAG  : 4,  // used by internal graph sort
   CYCLE_TAG : 8,  // used by internal graph sort
   DISABLED  : 16, // node is disabled
   ZOMBIE    : 32, // don't save this node, used for UI event handlers and stuff

   //proxy nodes are replaced during saving with a lightwieght proxy,
   //that can be replaced with real object on load.  for dealing with
   //nodes that are saved outside of the Graph data structure.
   SAVE_PROXY     : 64
 };
 */
export const NodeFlags = {
  SELECT    : 1,  /** for use by ui */
  UPDATE    : 2,  /** node needs execution */
  SORT_TAG  : 4,  /** used by internal graph sort */
  CYCLE_TAG : 8,  /** used by internal graph sort */
  DISABLED  : 16, /** node is disabled */
  ZOMBIE    : 32, /** don't save this node, used for UI event handlers and stuff */

  /**proxy nodes are replaced during saving with a lightwieght proxy,
    that can be replaced with real object on load.  for dealing with
    nodes that are saved outside of the Graph data structure.*/
  SAVE_PROXY     : 64
};

/**
 Graph flags

 @example
 export const GraphFlags = {
   SELECT : 1, //for use by ui
   RESORT : 2,
   CYCLIC_ALLOWED : 4, //graph may have cycles, set by user
   CYCLIC : 8 //graph has cycles, is set in graph.sort()
 };
 */
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

export let NodeSocketClasses = [];

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

    this.socketName = undefined;
    this.socketType = undefined;
    this.edges = [];
    this._node = undefined;
    this.graph_flag = flag;
    this.graph_id = -1;
  }

  static apiDefine(api, sockstruct) {

  }

  has(node_or_socket) {
    for (let socket of this.edges) {
      if (socket === node_or_socket)
        return true;
      if (socket.node === node_or_socket)
        return true;
    }

    return false;
  }

  get node() {
    return this._node;
  }

  set node(node) {
    if (!node) {
      console.warn("setting node", this.name, this);
    }

    this._node = node;
  }

  /**
   Build ui for a node socket.

   Note that container has a data path prefix applied to it,
   so anything in container.prop that takes a datapath (e.g. container.prop)

   will have its path evaluated *relative to the node itself*,
   NOT Context as usual.
   */
  buildUI(container, onchange) {
    if (this.edges.length === 0) {
      let ret = container.prop("value");

      if (ret) {
        ret.setAttribute("name", this.uiname);
        ret.onchange = onchange;
      } else {
        container.label(this.uiname);
      }
    } else {
      container.label(this.uiname);
    }
  }

  static register(cls) {
    NodeSocketClasses.push(cls);
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
    if (this.edges.indexOf(sock) >= 0) {
      console.warn("Already have socket connected");
      return;
    }

    for (let s of this.edges) {
      if (s.node === sock.node && s.name === sock.name) {
        console.warn("Possible duplicate socket add", s, sock);
      }
    }

    this.edges.push(sock);
    sock.edges.push(this);

    if (!sock.node) {
      console.warn("graph corruption");
    } else {
      sock.node.graphUpdate();
    }

    if (!this.node) {
      console.warn("graph corruption");
    } else {
      this.node.graphUpdate();
      this.node.graph_graph.flagResort();
    }

    return this;
  }
  
  disconnect(sock) {
    if (sock === undefined) {
      let _i = 0;

      while (this.edges.length > 0) {
        if (_i++ > 10000) {
          console.warn("infinite loop detected in graph code");
          break;
        }

        this.disconnect(this.edges[0]);
      }

      return;
    }

    this.edges.remove(sock, true);
    sock.edges.remove(this, true);
    
    this.node.graphUpdate();
    sock.node.graphUpdate();
    this.node.graph_graph.flagResort();
    
    return this;
  }

  /**
   Callback for defining socket types.
   Child classes must implement this.

   @example
   static nodedef() { return {
      name   : "name",
      uiname : "uiname",
      color  : [0.5, 0.5, 0.5, 1.0],
      flag   : 0 //see SocketFlags
   }}

   */
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
    //b.node = this.node;
  }

  get hasEdges() {
    return this.edges.length > 0;
  }

  /*
  flag the socket as updated and immediately
  execute the data graph
  */
  immediateUpdate() {
    this.update();

    if (this.edges.length > 0) {
      window.updateDataGraph(true);
    }
  }

  /*
  flag the socket as updated and queue
  the datagraph for execution
  */
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

      if (sock.node)
        sock.node.graphUpdate();
    }
    
    return this;
  }
  
  copy() {
    let ret = new this.constructor();
    this.copyTo(ret);
    
    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);
    /*
    let eset = new util.set();
    for (let id of this.edges) {
      eset.add(id);
    }

    this.edges = list(eset);
    //*/
  }
}

NodeSocketType.STRUCT = `
graph.NodeSocketType {
  graph_id   : int;
  node       : int | obj.node !== undefined ? obj.node.graph_id : -1;
  edges      : array(e, int) | e.graph_id;
  uiname     : string;
  name       : string;
  socketName : string;
  graph_flag : int;
  socketType : int;
}
`;
nstructjs.manager.add_class(NodeSocketType);

export class KeyValPair {
 constructor(key, val) {
   this.key = key;
   this.val = val;
 }
}
KeyValPair.STRUCT = `
graph.KeyValPair {
  key : string;
  val : abstract(Object);
}
`;
nstructjs.manager.add_class(KeyValPair);

/**
 Base class for all nodes
 It's required to implement the nodedef() static
 method in child classes.
 */
export class Node {
  constructor(flag=0) {
    let def = this.constructor.nodedef();

    if (def.graph_flag !== undefined) {
      flag |= def.graph_flag;
    }

    this.graph_ui_pos = new Vector2();
    this.graph_ui_size = new Vector2([235, 200]);
    this.graph_ui_flag = 0;
    
    this.graph_flag = flag | NodeFlags.UPDATE;
    this.graph_id = -1;
    this.graph_graph = undefined;
    
    let getsocks = (key) => {
      let obj = def[key];
      let ret = {};
      
      if (obj instanceof InheritFlag) {
        let p = this.constructor;
        
        while (p !== null && p !== undefined && p !== Object && p !== Node) {
          if (p.nodedef === undefined) continue;
          let obj2 = p.nodedef()[key];
          
          if (obj2 instanceof InheritFlag) {
            obj2 = obj2.data;
          }
          
          if (obj2 !== undefined) {
            for (let k in obj2) {
              let sock2 = obj2[k];

              if (sock2 instanceof InheritFlag) {
                sock2 = sock2.data;
              }

              if (!(k in ret)) {
                ret[k] = sock2.copy();
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
    };
    
    this.inputs = getsocks("inputs");
    this.outputs = getsocks("outputs");
    
    for (let sock of this.allsockets) {
      sock.node = this;
    }

    for (let i=0; i<2; i++) {
      let socks = i ? this.outputs : this.inputs;

      for (let k in socks) {
        let sock = socks[k];

        sock.socketType = i ? SocketTypes.OUTPUT : SocketTypes.INPUT;
        sock.node = this;
        sock.name = sock.name !== undefined ? sock.name : k;
        sock.socketName = k; //sock.socketName always corrosponds to socket key

        if (sock.uiname === undefined || sock.uiname === sock.constructor.nodedef().uiname) {
          sock.uiname = k;
        }
      }
    }

    for (let k in this.outputs) {
      let sock = this.outputs[k];
      
      if (!(sock.graph_flag & SocketFlags.NO_MULTI_OUTPUTS)) {
        sock.graph_flag |= SocketFlags.MULTI;
      }
    }
    
    this.icon = -1;
  }

  static defineAPI(nodeStruct) {

  }

  /** get final node def with inheritance applied to input/output sockets
   *
   * @returns {{} & {name, uiname, flag, inputs, outputs}}
   */
  static getFinalNodeDef() {
    let def = this.nodedef();

    //I'm a little nervous about using Object.create,
    //dunno if I'm just being paranoid
    let def2 = Object.assign({}, def);

    let getsocks = (key) => {
      let obj = def[key];
      let ret = {};

      if (obj instanceof InheritFlag) {
        let p = this;

        while (p !== null && p !== undefined && p !== Object && p !== Node) {
          if (p.nodedef === undefined) continue;
          let obj2 = p.nodedef()[key];

          let inherit = obj2 && obj2 instanceof InheritFlag;
          if (inherit) {
            obj2 = obj2.data;
          }

          if (obj2) {
            for (let k in obj2) {
              if (!(k in ret)) {
                ret[k] = obj2[k];
              }
            }
          }

          if (!inherit) {
            break;
          }

          p = p.prototype.__proto__.constructor;
        }
      } else if (obj !== undefined) {
        for (let k in obj) {
          ret[k] = obj[k];
        }
      }

      return ret;
    }

    def2.inputs = getsocks("inputs");
    def2.outputs = getsocks("outputs");

    return def2;
  }

  /**
   Type information for node, child classes
   must subtype this.  To inherit sockets,
   wrap inputs and/or outputs in Node.inherit, see example

   @example

   static nodedef() {return {
      name   : "name",
      uiname : "uiname",
      flag   : 0,  //see NodeFlags
      inputs : Node.inherit({
        input1 : new FloatSocket()
      }), //can inherit from parent class by wrapping in Node.inherit({})

      outputs : {
        output1 : new FloatSocket()
      }
    }}
   */
  static nodedef() {return {
    name   : "name",
    uiname : "uiname",
    flag   : 0,
    inputs : {}, //can inherit from parent class by wrapping in Node.inherit({})
    outputs : {}        
  }}

  /** see nodedef static method */
  static inherit(obj={}) {
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
        sock2.node = b;

        sock2.setValue(sock1.getValue());
      }
    }
  }
  
  copy() {
    let ret = new this.constructor();
    this.copyTo(ret);
    
    return ret;
  }
  
  /**state is provided by client code, it's the argument to Graph.prototype.exec()
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
    this.graphUpdate();
    console.warn("deprecated call to graph.Node.prototype.update(); use graphUpdate instead");

    //this.graph_flag |= NodeFlags.UPDATE;
    return this;
  }

  graphUpdate() {
    this.graph_flag |= NodeFlags.UPDATE;
    return this;
  }

  afterSTRUCT() {
  }

  loadSTRUCT(reader) {
    reader(this);

    let ins = {};
    let outs = {};

    for (let pair of this.inputs) {
      ins[pair.key] = pair.val;

      pair.val.socketType = SocketTypes.INPUT;
      pair.val.socketName = pair.key;
      pair.val.node = this;
    }

    for (let pair of this.outputs) {
      outs[pair.key] = pair.val;

      pair.val.socketType = SocketTypes.OUTPUT;
      pair.val.socketName = pair.key;
      pair.val.node = this;
    }

    this.inputs = ins;
    this.outputs = outs;

    /*deal with any changes in sockets across file versions*/
    let def = this.constructor.getFinalNodeDef();

    for (let i=0; i<2; i++) {
      let socks1 = i ? outs : ins;
      let socks2 = i ? def.outputs : def.inputs;

      for (let k in socks2) {
        //there's a new socket?
        if (!(k in socks1)) {
          socks1[k] = socks2[k].copy();
          socks1[k].graph_id = -1;
        }
      }

      for (let k in socks1) {
        //does the socket exist in this version?
        //note that this can happend with nodes with dynamic sockets,
        //which is why we don't delete s1 in this case
        if (!(k in socks2)) {
          continue;
        }

        let s1 = socks1[k];
        let s2 = socks2[k];

        if (s1.constructor !== s2.constructor) {
          console.warn("==========================Node patch!", s1, s2);

          //our types differ?
          if ((s2 instanceof s1.constructor) || (s1 instanceof s2.constructor)) {
            //easy case, the old file uses a parent class of a new one,
            //e.g. Vec4Socket was changed to RGBASocket
            s2 = s2.copy();
            s1.copyTo(s2);

            s2.edges = s1.edges;
            s2.node = this;
            s2.graph_id = s1.graph_id;

            socks1[k] = s2;
          }
        }

        socks1[k].node = this;
      }
    }

    return this;
  }

  graphDisplayName() {
    return this.constructor.name + this.graph_id;
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
    this.graph_flag |= NodeFlags.ZOMBIE;
  }

  exec(ctx) {
    if (this.callback !== undefined) {
      this.callback(ctx, this);
    }
  }

  graphDisplayName() {
    return this.constructor.name + "(" + this.name + ")" + this.graph_id;
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

export class GraphNodes extends Array {
  constructor(graph, list) {
    super();
    this.graph = graph;

    if (list !== undefined) {
      for (let l of list) {
        this.push(l);
      }
    }

    this.active = undefined;
    this.highlight = undefined;
  }

  setSelect(node, state) {
    if (state) {
      node.graph_flag |= GraphFlags.SELECT;
    } else {
      node.graph_flag &= ~GraphFlags.SELECT;
    }
  }

  get selected() {
    let this2 = this;

    let ret = function*() {
      for (let node of this2.graph.nodes) {
        if (node.graph_flag & NodeFlags.SELECT) {
          yield node;
        }
      }
    };

    ret = ret();
    ret.editable = ret; //for now nodes don't support hiding, so editable is just a self reference
    return ret;
  }

  /**
   swap node to first element in list.

   a convention in shader networks is that the active "output" node is the first one found in the list.
   this way users can click different output nodes to preview different subnetworks in real time.
  */
  pushToFront(node) {
    let i = this.indexOf(node);

    if (i < 0) {
      throw new Error("node not in list");
    }

    if (this.length === 1) {
      return;
    }

    while (i > 0) {
      this[i] = this[i-1];
      i--;
    }

    this[0] = node;

    return this;
  }
}


export class Graph {
  constructor() {
    /**unfortunately we can't use normal event callbacks (or the graph itself)
      to send certain updates to the UI, because the sheer number of nodes
      in normal workflows would make that slow and error-prone.
      so, like with meshes, we use a random number that changes when the ui should
      redraw things*/
    this.updateGen = Math.random();

    this.onFlagResort = undefined;

    this.nodes = new GraphNodes(this);
    this.sortlist = [];
    this.graph_flag = 0;
    this.max_cycle_steps = 64;
    this.cycle_stop_threshold = 0.0005; //stop cyclic solver when change per socket is less than this

    this.graph_idgen = new util.IDGen();
    this.node_idmap = {};
    this.sock_idmap = {};
  }

  /**unfortunately we can't use normal event callbacks (or the graph itself)
   to send certain updates to the UI, because the sheer number of nodes
   in normal workflows would make that slow and error-prone.
   so, like with meshes, we use a random number that changes when the ui should
   redraw things*/
  signalUI() {
    this.updateGen = Math.random();
  }

  flagResort() {
    if (this.onFlagResort) {
      this.onFlagResort(this);
    }

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
          if (s2.node === undefined) {
            console.warn("Dependency graph corruption detected", s1, s2, n);
            continue;
          }

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
    
    node.graph_graph = this;
    node.graph_id = this.graph_idgen.next();
    
    for (let k in node.inputs) {
      let sock = node.inputs[k];

      sock.node = node;
      sock.graph_id = this.graph_idgen.next();
      this.sock_idmap[sock.graph_id] = sock;
    }
    
    for (let k in node.outputs) {
      let sock = node.outputs[k];

      sock.node = node;
      sock.graph_id = this.graph_idgen.next();
      this.sock_idmap[sock.graph_id] = sock;
    }
    
    this.node_idmap[node.graph_id] = node;
    this.nodes.push(node);
    
    this.flagResort();
    node.graph_flag |= NodeFlags.UPDATE;
    
    return this;
  }

  loadSTRUCT(reader) {
    reader(this);

    this.nodes = new GraphNodes(this, this.nodes);

    /*
    console.log("NODES", this.nodes);
    let buf = "NODES\n"
    for (let n of this.nodes) {
      buf += "  " + n.graph_name + "|" + n.constructor.name + "\n";
    }
    console.log(buf);
    //*/
    
    let node_idmap = this.node_idmap;
    let sock_idmap = this.sock_idmap;

    for (let n of this.nodes) {
      n.afterSTRUCT();
    }

    for (let n of this.nodes) {
      node_idmap[n.graph_id] = n;
      n.graph_graph = this;

      for (let s of n.allsockets) {
        if (s.graph_id === -1) {
          console.warn("Found patched socket from old file; fixing.", s);
          //old file, didn't have socket
          s.graph_id = this.graph_idgen.next();
        }

        s.node = n;
        sock_idmap[s.graph_id] = s;
      }
    }

    for (let n of this.nodes) {
      for (let s of n.allsockets) {
        for (let i=0; i<s.edges.length; i++) {
          s.edges[i] = sock_idmap[s.edges[i]];

          if (!s.edges[i]) {
            s.edges.remove(undefined);
            i--;
          }
        }

        sock_idmap[s.graph_id] = s;
      }
    }

    //prune zombie nodes
    for (let node of this.nodes.slice(0, this.nodes.length)) {
      if (node.graph_flag & NodeFlags.ZOMBIE) {
        this.remove(node);
      }
    }

    for (let node of this.nodes) {
      for (let sock of node.allsockets) {
        for (let i=0; i<sock.edges.length; i++) {
          let e = sock.edges[i];

          if (typeof e === "number") {
            e = this.sock_idmap[e];
          }

          if (!e) {
            console.warn("pruning dead graph connection", sock);
            sock.edges.remove(sock.edges[i]);
            i--;
          }
        }
      }
    }

    this.flagResort();

    return this;
  }

  //substitute proxy with original node
  relinkProxyOwner(n) {
    //console.warn("relinkProxyOwner", n.name);

    let ok = n !== undefined && n.graph_id in this.node_idmap;
    ok = ok && this.node_idmap[n.graph_id] instanceof ProxyNode;

    //console.trace("relinking proxy", n.name);
    if (!ok) {
      console.warn("structural error in Graph: relinkProxyOwner was called in error", n, this.node_idmap[n.graph_id], this);
      return;
    }

    let n2 = this.node_idmap[n.graph_id];
    let node_idmap = this.node_idmap;
    let sock_idmap = this.sock_idmap;

    n.graph_graph = this;

    this.nodes.replace(n2, n);

    node_idmap[n2.graph_id] = n;

    for (let i=0; i<2; i++) {
      let socks1 = i ? n.outputs  : n.inputs;
      let socks2 = i ? n2.outputs : n2.inputs;

      for (let k in socks2) {
        if (typeof socks2[k] === "number") {
          socks2[k] = sock_idmap[socks2[k]];
        }

        socks1[k] = socks2[k];
        socks1[k].node = n;
      }
    }

    this.flagResort();
    n.graphUpdate();

    if (window.updateDataGraph) {
      window.updateDataGraph();
    }
  }

  _save_nodes() {
    let ret = [];

    //ensure node socket id sanity
    for (let n of this.nodes) {
      for (let s of n.allsockets) {
        if (s.graph_id < 0) {
          console.warn("graph corruption", s);
          s.graph_id = this.graph_idgen.next();
          this.sock_idmap[s.graph_id] = s;
        }
      }
    }

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
      //console.log("node exec", this.graph_id, this.graph_graph.sortlist[0].graph_id, this.graph_graph .sortlist[1].graph_id);
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
    ob1.graphUpdate();
    
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

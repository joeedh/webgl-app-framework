# Data Graph

The data graph is a generic execution graph.  It's used for (some) event handling,
scene dependency relationships, shader nodes, the render engine pass compositing system,
etc.  Each of these use the data graph in a slightly different way.

The data graph is a DAG solver with optional support for cyclic graphs.

## Declaration
Dag nodes are declared by subclassing from graph.Node.  Each subclass should implementation
an exec method and the static nodedef method, like so:

```
class MyNode extends Node {
  constructor() {
    super();
    
    this.mysetting = 0;
  }
  
  static nodedef() {return {
    uiname : "My Node",
    name   : "MyNode",     //if you want to inherit sockets from parent
    inputs : Node.inherit({ //class, wrap inputs/outputs in Node.inherit
      myinput : new FloatSocket()
    }),
    outputs : {
      myoutput : new FloatSocket()
    }
  }}
  
  //ctx is the argument passed to Graph.prototype.exec
  exec(ctx) {
    this.outputs.myoutput.setValue(this.inputs.myinput.getValue());
    
    //note that child nodes aren't executed unless you call .update() on output sockets
    //except for shader nodes, which don't use .exec methods at all
    this.outputs.myoutput.update();
  }
}
MyNode.struct = STRUCT.inherit(MyNode, Node) + ~
  mysetting : int;
}
`;
nstructjs.manager.add_class(MyNode);
```

## Cycles

If cycles are enable, the DAG will try to solve the graph until all inputs/outputs stop changing
in value.  There are various methods in nodeSocketType for this, the most important of which is cmpValue
and diffValue (which returns a number representing "change" between two instances of a socket).

## Data Blocks
Data blocks inherit from Node.  Unlike normal nodes, they are not saved inside of Graph.nodes;
instead a special ProxyNode is create on file save, and on load the ProxyNode is swapped with the
original data block.  This is to allow saving/loading of data blocks individually, without having to
save/load the entire Graph structure (this is useful for linking different files together, e.g. file A can
load parts of file B).

## Zombie Nodes
Zombie nodes are created by the UI for event handling; the graph automatically deletes them on file load.
Zombie nodes are created by adding NodeFlags.ZOMBIE to node.graph_flag:

```
node.graph_flag |= NodeFlags.ZOMBIE;
```

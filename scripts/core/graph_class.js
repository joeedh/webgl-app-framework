import {
  GraphCycleError, Graph,
  Node,
  NodeSocketType,
  NodeFlags,
  SocketFlags,
  GraphFlags,
} from "./graph.js";
import {DependSocket} from "./graphsockets.js";
import {Matrix4, Vector2, Vector3, Vector4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

export let GraphTypes = [];
export let GraphMap = {};

export class AbstractGraphClass {
  static graphdef() {return {
    typeName      : "",
    uiName        : "",
    graph_flag    : 0,
  }}

  /** register an abstract graph class, don't subclass this*/
  static registerClass(cls) {
    GraphTypes.push(cls);
    GraphMap[cls.graphdef().typeName] = cls;
  }

  static getGraphClass(name) {
    if (!(name in GraphMap)) {
      console.log(GraphMap);
      throw new Error("invalid graph class " + name);
    }
    return GraphMap[name];
  }

  static create(cls_name) {
    if (typeof cls_name != "string") {
      return new cls_name();
    }

    for (let cls of this.NodeTypes) {
      if (cls.name === cls_name) {
        return new cls();
      }
    }
  }
  /** add a node class to this type */
  static register(cls) {
    this.NodeTypes.push(cls);
  }
}
/** Always instantiate this for each subclass*/
AbstractGraphClass.NodeTypes = [];

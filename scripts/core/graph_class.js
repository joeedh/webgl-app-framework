/**
 Graph classes (perhaps 'class' is a bad word choice) are
 classes of node graphs.  Nodes within the class belong to "categories"
 and are registered with the class.  Right now the shader node system
 uses this to keep track of shader node types.
 */

import {
  GraphCycleError, Graph,
  Node,
  NodeSocketType,
  NodeFlags,
  SocketFlags,
  GraphFlags,
} from "./graph.js";

import {Matrix4, Vector2, Vector3, Vector4, util, nstructjs} from '../path.ux/scripts/pathux.js';

export let GraphTypes = [];
export let GraphMap = {};

export function api_define_graphclasses(api) {
  for (let cls of GraphTypes) {
    cls.buildAPI(api);
  }
}

export class AbstractGraphClass {
  static graphdef() {return {
    typeName      : "",
    uiName        : "",
    graph_flag    : 0,
  }}

  static buildAPI(api) {
    for (let cls of this.NodeTypes) {
      let nstruct = api.mapStruct(cls);
      let basestruct = api.getStruct(Node);

      api.mergeStructs(nstruct, basestruct);
      cls.defineAPI(nstruct);
    }
  }

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

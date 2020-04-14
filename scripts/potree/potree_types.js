// var _mesh = undefined;

import {NodeFlags} from '../core/graph.js';

import * as simplemesh from '../core/simplemesh.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js'

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {DependSocket} from '../core/graphsockets.js';
import {DataBlock, DataRef} from '../core/lib_api.js';
import {SceneObjectData} from '../core/sceneobject_base.js';
import {PointSetResource} from './potree_resource.js';

import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

//import * as Potree from '../extern/potree/src/Potree.js';
import '../extern/potree/build/potree/potree.js';
import {resourceManager} from "../core/resource.js";

export class PointSet extends SceneObjectData {
  constructor() {
    super();

    this.url = "";
    this.ready = false;
    this.materials = [];

    this.data = undefined;
  }

  load() {
    if (this.ready) {
      return new Promise((accept, reject) => accept(this));
    }

    return new Promise((accept, reject) => {
      this.res = resourceManager.get(this.url, PointSetResource, true);
      if (this.res.ready) {
        this.ready = true;
        accept(this);
        return;
      }

      this.res.on("load", (e) => {
        this.ready = true;
        accept(this);
        window.redraw_viewport();
      });
    });
  }

  reload() {
    if (this.ready) {
      this.destroy();
    }

    this.ready = false;
    return this.load();
  }

  destroy() {
    this.ready = false;
  }

  static nodedef() {return {
    name   : "pointset",
    uiname : "PointSet",
    flag   : NodeFlags.SAVE_PROXY,
    inputs : {}, //can inherit from parent class by wrapping in Node.inherit({})
    outputs : {}
  }}

  //node graph execution callback
  exec() {
  }

  drawWireframe(gl, uniforms, program, object) {

  }

  draw(gl, uniforms, program, object) {

  }

  dataLink(getblock, getblock_us) {
    for (let i=0; i<this.materials.length; i++) {
      this.materials[i] = getblock_us(this.materials[i]);
    }

    this.load();
  }

  static blockDefine() { return {
    typeName    : "pointset",
    defaultName : "PointSet",
    uiName      : "PointSet",
    flag        : 0,
    icon        : -1
  }}
};

PointSet.STRUCT = STRUCT.inherit(PointSet, SceneObjectData, "potree.PointSet") + `
  materials : array(e, DataRef) | DataRef.fromBlock(e);
  url       : string;
}
`;

nstructjs.manager.add_class(PointSet);
DataBlock.register(PointSet);

// var _mesh = undefined;

import {NodeFlags} from '../core/graph.js';
import * as view3d_shaders from '../editors/view3d/view3d_shaders.js';

import * as simplemesh from '../core/simplemesh.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js'
import {getFlatMaterial, Shaders} from './potree_shaders.js';

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {DependSocket} from '../core/graphsockets.js';
import {DataBlock, DataRef} from '../core/lib_api.js';
import {SceneObjectData} from '../sceneobject/sceneobject_base.js';
import {PointSetResource} from './potree_resource.js';
import {ObjectFlags} from "../sceneobject/sceneobject.js";

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

    this._flatMaterial = getFlatMaterial();

    return new Promise((accept, reject) => {
      this.res = resourceManager.get(this.url, PointSetResource, true);
      if (this.res.isReady()) {
        console.log("READY1");
        this.ready = true;
        accept(this);

        //hackish, I shouldn't have to delay the viewport redraw call here
        //TODO: rethink window.redraw_viewport?
        window.setTimeout(() => {
          window.redraw_viewport();
        }, 50);
        return;
      }

      this.res.on("load", (e) => {
        console.log("READY2");
        this.ready = true;
        accept(this);

        //hackish, I shouldn't have to delay the viewport redraw call here
        window.setTimeout(() => {
          window.redraw_viewport();
        }, 2500);
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

  drawWireframe(view3d, gl, uniforms, program, object) {
    if (!this.ready) {
      return;
    }

    let ptree = this.res.data;

    let color = uniforms.uColor;
    if (color === undefined) {
      color = object.getEditorColor();
    }
    if (color === undefined) {
      color = [0.5, 0.5, 0.5];
    }

    ptree.material = ptree.flatMaterial;
    ptree.material.size = ptree.baseMaterial.size + 1;
    ptree.material.color = new THREE.Color(color[0], color[1], color[2]);

    this.draw(view3d, gl, uniforms, program, object);
    ptree.material = ptree.baseMaterial;
  }

  draw(view3d, gl, uniforms, program, object) {
    if (!this.ready) {
      return;
    }

    let ptree = this.res.data;

    let startmat = ptree.material;
    if (program === view3d_shaders.Shaders.MeshIDShader) {
      //console.log("ID draw!", uniforms);
      ptree.material = ptree.flatMaterial;
      let id = uniforms.object_id;
      ptree.material.uniforms.uColor.value = new THREE.Color(id, id, id);
    }


    let mask = gl.getParameter(gl.DEPTH_WRITEMASK);
    let test = gl.getParameter(gl.DEPTH_TEST);

    ptree.material.screenWidth = view3d.glSize[0];
    ptree.material.screenHeight = view3d.glSize[1];
    ptree.material.heightMin = ptree.baseMaterial.heightMin;
    ptree.material.heightMax = ptree.baseMaterial.heightMax;
    ptree.material.depthWrite = mask;
    ptree.material.depthTest = test;

    ptree.updateMaterial(ptree.material, ptree.visibleNodes, view3d.threeCamera, view3d.threeRenderer)
    Potree.updatePointClouds([ptree], view3d.threeCamera, view3d.threeRenderer);
    ptree.updateMaterial(ptree.material, ptree.visibleNodes, view3d.threeCamera, view3d.threeRenderer)
    Potree.updatePointClouds([ptree], view3d.threeCamera, view3d.threeRenderer);

    ptree.material.depthWrite = mask;
    ptree.material.depthTest = test;

    //*/
    view3d.pRenderer.render({children : [ptree]}, view3d.threeCamera, undefined, {
      depthTest : test,
      depthWrite : mask
    });
    ptree.material = startmat;
  }

  dataLink(getblock, getblock_addUser) {
    for (let i=0; i<this.materials.length; i++) {
      this.materials[i] = getblock_addUser(this.materials[i]);
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

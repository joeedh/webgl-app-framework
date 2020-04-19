// var _mesh = undefined;

import {NodeFlags} from '../core/graph.js';
import * as view3d_shaders from '../editors/view3d/view3d_shaders.js';

import {Material} from '../core/material.js';
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
import {PointSetTools} from './potree_ops.js';

import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

//import * as Potree from '../extern/potree/src/Potree.js';
import '../extern/potree/build/potree/potree.js';
import {resourceManager} from "../core/resource.js";
import {Shapes} from "../core/simplemesh_shapes.js";
import {SelMask} from "../editors/view3d/selectmode.js";


export class PointSet extends SceneObjectData {
  constructor() {
    super();


    this._last_draw_hash = undefined;
    this._last_cull_time = 0;

    this.url = "";
    this.ready = false;

    this.usesMaterial = true;
    this.material = undefined;

    this.data = undefined;
  }

  getBoundingBox() {
    if (!this.ready) return [new Vector3(), new Vector3()];

    let ptree = this.res.data;

    let bbox = ptree.getBoundingBoxWorld();
    let min = new Vector3().loadTHREE(bbox.min);
    let max = new Vector3().loadTHREE(bbox.max);

    return [min, max];
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
    this.drawOutline(...arguments);
  }

  drawOutline(view3d, gl, uniforms, program, object) {
    if (!this.ready) {
      return;
    }

    let ptree = this.res.data;

    if (program !== Shaders.MeshIDShader) {
      //program = Shaders.WidgetMeshShader;
      //program = Shaders.MeshIDShader;
      program.uniforms.color = object.getEditorColor();
    }

    let matrix2 = object.outputs.matrix.getValue();
    let matrix = new Matrix4();

    let bbox = ptree.getBoundingBoxWorld();
    let min = new Vector3().loadTHREE(bbox.min);
    let max = new Vector3().loadTHREE(bbox.max);
    let scale = new Vector3(max).sub(min);

    matrix.translate(min[0], min[1], min[2]);
    matrix.scale(scale[0], scale[1], scale[2]);
    matrix.translate(0.5, 0.5, 0.5);

    matrix.preMultiply(matrix2);

    let old = uniforms.objectMatrix;
    uniforms.objectMatrix = matrix;

    Shapes.CUBE.drawLines(gl, uniforms, program);

    uniforms.objectMatrix = old;

    /*
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

    this.draw(view3d, gl, uniforms, program, object, true);
    ptree.material = ptree.baseMaterial;
    //*/
  }

  _getMat(view3d) {
    let mat = this.material;

    if (mat === undefined) {
      return Material.getDefaultMaterial(view3d.ctx);
    }

    return mat;
  }

  drawIds(view3d, gl, selectMask, uniforms, object) {
    if (!this.ready) {
      return;
    }

    let ptree = this.res.data;
    let startmat = ptree.material;

    //console.log("ID draw!", uniforms);
    ptree.material = ptree.flatMaterial;

    let id = uniforms.object_id + 1;
    ptree.material.uniforms.uColor.value = new THREE.Color(id, 0, 0);
    this.draw(view3d, gl, uniforms, object);
    ptree.material = startmat;
  }

  draw(view3d, gl, uniforms, program, object, ignore_mat=false) {
    if (!this.ready) {
      return;
    }

    let mat = this._getMat(view3d);
    let ptree = this.res.data;

    let startmat = ptree.material;
    if (program === view3d_shaders.Shaders.MeshIDShader) {
      //console.log("ID draw!", uniforms);
      ptree.material = ptree.flatMaterial;

      let id = uniforms.object_id + 1;
      ptree.material.uniforms.uColor.value = new THREE.Color(id, 0, 0);
    }


    let mask = gl.getParameter(gl.DEPTH_WRITEMASK);
    let test = gl.getParameter(gl.DEPTH_TEST);

    ptree.material.screenWidth = view3d.glSize[0];
    ptree.material.screenHeight = view3d.glSize[1];
    ptree.material.heightMin = ptree.baseMaterial.heightMin;
    ptree.material.heightMax = ptree.baseMaterial.heightMax;
    ptree.material.depthWrite = mask;
    ptree.material.depthTest = test;

    if (!ignore_mat) {
      ptree.material.pointSizeType = mat.pointSizeType;
      ptree.material.shape = mat.pointShape;
      ptree.material.size = mat.pointSize;
    }

    if (util.time_ms() - this._last_cull_time > 50) {
      Potree.updatePointClouds([ptree], view3d.threeCamera, view3d.threeRenderer);
      this._last_cull_time = util.time_ms();
    }

    let hash = mat.calcSettingsHash();
    if (hash !== this._last_draw_hash) {
      this._last_draw_hash = hash;

      ptree.updateMaterial(ptree.material, ptree.visibleNodes, view3d.threeCamera, view3d.threeRenderer)
      ptree.material.recomputeClassification();
    }

    ptree.material.depthWrite = mask;
    ptree.material.depthTest = test;

    //console.warn("PTREE DRAW");

    //*/
    view3d.pRenderer.render({children : [ptree]}, view3d.threeCamera, undefined, {
      depthTest : test,
      depthWrite : mask
    });
    ptree.material = startmat;
  }

  dataLink(getblock, getblock_addUser) {
    this.material = getblock_addUser(this.material);

    this.load();
  }

  onContextLost(e) {
    this._last_draw_hash = "";
    this._last_cull_time = 0;

    if (this.res !== undefined) {
      let mat = this.res.data.material;

      mat.needsUpdate = true;
      mat.updateShaderSource();

      mat = this.res.data._flatMaterial;
      mat.needsUpdate = true;
      mat.updateShaderSource();
    }
  }

  static blockDefine() { return {
    typeName    : "pointset",
    defaultName : "PointSet",
    uiName      : "PointSet",
    flag        : 0,
    icon        : -1
  }}

  copy() {
    let ret = new PointSet();

    this.copyTo(ret);

    ret.url = this.url;
    ret.res = this.res;
    ret.ready = this.ready;
    ret.material = this.material;

    if (!ret.ready) {
      ret.load();
    }

    return ret;
  }

  copyAddUsers() {
    let ret = this.copy();
    if (ret.material !== undefined) {
      ret.material.lib_addUser(ret);
    }

    return ret;
  }

  static dataDefine() {return {
    name       : "Light",
    selectMask : SelMask.OBJECT,
    tools      : PointSetTools
  }}
};

PointSet.STRUCT = STRUCT.inherit(PointSet, SceneObjectData, "potree.PointSet") + `
  material  : DataRef | DataRef.fromBlock(obj.material);
  url       : string;
}
`;

nstructjs.manager.add_class(PointSet);
DataBlock.register(PointSet);
SceneObjectData.register(PointSet);

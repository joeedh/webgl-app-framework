// var _mesh = undefined;

import '../extern/potree_patches.js';
import {packPointCloudReport, unpackPointCloudReport} from "../extern/potree_patches.js";

import {NodeFlags} from '../core/graph.js';
import * as view3d_shaders from '../editors/view3d/view3d_shaders.js';

import {Material} from '../core/material.js';
import * as simplemesh from '../core/simplemesh.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js'
import {getFlatMaterial, Shaders} from './potree_shaders.js';
import * as cconst from '../core/const.js';

import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {DependSocket} from '../core/graphsockets.js';
import {DataBlock, DataRef} from '../core/lib_api.js';
import {SceneObjectData} from '../sceneobject/sceneobject_base.js';
import {PointSetResource} from './potree_resource.js';
import {ObjectFlags} from "../sceneobject/sceneobject.js";
import {PointSetTools} from './potree_ops.js';

import '../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;

//import * as Potree from '../extern/potree/src/Potree.js';
import '../extern/potree/build/potree/potree.js';
import {resourceManager} from "../core/resource.js";
import {Shapes} from "../core/simplemesh_shapes.js";
import {SelMask} from "../editors/view3d/selectmode.js";

let hashrand = new util.MersenneRandom();

function hashPointSet(ptree, quality, numpoints_out=undefined) {
  let hash = 0;
  let mul = (1<<21)-1;

  hashrand.seed(0);

  if (!ptree.pcoGeometry || !ptree.pcoGeometry.root) {
    return -1;
  }

  let flati = 0;

  if (numpoints_out)
    numpoints_out[0] = 0;

  function dohash(val) {
    let off = hashrand.random()*mul;
    let  f = ((val+off) * hashrand.random() * mul) & ((1 << 19)-1);
    hash = hash ^ f;
  }

  let rec_geometry;

  let rec_scene = (n) => {
    flati++;

    if (n.geometryNode) {
      rec_geometry(n.geometryNode, true);
    }

    dohash(!!n.sceneNode);

    if (!n.sceneNode)
      return;

    dohash(!!n.geometry);
    if (n.geometry && n.geometry.attributes) {
      let i=0;

      for (let k in n.geometry.attributes) {
        let attr = n.geometry.attributes[k];

        dohash(i);
        dohash(attr.count);
        i++;
      }
    }

    if (Array.isArray(n.children)) {
      for (let i=0; i<n.children.length; i++) {
        if (n.children[i])
          rec_scene(n.children[i]);
      }
    } else {
      for (let k in n.children) {
        rec_geometry(n.children[k]);
      }
    }
  };

  rec_geometry = (n, no_children=false) => {
    flati++;

    if (n.loading === undefined) {
      n.loading = false;
    }
    if (n.loaded === undefined) {
      n.loaded = false;
    }
    if (n.numPoints === undefined) {
      n.numPoints = 0;
    }

    if (numpoints_out && n.loaded && !n.loading)
      numpoints_out[0] += n.numPoints;

    dohash(flati);
    dohash(n.loading);
    dohash(!!n.geometry);
    dohash(n.loaded);
    dohash(n.numPoints);

    if (no_children) {
      return;
    }

    if (Array.isArray(n.children)) {
      for (let i=0; i<n.children.length; i++) {
        if (n.children[i])
          rec_scene(n.children[i]);
      }
    } else {
      for (let k in n.children) {
        rec_geometry(n.children[k]);
      }
    }
  };

  //if (ptree.root) {
    rec_scene(ptree.root);
  //} else {
    rec_geometry(ptree.pcoGeometry.root);
  //}

  dohash(quality);

  return hash;
}

export class PointSet extends SceneObjectData {
  constructor() {
    super();

    this._last_material_hash = undefined;
    this._last_camera_hash = undefined;
    this._last_cull_time = 0;

    this.url = "";
    this.ready = false;

    this.usePackedData = false; //used compressed data in this.packedData
    this.packedData = [];
    this.usesMaterial = true;
    this.material = undefined;

    this.data = undefined;
  }

  get ptree() {
    return this.res ? this.res.data : undefined;
  }

  getBoundingBox() {
    if (!this.ready) return [new Vector3(), new Vector3()];

    let ptree = this.res.data;

    let bbox = ptree.getBoundingBoxWorld();
    let min = new Vector3().loadTHREE(bbox.min);
    let max = new Vector3().loadTHREE(bbox.max);

    return [min, max];
  }

  pack() {
    if (!this.ready) {
      return;
    }

    if (this._packing) {
      return;
    }

    this._packing = true;
    packPointCloudReport(this.res.data).then((data) => {
      this._packing = false;
      this.packedData = data;
      this.usePackedData = true;

      this.ready = false;
      this.loadFromPacked();
    });
  }

  hash(numpoints_out=undefined) {
    if (numpoints_out)
      numpoints_out[0] = 0;

    let quality = this.material ? this.material.quality : 0.0;

    return this.ptree ? hashPointSet(this.ptree, quality, numpoints_out) : -1;
  }

  loadFromPacked() {
    this.res = new PointSetResource();
    let data = this.packedData;

    if (!(data instanceof Uint8Array)) {
      data = new Uint8Array(data);
    }

    return new Promise((accept, reject) => {
      unpackPointCloudReport(data).then((ptree) => {
        this.res.data = ptree;
        this.res.initMaterials();
        this.ready = true;

        accept(ptree);

        window.redraw_viewport();

        window.setTimeout(() => {
          window.redraw_viewport();
        }, 400);
      });
    });
  }

  load() {
    if (this.ready) {
      return new Promise((accept, reject) => accept(this));
    }

    if (this.usePackedData) {
      return this.loadFromPacked();
    }

    this._flatMaterial = getFlatMaterial();

    return new Promise((accept, reject) => {
      this.res = resourceManager.get(this.url, PointSetResource, true);
      if (this.res.isReady()) {
        if (cconst.DEBUG.potreeEvents) {
          console.log("potree READY1");
        }

        this.ready = true;
        accept(this);

        window.redraw_viewport();

        //hackish, I shouldn't have to delay the viewport redraw call here
        //TODO: rethink window.redraw_viewport?
        window.setTimeout(() => {
          window.redraw_viewport();
        }, 50);
        return;
      }

      this.res.on("load", (e) => {
        if (cconst.DEBUG.potreeEvents) {
          console.log("potree READY2");
        }

        this.ready = true;
        accept(this);

        let ptree = this.res.data;

        function patchDispatchEvent(p) {
          let _dispatchEvent = p.dispatchEvent;
          p.dispatchEvent = function (event) {
            console.warn(event);
            _dispatchEvent.call(event);
          };
        }

        if (cconst.DEBUG.potreeEvents) {
          patchDispatchEvent(ptree);
          patchDispatchEvent(ptree.pcoGeometry);
        }

        //redraw immediately in case loading happens faster
        window.redraw_viewport(undefined, 4);


        let timer = window.setInterval(() => {
          if (!this.ptree) {
            window.clearInterval(time);
          }

          let numpoint_out = [0];
          let hash = this.hash(numpoint_out);

          if (hash !== -1 && hash !== 0 && numpoint_out[0] > 0) {
            if (cconst.DEBUG.potreeEvents) {
              console.log("ptree post-load change detected");
            }
            window.clearInterval(timer);
            window.redraw_viewport;
          }
        }, 150);
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

    /*
    console.log(min);
    console.log(max);
    console.log(scale);
    //*/

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

    ptree.material.depthWrite = true;
    ptree.material.depthTest = true;

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

    let chash = view3d.activeCamera.generateUpdateHash(uniforms.objectMatrix);

    chash = chash ^ (ptree.material.needsUpdate ? 4234234 : 0);
    chash = chash ^ this.hash();

    let hash = mat.calcSettingsHash() ^ chash;
    if (hash !== this._last_material_hash) {
      this._last_material_hash = hash;

      if (cconst.DEBUG.potreeEvents) {
        console.log("material update");
      }

      ptree.updateMaterial(ptree.material, ptree.visibleNodes, view3d.threeCamera, view3d.threeRenderer)
      ptree.material.recomputeClassification();

      let q = mat.quality;

      q = Math.pow(q, 5.0);

      let budget = 1024*8;
      budget += (1024*32*32 - budget)*q;

      if (budget !== ptree.pointBudget) {
        ptree.pointBudget = budget;

        Potree.updatePointClouds([ptree], view3d.threeCamera, view3d.threeRenderer);

        if (cconst.DEBUG.potreeEvents) {
          console.log("pointBudget change:", ptree.pointBudget);
        }
      }
    }


    if (chash !== this._last_camera_hash) {//} && (util.time_ms() - this._last_cull_time > 500)) {
      if (cconst.DEBUG.potreeEvents) {
        console.log("detected camera or potree update");
        console.log("%c " + chash, "color: teal");
      }

      this._last_camera_hash = chash;
      Potree.updatePointClouds([ptree], view3d.threeCamera, view3d.threeRenderer);
      this._last_cull_time = util.time_ms();
    }

    ptree.material.depthWrite = mask;
    ptree.material.depthTest = test;

    view3d.pRenderer.render({children : [ptree]}, view3d.threeCamera, undefined, {
      depthTest : test,
      depthWrite : mask
    });

    //*/

    ptree.material = startmat;
  }

  dataLink(getblock, getblock_addUser) {
    this.material = getblock_addUser(this.material);

    this.load();
  }

  onContextLost(e) {
    this._last_material_hash = "";
    this._last_camera_hash = "";
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
  material      : DataRef | DataRef.fromBlock(obj.material);
  url           : string;
  packedData    : array(byte);
  usePackedData : bool;
}
`;

nstructjs.manager.add_class(PointSet);
DataBlock.register(PointSet);
SceneObjectData.register(PointSet);

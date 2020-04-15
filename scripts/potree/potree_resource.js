import {ResourceType, resourceManager} from "../core/resource.js";
import '../extern/potree/build/potree/potree.js';
import {Shaders} from './potree_shaders.js';
import * as PotreeShaders from "../extern/potree/build/shaders/shaders.js";

export class PointSetResource extends ResourceType {
  constructor(url) {
    super(url);

    this.ready = false;
    this.data = undefined;
    this.thumbnail = undefined; //if exists, should be Image
  }

  static resourceDefine() {return {
    name : "pointset",
    uiName : "Point Set",
    flag : 0, //default flag, see ResourceFlags
    icon : -1
  }}

  clone() {
    let ret = new PointSetResource(this.url);
    ret.data = this.data.clone();

    return ret;
  }

  static handlesURL(url) {
    return false;
  }

  static createFromURL(url) {
    return new PointSetResource(url);
  }

  load() {
    Potree.loadPointCloud(this.url, this.name, (e) => {
      this.data = e.pointcloud;
      console.log("Point Cloud", e);


      let pcloud = e.pointcloud;
      let material = pcloud.material;

      pcloud.baseMaterial = material;

      //material.uniforms.uShadowColor.value = [0.0, 0, 0];
      material.size = 1;
      material.useEDL = false;
      material.recomputeClassification();

      material.pointSizeType = Potree.PointSizeType.ADAPTIVE;
      material.shape = Potree.PointShape.SQUARE;

      let flat = new Potree.PointCloudMaterial(material);

      pcloud.flatMaterial = flat;
      flat.size = material.size;
      flat.recomputeClassification();
      flat.activeAttributeName = "color";
      //flat.defines.set("color_type_color", "#define color_type_color");
      flat.color = new THREE.Color(1.0, 0.5, 0.5);// [1.0, 0.5, 0.5];
      flat.pointSizeType = material.pointSizeType;
      flat.shape = material.shape;

      window.flat = flat;

      this.ready = true;

      this.fire("load", this.data);
    });
  }

  isReady() {
    return this.ready;
  }

  getThumbnail() {
    return this.thumbnail;
  }
}

resourceManager.register(PointSetResource);

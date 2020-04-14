import {ResourceType, resourceManager} from "../core/resource.js";
import '../extern/potree/build/potree/potree.js';

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

      let material = e.pointcloud.material;
      //material.uniforms.uShadowColor.value = [0.0, 0, 0];
      material.size = 1;
      material.useEDL = false;
      material.recomputeClassification();

      material.pointSizeType = Potree.PointSizeType.ADAPTIVE;
      material.shape = Potree.PointShape.SQUARE;

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

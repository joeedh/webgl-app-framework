import {ResourceType, resourceManager} from "../core/resource.js";

export class PointSetResource extends ResourceType {
  constructor(url) {
    super(url);

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

  }

  isReady() {

  }

  getThumbnail() {
    return this.thumbnail;
  }
}

resourceManager.register(PointSetResource);

import {ResourceType, resourceManager} from '../../core/resource.js';
import {resolvePath} from "../../config.js";

export const ResourcePages = [];

export class ResourcePageType {
  getResClass() {
    throw new Error("getResClass(): implement me!");
  }

  getResources() {
    return [];
  }

  loadResource(res) {
    return resourceManager.get(res.url, res.constructor);
  }

  static resDefine() {return {
    name        : "",
    uiname      : "",
    description : "",
    icon        : -1,
    flag        : 0
  }}

  static register(cls) {
    ResourcePages.push(cls);
  }
}



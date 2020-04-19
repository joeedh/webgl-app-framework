import {ResourceType, resourceManager} from '../../core/resource.js';
import {PointSetResource} from '../../potree/potree_resource.js'
import {resolvePath} from "../../config.js";

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
}

export class PointSetPage extends ResourcePageType {
  constructor() {
    super();

    this.list = [];
    let host = location.host;
    let url = resolvePath("/examples/examples.json");

    fetch(url).then((res) => {
      let body = "";

      console.log("loaded", res.body);
      res.json().then((data) => {
        for (let k in data) {
          let v = data[k];
          let res = new PointSetResource(v.url);

          res.url = resolvePath(res.url);
          res.name = k;

          if (v.thumbnail) {
            let image = new Image();
            image.src = v.thumbnail;

            res.thumbnail = image;
          }

          this.list.push(res);
        }
      })
    });
    console.log(url);
  }

  getResClass() {
    return PointSetResource;
  }
  getResources() {
    return this.list;
  }

  loadResource(res) {
    return resourceManager.get(res.url, res.constructor);
  }
}

export const ResourcePages = {
  "pointset" : new PointSetPage(),
  "image" : undefined
};

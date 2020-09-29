import {EventBase} from '../core/eventbase.js';
import {EnumProperty} from "../path.ux/scripts/toolsys/toolprop.js";

/**

 Resources are handled globally.  By default resources are only loaded
 once, unless it's explicity requested to clone them.
 */
export const ResourceFlags = {
  SELECT : 1,
  LOCKED : 2,
  HIDE   : 4
};

/**

 */
export class ResourceType extends EventBase {
  constructor(url) {
    super();

    let def = this.constructor.resourceDefine();

    this.url = url;
    this.flag = def.flag ? def.flag : 0;
    this.name = undefined;
    this.users = 0;
  }

  addUser() {
    this.users++;
  }

  remUser() {
    this.users--;

    if (this.users <= 0) {
      if (this.users < 0) {
        console.warn("Negative users detected", this);
        this.users = 0;
      }

      this.unload();
    }
  }

  unload() {

  }

  static handlesURL(url) {
    return false;
  }
  static createFromURL(url) {

  }

  static resourceDefine() {return {
    name : "",
    uiName : "",
    flag : 0, //default flag, see ResourceFlags
    icon : -1 //icon for the resource type in general, not specific resources
  }}

  clone() {
    //clone this resource
  }

  load() {

  }

  isReady() {

  }

  getThumbnail() { //returns an Image, or undefined

  }
}

export class ResourceManager {
  constructor() {
    this._cls_idgen = 0;
    this.lists = {};
    this.classes = [];
    this.url_res_map = {};
  }

  makeEnum() {
    let e = {};
    let ui_value_names = {};
    let icons = {};

    let name = "";

    for (let cls of this.classes) {
      let def = cls.resourceDefine();

      name = def.name;

      e[def.name] = def.name;
      ui_value_names[def.name] = def.uiName;
      icons[def.name] = (def.icon !== undefined && def.icon !== null) ? def.icon : -1;
    }

    let prop = new EnumProperty(name, e);
    prop.ui_value_names = ui_value_names;
    prop.addIcons(icons);

    return prop;
  }

  classFromURL(url) {
    for (let cls of this.classes) {
      if (cls.handlesURL(url)) {
        return cls;
      }
    }
  }

  getList(cls) {
    return this.lists[cls._restype_id];
  }

  has(resource_or_url) {
    if (typeof resource_or_url == "object") {
      let list = this.getList(resource.constructor);

      return list.indexOf(resource) >= 0;
    } else {
      return resource_or_url in this.url_res_map;
    }
  }

  add(resource) {
    let list = this.getList(resource.constructor);
    list.push(resource);

    this.url_res_map[resource.url] = resource;
  }

  get(url, resclass, autoload=false) {
    if (url in this.url_res_map) {
      return this.url_res_map[url];
    }

    if (resclass === undefined) {
      resclass = this.classFromURL(url);
    }

    if (resclass === undefined) {
      throw new Error("unknown resource type for url " + url);
    }

    let res = resclass.createFromURL(url);

    let list = this.getList(resclass);

    list.push(res);
    this.url_res_map[url] = res;

    if (autoload)
      res.load();

    return res;
  }

  register(cls) {
    cls._restype_id = this._cls_idgen++;
    this.lists[cls._restype_id] = [];

    this.classes.push(cls);
  }
}

export const resourceManager = new ResourceManager();
window._resourceManager = resourceManager;

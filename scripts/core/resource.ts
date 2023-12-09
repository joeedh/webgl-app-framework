import {EventBase} from '../core/eventbase.js';
import {EnumProperty, ToolProperty} from "../path.ux/scripts/pathux.js";

/**

 Resources are handled globally.  By default resources are only loaded
 once, unless it's explicity requested to clone them.
 */
export const ResourceFlags = {
  SELECT: 1,
  LOCKED: 2,
  HIDE: 4
};


export interface IResDef {
  name: string,
  uiName?: string,
  flag?: number,
  icon?: number
}

export interface IResConstructor<final> {
  new(url: string): final;

  resourceDefine(): IResDef;

  handlesURL(url: string): boolean;

  createFromURL(url: string): final;
}

export class ResourceType extends EventBase {
  url: string;
  flag: number;
  name: string;
  users: number;

  ['constructor']: IResConstructor<this>;

  constructor(url: string) {
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

  static handlesURL(url: string): boolean {
    return false;
  }

  static resourceDefine(): IResDef {
    return {
      name: "",
      uiName: "",
      flag: 0, //default flag, see ResourceFlags
      icon: -1 //icon for the resource type in general, not specific resources
    }
  }

  clone(): void {
    //clone this resource
  }

  load(): void {

  }

  isReady(): void {

  }

  getThumbnail(): void { //returns an Image, or undefined

  }
}

export class ResourceManager {
  private _cls_idgen: number;
  lists: { [k: number]: ResourceType[] };
  classes: IResConstructor<any>[];
  url_res_map: { [k: string]: ResourceType };

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
      ui_value_names[def.name] = def.uiName ?? ToolProperty.makeUIName(def.name);
      icons[def.name] = (def.icon !== undefined && def.icon !== null) ? def.icon : -1;
    }

    let prop = new EnumProperty(name, e);
    prop.addUINames(ui_value_names);
    prop.addIcons(icons);

    return prop;
  }

  classFromURL(url: string) {
    for (let cls of this.classes) {
      if (cls.handlesURL(url)) {
        return cls;
      }
    }
  }

  getList(cls) {
    return this.lists[cls._restype_id];
  }

  has(resource_or_url: any): boolean {
    if (typeof resource_or_url == "object") {
      let resource = resource_or_url as unknown as ResourceType;
      let list = this.getList(resource.constructor);

      return list.indexOf(resource) >= 0;
    } else if (typeof resource_or_url === "string") {
      return resource_or_url in this.url_res_map;
    } else {
      throw new Error("Invalid resource " + resource_or_url);
    }
  }

  add(resource: ResourceType) {
    let list = this.getList(resource.constructor);
    list.push(resource);

    this.url_res_map[resource.url] = resource;
  }

  get(url, resclass, autoload = false) {
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

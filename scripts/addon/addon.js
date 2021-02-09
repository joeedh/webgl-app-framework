import {AddonAPI} from './addon_base.js';
import * as util from '../util/util.js';

export var AddonPath = "../../addons/"

export class AddonRecord {
  constructor(url, addon, addonAPI) {
    this.addon = addon;
    this.addonAPI = addonAPI;
    this.url = url;
    this.enabled = false;
  }
}

export class AddonManager {
  constructor() {
    this.addons = [];
    this.urlmap = new Map();
  }

  unload(addon_or_url) {
    let rec;

    if (typeof addon_or_url === "string") {
      rec = this.urlmap.get(addon_or_url);
    } else {
      for (let rec2 of this.addons) {
        if (rec2.addon === addon_or_url) {
          rec = addon_or_url;
          break;
        }
      }
    }

    if (!rec) {
      throw new Error("Unknown addon " + rec);
    }

    rec.addonAPI.unregisterAll();
    try {
      rec.addon.unregister();
    } catch (error) {
      util.print_stack(error);
      return false;
    }

    return true;
  }

  _loadAddon(rec, reject) {
    let module = rec.addon;

    try {
      module.register(rec.addonAPI);
    } catch (error) {
      util.print_stack(error);
      console.log("error while loading addon " + rec.url, rec.addon);
      rec.addonAPI.unregister();

      reject("error loading addon: " + error.message + ":\n" + error.stack);
      return;
    }

    rec.enabled = true;
  }

  load(url, register=true) {
    if (this.urlmap.has(url)) {
      let rec = this.urlmap.get(url);
      if (!rec.enabled && register) {
        return new Promise((accept, reject) => {
          if (this._loadAddon(rec, reject)) {
            accept(rec.addon);
          }
        });
      }

      throw new Error("addon is already loaded");
    }

    return new Promise((accept, reject) => {
      import(AddonPath + url).then(module => {
        let api = new AddonAPI();

        api.addon = module;

        let rec = new AddonRecord(url, module, api);
        if (register) {
          this._loadAddon(rec, reject);
        }

        this.addons.push(rec);
        accept(module);
      });
    });
  }

  loadAddonList(register=false) {
    fetch("addons/list.json").then(r => r.json()).then(json => {
      console.error("json", json);
      for (let url of json) {
        this.load(url, register);
      }
    });
  }
}

const manager = new AddonManager();
export default manager

export function startAddons(autoRegister) {
  manager.loadAddonList(autoRegister);
}

window._addons = manager;

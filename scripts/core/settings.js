import {util, nstructjs, Vector2, Vector3, Vector4, Quat, Matrix4} from '../path.ux/scripts/pathux.js';
import {BrushSets, setBrushSet} from '../brush/brush.ts';
let STRUCT = nstructjs.STRUCT;
import addonManager from '../addon/addon.js';

export class SavedScreen {
  constructor(name, data) {
    this.name = name;
    this.data = data;
  }

  static create(name="Screen") {
    let file = _appstate.createFile({save_screen : true, save_library : false, save_settings : false});
    return new SavedScreen(name, data);
  }

  loadSTRUCT(reader) {
    reader(this);

    this.data = new Uint8Array(this.data).buffer;
  }
}

SavedScreen.STRUCT = `
SavedScreen {
  data : array(byte);
}
`
nstructjs.register(SavedScreen);

let SETTINGS_KEY = "webgl-app-framework-settings";

export class AddonSettings {
  constructor(name) {
    this.name = name;
    this.enabled = false;
    this.settings = {}; //json
  }

  loadSTRUCT(reader) {
    reader(this);

    try {
      this.settings = JSON.parse(this.settings);
    } catch (error) {
      console.error(error.message, "\n" + error.stack);
      this.settings = {};
    }
  }

  toJSON() {
    return {
      name : this.name,
      enabled : this.enabled,
      settings : this.settings
    }
  }

  loadJSON(json) {
    this.settings = json.settings;
    this.name = json.name;
    this.enabled = json.enabled;

    return this;
  }
}
AddonSettings.STRUCT = `
AddonSettings {
  name     : string;
  enabled  : bool;
  settings : string | JSON.stringify(this.settings); 
}
`;
nstructjs.register(AddonSettings);

export class AppSettings {
  constructor() {
    this.screens = [];
    this.addonSettings = {};
    this.limitUndoMem = true;
    this.undoMemLimit = 512; //in megabytes
    this.brushSet = BrushSets.MEDIUM_RES;
  }

  static defineAPI(api) {
    let st = api.mapStruct(this, true);

    let onchange = function() {
      if (this.dataref === _appstate.settings) {
        this.dataref.save();
      }
    }

    st.bool("limitUndoMem", "limitUndoMem", "Limit Undo Memory")
      .on('change', onchange);
    st.int("undoMemLimit", "undoMemLimit", "Mem Limit", "Memory Limit in megabytes (for undo)")
      .on('change', onchange);
    st.enum("brushSet", "brushSet", BrushSets).on('change', function() {
      let settings = this.dataref;

      setBrushSet(settings.brushSet);
    }).descriptions({
      MEDIUM_RES : "For 100k triangle meshes and less.\nBrushes will try to align geometry to curvature.\n (i.e. Rake and Curvature Factor are set to 1)."
    });

    let ast = api.mapStruct(AddonSettings, true);
    ast.bool("enabled", "enabled", "Enabled")
      .on('change', function(val) {
        for (let addon of addonManager.addons) {
          if (addon.key === this.dataref.name) {
            console.log("found addon", addon);
            addon.enabled = val;
          }
        }

        if (window._appstate && _appstate.settings) {
          _appstate.settings.save();
        }
      });

    ast.string("name", "name", "Name").readOnly();

    st.list("addonSettings", "addons", {
      getStruct(api, list, key) {
        return ast;
      },

      get(api, list, key) {
        return list[key];
      },

      getKey(api, list, obj) {
        return obj.name;
      },

      getIter(api, list) {
        return (function*() {
          for (let k in list) {
            yield list[k];
          }
        })();
      }
    });
    return st;
  }

  toJSON() {
    return {
      screens : this.screens,
      limitUndoMem : this.limitUndoMem,
      undoMemLimit : this.undoMemLimit,
      brushSet : this.brushSet,
      addonSettings : this.addonSettings
    }
  }

  loadJSON(json) {
    this.limitUndoMem = json.limitUndoMem;
    this.undoMemLimit = json.undoMemLimit;

    if (json.brushSet !== undefined) {
      this.brushSet = json.brushSet;
    }

    this.addonSettings = json.addonSettings || {};

    for (let k in this.addonSettings) {
      let json2 = this.addonSettings[k];
      this.addonSettings[k] = new AddonSettings().loadJSON(json2);
    }

    //this.screens = json.screens;
  }

  save() {
    console.log(util.termColor("Saving settings", "green"));
    localStorage[SETTINGS_KEY] = JSON.stringify(this);
  }

  _loadAddons() {
    this.syncAddonList();

    for (let addon of addonManager.addons) {
      let addon2 = this.addonSettings[addon.key];

      if (!!addon2.enabled !== !!addon.enabled) {
        addon.enabled = addon2.enabled;
      }
    }
  }

  load() {
    let json;

    try {
      json = JSON.parse(localStorage[SETTINGS_KEY]);
    } catch (error) {
      console.warn("Failed to load user settings from localStorage");
      return;
    }

    this.loadJSON(json);

    try {
      setBrushSet(this.brushSet);
    } catch (error) {
      util.print_stack(error);
    }

    //window.setTimeout(() => {
      this._loadAddons();
    //});
  }

  syncAddonList() {
    let ret = false;

    for (let addon of addonManager.addons) {
      if (!(addon.key in this.addonSettings)) {
        this.addonSettings[addon.key] = new AddonSettings(addon.key);

        ret = true;
      }
    }

    if (ret) {
      this.save();
    }

    return ret;
  }

  destroy() {
  }

  loadSTRUCT(reader) {
    reader(this);

    let addonSettings = this.addonSettings;

    console.error("addonSettings", addonSettings);

    if (!(addonSettings instanceof Array)) {
      return;
    }

    this.addonSettings = {};

    for (let addon of addonSettings) {
      this.addonSettings[addon.name] = addon;
    }
  }
}

AppSettings.STRUCT = `
AppSettings {
  screens       : array(SavedScreen);
  limitUndoMem  : bool;
  undoMemLimit  : int;
  brushSet      : int;
  addonSettings : iterkeys(AddonSettings);
}
`;
nstructjs.register(AppSettings);

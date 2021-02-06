import {util, nstructjs, Vector2, Vector3, Vector4, Quat, Matrix4} from '../path.ux/scripts/pathux.js';
import {BrushSets, setBrushSet} from '../brush/brush.js';
let STRUCT = nstructjs.STRUCT;

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
nstructjs.manager.add_class(SavedScreen);

let SETTINGS_KEY = "webgl-app-framework-settings";

export class AppSettings {
  constructor() {
    this.screens = [];
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

    return st;
  }

  toJSON() {
    return {
      screens : this.screens,
      limitUndoMem : this.limitUndoMem,
      undoMemLimit : this.undoMemLimit,
      brushSet : this.brushSet
    }
  }

  loadJSON(json) {
    this.limitUndoMem = json.limitUndoMem;
    this.undoMemLimit = json.undoMemLimit;

    if (json.brushSet !== undefined) {
      this.brushSet = json.brushSet;
    }

    //this.screens = json.screens;
  }

  save() {
    console.log(util.termColor("Saving settings", "green"));
    localStorage[SETTINGS_KEY] = JSON.stringify(this);
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
  }

  destroy() {
  }
}

AppSettings.STRUCT = `
AppSettings {
  screens      : array(SavedScreen);
  limitUndoMem : bool;
  undoMemLimit : int;
  brushSet     : int;
}
`;
nstructjs.manager.add_class(AppSettings);

import {util, nstructjs, Vector2, Vector3, Vector4, Quat, Matrix4} from '../path.ux/scripts/pathux.js';
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

export class AppSettings {
  constructor() {
    this.screens = [];
  }
  
  destroy() {
  }
}

AppSettings.STRUCT = `
AppSettings {
  screens : array(SavedScreen);
}
`;
nstructjs.manager.add_class(AppSettings);

import './path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

export class AppSettings {
  constructor() {
    this.example = 0;
  }
  
  static fromSTRUCT(reader) {
    let ret = new AppSettings();
    reader(ret);
    return ret;
  }
  
  destroy() {
  }
}

AppSettings.STRUCT = `
AppSettings {
  example : int;
}
`;
nstructjs.manager.add_class(AppSettings);

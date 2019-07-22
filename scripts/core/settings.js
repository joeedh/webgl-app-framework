import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;

export class AppSettings {
  constructor() {
    this.example = 0;
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

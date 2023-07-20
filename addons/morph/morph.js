import {makeMorphToolMode} from './morphtool.js';

let _api;

export const addonDefine = {
  name : "Morph"
};

export function register(api) {
  _api = api;

  let Editor = api.editor.Editor;

  class MorphEditor extends api.editor.Editor {
    constructor() {
      super();

    }

    on_resize() {
      super.on_resize();
    }

    init() {
      super.init();
    }

    update() {
      super.update();
    }

    setCSS() {
      super.setCSS();
    }

    static define() {
      return {
        uiname : "Morph Editor",
        areaname : "morph-editor",
        tagname : "addon-morph-editor-x"
      }
    }
  }
  MorphEditor.STRUCT = api.nstructjs.inherit(MorphEditor, Editor) + `
  }
  `;
  api.register(MorphEditor);

  console.error("API", api);

  makeMorphToolMode(api);
}

export function unregister(api) {

}


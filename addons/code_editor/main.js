export function addonDefine() {
  return {
    name   : "addon",
    uiname : "addon",
    version : 0,
    author : "",
    url : "",
    icon : -1,
    description : "",
    documentation : ""
  }
}

export function register(api) {
  let Editor = api.editor.Editor;

  class CodeEditor extends api.editor.Editor {
    constructor() {
      super();
    }

    static define() {
      return {
        uiname : "Code Editor",
        areaname : "code-editor",
        tagname : "addon-code-editor-x"
      }
    }
  }
  CodeEditor.STRUCT = api.nstructjs.inherit(CodeEditor, Editor) + `
  }
  `;
  api.nstructjs.register(CodeEditor);
  api.register(CodeEditor);
}

export function unregister(api) {

}


export function makeMorphToolMode(api) {
  let nstructjs = api.nstructjs;
  
  class MorphToolMode extends api.toolmode.ToolMode {
    constructor() {
      super();
    }

    static toolModeDefine() {
      return {
        name        : "morphtool",
        uiname      : "Morph Tool",
        icon        : api.Icons.SHOW_LOOPS,
        description : "Morph Tool",
        transWidgets: [],
        flag        : 0
      }
    }
  }

  MorphToolMode.STRUCT = nstructjs.inherit(MorphToolMode, api.toolmode.ToolMode) + `
  }
  `;

  api.register(MorphToolMode);
}

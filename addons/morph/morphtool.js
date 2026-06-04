export function makeMorphToolMode(api) {
  let nstructjs = api.nstructjs

  class MorphToolMode extends api.toolmode.ToolMode {
    static STRUCT = nstructjs.inlineRegister(this, `
morph.MorphToolMode {
  }
  `)

    constructor() {
      super()
    }

    static toolModeDefine() {
      return {
        name        : 'morphtool',
        uiname      : 'Morph Tool',
        icon        : api.Icons.SHOW_LOOPS,
        description : 'Morph Tool',
        transWidgets: [],
        flag        : 0,
      }
    }
  }

  api.register(MorphToolMode)
}

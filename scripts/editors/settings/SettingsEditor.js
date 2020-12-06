import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as math from '../../util/math.js';
import * as util from '../../util/util.js';
import {
  exportTheme,
  nstructjs, UIBase
} from '../../path.ux/scripts/pathux.js';
import {Editor} from "../editor_base.js";
import {Icons} from "../icon_enum.js";

export class SettingsEditor extends Editor {
  constructor() {
    super();
  }

  init() {
    super.init();
    this.background = this.getDefault("DefaultPanelBG");

    let header = this.header;
    let container = this.container;

    let tabs = this.tabs = container.tabs("left");
    let tab;

    this.style["overflow"] = "scroll";

    tab = tabs.tab("General");

    tab = tabs.tab("Theme");

    tab.button("Export Theme", () => {
      let theme = exportTheme();

      theme = theme.replace(/var theme/, "export const theme");

      theme = "import {CSSFont, setTheme} from \"../path.ux/scripts/core/ui_base.js\";\n\n" + theme;
      theme = `
/*
 * WARNING: AUTO-GENERATED FILE
 * 
 * Copy to scripts/editors/theme.js
 */
      `.trim() + "\n\n" + theme;
      theme += "\nsetTheme(theme);\n\n";

      console.log(theme);

      let blob = new Blob([theme], {mime : "application/javascript"});
      let url = URL.createObjectURL(blob);

      console.log("url", url);
      window.open(url);
    });

    tab.add(UIBase.createElement("theme-editor-x"));

    this.flushUpdate();
  }

  setCSS() {
    super.setCSS();
  }

  update() {
    return super.update();
  }

  static define() {return {
    uiname : 'Settings',
    areaname : 'settings-editor',
    tagname : 'settings-editor-x',
    icon : Icons.EDITOR_SETTINGS,
  }}
}
SettingsEditor.STRUCT = nstructjs.inherit(SettingsEditor, Editor) + `
}`

nstructjs.register(SettingsEditor);
Editor.register(SettingsEditor);
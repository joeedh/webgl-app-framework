import {Area, BorderMask} from '../../path.ux/scripts/screen/ScreenArea.js';
import {Icons} from "../icon_enum.js";

import {NoteFrame, Note} from '../../path.ux/scripts/widgets/ui_noteframe.js';

import {Editor, VelPan} from '../editor_base.js';
import '../../path.ux/scripts/util/struct.js';

let STRUCT = nstructjs.STRUCT;

import {DataPathError, saveFile, loadFile} from '../../path.ux/scripts/pathux.js';
import {KeyMap, HotKey} from '../../path.ux/scripts/util/simple_events.js';
import {UIBase, color2css, _getFont, css2color} from '../../path.ux/scripts/core/ui_base.js';
import {Container, RowFrame, ColumnFrame} from '../../path.ux/scripts/core/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {DataBlock, DataRef} from '../../core/lib_api.js';
import {NodeEditor} from "../node/NodeEditor.js";
import * as cconst from '../../core/const.js';
import {Menu} from "../../path.ux/scripts/widgets/ui_menu.js";
import {MeshTypes} from "../../mesh/mesh_base.js";
import {ProceduralTex, ProceduralTexUser} from '../../texture/proceduralTex.js';
import {ProceduralMesh} from '../../mesh/mesh_gen.js';

export const TexturePathModes = {
  BRUSH : 0,
  EDITOR: 1
};

export class CDLayerPanel extends ColumnFrame {
  constructor() {
    super();
    this._lastUpdateKey = undefined;
  }

  init() {
    super.init();
    this.doOnce(this.rebuild);
  }

  rebuild() {
    if (!this.ctx) {
      this._lastUpdateKey = undefined;
      return;
    }

    this.clear();

    let meshpath = this.getAttribute("datapath");
    let type = this.getAttribute("type");
    let layertype = this.getAttribute("layer");

    if (!this.hasAttribute("datapath") || !this.hasAttribute("type") || !this.hasAttribute("layer")) {
      this.ctx.error("Expected 'datapath' 'type' and 'layer' attributes'");
      return;
    }
    type = type.toUpperCase().trim();
    type = MeshTypes[type];

    if (!type) {
      this.ctx.error("Bad mesh type " + this.getAttribute("type"));
      return;
    }

    let mesh = this.ctx.api.getValue(this.ctx, meshpath);
    if (!mesh) {
      this.ctx.error("data api error", meshpath);
      return;
    }
    let elist = mesh.getElemList(type);
    if (!elist) {
      this.ctx.error("Mesh api error " + type);
      return;
    }

    let panel = this.panel(layertype + " Layers");

    this.list = panel.listbox();
    let actlayer = elist.customData.getActiveLayer(layertype);

    let checks = [];

    for (let layer of elist.customData.flatlist) {
      if (layer.typeName === layertype) {
        let item = this.list.addItem(layer.name);

        let check = item.iconcheck(undefined, Icons.CIRCLE_SEL);
        check.checked = layer === actlayer;
        check.layerIndex = layer.index;

        checks.push(check);

        check.onchange = function () {
          if (this.checked) {
            elist.customData.setActiveLayer(this.layerIndex);

            for (let c of checks) {
              if (c !== this) {
                c.checked = false;
              }
            }
          } else {
            if (elist.customData.getActiveLayer(layertype).index === this.layerIndex) {
              let chg = this.onchange;
              this.checked = true;
              this.onchange = chg;
            }
          }
        }


      }
    }

    panel.useIcons(false);
    panel.tool(`mesh.add_cd_layer(elemType=${type} layerType="${layertype}")`);
    panel.tool(`mesh.remove_cd_layer(elemType=${type} layerType="${layertype}")`);
  }

  updateDataPath() {
    if (!this.ctx) {
      return;
    }

    let meshpath = this.getAttribute("datapath");
    let type = this.getAttribute("type");
    let layertype = this.getAttribute("layer");

    if (!this.hasAttribute("datapath")
      || !this.hasAttribute("type")
      || !this.hasAttribute("layer")) {
      return;
    }

    type = type.toUpperCase().trim();
    type = MeshTypes[type];

    if (!type) {
      return;
    }

    let mesh = this.ctx.api.getValue(this.ctx, meshpath);
    if (!mesh) {
      return;
    }

    let key = mesh.lib_id + ":";
    let elist = mesh.getElemList(type);

    if (!elist) {
      return;
    }

    for (let layer of elist.customData.flatlist) {
      if (layer.typeName === layertype) {
        key += layer.name + ":";
      }
    }

    if (key !== this._lastUpdateKey) {
      this._lastUpdateKey = key;

      //console.log("rebuilding mesh layers list");
      this.rebuild();
    }
  }

  update() {
    super.update();

    this.updateDataPath();
  }

  static define() {
    return {
      tagname: "cd-layer-panel-x"
    }
  }
}

UIBase.register(CDLayerPanel);

export class ObjectPanel extends ColumnFrame {
  constructor() {
    super();

    this._last_update_key = "";
  }

  init() {
    super.init();
    this.rebuild();
    //this.doOnce(this.rebuild);
  }

  rebuild() {
    if (!this.ctx) {
      if (!this.isDead()) {
        this.doOnce(this.rebuild);
      }

      return;
    }

    this.clear();
    this.pathlabel("object.name");

    let panel;

    panel = this.panel("Transform");
    panel.useIcons(false);

    panel.prop(`object.inputs["loc"].value`);

    panel.label("Rotation");
    panel.prop('object.inputs["rot"].value');
    panel.prop('object.inputs["rotOrder"].value');

    panel.prop('object.inputs["scale"].value');

    panel.tool("object.apply_transform()");

    panel = this.panel("Draw");
    panel.useIcons(false);
    panel.prop("object.flag[DRAW_WIREFRAME]");

    let ob = this.ctx.object;
    if (!ob) {
      return;
    }

    let cdpanels = [
      ["VERTEX", "color"],
      ["LOOP", "uv"],
      ["VERTEX", "mask"]
    ];

    let data = ob.data;
    if (data instanceof Mesh) {
      let panel = this.panel("Data Layers");

      for (let cdp of cdpanels) {
        let cd = UIBase.createElement("cd-layer-panel-x");
        cd.setAttribute("datapath", "mesh");
        cd.setAttribute("type", cdp[0]);
        cd.setAttribute("layer", cdp[1]);
        panel.add(cd);
      }

      panel = this.panel("BVH");

      panel.prop("mesh.bvhSettings.leafLimit");
      panel.prop("mesh.bvhSettings.drawLevelOffset");
      panel.prop("mesh.bvhSettings.depthLimit");
    } else if (data instanceof ProceduralMesh) {
      let panel = this.panel("Procedural");
      let strip;

      strip = panel.col().strip();

      strip.prop('toolDefaults.mesh.procedural_to_mesh.triangulate');
      strip.tool(`mesh.procedural_to_mesh(objectId=${ob.lib_id})`);

      strip = panel.col().strip();

      strip.dataPrefix = "object.data.generator";
      data.generator.constructor.buildSettings(strip);
    }
  }

  update() {
    super.update();

    if (!this.ctx || !this.ctx.object) {
      return;
    }


    let ob = this.ctx.object;
    let key = "" + ob.lib_id + ":" + ob.data.lib_id;

    if (key !== this._last_update_key) {
      this._last_update_key = key;
      this.rebuild();
    }
  }

  static define() {
    return {
      tagname: "scene-object-panel-x"
    }
  }
}

UIBase.register(ObjectPanel);

export class TexturePanel extends Container {
  constructor() {
    super();

    this.canvas = document.createElement("canvas");
    this.g = this.canvas.getContext("2d");
    this.previewSize = 100;

    this._lastkey = undefined;

    this._drawreq = undefined;
    this._rebuildReq = undefined;

    /*
    this.modebox = this.listenum(undefined, {
      name : "Mode",
      enumDef : ProceduralTex.buildGeneratorEnum(),
      defaultVal : 0,
      callback : (id) => {
        console.log("id", id);
        let tex = this.getTexture();
        if (tex) {
          tex.setGenerator(ProceduralTex.getPattern(id));
        }
      }
    });*/
  }

  getTexture() {
    let path = this.getAttribute("datapath");
    if (!path) {
      return undefined;
    }

    return this.getPathValue(this.ctx, path);
  }

  init() {
    super.init();

    this.mode = this.listenum(undefined, "Type", {});
    this.preview = this.panel("Preview");
    this.settings = this.panel("Settings");
    this.preview.add(this.canvas);

    this.flagRebuild();

    this.flagRedraw();
  }

  rebuild() {
    if (!this.ctx || !this.settings) {
      this.flagRedraw();
      return;
    }

    this._rebuildReq = false;

    let panel = this.settings;
    panel.clear();

    let tex = this.getTexture();

    if (!tex) {
      return;
    }

    this.mode.ctx = this.ctx;

    let cls = tex.generator.constructor;

    let path = this.getAttribute("datapath");

    this.mode.setAttribute("datapath", path + ".mode");

    panel.dataPrefix = path;

    console.log("Path prefix", path);
    tex.buildSettings(panel);

    this.flagRedraw();
    this.flushUpdate();
  }

  flagRebuild() {
    if (this._rebuildReq) {
      return;
    }

    this._rebuildReq = 1;
    window.setTimeout(() => {
      this.rebuild();
    });
  }

  update() {
    if (!this.preview) {
      return;
    }

    let tex = this.getTexture();
    let texid = tex !== undefined ? tex.lib_id : -1;

    let key = "" + texid;
    if (tex) {
      key += ":" + tex.generator.constructor.name;
    }

    if (key !== this._lastkey) {
      this._lastkey = key;
      this.flagRebuild();
      this.flagRedraw();
    }

    if (tex && tex.update()) {
      this.flagRedraw();
    }
  }

  flagRedraw() {
    if (this._drawreq) {
      return;
    }

    this._drawreq = 1;
    window.setTimeout(() => {
      this.redraw();
    });
  }

  redraw() {
    this._drawreq = undefined;

    let g = this.g;
    let canvas = this.canvas;

    g.clearRect(0, 0, canvas.width, canvas.height);

    let f1 = 200;
    let f2 = 135;

    let colors = [
      `rgb(${f1},${f1},${f1})`,
      `rgb(${f2},${f2},${f2})`
    ];

    let csize = 16;
    let steps = Math.ceil(this.previewSize / csize);
    for (let i=0; i<steps*steps; i++) {
      let x = i % steps, y = ~~(i / steps);

      let j = (x+y) % 2;
      let color = colors[j];

      x *= csize;
      y *= csize;

      g.fillStyle = color;

      g.beginPath()
      g.rect(x, y, csize, csize);
      g.fill();
    }

    let tex = this.getTexture();
    if (!tex) {
      return;
    }

    let size = this.previewSize;
    let image = tex.getPreview(size, size);

    g.drawImage(image, 0, 0);
  }

  setCSS() {
    super.setCSS();

    let dpi = UIBase.getDPI();
    let w = ~~(this.previewSize*dpi);

    let canvas = this.canvas;
    canvas.width = w;
    canvas.height = w;

    let w2 = w/dpi;
    let h2 = w/dpi;

    canvas.style["width"] = w2 + "px";
    canvas.style["height"] = h2 + "px";

    this.redraw();
  }

  static define() {
    return {
      tagname: "texture-panel-x"
    }
  }
}

UIBase.register(TexturePanel);

export class TextureSelectPanel extends TexturePanel {
  constructor() {
    super();

    this.browser = document.createElement("data-block-browser-x");
    this.browser.blockClass = ProceduralTex;
  }

  init() {
    super.init();
    this.browser.setAttribute("datapath", this.getAttribute("datapath"));

    this.prepend(this.browser);
  }

  update() {
    if (!this.ctx) {
      return;
    }

    super.update();
    this.browser.setAttribute("datapath", this.getAttribute("datapath"));
  }

  static define() {
    return {
      tagname : "texture-select-panel-x"
    }
  }
}
UIBase.register(TextureSelectPanel);

export class PropsEditor extends Editor {
  constructor() {
    super();

    this.texUser = new ProceduralTexUser();

    this.texturePathMode = TexturePathModes.EDITOR;
    this.texturePath = "";

    this._last_toolmode = undefined;
  }

  on_area_active() {
    super.on_area_active();

    if (!this.ctx) {
      return;
    }

    //check that init has been called
    this._init();
    this.setCSS();

    console.log("Area active!");

    //on_area_active could be called during file load, so put flushUpdate in a try block

    try {
      this.flushUpdate();
    } catch (error) {

    }
  }


  init() {
    super.init();
    this.background = this.getDefault("DefaultPanelBG");

    this.style["overflow"] = "scroll";

    let header = this.header;
    let container = this.container;

    this.tabs = container.tabs("left");
    let tab;

    this.workspaceTab = this.tabs.tab("Workspace");
    let panel, strip;

    tab = this.tabs.tab("Scene");
    panel = tab.panel("Viewport Settings");
    panel.useIcons(false);
    panel.prop("view3d.cameraMode[PERSPECTIVE]");
    panel.prop("view3d.cameraMode[ORTHOGRAPHIC]");

    let viewAxis = (axis, sign) => {
      this.ctx.view3d.viewAxis(axis, sign);
    }

    let axes = {
      "Front" : [1, 1],
      "Left"  : [0, 1],
      "Back"  : [1, -1],
      "Right" : [0, -1],
      "Top"   : [2, 1],
      "Bottom" : [2, -1]
    }

    function makeAxis(key, axis, sign) {
      panel.button(key, () => {
        viewAxis(axis, sign);
      });
    }

    for (let k in axes) {
      let [axis, sign] = axes[k];
      makeAxis(k, axis, sign);
    }

    panel = tab.panel("Render Settings");
    panel.prop("scene.envlight.color");
    panel.prop("scene.envlight.power");
    panel.prop("scene.envlight.flag");
    panel.prop("scene.envlight.ao_dist");
    panel.prop("scene.envlight.ao_fac");

    tab = this.tabs.tab("Material");
    this.materialPanel(tab);

    tab = this.objTab = this.tabs.tab("Object");
    let obpanel = UIBase.createElement("scene-object-panel-x");
    tab.add(obpanel);

    tab = this.texTab = this.tabs.tab("Texture");
    this.textureTab(tab);

    this._last_obj = undefined;


    tab = this.tabs.tab("Last Command");
    let last = document.createElement("last-tool-panel-x")
    tab.add(last);


    tab = this.tabs.tab("Settings");

    panel = tab.panel("Brushes");
    strip = panel.row();
    strip.useIcons(false);

    strip.prop("settings.brushSet");

    strip.useIcons(true);
    strip.tool("brush.reload_all_defaults()");


    panel = tab.panel("Undo");

    let col = panel.col();
    col.useIcons(false);

    col.prop("settings.limitUndoMem");
    col.prop("settings.undoMemLimit");
  }

  static defineAPI(api) {
    let st = super.defineAPI(api);

    st.string("texturePath", "texturePath", "Active Texture Path");
    st.struct("_texture", "texture", "Active Texture", api.mapStruct(ProceduralTex));
    st.enum("texturePathMode", "texturePathMode", TexturePathModes, "Source").uiNames({
      EDITOR : "Any",
      BRUSH : "Brush"
    });

    return st;
  }

  //used by data path api
  get _texture() {
    if (this.texturePath === "") {
      return undefined;
    }

    let path = this.texturePath;
    return this.ctx.api.getValue(this.ctx, path);
  }

  //used by data path api
  set _texture(val) {
    if (val !== undefined && val.lib_id < 0) {
      throw new Error("pattern is not in the datalib");
    }

    if (this.texturePathMode === TexturePathModes.EDITOR) {
      if (!val) {
        this.texturePath = '';
      } else {
        this.texturePath = `library.texture[${val.lib_id}]`;
      }
    } else {
      this.setPathValue(this.ctx, this.texturePathMode, val);
      /*
      let rdef = this.ctx.resolvePath(this.texturePath);
      if (!rdef) {
        return;
      }

      let obj = rdef.obj;
      if (obj instanceof DataBlock && obj.lib_id >= 0) {
        let block = val === undefined ? -1 : val.lib_id;
        let path = this.texturePath;

        let toolpath = `datalib.default_assign(block=${block} dataPathToSet=${path})`;
        this.ctx.api.execTool(this.ctx, toolpath);
      } else {
        this.setPathValue(this.ctx, this.texturePathMode, val);
      }//*/
    }
  }

  textureTab(tab) {
    //let tex = document.createElement("texture-panel-x");
    let tex = this.texPanel = document.createElement("texture-panel-x");

    let browser = document.createElement("data-block-browser-x");

    let path = "propsEditor.texture";

    tex.setAttribute("datapath", path);

    browser.setAttribute("datapath", path);
    browser.blockClass = ProceduralTex;

    let strip = tab.row().strip();
    strip.label("Source");
    strip.prop("propsEditor.texturePathMode");

    tab.add(browser);
    tab.add(tex);
  }

  materialPanel(tab) {
    let panel = document.createElement("mesh-material-panel-x");
    panel.setAttribute("datapath", "mesh");
    tab.add(panel);
  }

  updateToolMode() {
    if (!this.ctx || !this.ctx.toolmode || !this.workspaceTab) {
      return;
    }

    let toolmode = this.ctx.toolmode;

    if (toolmode === this._last_toolmode) {
      return;
    }

    this._last_toolmode = toolmode;

    this.workspaceTab.clear();
    toolmode.constructor.buildSettings(this.workspaceTab);
  }

  update() {
    //check init
    if (this.texPanel) {
      this.texPanel._init()
    }

    this.updateToolMode();

    super.update();
  }

  copy() {
    let ret = document.createElement("props-editor-x");
    ret.ctx = this.ctx;

    return ret;
  }

  setCSS() {
    super.setCSS();
  }

  static define() {
    return {
      tagname : "props-editor-x",
      areaname: "props",
      apiname : "propsEditor",
      uiname  : "Properties",
      icon    : Icons.EDITOR_PROPERTIES
    }
  }
}

PropsEditor.STRUCT = STRUCT.inherit(PropsEditor, Editor) + `
  texturePath     : string;
  texturePathMode : int;
}
`;

Editor.register(PropsEditor);
nstructjs.manager.add_class(PropsEditor);

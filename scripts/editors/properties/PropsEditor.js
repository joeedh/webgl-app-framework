import {Area, BorderMask} from '../../path.ux/scripts/screen/ScreenArea.js';
import {Icons} from "../icon_enum.js";
import {MeshFlags} from '../../mesh/mesh_base.js';
import {NoteFrame, Note} from '../../path.ux/scripts/widgets/ui_noteframe.js';

import {Editor, VelPan} from '../editor_base.js';
import {nstructjs} from '../../path.ux/scripts/pathux.js';

import {
  DataPathError, saveFile, loadFile, saveUIData,
  loadUIData, ToolOp, BoolProperty, EnumProperty, StringProperty,
  FlagProperty, FloatProperty, IntProperty
} from '../../path.ux/scripts/pathux.js';
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
import {CDFlags} from '../../mesh/customdata.js';
import {loadUndoMesh, saveUndoMesh} from '../../mesh/mesh_ops_base.js';

export const TexturePathModes = {
  BRUSH : 0,
  EDITOR: 1
};

export class ChangeActCDLayerOp extends ToolOp {
  constructor() {
    super();
    this._undo = undefined;
  }

  static tooldef() {
    return {
      uiname  : "Change Active Layer",
      toolpath: "mesh.change_active_cdlayer",
      inputs  : {
        fullMeshUndo : new BoolProperty(false).private(),
        redrawAll    : new BoolProperty(false).private(),
        meshPath     : new StringProperty("mesh").private(),
        type         : new StringProperty().private(),
        elemType     : new EnumProperty(undefined, MeshTypes).private(),
        active       : new IntProperty(-1).private()
      }
    }
  }

  getMesh(ctx) {
    return ctx.api.getValue(ctx, this.inputs.meshPath.getValue());
  }

  calcUndoMem(ctx) {
    if (!this._undo) {
      return 0;
    }

    let tot = 0;

    if (this._undo.full) {
      tot += this._undo.data.dview.buffer.byteLength;
    } else {
      return 32; //guesstimate
    }

    return tot;
  }

  undoPre(ctx) {
    let undo = this._undo = {
      elemtype: this.inputs.elemType.getValue(),
      type    : this.inputs.type.getValue()
    };

    console.error("full:", this.inputs.fullMeshUndo.getValue());

    let mesh = this.getMesh(ctx);

    if (!mesh) {
      console.warn("Error in undoPre.ChangeActCDLayerOp");
      this._undo.mesh = this._undo.full = undefined;
      return;
    }

    undo.mesh = this.inputs.meshPath.getValue();

    let elemtype = this.inputs.elemType.getValue();
    let type = this.inputs.type.getValue();

    if (this.inputs.fullMeshUndo.getValue()) {
      undo.full = true;
      undo.data = saveUndoMesh(mesh);
    } else {
      let layerst = mesh.elists[elemtype].customData.getLayerSet(type, false);

      undo.full = false;
      undo.active = layerst.indexOf(layerst.active);
    }
  }

  undo(ctx) {
    let undo = this._undo;

    console.error("full:", undo.full);

    if (!undo.mesh) {
      return;
    }

    let mesh = ctx.api.getValue(ctx, undo.mesh);
    if (!mesh) {
      console.error("Error in ChangeActCDLayerOp.undo", undo);
      return;
    }

    if (undo.full) {
      let mesh2 = loadUndoMesh(ctx, undo.data);

      mesh.swapDataBlockContents(mesh2);
      mesh.regenElementsDraw();

      for (let v of mesh.verts) {
        v.flag |= MeshFlags.UPDATE;
      }
    } else {
      let layerst = mesh.elists[undo.elemtype].customData.getLayerSet(undo.type, false);

      let layer = layerst[undo.active];
      if (!layer) {
        console.error("Error in ChangeActCDLayerOp.undo", undo);
        return;
      }

      console.log("ACTIVE", layer.index, layerst.active.index);

      mesh.elists[undo.elemtype].customData.setActiveLayer(layer.index);

      if (this.inputs.redrawAll.getValue()) {
        for (let v of mesh.verts) {
          v.flag |= MeshFlags.UPDATE;
        }
      }
    }

    mesh.regenBVH();
    mesh.regenUVEditor();
    mesh.regenAll();

    //force immediate execution of dependency graph
    //so disp layers are properly handled
    mesh.graphUpdate();
    window.updateDataGraph(true);

    window.redraw_viewport(true);
  }

  exec(ctx) {
    let mesh = this.getMesh(ctx);
    let elemtype = this.inputs.elemType.getValue();
    let type = this.inputs.type.getValue();

    let cdata = mesh.elists[elemtype].customData;
    let layerset = cdata.getLayerSet(type, false);

    if (!layerset) {
      console.warn("No customdata layers of type", type, "exist");
      return;
    }

    let act = this.inputs.active.getValue();
    let layer = cdata.flatlist[act];

    if (!layer || layer.typeName !== layerset.typeName) {
      console.warn("Invalid layer; layer not of type '" + type + "'", act, layer);
      return;
    }

    cdata.setActiveLayer(layer.index);

    if (this.inputs.redrawAll.getValue()) {
      for (let v of mesh.verts) {
        v.flag |= MeshFlags.UPDATE;
      }
    }

    mesh.regenAll();
    mesh.regenBVH(); //not covered by regenAll
    mesh.regenUVEditor(); //not covered by regenAll

    mesh.graphUpdate();
    window.updateDataGraph(true); //force immediate execution of data graph
    window.redraw_viewport(true);
  }
}

ToolOp.register(ChangeActCDLayerOp);

export class CDLayerPanel extends ColumnFrame {
  constructor() {
    super();
    this._lastUpdateKey = undefined;

    this._saving = false;
    this._saved_uidata = undefined;
  }

  get showDisableIcons() {
    let s = this.getAttribute("show-disable-icons");

    if (!s) {
      return false;
    }

    s = s.toLowerCase();
    return s === "true" || s === "on" || s === "yes";
  }

  set showDisableIcons(state) {
    this.setAttribute("show-disable-icons", state ? "true" : "false");
  }

  get fullMeshUndo() {
    let s = this.getAttribute("full-mesh-undo");
    if (!s) {
      return false;
    }

    s = s.toLowerCase();
    return s === "yes" || s === "true" || s === "on";
  }

  set fullMeshUndo(val) {
    this.setAttribute("full-mesh-undo", val ? "true" : "false");
  }

  get redrawAll() {
    let s = this.getAttribute("redraw-all-undo");
    if (!s) {
      return false;
    }

    s = s.toLowerCase();
    return s === "yes" || s === "true" || s === "on";
  }

  set redrawAll(val) {
    this.setAttribute("redraw-all-undo", val ? "true" : "false");
  }

  static define() {
    return {
      tagname: "cd-layer-panel-x"
    }
  }

  init() {
    super.init();
    this.doOnce(this.rebuild);
  }

  saveData() {
    if (this._saving) {
      return super.saveData();
    }

    let ret = super.saveData();

    this._saving = true;
    ret.uidata = saveUIData(this, "cdlayerpanel")
    this._saving = false;

    return ret;
  }

  loadData(json) {
    super.loadJSON(json);

    this._saved_uidata = json.uidata;
  }

  rebuild() {
    if (!this.ctx) {
      this._lastUpdateKey = undefined;
      return;
    }

    let uidata;

    if (this._saved_uidata) {
      uidata = this._saved_uidata;
    } else {
      uidata = saveUIData(this, "cdlayerpanel");

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
    let checks2 = [];
    let show_disabled = this.showDisableIcons;

    for (let layer of elist.customData.flatlist) {
      if (layer.typeName === layertype) {
        let item = this.list.addItem(layer.name);

        let check = item.iconcheck(undefined, Icons.CIRCLE_SEL);
        check.checked = layer === actlayer;
        check.layerIndex = layer.index;

        checks.push(check);
        let this2 = this;

        check.onchange = function () {
          if (this.checked) {
            let tool = new ChangeActCDLayerOp();

            tool.inputs.elemType.setValue(type);
            tool.inputs.type.setValue(layertype);
            tool.inputs.fullMeshUndo.setValue(this2.fullMeshUndo);
            tool.inputs.redrawAll.setValue(this2.redrawAll);
            tool.inputs.active.setValue(this.layerIndex);

            //elist.customData.setActiveLayer(this.layerIndex);
            this.ctx.api.execTool(this.ctx, tool);

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

          if (check.ctx && check.ctx.mesh) {
            check.ctx.mesh.graphUpdate();
          }
          if (check.ctx && check.ctx.object) {
            check.ctx.object.graphUpdate();
          }
          window.redraw_viewport(true);
        }

        if (show_disabled) {
          check = item.iconcheck(undefined, Icons.DISABLED);
          check.layerIndex = layer.index;

          check.checked = !!(layer.flag & CDFlags.DISABLED);

          check.onchange = function () {
            let layer = this.layerIndex;
            layer = elist.customData.flatlist[layer];

            if (this.checked) {
              layer.flag |= CDFlags.DISABLED;
            } else {
              layer.flag &= ~CDFlags.DISABLED;
            }

            if (check.ctx && check.ctx.mesh) {
              check.ctx.mesh.graphUpdate();
            }
            if (check.ctx && check.ctx.object) {
              check.ctx.object.graphUpdate();
            }
            window.redraw_viewport(true);
          }
        }
      }
    }

    panel.useIcons(false);
    panel.tool(`mesh.add_cd_layer(elemType=${type} layerType="${layertype}")`);
    panel.tool(`mesh.remove_cd_layer(elemType=${type} layerType="${layertype}")`);

    this._saved_uidata = undefined;
    loadUIData(this, uidata);

    this.flushUpdate();
    this.flushSetCSS();
    this.flushUpdate();
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

    let layerset = elist.customData.getLayerSet(layertype);
    if (layerset && layerset.active) {
      key += layerset.active.index + "|";
    }

    for (let layer of elist.customData.flatlist) {
      if (layer.typeName === layertype) {
        key += layer.name + ":" + (layer.flag & CDFlags.DISABLED);
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
}

UIBase.register(CDLayerPanel);

export class ObjectPanel extends ColumnFrame {
  constructor() {
    super();

    this._last_update_key = "";
  }

  static define() {
    return {
      tagname: "scene-object-panel-x"
    }
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
      //[elem type, layer type, show-disable-icons, full-mesh-undo]
      ["VERTEX", "color", false, false, true],
      ["LOOP", "uv", false, false, true],
      ["VERTEX", "mask"],
      ["VERTEX", "displace", true, true],
      ["VERTEX", "paramvert"]
    ];

    let data = ob.data;
    if (data instanceof Mesh) {
      let panel = this.panel("Data Layers");

      for (let cdp of cdpanels) {
        let cd = UIBase.createElement("cd-layer-panel-x");

        if (cdp.length > 2 && cdp[2]) {
          cd.setAttribute("show-disable-icons", "true");
        } else {
          cd.setAttribute("show-disable-icons", "false");
        }

        if (cdp.length > 3 && cdp[3]) {
          cd.fullMeshUndo = true;
        } else {
          cd.fullMeshUndo = false;
        }

        if (cdp.length > 4 && cdp[4]) {
          cd.redrawAll = true;
        } else {
          cd.redrawAll = false;
        }

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

  static define() {
    return {
      tagname: "texture-panel-x"
    }
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
    let steps = Math.ceil(this.previewSize/csize);
    for (let i = 0; i < steps*steps; i++) {
      let x = i%steps, y = ~~(i/steps);

      let j = (x + y)%2;
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
}

UIBase.register(TexturePanel);

export class TextureSelectPanel extends TexturePanel {
  constructor() {
    super();

    this.browser = document.createElement("data-block-browser-x");
    this.browser.blockClass = ProceduralTex;
  }

  static define() {
    return {
      tagname: "texture-select-panel-x"
    }
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

  static defineAPI(api) {
    let st = super.defineAPI(api);

    st.string("texturePath", "texturePath", "Active Texture Path");
    st.struct("_texture", "texture", "Active Texture", api.mapStruct(ProceduralTex));
    st.enum("texturePathMode", "texturePathMode", TexturePathModes, "Source").uiNames({
      EDITOR: "Any",
      BRUSH : "Brush"
    });

    return st;
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
      "Bottom": [2, -1]
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
    panel.prop("view3d.render.sharpen");

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
}

PropsEditor.STRUCT = nstructjs.inherit(PropsEditor, Editor) + `
  texturePath     : string;
  texturePathMode : int;
}
`;

nstructjs.register(PropsEditor);
Editor.register(PropsEditor);

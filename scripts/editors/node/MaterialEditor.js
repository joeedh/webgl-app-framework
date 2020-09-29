import {NodeEditor} from "./NodeEditor.js";
import {Editor} from "../editor_base.js";
import '../../path.ux/scripts/util/struct.js';
let STRUCT = nstructjs.STRUCT;
import {KeyMap, HotKey} from '../../path.ux/scripts/util/simple_events.js';
import {UIBase, color2css, _getFont, css2color} from '../../path.ux/scripts/core/ui_base.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {MakeMaterialOp} from "../../core/material.js";

export class MaterialEditor extends NodeEditor {
  constructor() {
    super();

    this._last_update_key = undefined;
    this.dataBlockPath = "";

    this.activeMatMap = {};
  }

  init() {
    super.init();
    this.headerRow = this.header.row();

    if (this.helppicker) {
      this.helppicker.remove();
      this.helppicker = undefined;
    }

    this.doOnce(this.buildHeader);
  }

  updatePath() {
    let ob = this.ctx.object;

    if (!ob) {
      this.graphPath = this.dataBlockPath = "";
      return;
    }

    if (ob.data instanceof Mesh) {
      this.dataBlockPath = `library.mesh[${ob.data.lib_id}]`

      let mesh = ob.data;
    } else {
      this.dataBlockPath = `library.object[${ob.data.lib_id}].data`;
    }

    let block = this.ctx.api.getValue(this.ctx, this.dataBlockPath);

    if (!block) {
      this.graphPath = "";
      return;
    }

    if (block instanceof Mesh) {
      if (!(block.lib_id in this.activeMatMap)) {
        this.activeMatMap[block.lib_id] = 0;
      }

      this.activeMatMap[block.lib_id] = Math.min(this.activeMatMap[block.lib_id], block.materials.length);

      if (block.materials.length > 0) {
        let idx = this.activeMatMap[block.lib_id];
        this.graphPath = `${this.dataBlockPath}.materials[${idx}].graph`;
      } else {
        this.graphPath = "";
      }
    } else {
      this.graphPath = this.dataBlockPath + ".material.graph";
    }
  }

  buildHeader() {
    if (!this.ctx) {
      if (!this.isDead()) {
        this.doOnce(this.buildHeader);
      }

      return;
    }

    this.updatePath();

    let row = this.headerRow;

    row.clear();

    let col = row.col();
    let row1 = col.row();
    let row2 = col.row();

    let path = this.graphPath;
    let graph = path !== "" ? this.ctx.api.resolvePath(this.ctx, path) : undefined;

    let dblock = this.dataBlockPath === "" ? undefined : this.ctx.api.getValue(this.ctx, this.dataBlockPath);

    if (!graph && !dblock) {
      row1.label("Nothing here");
      return;
    }

    if (dblock instanceof Mesh) {
      this.headerMesh(dblock, row1, row2);
    } else {
      this.headerNonMesh(dblock, row1, row2);
    }
  }

  headerMesh(mesh, row1, row2) {
    if (mesh.materials.length === 0) {
      row1.button("Add Material", () => {
        let op = new MakeMaterialOp();

        this.ctx.toolstack.execTool(this.ctx, op);
        let mat = op.outputs.materialID.getValue();
        mat = this.ctx.datalib.get(mat);

        mesh.materials.push(mat);
        mat.lib_addUser(mesh);

        this.rebuild();
      });
    }

    let listbox = row2.listbox();
    listbox.overrideDefault("height", 75*UIBase.getDPI());

  }

  headerNonMesh(dblock, row1, row2) {

  }

  rebuild() {
    this.doOnce(this.buildHeader);
  }

  update() {
    let ob = this.ctx.object;

    let updateKey = ob.name;

    if (ob.data instanceof Mesh) {
      updateKey += ":ME:" + ob.data.name;
      for (let mat of ob.data.materials) {
        updateKey += ":" + mat.lib_id;
      }
    }

    if (updateKey !== this._last_update_key) {
      this._last_update_key = updateKey;

      this.rebuild();
    }

    super.update();
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    if (typeof this.activeMatMap === "string") {
      this.activeMatMap = JSON.parse(this.activeMatMap);
    }
  }

  static define() {return {
    tagname : "material-editor-x",
    areaname : "MaterialEditor",
    uiname   : "Shader Editor",
    icon     : -1
  }}
};

MaterialEditor.STRUCT = STRUCT.inherit(MaterialEditor, NodeEditor) + `
  velpan       : VelPan;
  graphPath    : string;
  activeMatMap : string | JSON.stringify(this.activeMatMap);
}
`;

Editor.register(MaterialEditor);
nstructjs.register(MaterialEditor);

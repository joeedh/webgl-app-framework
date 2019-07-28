import {Area} from '../../path.ux/scripts/ScreenArea.js';
import {Editor, VelPan} from '../editor_base.js';
import '../../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {DataPathError} from '../../path.ux/scripts/controller.js';
import {KeyMap, HotKey} from '../../path.ux/scripts/simple_events.js';
import {UIBase} from '../../path.ux/scripts/ui_base.js';
import {Container} from '../../path.ux/scripts/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {DataRef} from '../../core/lib_api.js';
import {ShaderNodeTypes, OutputNode, DiffuseNode} from '../../core/material.js';
import {AddNodeOp} from './node_ops.js';
import {DataPath} from "../../path.ux/scripts/simple_controller.js";
let projcos = util.cachering.fromConstructor(Vector2, 64);

export class NodeUI extends Container {
  constructor() {
    super();

    this.pos = new Vector2();
    this.size = new Vector2();

    this.graph_id = undefined;
    this.ned = undefined;
  }

  setCSS() {
    super.setCSS();

    let co = this.pos;
    let scale = this.size;
    let node;

    if (this.hasAttribute("datapath")) {
      let path = this.getAttribute("datapath");
      try {
        node = this.ctx.api.getValue(this.ctx, path);
      } catch (error) {
        if (error instanceof DataPathError) {
          console.log("error in ui wrapper node; path to real node was:", path);
          return;
        } else {
          throw error;
        }
      }

      co.load(node.graph_ui_pos);
      scale.load(node.graph_ui_size)//.mul(ned.velpan.scale);
    }

    let ned = this.ned;

    if (ned === undefined && this.parentNode !== undefined) {
      this.doOnce(this.setCSS);
      return;
    }

    co = new Vector2(co);
    scale = new Vector2(scale);

    ned.project(co, false);
    scale.mul(ned.velpan.scale);

    this.style["position"] = "absolute";
    this.style["width"] = (~~scale[0]) + "px";
    this.style["height"] = (~~scale[1]) + "px";

    console.log("scale", scale, co);

    this.background = this.getDefault("BoxSubBG");

    this.float(co[0], co[1]);
    console.log(this);
  }

  static define() {return {
    tagname : "nodeui-x"
  }}
}
UIBase.register(NodeUI);

export class NodeEditor extends Editor {
  constructor() {
    super();

    this.velpan = new VelPan();
    this.velpan.onchange = this._on_velpan_change.bind(this);

    this.defineKeyMap();

    this.graphPath = "material.graph";
    this._last_graphpath = this.graphPath;

    this.nodes = [];
    this.node_idmap = {};
  }

  _on_velpan_change() {
    if (this.ctx === undefined) {
      return;
    }

    console.log("velpan update 2!");

    for (let n of this.nodes) {
      n.ned = this;
      n.setCSS();
    }
  }

  switchGraph(graphpath=this.graphPath) {
    if (this.ctx === undefined) return;

    this.graphPath = graphpath;
    this._last_graphpath = this.graphPath;

    for (let n of this.nodes) {
      n.remove();
    }

    this.nodes.length = 0;
    this.node_idmap = {};

    let graph = this.ctx.api.getValue(this.ctx, this.graphPath);

    console.log("regenerating node editor");

    for (let node of graph.nodes) {
      let path = this.graphPath + ".nodes[" + node.graph_id + "]";

      let node2 = document.createElement("nodeui-x");

      node2.ned = this;
      node2.ctx = this.ctx;
      node2.setAttribute("datapath", path)

      this.nodes.push(node2);
      this.container.add(node2);
    }
  }

  get graph() {
    return this.ctx.api.getValue(this.ctx, this.graphPath);
    //return this.material.graph;
  }


  get material() {
    //return this.ctx.datalib.get(this.matref);
  }

  init() {
    super.init();

    this.last_mpos = new Vector2();

    let mmove = (e) => {
      this.last_mpos[0] = e.x;
      this.last_mpos[1] = e.y;
    };
    this.addEventListener("mousemove", mmove);

    let header = this.header;
    this.container.background = "orange";
    this.container.style["background-color"] = "orange";

    this.setCSS();
    //header.prop("NodeEditor.selectmode");
  }

  clearGraph() {
    for (let n of this.nodes) {
      n.remove();
    }

    this.nodes.length = 0;
    this.node_idmap = {};
  }

  update() {
    super.update();

    this.velpan.update();

    if (this.ctx === undefined) return;

    let graph;
    try {
      graph = this.ctx.api.getValue(this.ctx, this.graphPath);
    } catch (error) {
      if (error instanceof DataPathError) {
        console.warn("bad graph path for node editor:" + this.graphPath);
        graph = undefined;
      } else {
        throw error;
      }
    }

    if (graph === undefined) {
      this.clearGraph();
      return;
    }

    let regen = graph && graph.nodes.length !== this.nodes.length;
    regen = regen || this._last_graphpath !== this.graphPath;

    if (regen) {
      this.switchGraph();
    }
  }

  setCSS() {
    super.setCSS();

    if (!this.size || !this.pos) return;

    this.container.style["width"] = (~~this.size[0]) + "px";
    this.container.style["height"] = (~~this.size[1]) + "px";
  }

  on_resize(newsize) {
    super.on_resize(newsize);
    this.setCSS();
  }

  makeAddNodeMenu() {
    let menu = document.createElement("menu-x");
    menu.ctx = this.ctx;

    let cats = {};
    for (let cls of ShaderNodeTypes) {
      let def = cls.nodedef();

      let cat = def.category !== undefined ? def.category : "Misc";
      if (!(cat in cats)) {
        cats[cat] = [];
      }

      cats[cat].push(cls);
    }

    for (let k in cats) {
      let menu2 = document.createElement("menu-x");
      menu2.title = k;
      menu2.ctx = this.ctx;

      for (let cls of cats[k]) {
        console.log(cls);
        menu2.addItem(cls.nodedef().uiname, cls.name);
      }

      menu.addItem(menu2);
    }

    menu.style["position"] = "absolute";
    //this.ctx.screen.appendChild(menu);
    document.body.appendChild(menu);

    menu.start();
    menu.float(this.last_mpos[0], this.last_mpos[1]-25, 8);
    //menu.float(this.last_mpos[0], this.last_mpos[1]-25, 8);
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("A", ["SHIFT"], () => {
        console.log("Add Node!");
        this.makeAddNodeMenu();
      }),
      new HotKey("A", [],
        "node.add_node(graphPath=\"material.graph\" graphClass=\"shader\" nodeClass=\"DiffuseNode\")")
    ]);
  }

  getKeyMaps() {
    return [this.keymap];
  }

  getLocalMouse(x, y) {
    let rect = this.getClientRects()[0];
    if (rect === undefined) {
      return [0, 0];
    }

    let dpi = UIBase.getDPI();

    return new Vector2([x - rect.x, y - rect.y]);
  }

  project(co, useScreenSpace=false) {
    let p = projcos.next().load(co);
    p.multVecMatrix(this.velpan.mat);

    for (let i=0; i<2; i++) {
      co[i] = p[i];
    }

    if (useScreenSpace) {
      let r = this.getClientRects()[0];

      co[0] += r.x;
      co[1] += r.y;
    }
  }

  unproject(co, useScreenSpace=false) {
    let p = projcos.next().load(co);

    if (useScreenSpace) {
      let r = this.getClientRects()[0];

      p[0] -= r.x;
      p[1] -= r.y;
    }

    p.multVecMatrix(this.velpan.imat);

    for (let i=0; i<2; i++) {
      co[i] = p[i];
    }
  }

  copy() {
    let ret = document.createElement("node-editor-x");
    
    ret.camera = this.camera.copy();
    ret.selectmode = this.selectmode;
    ret.drawmode = this.drawmode;
    ret.velpan.load(this.velpan);
    ret.graphPath = this.graphPath;

    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);

    this.velpan.onchange = this._on_velpan_change.bind(this);
  }

  static define() {return {
    tagname : "node-editor-x",
    areaname : "NodeEditor",
    uiname   : "Node Editor",
    icon     : -1
  }}
};
NodeEditor.STRUCT = STRUCT.inherit(NodeEditor, Editor) + `
  velpan     : VelPan;
  graphPath  : string;
}
`
Editor.register(NodeEditor);
nstructjs.manager.add_class(NodeEditor);

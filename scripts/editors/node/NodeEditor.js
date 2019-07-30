import {Area} from '../../path.ux/scripts/ScreenArea.js';
import {Editor, VelPan} from '../editor_base.js';
import '../../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {DataPathError} from '../../path.ux/scripts/controller.js';
import {KeyMap, HotKey} from '../../path.ux/scripts/simple_events.js';
import {UIBase, color2css, _getFont, css2color} from '../../path.ux/scripts/ui_base.js';
import {Container, RowFrame, ColumnFrame} from '../../path.ux/scripts/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {DataRef} from '../../core/lib_api.js';
import {ShaderNodeTypes, OutputNode, DiffuseNode} from '../../shadernodes/shader_nodes.js';
import {AddNodeOp, ConnectNodeOp} from './node_ops.js';
import {DataPath} from "../../path.ux/scripts/simple_controller.js";
let projcos = util.cachering.fromConstructor(Vector2, 64);
import {VelPanZoomOp, VelPanPanOp} from '../velpan.js';
import {SelectOneOp, SelectOpBase} from './node_selectops.js';
import {SelOneToolModes} from "../view3d/selectmode.js";
import {NodeFlags, SocketFlags} from '../../core/graph.js';
import {Overdraw} from '../../path.ux/scripts/ScreenOverdraw.js';
import {haveModal} from '../../path.ux/scripts/simple_events.js';

export class NodeSocketElem extends RowFrame {
  constructor() {
    super();

    this.canvas = document.createElement("canvas");
    this.g = this.canvas.getContext("2d");

    this.size = 20;
    this.r = 5;
    this.type = undefined; //'input' or 'output'
    this.isHighlight = false;

    this._last_update_key = undefined;

    this.ned = undefined; //owning node editor

    //okay, it's going to be too slow to always fetch sockets from the data api
    //instead, cache direct references to them here
    //but make sure to keep up to date. . .
    this.socket = undefined;
    this.needDraw = true;

    //XXX hackish event stuff
    this.addEventListener("mousedown", (e) => {
      if (!haveModal()) {
        this.click(e);
      }
    });
    this.addEventListener("mousemove", (e) => {
      this.ned.push_ctx_active();
      this.ned.on_mousemove(e);
      this.ned.pop_ctx_active();
    });

    this.uinode = undefined;
    this.pos = new Vector2();
    this._abspos = new Vector2();

    this._last_dpi = this.getDPI();
  }

  click() {
    this.updateSocketRef();

    if (this.socket === undefined) {
      console.warn("socket ui error");
      return;
    }

    console.log("socket click!");

    let node = this.uinode.getNode();
    let sock = this.socket;

    let cmd = `node.connect(useNodeEditorGraph=1 node1_id=${node.graph_id}`;
    cmd += ` sock1_id=${sock.graph_id})`;

    this.ctx.api.execTool(this.ctx, cmd);
  }

  getAbsPos() {
    let p = this._abspos;

    p.load(this.pos).add(this.uinode.pos);

    /*
    let r = this.getClientRects()[0];
    if (r !== undefined) {
      p[0] = r.x;
      p[1] = r.y;

      this.ned.unproject(p, true);
    } else {
      p.load(this.pos).add(this.uinode.pos);
    }
    //*/

    //let velpan = this.ned.velpan;
    //let dpi = this.getDPI();

    if (this.type == "output") {
      this.ned.project(p);

      let r = this.getClientRects()[0];

      if (r !== undefined) {
        p[0] += r.width;

        let dpi = this.getDPI();

        p[0] -= this.size * 0.5;// / dpi;
      }
      this.ned.unproject(p);
    } else {
      p[0] += this.size;
    }

    p[1] += this.size;

    return p;
  }

  updateSocketRef() {
    try {
      this.socket = this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));
    } catch (error) {
      if (error instanceof DataPathError) {
        this.socket = undefined;
      } else {
        throw error;
      }
    }

    if (this.socket === undefined) {
      console.warn("Bad socket reference");
      //this.remove();
    }
  }

  init() {
    super.init();

    if (this.type == "input") {
      this.add(this.canvas);
    }

    if (this.socket !== undefined) {
      this.dataPrefix = this.getAttribute("datapath") + ".";

      let scale = this.ned.velpan.scale[1];

      this.overrideDefault("defaultHeight", 20);
      this.overrideDefault("defaultWidth", 70);
      //this.overrideDefault("DefaultTextSize", Math.ceil(21*scale+0.5));

      this.socket.buildUI(this);
    }
    if (this.type == "output") {
      this.add(this.canvas);
    }

    this.setCSS();

    this.updateSocketRef();
    this._redraw();
    
    this.background = "rgba(0,0,0,0)";
  }

  _redraw() {
    let g = this.g;
    let dpi = this.getDPI();
    let size = Math.ceil(this.size * dpi);

    this.canvas.width = size;
    this.canvas.height = size;

    g.beginPath();
    g.clearRect(0, 0, size, size);

    if (this.socket === undefined) {
      this.updateSocketRef();
    }

    if (this.socket === undefined) {
      console.warn("bad socket", this.getAttribute("datapath"));
      return;
    }
    let color = this.socket.constructor.nodedef().color;

    color = color === undefined ? "blue" : color;
    if (color instanceof Array) {
      color = color2css(color);
    }

    g.fillStyle = color;
    g.beginPath();

    let r = this.r*dpi;

    g.moveTo(size*0.5, size*0.5);
    g.arc(size*0.5, size*0.5, r, -Math.PI, Math.PI);
    g.fill();

    if (this.isHighlight) {
      g.fillStyle = "rgba(255, 255, 255, 0.5)";
      g.fill();
    }
  }

  updateDPI() {
    let dpi = this.getDPI();

    if (dpi !== this._last_dpi) {
      this._last_dpi = dpi;

      console.log("dpi update");

      this.setCSS();
      this._redraw();
    }
  }

  updatePos() {
    let r = this.getClientRects();
    let dpi = this.getDPI();

    if (r.length === 0) {
      console.warn("failed to update socket position");
      return;
    }

    r = r[0];

    let key = "" + r.width + ":" + this.type;
    if (key == this._last_update_key) {
      return;
    }

    this._last_update_key = key;

    if (this.type === "output") {
      //this.style["width"] = r.width + "px";
      let w = this.uinode.size[0];

      r.width /= this.ned.velpan.scale[0];

      this.pos[0] = w - r.width + 20/this.ned.velpan.scale[0];
      console.log("update socket lines");

      this.ned.doOnce(this.ned._recalcUI);
    }

    this.setCSS();
  }

  update() {
    super.update();

    this.updateDPI();
    //this.updatePos();

    //DO NOT CALL this.updateSocketRef! there will be far
    //too many sockets to regularly update the socket reference
    //in each update tick

    if (this.needDraw) {
      this.needDraw = false;
      this._redraw();
    }
  }

  setCSS() {
    super.setCSS();

    this.ul.style["margin"] = this.ul.style["padding"] = "0px";
    this.style["margin"] = this.style["padding"] = "0px";

    this.style["white-space"] = "nowrap";
    this.ul.style["white-space"] = "nowrap";

    if (this.ned === undefined) {
      console.warn("no node editor in setCSS()");
      return;
    }

    let ned = this.ned;

    let pos = new Vector2(this.pos);
    pos.add(this.uinode.pos);

    ned.project(pos, false);

    this.float(pos[0], pos[1]);

    let dpi = this.getDPI();

    this.canvas.style["width"] = this.size + "px";
    this.canvas.style["height"] = this.size + "px";

    //this.style["width"] = (this.size) + "px";
    this.style["height"] = (this.size) + "px";

    this._redraw();
    this.background = "rgba(0,0,0,0)";
  }

  static define() {return {
    tagname : "node-socket-elem-x"
  }}
}
UIBase.register(NodeSocketElem);

export class NodeUI extends Container {
  constructor() {
    super();

    this.pos = new Vector2();
    this.size = new Vector2();

    this.inputs = [];
    this.outputs = [];
    this.allsockets = [];

    this.graph_id = undefined;
    this.ned = undefined;
  }

  remove() {
    super.remove();

    for (let s of this.allsockets) {
      s.remove();
    }
  }

  init() {
    super.init();

    let node = this.getAttribute("datapath");

    try {
      node = this.ctx.api.getValue(this.ctx, node);
    } catch (error) {
      if (error instanceof DataPathError) {
        console.warn("Invalid node path " + node);
        return;
      } else {
        throw error;
      }
    }

    let uiname = node.uiname;
    if (uiname === undefined) {
      uiname = node.constructor.nodedef().uiname;
    }
    if (uiname === undefined) {
      uiname = node.constructor.name;
    }

    let title = this.label(uiname);
    title.font = "TitleText";

    //_getFont
    //title.style[]

    //let row = this.row();
    //row.style["width"] = node.graph_ui_size[0] + "px";

    let y = 35;

    for (let i=0; i<2; i++) {
      //let row2 = row.col();

      if (i == 1) {
      //  row2.style["padding-left"] = "50px";
      }

      let dpi = this.getDPI();

      let x = i ? 0 : -20/this.ned.velpan.scale[0];

      let socks = i ? node.outputs : node.inputs;
      let key = i ? "outputs" : "inputs";

      for (let k in socks) {
        let sock = socks[k];

        let uisock = document.createElement("node-socket-elem-x");

        uisock.parentWidget = this;
        uisock.type = i ? "output" : "input";

        uisock.pos[0] = x;
        uisock.pos[1] = y;

        uisock.ned = this.ned;
        uisock.ctx = this.ctx;
        uisock.socket = sock;
        uisock.uinode = this;
        uisock.setAttribute("datapath", this.getAttribute("datapath") + "."+key+"['" + k + "']");

        //row2.add(uisock);
        this.ned.shadow.appendChild(uisock);
        //this.appendChild(uisock);
        //this.ned.container.shadow.appendChild(uisock);
        //_appstate.screen.appendChild(uisock);

        uisock._init();
        uisock.update();
        uisock.setCSS();

        uisock.doOnce(uisock.updatePos);

        if (i) {
          this.outputs.push(uisock);
        } else {
          this.inputs.push(uisock);
        }

        this.allsockets.push(uisock);
        this.ned.sockets.push(uisock);

        y += ~~(uisock.size*1.45) + 2;
      }
    }

    let ui = document.createElement("container-x");
    ui.ctx = this.ctx;
    ui.dataPrefix = this.getAttribute("datapath") + ".";
    this.add(ui);

    if (node.buildUI) {

      node.buildUI(ui);
    }
    ui.style["position"] = "absolute";
    ui.style["top"] = ~~((y+10)*this.ned.velpan.scale[1]) + "px";
  }

  getNode() {
    return this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));
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
          console.warn("error in ui wrapper node; path to real node was:", path);
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

    for (let sock of this.allsockets) {
      sock.uinode = this;
      sock.setCSS();
    }

    co = new Vector2(co);
    scale = new Vector2(scale);

    ned.project(co, false);
    scale.mul(ned.velpan.scale);

    this.style["position"] = "absolute";
    this.style["width"] = (~~scale[0]) + "px";
    this.style["height"] = (~~scale[1]) + "px";

    this.background = this.getDefault("BoxSubBG");

    if (node.graph_flag & NodeFlags.SELECT) {
      this.style["border"] = "2px solid grey";
    } else {
      this.style["border"] = "none";
    }
    this.float(co[0], co[1]);
  }

  static define() {return {
    tagname : "nodeui-x"
  }}
}
UIBase.register(NodeUI);

export class NodeEditor extends Editor {
  constructor() {
    super();

    this._last_zoom = new Vector2();

    this._last_dpi = undefined;
    this._last_update_gen = undefined;

    this.velpan = new VelPan();
    this.velpan.onchange = this._on_velpan_change.bind(this);

    this.nodeContainer = document.createElement("container-x");
    this.nodeContainer.getDPI = () => {
      return this.getNodeDPI();
    };

    //this.nodeContainer.getZoom = () => {
      //return this.velpan.scale[0];
    //};

    this.shadow.appendChild(this.nodeContainer);
    this.nodeContainer.parentWidget = this;

    this.defineKeyMap();

    this.graphPath = "material.graph";
    this.graphClass = "shader";
    this._last_graphpath = this.graphPath;

    this.nodes = [];
    this.sockets = [];
    this.sockets.highlight = undefined;
    this.node_idmap = {};
  }

  _on_velpan_change() {
    if (this.ctx === undefined) {
      return;
    }

    //console.log("velpan update 2!");
    this._recalcUI();
  }

  getNodeDPI() {
    return this.getDPI();
  }

  rebuildAll() {
    return this.switchGraph();
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
    
    let graph;
    try {
      graph = this.ctx.api.getValue(this.ctx, this.graphPath);
    } catch (error) {
      if (error instanceof DataPathError) {
        if (DEBUG.verboseDataPath) {
          console.warn("Failed to fetch graph at ", this.graphPath);
        }

        return;
      } else {
        throw error;
      }
    }
    
    console.log("regenerating node editor");

    for (let node of graph.nodes) {
      let path = this.graphPath + ".nodes[" + node.graph_id + "]";

      let node2 = document.createElement("nodeui-x");

      node2.parentWidget = this.nodeContainer;
      node2.ned = this;
      node2.ctx = this.ctx;
      node2.setAttribute("datapath", path)

      this.nodes.push(node2);
      this.nodeContainer.add(node2);
    }

    this._recalcUI();
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

    //create svg overdraw element
    this.createOverdraw();

    this.last_mpos = new Vector2();

    let mmove = (e) => {
      this.on_mousemove(e);

      this.last_mpos[0] = e.x;
      this.last_mpos[1] = e.y;
    };

    let makehandler = (handler) => {
      return (e) => {
        this.push_ctx_active(this.ctx);
        try {
          return handler(e);
        } catch (error) {
          util.print_stack(error);
        }
        this.pop_ctx_active(this.ctx);
      }
    };

    this.on_mousedown = makehandler(this.on_mousedown.bind(this));

    this.addEventListener("mousemove", mmove);
    this.addEventListener("mousedown", this.on_mousedown);

    let header = this.header;
    this.container.background = "orange";
    this.container.style["background-color"] = "orange";

    this.setCSS();
    //header.prop("NodeEditor.selectmode");
  }

  getUISocket(sock) {
    for (let node of this.nodes) {
      for (let sock2 of node.allsockets) {

        //remember that we cache direct references to sockets
        //for performance reason
        if (sock2.socket === sock)
          return sock2;
      }
    }

    return undefined;
  }

  on_mousedown(e) {
    this.last_mpos[0] = e.pageX;
    this.last_mpos[1] = e.pageY;

    let p = new Vector2(this.last_mpos);
    this.unproject(p, true);
    let sock = this.findSocket(p[0], p[1]);

    if (sock !== undefined) {
      sock.click();
      return;
    }

    let elem = this.pickElement(e.pageX, e.pageY);
    //let graph = this.get
    if (elem === this || elem === this.container || elem === this.container.dom) {
      console.log("node editor mouse down", elem);

      let tool = new VelPanPanOp();

      let id = this.getID();
      tool.inputs.velpanPath.setValue(`screen.editors[${id}].velpan`);

      this.ctx.toolstack.execTool(tool);
    } else if (elem instanceof NodeUI) {
      let mode = SelOneToolModes.UNIQUE;
      let node = elem.getNode();

      if (e.shiftKey) {
        mode = node.graph_flag & NodeFlags.SELECT ? SelOneToolModes.SUB : SelOneToolModes.ADD;
      }

      let gp = this.graphPath;
      let gc = this.graphClass;

      let cmd = `node.selectone(graphPath='${gp}' graphClass='${gc}' mode=${mode}`;
      cmd += ` nodeId=${node.graph_id})`;

      console.log(cmd);

      this.ctx.api.execTool(this.ctx, cmd);
      if (mode === SelOneToolModes.UNIQUE) {
        for (let elem2 of this.nodes) {
          elem2.setCSS();
        }
      } else {
        elem.setCSS();
      }

      console.log("translate");
      this.ctx.api.execTool(this.ctx, "node.translate(useNodeEditorGraph=1)");
    }
  }

  on_resize(newsize) {
    super.on_resize(newsize);
    this.setCSS();

    try {
      //happens during file load, when init() hasn't been called yet
      if (this.overdraw === undefined) {
        this.doOnce(() => {
          //this.on_resize(newsize);
          this.rebuildAll();
        });
      } else {
        this.rebuildAll();
      }
    } catch (error) {
      util.print_stack(error);
    }
  }

  createOverdraw() {
    if (this.overdraw !== undefined) {
      this.overdraw.remove();
    }

    this.overdraw = document.createElement("overdraw-x");
    this.overdraw.start(this);
  }

  on_area_inactive() {
    this.overdraw.clear();
    this.overdraw.remove();
    this.overdraw = undefined;
  }

  on_area_active() {
    super.on_area_active();
    this.createOverdraw();

    this.setCSS();
    this._recalcUI();
  }

  onFileLoad(is_active) {
    if (!is_active) {
      return;
    }

    this.overdraw.clear();

    try {
      this._recalcUI();
    } catch (error) {
      util.print_stack(error);
    }
  }

  findSocket(localX, localY, limit=25) {
    limit *= this.getNodeDPI();

    let pos = new Vector2();
    let mpos = new Vector2([localX, localY]);
    let mindis = 1e17, minsock = undefined;

    for (let n of this.nodes) {
      for (let sock of n.allsockets) {
        let r = sock.getClientRects()[0];

        if (r === undefined) {
          continue;
        }
        pos[0] = r.x;
        pos[1] = r.y;

        if (sock.type == "output") {
          pos[0] += r.width;
        }

        this.unproject(pos, true);

        pos = sock.getAbsPos();
        let dis = mpos.vectorDistance(pos);

        if (dis < mindis && dis < limit) {
          mindis = dis;
          minsock = sock;
        }
      }
    }

    return minsock;
  }

  on_mousemove(e) {
    let mpos = new Vector2([e.x, e.y]);

    this.unproject(mpos, true);

    //console.log(this.findSocket(mpos[0], mpos[1]));
    let sock = this.findSocket(mpos[0], mpos[1]);

    if (sock !== this.sockets.highlight) {
      if (this.sockets.highlight !== undefined) {
        this.sockets.highlight.isHighlight = false;
        this.sockets.highlight._redraw();
      }

      this.sockets.highlight = sock;
      if (sock !== undefined) {
        sock.isHighlight = true;
        sock._redraw();
      }
    }
  }

  clearGraph() {
    for (let n of this.nodes) {
      n.remove();
    }

    this.nodes.length = 0;
    this.node_idmap = {};
  }

  updateDPI() {
    let dpi = this.getDPI();

    if (dpi !== this._last_dpi) {
      this._last_dpi = dpi;

      console.log("dpi update");
      this.rebuildAll();
    }
  }

  updateZoom() {
    if (this._last_zoom.vectorDistance(this.velpan.scale) > 0.0001) {
      this._last_zoom.load(this.velpan.scale);
      this.rebuildAll();
    }
  }

  update() {
    super.update();

    this.updateZoom();
    this.updateDPI();

    this.velpan.update();

    if (this.ctx === undefined) return;

    let graph = this.fetchGraph();
    if (graph === undefined) {
      this.clearGraph();
      return;
    }

    let regen = graph && graph.nodes.length !== this.nodes.length;
    regen = regen || this._last_graphpath !== this.graphPath;

    if (regen) {
      this.rebuildAll();
    } else if (this._last_update_gen !== graph.updateGen) {
      console.log("node editor got graph update signal");
      this._last_update_gen = graph.updateGen;
      this._recalcUI();
    }
  }

  fetchGraph() {
    let graph;

    try {
      graph = this.ctx.api.getValue(this.ctx, this.graphPath);
    } catch (error) {
      if (error instanceof DataPathError) {
        if (DEBUG.verboseDataPath)
          console.warn("bad graph path for node editor:" + this.graphPath);
        return undefined;
      } else {
        throw error;
      }
    }

    return graph;
  }

  setCSS() {
    super.setCSS();

    if (!this.size || !this.pos) return;

    this.container.style["width"] = (~~this.size[0]) + "px";
    this.container.style["height"] = (~~this.size[1]) + "px";
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

    menu.onselect = (id) => {
      console.log("node add menu select", id);

      let cmd = `node.add_node(useNodeEditorGraph=1 nodeClass='${id}'`;
      let p = new Vector2(this.last_mpos);

      this.unproject(p, true);
      cmd += ` x=${~~p[0]} y=${~~p[1]})`

      console.log(cmd);
      this.ctx.api.execTool(this.ctx, cmd);

      //"node.add_node(graphPath=\"material.graph\" graphClass=\"shader\" nodeClass=\"DiffuseNode\")")
    };

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
      new HotKey("=", [], () => {
        let tool = new VelPanZoomOp();

        //preempt modal mode
        tool.is_modal = false;
        let scale = 1.1;

        tool.inputs.velpanPath.setValue("nodeEditor.velpan");
        tool.inputs.scale.setValue([scale, scale, scale]);

        this.ctx.toolstack.execTool(tool);
        console.log("zoom in");
      }),
      new HotKey("-", [], () => {
        let tool = new VelPanZoomOp();

        //preempt modal mode
        tool.is_modal = false;
        let scale = 0.9;

        tool.inputs.velpanPath.setValue("nodeEditor.velpan");
        tool.inputs.scale.setValue([scale, scale, scale]);

        this.ctx.toolstack.execTool(tool);
        console.log("zoom out");
      }),
      new HotKey("A", [], `node.toggle_select_all(useNodeEditorGraph=1 mode='AUTO')`)
        //"node.add_node(graphPath=\"material.graph\" graphClass=\"shader\" nodeClass=\"DiffuseNode\")")
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

    let dpi = this.getDPI();
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

  _recalcUI() {
    for (let node of this.nodes) {
      node.setCSS();

      for (let sock of node.allsockets) {
        sock.updateSocketRef();
      }
    }

    this.overdraw.clear();

    for (let node of this.nodes) {
      for (let uisock of node.inputs) {
        //sock.updateSocketRef();
        let sock = uisock.socket;
        let p = uisock.getAbsPos();
        this.project(p);

        for (let sock2 of sock.edges) {
          let uisock2 = this.getUISocket(sock2);

          if (uisock2 === undefined) {
            console.warn("could not find uisocket for ", sock2);
            continue;
          }

          let p2 = uisock2.getAbsPos();
          this.project(p2);

          this.overdraw.line(p, p2, "orange");
        }
      }
    }
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

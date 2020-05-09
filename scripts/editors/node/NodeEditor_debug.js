import {NodeEditor} from "./NodeEditor.js";
import {layoutNode, sortGraphSpatially, calcGraphAABB} from '../../core/graph_spatial.js';
import {Editor} from "../editor_base.js";
import {nstructjs, util} from '../../path.ux/scripts/pathux.js';
import {VelPan} from "../editor_base.js";
import {Vector2} from "../../path.ux/scripts/pathux.js";
import {UIBase, color2css, css2color} from "../../path.ux/scripts/pathux.js";
import {DataBlock} from "../../core/lib_api.js";

export class NodeViewer extends Editor {
  constructor() {
    super();

    this.graphPath = "";
    this.graphClass = "";

    this._last_graph_path = undefined;

    this.velpan = new VelPan();
    this.velpan.pos[0] = 0;
    this.velpan.pos[1] = 0;
    this.velpan.onchange = this._on_velpan_change.bind(this);

    this.canvases = {};
    this.nodes = {};
    this.node_idmap = {};
    this.sockSize = 20;
    this.extraNodeWidth = 55;

    this.canvas = document.createElement("canvas");
    this.g = this.canvas.getContext("2d");

    this.shadow.appendChild(this.canvas);
  }

  init() {
    super.init();

    this.header.button("Arrange", () => {
      let graph = this.getGraph();

      console.log("Arranging graph", graph);
      if (graph) {
        sortGraphSpatially(graph, {socksize : this.sockSize, steps : 45, headerHeight : 75, extraWidth : this.extraNodeWidth});

        this.clear();
        this.rebuild();
        this.draw();
      }
    });

    this.addEventListener("wheel", (e) => {
      let df = Math.sign(e.deltaY)*0.15;

      console.log("wheel in node viewer!");

      this.velpan.scale.mulScalar(1.0 - df);
      this.draw();
    })
  }

  getGraph() {
    return this.ctx.api.getValue(this.ctx, this.graphPath);
  }

  getCanvas(id) {
    if (!(id in this.canvases)) {
      this.canvases[id] = document.createElement("canvas");
      this.canvases[id].g = this.canvases[id].getContext("2d");
    }

    return this.canvases[id];
  }

  hashNode(node) {
    let layout = layoutNode(node, {socksize: this.sockSize});
    let mask = (1<<19)-1;
    let mul = (1<<14)-1;
    let hash = node.graph_id;

    function dohash(n) {
      let f = ((n + mask) * mul) & mask;
      hash = hash ^ f;
    }

    let scale = this.velpan.scale;

    dohash(layout.size[0]*scale[0]);
    dohash(layout.size[1]*scale[1]);

    for (let i=0; i<2; i++) {
      let socks = i ? layout.outputs : layout.inputs;
      let j = 0;

      for (let k in socks) {
        let sock = socks[k];

        dohash(sock[0]*scale[0]);
        dohash(sock[1]*scale[1]);
        dohash(j++);
      }
    }

    return hash + ":" + node.graph_id;
  }

  _on_velpan_change() {
    this.rebuild();
  }

  clear() {
    this.canvases = {};
    this.nodes = {};
    this.node_idmap = {};
  }

  buildNode(node) {
    let scale = this.velpan.scale;
    let layout = layoutNode(node, {socksize: this.sockSize, extraWidth : this.extraNodeWidth});
    let hash = this.hashNode(node);

    layout.size = new Vector2(layout.size);

    layout.size.mulScalar(scale[0]);
    layout.size.floor();

    for (let i=0; i<2; i++) {
      let lsocks = i ? layout.outputs : layout.inputs;
      let socks = i ? node.outputs : node.inputs;

      for (let k in lsocks) {
        let sock = socks[k];
        let lsock = lsocks[k];

        lsock = new Vector2(lsock);

        let color = sock.constructor.nodedef().color;
        if (color) {
          color = color2css(color);
        } else {
          color = "orange";
        }

        lsock.color = color;
        lsocks[k] = lsock;
      }
    }

    layout.canvas = this.getCanvas(hash);

    let canvas = layout.canvas;
    let g = canvas.g;

    let ts = this.getDefault("DefaultText").size*1.45;

    let header = layout.header =  ts*this.velpan.scale[0]*1.3*2.5;

    layout.size[1] += Math.ceil(header);

    canvas.width = layout.size[0];
    canvas.height = layout.size[1];

    g.font = this.getDefault("DefaultText").genCSS(ts*this.velpan.scale[0]);

    g.clearRect(0, 0, canvas.width, canvas.height);
    g.beginPath();
    g.rect(0, 0, canvas.width, canvas.height);
    g.lineWidth = 2;

    g.fillStyle = "grey";
    g.strokeStyle = "black";
    g.fill();
    g.stroke();

    g.fillStyle = "white";

    let name = node.graphDisplayName();

    g.fillText(name, 1, ts*this.velpan.scale[0]*1.3);
    g.fillText("("+node.constructor.name+")", 45*this.velpan.scale[0], ts*this.velpan.scale[0]*1.3*1.7);

    layout.graph_id = node.graph_id;
    this.nodes[hash] = layout;
    this.node_idmap[node.graph_id] = layout;

    for (let i=0; i<2; i++) {
      let y = 0.0;

      let socks = i ? layout.outputs : layout.inputs;
      for (let k in socks) {
        let sock = socks[k];

        sock[1] += header/this.velpan.scale[0];

        let w = g.measureText(k).width;

        let x = i ? layout.size[0] - w : 0;
        let y = sock[1] * this.velpan.scale[0];

        g.fillText(k, x, y);
      }
    }

    return layout;
  }

  draw() {
    let canvas = this.canvas;
    let g = this.g;

    g.clearRect(0, 0, canvas.width, canvas.height);
    g.font = this.getDefault("DefaultText").genCSS();
    g.strokeStyle = "black";

    let transform = (p) => {
      p[0] -= canvas.width*0.5;
      p[1] -= canvas.height*0.5;
      p.multVecMatrix(this.velpan.mat);
      p[0] += canvas.width*0.5;
      p[1] += canvas.height*0.5;
    };

    let p = new Vector2(), p2 = new Vector2(), p3 = new Vector2(), p4 = new Vector2();
    let s = new Vector2();

    function find_sock_key(node, sock) {
      for (let k in node.inputs) {
        if (node.inputs[k] === sock) {
          return k;
        }
      }
    }

    g.beginPath();
    let sz = this.sockSize;

    let graph = this.getGraph();

    for (let k1 in this.nodes) {
      let node = this.nodes[k1];

      p.load(node.pos);
      let node2 = graph.node_idmap[node.graph_id];

      for (let k in node2.inputs) {
        let sock = node2.inputs[k];

        for (let sock2 of sock.edges) {
          let node3 = this.node_idmap[sock2.node.graph_id];
          sock2 = find_sock_key(sock2);
          node3 = this.node_idmap[node3.graph_id];

          let lsock1 = node.inputs[k];
          let lsock2 = node3.outputs[k];

          p2.load(node.pos).add(lsock1);
          p3.load(node3.pos).add(lsock2);

          transform(p2);
          transform(p3);

          g.moveTo(p2[0], p2[1]);
          g.lineTo(p3[0], p3[1]);
        }
      }
    }

    g.strokeStyle = "white";
    g.stroke();

    for (let k2 in this.nodes) {
      let node = this.nodes[k2];

      p.load(node.pos);

      for (let i=0; i<2; i++) {
        let socks = i ? node.outputs : node.inputs;

        for (let k in socks) {
          let sock = socks[k];

          p2.load(sock);
          p2.add(p);
          transform(p2);

          g.beginPath();
          g.fillStyle = sock.color;

          g.moveTo(p2[0], p2[1]);
          g.arc(p2[0], p2[1], sz*0.35, -Math.PI, Math.PI);

          g.fill();
        }
      }
    }

    g.fill();


    g.fillStyle = "grey";
    g.beginPath();
    for (let k in this.nodes) {
      let node = this.nodes[k];

      p.load(node.pos);
      s.load(node.size);

      transform(p);
      //g.rect(p[0], p[1], node.size[0], node.size[1]);
      g.drawImage(node.canvas, p[0], p[1]);
    }

    g.fill();
    g.stroke();
  }

  rebuild() {
    if (!this.ctx) {
      return;
    }

    this._last_graph_path = this.graphPath;
    console.log("rebuilding node editor");

    let canvas = this.canvas;
    let g = this.g;
    let size = this.size;
    let dpi = UIBase.getDPI();

    let w = ~~(size[0]*dpi);
    let h = ~~(size[1]*dpi);

    canvas.width = w;
    canvas.height = h;
    canvas.style["width"] = size[0] + "px";
    canvas.style["height"] = size[1] + "px";

    let graph = this.ctx.api.getValue(this.ctx, this.graphPath);
    if (this.graphPath === "" || graph === undefined) {
      console.warn("Failed to load graph!");
      this._last_graph_path = undefined;
      return;
    }

    let visit = new util.set();

    for (let node of graph.nodes) {
      let hash = this.hashNode(node);
      visit.add(hash);

      if (!(hash in this.nodes)) {
        this.buildNode(node);
      }
    }

    let del = [];
    for (let k in this.canvases) {
      if (!visit.has(k)) {
        del.push(k);
      }
    }

    for (let k of del) {
      delete this.canvases[k];
      delete this.nodes[k];
    }

    this.draw();
  }

  on_resize() {
    this.rebuild();
  }

  update() {
    if (this._last_graph_path !== this.graphPath) {
      this.clear();
      this.rebuild();
    }

    this.velpan.update();
  }

  static define() {return {
    tagname : "nodegraph-viewer-x",
    areaname : "nodegraph_viewer",
    uiname  : "Graph Viewer"
  }}
}

NodeViewer.STRUCT = nstructjs.inherit(NodeViewer, Editor) + `
  graphPath  : string;
  graphClass : string;
  velpan     : VelPan;
}`;

Editor.register(NodeViewer);
nstructjs.register(NodeViewer);

export function showDebugNodePanel(screen) {
  let editor = screen._debug_node_editor;

  if (!editor) {
    for (let sarea of screen.sareas) {
      if (sarea.area && sarea.area instanceof NodeViewer) {
        screen._debug_node_editor = editor = sarea;
        break;
      }
    }
  }

  if (editor) {
    editor.hidden = false;
    screen.regenBorders();
    return;
  }

  editor = screen.popupArea(NodeViewer);
  screen._debug_node_editor = editor;

  editor.area.velpan.scale.mulScalar(0.5);

  editor.area.graphPath = "graph";
  editor.area.graphClass = undefined;

  //sortGraphSpatially(screen.ctx.graph, {socksize : editor.area.sockSize, steps : 15});

  let remove = editor.remove;
  editor.remove = () => {
    screen._debug_node_editor = undefined;
    remove.apply(this, arguments);
  }
}

export function hideDebugNodePanel(screen) {
  let editor = screen._debug_node_editor;
  console.log("editor", editor);

  if (editor) {
    editor.hidden = true;
    screen.regenBorders();
  }
}

export function toggleDebugNodePanel(screen) {
  let editor = screen._debug_node_editor;
  console.log("editor", editor);

  if (!editor || editor.hidden) {
    showDebugNodePanel(screen);
  } else {
    hideDebugNodePanel(screen);
  }
}

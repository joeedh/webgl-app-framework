import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../../core/simplemesh.js';
import {IntProperty, BoolProperty, FloatProperty, EnumProperty,
        FlagProperty, ToolProperty, Vec3Property,
        PropFlags, PropTypes, PropSubTypes} from '../../path.ux/scripts/toolprop.js';
import {ToolOp, ToolFlags, UndoFlags} from '../../path.ux/scripts/simple_toolsys.js';
import {WidgetShapes} from './widget_shapes.js';
import {Shaders} from './view3d_shaders.js';
import {dist_to_line_2d} from '../../path.ux/scripts/math.js';
import {CallbackNode, NodeFlags} from "../../core/graph.js";
import {DependSocket} from '../../core/graphsockets.js';
import {css2color} from '../../path.ux/scripts/ui_base.js';
import * as util from '../../util/util.js';

export const WidgetFlags = {
  SELECT    : 1,
  //HIDE      : 2,
  HIGHLIGHT : 4,
  CAN_SELECT : 8
};

export let WidgetTools = [];

export class WidgetTool {
  constructor(manager) {
    this.manager = manager;
    this.view3d = manager.view3d;
    this.ctx = this.view3d.ctx;

    let def = this.constructor.define();

    this.destroyed = false;
    this.name = def.name;
    this.uiname = def.uiname;
    this.icon = def.icon !== undefined ? def.icon : -1;
    this.description = def.description !== undefined ? def.description : "";

    this.widgets = [];
  }

  getArrow(matrix, color) {
    let ret = this.manager.arrow(matrix, color);
    this.widgets.push(ret);
    return ret;
  }

  getChevron(matrix, color) {
    let ret = this.manager.chevron(matrix, color);
    this.widgets.push(ret);
    return ret;
  }

  /**
   * executes a (usually modal) tool, adding (and removing)
   * draw callbacks to execute this.update() as appropriate
   * */
  execTool(tool) {
    let view3d = this.view3d;

    if (this._widget_tempnode === undefined) {
      let n = this._widget_tempnode = this.manager.createCallbackNode(0, "widget redraw", () => {
        this.update();
        console.log("widget recalc update 1");
      }, {trigger: new DependSocket("trigger")}, {});

      this.ctx.graph.add(n);
      n.inputs.trigger.connect(view3d._graphnode.outputs.onDrawPre);
    }

    this.ctx.toolstack.execTool(tool);

    if (tool._promise !== undefined) {
      tool._promise.then((ctx, was_cancelled) => {
        console.log("tool was finished", this, this._widget_tempnode, ".");

        if (this._widget_tempnode !== undefined) {
          //this.ctx.graph.remove(this._widget_tempnode);
          this.manager.removeCallbackNode(this._widget_tempnode);
          this._widget_tempnode = undefined;
        }
      })
    }
  }

  getPlane(matrix, color) {
    let ret = this.manager.plane(matrix, color);
    this.widgets.push(ret);
    return ret;
  }

  getBlockArrow(matrix, color) {
    let ret = this.manager.blockarrow(matrix, color);
    this.widgets.push(ret);
    return ret;
  }

  static define() {return {
    name        : "name",
    uiname      : "uiname",
    icon        : -1,
    flag        : 0,
    description : ""
  }}

  static register(cls) {
    WidgetTools.push(cls);
  }

  static getToolEnum() {
    let enumdef = {};
    let icondef = {};
    let uinames = {};
    let i = 0;

    for (let cls of WidgetTools) {
      let def = cls.define();

      enumdef[def.name] = i;
      icondef[def.name] = def.icon;
      uinames[def.name] = def.uiname;

      i += 1;
    }

    let prop = new EnumProperty(undefined, enumdef, undefined, "Tools", "Tool Widgets");
    prop.ui_value_names = uinames;
    prop.addIcons(icondef);

    return prop;
  }

  static validate(ctx) {

  }

  create(ctx, manager) {
    this.ctx = ctx;
    this.manager = manager;
  }

  update(ctx) {

  }

  destroy(gl) {
    if (this.destroyed) {
      return;
    }

    for (let w of this.widgets) {
      this.manager.remove(w);
    }

    this.widgets.length = 0;
    this.manager.clearNodes();
  }
};

export class WidgetShape {
  constructor(view3d) {
    this.pos = new Vector3();
    this.rot = new Vector3();
    this.scale = new Vector3();
    this._drawtemp = new Vector3();

    this.destroyed = false;
    this.flag = WidgetFlags.CAN_SELECT;
    this.owner = undefined;

    this.color = new Vector4([0.1, 0.5, 1.0, 1.0]);
    this.hcolor = new Vector4([0.7, 0.7, 0.7, 0.5]); //highlight color

    this.matrix = new Matrix4();
    this.localMatrix = new Matrix4(); //we need a seperate local matrix for zoom correction to work

    //internal final draw matrix
    this.drawmatrix = new Matrix4();
    this._tempmat = new Matrix4();
    this._tempmat2 = new Matrix4();

    this.mesh = new SimpleMesh(LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV);

    this.onclick = () => {
      console.log("widget click!");
    }
  }

  destroy(gl) {
    if (this.destroyed) {
      return;
    }

    this.mesh.destroy(gl);
    this.mesh = undefined;
    this.destroyed = true;
  }

  distToMouse(view3d, x, y) {
    throw new Error("implement me");
  }

  copy() {
    let ret = new this.constructor();
    this.copyTo(ret);
    return ret;
  }

  copyTo(b) {
    b.flag = this.flag;
    b.owner = this.owner;
    b.matrix.load(this.matrix);
    b.loc.load(this.loc);
    b.rot.load(this.rot);
    b.scale.load(this.scale);
    b.mesh = this.mesh;

    return b;
  }

  draw(gl, manager, matrix, localMatrix) {
    if (this.mesh === undefined) {
      console.warn("missing mesh in WidgetShape.prototype.draw()");
      return;
    }

    this.mesh.program = Shaders.WidgetMeshShader;

    this.mesh.uniforms.color = this.color;

    let mat = this.drawmatrix;
    mat.load(this.matrix).multiply(matrix);

    let co = this._drawtemp;
    co.zero();
    co.multVecMatrix(mat);
    let w = co.multVecMatrix(manager.view3d.camera.rendermat);

    let smat = this._tempmat;
    smat.makeIdentity();

    mat.load(this.matrix);

    let scale = Math.max(w*0.05, 0.1);

    let local = this._tempmat2.load(this.localMatrix);
    if (localMatrix !== undefined) {
      local.multiply(localMatrix);
    }

    smat.scale(scale, scale, scale);

    mat.multiply(matrix);
    mat.multiply(smat);
    mat.multiply(local);

    this.mesh.uniforms.polygonOffset = 0.0;
    this.mesh.uniforms.projectionMatrix = manager.view3d.camera.rendermat;
    this.mesh.uniforms.objectMatrix = mat;

    gl.enable(gl.BLEND);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendEquation(gl.FUNC_ADD);

    this.mesh.draw(gl);


    if (this.flag & WidgetFlags.HIGHLIGHT) {
      gl.enable(gl.BLEND);

      this.mesh.draw(gl, {
        polygonOffset : 0.1,
        color         : this.hcolor
      });
    }

    gl.disable(gl.BLEND);
  }
}

export class WidgetArrow extends WidgetShape {
  constructor(manager) {
    super();

    this.shapeid = "ARROW";
  }

  draw(gl, manager, matrix, localMatrix) {
    this.mesh = manager.shapes[this.shapeid];

    super.draw(gl, manager, matrix, localMatrix);
  }

  distToMouse(view3d, x, y) {
    //measure scale
    let scale1 = new Vector3();
    let scale2 = new Vector3();

    scale2[0] = scale2[1] = scale2[2] = 1.0;
    scale2.multVecMatrix(this.drawmatrix);
    scale1.multVecMatrix(this.drawmatrix);

    let scale = scale2.vectorDistance(scale1);

    let v1 = new Vector3([0,0,-scale*0.5]);
    let v2 = new Vector3([0,0,scale*0.5]);

    v1.multVecMatrix(this.drawmatrix);
    v2.multVecMatrix(this.drawmatrix);

    view3d.project(v1);
    view3d.project(v2);

    let dis = dist_to_line_2d(new Vector2([x, y]), v1, v2, true);

    return dis;
  }
}

export class WidgetBlockArrow extends WidgetArrow {
  constructor() {
    super();
    this.shapeid = "BLOCKARROW";
  }
}

export class WidgetPlane extends WidgetShape {
  constructor(manager) {
    super();

    this.shapeid = "PLANE";
  }

  draw(gl, manager, matrix, localMatrix) {
    this.mesh = manager.shapes[this.shapeid];

    super.draw(gl, manager, matrix, localMatrix);
  }

  distToMouse(view3d, x, y) {
    //measure scale
    let scale1 = new Vector3();
    let scale2 = new Vector3();
    let scale3 = new Vector3();

    scale2[0] = 1.0;
    scale3[2] = 1.0;

    scale1.multVecMatrix(this.drawmatrix);
    scale2.multVecMatrix(this.drawmatrix);
    scale3.multVecMatrix(this.drawmatrix);

    let scalex = scale2.vectorDistance(scale1);
    let scalez = scale3.vectorDistance(scale1);

    let v1 = new Vector3([0,0,0]);

    v1.multVecMatrix(this.drawmatrix);
    view3d.project(v1);

    let dx = Math.abs(x-v1[0])*scalex, dy = Math.abs(y-v1[1])*scalez;

    let dis = Math.max(Math.abs(dx), Math.abs(dy));
    //console.log(dx, dy, dis, scalex, scalez);

    return dis;
  }
}

export class WidgetChevron extends WidgetPlane {
  constructor() {
    super();

    this.shapeid = "CHEVRON";
  }
}

export class WidgetBase {
  constructor() {
    this.flag = 0;
    this.id = -1;
    this.children = [];
    this.destroyed = false;
    this.shape = undefined;
    this.manager = undefined; //is set by WidgetManager
    this.matrix = new Matrix4();
    this.localMatrix = new Matrix4(); //we need a seperate local matrix for zoom correction to work
    this._tempmatrix = new Matrix4();
  }

  setMatrix(mat) {
    this.matrix.load(mat);
    return this;
  }

  static wigetDefine() {return {
    uiName   : "name",
    typeName : "typeName",
    selMask  : undefined,
    icon     : -1
  }}

  //can this widget run?
  static ctxValid(ctx) {
    return ctx.view3d.selectmode & this.constructor.widgetDefine().selMask;
  }

  get isDead() {
    //throw new Error("implement me");
    return false;
  }

  destroy(gl) {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    for (let c of this.children) {
      c.destroy(gl);
    }
  }
  /**note that it's valid for containers
   * to return themselves, *if* they have
   * a shape and aren't purely containers
   * @param x view3d-local coordinate x
   * @param y view3d-local coordinate y
   */
  findNearest(view3d, x, y, limit=8) {
    let mindis, minret;

    if (this.shape !== undefined) {
      let dis = this.shape.distToMouse(view3d, x, y);
      
      mindis = dis;
      minret = this;
    }

    for (let child of this.children) {
      let dis = child.findNearest(view3d, x, y, limit);
      if (mindis === undefined || dis < mindis) {
        mindis = dis;
        minret = child;
      }
    }

    if (mindis !== undefined && mindis > limit) {
      return undefined;
    }

    return {
      data : minret,
      dis  : mindis
    };
  }

  update(manager) {
    if (this.isDead) {
      this.remove();
    }
  }

  remove() {
    if (this.manager === undefined) {
      console.warn("widget not part of a graph", this.manager);
    }
    this.manager.remove(this);
  }

  on_mousedown(localX, localY) {
  }

  on_mousemove(localX, localY) {
  }

  on_mouseup(localX, localY) {
  }

  on_keydown(localX, localY) {

  }

  draw(gl, manager, matrix=undefined) {
    let mat = this._tempmatrix;

    mat.makeIdentity();
    mat.load(this.matrix);

    if (matrix !== undefined) {
      mat.multiply(matrix);
    }

    for (let w of this.children) {
      w.draw(gl, manager, mat);
    }

    if (this.shape === undefined) {
      return;
    }

    if (this.flag & WidgetFlags.HIGHLIGHT) {
      this.shape.flag |= WidgetFlags.HIGHLIGHT;
    } else {
      this.shape.flag &= ~WidgetFlags.HIGHLIGHT;
    }

    this.shape.draw(gl, manager, mat, this.localMatrix);
  }
}

export class WidgetManager {
  constructor(view3d) {
    this.view3d = view3d;
    this.widgets = [];
    this.widget_idmap = {};
    this.shapes = {};
    this.idgen = new util.IDGen();

    //execution graph nodes
    this.nodes = {};
    this.widgets.active = undefined;
    this.widgets.highlight = undefined;

    //let test = new WidgetBase();
    //test.shape = new WidgetArrow(this);
    //this.test = test;

    //this.add(test);

    this.ready = false;
  }

  haveCallbackNode(id, name) {
    let key = id + ":" + name;
    return key in this.nodes;
  }

  clearNodes() {
    let graph = this.view3d.ctx.graph;

    for (let k in this.nodes) {
      let n = this.nodes[k];

      if (n.graph !== graph) {
        console.log("prune zombie node");
        delete this.nodes[k];
        continue;
      }

      delete this.nodes[k];

      if (n.graph_id != -1) {
        graph.remove(n);
      }
    }

    //this.nodes = {}:
  }

  removeCallbackNode(n) {
    let key = n._key;

    if (this.nodes[key]) {
      this.view3d.ctx.graph.remove(this.nodes[key]);
    }
  }
  createCallbackNode(id, name, callback, inputs, outputs) {
    let key = id + ":" + name;

    if (this.nodes[key]) {
      this.view3d.ctx.graph.remove(this.nodes[key]);
    }

    this.nodes[key] = CallbackNode.create(key, callback, inputs, outputs);
    this.nodes[key]._key = key;

    return this.nodes[key];
  }

  loadShapes() {
    for (let k in WidgetShapes) {
      let mesh = WidgetShapes[k].copy();
      let smesh = mesh.genRender();

      this.shapes[k] = smesh;
    }

    this.ready = true;
  }

  /**see view3d.getSubEditorMpos for how localX/localY are derived*/
  on_mousedown(localX, localY, was_touch) {
    console.log("was touch:", was_touch);

    let limit = was_touch ? 35 : 8;
    let w = this.findNearest(localX, localY, limit);
    console.log("w", w);

    if (w !== undefined) {
      w.on_mousedown(localX, localY);
      return true;
    }
  }

  findNearest(x, y, limit=8) {
    let mindis = 1e17;
    let minw = undefined;

    for (let w of this.widgets) {
      let ret = w.findNearest(this.view3d, x, y, limit);

      if (ret === undefined) {
        continue;
      }

      let dis = ret.dis;

      if ((minw === undefined || dis < mindis) && dis < limit) {
        mindis = dis;
        minw = ret.data;
      }
    }
      
    return minw;
  }

  on_mousemove(localX, localY) {
    let w = this.findNearest(localX, localY);
    
    //console.log(w);

    if (this.widgets.highlight !== w) {
      if (this.widgets.highlight !== undefined) {
        this.widgets.highlight.flag &= ~WidgetFlags.HIGHLIGHT;
      }

      this.widgets.highlight = w;
      if (w !== undefined) {
        w.flag |= WidgetFlags.HIGHLIGHT;
      }

      window.redraw_viewport();
    }

    if (w !== undefined) {
      return true;
    }
  }
  
  on_mouseup(localX, localY) {
    
  }

  add(widget) {
    if (widget === undefined || !(widget instanceof WidgetBase)) {
      console.warn("invalid widget type for ", widget);
      throw new Error("invalid widget type for " + widget);
    }

    if (widget.id !== -1) {
      console.warn("Warning, tried to add same widget twice");
      return undefined;
    }

    widget.id = this.idgen.next();
    widget.manager = this;

    this.widget_idmap[widget.id] = widget;
    this.widgets.push(widget);

    return widget;
  }

  remove(widget) {
    if (!(widget.id in this.widget_idmap)) {
      console.warn("widget not in graph", widget.id, widget);
      return;
    }

    if (this.view3d !== undefined && this.view3d.gl !== undefined) {
      widget.destroy(this.view3d.gl);
    }

    widget.manager = undefined;

    this.widgets.remove(widget);
    widget.id = -1;
  }

  destroy(gl) {
    if (this.view3d !== undefined) {
      this.clearNodes();
    } else {
      //XXX ok just nuke all references in this.nodes
      this.nodes = {};
    }

    for (let k in this.shapes) {
      let shape = this.shapes[k];
      shape.destroy(gl);
    }
  }

  draw(gl, view3d) {
    this.view3d = view3d;
    this.gl = gl;

    for (let widget of this.widgets) {
      widget.draw(gl, this);
    }
  }

  updateWidgets() {

  }

  _newbase(matrix, color, shape) {
    let ret = new WidgetBase();

    ret.shape = shape;

    if (typeof color == "string") {
      color = css2color(color);
    }

    if (color !== undefined) {
      ret.shape.color.load(color);

      if (color.length < 4)
        ret.shape.color[3] = 1.0;
    }

    if (matrix !== undefined) {
      ret.matrix.load(matrix);
    }

    return ret;
  }

  arrow(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetArrow(this)));
  }

  chevron(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetChevron(this)));
  }

  plane(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetPlane(this)));
  }

  blockarrow(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetBlockArrow(this)));
  }

  update(view3d) {
    this.view3d = view3d;

    for (let widget of this.widgets) {
      widget.update(this);
    }
  }
}

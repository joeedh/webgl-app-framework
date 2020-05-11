import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../../core/simplemesh.js';
import {IntProperty, BoolProperty, FloatProperty, EnumProperty,
        FlagProperty, ToolProperty, Vec3Property,
        PropFlags, PropTypes, PropSubTypes} from '../../path.ux/scripts/toolsys/toolprop.js';
import {ToolOp, ToolFlags, UndoFlags} from '../../path.ux/scripts/toolsys/simple_toolsys.js';
import {Shapes} from '../../core/simplemesh_shapes.js';
import {Shaders} from './view3d_shaders.js';
import {dist_to_line_2d} from '../../path.ux/scripts/util/math.js';
import {IsMobile} from '../../path.ux/scripts/core/ui_base.js'
import {CallbackNode, NodeFlags} from "../../core/graph.js";
import {DependSocket} from '../../core/graphsockets.js';
import {css2color} from '../../path.ux/scripts/core/ui_base.js';
import * as util from '../../util/util.js';
import * as math from '../../path.ux/scripts/util/math.js';

let dist_temps = util.cachering.fromConstructor(Vector3, 512);
let dist_rets = util.cachering.fromConstructor(Vector2, 512);

export const WidgetFlags = {
  SELECT    : 1,
  //HIDE      : 2,
  HIGHLIGHT : 4,
  CAN_SELECT : 8,
  IGNORE_EVENTS : 16,
  ALL_EVENTS : 32, //widget gets event regardless of if mouse cursor is near it
};

export let WidgetTools = [];


export class WidgetShape {
  constructor(view3d) {
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

  onContextLost(e) {
    if (this.mesh !== undefined) {
      this.mesh.onContextLost(e);
    }
  }

  destroy(gl) {
    if (this.gl !== undefined && gl !== this.gl) {
      console.warn("Destroy called with new gl context");
    } else if (this.gl === undefined && gl !== undefined) {
      this.gl = gl;
    }

    gl = this.gl;

    if (gl === undefined) {
      return;
    }

    this.mesh.destroy(gl);
    this.mesh = undefined;
    this.destroyed = true;
  }

  //returns [distance (in 2d screen space), z (for simple z ordering)]
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
    if (this.destroyed) {
      console.log("Reusing widget shape");
      this.destroyed = false;
    }

    if (this.mesh === undefined) {
      console.warn("missing mesh in WidgetShape.prototype.draw()");
      return;
    }

    this.mesh.program = Shaders.WidgetMeshShader;

    this.mesh.uniforms.color = this.color;

    let mat = this.drawmatrix;
    mat.load(this.matrix).multiply(matrix);

    let view3d = manager.ctx.view3d;
    let camera = manager.ctx.view3d.camera;
    let co = this._drawtemp;
    co.zero();
    co.multVecMatrix(mat);
    let w = co.multVecMatrix(camera.rendermat);

    let smat = this._tempmat;
    smat.makeIdentity();

    mat.load(this.matrix);

    let scale = IsMobile() ? w*0.15 : w*0.075; //Math.max(w*0.05, 0.01);

    let local = this._tempmat2.load(this.localMatrix);
    if (localMatrix !== undefined) {
      local.multiply(localMatrix);
    }

    smat.scale(scale, scale, scale);

    mat.multiply(matrix);
    mat.multiply(smat);
    mat.multiply(local);

    this.mesh.uniforms.polygonOffset = 0.0;
    this.mesh.uniforms.projectionMatrix = manager.ctx.view3d.camera.rendermat;
    this.mesh.uniforms.objectMatrix = mat;

    gl.enable(gl.BLEND);

    //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);
    //gl.blendEquation(gl.FUNC_ADD);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    this.mesh.draw(gl);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
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

    let scale1 = dist_temps.next().zero();
    let scale2 = dist_temps.next().zero();

    scale2[0] = scale2[1] = scale2[2] = 1.0;
    scale2.multVecMatrix(this.drawmatrix);
    scale1.multVecMatrix(this.drawmatrix);

    scale1[0] = this.drawmatrix.$matrix.m11;
    scale1[1] = this.drawmatrix.$matrix.m12;
    scale1[2] = this.drawmatrix.$matrix.m13;

    let scale = scale1.vectorLength();//scale2.vectorDistance(scale1);

    let v1 = dist_temps.next().zero();
    let v2 = dist_temps.next().zero();

    v1[2] = -scale*0.25;
    v2[2] = scale*0.25;

    v1.multVecMatrix(this.drawmatrix);
    v2.multVecMatrix(this.drawmatrix);

    view3d.project(v1);
    view3d.project(v2);

    let tout = dist_rets.next().zero();

    let dis = dist_to_line_2d(new Vector2([x, y]), v1, v2, true, undefined, tout);
    let t = tout[0];

    let lineco = dist_temps.next();
    lineco.load(v1).interp(v2, t);

    let ret = dist_rets.next();

    //get distance to fat line by subtracting from dis

    ret[0] = Math.max(dis-5, 0);
    ret[1] = lineco[2];

    return ret;
  }
}

export class WidgetBlockArrow extends WidgetArrow {
  constructor() {
    super();
    this.shapeid = "BLOCKARROW";
  }
}

export class WidgetSphere extends WidgetShape {
  constructor(manager) {
    super();

    this.shapeid = "SPHERE";
  }
  draw(gl, manager, matrix, localMatrix) {
    this.mesh = manager.shapes[this.shapeid];

    super.draw(gl, manager, matrix, localMatrix);
  }

  distToMouse(view3d, x, y) {
    let v = new Vector3();
    //measure scale

    let v1 = dist_temps.next().zero();
    let v2 = dist_temps.next().zero();

    let mat = this.drawmatrix;
    let mm = mat.$matrix;

    //let imat = new Matrix4();
    //imat.load(mat);
    //imat.invert();

    v1.multVecMatrix(mat);

    let r = 0.5*Math.sqrt(mm.m11*mm.m11 + mm.m12*mm.m12 + mm.m13*mm.m13);

    view3d.project(v1);
    let z = v1[2];

    let dd = Math.sqrt((x-v1[0])**2 + (y-v1[1])**2);
    let rett = dist_rets.next();

    rett[0] = dd;
    rett[1] = v1[2];
    //console.log(rett);
    //return rett;

    view3d.unproject(v1);

    v2[0] = x;
    v2[1] = y;
    v2[2] = z;
    view3d.unproject(v2);

    //get point on boundary
    let rco = dist_temps.next().zero();
    rco.load(v2).sub(v1).normalize().mulScalar(r).add(v1);

    let t1 = dist_temps.next();
    let t2 = dist_temps.next();

    t1.load(v2).sub(rco);
    t2.load(v2).sub(v1);

    let sign = t1.dot(t2) < 0.0 ? -1.0 : 1.0;

    view3d.project(v2);
    view3d.project(rco);

    let dis = v2.vectorDistance(rco);

    let ret = dist_rets.next();

    ret[0] = sign > 0.0 ? dis : -1; //XXX fixme: why is -1 necassary?
    ret[1] = rco[2];

    return ret;
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
    let scale1 = dist_temps.next().zero();
    let scale2 = dist_temps.next().zero();
    let scale3 = dist_temps.next().zero();

    scale2[0] = 1.0;
    scale3[1] = 1.0;

    scale1.multVecMatrix(this.drawmatrix);
    scale2.multVecMatrix(this.drawmatrix);
    scale3.multVecMatrix(this.drawmatrix);

    view3d.project(scale1);
    view3d.project(scale2);
    view3d.project(scale3);

    let scalex = scale2.vectorDistance(scale1);
    let scaley = scale3.vectorDistance(scale1);

    let v1 = dist_temps.next().zero();
    let n = dist_temps.next().zero();

    v1.multVecMatrix(this.drawmatrix);
    let mm = this.drawmatrix.$matrix;

    n[0] = mm.m31; n[1] = mm.m32; n[2] = mm.m33;
    n.normalize();

    let view = view3d.getViewVec(x, y);

    let ret = math.isect_ray_plane(v1, n, view3d.camera.pos, view);
    let ret2 = dist_rets.next();

    if (ret) {
      let zco = dist_temps.next().load(ret);
      view3d.project(zco);

      let imat = this._tempmat2;
      imat.load(this.drawmatrix).invert();

      ret.multVecMatrix(imat);

      let vx = dist_temps.next().load(ret);
      let vy = dist_temps.next().load(ret);

      let sv1 = dist_temps.next().load(v1);
      view3d.project(sv1);

      //console.log(vx);
      vx[1] = vy[0] = 0.0;
      vx[2] = vy[2] = 0.0;
      vx.multVecMatrix(this.drawmatrix);
      vy.multVecMatrix(this.drawmatrix);

      view3d.project(vx);
      view3d.project(vy);

      let dx = vx.vectorDistance(sv1);
      let dy = vy.vectorDistance(sv1);

      let sn = dist_temps.next().zero();

      dx = Math.max(dx-scalex, 0.0);
      dy = Math.max(dy-scaley, 0.0);

      //dx -= scalex*0.5;
      //dy -= scaley*0.5;

      let dis = Math.max(Math.abs(dx), Math.abs(dy));
      //console.log(dx.toFixed(2), dy.toFixed(2), (scalex*0.5).toFixed(2), (scaley*0.5).toFixed(2));

      ret2[0] = dis;
      ret2[1] = zco[2];

      return ret2;
    } else {
      ret2[0] = 10000.0;
      ret2[1] = 0.0;

      return ret2;
    }
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
    let def = this.constructor.widgetDefine();

    this.ctx = undefined;
    this.flag = def.flag !== 0 ? def.flag : 0;
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

  static widgetDefine() {return {
    uiName   : "name",
    typeName : "typeName",
    selMask  : undefined,
    icon     : -1,
    flag     : 0, //one of WidgetFlags
  }}

  //can this widget run?
  static ctxValid(ctx) {
    return ctx.selectMask & this.constructor.widgetDefine().selMask;
  }

  get isDead() {
    //throw new Error("implement me");
    return false;
  }

  remove() {
    this.manager.remove(this);
  }

  onContextLost(e) {
    if (this.shape !== undefined) {
      this.shape.onContextLost(e);
    }
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
    let mindis, minz, minret;

    if (this.shape !== undefined) {
      let disz = this.shape.distToMouse(view3d, x, y);
      
      mindis = disz[0];
      minz = disz[1];
      minret = this;
    }

    for (let child of this.children) {
      let ret = child.findNearest(view3d, x, y, limit);

      if (ret !== undefined) {
        //console.log(ret.z)
      }

      if (mindis === undefined || ret.dis < mindis) {
        mindis = ret.dis;
        minz = ret.z;
        minret = child;
      }
    }

    if (mindis !== undefined && mindis > limit) {
      return undefined;
    }

    return {
      data : minret,
      dis  : mindis,
      z    : minz
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

  on_mousedown(e, localX, localY, was_touch) {
    let child = this.findNearest(this.manager.ctx.view3d, localX, localY);

    if (child !== undefined && child !== this) {
      if (child.on_mousedown) {
        child.on_mousedown(e, localX, localY);
      }
      return true;
    } else if (child === this) {
      return true;
    }

    return false;
  }

  on_mousemove(e, localX, localY) {
    let child = this.findNearest(this.manager.ctx.view3d, localX, localY);

    if (child !== undefined && child !== this) {
      child.on_mousemove(e, localX, localY);
      return true;
    } else if (child === this) {
      return true;
    }

    return false;
  }

  on_mouseup(e, localX, localY, was_touch) {
    let child = this.findNearest(this.manager.ctx.view3d, localX, localY);

    if (child !== undefined && child !== this) {
      child.on_mouseup(e, localX, localY);
      return true;
    } else if (child === this) {
      return true;
    }

    return false;
  }

  on_keydown(e, localX, localY) {
    return true;
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

export class WidgetTool extends WidgetBase {
  constructor(manager) {
    super();

    if (manager !== undefined) {
      this.manager = manager;
      this.ctx = manager.ctx;
    } else {
      this.manager = this.ctx = undefined;
    }

    let def = this.constructor.widgetDefine();

    this.flag = def.flag !== undefined ? def.flag : 0;

    this.destroyed = false;
    this.name = def.name;
    this.uiname = def.uiname;
    this.icon = def.icon !== undefined ? def.icon : -1;
    this.description = def.description !== undefined ? def.description : "";

    this.widgets = [];
  }

  setManager(manager) {
    this.manager = manager;
    this.ctx = manager.ctx;
  }

  getArrow(matrix, color) {
    let ret = this.manager.arrow(matrix, color);
    this.widgets.push(ret);
    return ret;
  }

  getSphere(matrix, color) {
    let ret = this.manager.sphere(matrix, color);
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
  execTool(ctx, tool) {
    let view3d = this.ctx.view3d;

    if (this._widget_tempnode === undefined) {
      let n = this._widget_tempnode = this.manager.createCallbackNode(0, "widget redraw", () => {
        this.update();
      }, {trigger: new DependSocket("trigger")}, {});

      this.ctx.graph.add(n);
      n.inputs.trigger.connect(view3d._graphnode.outputs.onDrawPre);
    }

    this.ctx.toolstack.execTool(ctx, tool);

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

  static widgetDefine() {return {
    name        : "name",
    uiname      : "uiname",
    icon        : -1,
    flag        : 0,
    description : "",
    selectMode  : undefined, //force selectmode to this on widget create
  }}

  static register(cls) {
    WidgetTools.push(cls);
  }

  static getTool(name) {
    for (let cls of WidgetTools) {
      if (cls.widgetDefine().name === name) {
        return cls;
      }
    }

    return undefined;
  }

  static getToolEnum(classes=WidgetTools, propcls=EnumProperty, is_bitmask=false) {
    let enumdef = {};
    let icondef = {};
    let uinames = {};
    let i = 0;

    for (let cls of classes) {
      let def = cls.widgetDefine();

      if (is_bitmask) {
        enumdef[def.name] = 1<<i;
      } else {
        enumdef[def.name] = i;
      }

      icondef[def.name] = def.icon;
      uinames[def.name] = def.uiname;

      i++;
    }

    let prop = new propcls(undefined, enumdef, undefined, "Tools", "Tool Widgets");
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
    super.update(this.manager);
  }

  onremove() {
    let manager = this.manager;

    for (let w of this.widgets) {
      manager.remove(w);
    }

    this.widgets = [];

    if (this._widget_tempnode !== undefined ){
      manager.removeCallbackNode(this._widget_tempnode);
      this._widget_tempnode = undefined;
    }
  }

  remove() {
    let manager = this.manager;
    
    manager.remove(this);
  }

  destroy(gl) {
    super.destroy(gl);

    if (this.destroyed) {
      return;
    }

    for (let w of this.widgets) {
      w.destroy(gl);
    }
  }
};

export class WidgetManager {
  constructor(ctx) {
    this._init = false;
    this.widgets = [];
    this.widget_idmap = {};
    this.shapes = {};
    this.idgen = new util.IDGen();
    this.ctx = ctx;
    this.gl = undefined;

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

  hasWidget(cls) {
    for (let w of this.widgets) {
      if (w instanceof cls)
        return w;
    }
  }

  glInit(gl) {
    this.gl = gl;
    this.loadShapes();
  }

  onContextLost(e) {
    this._init = false;

    for (let w of this.widgets) {
      w.onContextLost(e);
    }
  }

  clearNodes() {
    let graph = this.ctx.graph;

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
      this.ctx.graph.remove(this.nodes[key]);
    }
  }

  createCallbackNode(id, name, callback, inputs, outputs) {
    let key = id + ":" + name;

    if (this.nodes[key]) {
      this.ctx.graph.remove(this.nodes[key]);
    }

    this.nodes[key] = CallbackNode.create(key, callback, inputs, outputs);
    this.nodes[key]._key = key;

    return this.nodes[key];
  }

  loadShapes() {
    for (let k in Shapes) {
      let smesh = Shapes[k].copy();

      this.shapes[k] = smesh;
    }

    this.ready = true;
  }

  _picklimit(was_touch) {
    return was_touch ? 35 : 8;
  }

  _fireAllEventWidgets(e, key, localX, localY, was_touch) {
    let ret = 0;

    for (let w of this.widgets) {
      if (w.flag & WidgetFlags.ALL_EVENTS) {
        ret |= w[key](e, localX, localY, was_touch);
      }
    }

    return ret;
  }

  on_keydown(e, localX, localY) {
    if (this._fireAllEventWidgets(e, "on_keydown", localX, localY, false)) {
      return true;
    }

    if (this.widgets.highlight !== undefined) {
      this.widgets.highlight.on_keydown(e, localX, localY);
    }
  }

  /**see view3d.getSubEditorMpos for how localX/localY are derived*/
  on_mousedown(e, localX, localY, was_touch) {
    this.updateHighlight(e, localX, localY, was_touch);

    if (this._fireAllEventWidgets(e, "on_mousedown", localX, localY, was_touch)) {
      return true;
    }

    if (this.widgets.highlight !== undefined) {
      let flag = this.widgets.highlight.flag;
      if (!(flag & WidgetFlags.IGNORE_EVENTS)) {
        this.widgets.highlight.on_mousedown(e, localX, localY, was_touch);

        return true;
      }
    }
  }

  findNearest(x, y, limit=8) {
    let mindis = 1e17;
    let minz = 1e17;
    let minw = undefined;

    for (let w of this.widgets) {
      if (w.flag & WidgetFlags.IGNORE_EVENTS) {
        continue;
      }

      let ret = w.findNearest(this.ctx.view3d, x, y, limit);

      if (ret === undefined || ret.dis > limit) {
        continue;
      }

      //console.log(ret.z);
      let dis = ret.dis;
      let z = ret.z;

      if (minw === undefined || (dis < mindis || (dis == mindis && z < minz))) {
        mindis = dis;
        minw = ret.data;
      }
    }
      
    return minw;
  }

  updateHighlight(e, localX, localY, was_touch) {
    let w = this.findNearest(localX, localY, this._picklimit(was_touch));

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

    return w !== undefined;
  }

  on_mousemove(e, localX, localY, was_touch) {
    let ret = this.updateHighlight(e, localX, localY, was_touch);

    //console.log(w);
    if (this._fireAllEventWidgets(e, "on_mousemove", localX, localY, was_touch)) {
      return true;
    }

    return ret;
  }
  
  on_mouseup(e, localX, localY, was_touch) {
    this.updateHighlight(e, localX, localY, was_touch);

    if (this._fireAllEventWidgets(e, "on_mouseup", localX, localY, was_touch)) {
      return true;
    }

    if (this.widgets.highlight !== undefined) {
      return this.widgets.highlight.on_mouseup(e, localX, localY);
    }
  }

  add(widget) {
    if (widget === undefined || !(widget instanceof WidgetBase)) {
      console.warn("invalid widget type for ", widget);
      throw new Error("invalid widget type for " + widget);
    }

    if (widget.id !== -1 && widget.id in this.widget_idmap) {
      console.warn("Warning, tried to add same widget twice");
      return undefined;
    }

    widget.ctx = this.ctx;
    widget.id = this.idgen.next();
    widget.manager = this;

    this.widget_idmap[widget.id] = widget;
    this.widgets.push(widget);

    return widget;
  }

  remove(widget) {
    if (!(widget.id in this.widget_idmap)) {
      console.warn("widget not in manager", widget.id, widget);
      return;
    }

    if (widget.onremove) {
      widget.onremove();
    }

    if (this.ctx.view3d !== undefined && this.ctx.view3d.gl !== undefined) {
      widget.destroy(this.ctx.view3d.gl);
    }

    if (widget === this.highlight) {
      this.highlight = undefined;
    }
    if (widget === this.active) {
      this.active = undefined;
    }

    delete this.widget_idmap[widget.id];
    this.widgets.remove(widget);

    widget.id = -1;
  }

  clear() {
    let ws = this.widgets.slice(0, this.widgets.length);

    for (let widget of ws) {
      this.remove(widget);
    }
  }

  destroy(gl) {
    if (this.ctx.view3d !== undefined) {
      this.clearNodes();
    } else {
      //XXX ok just nuke all references in this.nodes
      this.nodes = {};
    }

    for (let k in this.shapes) {
      let shape = this.shapes[k];
      shape.destroy(gl);
    }

    if (this.gl !== undefined && gl !== this.gl) {
      console.warn("Destroy called with new gl context");
    } else if (this.gl === undefined && gl !== undefined) {
      this.gl = gl;
    }

    gl = this.gl;
    let widgets = this.widgets;

    this.widgets = [];
    this.widget_idmap = {};
    this.widgets.active = undefined;
    this.widgets.highlight = undefined;

    if (gl === undefined) {
      return;
    }

    for (let w of widgets) {
      w.ctx = this.ctx;
      w.manager = this;

      try {
        w.destroy(gl);
      } catch (error) {
        util.print_stack(error);
        console.warn("Failed to destroy a widget", w);
      }
    }
  }

  draw(gl, view3d) {
    if (!this._init) {
      this._init = true;
      this.glInit(gl);
    }

    let pushctx = view3d !== undefined && view3d !== this.ctx.view3d;

    if (pushctx) {
      view3d.push_ctx_active();
    }

    for (let widget of this.widgets) {
      widget.draw(gl, this);
    }

    if (pushctx) {
      view3d.pop_ctx_active();
    }
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

  sphere(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetSphere(this)));
  }

  blockarrow(matrix, color) {
    return this.add(this._newbase(matrix, color, new WidgetBlockArrow(this)));
  }

  update(view3d) {
    for (let widget of this.widgets) {
      widget.update(this);

      widget.manager = this;
      if (!widget.destroyed && widget.isDead) {
        widget.remove();
      }
    }
  }
}

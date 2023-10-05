import {Vector3, Vector2, Vector4, Matrix4, Quat} from '../../util/vectormath.js';
import {ToolOp, UndoFlags, eventWasTouch, keymap} from '../../path.ux/scripts/pathux.js';
import {Icons} from '../icon_enum.js';
import {SelMask} from "./selectmode.js";
import {CallbackNode} from "../../core/graph.js";
import {DependSocket} from "../../core/graphsockets.js";
import {CastModes, castViewRay} from "./findnearest.js";
import {Shapes} from '../../core/simplemesh_shapes.js';
import {Shaders} from "../../shaders/shaders.js";
import {Camera} from '../../core/webgl.js';

export class ViewSelected extends ToolOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname     : "View Selected",
      toolpath   : "view3d.view_selected",
      description: "Zoom Out",
      icon       : Icons.ZOOM_OUT,
      is_modal   : true,
      undoflag   : UndoFlags.NO_UNDO
    }
  }

  modalStart(ctx) {
    super.modalStart(ctx);
    this.modalEnd(ctx);

    ctx.view3d.viewSelected();
  }
}

ToolOp.register(ViewSelected);

export class CenterViewOp extends ToolOp {
  constructor() {
    super();

    this.p = undefined;
  }

  static tooldef() {
    return {
      uiname     : "Center View",
      toolpath   : "view3d.center_at_mouse",
      description: "Recenter View At Mouse",
      icon       : Icons.FIX_VIEW,
      is_modal   : true,
      undoflag   : UndoFlags.NO_UNDO
    }
  }

  modalStart(ctx) {
    super.modalStart(ctx);
    this.node = CallbackNode.create("view3d.center_at_mouse", this.draw.bind(this), {
      onDrawPost: new DependSocket()
    });

    ctx.graph.add(this.node);
    let vnode = ctx.view3d.getGraphNode();

    vnode.outputs.onDrawPost.connect(this.node.inputs.onDrawPost);
  }

  draw() {
    let ctx = this.modal_ctx;
    let view3d = ctx.view3d;
    let gl = view3d.gl;

    let mat = new Matrix4();
    let co = new Vector3(this.p);
    let w = view3d.project(co);
    let s = w*0.05;

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    if (this.p === undefined) {
      return;
    }

    mat.translate(this.p[0], this.p[1], this.p[2]);
    mat.scale(s, s, s);

    let cam = view3d.camera;

    Shapes.SPHERE.draw(gl, {
      projectionMatrix: cam.rendermat,
      objectMatrix    : mat,
      color           : [1, 0.4, 0.2, 1.0],
    }, Shaders.WidgetMeshShader)

    console.log("draw!");
  }

  on_pointerup(e) {
    this.on_pointermove(e);

    console.log("mouse up!");
    let ctx = this.modal_ctx;
    let view3d = ctx.view3d;
    let cam = view3d.camera;

    if (this.p !== undefined && !isNaN(this.p.dot(this.p))) {
      cam.target.load(this.p);
    }

    this.modalEnd(false);
  }

  on_keydown(e) {
    switch (e.keyCode) {
      case keymap["Enter"]:
      case keymap["Escape"]:
      case keymap["Space"]:
        this.modalEnd(false);
        break;
    }
  }

  modalEnd(was_cancelled) {
    let ctx = this.modal_ctx;
    let view3d = this.view3d;

    super.modalEnd(was_cancelled);

    if (this.node !== undefined) {
      ctx.graph.remove(this.node);
      this.node = undefined;
    }
  }

  on_pointermove(e) {
    let ctx = this.modal_ctx;
    let view3d = ctx.view3d;
    let mpos = view3d.getLocalMouse(e.x, e.y);

    let overdraw = this.getOverdraw();

    window.redraw_viewport();

    overdraw.clear();
    overdraw.circle([e.x, e.y], 35, "red");

    //castViewRay(ctx, selectMask, mpos, view3d, mode=CastModes.FRAMEBUFFER) {
    let ret = castViewRay(ctx, SelMask.OBJECT | SelMask.GEOM, mpos, view3d, CastModes.FRAMEBUFFER);
    console.log(ret);

    if (ret !== undefined) {
      this.p = new Vector3(ret.p3d);
    } else {
      this.p = undefined;
    }

    window.redraw_viewport();
  }
}

ToolOp.register(CenterViewOp);

/*
let cssmap = {
  "red" : [1,0,0,1],
  "yellow" : [1,1,0,1],
  "green" : [0,1,0,1],
  "teal" : [0,1,1,1],
  "purple" : [1,0,1,1],
  "orange" : [1,0.55,0.25,1],
  "brown"  : [0.7, 0.4, 0.3, 1],
  "white"  : [1.0,1.0,1.0,1.0],
  "black" : [0,0,0,1],
  "grey" : [0.7, 0.7, 0.7, 1.0]
};

function css2rgba(css) {
  css = css.toLowerCase().trim();

  let rgb = (r, g, b) => {
    return [r/255, g/255, b/255, 1.0];
  }

  let rgba = (r, g, b, a) => {
    let ret = rgb(r, g, b);
    ret[3] = a;
    return ret;
  }

  if (css.match("rgb")) {
    return eval(css);
  } else {
    return cssmap[css];
  }
}

window.css2rgba = css2rgba;
//*/

export class View3DOp extends ToolOp {
  constructor() {
    super();

    this.drawlines = [];
    this.drawquads = [];
    this.drawlines2d = [];
  }

  modalEnd(wasCancelled) {
    this.resetDrawLines();
    return super.modalEnd(wasCancelled);
  }

  addDrawQuad(v1, v2, v3, v4, color, useZ = true) {
    let dq = this.modal_ctx.view3d.makeDrawLine(v1, v2, v3, v4, color, useZ);
    this.drawquads.push(dq);
  }

  addDrawLine(v1, v2, color, useZ = true) {
    let dl = this.modal_ctx.view3d.makeDrawLine(v1, v2, color, useZ);
    this.drawlines.push(dl);
    return dl;
  }

  addDrawLine2D(v1, v2, color) {
    let overdraw = this.modal_ctx.view3d.overdraw;

    let dl = overdraw.line(v1, v2, color);
    this.drawlines2d.push(dl);

    return dl;
  }

  addDrawCircle2D(p, r, color, quality = 15) {
    let steps = Math.ceil((r*2.0*Math.PI)/quality);
    steps = Math.max(steps, 6);

    let t = -Math.PI, dt = (2.0*Math.PI)/(steps - 1);
    let p1 = new Vector2();
    let p2 = new Vector2();

    for (let i = 0; i < steps; i++, t += dt) {
      p1[0] = Math.sin(t)*r + p[0];
      p1[1] = Math.cos(t)*r + p[1];

      if (i > 0) {
        this.addDrawLine2D(p2, p1, color);
      }

      p2.load(p1);
    }
  }

  resetTempGeom() {
    this.resetDrawLines();
  }

  resetDrawLines() {
    for (let dl of this.drawlines) {
      this.modal_ctx.view3d.removeDrawLine(dl);
    }

    for (let dl of this.drawlines2d) {
      dl.remove();
    }

    for (let dq of this.drawquads) {
      this.modal_ctx.view3d.removeDrawQuad(dq);
    }

    this.drawlines.length = 0;
    this.drawquads.length = 0;
    this.drawlines2d.length = 0;
  }

  removeDrawLine(dl) {
    if (this.drawlines.indexOf(dl) >= 0) {
      this.modal_ctx.view3d.removeDrawLine(dl);
      this.drawlines.remove(dl);
    } else if (this.drawlines2d.indexOf(dl) >= 0) {
      this.drawlines2d.remove(dl);
      dl.remove();
    }
  }
}

export class OrbitTool extends ToolOp {
  constructor() {
    super();

    this.start_sign = 1.0;
    this.first = true;
    this.last_mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.first = true;
    this.start_camera = undefined;
  }

  static tooldef() {
    return {
      uiname     : "Orbit View",
      toolpath   : "view3d.orbit",
      description: "Orbit the view",
      is_modal   : true,
      undoflag   : UndoFlags.NO_UNDO,
      flag       : 0,
    }
  }

  on_pointermove(e) {
    e.preventDefault();

    let view3d = this.modal_ctx.view3d, camera = view3d.camera;
    let mpos = view3d.getLocalMouse(e.x, e.y);
    let x = mpos[0], y = mpos[1];

    if (this.first) {
      this.start_camera = this.modal_ctx.view3d.camera.copy();
      this.start_mpos[0] = x;
      this.start_mpos[1] = y;
      this.last_mpos[0] = x;
      this.last_mpos[1] = y;
      this.first = false;
      this.start_camera = new Camera();
      this.start_camera.load(camera);
      return;
    }


    let dx = x - this.start_mpos[0], dy = -(y - this.start_mpos[1]);
    let scale = 0.0055;

    let dx2 = x - this.start_mpos[0], dy2 = -(y - this.start_mpos[1]);
    let sign = Math.sign(dx*dx2 + dy*dy2);

    this.last_mpos[0] = x;
    this.last_mpos[1] = y;

    dx *= scale;
    dy *= scale;

    let len = Math.sqrt(dx**2 + dy**2);

    //camera.load(this.start_camera);

    camera.load(this.start_camera);
    camera.pos.sub(camera.target);

    let n = new Vector4();
    let nmat2 = new Matrix4(camera.cameramat);
    nmat2.makeRotationOnly();
    nmat2.invert();

    n[0] = dy;
    n[1] = -dx;
    n[2] = 0.0
    n[3] = 0.0;

    n.multVecMatrix(nmat2);
    n.normalize();

    let quat = new Quat();
    quat.axisAngleToQuat(n, len*sign);
    let ymat = quat.toMatrix();

    let mat = new Matrix4();
    mat.multiply(ymat);
    //mat.multiply(zmat);

    //mat.invert();

    camera.pos.multVecMatrix(mat);

    let nmat = new Matrix4(mat);
    nmat.makeRotationOnly();
    camera.up.multVecMatrix(nmat);

    //camera.up.normalize();
    //camera.up.load(n).cross([0, 0, 1])
    //camera.up.cross(n).normalize()

    camera.pos.add(camera.target);
    window.redraw_viewport(true);

    view3d.onCameraChange();
  }

  on_pointerup(e) {
    e.stopPropagation();
    console.log("orbit Mouse Up");

    this.modalEnd();
  }


  on_keydown(e) {
    if (e.keyCode == keymap["Escape"] || e.keyCode == keymap["Enter"]) {
      this.modalEnd();
    }
  }
}

ToolOp.register(OrbitTool);

class TouchData {
  constructor(x, y, id) {
    this.pos = new Vector2([x, y]);
    this.startpos = this.pos.copy();
    this.lastpos = this.pos.copy();
    this.delta = new Vector2();
    this.id = id;
  }
}

export class TouchViewTool extends ToolOp {
  constructor() {
    super();

    this.last_mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.first = true;
    this.start_camera = undefined;

    this.touches = [];
    this._touches = {};
  }

  static tooldef() {
    return {
      uiname     : "MultiTouch View Manipulate",
      toolpath   : "view3d.touchview",
      description: "Orbit the view",
      is_modal   : true,
      undoflag   : UndoFlags.NO_UNDO,
      flag       : 0,
    }
  }

  pan(dx, dy) {
    let view3d = this.modal_ctx.view3d, camera = view3d.camera;

    let p = new Vector3(camera.target);

    //console.log(dx, dy);

    view3d.project(p);
    p[0] += -dx;
    p[1] += -dy;
    view3d.unproject(p);

    p.sub(camera.target);

    camera.pos.add(p);
    camera.target.add(p);
    camera.regen_mats(camera.aspect);
  }

  on_pointermove(e) {
    let view3d = this.modal_ctx.view3d, camera = view3d.camera;

    console.warn("TOUCH", e.pointerId, e.which);

    if (this.first) {
      this.start_camera = camera.copy();
      this.first = false;
    }

    let pos = view3d.getLocalMouse(e.x, e.y);

    //console.log(ts[i].identifier, "ID", this.touches);
    if (!(e.pointerId in this._touches)) {
      let touch = new TouchData(pos[0], pos[1], e.pointerId);
      this._touches[e.pointerId] = this.touches.length;
      this.touches.push(touch);
    } else {
      let i2 = this._touches[e.pointerId];
      if (this.touches[i2] === undefined) {
        this.touches[i2] = new TouchData(pos[0], pos[1], i2);
      } else {
        this.touches[i2].delta.load(pos).sub(this.touches[i2].pos);

        this.touches[i2].lastpos.load(this.touches[i2].pos);
        this.touches[i2].pos.load(pos);
      }
    }

    let cent = new Vector2();
    let tottouch = 0;
    for (let t of this.touches) {
      if (t !== undefined) {
        cent.add(t.pos);
        tottouch++;
      }
    }
    if (tottouch > 0) {
      cent.mulScalar(1.0/tottouch);
    }

    if (tottouch === 1) {
      let t = this.touches[0];

      if (t !== undefined) {
        this.orbit(t.delta[0], t.delta[1]);
      }

      //reset touche starts for zoom
      for (let touch of this.touches) {
        if (touch !== undefined) {
          touch.startpos.load(touch.pos);
        }
      }
    } else if (tottouch > 1) {
      let touches = this.touches;
      let off = new Vector2();
      let cent = new Vector2();

      for (let i = 0; i < tottouch; i++) {
        if (touches[i]) {
          off.add(touches[i].delta);
        }
      }

      off.mulScalar(1.0/tottouch);
      this.pan(off[0], off[1]);

      let a = touches[0].startpos.vectorDistance(touches[1].startpos);
      let b = touches[0].pos.vectorDistance(touches[1].pos);

      let scale = a/b;
      //console.log("zoom fac:", scale);

      this.zoom(scale);
    }

    window.redraw_viewport(true);
    view3d.onCameraChange();
  }

  on_pointerup(e) {
    if (eventWasTouch(e)) {
      for (let i = 0; i < this.touches.length; i++) {
        if (this.touches[i].id === e.pointerId) {
          //this.touches[i] = undefined;
          delete this._touches[e.pointerId];
          this.touches.remove(this.touches[i]);
          break;
        }
      }

      this._touches = {};
      for (let i=0; i<this.touches.length; i++) {
        this._touches[this.touches[i].id] = i;
      }

      let ok = this.touches.length !== 0;
      for (let t of this.touches) {
        if (t !== undefined) {
          ok = true;
        }
      }

      if (ok) {
        return;
      }
    }

    e.stopPropagation();

    this.modalEnd();
  }


  zoom(scale) {
    let view3d = this.modal_ctx.view3d, camera = view3d.camera;

    camera.pos.load(this.start_camera.pos);
    camera.pos.sub(this.start_camera.target).mulScalar(scale).add(this.start_camera.target);

    camera.regen_mats(camera.aspect);
  }

  orbit(dx, dy) {
    dy = -dy;

    let view3d = this.modal_ctx.view3d, camera = view3d.camera;
    let scale = 0.0055;

    dx *= scale;
    dy *= scale;

    //camera.load(this.start_camera);

    camera.pos.sub(camera.target);

    let n = new Vector4();
    n[0] = 0; //x - this.start_mpos[0];
    n[1] = -1; //-(y - this.start_mpos[1]);
    n[2] = camera.near + 0.01;
    n[3] = 0.0;

    n.load(camera.pos).cross(camera.up).normalize();
    n[3] = 0.0;
    n.normalize();

    //n.multVecMatrix(camera.irendermat);

    let n2 = new Vector4();
    n2[0] = 1; //x - this.start_mpos[0];
    n2[1] = 0; //-(y - this.start_mpos[1]);
    n2[2] = camera.near + 0.01;
    n2[3] = 0.0;

    n2.zero();
    n2[2] = 1;

    let quat = new Quat();
    quat.axisAngleToQuat(n, -dy);
    let ymat = quat.toMatrix();

    quat = new Quat();
    quat.axisAngleToQuat(n2, -dx);
    let zmat = quat.toMatrix();

    let mat = new Matrix4();
    mat.multiply(ymat);
    mat.multiply(zmat);

    camera.pos.multVecMatrix(mat);

    n = new Vector3(camera.pos);
    n.normalize();

    if (Math.abs(n[2]) < 0.9) {
      //camera.up.normalize();
      camera.up.load(n).cross([0, 0, 1])
      camera.up.cross(n).normalize()
    } else {
      camera.up.multVecMatrix(mat);
      camera.up.normalize();
    }

    camera.pos.add(camera.target);
  }

  on_keydown(e) {
    if (e.keyCode == keymap["Escape"] || e.keyCode == keymap["Enter"]) {
      this.modalEnd();
    }
  }
}

ToolOp.register(TouchViewTool);

export class PanTool extends ToolOp {
  constructor() {
    super();

    this.last_mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.first = true;
    this.start_camera = undefined;
  }

  static tooldef() {
    return {
      uiname     : "Pan View",
      toolpath   : "view3d.pan",
      description: "Pan the view",
      is_modal   : true,
      undoflag   : UndoFlags.NO_UNDO,
      flag       : 0,
    }
  }

  on_pointermove(e) {
    let view3d = this.modal_ctx.view3d, camera = view3d.camera;
    let mpos = view3d.getLocalMouse(e.x, e.y);
    let x = mpos[0], y = mpos[1];

    if (this.first) {
      this.start_camera = this.modal_ctx.view3d.camera.copy();
      this.start_mpos[0] = x;
      this.start_mpos[1] = y;
      this.last_mpos[0] = x;
      this.last_mpos[1] = y;
      this.first = false;
      return;
    }

    let dx = x - this.last_mpos[0], dy = y - this.last_mpos[1];

    this.last_mpos[0] = x;
    this.last_mpos[1] = y;

    let p = new Vector3(camera.target);

    view3d.project(p);
    p[0] += -dx;
    p[1] += -dy;
    view3d.unproject(p);

    p.sub(camera.target);

    camera.pos.add(p);
    camera.target.add(p);
    camera.regen_mats(camera.aspect);

    window.redraw_viewport(true);
    view3d.onCameraChange();
  }

  on_pointerup(e) {
    this.modalEnd();
  }


  on_keydown(e) {
    if (e.keyCode == keymap["Escape"] || e.keyCode == keymap["Enter"]) {
      this.modalEnd();
    }
  }
}

ToolOp.register(PanTool);

export class ZoomTool extends ToolOp {
  constructor() {
    super();

    this.last_mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.first = true;
    this.start_camera = undefined;
  }

  static tooldef() {
    return {
      uiname     : "Zoom View",
      toolpath   : "view3d.zoom",
      description: "Zoom the view",
      is_modal   : true,
      undoflag   : UndoFlags.NO_UNDO,
      flag       : 0,
    }
  }

  on_pointermove(e) {
    let view3d = this.modal_ctx.view3d, camera = view3d.camera;
    let mpos = view3d.getLocalMouse(e.x, e.y);
    let x = mpos[0], y = mpos[1];

    if (this.first) {
      this.start_camera = this.modal_ctx.view3d.camera.copy();
      this.start_mpos[0] = x;
      this.start_mpos[1] = y;
      this.last_mpos[0] = x;
      this.last_mpos[1] = y;
      this.first = false;
      return;
    }

    let dx = x - this.start_mpos[0], dy = y - this.start_mpos[1];

    let len = this.start_camera.pos.vectorDistance(this.start_camera.target);
    let len2 = camera.pos.vectorDistance(camera.target);

    len = Math.log(len)/Math.log(2);

    len += 0.01*dy;
    len = Math.max(len, -5.0);
    len = Math.pow(2.0, len);

    camera.pos.load(this.start_camera.pos);
    camera.pos.sub(this.start_camera.target).normalize().mulScalar(len).add(this.start_camera.target);

    camera.regen_mats(camera.aspect);

    window.redraw_viewport(true);
    view3d.onCameraChange();
  }

  on_pointerup(e) {
    this.modalEnd();
  }


  on_keydown(e) {
    if (e.keyCode == keymap["Escape"] || e.keyCode == keymap["Enter"]) {
      this.modalEnd();
    }
  }
}

ToolOp.register(ZoomTool);

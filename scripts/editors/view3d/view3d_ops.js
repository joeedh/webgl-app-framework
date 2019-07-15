import {Vector3, Vector2, Vector4, Matrix4, Quat} from '../../util/vectormath.js';
import {ToolOp, UndoFlags} from '../../path.ux/scripts/simple_toolsys.js';
import {keymap} from '../../path.ux/scripts/simple_events.js';

export class OrbitTool extends ToolOp {
  constructor() {
    super();
    
    this.last_mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.first = true;
    this.start_camera = undefined;
  }
  
  static tooldef() {return {
    uiname   : "Orbit View",
    toolpath : "view3d.orbit",
    description : "Orbit the view",
    is_modal : true,
    undoflag : UndoFlags.NO_UNDO,
    flag     : 0,
  }}
  
  on_mousemove(e) {
    let x = e.pageX, y = e.pageY;
    
    if (this.first) {
      this.start_camera = this.modal_ctx.view3d.camera.copy();
      this.start_mpos[0] = x;
      this.start_mpos[1] = y;
      this.last_mpos[0] = x;
      this.last_mpos[1] = y;
      this.first = false;
      return;
    }
    
    let dx = x - this.start_mpos[0], dy = -(y - this.start_mpos[1]);
    let scale = 0.0055;

    this.start_mpos[0] = x;
    this.start_mpos[1] = y;
    
    dx *= scale;
    dy *= scale;
    
    let view3d = this.modal_ctx.view3d;
    let camera = view3d.camera;
    //camera.load(this.start_camera);
    
    camera.pos.sub(camera.target);
    
    let n = new Vector4();
    n[0] = 0; //x - this.start_mpos[0];
    n[1] = -1; //-(y - this.start_mpos[1]);
    n[2] = camera.near+0.01;
    n[3] = 0.0;
    
    n.load(camera.pos).cross(camera.up).normalize();
    n[3]=0.0;
    n.normalize();
    
    //n.multVecMatrix(camera.irendermat);

    let n2 = new Vector4();
    n2[0] = 1; //x - this.start_mpos[0];
    n2[1] = 0; //-(y - this.start_mpos[1]);
    n2[2] = camera.near+0.01;
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
    window.redraw_viewport();
  }
  
  on_mouseup(e) {
    this.modalEnd();
  }
  
  
  on_keydown(e) {
    if (e.keyCode == keymap["Escape"] || e.keyCode == keymap["Enter"]) {
      this.modalEnd();
    }
  }
}
ToolOp.register(OrbitTool);

export class PanTool extends ToolOp {
  constructor() {
    super();
    
    this.last_mpos = new Vector2();
    this.start_mpos = new Vector2();
    this.first = true;
    this.start_camera = undefined;
  }
  
  static tooldef() {return {
    uiname   : "Pan View",
    toolpath : "view3d.pan",
    description : "Pan the view",
    is_modal : true,
    undoflag : UndoFlags.NO_UNDO,
    flag     : 0,
  }}
  
  on_mousemove(e) {
    let x = e.pageX, y = e.pageY;
    
    if (this.first) {
      this.start_camera = this.modal_ctx.view3d.camera.copy();
      this.start_mpos[0] = x;
      this.start_mpos[1] = y;
      this.last_mpos[0] = x;
      this.last_mpos[1] = y;
      this.first = false;
      return;
    }
    
    let view3d = this.modal_ctx.view3d, camera = view3d.camera;
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
    
    window.redraw_viewport();
  }
  
  on_mouseup(e) {
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
  
  static tooldef() {return {
    uiname   : "Zoom View",
    toolpath : "view3d.zoom",
    description : "Zoom the view",
    is_modal : true,
    undoflag : UndoFlags.NO_UNDO,
    flag     : 0,
  }}
  
  on_mousemove(e) {
    let x = e.pageX, y = e.pageY;
    
    if (this.first) {
      this.start_camera = this.modal_ctx.view3d.camera.copy();
      this.start_mpos[0] = x;
      this.start_mpos[1] = y;
      this.last_mpos[0] = x;
      this.last_mpos[1] = y;
      this.first = false;
      return;
    }
    
    let view3d = this.modal_ctx.view3d, camera = view3d.camera;
    let dx = x - this.start_mpos[0], dy = y - this.start_mpos[1];
    
    //console.log(l2/l1);
    //let ratio = l2 / l1;
    
    //let ratio = dy < 0.0 ? 1.0 / (-dy + 1.0) : dy;
    //ratio *= 0.5;
    let len = this.start_camera.pos.vectorDistance(this.start_camera.target);
    let len2 = camera.pos.vectorDistance(camera.target);
    
    //len = len < 1.0 ? len**2 : len;
    len = Math.log(len) / Math.log(2);
    console.log(len)
    //if (len > 3.0) {
      len += 0.01*dy;
    //}
    len = Math.max(len, -5.0);
    len = Math.pow(2.0, len);
    
    //len = Math.max(len, 0.01);
    
    //console.log(len.toFixed(4))
    
    camera.pos.load(this.start_camera.pos);
    camera.pos.sub(this.start_camera.target).normalize().mulScalar(len).add(this.start_camera.target);
    
    camera.regen_mats(camera.aspect);
    
    window.redraw_viewport();
  }
  
  on_mouseup(e) {
    this.modalEnd();
  }
  
  
  on_keydown(e) {
    if (e.keyCode == keymap["Escape"] || e.keyCode == keymap["Enter"]) {
      this.modalEnd();
    }
  }
}

ToolOp.register(ZoomTool);

//XXX unused file see view3d_ops.js

import * as util from '../../util/util.js';
import * as math from '../../util/math.js';
import * as webgl from './webgl.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath';

var Camera = webgl.Camera;

//XXX port unfinished
export class CameraControls extends EventHandler {
  constructor() {
    super();
    
    this.start_mpos = new Vector2();
    this.last_mpos = new Vector2();
    this.mpos = new Vector2();
    
    this.mode = 'r';
  }
  
  zoomstep(sign, step) {
    sign = (sign>0.0)*2.0-1.0;
    
    step = step == undefined ? 0.1 : step;
    var camera = _appstate.camera;
    
    camera.pos.mulScalar(1.0 + sign*step);
    window.redraw_all();
  }
  
  on_mousedown(e) {
  }
  
  do_rotate() {
    var camera = _appstate.camera;
    camera.pos.load(this.start_pos);
    camera.up.load(this.start_up);
    camera.up.normalize();
    camera.regen_mats(camera.aspect);
    
    var origin = new Vector4(this.start_target);
    origin[3] = 1.0;
    origin.multVecMatrix(camera.rendermat);
    var w = origin[3];
    
    if (w == 0.0) {
      console.trace("Eek! w was 0!", origin, camera);
      return;
    }
    
    origin.mulScalar(1.0/w);
    
    var mpos = new Vector4(this.mpos);
    mpos[2] = origin[2]; mpos[3] = 1.0;
    
    var last_mpos = new Vector4(this.last_mpos);
    last_mpos[2] = origin[2]; last_mpos[3] = 1.0;
    
    var start_mpos = new Vector4(this.start_mpos);
    start_mpos[2] = origin[2]; start_mpos[3] = 1.0;
    
    _appstate.normalize_screenco(mpos);
    _appstate.normalize_screenco(last_mpos);
    _appstate.normalize_screenco(start_mpos);
    
    var off = new Vector2(mpos).sub(start_mpos);
    var zrot = off[0]*4.0;
    var yrot = off[1]*2.0;
    
    //console.log(off);
    
    var axis = new Vector4([1.0, 0.0, 0.0, 0.0]);
    var m = camera.cameramat.$matrix;
    axis[0] = m.m11;
    axis[1] = m.m21;
    axis[2] = m.m31;
    axis.normalize();
    
    var quat = new Quat();
    quat.axisAngleToQuat(axis, yrot);
    var qmat = quat.toMatrix();
    
    //var w = axis[3];
    //axis.mulScalar(1.0/w);
    
    //console.log(axis, w);
    var mat = new Matrix4();
    mat.euler_rotate(0.0, 0.0, zrot);
    
    mat.preMultiply(qmat);
    
    camera.pos.load(this.start_pos).multVecMatrix(mat);
    camera.up.load(this.start_up).multVecMatrix(mat);
    camera.up.normalize();
    
    //camera.pos.multVecMatrix(qmat);
    //camera.up.multVecMatrix(qmat);
    //camera.up.normalize();
  }
  
  on_mousemove(e) {
    var x = e.pageX, y = window.innerHeight-e.pageY;
    //console.log("controls", x, y);
    if (!this.first) {
      this.last_mpos.load(this.mpos);
    } else {
      this.start_mpos[0] = x;
      this.start_mpos[1] = y;
      
      this.last_mpos[0] = x;
      this.last_mpos[1] = y;
      this.first = false;
    }
    
    this.mpos[0] = x;
    this.mpos[1] = y;
    
    switch (this.mode) {
        case 'r':
          this.do_rotate();
          break;
    }
    window.redraw_all();
  }
  
  on_mouseup(e) {
    this.end();
  }
  
  on_keydown(e) {
  }
  
  on_keyup(e) {
  }
  
  on_keypress(e) {
  }
  
  on_mousewheel(e) {
  }
  
  start(domobj) {
    this.start_pos    = new Vector3(_appstate.camera.pos);
    this.start_target = new Vector3(_appstate.camera.orbitTarget);
    this.start_up     = new Vector3(_appstate.camera.up);
    this.start_matrix = new Matrix4(_appstate.camera.cameramat);
    this.first = true;
    
    console.log("start modal");
    this._dom = domobj;
    this.pushModal(domobj);
  }
  
  end() {
    console.log("end modal");
    this.popModal(this._dom);
    this._dom = undefined;
  }
}

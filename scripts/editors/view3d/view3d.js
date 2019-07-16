import {Area} from '../../path.ux/scripts/ScreenArea.js';
import {Editor} from '../editor_base.js';
import {Camera, init_webgl, ShaderProgram} from '../../core/webgl.js';
import {SelMask} from './selectmode.js';
import '../../path.ux/scripts/struct.js';
import {DrawModes} from './drawmode.js';
let STRUCT = nstructjs.STRUCT;
import {UIBase}  from '../../path.ux/scripts/ui_base.js';
import * as view3d_shaders from './view3d_shaders.js';
import {SimpleMesh, LayerTypes} from '../../core/simplemesh.js';
import {Vector3, Vector2, Vector4, Matrix4, Quat} from '../../util/vectormath.js';
import {OrbitTool, PanTool, ZoomTool} from './view3d_ops.js';
import {cachering} from '../../util/util.js';
import './view3d_mesh_editor.js';
import {SubEditors} from './view3d_subeditor.js';
import {Mesh} from '../../core/mesh.js';
import {GPUSelectBuffer} from './view3d_select.js';

let proj_temps = cachering.fromConstructor(Vector4, 32);
let unproj_temps = cachering.fromConstructor(Vector4, 32);

let _gl = undefined;

export function getWebGL() {
  if (!_gl) {
    initWebGL();
  }
  return _gl;
}

export function initWebGL() {
  let canvas = document.createElement("canvas");
  let dpi = UIBase.getDPI();
  let w, h;

  canvas.setAttribute("id", "webgl");
  canvas.id = "webgl";

  if (_appstate.screen !== undefined) {
    w = _appstate.screen.size[0], h = _appstate.screen.size[1];
  } else {
    w = h = 512;
  }

  canvas.width = ~~(w*dpi);
  canvas.height = ~~(h*dpi);

  canvas.style["left"] = "0px";
  canvas.style["top"] = "0px";
  canvas.style["width"] = w + "px";
  canvas.style["height"] = h + "px";
  canvas.style["position"] = "absolute";
  canvas.style["z-index"] = "-2";

  canvas.dpi = dpi;

  document.body.appendChild(canvas);
  
  _gl = init_webgl(canvas, {});
  //_gl.canvas = canvas;
  loadShaders(_gl);
}
//see view3d_shaders.js
export function loadShader(gl, sdef) {
  let shader = new ShaderProgram(gl, sdef.vertex, sdef.fragment, sdef.attributes);
  
  shader.init(gl);
  
  for (let k in sdef.uniforms) {
    shader.uniforms[k] = sdef.uniforms[k];
  }
  
  return shader;
}

export function loadShaders(gl) {
  for (let k in view3d_shaders.ShaderDef) {
    view3d_shaders.Shaders[k] = loadShader(gl, view3d_shaders.ShaderDef[k]);
  }
}

export class View3D extends Editor {
  constructor() {
    super();

    this.glPos = [0, 0];
    this.glSize = [512, 512];

    this.T = 0.0;
    this.camera = new Camera();

    this.editors = [];
    for (let cls of SubEditors) {
      this.editors.push(new cls(this));
    }

    this.selectbuf = new GPUSelectBuffer();

    this.camera.pos = new Vector3([20, 0, 10]);
    this.camera.target = new Vector3([0, 0, 0]);

    this._select_transparent = false;
    this._last_selectmode = -1;

    let n = new Vector3(this.camera.pos).sub(this.camera.target);
    this.camera.up = new Vector3([0, 0, -1]).cross(n).cross(n);
    this.camera.up.normalize();
    
    this.camera.near = 0.01;
    this.camera.far = 10000.0;
    this.camera.fovy = 50.0;
    
    this.selectmode = SelMask.OBJECT|SelMask.FACE;
    this.drawmode = DrawModes.TEXTURED;
  }

  get select_transparent() {
    if (!(this.drawmode & (DrawModes.SOLID|DrawModes.TEXTURED)))
      return true;
    return this._select_transparent;
  }

  project(co) {
    let tmp = proj_temps.next().zero();
    
    tmp[0] = co[0];
    tmp[1] = co[1];
    
    if (co.length > 2) {
      tmp[2] = co[2];
    }
    
    tmp[3] = 1.0;
    tmp.multVecMatrix(this.camera.rendermat);
    
    if (tmp[3] != 0.0) {
      tmp[0] /= tmp[3];
      tmp[1] /= tmp[3];
      tmp[2] /= tmp[3];
    }
    
    tmp[0] = (tmp[0]*0.5 + 0.5) * this.size[0];
    tmp[1] = (1.0-(tmp[1]*0.5+0.5)) * this.size[1];
    
    for (let i=0; i<co.length; i++) {
      co[i] = tmp[i];
    }
    
    return tmp;
  }
  
  unproject(co) {
    let tmp = unproj_temps.next().zero();
    
    tmp[0] = (co[0]/this.size[0])*2.0 - 1.0;
    tmp[1] = (1.0 - co[1]/this.size[1])*2.0 - 1.0;
     
    if (co.length > 2) {
      tmp[2] = co[2];
    }
    
    tmp[3] = 1.0;
    tmp.multVecMatrix(this.camera.irendermat);
    
    if (tmp[3] != 0.0) {
      tmp[0] /= tmp[3];
      tmp[1] /= tmp[3];
      tmp[2] /= tmp[3];
    }
    
    for (let i=0; i<co.length; i++) {
      co[i] = tmp[i];
    }
    
    return tmp;
  }
  
  init() {
    super.init();

    for (let ed of this.editors) {
      ed.ctx = this.ctx;
    }

    let header = this.header;
    header.prop("view3d.selectmode");
    
    this.setCSS();

    this.gl = getWebGL();
    this.canvas = this.gl.canvas;
    this.grid = this.makeGrid();

    let getSubEditorMpos = (e) => {
      return this.getLocalMouse(e.clientX, e.clientY);
    }

    this.addEventListener("mousemove", (e) => {
      if (this.canvas === undefined)
        return;

      this.push_ctx_active();

      let r = getSubEditorMpos(e);
      let x = r[0], y = r[1];

      for (let ed of this.editors) {
        ed.on_mousemove(this.ctx, x, y);
      }

      this.pop_ctx_active();
    });

    this.addEventListener("mousedown", (e) => {
      this.push_ctx_active();

      let docontrols = e.button == 1 || e.altKey;

      if (!docontrols && e.button == 0) {
        let selmask = this.selectmode;

        for (let ed of this.editors) {
          let r = getSubEditorMpos(e);
          let x = r[0], y = r[1];

          if (ed.constructor.define().selmask & selmask) {
            ed.clickselect(e, x, y, selmask);
          }
        }
      }

      if (docontrols && !e.shiftKey && !e.ctrlKey) {
        console.log("orbit!");
        let tool = new OrbitTool();
        this.ctx.state.toolstack.execTool(tool);
        window.redraw_viewport();
      } else if (docontrols && e.shiftKey && !e.ctrlKey) {
        console.log("pan!");
        let tool = new PanTool();
        this.ctx.state.toolstack.execTool(tool);
        window.redraw_viewport();
      } else if (docontrols && e.ctrlKey && !e.shiftKey) {
        console.log("zoom!");
        let tool = new ZoomTool();
        this.ctx.state.toolstack.execTool(tool);
        window.redraw_viewport();
      }

      this.pop_ctx_active();
    });

    window.redraw_viewport();
  }

  getLocalMouse(x, y) {
    let r = this.getClientRects()[0];
    let dpi = UIBase.getDPI();

    x = (x - r.x); // dpi;
    y = (y - r.y); // dpi;

    return [x, y];
  }

  update() {
    super.update();

    this.push_ctx_active();

    if (this._last_selectmode !== this.selectmode) {
      this._last_selectmode = this.selectmode;
      window.redraw_viewport()
    }

    this.pop_ctx_active();
  }

  makeGrid() {
    let mesh = new SimpleMesh(LayerTypes.LOC|LayerTypes.UV|LayerTypes.COLOR);
    
    let d = 3;
    //let quad = mesh.quad([-d, -d, 0], [-d, d, 0], [d, d, 0], [d, -d, 0]);
    //quad.colors(clr, clr, clr, clr);
    
    let steps = 32;
    let sz = 8.0;
    let csize = sz / steps*2.0;
    let t = -sz;
    
    for (let i=0; i<steps+1; i++, t += csize) {
      let d=0.8;
      if (i % 8 == 0) d = 0.3;
      else if (i % 4 == 0.0) d = 0.6;
      else if (i % 2 == 0.0) d = 0.7;
      let clr = [d, d, d, 1.0];
      
      let line = mesh.line([-sz, t, 0.0], [sz, t, 0.0]);
      
      line.colors(clr, clr);
      line.uvs([-1, -1], [1, 1]);
      
      line = mesh.line([t, -sz, 0.0], [t, sz, 0.0]);
      
      line.colors(clr, clr);
      line.uvs([-1, -1], [1, 1]);
    }
    
    return mesh;
  }
  
  setCSS() {
    super.setCSS();
  }
  
  on_resize(newsize) {
    super.on_resize(newsize);
    
    this.setCSS();
    window.redraw_viewport();
  }

  _testCamera() {
    let th = this.T;
    
    this.camera.pos = new Vector3([Math.cos(th)*20, Math.sin(th)*20, Math.cos(th*2.0)*15.0]);
    this.camera.target = new Vector3([0, 0, 0.0*Math.cos(th*2.0)*5.0]);
    this.camera.up = new Vector3([0, 0, 1]);
    this.camera.up.normalize();
    this.camera.near = 0.01;
    this.camera.far = 10000.0;
    
    this.T += 0.01;
  }

  getSelectBuffer(ctx) {
    //XXX should make use of scene's onSelect output slot to trigger
    //updates for this

    this.selectbuf.dirty();
    return this.selectbuf;

    for (let ob of ctx.selectedMeshObjects) {
      let mesh = ob.mesh;

      if (!this.meshcache.has(mesh.lib_id) || this.meshcache.get(mesh.lib_id).gen !== mesh.updateGen) {
        this.selectbuf.dirty();
        break;
      }
    }
    return this.selectbuf;
  }

  viewportDraw() {
    this.push_ctx_active();
    this.viewportDraw_intern();
    this.pop_ctx_active();
  }

  viewportDraw_intern() {
    if (this.ctx === undefined || this.gl === undefined || this.size === undefined) {
      return;
    }
    
    let scene = this.ctx.scene;
    
    //make sure dependency graph is up to date
    scene.exec();
    
    let gl = this.gl;
    let dpi = this.canvas.dpi;//UIBase.getDPI();

    let x = this.pos[0]*dpi, y = this.pos[1]*dpi;
    let w = this.size[0]*dpi, h = this.size[1]*dpi;
    //console.log("DPI", dpi);

    this.glPos = new Vector2([~~x, ~~y]);
    this.glSize = new Vector2([~~w, ~~h]);

    gl.viewport(~~x, ~~y, ~~w, ~~h);
    gl.scissor(~~x, ~~y, ~~w, ~~h);

    gl.clearColor(0.8, 0.8, 1.0, 1.0);
    gl.clearDepth(100000);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);

    gl.enable(gl.SCISSOR_TEST);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(1);

    //console.log(this.size);
    let aspect = this.size[0] / this.size[1];
    this.camera.regen_mats(aspect);

    //this._testCamera();
    //window.redraw_viewport();

    if (this.grid !== undefined) {
      //console.log("drawing grid");
      
      this.grid.program = view3d_shaders.Shaders.BasicLineShader;
      
      this.grid.uniforms.projectionMatrix = this.camera.rendermat;
      this.grid.draw(gl);
    }

    for (let ed of this.editors) {
      ed.on_drawstart(gl);
    }

    this.drawObjects();

    for (let ed of this.editors) {
      ed.on_drawend(gl);
    }
  }
  
  drawObjects() {
    let scene = this.ctx.scene, gl = this.gl;
    let program = view3d_shaders.Shaders.BasicLitMesh;
    let camera = this.camera;
    
    let uniforms = {
      projectionMatrix : camera.rendermat,
      normalMatrix     : camera.normalmat
    };
    
    for (let ob of scene.objects.visible) {
      if (ob.data === undefined || !(ob.data instanceof Mesh)) {
        ob.draw(gl, uniforms, program);
        continue;
      }

      let ok = false;

      uniforms.objectMatrix = ob.outputs.matrix.getValue();

      for (let ed of this.editors) {
        //console.log(ed);
        if (ed.draw(gl, uniforms, program, ob, ob.data)) {
          ok = true;
          break;
        }
      }

      //no editors drew the objects
      if (!ok) {
      //  ob.draw(gl, uniforms, program);
      }
    }
  }
  
  copy() {
    let ret = document.createElement("view3d-editor-x");
    
    ret.camera = this.camera.copy();
    ret.selectmode = this.selectmode;
    ret.drawmode = this.drawmode;
    
    return ret;
  }
  
  static define() {return {
    tagname : "view3d-editor-x",
    areaname : "view3d",
    uiname   : "Viewport",
    icon     : -1
  }}
};
View3D.STRUCT = STRUCT.inherit(View3D, Editor) + `
  camera      : Camera;
  selectmode  : int;
  drawmode    : int;
  _select_transparent : int;
}
`
Editor.register(View3D);
nstructjs.manager.add_class(View3D);


let animreq = undefined;

let f = () => {
  animreq = undefined;
  let screen = _appstate.screen;
  
  for (let sarea of screen.sareas) {
    if (sarea.area instanceof View3D) {
      sarea.area.viewportDraw();
    }
  }
}

window.redraw_viewport = () => {
  if (animreq !== undefined) {
    return;
  }
  
  animreq = requestAnimationFrame(f);
}

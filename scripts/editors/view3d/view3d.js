import * as util from '../../util/util.js';

import './findnearest/all.js';
import './tools/tools.js';
import * as textsprite from '../../core/textsprite.js';
import {FindNearest} from './findnearest.js';
import {TranslateOp} from './transform_ops.js';
import {RenderEngine} from "../../renderengine/renderengine_base.js";
import {RealtimeEngine} from "../../renderengine/renderengine_realtime.js";
import {Area} from '../../path.ux/scripts/ScreenArea.js';
import {PackFlags} from '../../path.ux/scripts/ui_base.js';
import {Editor} from '../editor_base.js';
import {Camera, init_webgl, ShaderProgram} from '../../core/webgl.js';
import {SelMask} from './selectmode.js';
import '../../path.ux/scripts/struct.js';
import {DrawModes} from './drawmode.js';
let STRUCT = nstructjs.STRUCT;
import {UIBase, color2css, css2color}  from '../../path.ux/scripts/ui_base.js';
import * as view3d_shaders from './view3d_shaders.js';
import {loadShader} from './view3d_shaders.js';
import {SimpleMesh, LayerTypes} from '../../core/simplemesh.js';
import {Vector3, Vector2, Vector4, Matrix4, Quat, Matrix4ToTHREE} from '../../util/vectormath.js';
import {OrbitTool, TouchViewTool, PanTool, ZoomTool} from './view3d_ops.js';
import {cachering, print_stack, time_ms} from '../../util/util.js';
import './tools/mesheditor.js';
import {ObjectEditor} from './tools/selecttool.js';
import {ToolModes, makeToolModeEnum} from './view3d_toolmode.js';
import {Mesh} from '../../mesh/mesh.js';
import {GPUSelectBuffer} from './view3d_select.js';
import {KeyMap, HotKey} from "../editor_base.js";
import {WidgetManager, WidgetTool, WidgetTools} from './widgets.js';
import {MeshCache} from './view3d_toolmode.js';
import {calcTransCenter, calcTransAABB} from './transform_query.js';
import {CallbackNode, NodeFlags} from "../../core/graph.js";
import {DependSocket} from '../../core/graphsockets.js';
import {ConstraintSpaces} from './transform_base.js';
import {eventWasTouch} from '../../path.ux/scripts/simple_events.js';
import {CursorModes, OrbitTargetModes} from './view3d_utils.js';
import {Icons} from '../icon_enum.js';
import {WidgetSceneCursor, NoneWidget} from './widget_tools.js';
import {View3DFlags} from './view3d_base.js';
import {ResourceBrowser} from "../resbrowser/resbrowser.js";
import {AddPointSetOp} from '../../potree/potree_ops.js';
import {PointSet} from '../../potree/potree_types.js';
import {ObjectFlags} from '../../sceneobject/sceneobject.js';
//import {Renderer, Scene} from '../../extern/potree/src/Potree.js'
//import * as Potree from '../../extern/potree/build/potree/potree.js';
import '../../extern/potree/build/potree/potree.js';

let proj_temps = cachering.fromConstructor(Vector4, 32);
let unproj_temps = cachering.fromConstructor(Vector4, 32);
let curtemps = cachering.fromConstructor(Vector3, 32);

//let _gl = undefined;
window._gl = undefined;

export function getWebGL() {
  if (!_gl) {
    initWebGL();
  }

  return _gl;
}

export class ThreeCamera extends THREE.Camera {
  constructor(camera) {
    super();

    this.camera = camera;
    this.uniform_stack = [];
    this.uniforms = {};
  }

  set matrixWorld(val) {
    //do nothing
  }

  set matrixWorldInverse(val) {
    //do nothing;
  }

  set projectionMatrix(val) {
    //do nothing;
  }

  set projectionMatrixInverse(val) {
    //do nothing;
  }

  //for overriding matrixWorld with uniforms.objectMatrix
  pushUniforms(uniforms) {
    this.uniform_stack.push(this.uniforms);
    this.uniforms = uniforms;
  }

  popUniforms() {
    let uniforms = this.uniforms;

    this.uniforms = this.uniform_stack.pop();
    return uniforms;
  }

  set near(val) {
    this.camera.near = val;
    this.camera.regen_mats();
  }

  get near() {
    return this.camera.near;
  }

  set far(val) {
    this.camera.far = val;
    this.camera.regen_mats();
  }

  get far() {
    return this.camera.far;
  }

  get fov() {
    return this.camera.fovy;
  }

  updateProjectionMatrix() {
    this.camera.regen_mats();
    return;
  }

  get isPerspectiveCamera() {
    return true;
  }

  get matrixWorld() {
    if (this.uniforms.objectMatrix) {
      let mat = new Matrix4(this.uniforms.objectMatrix);
      mat.preMultiply(this.camera.cameramat);
      mat.invert();

      return Matrix4ToTHREE(mat);
    }

    //if (this.uniforms.)
    return Matrix4ToTHREE(this.camera.icameramat);
  }

  get matrixWorldInverse() {
    if (this.uniforms.objectMatrix) {
      let mat = new Matrix4(this.uniforms.objectMatrix);
      mat.preMultiply(this.camera.cameramat);

      return Matrix4ToTHREE(mat);
    }

    return Matrix4ToTHREE(this.camera.cameramat);
  }

  /**
   * Okay, a bit of nomenclature difference with three.js here.
   * I like to call the final matrix the projection matrix, while
   * three.js is calling the perspective matrix the projection matrix.
   * */
  get projectionMatrix() {
    return Matrix4ToTHREE(this.camera.persmat);
  }

  get projectionMatrixInverse() {
    return Matrix4ToTHREE(this.camera.ipersmat);
  }

  clone() {
    let ret = new ThreeCamera();
    ret.camera = this.camera.copy();

    return ret;
  }
}

window._getShaderSource = function(shader) {
  let gl = _appstate.ctx.view3d.gl;
  return gl.getExtension('WEBGL_debug_shaders').getTranslatedShaderSource(shader);
};

export function initWebGL() {
  console.warn("initWebGL called");

  let canvas = document.createElement("canvas");
  let dpi = UIBase.getDPI();
  let w, h;

  canvas.style["opacity"] = "1.0";
  canvas.setAttribute("id", "webgl");
  canvas.id = "webgl";

  if (_appstate.screen !== undefined) {
    w = _appstate.screen.size[0];
    h = _appstate.screen.size[1];
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
  
  let gl = _gl = init_webgl(canvas, {});

  var scene = new THREE.Scene();
  var renderer = new THREE.WebGLRenderer({
    canvas: canvas,
    context: _gl,
    alpha: true,
    preserveDrawingBuffer : true,
    logarithmicDepthBuffer : false,
    premultipliedAlpha: false
  });
  renderer.sortObjects = false;

  gl.getExtension("EXT_color_buffer_float");
  gl.getExtension('EXT_frag_depth');
  gl.getExtension('WEBGL_depth_texture');
  
  if (!gl.createVertexArray) {
    //*
    let extVAO = gl.getExtension('OES_vertex_array_object');

    if(!extVAO){
      throw new Error("OES_vertex_array_object extension not supported");
    }

    gl.createVertexArray = extVAO.createVertexArrayOES.bind(extVAO);
    gl.bindVertexArray = extVAO.bindVertexArrayOES.bind(extVAO);
  }
  //*/

  renderer.autoClear = false;

  _appstate.three_scene = scene;
  _appstate.three_render = renderer;

  //renderer.setSize( window.innerWidth, window.innerHeight );

  //_gl.canvas = canvas;
  loadShaders(_gl);
  textsprite.defaultFont.update(_gl);

  canvas.addEventListener("webglcontextrestored", (e) => {
    loadShaders(_gl);

    let datalib = _appstate.ctx.datalib;

    for (let ob of datalib.objects) {
      ob.onContextLost(e);
    }

    for (let sarea of _appstate.screen.sareas) {
      for (let area of sarea.editors) {
        if (area instanceof View3D) {
          area.onContextLost(e);
        }
      }
    }

    textsprite.onContextLost(e);
    textsprite.defaultFont.update(_gl);
  }, false);

}

export function loadShaders(gl) {
  for (let k in view3d_shaders.ShaderDef) {
    view3d_shaders.Shaders[k] = loadShader(gl, view3d_shaders.ShaderDef[k]);
  }
}

export class DrawLine {
  constructor(v1, v2, color=[0,0,0,1]) {
    let a = color.length > 3 ? color[3] : 1.0;

    this.color = new Vector4(color);
    this.color[3] = a;

    this.v1 = new Vector3(v1);
    this.v2 = new Vector3(v2);
  }
}

export class View3D extends Editor {
  constructor() {
    super();

    this._nodes = [];

    this._pobj_map = {};
    this._last_render_draw = 0;
    this.renderEngine = undefined;

    this.flag = View3DFlags.SHOW_CURSOR;

    this.orbitMode = OrbitTargetModes.FIXED;
    this.localCursor3D = new Matrix4();
    this.cursorMode = CursorModes.TRANSFORM_CENTER;

    this._viewvec_temps = cachering.fromConstructor(Vector3, 32);

    this.glPos = [0, 0];
    this.glSize = [512, 512];

    this.T = 0.0;
    this.camera = new Camera();

    this.start_mpos = new Vector2();

    this.drawlines = [];

    this.selectbuf = new GPUSelectBuffer();

    this.camera.pos = new Vector3([20, 0, 10]);
    this.camera.target = new Vector3([0, 0, 0]);

    this._select_transparent = false;
    this._last_selectmode = -1;
    this.transformSpace = ConstraintSpaces.WORLD;

    let n = new Vector3(this.camera.pos).sub(this.camera.target);
    this.camera.up = new Vector3([0, 0, -1]).cross(n).cross(n);
    this.camera.up.normalize();
    
    this.camera.near = 0.01;
    this.camera.far = 10000.0;
    this.camera.fovy = 50.0;

    this.drawmode = DrawModes.TEXTURED;
    this.threeCamera = new ThreeCamera(this.camera);
  }

  get cursor3D() {
    if (this.flag & View3DFlags.LOCAL_CURSOR) {
      return this.localCursor3D;
    }

    if (this.ctx !== undefined && this.ctx.scene !== undefined) {
      return this.ctx.scene.cursor3D;
    }

    return this.localCursor3D;
  }

  get selectmode() {
    return this.ctx.selectMask;
  }

  updateClipping() {
    if (this.ctx === undefined || this.ctx.scene === undefined) {
      return;
    }

    let min = new Vector3();
    let max = new Vector3();
    let first = true;

    for (let ob of this.ctx.scene.objects) {
      let bbox = ob.getBoundingBox();
      if (bbox === undefined) {
        continue;
      }

      if (first) {
        min.load(bbox[0]);
        max.load(bbox[1]);
      } else {
        min.min(bbox[0]);
        max.max(bbox[1]);
      }
    }

    max.sub(min);

    let size = Math.max(Math.max(Math.abs(max[0]), Math.abs(max[1])), Math.abs(max[2]));
    size = Math.max(size, this.camera.pos.vectorDistance(this.camera.target));

    let clipend = Math.max(size*15, 5000);
    let clipstart = clipend*0.0001 + 0.001;

    console.log(clipstart, clipend);

    this.camera.near = clipstart;
    this.camera.far = clipend;
  }

  set selectmode(val) {
    console.warn("setting selectmode", val);
    this.ctx.scene.selectMask = val;
  }

  get widgets() {
    return this.ctx.scene.widgets;
  }

  onFileLoad(is_active) {
    window.setTimeout(() => {
      this.deleteGraphNodes();

      if (is_active) {
        this.makeGraphNodes();
      }
    }, 10);
  }

  makeGraphNodes() {
    let ctx = this.ctx;
    let scene = ctx.scene;

    if (scene === undefined) {
      return;
    }

    if (this._nodes.length > 0) {
      this.deleteGraphNodes();
    }

    this._graphnode = CallbackNode.create("view3d", () => {}, {},
      {
        onDrawPre: new DependSocket("onDrawPre"),
        onDrawPost: new DependSocket("onDrawPre")
      });

    this.addGraphNode(this._graphnode);

    let node = CallbackNode.create("toolmode change", () => {
      console.log("toolmode change detected");
      this.rebuildHeader();
    }, {
      onToolModeChange : new DependSocket("onToolModeChange")
    }, {});

    this.addGraphNode(node);

    node.inputs.onToolModeChange.connect(scene.outputs.onToolModeChange);
  }

  addGraphNode(node) {
    this._nodes.push(node);
    this.ctx.graph.add(node);
  }

  remGraphNode(node) {
    if (this._nodes.indexOf(node) >= 0) {
      this._nodes.remove(node);
      this.ctx.graph.remove(node);
    }
  }

  deleteGraphNodes() {
    for (let node of this._nodes) {
      try {
        let graph = this.ctx.graph;
        if (graph.has(node)) {
          graph.remove(node);
        }
      } catch (error) {
        util.print_stack(error);
        console.log("failed to delete graph node");
      }
    }

    this._nodes = [];
  }

  getKeyMaps() {
    let ret = [];

    if (this.ctx.toolmode !== undefined) {
      ret = ret.concat(this.ctx.toolmode.getKeyMaps());
    }

    ret.push(this.keymap);

    return ret;
  }

  viewSelected(ob=undefined) {
    //let cent = this.getTransCenter();
    let cent = new Vector3();
    let aabb;

    if (ob === undefined) {
      if (this.ctx.scene !== undefined) {
        let toolmode = this.ctx.scene.toolmode;

        if (toolmode !== undefined) {
          aabb = toolmode.getViewCenter();
        }
      }

      if (aabb === undefined) {
        aabb = this.getTransBounds();
      }
    } else {
      aabb = ob.getBoundingBox();
    }

    console.log("v3d aabb ret", aabb[0], aabb[1]);

    let is_point = aabb[0].vectorDistance(aabb[1]) === 0.0;

    if (aabb[0].vectorDistance(aabb[1]) === 0.0 && aabb[0].dot(aabb[0]) === 0.0) {
      cent.zero();
      cent.multVecMatrix(this.cursor3D);
    } else {
      cent.load(aabb[0]).interp(aabb[1],  0.5);
    }

    let dis = 0.001;

    for (let i=0; i<3; i++) {
      let d = aabb[1][i] - aabb[0][i];
      dis = Math.max(dis, d);
    }

    dis *= Math.sqrt(3.0)*1.25;

    if (cent === undefined) {
      cent = new Vector3();
      cent.multVecMatrix(this.cursor3D);
    }

    let off = new Vector3(cent).sub(this.camera.target);

    this.camera.target.add(off);
    this.camera.pos.add(off);

    if (this.camera.pos.vectorDistance(this.camera.target) == 0.0) {
      this.camera.pos.addScalar(0.5);
    }
    this.camera.regen_mats();

    /*
    comment: in camera space;

    dx := 0.0;
    dy := 0.0;
    dz := 1.0;

    ex := dx*dis + size;
    ey := dy*dis;
    ez := dz*dis;

    f1 := atan(ex / ez) - fov;

    solve(f1, dis);
    */

    let fov = Math.PI * this.camera.fovy / 180;

    let pos = new Vector3(this.camera.pos);
    let up = new Vector3(this.camera.up);
    let target = new Vector3(this.camera.target);


    //dis = Math.abs(Math.tan(fov)*dis);
    dis = Math.abs(dis / Math.tan(fov));
    //console.log("DIS", dis);

    dis = dis == 0.0 ? 0.005 : dis;
    if (!is_point) {
      this.camera.pos.sub(this.camera.target).normalize().mulScalar(dis).add(this.camera.target);
    }

    this.updateClipping();

    this.camera.regen_mats();
    this.onCameraChange();
    window.redraw_viewport();
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("G", [], "view3d.translate()"),
      new HotKey("S", [], "view3d.scale()"),
      new HotKey("W", [], "mesh.vertex_smooth()"),
      new HotKey(".", [], "view3d.view_selected()")
    ]);


    return this.keymap;
  }

  get select_transparent() {
    if (!(this.drawmode & (DrawModes.SOLID|DrawModes.TEXTURED)))
      return true;
    return this._select_transparent;
  }

  getViewVec(localX, localY) {
    let co = this._viewvec_temps.next();

    co[0] = localX;
    co[1] = localY;
    co[2] = -this.camera.near - 0.001;

    this.unproject(co);

    co.sub(this.camera.pos).normalize();
    return co;
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

    let w = tmp[3];

    tmp[0] = (tmp[0]*0.5 + 0.5) * this.size[0];
    tmp[1] = (1.0-(tmp[1]*0.5+0.5)) * this.size[1];
    
    for (let i=0; i<co.length; i++) {
      co[i] = tmp[i];
    }
    
    return w;
  }
  
  unproject(co) {
    let tmp = unproj_temps.next().zero();
    
    tmp[0] = (co[0]/this.size[0])*2.0 - 1.0;
    tmp[1] = (1.0 - co[1]/this.size[1])*2.0 - 1.0;
     
    if (co.length > 2) {
      tmp[2] = co[2];
    }

    if (co.length > 3) {
      tmp[3] = co[3];
    } else {
      tmp[3] = 1.0;
    }

    tmp.multVecMatrix(this.camera.irendermat);

    let w = tmp[3];

    if (tmp[3] != 0.0) {
      tmp[0] /= tmp[3];
      tmp[1] /= tmp[3];
      tmp[2] /= tmp[3];
    }
    
    for (let i=0; i<co.length; i++) {
      co[i] = tmp[i];
    }
    
    return w;
  }

  setCursor(mat) {
    this.cursor3D.load(mat);

    let p = curtemps.next().zero();
    p.multVecMatrix(mat);

    if (this.orbitMode == OrbitTargetModes.CURSOR) {
      let redraw = this.camera.target.vectorDistance(p) > 0.0;

      this.camera.target.load(p);

      if (redraw) {
        window.redraw_viewport();
      }
    }
    //this.camera.orbitTarget.load(p);
  }

  rebuildHeader() {
    if (this.ctx === undefined) {
      this.doOnce(this.rebuildHeader);
      return;
    }

    if (this.header !== undefined) {
      this.header.remove();
    }

    //this.makeHeader(this.container);
    this.header = this.container.col();
    this.header.style["width"] = "min-content";
    this.container.style["width"] = "min-content";
    this.header.style["margin-left"] = "75px";

    this.header.useIcons();

    let header = this.header;

    let rows = header.col();

    header = rows.row();
    let row1 = header.row();
    let row2 = header.row();

    row1.iconbutton(Icons.OPEN_FILE, "Add Pointset", () => {
      ResourceBrowser.openResourceBrowser(this, "pointset").then((res) => {
        let op = new AddPointSetOp();
        op.inputs.url.setValue(res.url);

        this.ctx.api.execTool(this.ctx, op);
      });

    });

    //row2.label("yay");
    row2.prop("view3d.flag[SHOW_RENDER]");
    //row2.prop("view3d.flag[ONLY_RENDER]");

    let makeRow = () => {
      return rows.row();
    };

    let toolmode = this.ctx.toolmode;

    if (toolmode !== undefined) {
      toolmode.constructor.buildHeader(header, makeRow);
    } else {
      this.doOnce(this.rebuildHeader);
    }

    header = row1;

    let strip;

    strip = header.strip();
    //header.tool("mesh.subdivide_smooth()", PackFlags.USE_ICONS);
    strip.tool("view3d.view_selected()", PackFlags.USE_ICONS);

    strip.iconbutton(Icons.UNDO, "Undo", () => {
      this.ctx.toolstack.undo();
      window.redraw_viewport();
    });

    strip.iconbutton(Icons.REDO, "Redo", () => {
      this.ctx.toolstack.redo();
      window.redraw_viewport();
    });


    strip = header.strip();
    strip.useIcons();
    strip.prop("view3d.flag[SHOW_GRID]");

    //strip.prop("scene.toolmode[pan]");
    //strip.prop("scene.toolmode[object]");

    //header.prop("mesh.flag[SUBSURF]", PackFlags.USE_ICONS);
    //strip.tool("light.new(position='cursor')", PackFlags.USE_ICONS);

    //header.iconbutton(Icons.VIEW_SELECTED, "Recenter View (fixes orbit/rotate problems)", () => {
    //  this.viewSelected();
    //});

    this.setCSS();

  }

  init() {
    super.init();

    this.overdraw = document.createElement("overdraw-x");
    this.overdraw.ctx = this.ctx;
    //this.overdraw.zindex_base = 5;

    this.overdraw.startNode(this, this.ctx.screen);
    this.overdraw.remove();
    this.shadow.appendChild(this.overdraw);

    let eventdom = this; //this.overdraw;

    this.makeGraphNodes();
    this.rebuildHeader();

    let uiHasFocus = (e) => {

      let node = this.getScreen().pickElement(e.pageX, e.pageY);

      //console.log(e.pageX, e.pageY, node);
      return node !== this && node !== this.overdraw;
    };

    let on_mousemove = (e, was_mousemove=true) => {
      /*
      if (this.overdraw !== undefined) {
        let r = this.getLocalMouse(e.x, e.y);

        this.overdraw.clear();
        this.overdraw.text("Test!", r[0], r[1]);
      }//*/

      if (uiHasFocus(e)) {
        return;
      }

      let was_touch = eventWasTouch(e);

      if (this.canvas === undefined)
        return;

      this.push_ctx_active();

      let r = this.getLocalMouse(e.x, e.y);
      let x = r[0], y = r[1];
      //console.log(r, e.y, "bleh");

      this.widgets.on_mousemove(e, x, y, was_touch);
      this.pop_ctx_active();
    };

    eventdom.addEventListener("mousemove", on_mousemove);

    eventdom.addEventListener("mouseup", (e) => {
      let was_touch = eventWasTouch(e);

      let ctx = this.ctx;
      this.push_ctx_active(ctx);

      if (this.mdown) {
        this.mdown = false;
      }
      this.pop_ctx_active(ctx);
    });

    let on_mousedown = (e) => {
      if (uiHasFocus(e)) {
        return;
      }
      let was_touch = eventWasTouch(e);

      //if (was_touch) {
        //on_mousemove(e, false);
      //}

      let r = this.getLocalMouse(e.clientX, e.clientY);
      let x = r[0], y = r[1];

      if (this.widgets.on_mousedown(e, x, y, was_touch)) {
        this.pop_ctx_active();
        return;
      }

      this.push_ctx_active();

      this.updateCursor();

      let docontrols = e.button == 1 || e.button == 2 || e.altKey;

      if (!docontrols && e.button == 0) {
        let selmask = this.ctx.selectMask;

        docontrols = true;

        this.mdown = true;
      }

      this.start_mpos = new Vector2(r);

      if (docontrols) {
        this.mdown = false;
      }

      //console.log("touch", eventWasTouch(e), e);
      if (docontrols && eventWasTouch(e)) {
        console.log("multitouch view tool");

        let tool = new TouchViewTool();
        this.ctx.state.toolstack.execTool(tool);
        window.redraw_viewport();
      } else if (docontrols && !e.shiftKey && !e.ctrlKey) {
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
      e.preventDefault();
      e.stopPropagation();
    };

    eventdom.addEventListener("mousedown", on_mousedown);

    window.redraw_viewport();
  }

  glInit() {
    if (this.gl !== undefined) {
      return;
    }

    this.gl = getWebGL();
    this.canvas = this.gl.canvas;
    this.grid = this.makeGrid();
  }

  getTransBounds() {
    return calcTransAABB(this.ctx, this.ctx.selectMask);
  }

  getTransCenter() {
    return calcTransCenter(this.ctx, this.ctx.selectMask, this.transformSpace);
  }

  getLocalMouse(x, y) {
    let r = this.getClientRects()[0];
    let dpi = UIBase.getDPI();

    //x -= this.pos[0];
    //y -= this.pos[1];

    x = (x - r.x); // dpi;
    y = (y - r.y); // dpi;

    return [x, y];
  }

  _showCursor() {
    let ok = this.flag & View3DFlags.SHOW_CURSOR;
    ok = ok && (this.widget === undefined || this.widget instanceof NoneWidget);

    return ok;
  }

  updateCursor() {
    if (this.cursorMode == CursorModes.TRANSFORM_CENTER) {
      this.cursor3D.makeIdentity();

      let tcent = this.getTransCenter();
      if (tcent === undefined) {
        return;
      }

      tcent = tcent.center;
      this.cursor3D.translate(tcent[0], tcent[1], tcent[2]);

      this.setCursor(this.cursor3D);
    }
  }

  update() {
    if (this.ctx.scene !== undefined) {
      this.ctx.scene.updateWidgets();
    }

    let screen = this.ctx.screen;
    if (this.pos[1] + this.size[1] > screen.size[1]) {
      console.log("view3d is too big");
      screen.on_resize(screen.size);
    }

    //TODO have limits for how many samplers to render
    if (time_ms() - this._last_render_draw > 100) {
      //window.redraw_viewport();
      //this._last_render_draw = time_ms();
    }

    this.push_ctx_active();
    super.update();

    if (this._last_selectmode !== this.ctx.selectMask) {
      this._last_selectmode = this.ctx.selectMask;
      window.redraw_viewport()
    }

    this.pop_ctx_active();

    if (this.renderEngine !== undefined) {
      this.renderEngine.update(this.gl);
    }
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

      let clr = [1.0-d, 1.0-d, 1.0-d, 1.0];
      
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

    //trigger rebuild of renderEngine, if necassary
    if (this.renderEngine !== undefined) {
      let engine = this.renderEngine;
      this.renderEngine = undefined;

      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      engine.destroy(this.gl);
    }

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

  destroy() {
    this.deleteGraphNodes();

    if (this.renderEngine !== undefined) {
      this.renderEngine.destroy(this.gl);
      this.renderEngine = undefined;
    }

    if (this.grid !== undefined) {
      this.grid.destroy(this.gl);
      this.grid = undefined;
    }

    this.gl = undefined;
  }

  on_area_inactive() {
    this.deleteGraphNodes();
    this.destroy();
    this.gl = undefined;
  }

  onCameraChange() {
    this.updatePointClouds();
  }

  on_area_active() {
    super.on_area_active();

    this.glInit();

    this.makeGraphNodes();
  }

  viewportDraw() {
    this.overdraw.clear();

    if (!this.gl) {
      this.glInit();
    }

    this.push_ctx_active();
    this.viewportDraw_intern();
    this.pop_ctx_active();
  }

  resetRender() {
    if (this.renderEngine !== undefined) {
      this.renderEngine.resetRender();
    }
  }

  drawRender() {
    let gl = this.gl;

    if (this.renderEngine === undefined) {
      this.renderEngine = new RealtimeEngine(this);
    }

    this.renderEngine.render(this.camera, this.gl, this.glPos, this.glSize, this.ctx.scene);
  }

  drawThreeScene() {
    this.threeCamera.camera = this.camera;
    this.threeRenderer = this.ctx.state.three_render;

    this.threeRenderer.setViewport(this.glPos[0], this.glPos[1], this.glSize[0], this.glSize[1]);

    let state = this.ctx.state;
    let scene3 = state.three_scene;
    let render3 = state.three_render;
    let scene = this.ctx.scene;

    if (this.pRenderer === undefined) {
      this.pRenderer = new Potree.Renderer(render3);
    }

    render3.render(scene3, this.threeCamera);
  }

  updatePointClouds() {
    /*
    let scene = this.ctx.scene;

    for (let ob of scene.objects) {
      if (ob.data instanceof PointSet && ob.data.ready) {
        //
      }
    }
    //*/
  }

  onContextLost(e) {
    if (this.drawline_mesh !== undefined) {
      this.drawline_mesh.onContextLost(e);
    }

    this.widget.onContextLost(e);

    if (this.grid !== undefined) {
      this.grid.onContextLost(e);
    }
  }

  viewportDraw_intern() {
    if (this.ctx === undefined || this.gl === undefined || this.size === undefined) {
      return;
    }

    if (this._graphnode === undefined) {
      this.makeGraphNodes();
    }

    this._graphnode.outputs.onDrawPre.update();

    //force graph execution
    window.updateDataGraph(true);

    let scene = this.ctx.scene;

    let gl = this.gl;
    let dpi = this.canvas.dpi;//UIBase.getDPI();

    let x = this.pos[0]*dpi, y = this.pos[1]*dpi;
    let w = this.size[0]*dpi, h = this.size[1]*dpi;
    //console.log("DPI", dpi);

    let screen = this.ctx.screen;
    let rect = screen.getClientRects();
    y = rect.height - y;

    this.glPos = new Vector2([~~x, ~~y]);
    this.glSize = new Vector2([~~w, ~~h]);

    gl.enable(gl.SCISSOR_TEST);
    gl.viewport(~~x, ~~y, ~~w, ~~h);
    gl.scissor(~~x, ~~y, ~~w, ~~h);

    //if (this.flag & (View3DFlags.SHOW_RENDER|View3DFlags.ONLY_RENDER)) {
      gl.clearColor(0.15, 0.15, 0.15, 1.0);
    //} else {
    //  gl.clearColor(0.8, 0.8, 1.0, 1.0);
    //}
    //gl.clearColor(1.0, 1.0, 1.0, 0.0);

    gl.clearDepth(this.camera.far+1);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    //console.log(this.size);
    let aspect = this.size[0] / this.size[1];
    this.camera.regen_mats(aspect);

    //console.log("viewport draw start");

    //this.drawThreeScene();
    //return;

    //this._testCamera();
    //window.redraw_viewport();

    let drawgrid = this.flag & View3DFlags.SHOW_GRID;

    if (this.grid !== undefined && drawgrid) {
      //console.log("drawing grid");
      
      this.grid.program = view3d_shaders.Shaders.BasicLineShader;
      
      this.grid.uniforms.projectionMatrix = this.camera.rendermat;
      this.grid.draw(gl);
    }

    if (scene.toolmode) {
      scene.toolmode.on_drawstart(gl, this);
    }


    //for (let ed of this.editors) {
    //  ed.on_drawstart(gl);
    //}

    if (this.flag & (View3DFlags.SHOW_RENDER|View3DFlags.ONLY_RENDER)) {
      this.drawRender();
    }

    this.drawThreeScene();
    this.drawObjects();

    if (this.drawlines.length > 0) {
      this.drawDrawLines(gl);
    }

    gl.clear(gl.DEPTH_BUFFER_BIT);
    this.widgets.draw(this.gl, this);

    if (scene.toolmode) {
      scene.toolmode.on_drawend(gl, this);
    }

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    let camera = this.camera;

    /*
    textsprite.testDraw(gl, {
      projectionMatrix : camera.rendermat,
      normalMatrix     : camera.normalmat,
      objectMatrix     : new Matrix4(),
      size             : [this.glSize[0], this.glSize[1]],
      shift            : [0, 0],
      polygonOffset    : 0.0,
      aspect           : this.camera.aspect
    });
    //*/

    gl.disable(gl.BLEND);
  }

  drawDrawLines(gl) {
    let sm = this.drawline_mesh = new SimpleMesh(LayerTypes.LOC|LayerTypes.COLOR|LayerTypes.UV);

    for (let dl of this.drawlines) {
      let line = sm.line(dl.v1, dl.v2);

      line.uvs([0, 0], [1.0, 1.0]);
      line.colors(dl.color, dl.color);
    }

    this.drawline_mesh.program = view3d_shaders.Shaders.BasicLineShader;
    this.drawline_mesh.uniforms.projectionMatrix = this.camera.rendermat;
    this.drawline_mesh.uniforms.alpha = 1.0;

    gl.enable(gl.BLEND);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);

    this.drawline_mesh.draw(gl);
    gl.finish();
    gl.depthMask(true);

    this.drawline_mesh.destroy(gl);

  }

  makeDrawLine(v1, v2, color=[0,0,0,1]) {
    if (typeof color == "string") {
      color = css2color(color);
    }

    let dl = new DrawLine(v1, v2, color);

    this.drawlines.push(dl);
    window.redraw_viewport();

    return dl;
  }

  removeDrawLine(dl) {
    if (this.drawlines.indexOf(dl) >= 0) {
      this.drawlines.remove(dl);
    }
  }

  resetDrawLines() {
    this.drawlines.length = 0;
    window.redraw_viewport();
  }

  drawObjects() {
    let scene = this.ctx.scene, gl = this.gl;
    let program = view3d_shaders.Shaders.BasicLitMesh;
    let camera = this.camera;
    
    let uniforms = {
      projectionMatrix : camera.rendermat,
      normalMatrix     : camera.normalmat
    };

    let only_render = this.flag & (View3DFlags.ONLY_RENDER);

    for (let ob of scene.objects.visible) {
      uniforms.objectMatrix = ob.outputs.matrix.getValue();
      uniforms.object_id = ob.lib_id;

      if (only_render) {
        this.threeCamera.pushUniforms(uniforms);
        ob.draw(this, gl, uniforms, program);
        this.threeCamera.popUniforms();

        continue;
      }

      if (scene.toolmode) {
        scene.toolmode.view3d = this;

        this.threeCamera.pushUniforms(uniforms);


        if (scene.toolmode.drawObject(gl, uniforms, program, ob, ob.data)) {
          this.threeCamera.popUniforms();
          continue;
        }

        this.threeCamera.popUniforms();
      }

      uniforms.objectMatrix = ob.outputs.matrix.getValue();
      uniforms.object_id = ob.lib_id;

      //did toolmode not draw the object?
      this.threeCamera.pushUniforms(uniforms);
      ob.draw(this, gl, uniforms, program);
      this.threeCamera.popUniforms();
    }
  }
  
  copy() {
    let ret = document.createElement("view3d-editor-x");

    ret.widgettool = this.widgettool;

    ret._select_transparent = this._select_transparent;
    ret.camera.load(this.camera);
    ret.drawmode = this.drawmode;
    ret.glInit();
    
    return ret;
  }

  loadSTRUCT(reader) {
    reader(this);
    this.threeCamera.camera = this.camera;
  }

  static define() {return {
    has3D    : true,
    tagname  : "view3d-editor-x",
    areaname : "view3d",
    uiname   : "Viewport",
    icon     : -1
  }}
};
View3D.STRUCT = STRUCT.inherit(View3D, Editor) + `
  camera              : Camera;
  transformSpace      : int; 
  drawmode            : int;
  _select_transparent : int;
  cursorMode          : int;
  orbitMode           : int;
  flag                : int;
}
`
Editor.register(View3D);
nstructjs.manager.add_class(View3D);

let animreq = undefined;
let resetRender = 0;
let drawCount = 1;

let f2 = () => {
  let screen = _appstate.screen;
  let resetrender = resetRender;
  resetRender = 0;

  for (let sarea of screen.sareas) {
    let sdef = sarea.area.constructor.define();

    if (sdef.has3D) {
      sarea.area._init();

      if (resetrender && sarea.area instanceof View3D) {
        sarea.area.resetRender();
      }

      sarea.area.viewportDraw();
    }
  }
};

let f = () => {
  animreq = undefined;

  for (let i=0; i<drawCount; i++) {
    f2();
  }
};

window.redraw_viewport = (ResetRender=false, DrawCount=1) => {
  resetRender |= ResetRender ? 1 : 0;
  drawCount = DrawCount;

  if (animreq !== undefined) {
    return;
  }

  animreq = requestAnimationFrame(f);
};

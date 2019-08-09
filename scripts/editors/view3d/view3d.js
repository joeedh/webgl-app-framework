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
import {Vector3, Vector2, Vector4, Matrix4, Quat} from '../../util/vectormath.js';
import {OrbitTool, PanTool, ZoomTool} from './view3d_ops.js';
import {cachering, print_stack, time_ms} from '../../util/util.js';
import './view3d_mesh_editor.js';
import {ObjectEditor} from './view3d_object_editor.js';
import {SubEditors} from './view3d_subeditor.js';
import {Mesh} from '../../mesh/mesh.js';
import {GPUSelectBuffer} from './view3d_select.js';
import {KeyMap, HotKey} from "../editor_base.js";
import {WidgetManager, WidgetTool, WidgetTools} from './widgets.js';
import {MeshCache} from './view3d_subeditor.js';
import {calcTransCenter} from './transform_query.js';
import {CallbackNode, NodeFlags} from "../../core/graph.js";
import {DependSocket} from '../../core/graphsockets.js';
import {ConstraintSpaces} from './transform_base.js';
import {eventWasTouch} from '../../path.ux/scripts/simple_events.js';
import {CursorModes, OrbitTargetModes} from './view3d_utils.js';
import {Icons} from '../icon_enum.js';
import {WidgetSceneCursor, NoneWidget} from './widget_tools.js';
import {View3DFlags} from './view3d_base.js';

let proj_temps = cachering.fromConstructor(Vector4, 32);
let unproj_temps = cachering.fromConstructor(Vector4, 32);
let curtemps = cachering.fromConstructor(Vector3, 32);

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

  canvas.style["opacity"] = "1.0";
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

    this._last_render_draw = 0;
    this.renderEngine = undefined;

    this.flag = View3DFlags.SHOW_CURSOR;

    this.orbitMode = OrbitTargetModes.FIXED;
    this.cursor3D = new Matrix4();
    this.cursorMode = CursorModes.TRANSFORM_CENTER;

    //last widget update time
    this._last_wutime = 0;
    this.widgets = new WidgetManager(this);

    this._viewvec_temps = cachering.fromConstructor(Vector3, 32);

    this.glPos = [0, 0];
    this.glSize = [512, 512];

    this.T = 0.0;
    this.camera = new Camera();

    this.start_mpos = new Vector2();
    this.editors = [];
    for (let cls of SubEditors) {
      this.editors.push(new cls(this));
    }

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
    
    this.selectmode = SelMask.VERTEX;

    //this.widgettool is an enum, built from WidgetTool.getToolEnum()
    this.widgettool = 1; //active widget tool index in WidgetTools
    this.widget = undefined; //active widget instance

    this.drawmode = DrawModes.TEXTURED;
  }

  onFileLoad(is_active) {
    if (is_active) {
      this._graphnode = undefined;
      //this.makeGraphNode(); wait for redraw
    } else {
      this._graphnode = undefined;
    }
  }

  makeGraphNode() {
    let ctx = this.ctx;

    if (this._graphnode !== undefined) {
      if (this.ctx.graph.has(this._graphnode)) {
        this.ctx.graph.remove(this._graphnode);
      }
    }

    this._graphnode = CallbackNode.create("view3d", () => {}, {},
      {
        onDrawPre: new DependSocket("onDrawPre"),
        onDrawPost: new DependSocket("onDrawPre")
      });

    this.ctx.graph.add(this._graphnode);
  }

  getKeyMaps() {
    let ret = [];

    for (let ed of this.editors) {
      let selmask = ed.constructor.define().selmask;

      if (this.selectmode & selmask) {
        ret.push(ed.keymap);
      }
    }

    ret.push(this.keymap);
    return ret;
  }

  viewSelected() {
    let cent = this.getTransCenter();

    if (cent === undefined) {
      cent = new Vector3();
      cent.multVecMatrix(this.cursor3D);
    } else {
      cent = cent.center;
    }

    this.camera.target.load(cent);
    if (this.camera.pos.vectorDistance(this.camera.target) == 0.0) {
      this.camera.pos.addScalar(0.5);
    } else if (this.camera.pos.vectorDistance(this.camera.target) < 0.05) {
      this.camera.pos.sub(this.camera.target).normalize().mulScalar(0.05).add(this.camera.target);
    }

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

  init() {
    super.init();

    this.makeGraphNode();

    for (let ed of this.editors) {
      ed.ctx = this.ctx;
    }

    let header = this.header;
    let row1 = header.row();
    let row2 = header.row();

    //row2.label("yay");
    row2.prop("view3d.flag[SHOW_RENDER]", PackFlags.USE_ICONS);

    header = row1;
    header.prop("view3d.selectmode", PackFlags.USE_ICONS);
    header.prop("view3d.active_tool", PackFlags.USE_ICONS);

    header.tool("mesh.subdivide_smooth()", PackFlags.USE_ICONS);
    header.tool("view3d.view_selected()", PackFlags.USE_ICONS);

    header.iconbutton(Icons.UNDO, "Undo", () => {
      this.ctx.toolstack.undo();
      window.redraw_viewport();
    });

    header.iconbutton(Icons.REDO, "Redo", () => {
      this.ctx.toolstack.redo();
      window.redraw_viewport();
    });

    header.prop("mesh.flag[SUBSURF]", PackFlags.USE_ICONS);
    header.tool("light.new(position='cursor')", PackFlags.USE_ICONS);

    //header.iconbutton(Icons.VIEW_SELECTED, "Recenter View (fixes orbit/rotate problems)", () => {
    //  this.viewSelected();
    //});

    this.setCSS();

    let getSubEditorMpos = (e) => {
      return this.getLocalMouse(e.clientX, e.clientY);
    }

    this.addEventListener("mousemove", (e) => {
      let was_touch = eventWasTouch(e);

      if (this.canvas === undefined)
        return;

      this.push_ctx_active();

      let r = getSubEditorMpos(e);
      let x = r[0], y = r[1];

      if (this.mdown) {
        let dis = this.start_mpos.vectorDistance(r);

        if (dis > 35) {
          this.mdown = false;

          let tool = new TranslateOp(this.start_mpos);
          tool.inputs.selmask.setValue(this.selectmode);

          this.ctx.api.execTool(this.ctx, tool);
        }
      } else {
        if (this.widgets.on_mousemove(x, y, was_touch)) {
          this.pop_ctx_active();
          return;
        }

        for (let ed of this.editors) {
          ed.on_mousemove(this.ctx, x, y, was_touch);
        }
      }

      this.pop_ctx_active();
    });

    this.addEventListener("mouseup", (e) => {
      let was_touch = eventWasTouch(e);

      let ctx = this.ctx;
      this.push_ctx_active(ctx);

      if (this.mdown) {
        this.mdown = false;
      }
      this.pop_ctx_active(ctx);
    });

    this.addEventListener("mousedown", (e) => {
      let was_touch = eventWasTouch(e);
      this.push_ctx_active();

      this.updateCursor();

      let docontrols = e.button == 1 || e.altKey;

      if (!docontrols && e.button == 0) {
        let selmask = this.selectmode;

        let r = getSubEditorMpos(e);
        let x = r[0], y = r[1];

        if (this.widgets.on_mousedown(x, y, was_touch)) {
          this.pop_ctx_active();
          return;
        }

        this.mdown = true;
        for (let ed of this.editors) {
          this.start_mpos = new Vector2(r);

          if (ed.constructor.define().selmask & selmask) {
            ed.clickselect(e, x, y, selmask, was_touch);
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
      e.preventDefault();
      e.stopPropagation();
    });

    window.redraw_viewport();
  }

  glInit() {
    if (this.gl !== undefined) {
      return;
    }

    this.gl = getWebGL();
    this.canvas = this.gl.canvas;
    this.grid = this.makeGrid();
    this.widgets.loadShapes();
  }

  getTransCenter() {
    return calcTransCenter(this.ctx, this.selectmode, this.transformSpace);
  }

  getLocalMouse(x, y) {
    let r = this.getClientRects()[0];
    let dpi = UIBase.getDPI();

    x = (x - r.x); // dpi;
    y = (y - r.y); // dpi;

    return [x, y];
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

  updateWidgets() {
    try {
      this.push_ctx_active(this.ctx);
      this.updateWidgets_intern();
      this.pop_ctx_active(this.ctx);
    } catch (error) {
      print_stack(error);
      console.warn("updateWidgets() failed");
    }

    this.updateCursor();
  }

  _showCursor() {
    let ok = this.flag & View3DFlags.SHOW_CURSOR;
    ok = ok && (this.widget === undefined || this.widget instanceof NoneWidget);

    return ok;
  }

  updateWidgets_intern() {
    if (this._showCursor() && !this.widgets.hasWidget(WidgetSceneCursor)) {
      this.widgets.add(new WidgetSceneCursor());
      window.redraw_viewport();
    }

    //return;
    if (this.ctx === undefined)
      return;

    let tool = WidgetTools[this.widgettool];
    if (tool === undefined) {
      return;
    }

    let valid = tool.validate(this.ctx);

    if (this.widget !== undefined) {
      let bad = !(this.widget instanceof tool) || (this.widget.manager !== this.widgets);
      bad = bad || !valid;

      if (bad) {
        this.widget.destroy(this.gl);
        this.widget = undefined;
      }
    }

    if (this.widget === undefined && valid) {
      this.widget = new tool(this.widgets);

      console.log("making widget instance", this.widget);

      this.widget.create(this.ctx, this.widgets);
    }

    if (this.widget !== undefined) {
      this.widget.update();
    }

    this.widgets.update(this);
  }

  update() {
    super.update();

    //TODO have limits for how many samplers to render
    if (time_ms() - this._last_render_draw > 100) {
      //window.redraw_viewport();
      //this._last_render_draw = time_ms();
    }

    if (time_ms() - this._last_wutime > 50) {
      this.updateWidgets();
      this._last_wutime = time_ms();
    }

    this.push_ctx_active();

    if (this._last_selectmode !== this.selectmode) {
      this._last_selectmode = this.selectmode;
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
    try {
      if (this._graphnode) {
        this.ctx.graph.remove(this._graphnode);
        this._graphnode = undefined;
      }
    } catch (error) {
      print_stack(error);
    }

    for (let ed of this.editors) {
      ed.destroy(this.gl);
    }

    if (this.renderEngine !== undefined) {
      this.renderEngine.destroy(this.gl);
      this.renderEngine = undefined;
    }

    if (this.grid !== undefined) {
      this.grid.destroy(this.gl);
      this.grid = undefined;
    }

    this.widgets.destroy(this.gl);
    this.gl = undefined;
  }

  on_area_inactive() {
    this.destroy();
    this.gl = undefined;
  }

  on_area_active() {
    super.on_area_active();

    this.glInit();
    this.makeGraphNode();

    for (let ed of this.editors) {
      ed.ctx = this.ctx;
    }
  }

  viewportDraw() {
    if (!this.gl) {
      this.glInit();
    }

    this.push_ctx_active();
    this.updateWidgets();
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

  viewportDraw_intern() {
    if (this.ctx === undefined || this.gl === undefined || this.size === undefined) {
      return;
    }

    if (this._graphnode === undefined) {
      this.makeGraphNode();
    }

    this._graphnode.outputs.onDrawPre.update();
    //force graph execution
    window.updateDataGraph(true);

    let scene = this.ctx.scene;
    
    //make sure dependency graph is up to date
    window.updateDataGraph();
    
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

    gl.viewport(~~x, ~~y, ~~w, ~~h);
    gl.scissor(~~x, ~~y, ~~w, ~~h);

    if (this.flag & (View3DFlags.SHOW_RENDER|View3DFlags.ONLY_RENDER)) {
      gl.clearColor(0.5, 0.5, 0.5, 1.0);
    } else {
      gl.clearColor(0.8, 0.8, 1.0, 1.0);
    }
    //gl.clearColor(1.0, 1.0, 1.0, 0.0);

    gl.clearDepth(100000);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);

    gl.enable(gl.SCISSOR_TEST);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

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

    if (this.flag & View3DFlags.SHOW_RENDER) {
      this.drawRender();
    }

    this.drawObjects();

    if (this.drawlines.length > 0) {
      this.drawDrawLines(gl);
    }

    gl.clear(gl.DEPTH_BUFFER_BIT);
    this.widgets.draw(this.gl, this);

    for (let ed of this.editors) {
      ed.on_drawend(gl);
    }
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
    
    for (let ob of scene.objects.visible) {
      uniforms.objectMatrix = ob.outputs.matrix.getValue();

      let draw = !(this.flag & View3DFlags.SHOW_RENDER);
      draw = draw || !(ob.data instanceof Mesh);
      draw = draw && !(this.flag & View3DFlags.ONLY_RENDER);

      if (draw) {
        ob.draw(gl, uniforms, program);
      }

      if (this.flag & View3DFlags.ONLY_RENDER)
        continue;

      let ok = false;
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

    ret.widgettool = this.widgettool;
    ret._select_transparent = this._select_transparent;
    ret.camera = this.camera.copy();
    ret.selectmode = this.selectmode;
    ret.drawmode = this.drawmode;
    
    return ret;
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
  selectmode          : int;
  transformSpace      : int; 
  drawmode            : int;
  _select_transparent : int;
  widgettool          : int;
  cursor3D            : mat4;
  cursorMode          : int;
  orbitMode           : int;
  flag                : int;
}
`
Editor.register(View3D);
nstructjs.manager.add_class(View3D);


let animreq = undefined;
let resetRender = 0;

let f = () => {
  animreq = undefined;
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

window.redraw_viewport = (ResetRender=false) => {
  resetRender |= ResetRender ? 1 : 0;

  if (animreq !== undefined) {
    return;
  }

  animreq = requestAnimationFrame(f);
}

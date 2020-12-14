import {WidgetFlags} from "../widgets/widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {BVH, BVHFlags} from "../../../util/bvh.js";
import {KeyMap, HotKey} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/util/struct.js';
import {TranslateWidget} from "../widgets/widget_tools.js";
import * as util from '../../../util/util.js';

let STRUCT = nstructjs.STRUCT;
import {Loop, Mesh} from '../../../mesh/mesh.js';
import {Shapes} from '../../../core/simplemesh_shapes.js';
import {Shaders} from "../../../shaders/shaders.js";
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../../../util/vectormath.js';
import {
  ToolOp,
  Vec4Property,
  FloatProperty,
  ToolProperty,
  IntProperty,
  BoolProperty,
  EnumProperty,
  FlagProperty,
  FloatArrayProperty,
  math,
  ListProperty,
  PackFlags,
  Curve1D, Curve1DProperty, SplineTemplates, Vec3Property
} from "../../../path.ux/scripts/pathux.js";
import {MeshFlags} from "../../../mesh/mesh.js";
import {SimpleMesh, LayerTypes, PrimitiveTypes} from "../../../core/simplemesh.js";
import {splitEdgesSmart} from "../../../mesh/mesh_subdivide.js";
import {
  GridBase,
  GridSettingFlags,
  QRecalcFlags,
} from "../../../mesh/mesh_grids.js";

let _triverts = new Array(3);

import {
  DynamicsMask, SculptTools, BrushDynamics, SculptBrush,
  BrushDynChannel, DefaultBrushes, SculptIcons, PaintToolSlot, BrushFlags
} from "../../../brush/brush.js";

import './pbvh_sculptops.js';
import './pbvh_base.js';
import './pbvh_texpaint.js';

export class BVHToolMode extends ToolMode {
  constructor(manager) {
    super(manager);

    this.sharedBrushRadius = 55;

    this.gridEditDepth = 2;
    this.enableMaxEditDepth = false;
    this.dynTopoLength = 30;
    this.dynTopoDepth = 4;

    this.mpos = new Vector2();
    this._radius = undefined;

    this.drawFlat = false;
    this.flag |= WidgetFlags.ALL_EVENTS;

    this.tool = SculptTools.CLAY;
    //this.brush = new SculptBrush();
    this.slots = {};

    this._brush_lines = [];

    for (let k in SculptTools) {
      let tool = SculptTools[k];
      this.slots[tool] = new PaintToolSlot(tool);
    }

    this.drawBVH = false;
    this.drawNodeIds = false;
    this.drawWireframe = false;
    this.drawQuadsOnly = false;

    this._last_bvh_key = "";
    this.view3d = manager !== undefined ? manager.view3d : undefined;
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("F", [], "brush.set_radius()"),
      new HotKey(".", [], "view3d.view_selected()")
    ]);
  }

  static buildEditMenu() {
    return ["brush.set_radius()"];
  }

  getBrush(tool = this.tool) {
    if (!this.ctx) {
      return undefined;
    }

    return this.slots[tool].resolveBrush(this.ctx);
  }

  drawBrush(view3d) {
    for (let l of this._brush_lines) {
      l.remove();
    }
    this._brush_lines.length = 0;

    let drawCircle = (x, y, r, mat = new Matrix4(), z = 0.0) => {
      let p = new Vector3(), lastp = new Vector3();
      let steps = Math.max(Math.ceil((Math.PI*r*2)/20), 8);
      let th = -Math.PI, dth = (2.0*Math.PI)/(steps - 1);

      r /= devicePixelRatio;
      let mpos = view3d.getLocalMouse(x, y);
      x = mpos[0];
      y = mpos[1];
      //y -= r * 0.5;

      for (let i = 0; i < steps; i++, th += dth) {
        p[0] = x + Math.cos(th)*r;
        p[1] = y + Math.sin(th)*r;
        p[2] = z;

        p.multVecMatrix(mat);
        if (i > 0) {
          this._brush_lines.push(view3d.overdraw.line(lastp, p, "red"));
        }
        lastp.load(p);
      }
    }

    let brush = this.getBrush();
    if (!brush) {
      return;
    }

    let radius = brush.flag & BrushFlags.SHARED_SIZE ? this.sharedBrushRadius : brush.radius;

    let r = this._radius !== undefined ? this._radius : radius;
    drawCircle(this.mpos[0], this.mpos[1], r);
  }

  static register(cls) {
    ToolModes.push(cls);
    //WidgetTool.register(cls);
  }

  static toolModeDefine() {
    return {
      name        : "bvh",
      uiname      : "bvh test",
      icon        : Icons.FACE_MODE,
      flag        : 0,
      description : "Test bvh",
      selectMode  : SelMask.OBJECT | SelMask.GEOM, //if set, preferred selectmode, see SelModes
      transWidgets: []
    }
  }

  static buildSettings(container) {
    let name = this.toolModeDefine().name;
    let path = `scene.tools.${name}`

    let browser = document.createElement("data-block-browser-x");
    browser.blockClass = SculptBrush;
    browser.setAttribute("datapath", path + ".brush");
    browser.filterFunc = function (brush) {
      if (!browser.ctx) {
        return false;
      }

      let toolmode = browser.ctx.toolmode;
      return brush.tool === toolmode.tool;
    }

    container.add(browser);

    let col = container.col();
    let strip, panel;

    let settings = col.panel("Brush Settings");

    function doChannel(name) {
      let col2 = settings.col().strip();

      //col2.style["padding"] = "7px";
      //col2.style["margin"] = "2px";
      //col2.style["border"] = "1px solid rgba(25,25,25,0.25)";
      //col2.style["border-radius"] = "15px";

      if (name === "radius") {
        col2.prop(path + `.brushRadius`);
      } else {
        col2.prop(path + `.brush.${name}`);
      }

      panel = col2.panel("Dynamics");

      panel._panel.overrideDefault("padding-top", 0);
      panel._panel.overrideDefault("padding-bottom", 0);
      panel.prop(path + `.brush.dynamics.${name}.useDynamics`);
      panel.prop(path + `.brush.dynamics.${name}.curve`);
      panel.closed = true;
      panel.setCSS();
    }

    panel = col.panel("Texture");
    let tex = document.createElement("texture-select-panel-x");

    tex.setAttribute("datapath", path + ".brush.texUser.texture");

    panel.add(tex);

    panel.closed = true;

    panel = col.panel("Falloff");
    let i1 = 1;

    function makebutton(k) {
      panel.button("" + (i1++), () => {
        let curve = panel.ctx.toolmode.getBrush().falloff;
        curve.setGenerator("bspline");

        let bspline = curve.generators.active;
        bspline.loadTemplate(SplineTemplates[k]);
      });
    }

    for (let k in SplineTemplates) {
      makebutton(k);
    }

    panel.prop(path + ".brush.falloff");
    panel.closed = true;

    doChannel("radius");
    doChannel("strength");
    doChannel("autosmooth");

    col.prop(path + ".brush.spacing");
    col.prop(path + ".brush.color");
    col.prop(path + ".brush.bgcolor");

    col.prop(path + ".brush.planeoff");

    strip = col.row();
    strip.useIcons();
    strip.tool("mesh.add_or_subdivide_grids()");
    strip.tool("mesh.reset_grids()");
    strip.tool("mesh.delete_grids()");

    strip = col.strip();
    strip.useIcons(false);
    strip.prop(path + ".dynTopoLength");
    strip.prop(path + ".brush.flag[DYNTOPO]");

    strip = col.row().strip();
    strip.useIcons(false);
    strip.tool("mesh.smooth_grids()");
    strip.tool("mesh.grids_test()");

    panel = col.panel("Multi Resolution");
    panel.useIcons(false);
    panel.prop(path + ".dynTopoDepth").setAttribute("labelOnTop", true);

    strip = panel.strip();
    strip.prop(path + ".enableMaxEditDepth");
    strip.prop(path + ".gridEditDepth");

    panel.tool("mesh.subdivide_grids()");

    //panel
    container.flushUpdate();
  }

  static buildHeader(header, addHeaderRow) {
    super.buildHeader(header, addHeaderRow);

    let name = this.toolModeDefine().name;

    let strip = header.strip();
    strip.prop(`scene.tools.${name}.drawBVH`);
    strip.prop(`scene.tools.${name}.drawFlat`);
    strip.prop(`scene.tools.${name}.drawWireframe`);
    strip.prop(`scene.tools.${name}.drawNodeIds`);

    strip = header.strip();
    strip.useIcons(false);
    strip.prop(`scene.tools.${name}.drawQuadsOnly`);


    let row = addHeaderRow();
    let path = `scene.tools.${name}.brush`

    strip = row.strip();
    //strip.listenum(path + ".tool");
    strip.prop(`scene.tools.${name}.tool`);
    strip.tool("mesh.symmetrize()");

    row = addHeaderRow();
    strip = row.strip();
    strip.prop(path + ".dynamics.radius.useDynamics");
    strip.prop(`scene.tools.${name}.brushRadius`);

    strip.prop(path + ".dynamics.strength.useDynamics");
    strip.prop(path + ".strength");
    strip.prop(path + ".flag[SHARED_SIZE]", PackFlags.HIDE_CHECK_MARKS);

    strip = row.strip();
    strip.pathlabel("mesh.triCount", "Triangles");

    strip.prop(path + ".spacing");

    header.flushUpdate();


  }

  get _brushSizeHelper() {
    let brush = this.getBrush();

    if (!brush) {
      return 55.0;
    }

    if (brush.flag & BrushFlags.SHARED_SIZE) {
      return this.sharedBrushRadius;
    } else {
      return brush.radius;
    }
  }

  set _brushSizeHelper(val) {
    let brush = this.getBrush();

    if (!brush) {
      return 55;
    }

    if (brush.flag & BrushFlags.SHARED_SIZE) {
      this.sharedBrushRadius = val;
    } else {
      brush.radius = val;
    }
  }

  get _apiBrushHelper() {
    return this.getBrush();
  }

  set _apiBrushHelper(brush) {
    if (brush === undefined) {
      return;
    }

    let oldbrush = this.getBrush();
    if (oldbrush === brush) {
      return;
    }

    let scene = this.ctx ? this.ctx.scene : undefined;
    this.slots[this.tool].setBrush(brush, scene);
  }

  static defineAPI(api) {
    let st = super.defineAPI(api);

    st.float("sharedBrushRadius", "sharedBrushRadius", "Shared Radius").noUnits().range(0, 450);
    st.float("_brushSizeHelper", "brushRadius", "Radius").noUnits().range(0, 450).step(1.0);

    function onchange() {
      let pbvh = this.dataref;
      let mesh = pbvh.ctx.mesh;

      if (mesh && mesh.bvh) {
        let bvh = mesh.bvh;
        for (let node of bvh.nodes) {
          if (node.leaf) {
            node.flag |= BVHFlags.UPDATE_DRAW;
            bvh.updateNodes.add(node);
          }
        }

        bvh.update();
      }
    }

    st.bool("drawWireframe", "drawWireframe", "Draw Wireframe")
      .on('change', onchange)
      .icon(Icons.DRAW_SCULPT_WIREFRAME);
    st.bool("drawQuadsOnly", "drawQuadsOnly", "Quad Wireframes")
      .description("Draw multires grid wireframes with quads only")
      .on('change', onchange)
      .icon(Icons.DRAW_SCULPT_WIREFRAME);
    st.bool("drawBVH", "drawBVH", "Draw BVH").on('change', onchange);
    st.bool("drawNodeIds", "drawNodeIds", "Draw BVH Vertex IDs").on('change', onchange);
    st.bool("drawFlat", "drawFlat", "Draw Flat")
      .on('change', onchange)
      .icon(Icons.DRAW_SCULPT_FLAT);
    st.enum("tool", "tool", SculptTools).icons(SculptIcons);
    st.float("dynTopoLength", "dynTopoLength", "Detail Size").range(1.0, 75.0).noUnits();
    st.int("dynTopoDepth", "dynTopoDepth", "DynTopo Depth", "Maximum quad tree grid subdivision level").range(0, 15).noUnits();
    st.bool("enableMaxEditDepth", "enableMaxEditDepth", "Multi Resolution Editing");
    st.int("gridEditDepth", "gridEditDepth", "Edit Depth", "Maximum quad tree grid edit level").range(0, 15).noUnits();

    st.struct("_apiBrushHelper", "brush", "Brush", api.mapStruct(SculptBrush));

    return st;
  }

  getBVH(mesh, useGrids = true) {
    return mesh.bvh ? mesh.bvh : mesh.getBVH(false);
  }

  on_mousemove(e, x, y, was_touch) {
    let ret = super.on_mousemove(e, x, y, was_touch);

    this.mpos[0] = e.x;
    this.mpos[1] = e.y;

    if (this.ctx && this.ctx.view3d) {
      this.drawBrush(this.ctx.view3d)
    }

    return ret;
  }

  on_mousedown(e, x, y) {
    super.on_mousedown(e, x, y);

    this.mpos[0] = e.x;
    this.mpos[1] = e.y;

    if (e.button === 0 && !e.altKey) {
      let brush = this.getBrush();

      let isColor = brush.tool === SculptTools.PAINT || brush.tool === SculptTools.PAINT_SMOOTH;
      let smoothtool = isColor ? SculptTools.PAINT_SMOOTH : SculptTools.SMOOTH;

      let dynmask = 0;

      if (e.shiftKey) {
        brush = this.getBrush(smoothtool);
      }

      if (brush.dynamics.radius.useDynamics) {
        dynmask |= DynamicsMask.RADIUS;
      }
      if (brush.dynamics.strength.useDynamics) {
        dynmask |= DynamicsMask.STRENGTH;
      }
      if (brush.dynamics.autosmooth.useDynamics) {
        dynmask |= DynamicsMask.AUTOSMOOTH;
      }

      let isTexPaint = SculptTools.TEXTURE_PAINT;

      console.log("dynmask", dynmask);

      let radius = brush.flag & BrushFlags.SHARED_SIZE ? this.sharedBrushRadius : brush.radius;

      brush = brush.copy();

      if (e.ctrlKey && !isTexPaint) {
        let t = brush.color;
        brush.color = brush.bgcolor;
        brush.bgcolor = t;
      }
      brush.radius = radius;

      if (brush.tool === SculptTools.TEXTURE_PAINT) {
        this.ctx.api.execTool(this.ctx, "bvh.texpaint()", {
          brush : brush,

        });
      } else {
        this.ctx.api.execTool(this.ctx, "bvh.paint()", {
          brush: brush,

          strength: brush.strength,
          tool    : e.shiftKey ? smoothtool : brush.tool,

          dynamicsMask   : dynmask,
          radiusCurve    : brush.radius.curve,
          strengthCurve  : brush.strength.curve,
          autosmoothCurve: brush.autosmooth.curve,
          falloff        : brush.falloff,

          dynTopoLength   : this.dynTopoLength,
          dynTopoDepth    : this.dynTopoDepth,
          useDynTopo      : brush.flag & BrushFlags.DYNTOPO,
          useMultiResDepth: this.enableMaxEditDepth
        });
      }

      return true;
    }

    window.redraw_viewport();

    return false;
  }

  on_mouseup(e, x, y) {
    super.on_mouseup(e, x, y);

    this.mdown = false;

    return false;
  }

  getMeshMresSettings(mesh) {
    let cd_grid = GridBase.meshGridOffset(mesh);

    if (cd_grid >= 0) {
      return mesh.loops.customData.flatlist[cd_grid].getTypeSettings();
    }

    return undefined;
  }

  updateMeshMres(mesh) {
    let cd_grid = GridBase.meshGridOffset(mesh);

    if (cd_grid < 0) {
      return;
    }

    let mres = this.getMeshMresSettings(mesh);
    let flag = mres.flag;

    if (this.enableMaxEditDepth) {
      flag |= GridSettingFlags.ENABLE_DEPTH_LIMIT;
    } else {
      flag &= ~GridSettingFlags.ENABLE_DEPTH_LIMIT;
    }

    let update = flag !== mres.flag || this.gridEditDepth !== mres.depthLimit;

    mres.depthLimit = this.gridEditDepth;
    mres.flag = flag;

    if (update) {
      console.log("MRES SETTINGS UPDATE");

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];
        grid.update(mesh, l, cd_grid);
      }

      mesh.regenRender();
      mesh.regenBVH();
      mesh.graphUpdate();

      window.redraw_viewport(true);
    }
  }

  update() {
    super.update();

    //hackishly update triangle count
    //in the UI
    if (this.ctx.mesh && this.ctx.mesh.bvh && this.ctx.mesh.bvh.cd_grid >= 0) {
      let mesh = this.ctx.mesh, bvh = mesh.bvh;
      let tottri = 0;
      let cd_grid = bvh.cd_grid;

      for (let l of mesh.loops) {
        let grid = l.customData[cd_grid];

        tottri += grid.totTris;
      }

      mesh.uiTriangleCount = tottri;
    }

    if (!this.ctx || !this.ctx.object || !(this.ctx.object.data instanceof Mesh)) {
      return;
    }

    let key = "" + this.enableMaxEditDepth;
    if (this.enableMaxEditDepth) {
      key += ":" + this.gridEditDepth;
    }

    key += ":" + this.ctx.object.data.lib_id;

    if (key !== this._last_enable_mres) {
      this._last_enable_mres = key;
      console.log(key);

      this.updateMeshMres(this.ctx.object.data);
    }
  }

  destroy() {
  }

  onInactive() {
    for (let l of this._brush_lines) {
      l.remove();
    }
    this._brush_lines = [];

    if (!this.ctx || !this.ctx.object) {
      return;
    }
    let ctx = this.ctx;

    super.onInactive();

    let ob = ctx.object;
    if (ob.data instanceof Mesh && ob.data.bvh) {
      ob.data.bvh.destroy(ob.data);
      ob.data.bvh = undefined;
    }
  }

  on_drawend(view3d, gl) {
    if (!this.ctx || !this.ctx.scene) {
      return;
    }

    this.drawBrush(view3d);

    let ctx = this.ctx, scene = ctx.scene;

    let uniforms = {
      projectionMatrix: view3d.activeCamera.rendermat,
      objectMatrix    : new Matrix4(),
      object_id       : -1,
      size            : view3d.glSize,
      near            : view3d.activeCamera.near,
      far             : view3d.activeCamera.far,
      aspect          : view3d.activeCamera.aspect,
      polygonOffset   : 0.0,
      color           : [1, 0, 0, 1],
      alpha           : 1.0
    };

    let program = Shaders.WidgetMeshShader;

    let drawNodeAABB = (node, matrix) => {
      if (!node.leaf) {
        for (let c of node.children) {
          drawNodeAABB(c, matrix);
        }

        return;
      }

      matrix = new Matrix4(matrix);
      uniforms.objectMatrix = matrix;

      let size = new Vector3(node.max).sub(node.min);

      let smat = new Matrix4();
      smat.scale(size[0], size[1], size[2]);

      let tmat = new Matrix4();
      tmat.translate(node.min[0] + size[0]*0.5, node.min[1] + size[1]*0.5, node.min[2] + size[2]*0.5);

      matrix.multiply(tmat);
      matrix.multiply(smat);

      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);

      uniforms.objectMatrix.load(matrix);

      let f = node.id*0.1;
      uniforms.color[0] = Math.fract(f*Math.sqrt(3.0));
      uniforms.color[1] = Math.fract(f*Math.sqrt(5.0) + 0.234);
      uniforms.color[2] = Math.fract(f*Math.sqrt(2.0) + 0.8234);
      uniforms.color[3] = 1.0;

      let camera = view3d.activeCamera;
      uniforms.aspect = camera.aspect;
      uniforms.near = camera.near;
      uniforms.far = camera.far;
      uniforms.size = view3d.glSize;

      //console.log(uniforms);

      //ob.data.draw(view3d, gl, uniforms, program, ob);
      Shapes.CUBE.drawLines(gl, uniforms, program);

      //console.log(matrix.toString());
    }

    for (let ob of scene.objects.selected.editable) {
      if (!(ob.data instanceof Mesh)) {
        continue;
      }

      let matrix = new Matrix4(ob.outputs.matrix.getValue());

      uniforms.object_id = ob.lib_id;

      let mesh = ob.data;
      let bvh = this.getBVH(mesh);

      //console.log("BVH", bvh.nodes.length);
      if (this.drawBVH) {
        drawNodeAABB(bvh.root, matrix);
      }
      //console.log("BVH", bvh, Shapes.CUBE);
    }
  }

  /*
  * called for all objects;  returns true
  * if an object if the toolmode drew the object
  * itself
  */
  drawObject(gl, uniforms, program, object, mesh) {
    //return true;
    if (!(this.ctx && this.ctx.object && mesh === this.ctx.object.data)) {
      return false;
    }

    let symflag = mesh.symFlag;
    let axes = [-1];
    for (let i = 0; i < 3; i++) {
      if (symflag & (1<<i)) {
        axes.push(i);
      }
    }

    let drawFlat = this.drawFlat;

    let drawNode = (node, matrix) => {
      if (!node.leaf) {
        for (let c of node.children) {
          drawNode(c, matrix);
        }

        return;
      }

      matrix = new Matrix4(matrix);
      uniforms.objectMatrix = matrix;

      let size = new Vector3(node.max).sub(node.min);

      let smat = new Matrix4();
      smat.scale(size[0], size[1], size[2]);

      let tmat = new Matrix4();
      tmat.translate(node.min[0] + size[0]*0.5, node.min[1] + size[1]*0.5, node.min[2] + size[2]*0.5);

      matrix.multiply(tmat);
      matrix.multiply(smat);

      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);

      uniforms.objectMatrix.load(matrix);
    }

    let ob = object;//let ob = this.ctx.object;
    let bvh = mesh.getBVH(false);

    //*
    for (let node of new Set(bvh.nodes)) {
      if (!node || node.id < 0) {
        continue;
      }

      bvh.checkJoin(node);
    }
    //bvh.update();
    //*/

    let parentoff = bvh.drawLevelOffset;

    let fullDraw = false;

    let grid_off = GridBase.meshGridOffset(mesh);
    let have_grids = grid_off >= 0;
    let white = [1, 1, 1, 1];
    let red = [1, 0, 0, 1];

    let cd_color = -1;
    let have_color;

    let drawkey = "";

    if (have_grids) {
      GridBase.syncVertexLayers(mesh);
      cd_color = mesh.loops.customData.getLayerIndex("color");
      have_color = cd_color >= 0;
    } else {
      cd_color = mesh.verts.customData.getLayerIndex("color");
      have_color = cd_color >= 0;
    }

    drawkey += ":" + cd_color + ":" + object.lib_id + ":" + mesh.lib_id;

    if (drawkey !== this._last_draw_key) {
      console.log("Full draw:", drawkey);

      this._last_draw_key = drawkey;
      fullDraw = true;
    }

    for (let node of bvh.nodes) {
      node.flag &= ~BVHFlags.TEMP_TAG;

      if (fullDraw && node.leaf) {
        node.flag |= BVHFlags.UPDATE_DRAW;
      }
    }

    let drawnodes = new Set();

    for (let node of bvh.nodes) {
      if (!node.leaf) {
        continue;
      }

      let p = node;
      //get parent parentoff levels up

      for (let i = 0; i < parentoff; i++) {
        if (p.flag & BVHFlags.TEMP_TAG) {
          break;
        }

        p = p.parent ? p.parent : p;
        /*
        let p2 = p.parent ? p.parent : p;

        let d;
        let bad = false;

        for (let c of p2.children) {
          if (d === undefined) {
            d = c.subtreeDepth;
          } else {
            bad = bad || c.subtreeDepth !== d;
          }
        }

        if (!bad) {
          p = p2;
        } else {
          break;
        }
        */
      }

      p.flag |= BVHFlags.TEMP_TAG;

      drawnodes.add(p);

      if (node.flag & BVHFlags.UPDATE_DRAW) {
        p.flag |= BVHFlags.UPDATE_DRAW;
      }
    }

    for (let node of new Set(drawnodes)) {
      let p2 = node.parent;
      while (p2) {
        if (p2.flag & BVHFlags.TEMP_TAG) {
          node.flag &= ~BVHFlags.TEMP_TAG;
          p2.flag |= node.flag & BVHFlags.UPDATE_DRAW;
          break;
        }
        p2 = p2.parent;
      }
    }

    let t1 = new Vector3();
    let t2 = new Vector3();
    let t3 = new Vector3();

    let drawBVH = this.drawBVH;
    let drawNodeIds = this.drawNodeIds;
    let puv3 = [0, 0];
    let puv2 = [0, 1];
    let puv1 = [1, 0];

    let drawWireframe = this.drawWireframe;
    let drawQuadsOnly = this.drawQuadsOnly;

    let cd_uv = mesh.loops.customData.getLayerIndex("uv");
    let haveUvs = cd_uv >= 0;

    let tstart = util.time_ms();

    function genNodeMesh(node) {
      if (util.time_ms() - tstart > 15) {
        //return;
      }

      if (node.drawData) {
        node.drawData.reset(gl);
      }

      let lflag = LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV | LayerTypes.NORMAL | LayerTypes.ID;

      lflag |= LayerTypes.CUSTOM;

      let sm = node.drawData;

      //primflag, type, size=TypeSizes[type], name=LayerTypeNames[type]) {

      //let primc1 = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc1");
      //let primc2 = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc2");
      //let primc3 = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc3");

      let primuv;

      if (!sm) {
        sm = new SimpleMesh(lflag);
        primuv = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 2, "primUV").index;
      } else {
        primuv = sm.getDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 2, "primUV").setGLSize(gl.SHORT).setNormalized(true).index;
      }


      let cfrets = util.cachering.fromConstructor(Vector4, 16);
      let colorfilter;

      if (have_grids) {
        colorfilter = function (v, fac = 0.5) {
          let ret = cfrets.next().zero();
          let tot = 0.0;
          fac = 1.0 - fac;

          for (let v2 of v.neighbors) {
            let clr = v2.customData[cd_color].color;
            let w = 1.0;

            tot += w;
            ret.addFac(clr, w);
          }

          if (tot === 0.0) {
            ret.load(v.customData[cd_color].color);
          } else {
            ret.mulScalar(1.0/tot);
            ret.interp(v.customData[cd_color].color, fac);
          }

          return ret;
        }
      } else {
        colorfilter = function (v, fac = 0.5) {
          let ret = cfrets.next().zero();
          let tot = 0.0;
          fac = 1.0 - fac;

          for (let e of v.edges) {
            let v2 = e.otherVertex(v);
            let clr = v2.customData[cd_color].color;
            let w = 1.0;

            tot += w;
            ret.addFac(clr, w);
          }

          if (tot === 0.0) {
            ret.load(v.customData[cd_color].color);
          } else {
            ret.mulScalar(1.0/tot);
            ret.interp(v.customData[cd_color].color, fac);
          }

          return ret;
        }
      }

      let tc1 = new Vector4();
      let tc2 = new Vector4();
      let tc3 = new Vector4();
      tc1[3] = tc2[3] = tc3[3] = 1.0;
      let cd_node = have_grids ? mesh.loops.customData.getLayerIndex("bvh")
                               : mesh.verts.customData.getLayerIndex("bvh");

      function rec(node) {
        if (!node.leaf) {
          for (let c of node.children) {
            rec(c);
          }

          return;
        }

        let n = new Vector3();
        let id = object.lib_id;


        for (let tri of node.uniqueTris) {
          /*
          t1.load(tri.v1);
          t2.load(tri.v2);
          t3.load(tri.v3);


          for (let i=0; i<3; i++) {
            t1[i] += (Math.random()-0.5)*0.05;
            t2[i] += (Math.random()-0.5)*0.05;
            t3[i] += (Math.random()-0.5)*0.05;

          }//*/

          //*
          t1 = tri.v1;
          t2 = tri.v2;
          t3 = tri.v3;
          //*/

          //*
          if (drawWireframe) {
            if (drawQuadsOnly) {
              //sm.line(t1, t2);
              sm.line(t2, t3);
              //sm.line(t3, t1);
            } else {
              sm.line(t1, t2);
              sm.line(t2, t3);
              sm.line(t3, t1);
            }
          }
          //*/

          let tri2 = sm.tri(t1, t2, t3);

          if (haveUvs) {
            let uv1, uv2, uv3;

            if (have_grids) {
              uv1 = t1.customData[cd_uv].uv;
              uv2 = t2.customData[cd_uv].uv;
              uv3 = t3.customData[cd_uv].uv;
            } else {
              let ltris = mesh.loopTris;

              let l1 = ltris[tri.tri_idx];
              let l2 = ltris[tri.tri_idx + 1];
              let l3 = ltris[tri.tri_idx + 2];

              uv1 = l1.customData[cd_uv].uv;
              uv2 = l2.customData[cd_uv].uv;
              uv3 = l3.customData[cd_uv].uv;
            }

            tri2.uvs(uv1, uv2, uv3);
          }
          //n.load(tri.v1.no).add(tri.v2.no).add(tri.v3.no).normalize();

          if (!drawFlat) {
            tri2.normals(tri.v1.no, tri.v2.no, tri.v3.no);
          } else {
            //n.load(tri.no);
            //n.load(tri.v1.no).add(tri.v2.no).add(tri.v3.no).normalize();
            n.load(math.normal_tri(tri.v1, tri.v2, tri.v3));
            tri2.normals(n, n, n);
          }

          tri2.custom(primuv, puv1, puv2, puv3);

          tri2.ids(id, id, id);

          if (drawNodeIds && cd_node >= 0) {
            let node1 = tri.v1.customData[cd_node].node;
            let node2 = tri.v2.customData[cd_node].node;
            let node3 = tri.v3.customData[cd_node].node;

            let id1 = node1 ? node1._id : 0;
            let id2 = node2 ? node2._id : 0;
            let id3 = node3 ? node3._id : 0;

            tc1[0] = Math.fract(id1*3.234344);
            tc2[0] = Math.fract(id2*3.234344);
            tc3[0] = Math.fract(id3*3.234344);

            tc1[1] = tc2[1] = tc3[1] = 0.5;

            tri2.colors(tc1, tc2, tc3);
          } else if (have_color) {
            //*
            let c1 = tri.v1.customData[cd_color].color;
            let c2 = tri.v2.customData[cd_color].color;
            let c3 = tri.v3.customData[cd_color].color;
            //*/

            if (!c1 || !c2 || !c3) {
              let v = !c1 ? tri.v1 : undefined;

              v = !v && !c2 ? tri.v2 : v;
              v = !v && !c3 ? tri.v3 : v;

              let l = v.loopEid;
              l = mesh.eidmap[l];
              if (l && l.eid === v.loopEid) {
                l.customData[bvh.cd_grid].checkCustomDataLayout(mesh);

                console.log(l, l.customData[bvh.cd_grid]);
              }
              console.error("customdata error", c1, c2, c3, tri);
              tri2.colors(red, red, red);
              continue;
            }
            /*
            let c1 = colorfilter(tri.v1);
            let c2 = colorfilter(tri.v2);
            let c3 = colorfilter(tri.v3);
            //*/

            //tri2.custom(primc1, c1, c1, c1);
            //tri2.custom(primc2, c2, c2, c2);
            //tri2.custom(primc3, c3, c3, c3);

            tri2.colors(c1, c2, c3);
          } else {
            tri2.colors(white, white, white);
          }
        }
      }

      //console.log("updating draw data for bvh node", node.id);

      rec(node);
      sm.gen = 0;
      node.drawData = sm;
    }

    let axismat = new Matrix4();

    for (let node of bvh.nodes) {
      if (node.drawData && !(node.flag & BVHFlags.TEMP_TAG)) {
        node.drawData.destroy(gl);
        node.drawData = undefined;
        continue;
      }

      if (node.flag & BVHFlags.TEMP_TAG) {
        let update = node.flag & BVHFlags.UPDATE_DRAW;
        update = update || !node.drawData;

        if (update) {
          genNodeMesh(node);
        }

        if (!node.drawData) {
          continue;
        }

        let f = node.id*0.1*Math.sqrt(3.0);
        f = Math.fract(f*10.0);

        let program2 = Shaders.SculptShader;

        if (!drawBVH) {
          uniforms.uColor = [1, 1, 1, 1];
        } else {
          uniforms.uColor = [f, Math.fract(f*3.23423 + 0.432), Math.fract(f*5.234 + .13432), 1.0];
        }
        uniforms.alpha = 1.0;

        let tex = this.ctx.activeTexture;
        if (tex) {
          let gltex = tex.getGlTex(gl);
          if (gltex) {
            uniforms.texture = gltex;
            uniforms.hasTexture = 1.0;
          } else {
            uniforms.texture = undefined;
            uniforms.hasTexture = 0.0;
          }
        } else {
          uniforms.texture = undefined;
          uniforms.hasTexture = 0.0;
        }

        if (node.drawData.gen === 0) {
          //  uniforms.uColor = [f, f, f, 1.0];
        }

        for (let axis of axes) {
          let oldmat = uniforms.objectMatrix;

          if (axis !== -1) {
            let scale = [1, 1, 1];
            scale[axis] = -1;

            //let imat = new Matrix4(object.outputs.matrix.getValue());
            //let mat2 = new Matrix4(uniforms.objectMatrix);

            //imat.invert();
            //mat2.multiply(imat);

            let mat2 = new Matrix4();
            mat2.scale(scale[0], scale[1], scale[2]);

            mat2.preMultiply(object.outputs.matrix.getValue());

            uniforms.objectMatrix = mat2;

          }

          if (drawWireframe) {
            //uniforms.polygonOffset = window.d || 10.0;
            let off = uniforms.polygonOffset ?? 0.0, old = off;
            off = off !== 0.0 ? off*2.0 : 0.2;

            uniforms.polygonOffset = off;
            node.drawData.drawLines(gl, uniforms, program2);
            uniforms.polygonOffset = old;
          }

          node.drawData.primflag &= ~PrimitiveTypes.LINES;
          node.drawData.draw(gl, uniforms, program2);

          if (drawWireframe) {
            // uniforms.polygonOffset = window.d || 10.0;
            //node.drawData.drawLines(gl, uniforms, program2);
            //uniforms.polygonOffset = 0.0;
          }

          uniforms.objectMatrix = oldmat;
        }

        if (0) {
          uniforms.alpha = 0.5;

          gl.depthMask(false);
          gl.disable(gl.DEPTH_TEST);
          gl.enable(gl.CULL_FACE);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

          node.drawData.draw(gl, uniforms, program2);

          gl.depthMask(true);
          gl.disable(gl.CULL_FACE);
          gl.disable(gl.BLEND);
          gl.enable(gl.DEPTH_TEST);
        }


        gl.disable(gl.CULL_FACE);
        node.drawData.gen++;
      }

      node.flag &= ~(BVHFlags.TEMP_TAG | BVHFlags.UPDATE_DRAW);
    }
    return true;
  }

  dataLink(scene, getblock, getblock_addUser) {
    for (let k in this.slots) {
      this.slots[k].dataLink(scene, getblock, getblock_addUser);
    }

    for (let k in SculptTools) {
      let tool = SculptTools[k];

      if (!(tool in this.slots)) {
        this.slots[tool] = new PaintToolSlot(tool);
      }
    }
  }

  loadSTRUCT(reader) {
    reader(this);
    super.loadSTRUCT(reader);

    //deal with old files
    if (Array.isArray(this.slots)) {
      let slots = this.slots;
      this.slots = {};

      for (let slot of slots) {
        this.slots[slot.tool] = slot;
      }
    }

    //also happens in old files
    if (this.brush) {
      this.tool = this.brush.tool;
      delete this.brush;
    }
  }
}

BVHToolMode.STRUCT = STRUCT.inherit(BVHToolMode, ToolMode) + `
  drawBVH                : bool;
  drawFlat               : bool;
  drawWireframe          : bool;
  drawQuadsOnly          : bool;
  drawNodeIds            : bool;
  dynTopoLength          : float;
  dynTopoDepth           : int;
  gridEditDepth          : int;
  enableMaxEditDepth     : bool;
  tool                   : int;
  slots                  : iterkeys(PaintToolSlot);
  sharedBrushRadius      : float; 
}`;
nstructjs.manager.add_class(BVHToolMode);

ToolMode.register(BVHToolMode);

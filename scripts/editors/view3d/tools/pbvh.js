import './pbvh_bvhdef.js';

import {WidgetFlags} from "../widgets/widgets.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {BVH, BVHFlags, BVHTriFlags} from "../../../util/bvh.js";
import {KeyMap, HotKey} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/util/struct.js';
import {TranslateWidget} from "../widgets/widget_tools.js";
import * as util from '../../../util/util.js';

import '../../../subsurf/subsurf_loop_stencil.js';

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
  Curve1D, Curve1DProperty, SplineTemplates, Vec3Property,
  SplineTemplateIcons
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
  SculptTools, BrushDynamics, SculptBrush,
  BrushDynChannel, DefaultBrushes, SculptIcons, PaintToolSlot, BrushFlags, DynTopoFlags, DynTopoSettings,
  DynTopoOverrides
} from "../../../brush/brush.js";

import './pbvh_holefiller.js';
import './pbvh_sculptops.js';
import './pbvh_base.js';
import './pbvh_texpaint.js';

import {calcConcave, getBVH} from './pbvh_base.js';
import {trianglesToQuads, TriQuadFlags} from '../../../mesh/mesh_utils.js';
import {TetMesh} from '../../../tet/tetgen.js';
import {DispContext} from '../../../mesh/mesh_displacement.js';
import {Texture} from '../../../core/webgl.js';

export class BVHToolMode extends ToolMode {
  constructor(manager) {
    super(manager);

    this.editDisplaced = false;
    this.drawDispDisField = false;
    this.reprojectCustomData = false;

    this.sharedBrushRadius = 55;

    this.gridEditDepth = 2;
    this.enableMaxEditDepth = false;

    this.dynTopo = new DynTopoSettings();
    //this.dynTopo.flag = DynTopoFlags.COLLAPSE | DynTopoFlags.SUBDIVIDE | DynTopoFlags.FANCY_EDGE_WEIGHTS;

    this.mpos = new Vector2();
    this._radius = undefined;

    this.debugSphere = new Vector3();

    this.drawFlat = false;
    this.drawMask = true;
    this._last_cd_mask = -1;

    this.flag |= WidgetFlags.ALL_EVENTS;

    this.tool = SculptTools.CLAY;
    //this.brush = new SculptBrush();
    this.slots = {};

    this._brush_lines = [];

    for (let k in SculptTools) {
      let tool = SculptTools[k];
      this.slots[tool] = new PaintToolSlot(tool);
    }

    this.drawColPatches = false;
    this.symmetryAxes = 1;
    this.drawBVH = false;
    this.drawCavityMap = false;
    this.drawNodeIds = false;
    this.drawWireframe = false;
    this.drawValidEdges = true;

    this._last_bvh_key = "";
    this._last_hqed = "";

    this.view3d = manager !== undefined ? manager.view3d : undefined;

    this._apiDynTopo = new Proxy(this.dynTopo, {
      get: (target, key) => {
        let brush = this.getBrush();

        if (brush && key === "overrideMask") {
          return brush.dynTopo.overrideMask;
        }

        let all = !brush || (brush.dynTopo.overrideMask & DynTopoOverrides.NONE);

        if (all) {
          return this.dynTopo[key];
        }

        if (key !== "flag") {
          let key2 = DynTopoSettings.apiKeyToOverride(key);

          if (!key2) {
            return brush.dynTopo[key];
          }

          let override = DynTopoOverrides[key2];
          override = brush.dynTopo.overrideMask & override;

          if (override) {
            return brush.dynTopo[key];
          } else {
            return this.dynTopo[key];
          }
        } else {
          //create merged flags
          let flag = 0;

          let f1 = this.dynTopo.flag;
          let f2 = brush.dynTopo.flag;
          let oflag = brush.dynTopo.overrideMask;

          for (let k in DynTopoFlags) {
            let f = DynTopoFlags[k];

            if (oflag & f) {
              flag |= f2 & f ? f : 0;
            } else {
              flag |= f1 & f ? f : 0;
            }
          }

          return flag;
        }
      },
      set: (target, key, val) => {
        let brush = this.getBrush();

        let all = !brush || (brush.dynTopo.overrideMask & DynTopoOverrides.NONE);

        if (brush && key === "overrideMask") {
          brush.dynTopo.overrideMask = val;
          return true;
        } else if (all) {
          this.dynTopo[key] = val;
          return true;
        }

        if (key !== "flag") {
          let key2 = DynTopoSettings.apiKeyToOverride(key);

          if (key2 && (brush.dynTopo.overrideMask & DynTopoOverrides[key2])) {
            brush.dynTopo[key] = val;
          } else {
            this.dynTopo[key] = val;
          }
        } else {
          let flag = 0;
          let oflag = brush.dynTopo.overrideMask;

          for (let k in DynTopoFlags) {
            let f = DynTopoFlags[k];
            let dynTopo = oflag & f ? brush.dynTopo : this.dynTopo;

            if (val & f) {
              dynTopo.flag |= f;
            } else {
              dynTopo.flag &= ~f;
            }
          }
        }

        return true;
      }
    });
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

  get _apiInheritDynTopo() {
    let brush = this.getBrush();
    if (!brush) {
      return false;
    }

    return !!(brush.dynTopo.overrideMask & DynTopoOverrides.NONE);
  }

  set _apiInheritDynTopo(v) {
    let brush = this.getBrush();
    if (!brush) {
      return;
    }

    if (v) {
      brush.dynTopo.overrideMask |= DynTopoOverrides.NONE;
    } else {
      brush.dynTopo.overrideMask &= ~DynTopoOverrides.NONE;
    }
  }

  static buildEditMenu() {
    return [
      "brush.set_radius()",
      "paint.clear_mask()"
    ];
  }

  static register(cls) {
    ToolModes.push(cls);
    //WidgetTool.register(cls);
  }

  static toolModeDefine() {
    return {
      name        : "sculpt",
      uiname      : "Sculpt",
      icon        : Icons.SCULPT_MODE,
      flag        : 0,
      description : "Sculpt Mode",
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

    let row = container.row();
    row.add(browser);
    row.useIcons(true);
    row.tool("brush.load_default(dataPath='scene.tools.sculpt.brush')");

    let col = container.col();
    let strip, panel, panel2;

    let settings = col.panel("Brush Settings");
    strip = settings.row().strip().useIcons(false);
    strip.label("Spacing");
    strip.prop(path + ".brush.spacingMode");

    function doChannel(name, panel = settings) {
      let col2 = panel.col().strip();

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

      return col2;
    }

    panel = col.panel("Texture");
    let tex = document.createElement("texture-select-panel-x");

    tex.setAttribute("datapath", path + ".brush.texUser.texture");

    strip = panel.row().strip();
    strip.useIcons(false);

    strip.prop(path + ".brush.texUser.mode");
    strip.prop(path + ".brush.texUser.flag[RAKE]");
    strip.prop(path + ".brush.texUser.flag[FANCY_RAKE]");

    strip = panel.row().strip();
    strip.useIcons(false);
    strip.prop(path + ".brush.texUser.flag[ORIGINAL_CO]");
    strip.prop(path + ".brush.texUser.flag[CONSTANT_SIZE]");

    strip = panel.row().strip();
    strip.useIcons(false);
    strip.prop(path + ".brush.texUser.pinch");

    panel.add(tex);

    panel.closed = true;

    panel = col.panel("Falloff");
    panel.prop(path + ".brush.falloff");

    panel2 = panel.panel("Square Settings")
    panel2.prop(path + ".brush.flag[SQUARE]");
    strip = panel2.row().strip();
    strip.useIcons(false);
    strip.prop(path + ".brush.flag[LINE_FALLOFF]");
    strip.prop(path + ".brush.flag[USE_LINE_CURVE]");
    panel2.prop(path + ".brush.falloff2");
    panel2.closed = true;

    panel.closed = true;

    let p;

    doChannel("radius");
    doChannel("strength");

    p = doChannel("autosmooth");
    p.prop(path + ".brush.flag[MULTIGRID_SMOOTH]");
    p.prop(path + ".brush.flag[PLANAR_SMOOTH]");
    p.prop(path + ".brush.smoothRadiusMul");

    doChannel("smoothProj", p);
    doChannel("autosmoothInflate", p);

    p = doChannel("rake");
    p.prop(path + ".brush.rakeCurvatureFactor");
    p.prop(path + ".brush.flag[CURVE_RAKE_ONLY_POS_X]");

    doChannel("pinch");

    p = doChannel("concaveFilter");
    p.prop(path + ".brush.flag[INVERT_CONCAVE_FILTER]");

    doChannel("sharp");

    col.prop(path + ".brush.flag[INVERT]");
    col.prop(path + ".brush.spacing");
    col.prop(path + ".brush.color");
    col.prop(path + ".brush.bgcolor");

    col.prop(path + ".brush.planeoff");
    col.prop(path + ".brush.normalfac");

    function dfield(con, key) {
      let row = con.row();
      let strip = row.strip(undefined, 4, 0);

      strip.overrideDefault("labelOnTop", false);
      strip.overrideDefault("BoxMargin", 0);
      strip.overrideDefault("margin", 0);
      strip.overrideDefault("BoxRadius", 5);

      let opath = `${path}.dynTopo.overrides[NONE]`;

      let okey = DynTopoSettings.apiKeyToOverride(key);
      //let icon = row.iconcheck(`${path}.dynTopo.overrides[${okey}]`);
      let icon = strip.iconcheck(`${path}.dynTopo.overrides[${okey}]`);
      let ret = strip.prop(`${path}.dynTopo.${key}`);

      icon.iconsheet = 0; //use small icons
      icon.drawCheck = false;

      icon.update.after(() => {
        if (!icon.ctx) {
          return;
        }

        let val = icon.ctx.api.getValue(icon.ctx, opath);

        if ((!!val) !== (!!icon.disabled)) {
          icon.disabled = val;
        }
      });
      /*
      row.update.after(() => {
        let val = !icon.checked;

        if (val !== strip.disabled) {
          strip.disabled = val;
        }
      });
      */

      //strip.prop

      return ret;
    }

    panel = col.panel("DynTopo");
    panel.useIcons(false);
    panel.noMarginsOrPadding();

    panel.prop(path + ".inheritDynTopo");
    dfield(panel, "edgeSize");
    dfield(panel, "flag[ENABLED]");
    dfield(panel, "flag[SUBDIVIDE]");
    dfield(panel, "flag[COLLAPSE]");
    dfield(panel, "flag[ADAPTIVE]");

    dfield(panel, "edgeMode");
    dfield(panel, "spacing");
    dfield(panel, "spacingMode");

    panel2 = panel.panel("Advanced");
    dfield(panel2, "flag[FANCY_EDGE_WEIGHTS]");
    dfield(panel2, "subdivideFactor");
    dfield(panel2, "decimateFactor");
    dfield(panel2, "edgeCount");
    dfield(panel2, "repeat");
    dfield(panel2, "valenceGoal");
    dfield(panel2, "maxDepth");

    dfield(panel2, "subdivMode");

    dfield(panel2, "flag[QUAD_COLLAPSE]");
    dfield(panel2, "flag[ALLOW_VALENCE4]");
    dfield(panel2, "flag[DRAW_TRIS_AS_QUADS]");

    /*
    panel.prop(path + ".inheritDynTopo");
    panel.prop(path + ".dynTopo.edgeSize");
    panel.prop(path + ".dynTopo.flag[ENABLED]");
    strip = panel.strip();

    let row2 = strip.row();
    row2.prop(path + ".dynTopo.flag[SUBDIVIDE]");
    row2.prop(path + ".dynTopo.flag[COLLAPSE]");
    row2.prop(path + ".dynTopo.flag[FANCY_EDGE_WEIGHTS]");

    let panel2 = panel.panel("Advanced");

    panel2.prop(path + ".dynTopo.subdivideFactor");
    panel2.prop(path + ".dynTopo.decimateFactor");
    panel2.prop(path + ".dynTopo.edgeCount");

    strip = panel2.strip()

    row2 = strip.row();
    row2.prop(path + ".dynTopo.flag[QUAD_COLLAPSE]");
    row2.prop(path + ".dynTopo.flag[ALLOW_VALENCE4]");
    row2 = strip.row();
    row2.prop(path + ".dynTopo.flag[DRAW_TRIS_AS_QUADS]");

    panel2.prop(path + ".dynTopo.valenceGoal");
    panel2.prop(path + ".dynTopo.maxDepth").setAttribute("labelOnTop", true);
    */

    panel = col.panel("Multi Resolution");
    panel.useIcons(false);

    strip = panel.row();
    strip.useIcons();
    strip.tool("mesh.add_or_subdivide_grids()");
    strip.tool("mesh.reset_grids()");
    strip.tool("mesh.delete_grids()");

    strip = panel.row().strip();
    strip.useIcons(false);
    strip.tool("mesh.smooth_grids()");
    strip.tool("mesh.grids_test()");

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
    strip.prop(`scene.tools.${name}.drawCavityMap`);
    //strip.prop(`scene.tools.${name}.drawNodeIds`);
    //strip.prop(`scene.tools.${name}.drawColPatches`);
    strip.prop(`scene.tools.${name}.drawMask`);

    strip = header.strip();
    strip.prop(`scene.tools.${name}.editDisplaced`);
    strip.prop(`scene.tools.${name}.drawDispDisField`);

    strip = header.strip();
    strip.useIcons(false);
    strip.prop(`scene.tools.${name}.drawValidEdges`);


    let row = addHeaderRow();
    let path = `scene.tools.${name}.brush`

    strip = row.strip();
    //strip.listenum(path + ".tool");
    strip.prop(`scene.tools.${name}.tool`);
    strip.tool("mesh.symmetrize()");
    strip.prop(`scene.tools.${name}.symmetryAxes`);

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

    row = addHeaderRow();
    strip = row.strip();
    strip.tool("mesh.edgecut()");
    strip.prop(`scene.tools.${name}.reprojectCustomData`);

    header.flushUpdate();
  }

  static defineAPI(api) {
    let st = super.defineAPI(api);

    st.flags("symmetryAxes", "symmetryAxes", {
      X: 1,
      Y: 2,
      Z: 4
    }).icons({
      X: Icons.SYM_X,
      Y: Icons.SYM_Y,
      Z: Icons.SYM_Z
    });

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
        window.redraw_viewport(true);
      }
    }

    st.bool("drawWireframe", "drawWireframe", "Draw Wireframe")
      .on('change', onchange)
      .icon(Icons.DRAW_SCULPT_WIREFRAME);
    st.bool("drawValidEdges", "drawValidEdges", "Valid Edges Only")
      .description("Draw sculpt wireframe with valid edges only,\n instead of all tris")
      .on('change', onchange)
      .icon(Icons.DRAW_SCULPT_WIREFRAME);
    st.bool("drawBVH", "drawBVH", "Draw BVH").on('change', onchange);
    st.bool("drawCavityMap", "drawCavityMap", "Cavity Map").on('change', onchange);
    st.bool("drawMask", "drawMask", "Draw Mask").on('change', onchange);

    st.bool("drawColPatches", "drawColPatches", "Draw Color Patches").on('change', onchange);

    st.bool("drawNodeIds", "drawNodeIds", "Draw BVH Vertex IDs").on('change', onchange);
    st.bool("drawFlat", "drawFlat", "Draw Flat")
      .on('change', onchange)
      .icon(Icons.DRAW_SCULPT_FLAT);
    st.enum("tool", "tool", SculptTools).icons(SculptIcons);

    st.bool("enableMaxEditDepth", "enableMaxEditDepth", "Multi Resolution Editing");
    st.int("gridEditDepth", "gridEditDepth", "Edit Depth", "Maximum quad tree grid edit level").range(0, 15).noUnits();

    st.struct("_apiBrushHelper", "brush", "Brush", api.mapStruct(SculptBrush));

    st.struct("_apiDynTopo", "dynTopo", "DynTopo", api.mapStruct(DynTopoSettings));
    st.bool("_apiInheritDynTopo", "inheritDynTopo", "Inherit Everything");

    st.bool("editDisplaced", "editDisplaced", "Displaced")
      .on('change', onchange);
    st.bool("drawDispDisField", "drawDispDisField", "Draw Dis Field")
      .on('change', onchange);
    st.bool("reprojectCustomData", "reprojectCustomData", "Reproject UVs & colors");

    return st;
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("F", [], "brush.set_radius()"),
      new HotKey(".", [], "view3d.view_selected()"),
      new HotKey("M", ["ALT"], "paint.clear_mask()"),
    ]);
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

  getBVH(mesh, useGrids = true) {
    return mesh.bvh ? mesh.bvh : mesh.getLastBVH(false)
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

      let isTexPaint = brush.tool === SculptTools.TEXTURE_PAINT;

      console.log("dynmask", dynmask);

      let radius = brush.flag & BrushFlags.SHARED_SIZE ? this.sharedBrushRadius : brush.radius;

      brush = brush.copy();

      brush.dynTopo.loadDefaults(this.dynTopo);

      if (e.ctrlKey && !isTexPaint) {
        let t = brush.color;
        brush.color = brush.bgcolor;
        brush.bgcolor = t;
      }
      brush.radius = radius;

      if (brush.tool === SculptTools.BVH_DEFORM) {
        this.ctx.api.execTool(this.ctx, "bvh.bvh_deform()", {
          brush       : brush,
          symmetryAxes: this.symmetryAxes
        });
      } else if (brush.tool === SculptTools.HOLE_FILLER) {
        this.ctx.api.execTool(this.ctx, "bvh.hole_filler()", {
          brush       : brush,
          symmetryAxes: this.symmetryAxes
        });
      } else if (brush.tool === SculptTools.TEXTURE_PAINT) {
        this.ctx.api.execTool(this.ctx, "bvh.texpaint()", {
          brush       : brush,
          symmetryAxes: this.symmetryAxes
        });
      } else {
        this.ctx.api.execTool(this.ctx, "bvh.paint()", {
          brush: brush,

          symmetryAxes       : this.symmetryAxes,
          dynTopoDepth       : brush.dynTopo.maxDepth,
          useMultiResDepth   : this.enableMaxEditDepth,
          reprojectCustomData: this.reprojectCustomData
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

  onActive() {
    /*
    if (!this.ctx || !this.ctx.mesh) {
      return;
    }

    let mesh = this.ctx.mesh;
    let bvh = mesh.getLastBVH(false);

    console.warn("Spatially sorting mesh topology for memory coherence. . .");

    bvh.spatiallySortMesh(mesh);
    window.redraw_viewport(true);
    //*/
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
    if ((ob.data instanceof Mesh || ob.data instanceof TetMesh) && ob.data.bvh) {
      ob.data.bvh.destroy(ob.data);
      ob.data.bvh = undefined;

      if (ob.data instanceof Mesh) {
        ob.data.regenTessellation();
      } else {
        ob.data.regenRender();
        ob.data.regenNormals();
      }
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
      //normalMatrix    : new Matrix4()
      objectMatrix : new Matrix4(),
      object_id    : -1,
      size         : view3d.glSize,
      near         : view3d.activeCamera.near,
      far          : view3d.activeCamera.far,
      aspect       : view3d.activeCamera.aspect,
      polygonOffset: 0.0,
      color        : [1, 0, 0, 1],
      alpha        : 1.0
    };

    let program = Shaders.ObjectLineShader;


    if (1) {
      let co = this.debugSphere;
      let s = 0.1;

      uniforms.objectMatrix.translate(co[0], co[1], co[2]);
      uniforms.objectMatrix.scale(s, s, s);

      Shapes.SPHERE.draw(gl, uniforms, program);
      uniforms.objectMatrix.makeIdentity();
    }

    let drawNodeAABB = (bvh, node, matrix) => {
      if (!node.leaf) {
        for (let c of node.children) {
          drawNodeAABB(bvh, c, matrix);
        }

        return;
      }

      if (node.uniqueTris.size === 0) {
        return;
      }

      matrix = new Matrix4(matrix);
      uniforms.objectMatrix = matrix;

      let size = new Vector3(node.max).sub(node.min);

      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);

      let f = node.id*0.1;
      uniforms.color[0] = Math.fract(f*Math.sqrt(3.0));
      uniforms.color[1] = Math.fract(f*Math.sqrt(5.0) + 0.234);
      uniforms.color[2] = Math.fract(f*Math.sqrt(2.0) + 0.8234);
      uniforms.color[3] = 1.0;

      uniforms.uColor = uniforms.color;

      let camera = view3d.activeCamera;

      uniforms.aspect = camera.aspect;
      uniforms.near = camera.near;
      uniforms.far = camera.far;
      uniforms.size = view3d.glSize;
      uniforms.polygonOffset = 0.0;
      uniforms.opacity = uniforms.alpha = 1.0;

      //console.log(uniforms);

      let white = [1, 1, 1, 1];

      if (bvh.isDeforming) {
        let lf = LayerTypes;
        let lflag = lf.LOC | lf.COLOR;

        let sm = new SimpleMesh(lflag);
        sm.primflag |= PrimitiveTypes.LINES;

        for (let e of node.boxedges) {
          let v1 = new Vector3(e.v1);
          let v2 = new Vector3(e.v2);

          //v1.interp(node.cent, 0.05);
          //v2.interp(node.cent, 0.05);

          let line = sm.line(v1, v2);
          line.colors(white, white);

          //v1.interp(v2, 0.5);
          //line = sm.line(v1, node.cent);
          //line.colors(white, white);

          //line = sm.line(v2, node.cent);
          //line.colors(white, white);
        }

        sm.drawLines(gl, uniforms, program);
        sm.destroy(gl);
      } else {
        let smat = new Matrix4();
        smat.scale(size[0], size[1], size[2]);

        let tmat = new Matrix4();
        tmat.translate(node.min[0] + size[0]*0.5, node.min[1] + size[1]*0.5, node.min[2] + size[2]*0.5);

        matrix.multiply(tmat);
        matrix.multiply(smat);

        uniforms.objectMatrix.load(matrix);

        Shapes.CUBE.drawLines(gl, uniforms, program);
      }

      //uniforms.objectMatrix = new Matrix4();
      //Shapes.CUBE.draw(gl, uniforms, program);
    }

    for (let ob of scene.objects.selected.editable) {
      if (!(ob.data instanceof Mesh) && !(ob.data instanceof TetMesh)) {
        continue;
      }

      let matrix = new Matrix4(ob.outputs.matrix.getValue());

      uniforms.object_id = ob.lib_id;

      let mesh = ob.data;
      let bvh = this.getBVH(mesh);

      //console.log("BVH", bvh.nodes.length);
      if (this.drawBVH) {
        for (let node of bvh.nodes) {
          if (node.leaf) {
            drawNodeAABB(bvh, node, matrix);
          }
        }
        //drawNodeAABB(bvh.root, matrix);
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
    if (!(this.ctx && this.ctx.object && object === this.ctx.object)) {
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
    let bvh;

    //update all normals on first bvh build
    if (!mesh.bvh) {
      bvh = this.getBVH(mesh);

      for (let n of bvh.nodes) {
        if (n.leaf) {
          n.setUpdateFlag(BVHFlags.UPDATE_NORMALS);
        }
      }

      bvh.update();
    } else {
      bvh = this.getBVH(mesh);
    }

    const isDeforming = bvh.isDeforming;
    const cd_node = bvh.cd_node;

    let dynTopo = this._apiDynTopo;

    let hideQuadEdges = false;

    if (mesh instanceof Mesh) {
      hideQuadEdges = !!(dynTopo.flag & DynTopoFlags.DRAW_TRIS_AS_QUADS);

      let key = "" + mesh.lib_id + ":" + hideQuadEdges;
      let update = false;

      if (this._last_hqed !== key) {
        this._last_hqed = key;
        update = true;
      }

      bvh.hideQuadEdges = hideQuadEdges;

      if (update) {
        console.log("hideQuadEdges:", hideQuadEdges);

        let quadflag = MeshFlags.QUAD_EDGE;
        for (let e of mesh.edges) {
          e.flag &= ~quadflag;
        }

        trianglesToQuads(mesh, mesh.faces, TriQuadFlags.DEFAULT | TriQuadFlags.MARK_ONLY);

        for (let node of bvh.nodes) {
          if (!node.leaf) {
            continue;
          }

          node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_INDEX_VERTS;
          bvh.updateNodes.add(node);
        }

        bvh.update();
      }
    }

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

    let sortnodes = bvh.nodes.filter(n => n.leaf);
    sortnodes.sort((a, b) => b.depth - a.depth);

    for (let node of sortnodes) {
      let p = node;

      let ok = node.parent && node.parent.subtreeDepth > node.depth + 1;
      ok = ok || (node.leaf && bvh.isDeforming);

      if (ok) {
        node.flag |= BVHFlags.TEMP_TAG;

        drawnodes.add(node);
        continue;
      }

      if (bvh.isDeforming) {
        continue;
      }

      //go parentoff levels up
      for (let i = 0; i < parentoff; i++) {
        if (!p.parent || (p.flag & BVHFlags.TEMP_TAG)) {
          break;
        }

        p = p.parent;

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
    let puv3 = [0, 0, 0, 0];
    let puv2 = [0, 1, 0, 0];
    let puv1 = [1, 0, 0, 0];

    /*
    on factor;

    procedure tbez(a, b, c, w1, w2);
      w1*a + w2*b + (1.0-w1-w2)*c;

    p1 := tbez(k1, k2, k6, w1, w2);
    p2 := tbez(k2, k3, k4, w1, w2);
    p3 := tbez(k6, k4, k5, w1, w2);

    quad := tbez(p1, p2, p3, w1, w2);

    p1 := tbez(k1,  k2,  k12, w1, w2);
    p2 := tbez(k2,  k3,  k13, w1, w2);
    p3 := tbez(k12, k13, k11, w1, w2);

    p4 := tbez(k3,  k4,  k14, w1, w2);
    p5 := tbez(k4,  k5,  k6, w1, w2);
    p6 := tbez(k14, k6,  k7, w1, w2);

    p7 := tbez(k11, k15, k10, w1, w2);
    p8 := tbez(k15,  k7, k8, w1, w2);
    p9 := tbez(k10,  k8, k9, w1, w2);

    a1 := tbez(p1, p2, p3, w1, w2);
    a2 := tbez(p4, p5, p6, w1, w2);
    a3 := tbez(p7, p8, p9, w1, w2);

    cubic := tbez(a1, a2, a3, w1, w2);

    **/
    const nv1 = new Vector3();
    const nv2 = new Vector3();
    const nv3 = new Vector3();
    const editDisplaced = this.editDisplaced;
    const drawDispDisField = this.drawDispDisField;
    const drawWireframe = this.drawWireframe;
    const drawValidEdges = this.drawValidEdges;
    const drawCavityMap = this.drawCavityMap;
    const drawColPatches = this.drawColPatches;
    const drawMask = this.drawMask;

    const cd_uv = mesh.loops.customData.getLayerIndex("uv");
    let haveUvs = cd_uv >= 0;

    let tstart = util.time_ms();

    if (bvh.computeValidEdges !== drawValidEdges) {
      for (let node of bvh.nodes) {
        node.flag |= BVHFlags.UPDATE_INDEX_VERTS | BVHFlags.UPDATE_DRAW;
        bvh.updateNodes.add(node);
      }
    }

    bvh.computeValidEdges = drawValidEdges;
    bvh.update();

    let vn1 = new Vector3();

    let nsmooth;
    let nsmooth_rets = util.cachering.fromConstructor(Vector3, 16);

    if (have_grids) {
      nsmooth = function (v, fac = 1.0) {
        let tot = 0;
        let n = nsmooth_rets.next().zero();

        for (let v2 of v.neighbors) {
          n.add(v2.no);
          tot++;
        }

        if (tot > 0) {
          n.mulScalar(1.0/tot);
          n.interp(v.no, 1.0 - fac);
          n.normalize();
        } else {
          n.load(v.no);
        }

        return n;
      }
    } else {
      nsmooth = function (v, fac = 1.0) {
        let tot = 0;
        let n = nsmooth_rets.next().zero();

        for (let e of v.edges) {
          let v2 = e.otherVertex(v);

          let w = v.vectorDistanceSqr(v2);

          for (let l of e.loops) {
            n.addFac(l.f.no, w);
            tot += w;
          }
        }

        if (tot > 0) {
          n.mulScalar(1.0/tot);
          n.interp(v.no, 1.0 - fac);
          n.normalize();
        } else {
          n.load(v.no);
        }

        return n;
      }
    }

    nsmooth = (v) => v.no;

    function vcavity(v) {
      return 1.0 - calcConcave(v);
      let sum = 0.0, tot = 0.0;

      if (have_grids) {
        for (let v2 of v.neighbors) {
          nv1.load(v).sub(v2).normalize();
          let dot = -nv1.dot(v2.no);

          sum += dot;
          tot++;
        }
      } else {
        nv1.zero();

        for (let e of v.edges) {
          let v2 = e.otherVertex(v);

          nv1.load(v).sub(v2).normalize();
          //nv2.load(v.no).cross(nv1);

          let dot;
          //dot = 2.0 - v.no.dot(v2.no);

          dot = -nv1.dot(v2.no);

          sum += dot;
          tot++;
        }
      }

      if (tot) {
        let f = sum/tot;
        f = Math.min(Math.max(f, -0.9999), 0.99999);

        f = 0.5 + f*0.5;
        f *= 1.8;

        f = Math.min(Math.max(f, 0.0), 1.0);
        f = Math.pow(f, 9.0);
        return f*0.5 + 0.5;
      }

      return 1.0;
    }

    let cd_mask;

    if (have_grids) {
      cd_mask = mesh.loops.customData.getLayerIndex("mask");
    } else {
      cd_mask = mesh.verts.customData.getLayerIndex("mask");
    }

    if (this.drawMask && cd_mask !== this._last_cd_mask) {
      this._last_cd_mask = cd_mask;

      for (let node of bvh.nodes) {
        bvh.updateNodes.add(node);
        node.flag |= BVHFlags.UPDATE_DRAW | BVHFlags.UPDATE_MASK;
      }
    }

    let norvisit = new WeakSet();

    if (isDeforming) {
      let {data, dimen} = bvh.makeNodeDefTexture();

      if (!bvh.glLeafTex || bvh.glLeafTex.createParams.width !== data.dimen) {
        if (bvh.glLeafTex) {
          bvh.glLeafTex.destroy(gl);
        }

        let tex = gl.createTexture();

        bvh.glLeafTex = new Texture(undefined, tex);
        gl.bindTexture(gl.TEXTURE_2D, tex);

        bvh.glLeafTex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        bvh.glLeafTex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        bvh.glLeafTex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        bvh.glLeafTex.texParameteri(gl, gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }

      bvh.glLeafTex.createParams.width = dimen;
      bvh.glLeafTex.texImage2D(gl, gl.TEXTURE_2D, 0, gl.RGBA32F, dimen, dimen, 0, gl.RGBA, gl.FLOAT, data);

      gl.bindTexture(gl.TEXTURE_2D, null);
    }

    function genNodeMesh_index(node) {
      let nodes = [];

      //count verts
      function buildNodes(n) {
        if (n.leaf) {
          nodes.push(n);
        }

        for (let n2 of n.children) {
          buildNodes(n2);
        }
      }

      buildNodes(node);

      let totvert = 0, totedge = 0, tottri = 0;
      let updateColors = false;
      let updateUvs = false;
      let haveColors = true; //cd_color >= 0; //XXX todo: add support in shader code to handle no vcol data

      haveColors = haveColors || drawMask || drawCavityMap || drawDispDisField;

      for (let n2 of nodes) {
        totedge += n2.indexEdges.length>>1;
        totvert += n2.indexVerts.length;
        tottri += ~~(n2.indexTris.length/3 + 0.00001);

        if (drawMask && cd_mask >= 0 && (n2.flag & BVHFlags.UPDATE_MASK)) {
          n2.flag &= ~BVHFlags.UPDATE_MASK;
          updateColors = true;
        }
      }

      let i = 0;
      for (let n2 of nodes) {
        for (let l of n2.indexLoops) {
          l.index = i++;
        }
      }

      let lflag = LayerTypes.LOC | LayerTypes.INDEX | LayerTypes.UV | LayerTypes.NORMAL;
      if (haveColors) {
        lflag |= LayerTypes.COLOR;
      }

      if (isDeforming) {
        lflag |= LayerTypes.CUSTOM;
      }

      let sm = node.drawData;
      if (!sm) {
        sm = node.drawData = new SimpleMesh(lflag);
        sm.indexedMode = true;

        updateColors = haveColors;
        updateUvs = cd_uv >= 0;
      } else {
        let island = sm.islands[0];

        if (island.totvert !== totvert || island.tottri !== tottri || island.drawCavityMap !== drawCavityMap) {
          updateUvs = cd_uv >= 0;
          updateColors = haveColors;
        }

        //XXX for testing purposes
        updateUvs = cd_uv >= 0;
      }

      let island = sm.island;

      island.totvert = totvert;
      island.tottri = tottri;
      island.drawCavityMap = drawCavityMap;

      island.regen = true;
      island.indexedMode = true;

      let idx = island.getIndexBuffer(PrimitiveTypes.TRIS);

      let defv;
      if (isDeforming) {
        defv = island.getDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 2, "BVHDefVs");

        defv.bufferHint = gl.DYNAMIC_DRAW;
        defv.setCount(tottri*3, true);
        defv = defv._getWriteData();
      }

      //console.log("TOTTRI", tottri, totvert);

      idx.setCount(tottri*3, true);
      idx = idx._getWriteData();

      island.tri_cos.bufferHint = gl.DYNAMIC_DRAW;
      island.tri_normals.bufferHint = gl.DYNAMIC_DRAW;
      island.tri_uvs.bufferHint = gl.DYNAMIC_DRAW;

      if (haveColors) {
        island.tri_colors.bufferHint = gl.DYNAMIC_DRAW;
      }

      let vcos = island.tri_cos;
      let vnos = island.tri_normals;
      let vuvs, vcolors, colormul, uvmul;

      if (cd_uv >= 0) {
        updateUvs = updateUvs || island.tri_uvs.dataUsed/2 !== totvert;
      }

      if (updateUvs) {
        vuvs = island.tri_uvs;
        uvmul = vuvs.glSizeMul;

        vuvs.setCount(totvert, true);
        vuvs = vuvs._getWriteData();
      }

      updateColors = updateColors || island.tri_colors.dataUsed/4 !== totvert;
      updateColors = updateColors || drawCavityMap || drawDispDisField;
      updateColors = updateColors && haveColors;

      if (!updateColors) {
        for (let n of nodes) {
          if (n.flag & BVHFlags.UPDATE_COLORS) {
            updateColors = true;

            n.flag &= ~BVHFlags.UPDATE_COLORS;
          }
        }
      }

      if (updateColors) {
        vcolors = island.tri_colors;
        colormul = vcolors.glSizeMul;

        vcolors.setCount(totvert, true);
        vcolors = vcolors._getWriteData();
      }

      vcos.setCount(totvert, true);
      vcos = vcos._getWriteData();

      vnos.setCount(totvert, true);
      let nomul = vnos.glSizeMul;
      vnos = vnos._getWriteData();

      let vi = 0;

      let lineidx;
      if (drawWireframe) {
        lineidx = island.getIndexBuffer(PrimitiveTypes.LINES);

        lineidx.setCount(totedge*2, true);
        lineidx = lineidx._getWriteData();
      }

      let black = [0, 0, 0, 1];
      let white = [1, 1, 1, 1];

      let displayers = mesh.verts.customData.getLayerSet("displace", false);
      let cd_disp = -1;
      let cd_pvert = -1;

      if (displayers && displayers.length > 0) {
        cd_disp = displayers[displayers.length - 1].index;
        let dctx = new DispContext();
        dctx.reset(mesh, cd_disp);

        cd_pvert = dctx.cd_pvert;
        //cd_disp = mesh.verts.customData.getLayerIndex("displace");
      }

      let ntmp = new Vector3();
      let ntmp2 = new Vector3();

      for (let n2 of nodes) {
        let ilen = n2.indexVerts.length;

        for (let i = 0; i < ilen; i++) {
          let v = n2.indexVerts[i];
          let l = n2.indexLoops[i];

          let j;

          j = vi*3;

          if (editDisplaced && cd_disp >= 0) {
            let dv = v.customData[cd_disp];

            let co = dv.worldco;
            //co = dv.smoothco;

            if (!norvisit.has(dv)) {
              dv.no.zero();

              for (let f of v.faces) {
                ntmp.load(f.no);
                ntmp2.load(f.cent);

                f.calcNormal(cd_disp);
                dv.no.add(f.no);

                f.no.load(ntmp);
                f.cent.load(ntmp2);
              }

              dv.no.normalize();
              norvisit.add(dv);
            }

            if (isDeforming) {
              let n3 = v.customData[cd_node].node;
              if (!n3 || !n3.boxvdata) {
                console.warn("eek!",v,  n3);
                vcos[j++] = 0.0;
                vcos[j++] = 0.0;
                vcos[j++] = 0.0;
              } else {
                let uvw = n3.boxvdata.get(v);

                vcos[j++] = uvw[0];
                vcos[j++] = uvw[1];
                vcos[j++] = uvw[2];

                j = vi*2;

                defv[j++] = n3.leafTexUV[0];
                defv[j++] = n3.leafTexUV[1];
              }
            } else {
              vcos[j++] = co[0];
              vcos[j++] = co[1];
              vcos[j++] = co[2];
            }

            j = vi*3;
            vnos[j++] = dv.no[0]*nomul;
            vnos[j++] = dv.no[1]*nomul;
            vnos[j++] = dv.no[2]*nomul;
          } else {
            if (isDeforming) {
              let n3 = v.customData[cd_node].node;

              if (!n3 || !n3.boxvdata) {
                if (Math.random() > 0.97) {
                  console.warn("eek!", v, n3);
                }

                vcos[j++] = 0.0;
                vcos[j++] = 0.0;
                vcos[j++] = 0.0;
              } else {
                let uvw = n3.boxvdata.get(v);

                vcos[j++] = uvw[0];
                vcos[j++] = uvw[1];
                vcos[j++] = uvw[2];

                j = vi*2;

                defv[j++] = n3.leafTexUV[0];
                defv[j++] = n3.leafTexUV[1];
              }
            } else {
              vcos[j++] = v[0];
              vcos[j++] = v[1];
              vcos[j++] = v[2];
            }

            j = vi*3;
            vnos[j++] = v.no[0]*nomul;
            vnos[j++] = v.no[1]*nomul;
            vnos[j++] = v.no[2]*nomul;
          }

          let colormul2 = colormul;

          if (drawMask && cd_mask >= 0) {
            let mask = v.customData[cd_mask].value;
            colormul2 *= mask*0.8 + 0.2;
          }

          if (drawCavityMap) {
            let f = vcavity(v);
            f = f*f*(3.0 - 2.0*f);
            f *= 1.25;

            colormul2 *= f;
          }

          if (updateColors) {
            if (drawDispDisField && cd_pvert >= 0) {
              let pv = v.customData[cd_pvert];

              let dis = pv.disUV[0];
              dis = Math.fract(dis*1.5);

              j = vi*4;

              vcolors[j++] = dis*colormul;
              vcolors[j++] = dis*colormul;
              vcolors[j++] = dis*colormul;
              vcolors[j++] = 1.0;
            } else if (cd_color >= 0) {
              let c = v.customData[cd_color].color;

              j = vi*4;

              vcolors[j++] = c[0]*colormul2;
              vcolors[j++] = c[1]*colormul2;
              vcolors[j++] = c[2]*colormul2;
              vcolors[j++] = c[3]*colormul;
            } else {
              j = vi*4;

              vcolors[j++] = colormul2;
              vcolors[j++] = colormul2;
              vcolors[j++] = colormul2;
              vcolors[j++] = colormul;
            }
          }

          if (updateUvs) {
            let uv = l.customData[cd_uv].uv;
            j = vi*2;

            vuvs[j++] = uv[0]*uvmul;
            vuvs[j++] = uv[1]*uvmul;
          }

          vi += 1;
        }
      }


      let ti = 0;
      let ei = 0;
      let base = 0;

      for (let n of nodes) {
        let lmap = n.indexTris;
        let li = 0;

        for (let i = 0; i < lmap.length; i += 3) {
          let i1 = lmap[i] + base, i2 = lmap[i + 1] + base, i3 = lmap[i + 2] + base;

          idx[ti++] = i1;
          idx[ti++] = i2;
          idx[ti++] = i3;
        }

        if (drawWireframe) {
          let emap = n.indexEdges;

          for (let i = 0; i < emap.length; i++) {
            lineidx[ei++] = emap[i] + base;
          }
        }

        base += n.indexVerts.length;
      }

      island.totline = totedge;
    }

    function genNodeMesh(node) {
      console.warn("genNodeMesh");

      if (!drawColPatches) {
        return genNodeMesh_index(node);
      }

      if (util.time_ms() - tstart > 15) {
        //return;
      }

      if (node.drawData) {
        node.drawData.reset(gl);
      }

      let vpatch = false;
      let vpatch2 = drawColPatches; //drawColPatches;
      let vpatch3 = false;

      vpatch2 = vpatch2 && have_color;
      vpatch2 = vpatch2 && !have_grids;

      vpatch3 = vpatch3 && have_color;
      vpatch3 = vpatch3 && !have_grids;

      let lflag = LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV | LayerTypes.NORMAL | LayerTypes.ID;

      if (vpatch) {
        lflag |= LayerTypes.CUSTOM;
      }

      let sm = node.drawData;

      let primc1, primc2, primc3, primc4, primc5, primc6;
      let primuv;

      if (!sm) {
        sm = new SimpleMesh(lflag);
        if (vpatch) {
          primuv = sm.primuv = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primUV");
          primc1 = sm.primc1 = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc1");
          primc2 = sm.primc2 = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc2");
          primc3 = sm.primc3 = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc3");
          primc4 = sm.primc4 = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc4");
          primc5 = sm.primc5 = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc5");
          primc6 = sm.primc6 = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc6");
        }
      } else {
        if (vpatch) {
          primuv = sm.primuv;
          primc1 = sm.primc1;
          primc2 = sm.primc2;
          primc3 = sm.primc3;
          primc4 = sm.primc4;
          primc5 = sm.primc5;
          primc6 = sm.primc6;
        }
        if (0 && vpatch) {
          primuv = sm.getDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primUV");
          primc1 = sm.getDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc1");
          primc2 = sm.getDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc2");
          primc3 = sm.getDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc3");
          primc4 = sm.getDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc4");
          primc5 = sm.getDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc5");
          primc6 = sm.getDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "primc6");
        }
      }

      let island = sm.island;

      island.tri_cos.bufferHint = gl.DYNAMIC_DRAW;
      island.tri_normals.bufferHint = gl.DYNAMIC_DRAW;
      island.tri_uvs.bufferHint = gl.DYNAMIC_DRAW;
      island.tri_colors.bufferHint = gl.DYNAMIC_DRAW;

      //count triangles
      let tottri = 0;

      function countrec(node) {
        if (node.leaf) {
          tottri += node.uniqueTris.size;
        } else {
          for (let c of node.children) {
            countrec(c);
          }
        }
      }

      countrec(node);
      if (!tottri) {
        return;
      }

      if (!vpatch2) {
        sm.island.setPrimitiveCount(PrimitiveTypes.TRIS, tottri);
      } else {
        sm.island.setPrimitiveCount(PrimitiveTypes.TRIS, 0);
      }

      if (vpatch) {
        primc1 = primc1._getWriteData();
        primc2 = primc2._getWriteData();
        primc3 = primc3._getWriteData();
        primc4 = primc4._getWriteData();
        primc5 = primc5._getWriteData();
        primc6 = primc6._getWriteData();
        primuv = primuv._getWriteData();
      }

      let nmul = sm.island.tri_normals.glSizeMul;
      let cmul = sm.island.tri_colors.glSizeMul;
      let uvmul = sm.island.tri_uvs.glSizeMul;

      let tri_cos = sm.island.tri_cos._getWriteData();
      let tri_nos = sm.island.tri_normals._getWriteData();
      let tri_cls = sm.island.tri_colors._getWriteData();
      let tri_ids = sm.island.tri_ids._getWriteData();
      let tri_uvs = sm.island.tri_uvs._getWriteData();

      let ti = 0;

      let colorfilter;
      let cfrets = util.cachering.fromConstructor(Vector4, 16);

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

      let tv1 = new Vector3();
      let tv2 = new Vector3();
      let tv3 = new Vector3();
      let tv4 = new Vector3();
      let tvt = new Vector3();
      let tvn = new Vector3();

      let tn1 = new Vector3();
      let tn2 = new Vector3();
      let tn3 = new Vector3();
      let tn4 = new Vector3();

      let tc1 = new Vector4();
      let tc2 = new Vector4();
      let tc3 = new Vector4();
      let tc4 = new Vector4();
      let tc5 = new Vector4();
      tc1[3] = tc2[3] = tc3[3] = 1.0;
      //let cd_node = have_grids ? mesh.loops.customData.getLayerIndex("bvh")
      //                         : mesh.verts.customData.getLayerIndex("bvh");
      const cd_node = bvh.cd_node;

      function rec(node) {
        if (!node.leaf) {
          for (let c of node.children) {
            rec(c);
          }

          return;
        }

        let n = new Vector3();
        let id = object.lib_id;

        tc1.zero().addScalar(1.0);
        tc2.zero().addScalar(1.0);
        tc3.zero().addScalar(1.0);

        function doline(sm, t1, t2, v1, v2) {
          if (have_grids) {
            sm.line(t1, t2);
          } else {
            if (mesh.getEdge(v1, v2)) {
              sm.line(t1, t2);
            }
          }
        }

        for (let tri of node.uniqueTris) {
          if (vpatch2) {
            let t1 = tri.v1;
            let t2 = tri.v2;
            let t3 = tri.v3;

            tv1.load(t1).interp(t2, 0.5);
            tv2.load(t2).interp(t3, 0.5);
            tv3.load(t3).interp(t1, 0.5);
            tv4.load(t1).add(t2).add(t3).mulScalar(1.0/3.0);

            tn1.load(t1.no).interp(t2.no, 0.5).normalize();
            tn2.load(t2.no).interp(t3.no, 0.5).normalize();
            tn3.load(t3.no).interp(t1.no, 0.5).normalize();
            tn4.load(t1.no).add(t2.no).add(t3.no).normalize();

            let f = mesh.eidmap[tri.id];

            let w1 = window.d1 ?? 1.0/3.0;

            let c1 = t1.customData[cd_color].color;
            let c2 = t2.customData[cd_color].color;
            let c3 = t3.customData[cd_color].color;
            if (1) {
              c1 = colorfilter(t1, w1);
              c2 = colorfilter(t2, w1);
              c3 = colorfilter(t3, w1);
            }

            tc1.load(c1).interp(c2, 0.5);
            tc2.load(c2).interp(c3, 0.5);
            tc3.load(c3).interp(c1, 0.5);

            tc4.load(c1).add(c2).add(c3).mulScalar(1.0/3.0);

            tc5.zero();
            let tot = 0.0;
            for (let l of f.lists[0]) {
              tc5.add(colorfilter(l.v, w1));
              tot++;
            }
            tc5.mulScalar(1.0/tot);

            let ca = t1.customData[cd_color].color;
            let cb = t2.customData[cd_color].color;
            let cc = t3.customData[cd_color].color;

            let startl = f.lists[0].l;

            let w2 = window.d2 ?? 1.0/6.0;

            ///*
            if (f.lists[0].length > 3) {
              if (startl.next.v === tri.v2) {
                tc3.load(tc5);
                tv3.load(f.cent);
              } else if (startl.next.v === tri.v3) {
                tc2.load(tc5);
                tv2.load(f.cent);
              } else {
                tc1.load(tc5);
                tv1.load(f.cent);
              }//*/
            }

            tc5.load(ca).interp(cb, 0.5);
            tc1.interp(tc5, w2);

            tc5.load(cb).interp(cc, 0.5);
            tc2.interp(tc5, w2);

            tc5.load(cc).interp(ca, 0.5);
            tc3.interp(tc5, w2);

            let n = math.normal_tri(t1, t2, t3);

            let q1 = sm.quad(tv4, tv3, t1, tv1);
            q1.normals(tn4, tn3, t1.no, tn1);
            q1.colors(tc4, tc3, c1, tc1);
            //q1.id(id, id, id, id);

            let q2 = sm.quad(tv4, tv1, t2, tv2);
            q2.normals(tn4, tn1, t2.no, tn2);
            q2.colors(tc4, tc1, c2, tc2);
            //q2.id(id, id, id, id);

            let q3 = sm.quad(tv4, tv2, t3, tv3);
            q3.normals(tn4, tn2, t3.no, tn3);
            q3.colors(tc4, tc2, c3, tc3);
            //q3.id(id, id, id, id);

            continue;
          }
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

          let i = ti*3;
          tri_cos[i++] = t1[0];
          tri_cos[i++] = t1[1];
          tri_cos[i++] = t1[2];

          tri_cos[i++] = t2[0];
          tri_cos[i++] = t2[1];
          tri_cos[i++] = t2[2];

          tri_cos[i++] = t3[0];
          tri_cos[i++] = t3[1];
          tri_cos[i++] = t3[2];

          let no1, no2, no3

          if (!drawFlat) {
            no1 = nsmooth(t1);
            no2 = nsmooth(t2);
            no3 = nsmooth(t3);
          } else {
            no1 = tri.no;
            no2 = tri.no;
            no3 = tri.no;
          }

          i = ti*3;
          tri_nos[i++] = no1[0]*nmul;
          tri_nos[i++] = no1[1]*nmul;
          tri_nos[i++] = no1[2]*nmul;

          tri_nos[i++] = no2[0]*nmul;
          tri_nos[i++] = no2[1]*nmul;
          tri_nos[i++] = no2[2]*nmul;

          tri_nos[i++] = no3[0]*nmul;
          tri_nos[i++] = no3[1]*nmul;
          tri_nos[i++] = no3[2]*nmul;

          i = ti;
          tri_ids[i++] = id;
          tri_ids[i++] = id;
          tri_ids[i++] = id;

          if (haveUvs) {
            let uv1, uv2, uv3;

            if (have_grids) {
              uv1 = t1.customData[cd_uv].uv;
              uv2 = t2.customData[cd_uv].uv;
              uv3 = t3.customData[cd_uv].uv;
            } else {
              let ltris = mesh._ltris;

              let l1, l2, l3, bad = false;

              if (tri.l1) {
                l1 = tri.l1;
                l2 = tri.l2;
                l3 = tri.l3;
              } else if (tri.tri_idx%3 === 0) {
                l1 = ltris[tri.tri_idx];
                l2 = ltris[tri.tri_idx + 1];
                l3 = ltris[tri.tri_idx + 2];
              } else {
                bad = true;
              }

              bad = bad || !l1 || !l2 || !l3;

              if (!bad) {
                uv1 = l1.customData[cd_uv].uv;
                uv2 = l2.customData[cd_uv].uv;
                uv3 = l3.customData[cd_uv].uv;
              } else {
                let f = mesh.eidmap[tri.id];

                l1 = l2 = l3 = undefined;

                for (let l of f.loops) {
                  if (l.v === tri.v1) {
                    l1 = l;
                  } else if (l.v === tri.v2) {
                    l2 = l;
                  } else if (l.v === tri.v3) {
                    l3 = l;
                  }
                }

                if (l1 && l2 && l3) {
                  uv1 = l1.customData[cd_uv].uv;
                  uv2 = l2.customData[cd_uv].uv;
                  uv3 = l3.customData[cd_uv].uv;
                } else {
                  uv1 = uv2 = uv3 = undefined;
                }
              }
            }

            i = ti*2;

            if (uv1 && uv2 && uv3) {
              tri_uvs[i++] = uv1[0]*uvmul;
              tri_uvs[i++] = uv1[1]*uvmul;
              tri_uvs[i++] = uv2[0]*uvmul;
              tri_uvs[i++] = uv2[1]*uvmul;
              tri_uvs[i++] = uv3[0]*uvmul;
              tri_uvs[i++] = uv3[1]*uvmul;
            }
          }

          let cv1 = 1.0, cv2 = 1.0, cv3 = 1.0;

          if (drawCavityMap) {
            cv1 = vcavity(tri.v1);
            cv2 = vcavity(tri.v2);
            cv3 = vcavity(tri.v3);

            if (!have_color) {
              for (let j = 0; j < 3; j++) {
                tc1[j] = cv1;
                tc2[j] = cv2;
                tc3[j] = cv3;
              }
              tc1[3] = tc2[3] = tc3[3] = 1.0;
            }
          }

          if (drawNodeIds && cd_node >= 0) {
            let node1 = tri.v1.customData[cd_node].node;
            let node2 = tri.v2.customData[cd_node].node;
            let node3 = tri.v3.customData[cd_node].node;

            let id1 = node1 ? node1._id : 0;
            let id2 = node2 ? node2._id : 0;
            let id3 = node3 ? node3._id : 0;

            tc1[0] = Math.fract(id1*13.234344);
            tc2[0] = Math.fract(id2*13.234344);
            tc3[0] = Math.fract(id3*13.234344);

            tc1[1] = tc2[1] = tc3[1] = 0.5;
          } else if (have_color) {
            //*
            let c1 = tri.v1.customData[cd_color].color;
            let c2 = tri.v2.customData[cd_color].color;
            let c3 = tri.v3.customData[cd_color].color;
            //*/

            tc1.load(c1);
            tc2.load(c2);
            tc3.load(c3);

            for (let j = 0; j < 3; j++) {
              tc1[j] *= cv1;
              tc2[j] *= cv2;
              tc3[j] *= cv3;
            }

            if (!c1 || !c2 || !c3) {
              let v = !c1 ? tri.v1 : undefined;

              v = !v && !c2 ? tri.v2 : v;
              v = !v && !c3 ? tri.v3 : v;

              let l = v.loopEid;
              l = mesh.eidmap[l];
              if (l && l.eid === v.loopEid) {
                l.customData[bvh.cd_grid].checkCustomDataLayout(mesh);

                //console.log(l, l.customData[bvh.cd_grid]);
              }

              //console.error("customdata error", c1, c2, c3, tri);
            }
            /*
            let c1 = colorfilter(tri.v1);
            let c2 = colorfilter(tri.v2);
            let c3 = colorfilter(tri.v3);
            //*/

            //tri2.custom(primc1, c1, c1, c1);
            //tri2.custom(primc2, c2, c2, c2);
            //tri2.custom(primc3, c3, c3, c3);

          }

          if (vpatch) {
            let c1 = colorfilter(tri.v1, 1);
            let c2 = colorfilter(tri.v2, 1);
            let c3 = colorfilter(tri.v3, 1);

            i = ti*4;
            primuv[i++] = puv1[0];
            primuv[i++] = puv1[1];
            i += 2;
            primuv[i++] = puv2[0];
            primuv[i++] = puv2[1];
            i += 2;
            primuv[i++] = puv3[0];
            primuv[i++] = puv3[1];
            i += 2;

            i = ti*4;

            let ca = tri.v1.customData[cd_color].color;
            let cb = tri.v2.customData[cd_color].color;
            let cc = tri.v3.customData[cd_color].color;

            for (let j = 0; j < 12; j++) {
              primc1[i + j] = ca[j%4];
              primc2[i + j] = cb[j%4];
              primc3[i + j] = cc[j%4];

              primc4[i + j] = c1[j%4];
              primc5[i + j] = c2[j%4];
              primc6[i + j] = c3[j%4];
            }
          }

          i = ti*4;

          tri_cls[i++] = tc1[0]*cmul;
          tri_cls[i++] = tc1[1]*cmul;
          tri_cls[i++] = tc1[2]*cmul;
          tri_cls[i++] = tc1[3]*cmul;

          tri_cls[i++] = tc2[0]*cmul;
          tri_cls[i++] = tc2[1]*cmul;
          tri_cls[i++] = tc2[2]*cmul;
          tri_cls[i++] = tc2[3]*cmul;

          tri_cls[i++] = tc3[0]*cmul;
          tri_cls[i++] = tc3[1]*cmul;
          tri_cls[i++] = tc3[2]*cmul;
          tri_cls[i++] = tc3[3]*cmul;

          ti += 3;

          //*
          if (drawWireframe) {
            doline(sm, t1, t2, tri.v1, tri.v2);
            doline(sm, t2, t3, tri.v2, tri.v3);
            doline(sm, t3, t1, tri.v3, tri.v1);
          }
          //*/
          continue;

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


          //let cv1 = 1.0, cv2=1.0, cv3=1.0;

          if (drawCavityMap) {
            cv1 = vcavity(tri.v1);
            cv2 = vcavity(tri.v2);
            cv3 = vcavity(tri.v3);

            if (!have_color) {
              for (let j = 0; j < 3; j++) {
                tc1[j] = cv1;
                tc2[j] = cv2;
                tc3[j] = cv3;
              }
              tc1[3] = tc2[3] = tc3[3] = 1.0;

              tri2.colors(tc1, tc2, tc3);
            }
          }

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

            tc1.load(c1);
            tc2.load(c2);
            tc3.load(c3);

            for (let j = 0; j < 3; j++) {
              tc1[j] *= cv1;
              tc2[j] *= cv2;
              tc3[j] *= cv3;
            }

            if (!c1 || !c2 || !c3) {
              let v = !c1 ? tri.v1 : undefined;

              v = !v && !c2 ? tri.v2 : v;
              v = !v && !c3 ? tri.v3 : v;

              let l = v.loopEid;
              l = mesh.eidmap[l];
              if (l && l.eid === v.loopEid) {
                l.customData[bvh.cd_grid].checkCustomDataLayout(mesh);

                //console.log(l, l.customData[bvh.cd_grid]);
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

            tri2.colors(tc1, tc2, tc3);
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
          node.flag &= ~BVHFlags.UPDATE_DRAW;
        }

        if (!node.drawData) {
          continue;
        }

        let f = node.id*0.1*Math.sqrt(3.0);
        f = Math.fract(f*10.0);

        let program2;

        if (isDeforming) {
          program2 = Shaders.SculptShaderHexDeform;
        } else if (drawColPatches) {
          program2 = Shaders.SculptShader;
        } else {
          program2 = Shaders.SculptShaderSimple;
        }

        if (!drawBVH) {
          uniforms.uColor = [1, 1, 1, 1];
        } else {
          let f2 = 1.0;
          if (update) {
            f2 = 0.5;
          }

          if (!node.__id2) {
            node.__id2 = ~~(Math.random()*1024*1024);
          }

          uniforms.uColor = [f*f2, f2*Math.fract(f*3.23423 + 0.432), f2*Math.fract(f*5.234 + .13432), 1.0];
        }

        uniforms.alpha = 1.0;

        let tex = this.ctx.activeTexture;
        if (tex) {
          let gltex = tex.getGlTex(gl);
          if (gltex) {
            uniforms.text = gltex;
            uniforms.hasTexture = 1.0;
          } else {
            uniforms.text = undefined;
            uniforms.hasTexture = 0.0;
          }
        } else {
          uniforms.text = undefined;
          uniforms.hasTexture = 0.0;
        }

        uniforms.iTime = util.time_ms()/10000.0;

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

          if (drawFlat) {
            program2.defines.DRAW_FLAT = null;
          } else {
            delete program2.defines.DRAW_FLAT;
          }

          if (!("ddd" in window)) {
            //window.ddd = 0;
          }

          if (isDeforming) {
            if (!program2.defines.WITH_BOXVERTS) {
              let dimen = bvh.glLeafTex.createParams.width;

              //console.log(dimen, node.leafTexUV);

              uniforms.nodeDefTex = bvh.glLeafTex;
              uniforms.nodeDefTexDu = (1.0/dimen) + 0.00001;
              uniforms.nodeDefTexUV = node.leafTexUV;
            } else {
              for (let i = 0; i < 8; i++) {
                let key = `boxverts[${i}]`;
                //uniforms[key] = new Vector3(node.boxverts[(i+window.ddd)%8]);
                uniforms[key] = new Vector3(node.boxverts[i]);
                //let loc = program2.uniformloc(key);
                //gl.uniform3fv(loc, new Vector3(node.boxverts[i]));
              }
            }
          }

          if (drawWireframe) {
            //uniforms.polygonOffset = window.d || 10.0;
            let off = uniforms.polygonOffset ?? 0.0, old = off;
            off = off !== 0.0 ? off*2.0 : 0.2;

            uniforms.polygonOffset = off;
            let clr = uniforms.uColor;
            uniforms.uColor = [0, 0, 0, 1];
            node.drawData.drawLines(gl, uniforms, program2);
            uniforms.uColor = clr;
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
  drawCavityMap          : bool;
  drawFlat               : bool;
  drawWireframe          : bool;
  drawValidEdges         : bool;
  drawNodeIds            : bool;
  drawMask               : bool;
  drawDispDisField       : bool;          
  editDisplaced          : bool;
  drawColPatches         : bool;
  symmetryAxes           : int;
  gridEditDepth          : int;
  enableMaxEditDepth     : bool;
  tool                   : int;
  slots                  : iterkeys(PaintToolSlot);
  sharedBrushRadius      : float;
  dynTopo                : DynTopoSettings; 
  reprojectCustomData    : bool;
}`;
nstructjs.manager.add_class(BVHToolMode);

ToolMode.register(BVHToolMode);

import {Shapes} from '../../../core/simplemesh_shapes.js';
import {FindNearest, castViewRay, CastModes} from "../findnearest.js";
import {ToolModes, ToolMode} from "../view3d_toolmode.js";
import {HotKey, KeyMap} from "../../editor_base.js";
import {Icons} from '../../icon_enum.js';
import {Unit} from "../../../path.ux/scripts/core/units.js";
import {SelMask} from "../selectmode.js";
import '../../../path.ux/scripts/util/struct.js';
import {MeshToolBase} from "./meshtool.js";
import {DispVertFlags} from '../../../mesh/mesh_displacement.js';

import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../../../util/vectormath.js";
import {Shaders} from '../../../shaders/shaders.js';
import {MovableWidget} from '../widgets/widget_utils.js';
import {SnapModes} from "../transform/transform_ops.js";
import * as util from '../../../util/util.js';

import {Mesh, MeshDrawFlags} from "../../../mesh/mesh.js";
import {
  MeshTypes, MeshFeatures, MeshFlags, MeshError,
  MeshFeatureError
} from '../../../mesh/mesh_base.js';
import {ObjectFlags} from "../../../sceneobject/sceneobject.js";
import {ContextOverlay, ToolMacro, startMenu, createMenu, nstructjs} from "../../../path.ux/scripts/pathux.js";
import {PackFlags} from "../../../path.ux/scripts/core/ui_base.js";
import {InflateWidget, RotateWidget, ScaleWidget, TranslateWidget} from '../widgets/widget_tools.js';
import {LayerTypes, PrimitiveTypes, SimpleMesh} from '../../../core/simplemesh.js';
import {buildCotanMap} from '../../../mesh/mesh_utils.js';
import {CurvVert, CVFlags, getCurveVerts} from '../../../mesh/mesh_curvature.js';
import {getFaceSets} from '../../../mesh/mesh_facesets.js';
import {UniformTriRemesher} from '../../../mesh/mesh_remesh.js';

export class MeshEditor extends MeshToolBase {
  constructor(manager) {
    super(manager);

    this.loopMesh = undefined;
    this.normalMesh = undefined;

    this.selectMask = SelMask.VERTEX;

    this.drawNormals = false;
    this.drawSelectMask = this.selectMask;
    this.drawLoops = false;
    this.drawCurvatures = false;

    this._last_update_loop_key = "";
    this._last_normals_key = "";
    this._last_update_curvature = "";
  }

  static toolModeDefine() {
    return {
      name        : "mesh",
      uianme      : "Edit Geometry",
      icon        : Icons.MESHTOOL,
      flag        : 0,
      description : "Edit vertices/edges/faces",
      transWidgets: [TranslateWidget, ScaleWidget, RotateWidget, InflateWidget]
    }
  }

  static buildEditMenu() {
    return [
      "mesh.delete_selected()",
      "mesh.toggle_select_all()",
      "mesh.subdivide_smooth()",
      "mesh.subdivide_simple()",
      "mesh.extrude_regions(transform=true)",
      "mesh.vertex_smooth()",
      "mesh.select_more_less(mode='ADD')",
      "mesh.select_more_less(mode='SUB')",
      "mesh.select_linked(mode='ADD')",
      "mesh.create_face()",
    ]
  }

  static buildElementSettings(container) {
    super.buildElementSettings(container);
    let path = "scene.tools." + this.toolModeDefine().name;
  }

  static buildSettings(container) {
    container.useIcons();

    let twocol = container.twocol(2);
    let column1 = twocol.col();
    let column2 = twocol.col();

    let strip;
    let panel;

    let path = "scene.tools." + this.toolModeDefine().name;

    panel = column1.panel("Viewport");
    strip = panel.row().strip();

    strip.prop(path + ".drawLoops");
    strip.prop(path + ".drawCurvatures");
    strip.prop(path + ".drawNormals");

    panel = column1.panel("Tools");
    strip = panel.row().strip();

    strip.tool("mesh.select_brush()");

    strip.tool("mesh.edgecut()");
    strip.tool(`mesh.delete_selected()`);

    strip = panel.row().strip();
    strip.tool("mesh.bisect()");
    strip.tool("mesh.symmetrize()");

    strip = panel.row().strip();
    strip.tool("mesh.flip_long_tris()");
    strip.tool("mesh.tris_to_quads()");
    strip.tool("mesh.triangulate()");

    panel = column1.panel("Misc Tools");

    panel.toolPanel("mesh.test_solver()").closed = true;

    strip = panel.row().strip();
    strip.useIcons(false);
    strip.tool("mesh.smooth_curvature_directions()");
    strip.tool("mesh.mark_singularity()");

    strip = panel.row().strip();
    strip.useIcons(false);
    strip.tool("mesh.unmark_singularity()");
    strip.tool("mesh.relax_rake_uv_cells()");

    strip = panel.row().strip();
    strip.useIcons(false);
    strip.tool("mesh.fix_normals()");
    strip.tool("mesh.test_multigrid_smooth()");

    strip = panel.row().strip();
    strip.useIcons(false);
    strip.tool("mesh.split_edges()");
    strip.tool("mesh.split_edges_smart()");

    strip = panel.row().strip();
    strip.useIcons(false);
    strip.tool("mesh.dissolve_verts()");
    strip.tool("mesh.cleanup_quads()");

    strip = panel.row().strip();
    strip.useIcons(false);
    strip.tool("mesh.cleanup_tris()");
    strip.tool("mesh.rotate_edges()");

    strip = panel.row().strip();
    strip.useIcons(false);
    strip.tool("mesh.collapse_edges()");
    strip.tool("mesh.dissolve_edges()");

    strip = panel.row().strip();
    strip.useIcons(false);
    strip.tool("mesh.random_flip_edges()");
    strip.tool("mesh.dissolve_edgeloops()");

    strip = panel.row().strip();
    strip.useIcons(false);
    strip.tool("mesh.select_shortest_edgeloop()");
    strip.tool("mesh.select_longest_edgeloop()");

    strip = panel.row().strip();
    strip.useIcons(false);
    strip.button("Dissolve Shortest Loop", () => {
      let ctx = strip.ctx;

      //let tool1 = ctx.api.createTool(ctx, "mesh.toggle_select_all(mode='ADD')");
      //let tool2 = ctx.api.createTool(ctx, "mesh.tris_to_quads(mode='ADD')");
      let tool3 = ctx.api.createTool(ctx, "mesh.select_shortest_edgeloop()");
      let tool4 = ctx.api.createTool(ctx, "mesh.dissolve_edgeloops()");

      let macro = new ToolMacro();
      //macro.add(tool1);
      //macro.add(tool2);
      macro.add(tool3);
      macro.add(tool4);

      ctx.api.execTool(ctx, macro);
    });
    strip.button("Dissolve Longest Loop", () => {
      let ctx = strip.ctx;

      //let tool1 = ctx.api.createTool(ctx, "mesh.toggle_select_all(mode='ADD')");
      //let tool2 = ctx.api.createTool(ctx, "mesh.tris_to_quads(mode='ADD')");
      let tool3 = ctx.api.createTool(ctx, "mesh.select_longest_edgeloop()");
      let tool4 = ctx.api.createTool(ctx, "mesh.dissolve_edgeloops()");

      let macro = new ToolMacro();
      //macro.add(tool1);
      //macro.add(tool2);
      macro.add(tool3);
      macro.add(tool4);

      ctx.api.execTool(ctx, macro);
    });

    strip = panel.row().strip();
    strip.useIcons(false);
    strip.tool("mesh.flip_normals");
    strip.tool("mesh.bevel");
    strip.tool("mesh.inset_regions");

    panel = column1.panel("Transform");

    strip = panel.row().strip();
    strip.useIcons(true);
    strip.prop("scene.propEnabled");
    strip.useIcons(false);
    strip.prop("scene.propMode");

    strip = panel.row().strip();
    strip.prop("scene.propRadius");

    panel = column2.panel("Remeshing");
    strip = panel.row().strip();
    strip.useIcons(false);
    strip.tool("mesh.remesh(remesher='UNIFORM_TRI')|Tri Remesh");
    strip.tool("mesh.remesh(remesher='UNIFORM_QUAD')|Quad Remesh");

    panel.toolPanel("mesh.interactive_remesh()");
    strip = panel.row().strip();

    strip.tool("mesh.interactive_remesh(mode='GEN_CROSSFIELD')", {
      label: "CrossField Gen"
    })
    strip.tool("mesh.interactive_remesh(mode='OPT_CROSSFIELD')", {
      label: "CrossField Opt"
    })

    panel.toolPanel("mesh.opt_remesh_params()").closed = true;

    panel = column2.panel("UV");

    strip = panel.col().strip();
    strip.useIcons(false);
    strip.tool("mesh.set_flag(elemMask='EDGE' flag='SEAM')", {label: "Set Seam"});
    strip.tool("mesh.clear_flag(elemMask='EDGE' flag='SEAM')", {label: "Clear Seam"});
    strip.tool("mesh.toggle_flag(elemMask='EDGE' flag='SEAM')", {label: "Toggle Seam"});

    panel = column2.panel("MultiRes");

    strip = panel.row().strip();
    strip.tool("mesh.add_or_subdivide_grids()");
    strip.tool("mesh.reset_grids()");
    strip.tool("mesh.delete_grids()");

    strip = panel.row().strip();
    strip.tool("mesh.apply_grid_base()");
    strip.tool("mesh.smooth_grids()");
    strip.tool("mesh.grids_test()");

    panel = column2.panel("Non-Manifold");
    strip = panel.row().strip();
    strip.tool("mesh.select_non_manifold");
    strip.tool("mesh.fix_manifold");
  }

  static buildHeader(header, addHeaderRow) {
    header.prop("mesh.symFlag");

    let row = addHeaderRow();

    let strip = row.strip();

    strip.useIcons();
    strip.inherit_packflag |= PackFlags.HIDE_CHECK_MARKS;

    strip.prop("scene.selectMaskEnum[VERTEX]");
    if (this.haveHandles()) {

    }
    strip.prop("scene.selectMaskEnum[EDGE]");
    strip.prop("scene.selectMaskEnum[FACE]");

    strip = row.strip();
    strip.tool("mesh.toggle_select_all()");
    strip.tool("mesh.select_brush()");

    strip = row.strip();
    strip.tool("mesh.edgecut()");
    strip.tool("mesh.subdivide_smooth()");
    strip.tool("mesh.vertex_smooth()");

    strip = row.strip();
    strip.prop("scene.tool.transformWidget[translate]");
    strip.prop("scene.tool.transformWidget[scale]");
    strip.prop("scene.tool.transformWidget[rotate]");
    strip.prop("scene.tool.transformWidget[inflate]");
    strip.prop("scene.tool.transformWidget[NONE]");


    /*
    strip.tool("mesh.add_or_subdivide_grids()");
    strip.tool("mesh.reset_grids()");
    strip.tool("mesh.delete_grids()");
    strip.tool("mesh.apply_grid_base()");
    strip.tool("mesh.smooth_grids()");
    strip.tool("mesh.grids_test()");
     */

    strip = row.strip();
    strip.tool("mesh.symmetrize()");
    strip.tool("mesh.bisect()");
    strip.tool(`mesh.delete_selected`);

    strip = row.strip();
    strip.pathlabel("mesh.triCount", "Triangles");
  }

  static haveHandles() {
    let ctx = this.ctx;
    if (!ctx)
      return;
  }

  static defineAPI(api) {
    let tstruct = super.defineAPI(api);

    let mstruct = api.mapStruct(Mesh, false);

    tstruct.struct("mesh", "mesh", "Mesh", mstruct);
    tstruct.bool("drawLoops", "drawLoops", "Draw Loops").icon(Icons.SHOW_LOOPS);
    tstruct.bool("drawCurvatures", "drawCurvatures", "Draw Curvatures").icon(Icons.SHOW_CURVATURE);
    tstruct.bool("drawNormals", "drawNormals", "Draw Normals").icon(Icons.SHOW_NORMALS);

    let onchange = () => {
      window.redraw_viewport();
    };

    return tstruct;
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("A", [], "mesh.toggle_select_all(mode='AUTO')"),
      new HotKey("A", ["ALT"], "mesh.toggle_select_all(mode='SUB')"),
      new HotKey("J", ["ALT"], "mesh.tris_to_quads()"),
      new HotKey("J", [], "mesh.connect_verts()"),
      new HotKey("S", ["ALT"], "view3d.inflate()"),
      new HotKey("S", ["CTRL", "ALT"], "view3d.to_sphere()"),
      new HotKey("G", ["SHIFT"], () => {
        let menu = [
          "mesh.select_similar(mode='NUMBER_OF_EDGES')|Number of Edges"
        ]

        menu = createMenu(this.ctx, "Select Similar", menu);
        let screen = this.ctx.screen;

        startMenu(menu, screen.mpos[0], screen.mpos[1]);
      }),

      //new HotKey("T", [], "mesh.quad_smooth()"),

      //new HotKey("D", [], "mesh.subdivide_smooth()"),
      //new HotKey("D", [], "mesh.subdivide_smooth_loop()"),
      new HotKey("Y", [], "mesh.test_color_smooth()"),
      new HotKey("D", [], "mesh.dissolve_verts()"),
      new HotKey("D", ["SHIFT"], "mesh.duplicate()"),
      new HotKey("K", [], "mesh.subdiv_test()"),
      //new HotKey("D", [], "mesh.test_collapse_edge()"),
      new HotKey("F", [], "mesh.create_face()"),
      new HotKey("G", [], "view3d.translate(selmask=17)"),
      new HotKey("R", [], "view3d.rotate(selmask=17)"),
      new HotKey("L", [], "mesh.pick_select_linked()"),
      new HotKey("=", ["CTRL"], "mesh.select_more_less(mode='ADD')"),
      new HotKey("-", ["CTRL"], "mesh.select_more_less(mode='SUB')"),
      new HotKey("L", ["SHIFT"], "mesh.pick_select_linked(mode=\"SUB\")"),
      new HotKey("X", [], "mesh.delete_selected()"),

      new HotKey("E", [], "mesh.extrude_regions(transform=true)"),
      new HotKey("E", ["ALT"], "mesh.extrude_individual_faces(transform=true)"),

      new HotKey("R", ["SHIFT"], "mesh.edgecut()"),
      new HotKey("I", ["CTRL"], "mesh.select_inverse()"),
      new HotKey("C", [], "mesh.select_brush()")
    ]);

    return this.keymap;
  }

  getMeshPaths() {
    let rets = [];

    //for (let ob of this.ctx.selectedMeshObjects) {
    //  let path  = `library.mesh[${ob.lib_id}]`
    //}

    if (this.meshPath === undefined) {
      this._getObject();

      if (this.sceneObject !== undefined) {
        let ob = this.sceneObject;
        //set path to parent SceneObject so resolveMesh knows to
        //set ownerMatrix and ownerId
        let path = `objects[${ob.lib_id}]`;
        return [path];
      } else {
        return [];
      }
      //let path = "scene.tools." + this.constructor.toolModeDefine().name;
      //path += ".mesh";
    }

    return [this.meshPath];
  }

  on_mousedown(e, x, y, was_touch) {
    return super.on_mousedown(e, x, y, was_touch);
  }

  onActive() {
    super.onActive();
  }

  onInactive() {
    super.onInactive();
  }

  _getObject() {
    let ctx = this.ctx;

    if (!ctx || !ctx.object || !(ctx.object.data instanceof Mesh)) {
      this.sceneObject = undefined;
      this.mesh = undefined;

      return;
    }

    this.sceneObject = ctx.object;
    this.mesh = this.sceneObject.data;
    this.mesh.owningToolMode = this.constructor.toolModeDefine().name;
  }

  update() {
    this._getObject();

    super.update();
  }

  findnearest3d(view3d, x, y, selmask) {
    /*
    make sure findnearest api gets the right mesh
    */
    //let ctx = this.buildFakeContext(this.ctx);
    let ctx = this.ctx;
    return FindNearest(ctx, selmask, new Vector2([x, y]), view3d);
  }

  on_mousemove(e, x, y, was_touch) {
    return super.on_mousemove(e, x, y, was_touch);
  }

  updateCurvatureMesh(gl) {
    let mesh = this.mesh;
    let key = "" + mesh.lib_id + ":" + mesh.updateGen + ":" + mesh.verts.length + ":" + mesh.eidgen._cur;

    let cd_curv = getCurveVerts(mesh);

    //CurvVert.propegateUpdateFlags(mesh, cd_curv);
    let cd_cotan = mesh.verts.customData.getLayerIndex("cotan");
    let cd_fset = getFaceSets(mesh, false);

    /*
    for (let v of mesh.verts) {
      let cv = v.customData[cd_curv];
      cv.check(v, cd_cotan, undefined, cd_fset);
    }*/

    if (this.curvatureMesh && key === this._last_update_curvature) {
      return;
    }

    if (this.curvatureMesh) {
      this.curvatureMesh.destroy(gl);
    }

    this._last_update_curvature = key;

    let sm = this.curvatureMesh = new SimpleMesh(LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV);
    sm.primflag = PrimitiveTypes.LINES;

    let co1 = new Vector3();
    let co2 = new Vector3();

    let white = [1, 1, 1, 1];
    let black = [0, 0, 0, 1];

    let no = new Vector3();

    let amat = new Float64Array(16);
    let mat = new Matrix4();

    const VIS_UV_COLORS = false;

    let cd_vis = -1;

    if (VIS_UV_COLORS) {
      cd_vis = mesh.verts.customData.getNamedLayerIndex("_rakevis", "color");

      if (cd_vis < 0) {
        cd_vis = mesh.verts.addCustomDataLayer("color", "_rakevis").index;
      }

      for (let v of mesh.verts.selected.editable) {
        let cv = v.customData[cd_curv];
        cv.check(v, cd_cotan, true, cd_fset);
      }

      let remesh = new UniformTriRemesher(mesh);
      remesh.propRakeDirections();
    }

    for (let i = 0; i < amat.length; i++) {
      amat[i] = 0.0;
    }

    let calcNorLen = (v) => {
      let tot = 0;
      let sum = 0;

      for (let v2 of v.neighbors) {
        sum += v2.vectorDistance(v);
        tot++;
      }

      return tot ? sum/tot : 1.0;
    }


    console.warn("updating curvature lines");

    no = new Vector3();
    let tmp1 = new Vector3();

    let dd3 = 1.0;
    if (window.dd3 !== undefined) {
      dd3 = window.dd3;
    }

    for (let v of mesh.verts.selected.editable) {
      let cv = v.customData[cd_curv];
      cv.check(v, cd_cotan, true, cd_fset);

      if (VIS_UV_COLORS) {
        let visc = v.customData[cd_vis].color;
        visc[0] = Math.fract(cv.diruv[0]);
        visc[1] = Math.fract(cv.diruv[1]);
        visc[2] = Math.fract(cv.diruv[2]);
        visc[3] = 1.0;

        //cv.relaxUvCells(v, cd_curv);
      }

      let size = calcNorLen(v)*0.5;

      let k1 = cv.k1*0.1*dd3;

      if (0 && cv.k1 !== 0.0) {
        k1 = Math.abs(1.0/cv.k1);
      }

      no.load(cv.dir);
      //no.load(cv.no);
      no.normalize();

      co1.load(v);

      for (let i = 0; i < 2; i++) {
        co2.load(v).addFac(no, i === 0 ? size*0.5 : size*0.1); //size*k1);

        let line = sm.line(co1, co2);
        line.colors(white, white);

        co2.load(v).addFac(no, -size*0.1); //size*k1);

        line = sm.line(co1, co2);
        line.colors(white, white);

        no.cross(v.no).normalize();
      }
    }
  }

  updateLoopMesh(gl) {
    let mesh = this.mesh;
    let key = "" + mesh.lib_id + ":" + mesh.updateGen + ":" + mesh.verts.length + ":" + mesh.eidgen._cur;

    if (key === this._last_update_loop_key) {
      return;
    }

    this._last_update_loop_key = key;

    if (this.loopMesh) {
      this.loopMesh.destroy(gl);
    }

    let sm = this.loopMesh = new SimpleMesh(LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV);
    sm.primflag = PrimitiveTypes.LINES;

    let a = new Vector3(), b = new Vector3(), c = new Vector3();
    let d = new Vector3(), e = new Vector3(), g = new Vector3();
    let h = new Vector3();
    let color = [0, 0, 0, 1];

    let ctmps = util.cachering.fromConstructor(Vector3, 64);
    let rtmps = new util.cachering(() => [new Vector3(), new Vector3(), new Vector3()], 32);

    function calcloop(l) {
      let fac;
      let f = l.f;

      let ret = rtmps.next();
      let a = ret[0], b = ret[1], c = ret[2];

      if (l.f.area) {
        let count = 0.0;

        for (let list of l.f.lists) {
          for (let l of list) {
            count++;
          }
        }

        fac = Math.sqrt(l.f.area)/count*0.35;
        fac = (fac + a.vectorDistance(b)*0.2)*0.5;
      } else {
        fac = a.vectorDistance(b)*0.2;
      }

      g.load(b).sub(a).cross(f.no).normalize();
      h.load(l.v).interp(l.next.v, 0.5).sub(f.cent).negate().normalize();

      //if (g.dot(h) < 0.0) {
      //  g.negate();
      //}
      g.load(h);

      a.load(l.v).addFac(g, fac);
      b.load(l.next.v).addFac(g, fac);


      //a.load(l.v).sub(f.cent).mulScalar(fac).add(f.cent);
      //b.load(l.next.v).sub(f.cent).mulScalar(fac).add(f.cent);

      c.load(a).interp(b, 0.5);
      a.interp(c, 0.225);
      b.interp(c, 0.225);

      let scale = l.v.vectorDistance(f.cent)*0.03;

      for (let i = 0; i < 3; i++) {
        a[i] += (Math.random() - 0.5)*scale;
        b[i] += (Math.random() - 0.5)*scale;
        c[i] += (Math.random() - 0.5)*scale;
      }

      return ret;
    }

    for (let f of mesh.faces.selected) {
      f.calcCent();

      for (let l of f.loops) {
        let [a, b, c] = calcloop(l);

        let line = sm.line(a, b);
        line.colors(color, color);

        if (f.no.dot(f.no) === 0.0) {
          f.calcCent();
          f.calcNormal();
        }

        d.load(b).interp(f.cent, 0.1);

        line = sm.line(b, d);
        line.colors(color, color);

        if (l.radial_next !== l) {
          let [a2, b2, c2] = calcloop(l.radial_next);

          let t = Math.random()*0.5 + 0.5;

          d.load(a).interp(b, t);
          e.load(a2).interp(b2, 1.0 - t);
          line = sm.line(d, e);
          line.colors(color, color);
        }
      }
    }
  }

  updateNormalsMesh(gl) {
    let mesh = this.mesh;
    if (!mesh) {
      return;
    }

    let key = "" + mesh.lib_id + ":" + mesh.verts.selected.length + ":" + mesh.updateGen + ":" +
      mesh.verts.length + ":" + mesh.eidgen._cur;

    if (key === this._last_normals_key) {
      return;
    }

    this._last_normals_key = key;

    if (this.normalMesh) {
      this.normalMesh.destroy(gl);
    }

    let sm = this.normalMesh = new SimpleMesh(LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV);

    let co1 = new Vector3();
    let co2 = new Vector3();

    let white = [1, 1, 1, 1];

    for (let v of mesh.verts.selected.editable) {
      co1.load(v);

      let edist = 0.0;
      let tot = 0;

      for (let v2 of v.neighbors) {
        edist += v2.vectorDistance(v);
        tot++;
      }

      if (tot) {
        edist /= tot;
      } else {
        edist = 1.0;
      }

      co2.load(co1).addFac(v.no, edist*0.5);

      let line = sm.line(co1, co2);
      line.colors(white, white);
    }
  }

  on_drawend(view3d, gl) {
    super.on_drawend(view3d, gl);

    let ob = this.ctx.object;
    let color = [1, 0.8, 0.7, 1.0];

    if (!ob) {
      return;
    }

    let uniforms = {
      projectionMatrix: view3d.activeCamera.rendermat,
      objectMatrix    : ob.outputs.matrix.getValue(),
      object_id       : ob.lib_id,
      aspect          : view3d.activeCamera.aspect,
      size            : view3d.glSize,
      near            : view3d.activeCamera.near,
      far             : view3d.activeCamera.far,
      color           : color,
      uColor          : color,
      alpha           : 1.0,
      opacity         : 1.0,
      polygonOffset   : 1.0
    };

    if (this.drawCurvatures && this.mesh) {
      this.updateCurvatureMesh(gl);

      if (this.curvatureMesh) {
        gl.enable(gl.DEPTH_TEST);
        this.curvatureMesh.draw(gl, uniforms, Shaders.WidgetMeshShader);
      }
    }

    if (this.drawNormals && this.mesh) {
      this.updateNormalsMesh(gl);

      if (this.normalMesh) {
        gl.enable(gl.DEPTH_TEST);
        this.normalMesh.draw(gl, uniforms, Shaders.WidgetMeshShader);
      }
    }

    if (this.drawLoops && this.mesh) {
      this.updateLoopMesh(gl);

      if (this.loopMesh) {
        gl.enable(gl.DEPTH_TEST);
        this.loopMesh.draw(gl, uniforms, Shaders.WidgetMeshShader);
      }
    }
  }

  on_drawstart(view3d, gl) {
    if (!this.ctx) return;

    this._getObject();

    let mask = this.ctx.selectMask;
    mask = mask | (SelMask.EDGE | SelMask.FACE);

    this.selectMask = this.ctx.selectMask;
    this.drawSelectMask = mask;

    if (this.mesh !== undefined) {
      if (this.mesh.drawflag !== this.drawflag) {
        this.mesh.drawflag = this.drawflag;
        this.mesh.regenRender();
      }
    }


    super.on_drawstart(view3d, gl);
  }

  dataLink(scene, getblock, getblock_addUser) {
    super.dataLink(...arguments);

    this.mesh = getblock_addUser(this.mesh);
  }

  loadSTRUCT(reader) {
    reader(this);
    if (super.loadSTRUCT) {
      super.loadSTRUCT(reader);
    }

    this.mesh.owningToolMode = this.constructor.toolModeDefine().name;
  }

}

MeshEditor.STRUCT = nstructjs.inherit(MeshEditor, ToolMode) + `
  mesh                : DataRef | DataRef.fromBlock(obj.mesh);
  drawflag            : int;
  drawLoops           : bool;
  drawCurvatures      : bool;
  drawNormals         : bool;
}`;
nstructjs.register(MeshEditor);
ToolMode.register(MeshEditor);

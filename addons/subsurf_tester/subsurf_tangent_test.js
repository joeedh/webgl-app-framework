import {Shapes} from '../../scripts/core/simplemesh_shapes.js';
import {FindNearest, castViewRay, CastModes} from "../../scripts/editors/view3d/findnearest.js";
import {WidgetFlags} from "../../scripts/editors/view3d/widgets/widgets.js";
import {ToolModes, ToolMode} from "../../scripts/editors/view3d/view3d_toolmode.js";
import {HotKey, KeyMap} from "../../scripts/editors/editor_base.js";
import {Icons} from '../../scripts/editors/icon_enum.js';
import {Unit} from "../../scripts/path.ux/scripts/core/units.js";
import {SelMask} from "../../scripts/editors/view3d/selectmode.js";
import {MeshOp, resolveMeshes} from "../../scripts/mesh/mesh_ops_base.js";
import {NodeFlags, Node} from '../../scripts/core/graph.js';
import {nstructjs} from '../../scripts/path.ux/pathux.js';

import {Vector2, Vector3, Vector4, Quat, Matrix4} from "../../scripts/util/vectormath.js";
import {Shaders} from '../../scripts/shaders/shaders.js';
import {MovableWidget} from '../../scripts/editors/view3d/widgets/widget_utils.js';
import {SnapModes, TranslateOp} from "../../scripts/editors/view3d/transform/transform_ops.js";
import {SelOneToolModes} from "../../scripts/editors/view3d/selectmode.js";

import {ObjectFlags, SceneObject} from "../../scripts/sceneobject/sceneobject.js";
import {Mesh} from "../../scripts/mesh/mesh.js";
import {FindnearestMesh} from '../../scripts/editors/view3d/findnearest/findnearest_mesh.js';
import {ToggleFlagOp} from '../../scripts/mesh/mesh_flagops.js';

//import '../../../mesh/select_ops.js';
//import '../../../mesh/mesh_ops.js';

import {
  MeshTypes, MeshFeatures, MeshFlags, MeshError,
  MeshFeatureError
} from '../../scripts/mesh/mesh_base.js';
import {SelectEdgeLoopOp} from '../../scripts/mesh/select_ops.js';
import {MeshToolBase} from '../../scripts/editors/view3d/tools/meshtool.js';

import {DataBlock, DataRefProperty} from '../../scripts/core/lib_api.js';
import {CustomDataElem} from '../../scripts/mesh/customdata.js';
import {SceneObjectData} from '../../scripts/sceneobject/sceneobject_base.js';
import {ToolOp, util} from '../../scripts/path.ux/pathux.js';
import {InflateWidget, RotateWidget, ScaleWidget, TranslateWidget} from '../../scripts/editors/view3d/widgets/widget_tools.js';
import {LayerTypes, SimpleMesh} from '../../scripts/core/simplemesh.js';
import {CubicPatch} from '../../scripts/subsurf/subsurf_patch.js';

const PVertFlags = {
  TANGENT_SPACE      : 2,
  UPDATE_TANGENT_CO  : 4,
  TANGENT_CO_TO_WORLD: 8
};

const PatchSources = {
  CO      : 0,
  SMOOTHCO: 1,
  OLDCO   : 2
};

let _digest = new util.HashDigest();

export class PVert extends CustomDataElem {
  constructor() {
    super();

    this.tanco = new Vector3(); //smooth co for patch verts
    this.oldco = new Vector3(); //old patch coordinates

    this.uv = new Vector3();
    this.lastHash = 0;
    this.flag = PVertFlags.UPDATE_TANGENT_CO;
  }

  static define() {
    return {
      typeName     : "pvert",
      uiTypeName   : "PVert",
      defaultName  : "PVert",
      flag         : 0,
      settingsClass: undefined
    }
  }

  calcHash(v, digest = _digest.reset()) {
    digest.add(this.flag);
    digest.add(v[0]);
    digest.add(v[1]);
    digest.add(v[2]);
    digest.add(this.uv[0]);
    digest.add(this.uv[1]);

    return digest.get();
  }

  copyTo(b) {
    b.flag = this.flag;
    b.tanco.load(this.tanco);
    b.uv.load(this.uv);
  }

  getValue() {
    return this;
  }

  setValue(val) {
    val.copyTo(this);
  }
}

PVert.STRUCT = nstructjs.inherit(PVert, CustomDataElem) + `
  flag  : int;
  tanco : vec3;
  uv    : vec3;
}`;
nstructjs.register(PVert);
CustomDataElem.register(PVert);


export class PFace extends CustomDataElem {
  static define() {
    return {
      typeName     : "pface",
      uiTypeName   : "PFace",
      defaultName  : "PFace",
      flag         : 0,
      settingsClass: undefined
    }
  }

  copyTo(b) {

  }
}

PFace.STRUCT = nstructjs.inherit(PFace, CustomDataElem) + `
}`;
nstructjs.register(PFace);
CustomDataElem.register(PFace);


export class PatchTester extends Mesh {
  constructor() {
    super();

    this._no_vert_check = false;

    this.patch = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]];
    this.steps = 16;
    this.plast_update_hash = '';

    this.verts.addCustomDataLayer("pvert");
    this.faces.addCustomDataLayer("pface");
  }

  get tangentVerts() {
    let this2 = this;

    return (function* () {
      let cd_pvert = this2.verts.customData.getLayerIndex("pvert");

      for (let v of this2.verts) {
        let pv = v.customData[cd_pvert];
        if (pv.flag & PVertFlags.TANGENT_SPACE) {
          yield v;
        }
      }
    })();
  }

  get patchVerts() {
    let this2 = this;
    let cd_pvert = this.verts.customData.getLayerIndex("pvert");

    return (function* () {
      for (let v of this2.verts) {
        let tv = v.customData[cd_pvert];
        if (!(tv.flag & PVertFlags.TANGENT_SPACE)) {
          yield v;
        }
      }
    })();
  }

  static dataDefine() {
    return {
      name      : "patchtester",
      selectMask: SelMask.GEOM,
    }
  }

  static blockDefine() {
    return {
      typeName   : "patchtester",
      uiName     : "patchtester",
      defaultName: "patchtester",
      flag       : 0,
      icon       : -1
    }
  }

  static nodedef() {
    return {
      name   : "patchtester",
      inputs : Node.inherit({}),
      outputs: Node.inherit({}),
      flag   : Node.inherit(0)
    }
  }

  createMesh() {
    this.patch = [];
    let cd_pvert = this.verts.customData.getLayerIndex("pvert");

    for (let i = 0; i < 4; i++) {
      this.patch.push([]);

      for (let j = 0; j < 4; j++) {
        let s = 0.25;
        let z = ((i - 2)**2 + (j - 2)**2)**0.5;
        let co = new Vector3([
          i*s, j*s, z*s
        ]);

        let v = this.makeVertex(co);
        let tv = v.customData[cd_pvert];

        tv.tanco.load(v);

        this.patch[i].push(v);
      }
    }

    let p = this.getPatch();

    let steps = 9;
    let ds = 1.0/(steps - 1);
    let u = 0.0;

    for (let i = 0; i < steps; i++, u += ds) {
      let v = 0.0;

      for (let j = 0; j < steps; j++, v += ds) {
        let co = new Vector3(p.evaluate(u, v));

        let vert = this.makeVertex(co);
        vert.no[2] = 1.0;

        let pv = vert.customData[cd_pvert];

        pv.uv[0] = u;
        pv.uv[1] = v;
        pv.flag |= PVertFlags.TANGENT_SPACE;
        pv.tanco.zero();

      }
    }

    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        let v1 = this.patch[i][j];
        let v2 = this.patch[i][j + 1];
        let v3 = this.patch[i + 1][j + 1];
        let v4 = this.patch[i + 1][j];

        //this.makeQuad(v1, v2, v3, v4);
        this.makeEdge(v1, v2);
        this.makeEdge(v2, v3);
        this.makeEdge(v3, v4);
        this.makeEdge(v4, v1);

        let u = i/4;
        let v = j/4;

        u += 1.0/3.0;
        v += 1.0/3.0;
      }
    }

    this.regenRender();
  }

  updatePatchSmoothCos() {
    let cd_pvert = this.verts.customData.getLayerIndex("pvert");

    for (let v of this.patchVerts) {
      v.customData[cd_pvert].tanco.load(v);
    }

    for (let i = 1; i < 3; i++) {
      for (let j = 1; j < 3; j++) {
        let v = this.patch[i][j];
        let tv = v.customData[cd_pvert];

        let co = new Vector3();
        let tot = 0.0;
        for (let v2 of v.neighbors) {
          co.add(v2);
          tot += 1.0;
        }

        if (tot > 0.0) {
          co.mulScalar(1.0/tot);

          tv.tanco.load(v).interp(co, 0.75);
        } else {
          console.log("SHEER TOPOLOGICAL EVIL! THE HORROR!");
          tv.tanco.load(v);
        }
      }
    }
  }

  getPatch(source = PatchSources.CO) {
    let p = new CubicPatch();
    let cd_pvert = this.verts.customData.getLayerIndex("pvert");

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        let v = this.patch[i][j];

        if (source === PatchSources.SMOOTHCO) {
          let tv = v.customData[cd_pvert];
          v = tv.tanco;

          if (v.dot(v) === 0.0) {
            v.load(this.patch[i][j]);
          }
        } else if (source === PatchSources.OLDCO) {
          let tv = v.customData[cd_pvert];
          v = tv.oldco;
        }

        p.setPoint(i, j, v);
      }
    }

    return p;
  }

  genRender(gl, combinedWireframe = false, view3d = undefined) {
    for (let f of this.faces) {
      f.flag |= MeshFlags.HIDE;
    }
    let ret = super.genRender(gl, combinedWireframe, view3d);
    for (let f of this.faces) {
      f.flag &= ~MeshFlags.HIDE;
    }

    let lf = LayerTypes;

    let sm = new SimpleMesh(lf.LOC | lf.NORMAL | lf.COLOR | lf.UV);

    let steps = this.steps;
    let ds = 1.0/(steps - 1);

    let vs = [];
    let p = this.getPatch();

    let u = 0;

    for (let i = 0; i < steps; i++, u += ds) {
      vs.push([]);
      let v = 0;

      for (let j = 0; j < steps; j++, v += ds) {
        let no = new Vector3();
        let dv = new Vector3();
        let du = new Vector3();
        let co = new Vector3(p.evaluate(u, v, dv, du, no));
        let uv = new Vector2([u, v]);
        let color = new Vector4([1, 1, 1, 1]);

        vs[i].push({co, dv, du, no, uv, color});
      }
    }

    for (let i = 0; i < steps - 1; i++) {
      for (let j = 0; j < steps - 1; j++) {
        let v1 = vs[i][j];
        let v2 = vs[i][j + 1];
        let v3 = vs[i + 1][j + 1];
        let v4 = vs[i + 1][j];

        let quad = sm.quad(v1.co, v2.co, v3.co, v4.co);
        quad.normals(v1.no, v2.no, v3.no, v4.no);
        quad.colors(v1.color, v2.color, v3.color, v4.color);
        quad.uvs(v1.uv, v2.uv, v3.uv, v4.uv);
      }
    }

    this.draw_sm = sm;

    //this.draw_smooth_sm = this.copy();

    return ret;
  }

  copy(addLibUsers = false) {
    let ret = super.copy(addLibUsers, false);

    ret.verts.addCustomDataLayer("pvert");
    ret.faces.addCustomDataLayer("pface");

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        ret.patch[i][j] = ret.eidMap.get(this.patch[i][j].eid);
      }
    }

    return ret;
  }

  checkTangentVerts() {
    if (this._no_vert_check) {
      return;
    }

    let cd_pvert = this.verts.customData.getLayerIndex("pvert");

    let digest = new util.HashDigest();
    for (let v of this.patchVerts) {
      digest.add(v[0]);
      digest.add(v[1]);
      digest.add(v[2]);
    }
    let hash = digest.get();

    if (hash !== this.plast_update_hash) {
      this.plast_update_hash = hash;
      for (let v of this.tangentVerts) {
        let pv = v.customData[cd_pvert];
        pv.flag |= PVertFlags.TANGENT_CO_TO_WORLD;
        v.flag |= MeshFlags.UPDATE;
      }
    }

    let newp = this.getPatch(PatchSources.CO);
    let oldp = this.getPatch(PatchSources.OLDCO);

    for (let v of this.tangentVerts) {
      let tv = v.customData[cd_pvert];

      if (!(tv.flag & (PVertFlags.UPDATE_TANGENT_CO | PVertFlags.TANGENT_CO_TO_WORLD))) {
        let hash2 = tv.calcHash(v);
        if (hash2 !== tv.lastHash) {
          tv.lastHash = hash2;
          tv.flag |= PVertFlags.UPDATE_TANGENT_CO;
          v.flag |= MeshFlags.UPDATE;
        }
      }

      if (tv.flag & PVertFlags.UPDATE_TANGENT_CO) {
        console.log("tangent update");
        let pmat = newp.buildTangentMatrix(tv.uv[0], tv.uv[1]);
        pmat.invert();

        tv.tanco.load(v).multVecMatrix(pmat);
        tv.flag &= ~PVertFlags.UPDATE_TANGENT_CO;
      }

      if (tv.flag & PVertFlags.TANGENT_CO_TO_WORLD) {
        let pmat = newp.buildTangentMatrix(tv.uv[0], tv.uv[1]);

        v.load(tv.tanco).multVecMatrix(pmat);
        tv.flag &= ~PVertFlags.TANGENT_CO_TO_WORLD;
        tv.lastHash = tv.calcHash(v);
      }
    }
  }

  drawIds(view3d, gl, selectMask, uniforms, object) {
    super.drawIds(view3d, gl, selectMask, uniforms, object);
  }

  draw(view3d, gl, uniforms, program, object) {
    this.checkTangentVerts();

    gl.enable(gl.BLEND);
    gl.depthMask(false);

    super.draw(view3d, gl, uniforms, program, object);
    gl.disable(gl.BLEND);

    gl.depthMask(true);
    if (this.draw_sm) {
      this.draw_sm.draw(gl, uniforms, program);
    }

    this.updatePatchSmoothCos();

    return;

    let cpy = this.copy();

    cpy._no_vert_check = true;
    let cd_pvert = cpy.verts.customData.getLayerIndex("pvert");
    //return;

    cpy.updatePatchSmoothCos();
    cpy.regenRender();
    cpy.regenTessellation();

    for (let v of cpy.patchVerts) {
      let tv = v.customData[cd_pvert];
      v.load(tv.tanco);
      v.flag |= MeshFlags.UPDATE;
    }


    //this.draw_mesh = cpy;

    let editprogram = Shaders.MeshEditShader;
    Mesh.prototype.drawElements.call(cpy, view3d, gl,
      SelMask.FACE | SelMask.EDGE | SelMask.VERTEX, uniforms, editprogram);
  }

  _save_patch() {
    let ret = [];

    for (let i = 0; i < 4; i++) {
      ret.push([]);

      for (let j = 0; j < 4; j++) {
        ret[i].push(this.patch[i][j].eid);
      }
    }

    return ret;
  }

  loadSTRUCT(reader) {
    super.loadSTRUCT(reader);
    reader(this);

    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        this.patch[i][j] = this.eidMap.get(this.patch[i][j]);
      }
    }

    let cd_pvert = this.verts.customData.getLayerIndex("pvert");

    for (let v of this.verts) {
      v.customData[cd_pvert].oldco.load(v);
    }
  }
}

PatchTester.STRUCT = nstructjs.inherit(PatchTester, Mesh) + `
  patch : array(array(int)) | this._save_patch();
  steps : int;
}`;
nstructjs.register(PatchTester);
DataBlock.register(PatchTester);
SceneObjectData.register(PatchTester);

export class TestPatchSmoothing extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Test Smoothing",
      toolpath: "tangent_tester.smooth",
      inputs  : ToolOp.inherit()
    }
  }

  exec(ctx) {
    let mesh = ctx.mesh;

    mesh.updatePatchSmoothCos();
    let cd_pvert = mesh.verts.customData.getLayerIndex("pvert");

    for (let v of mesh.patchVerts) {
      let pv = v.customData[cd_pvert];

      v.load(pv.tanco);
      v.flag |= MeshFlags.UPDATE;
    }

    mesh.regenRender();
    mesh.graphUpdate();
  }
}

ToolOp.register(TestPatchSmoothing);

export class MakeTangentTester extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Make Tangent Tester",
      toolpath: "tangent_tester.make_tester",
      inputs  : {},
      outputs : {
        newObject: new DataRefProperty(SceneObject)
      }
    }
  }

  exec(ctx) {
    let scene = ctx.scene;
    let ob = new SceneObject();

    let tn = new PatchTester();
    tn.createMesh();

    ctx.datalib.add(tn);
    ctx.datalib.add(ob);

    ob.data = tn;
    tn.lib_addUser(ob);

    scene.add(ob);
    scene.objects.setSelect(ob, true);
    scene.objects.setActive(ob);

    window.updateDataGraph();
    window.redraw_viewport();
  }
}

ToolOp.register(MakeTangentTester);

export function registerToolMode(api) {
  class SubsurfTangentTester extends MeshToolBase {
    constructor() {
      super();

      this.transparentMeshElements = true;
      this.selectMask = SelMask.VERTEX;
      this.drawSelectMask = SelMask.EDGE | SelMask.VERTEX | SelMask.HANDLE;
    }

    static toolModeDefine() {
      return {
        name        : "tanspace_tester",
        uianme      : "Tangent Space Test",
        icon        : Icons.SHOW_LOOPS,
        flag        : 0,
        selectMode  : SelMask.OBJECT,
        description : "Subsurf Tangent Tester",
        transWidgets: [TranslateWidget, ScaleWidget, RotateWidget, InflateWidget]
      }
    }

    static buildHeader(header, addRow) {
      let strip = header.strip();

      strip.prop("scene.selectMaskEnum[VERTEX]");
      strip.prop("scene.selectMaskEnum[EDGE]");
      strip.prop("scene.selectMaskEnum[FACE]");
    }

    static defineAPI(api) {
      let tstruct = super.defineAPI(api);

      return tstruct;
    }

    static buildSettings(container) {
      let panel = container.panel("Test");
      panel.tool("tangent_tester.smooth()");
    }

    defineKeyMap() {
      this.keymap = new KeyMap([
        new HotKey("A", [], "mesh.toggle_select_all(mode='AUTO')"),
        new HotKey("A", ["ALT"], "mesh.toggle_select_all(mode='SUB')"),
        new HotKey("G", [], "view3d.translate(selmask=17)"),
        new HotKey("S", [], "view3d.scale(selmask=17)"),
        new HotKey("R", [], "view3d.rotate(selmask=17)"),
        new HotKey("L", [], "mesh.select_linked(selmask=1)"),
        new HotKey("I", ["CTRL"], "mesh.select_inverse(selmask=1)")
      ]);

      return this.keymap;
    }
  }


  SubsurfTangentTester.STRUCT = nstructjs.inherit(SubsurfTangentTester, ToolMode) + `
}`;

  api.register(SubsurfTangentTester);
};

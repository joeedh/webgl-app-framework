import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../core/simplemesh.js';

import {makeCube} from '../core/mesh_shapes.js';
import {
  IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property, Mat4Property,
  PropFlags, PropTypes, PropSubTypes, ToolOp, ToolFlags, UndoFlags
} from '../path.ux/scripts/pathux.js';
import {dist_to_line_2d} from '../path.ux/scripts/util/math.js';
import {CallbackNode, NodeFlags} from "../core/graph.js";
import {DataRefProperty} from "../core/lib_api.js";
import {DependSocket} from '../core/graphsockets.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import {Icons} from '../editors/icon_enum.js';

import {Mesh, MeshTypes, MeshFlags} from './mesh.js';
import {loopSubdivide, subdivide} from '../subsurf/subsurf_mesh.js';
import {SceneObject} from "../sceneobject/sceneobject.js";
import {MeshToolBase} from "../editors/view3d/tools/meshtool.js";
import {MeshOp} from "./mesh_ops_base.js";
import {GenTypes, ProceduralMesh} from './mesh_gen.js';
import {DefaultMat, Material} from '../core/material.js';
import {saveUndoMesh, loadUndoMesh} from './mesh_ops_base.js';
import {css2matrix} from '../path.ux/scripts/path-controller/util/cssutils.js';
import {splitEdgesSmart2} from './mesh_subdivide.js';
import {triangulateMesh} from './mesh_utils.js';

export class MeshCreateOp extends MeshOp {
  constructor() {
    super();
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if (!("makeNewObject" in args)) {
      if (ctx.toolmode && !(ctx.toolmode instanceof MeshToolBase)) {
        tool.inputs.makeNewObject.setValue(true);
      } else {
        tool.inputs.makeNewObject.setValue(false);
      }
    }


    let mat = new Matrix4();

    let view3d = ctx.view3d;
    if (view3d !== undefined) {
      mat.multiply(view3d.cursor3D);
    }

    tool.inputs.transformMatrix.setValue(mat);

    return tool;
  }

  static tooldef() {
    return {
      inputs: ToolOp.inherit({
        makeNewObject  : new BoolProperty(false),
        transformMatrix: new Mat4Property(),
        _objectID : new IntProperty(-1).private(),
        _meshID : new IntProperty(-1).private()
      }),

      is_modal: true,
      outputs : {
        newObject: new DataRefProperty()
      }
    }
  }

  modalStart(ctx) {
    super.modalStart(ctx);
    this.modalEnd(false);

    if (ctx.scene && ctx.scene.toolmode) {
      let toolmode = ctx.scene.toolmode;

      if (!(toolmode instanceof MeshToolBase)) {
        this.inputs.makeNewObject.setValue(true);
      }
    }

    this.exec(ctx);
  }

  undoPre(ctx) {
    let addnew = this.inputs.makeNewObject.getValue();
    addnew = addnew || !ctx.object || !(ctx.object.data instanceof Mesh);

    let ud = this._undo = {};
    let scene = ctx.scene;

    if (addnew) {
      ud.type = "new";
      ud.selection = [];

      for (let ob of scene.objects.selected) {
        ud.selection.push(ob.lib_id);
      }

      let act = scene.objects.active;

      if (act) {
        ud.active = act.lib_id;
      } else {
        ud.active = -1;
      }
    } else {
      ud.type = "mesh";
      ud.object = ctx.object.lib_id;
      ud.mesh = ctx.object.data.lib_id;
      ud.data = saveUndoMesh(ctx.object.data);
    }
  }

  undo(ctx) {
    let ud = this._undo;

    if (ud.type === "new") {
      let ob = ctx.datalib.get(this.outputs.newObject.getValue());
      let scene = ctx.scene;

      scene.remove(ob);

      if (ob) {
        this.inputs._objectID.setValue(ob.lib_id);
        this.inputs._meshID.setValue(ob.data.lib_id);
      }

      ctx.datalib.remove(ob);
      ob.data.lib_remUser(ob);

      ctx.datalib.remove(ob.data);
      ctx.datalib.remove(ob);

      scene.objects.clearSelection();

      for (let id of ud.selection) {
        let ob = ctx.datalib.get(id);

        if (ob) {
          scene.objects.setSelect(ob, true);
        }
      }

      let act = ctx.datalib.get(ud.active);
      if (act) {
        scene.objects.setActive(act);
      }
    } else {
      let data = ud.data;
      let mesh = ctx.datalib.get(ud.mesh);

      let mesh2 = loadUndoMesh(ctx, data);

      mesh.swapDataBlockContents(mesh2);

      mesh.regenTesellation();
      mesh.recalcNormals();
      mesh.regenRender();
      mesh.regenBVH();
      mesh.regenUVEditor();
    }

    window.redraw_viewport(true);
  }

  calcUndoMem(ctx) {
    let ud = this._undo;

    if (ud.type === "new") {
      return 256;
    } else {
      return ud.data.dview.byteLength;
    }
  }

  /** create new mesh primitive in 'mesh', multiply vertices by matrix */
  internalCreate(ob, mesh, matrix) {
    throw new Error("implement me!");
  }

  exec(ctx) {
    let ob, mesh, mat;
    let create = this.inputs.makeNewObject.getValue();
    create = create || !ctx.object || !ctx.object.data || !(ctx.object.data instanceof Mesh);

    if (create) {
      console.log("creating new object");

      ob = new SceneObject();
      ob.data = new Mesh();

      let oid = this.inputs._objectID.getValue();
      let mid = this.inputs._meshID.getValue();

      if (oid >= 0) {
        ob.lib_id = oid;
      }

      if (mid >= 0) {
        ob.data.lib_id = mid;
      }

      ctx.datalib.add(ob);
      ctx.datalib.add(ob.data);

      ob.data.lib_addUser(ob);
      mesh = ob.data;

      let scene = ctx.scene;

      scene.add(ob);
      ob.loadMatrixToInputs(this.inputs.transformMatrix.getValue());

      scene.objects.setSelect(ob, true);
      scene.objects.setActive(ob, true);

      ob.graphUpdate();
      ob.data.graphUpdate();

      window.redraw_viewport(true);
      window.updateDataGraph(true);

      this.outputs.newObject.setValue(ob);

      //save ids so undo/redo works properly
      this.inputs._objectID.setValue(ob.lib_id);
      this.inputs._meshID.setValue(ob.data.lib_id);

      ob.graphUpdate();

      mat = new Matrix4();
    } else {
      mesh = ctx.object.data;
      ob = ctx.object;

      mat = new Matrix4(this.inputs.transformMatrix.getValue());
    }

    this.internalCreate(ob, mesh, mat);

    mesh.regenTesellation();
    mesh.regenRender();

    window.redraw_viewport(true);
  }
}

export class MakePlaneOp extends MeshCreateOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      toolpath: "mesh.make_plane",
      uiname  : "Make Plane",
      is_modal: true,
      inputs  : ToolOp.inherit({
        size: new FloatProperty(1.0)
      }),
      outputs : ToolOp.inherit()
    }
  }

  internalCreate(ob, mesh, mat) {
    let size = this.inputs.size.getValue()*0.5;

    let v1 = mesh.makeVertex([-size, -size, 0.0]);
    let v2 = mesh.makeVertex([-size, size, 0.0]);
    let v3 = mesh.makeVertex([size, size, 0.0]);
    let v4 = mesh.makeVertex([size, -size, 0.0]);

    v1.multVecMatrix(mat);
    v2.multVecMatrix(mat);
    v3.multVecMatrix(mat);
    v4.multVecMatrix(mat);

    mesh.verts.setSelect(v1, true);
    mesh.verts.setSelect(v2, true);
    mesh.verts.setSelect(v3, true);
    mesh.verts.setSelect(v4, true);

    let f = mesh.makeQuad(v1, v2, v3, v4);
    mesh.faces.setSelect(f, true);

    for (let list of f.lists) {
      for (let l of list) {
        mesh.edges.setSelect(l.e, true);
      }
    }
  }
}

ToolOp.register(MakePlaneOp);

export class MakeCubeOp extends MeshCreateOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      toolpath: "mesh.make_cube",
      uiname  : "Make Cube",
      is_modal: true,
      inputs  : ToolOp.inherit({
        size: new FloatProperty(1.0)
      }),
      outputs : ToolOp.inherit()
    }
  }

  internalCreate(ob, mesh, mat) {
    let size = this.inputs.size.getValue()*0.5;
    let faces = makeCube(mesh).faces;
    let vset = new util.set();

    for (let f of faces) {
      mesh.faces.setSelect(f, true);
      for (let v of f.verts) {
        vset.add(v);
      }
    }

    for (let v of vset) {
      mesh.verts.setSelect(v, true);
      v.mulScalar(size);
    }
  }
}

ToolOp.register(MakeCubeOp);

export class MakeSphere extends MeshCreateOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      toolpath: "mesh.make_sphere",
      uiname  : "Make Sphere",
      is_modal: true,
      inputs  : ToolOp.inherit({
        size     : new FloatProperty(1.0).setRange(0.0001, 10000.0).saveLastValue(),
        segmentsU: new IntProperty(32).setRange(3, 512).saveLastValue(),
        segmentsV: new IntProperty(32).setRange(3, 512).saveLastValue()
      }),
      outputs : ToolOp.inherit()
    }
  }

  internalCreate(ob, mesh, mat) {
    let size = this.inputs.size.getValue()*0.5;
    let totu = this.inputs.segmentsU.getValue();
    let totv = this.inputs.segmentsV.getValue();

    let top = mesh.makeVertex([0, 0, size]);
    let bottom = mesh.makeVertex([0, 0, -size]);
    let matrix = new Matrix4();

    let rows = [];
    let co = new Vector3();

    let dthu = (Math.PI*2.0)/totu;
    let thu = -Math.PI;

    for (let i = 0; i < totu; i++, thu += dthu) {
      let row = new Array(totv);
      row[0] = top;
      row[row.length - 1] = bottom;

      rows.push(row);

      let dthv = Math.PI/(totv - 1);
      let thv = dthv + Math.PI*0.5;

      matrix.makeIdentity();
      matrix.euler_rotate(0, 0, thu);

      for (let j = 1; j < totv - 1; j++, thv += dthv) {
        co[0] = Math.cos(thv)*size;
        co[2] = Math.sin(thv)*size;
        co[1] = 0.0;

        co.multVecMatrix(matrix);

        row[j] = mesh.makeVertex(co);
      }
    }

    for (let i = 0; i < totu; i++) {
      let i2 = (i + 1)%totu;

      let r1 = rows[i];
      let r2 = rows[i2];

      let last = totv - 2;

      mesh.makeTri(r1[0], r1[1], r2[1]);
      mesh.makeTri(r1[last], r1[last + 1], r2[last]);

      for (let j = 1; j < totv - 2; j++) {
        let v1 = r1[j], v2 = r1[j + 1];
        let v3 = r2[j + 1], v4 = r2[j];

        mesh.makeQuad(v1, v2, v3, v4);
      }
    }
  }
}

ToolOp.register(MakeSphere);


export class MakeIcoSphere extends MeshCreateOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      toolpath: "mesh.make_ico_sphere",
      uiname  : "Make Ico Sphere",
      is_modal: true,
      inputs  : ToolOp.inherit({
        size     : new FloatProperty(1.0).setRange(0.0001, 10000.0).saveLastValue(),
        subdivisions: new IntProperty(2).setRange(0, 8).saveLastValue(),
        //size2 : new FloatProperty(1.0),
        //ratio : new FloatProperty(1.0)
      }),
      outputs : ToolOp.inherit()
    }
  }

  internalCreate(ob, mesh, mat) {
    let size = this.inputs.size.getValue()*0.5;
    let levels = this.inputs.subdivisions.getValue();

    //let size2 = this.inputs.size2.getValue();
    //let ratio = this.inputs.ratio.getValue();

    let size2 = 1.0;

    let vs = [
      [0, 0, size],
      [0, 0, -size],
    ];

    let steps = 5;

    let dth = (Math.PI*2.0) / (steps);
    let th = -Math.PI;

    for (let i=0; i<steps; i++, th += dth) {
      let co = new Vector3();

      co[0] = Math.cos(th)*size*size2;
      co[1] = Math.sin(th)*size*size2;
      co[2] = 0.0;

      vs.push(co);
    }

    let cent = new Vector3();
    for (let i=2; i<vs.length; i++) {
      cent.add(vs[i]);
    }
    cent.mulScalar(1.0/3.0);

    console.log("cent", cent);

    for (let i=0; i<vs.length; i++) {
      vs[i] = mesh.makeVertex(vs[i]);

      if (i > 0) {
        //vs[i].sub(cent);
        //vs[i][2] = -size;
      }

      //vs[i].normalize().mulScalar(size);
    }

    for (let i=2; i<vs.length; i++) {
      let i2 = ((i-2) + 1) % (vs.length - 2);
      i2 += 2;

      mesh.makeTri(vs[0], vs[i], vs[i2]);
      mesh.makeTri(vs[1], vs[i2], vs[i]);
    }


    for (let i=0; i<levels; i++) {
      //break
      splitEdgesSmart2(mesh, new Set(mesh.edges));

      cent.zero();
      let tot = 0;
      for (let v of mesh.verts) {
        cent.add(v);
        tot++;
      }

      cent.mulScalar(1.0 / tot);
      let co = new Vector3();

      for (let v of mesh.verts) {
        v.sub(cent).normalize().mulScalar(size);
      }

      for (let v of mesh.verts) {
        let tot = 0;
        co.zero();

        for (let v2 of v.neighbors) {
          co.add(v);
          tot++;
        }

        if (tot === 0) {
          continue;
        }

        co.mulScalar(1.0 / tot);
        v.interp(co, 0.5);
      }

      if (i === levels-1) {
        for (let v of mesh.verts) {
          v.sub(cent).normalize().mulScalar(size);
        }
      }
    }

    for (let v of mesh.verts) {
      mesh.setSelect(v, true);
    }
    for (let e of mesh.edges) {
      mesh.setSelect(e, true);
    }
    for (let f of mesh.faces) {
      mesh.setSelect(f, true);
    }

    mesh.regenTesellation();
    mesh.recalcNormals();
    mesh.regenRender();
    mesh.graphUpdate();
  }
}

ToolOp.register(MakeIcoSphere);

export class CreateFaceOp extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname  : "Create Face",
      toolpath: "mesh.create_face",
      inputs  : ToolOp.inherit()
    }
  }

  execIntern(ctx, mesh) {
    let vs = new Set(mesh.verts.selected.editable);
    let es = new Set(mesh.edges.selected.editable);

    let makeFace = (vs) => {
      let f2;

      if (f2 = mesh.getFace(vs)) {
        console.log("Face already exists", f2, vs);
        ctx.error("Face already exists");
        return;
      }

      for (let i = 0; i < vs.length; i++) {
        for (let j = 0; j < vs.length; j++) {
          if (i !== j && vs[i] === vs[j]) {
            ctx.error("Duplicate verts");
            return;
          }
        }
      }

      if (vs.length < 3) {
        ctx.error("Not enough verts");
        return;
      }

      let f = mesh.makeFace(vs);
      let flip = 0;

      for (let l of f.loops) {
        if (l.radial_next !== l) {
          flip += l.v === l.radial_next.v ? 1 : -1;
        }
      }

      if (flip > 0) {
        mesh.reverseWinding(f);
      }

      f.calcNormal();

      for (let l of f.loops) {
        l.v.flag |= MeshFlags.UPDATE;
        l.e.flag |= MeshFlags.UPDATE;
      }

      f.flag |= MeshFlags.UPDATE;

      mesh.faces.setSelect(f, true);
      mesh.faces.setActive(f);

      return f;
    }

    let vs2 = [];
    for (let v of vs) {
      vs2.push(v);
    }
    vs = vs2;

    if (vs2.length === 3) {
      makeFace(vs2);
    } else if (vs2.length === 4) {
      let orders = [
        [0, 1, 2, 3], //0
        [0, 1, 3, 2], //1
        [0, 2, 1, 3], //2
        [0, 2, 3, 1], //3
        [0, 3, 2, 1], //4
        [0, 3, 1, 2], //5
      ];

      let i = 0;
      for (let [v1, v2, v3, v4] of orders) {
        v1 = vs[v1];
        v2 = vs[v2];
        v3 = vs[v3];
        v4 = vs[v4];

        let n1 = new Vector3(math.normal_tri(v1, v2, v3));
        let n2 = new Vector3(math.normal_tri(v2, v3, v4));
        let n3 = new Vector3(math.normal_tri(v3, v4, v1));
        let n4 = new Vector3(math.normal_tri(v4, v1, v2));

        let bad = n1.dot(n2) < 0 || n2.dot(n3) < 0 || n1.dot(n3) < 0;
        bad = bad || n1.dot(n4) < 0 || n2.dot(n4) < 0;

        console.log(i, "bad", bad);
        if (!bad) {
          makeFace([v1, v2, v3, v4]);
          break;
        }

        i++;
      }
    } else if (vs.length > 4) {
      let startv = vs[0];
      let vset = new Set();

      for (let e of es) {
        vset.add(e.v1);
        vset.add(e.v2);
      }

      for (let v of vs) {
        vset.add(v);
      }

      for (let v of vset) {
        let count = 0;
        for (let e of v.edges) {
          if (vset.has(e.otherVertex(v))) {
            count++;
          }
        }

        if (count === 1) {
          startv = v;
          break;
        }
      }

      let starte;
      for (let e2 of startv.edges) {
        if (vset.has(e2.otherVertex(startv))) {
          starte = e2;
          break;
        }
      }

      if (!starte) {
        ctx.error("Error creating face.");
        return;
      }

      let v = startv;
      let e = starte;

      let vs2 = [];
      let _i = 0;

      do {
        vs2.push(v);
        v = e.otherVertex(v);

        let count = 0;
        let count2 = 0;

        let e3;

        for (let e2 of v.edges) {
          if (vset.has(e2.otherVertex(v))) {
            count2++;
          }

          let boundary = !e2.l || e2.l.radial_next === e2.l;

          if (boundary && !e3 && e2 !== e && vset.has(e2.otherVertex(v))) {
            count++;
            e3 = e2;
          }
        }

        e = e3;

        if (count !== 1) {
          vs2.push(v);
          break;
        }

        if (_i++ > 100000) {
          console.warn("infinite loop error");
          break;
        }
      } while (v !== startv);

      console.log(vs2);
      console.log(vset);

      if (vs2.length > 2) {
        makeFace(vs2);
      }
    }

    mesh.regenTesellation();
    mesh.regenBVH();
    mesh.regenUVEditor();
    mesh.regenRender();
    mesh.regenElementsDraw();
    window.redraw_viewport(true);
  }

  exec(ctx) {
    for (let mesh of this.getMeshes(ctx)) {
      this.execIntern(ctx, mesh);
    }
  }
}

ToolOp.register(CreateFaceOp);

export class CreateMeshGenOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Add Procedural",
      toolpath: "mesh.procedural_add",
      inputs  : {
        type: new EnumProperty(0, GenTypes),
        setActive: new BoolProperty(true)
      },
      outputs : {
        objectId: new IntProperty(-1)
      }
    }
  }

  static canRun(ctx) {
    return ctx.scene;
  }

  exec(ctx) {
    let procmesh = new ProceduralMesh();
    let ob = new SceneObject();

    ctx.datalib.add(ob);
    ctx.datalib.add(procmesh);

    ob.data = procmesh;
    procmesh.lib_addUser(ob);

    let scene = ctx.scene;

    scene.add(ob);
    scene.objects.setSelect(ob, true);

    if (this.inputs.setActive.getValue()) {
      scene.objects.setActive(ob);
    }

    this.outputs.objectId.setValue(ob.lib_id);

    this._undo.newObject = ob.lib_id;

    ob.graphUpdate();
    ob.data.graphUpdate();
    window.redraw_viewport(true);
  }

  undoPre(ctx) {
    this._undo = {
      selectObjects: [],
      activeObject : -1,
      newObject    : -1
    };

    let scene = ctx.scene;

    for (let ob of scene.objects.selected) {
      this._undo.selectObjects.push(ob.lib_id);
    }

    let act = scene.objects.active;
    if (act) {
      this._undo.activeObject = act.lib_id;
    }
  }

  undo(ctx) {
    let scene = ctx.scene;
    let ud = this._undo;

    let ob = ctx.datalib.get(ud.newObject);
    if (ob) {
      scene.remove(ob);

      ctx.datalib.remove(ob.data);
      ctx.datalib.remove(ob);
    }

    let act = ctx.datalib.get(ud.activeObject);
    scene.objects.clearSelection();

    for (let id of ud.selectObjects) {
      let ob = ctx.datalib.get(id);

      if (ob) {
        scene.objects.setSelect(ob, true);
      }
    }

    scene.objects.setActive(act);

    window.redraw_viewport(true);
  }
}

ToolOp.register(CreateMeshGenOp);

export class ProceduralToMesh extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Convert Procedural To Mesh",
      toolpath: "mesh.procedural_to_mesh",
      inputs  : {
        objectId: new IntProperty(-1).private(),
        triangulate: new BoolProperty(false)
      }
    }
  }

  exec(ctx) {
    let ob = this.inputs.objectId.getValue();

    if (ob === -1) {
      ob = ctx.object;
    } else {
      ob = ctx.datalib.get(ob);
    }

    if (!ob) {
      ctx.error("Object does not exist");
      return;
    }

    if (!(ob.data instanceof ProceduralMesh)) {
      ctx.error("Invalid object");
      return;
    }

    let mesh = ob.data.generator.genMesh();
    ctx.datalib.add(mesh);

    ob.data.lib_remUser(ob);
    ctx.datalib.remove(ob.data);

    let mat = Material.getDefaultMaterial(ctx);

    if (mat === DefaultMat) {
      mat = mat.copy();
      ctx.datalib.add(mat);
    }

    if (this.inputs.triangulate.getValue()) {
      mesh.regenTesellation();
      mesh.recalcNormals();
      triangulateMesh(mesh);
    }

    ob.data = mesh;
    mesh.materials.length = 0;
    mesh.materials.push(mat);
    mat.lib_addUser(mesh);

    mesh.regenRender();
    mesh.regenTesellation();
    mesh.recalcNormals();
    mesh.regenBVH();
    mesh.regenElementsDraw();
    mesh.graphUpdate();
    ob.graphUpdate();
  }
}

ToolOp.register(ProceduralToMesh);

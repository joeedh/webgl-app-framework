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
import {SelMask} from '../editors/view3d/selectmode.js';
import {Icons} from '../editors/icon_enum.js';

import {Mesh, MeshTypes, MeshFlags} from './mesh.js';
import {subdivide} from '../subsurf/subsurf_mesh.js';
import {SceneObject} from "../sceneobject/sceneobject.js";
import {MeshToolBase} from "../editors/view3d/tools/meshtool.js";
import {MeshOp} from "./mesh_ops_base.js";

export class MeshCreateOp extends MeshOp {
  constructor() {
    super();
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

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if ("makeNewObject" in args) {
      tool.inputs.makeNewObject.setValue(args.makeNewObject);
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
        transformMatrix: new Mat4Property()
      }),

      is_modal: true,
      outputs : {
        newObject: new DataRefProperty()
      }
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
      ob.data.lib_addUser(ob);
      mesh = ob.data;

      ctx.datalib.add(ob);
      ctx.datalib.add(ob.data);

      ctx.scene.add(ob);
      ob.loadMatrixToInputs(this.inputs.transformMatrix.getValue());

      mat = new Matrix4();
    } else {
      mesh = ctx.object.data;
      ob = ctx.object;

      mat = new Matrix4(this.inputs.transformMatrix.getValue());
    }

    this.internalCreate(ob, mesh, mat);

    mesh.regenRender();
    mesh.regenTesellation();
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

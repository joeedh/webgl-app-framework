import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../core/simplemesh.js';

import {IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property, Mat4Property,
  PropFlags, PropTypes, PropSubTypes} from '../path.ux/scripts/toolprop.js';
import {ToolOp, ToolFlags, UndoFlags} from '../path.ux/scripts/simple_toolsys.js';
import {dist_to_line_2d} from '../path.ux/scripts/math.js';
import {CallbackNode, NodeFlags} from "../core/graph.js";
import {DataRefProperty} from "../core/lib_api.js";
import {DependSocket} from '../core/graphsockets.js';
import * as util from '../util/util.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import {Icons} from '../editors/icon_enum.js';

import {Mesh, MeshTypes, MeshFlags} from './mesh.js';
import {MeshOp} from './mesh_ops_base.js';
import {subdivide} from '../subsurf/subsurf_mesh.js';
import {SceneObject} from "../sceneobject/sceneobject.js";

export class MeshCreateOp extends ToolOp {
  constructor() {
    super();
  }

  static invoke(ctx, args) {
    let tool = new this();

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

  static tooldef() {return {
    inputs : {
      makeNewObject     : new BoolProperty(),
      transformMatrix   : new Mat4Property()
    },

    outputs : {
      newObject : new DataRefProperty()
    }
  }}

  /** create new mesh primitive in 'mesh', multiply vertices by matrix */
  internalCreate(ob, mesh, matrix) {
    throw new Error("implement me!");
  }

  exec(ctx) {
    let ob, mesh, mat;
    let create = this.inputs.makeNewObject.getValue();
    create = create || ctx.object === undefined || !(ctx.object.data instanceof Mesh);

    if (create) {
      ob = new SceneObject();
      ob.data = new Mesh();
      ob.data.lib_addUser(ob);

      ctx.datalib.add(ob);
      ctx.datalib.add(ob.data);

      ctx.scene.add(ob);
      ob.loadMatrixToInputs(this.inputs.transformMatrix.getValue());

      mat = new Matrix4();
    } else {
      ob = ctx.object;
      mesh = ob.data;

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

  static tooldef() {return {
    toolpath : "mesh.make_plane",
    uiname   : "Make Plane",
    inputs   : ToolOp.inherit({
      size : new FloatProperty(1.0)
    }),
    outputs  : ToolOp.inherit()
  }}

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

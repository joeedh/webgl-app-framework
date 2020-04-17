import {DataBlock, DataRef} from '../core/lib_api.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Graph, SocketFlags} from '../core/graph.js';
import {Matrix4, Vector3, Vector4, Quat} from '../util/vectormath.js';
import {Mesh} from '../mesh/mesh.js';
import {Vec3Socket, FloatSocket, DependSocket, Matrix4Socket, Vec4Socket} from '../core/graphsockets.js';
import {Shapes} from '../core/simplemesh_shapes.js';
import {Shaders} from '../editors/view3d/view3d_shaders.js';
import {SceneObjectData} from '../sceneobject/sceneobject_base.js';

export const LightFlags = {
  SELECT : 1,
  HIDE   : 2,
  LOCKED : 4
};

export const LightTypes = {
  POINT     : 1,
  SUN       : 2,
  AREA_DISK : 4,
  AREA_RECT : 8,
  //SPOT      : 16
};

export class Light extends SceneObjectData {
  constructor() {
    super();

    this.type = LightTypes.POINT;
  }

  static blockDefine() {return {
    typeName    : "light",
    defaultName : "Light",
    uiName      : "Light",
    flag        : 0,
    icon        : -1
  }}

  static nodedef() {return {
    inputs : {
      color  : new Vec3Socket("color", undefined, [1, 1, 1]),
      power  : new FloatSocket("power", undefined, 1.0),
      radius  : new FloatSocket("radius", undefined, 0.5),
      distance  : new FloatSocket("distance", undefined, 50.0),
      depend : new DependSocket()
    },
    outputs : {
      depend : new DependSocket()
    }
  }}

  draw(gl, uniforms, program, object) {
    if (program !== Shaders.MeshIDShader) {
      program = Shaders.WidgetMeshShader;
      //program = Shaders.MeshIDShader;
      program.uniforms.color = object.getEditorColor();
    }

    program.uniforms.objectMatrix = object.outputs.matrix.getValue();
    uniforms.objectMatrix = object.outputs.matrix.getValue();

    Shapes.LIGHT.draw(gl, uniforms, program);
  }
}

Light.STRUCT = STRUCT.inherit(Light, SceneObjectData) + `
  type : int;
}
`;

DataBlock.register(Light);
nstructjs.manager.add_class(Light);

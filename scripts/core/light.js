import {DataBlock, DataRef} from './lib_api.js';
import '../path.ux/scripts/struct.js';
let STRUCT = nstructjs.STRUCT;
import {Graph, SocketFlags} from './graph.js';
import {Matrix4, Vector3, Vector4, Quat} from '../util/vectormath.js';
import {Mesh} from '../mesh/mesh.js';
import {Vec3Socket, FloatSocket, DependSocket, Matrix4Socket, Vec4Socket} from './graphsockets.js';
import {WidgetShapes} from '../editors/view3d/widget_shapes.js';
import {Shaders} from '../editors/view3d/view3d_shaders.js';

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

export class Light extends DataBlock {
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
      depend : new DependSocket()
    },
    outputs : {
      depend : new DependSocket()
    }
  }}

  draw(gl, uniforms, unused_program) {
    WidgetShapes.LIGHT.program = Shaders.WidgetMeshShader;
    WidgetShapes.LIGHT.draw(gl, uniforms);
  }
}
Light.STRUCT = STRUCT.inherit(Light, DataBlock) + `
  type : int;
}
`;

DataBlock.register(Light);
nstructjs.manager.add_class(Light);

import {FloatProperty, BoolProperty, PropTypes, EnumProperty, FlagProperty} from '../path.ux/scripts/pathux.js';
import {Icons} from "../editors/icon_enum.js";
import {Curve1D, SplineTemplates, nstructjs} from "../path.ux/scripts/pathux.js";
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {DataBlock, BlockFlags} from "../core/lib_api.js";
import {GraphFlags, NodeFlags} from "../core/graph.js";
import {DependSocket} from '../core/graphsockets.js';
import {RecalcFlags} from '../mesh/mesh_base.js';
import * as mathl from '../mathl/core/mathl.js';

import {TextureShader, TextureShaderFlags} from './texture_base.js';

let proptypemap = {
  [PropTypes.INT] : "int",
  [PropTypes.FLOAT] : "float",
  [PropTypes.VEC3] : "vec3",
  [PropTypes.VEC2] : "vec2",
  [PropTypes.VEC4] : "vec4",
};

export function compileTexShaderJS(shader) {
  let code = shader.genCode();

  let sdef = shader.constructor.textureDefine();

  let uniforms = '';

  for (let k in sdef.uniforms) {
    let prop = sdef.uniforms[k];
    let type = proptypemap[prop.type];

    if (!type) {
      console.log(shader, k, prop);
      console.warn("Failed to set up uniform " + k + " from ToolProperty class " + prop.constructor.name);
      continue;
    }

    uniforms += `uniform ${type} ${k};\n`;
  }

  code = `precision highp float;
  
in vec3 Point;
in vec3 Normal;
in float Time;

out float Value;
out vec4 Color;
out vec3 Normal;

${uniforms}

${code}

void main() {
  Value = fsample(Point, Normal, Time, Color);
}
`;

  console.log(code);

  let shaderjs = mathl.compileJS(code, shader.typeName);
  return shaderjs;
}


window._testTexShaders = function() {
  let texcls = TextureShader.getTextureClass("worley");
  let tex = new texcls();

  let ret = compileTexShaderJS(tex);

  console.log(ret);
  return ret;
}

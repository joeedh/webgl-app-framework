import {PropTypes} from '../path.ux/scripts/pathux.js'
import * as mathl from '../mathl/core/mathl.js'
import {TextureShader} from './texture_base'

let proptypemap = {
  [PropTypes.INT]  : 'int',
  [PropTypes.FLOAT]: 'float',
  [PropTypes.VEC3] : 'vec3',
  [PropTypes.VEC2] : 'vec2',
  [PropTypes.VEC4] : 'vec4',
} as const

export const compileCache = new Map()

export function compileTexShaderJS(shader: TextureShader): mathl.ICompiledCode {
  let code = shader.genCode()
  let sdef = shader.constructor.textureDefine()

  let uniforms = ''

  for (let k in sdef.uniforms) {
    let prop = sdef.uniforms[k]
    let type = proptypemap[prop.type]

    if (!type) {
      console.log(shader, k, prop)
      console.warn('Failed to set up uniform ' + k + ' from ToolProperty class ' + prop.constructor.name)
      continue
    }

    uniforms += `uniform ${type} ${k};\n`
  }

  code = `precision highp float;
  
in vec3 Point;
in vec3 Normal;
in float Time;

out float Value;
out vec4 Color;
out vec3 Normal;

${uniforms}

${sdef.fragmentPre}

${code}

void main() {
  Value = fsample(Point, Normal, Time, Color);
}
`

  console.log(code)

  if (compileCache.has(code)) {
    return compileCache.get(code)
  }

  let shaderjs = mathl.compileJS(code, shader.typeName)

  compileCache.set(code, shaderjs)

  return shaderjs
}

declare global {
  interface Window {
    _testTexShaders: () => unknown
  }
  const _testTexShaders: () => unknown
}

window._testTexShaders = function () {
  let texCls = TextureShader.getTextureClass('worley')!
  let tex = new texCls()
  let result = compileTexShaderJS(tex)

  console.log(result)
  return result
}

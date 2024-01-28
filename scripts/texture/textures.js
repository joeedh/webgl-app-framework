import {TextureShader} from './texture_base.ts';
import {FloatProperty, IntProperty, BoolProperty, EnumProperty, FlagProperty} from '../path.ux/scripts/pathux.js';

export const WorleyTypes = {};

export class WorleyNoise extends TextureShader {
  constructor() {
    super();
  }

  genCode() {
    return `

float fsample(vec3 co, vec3 no, float time, vec4 colorOut) {
  return fract(co[0]*co[1]*co[2]*scale);
}    

    `;
  }

  static textureDefine() {
    return {
      typeName: "worley",
      uiName  : "Worley",
      uniforms: {
        scale: new FloatProperty(),
      },
      params  : {
        type  : new EnumProperty(undefined, WorleyTypes),
        levels: new IntProperty()
      }
    }
  }
};
TextureShader.register(WorleyNoise);

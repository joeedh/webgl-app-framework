export const WorleyTypes: {};
export class WorleyNoise extends TextureShader {
    static textureDefine(): {
        typeName: string;
        uiName: string;
        uniforms: {
            scale: FloatProperty;
        };
        params: {
            type: EnumProperty;
            levels: IntProperty;
        };
    };
}
import { TextureShader } from './texture_base.js';
import { FloatProperty } from '../path.ux/scripts/pathux.js';
import { EnumProperty } from '../path.ux/scripts/pathux.js';
import { IntProperty } from '../path.ux/scripts/pathux.js';

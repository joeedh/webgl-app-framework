export function loadShader(gl: any, sdef: any): ShaderProgram;
export namespace PolygonOffset {
    let pre: string;
    function vertex(posname: any, nearname: any, farname: any): string;
    let fragment: string;
}
export namespace SmoothLine {
    let pre_1: string;
    export { pre_1 as pre };
    export let fragmentPre: string;
    export function vertex_1(pname: any): string;
    export { vertex_1 as vertex };
    export function fragment_1(alphaname: any): string;
    export { fragment_1 as fragment };
}
export namespace BasicLineShader {
    let vertex_2: string;
    export { vertex_2 as vertex };
    let fragment_2: string;
    export { fragment_2 as fragment };
    export namespace uniforms {
        let alpha: number;
        let objectMatrix: Matrix4;
    }
    export let attributes: string[];
}
export namespace ObjectLineShader {
    let vertex_3: string;
    export { vertex_3 as vertex };
    let fragment_3: string;
    export { fragment_3 as fragment };
    export namespace uniforms_1 {
        let alpha_1: number;
        export { alpha_1 as alpha };
        export let uColor: number[];
        export let shift: number[];
        let objectMatrix_1: Matrix4;
        export { objectMatrix_1 as objectMatrix };
    }
    export { uniforms_1 as uniforms };
    let attributes_1: string[];
    export { attributes_1 as attributes };
}
export namespace BasicLitMesh {
    let vertex_4: string;
    export { vertex_4 as vertex };
    let fragment_4: string;
    export { fragment_4 as fragment };
    export namespace uniforms_2 {
        let alpha_2: number;
        export { alpha_2 as alpha };
        let objectMatrix_2: Matrix4;
        export { objectMatrix_2 as objectMatrix };
    }
    export { uniforms_2 as uniforms };
    let attributes_2: string[];
    export { attributes_2 as attributes };
}
export namespace BasicLitMeshTexture {
    let vertex_5: string;
    export { vertex_5 as vertex };
    let fragment_5: string;
    export { fragment_5 as fragment };
    export namespace uniforms_3 {
        let alpha_3: number;
        export { alpha_3 as alpha };
        let objectMatrix_3: Matrix4;
        export { objectMatrix_3 as objectMatrix };
    }
    export { uniforms_3 as uniforms };
    let attributes_3: string[];
    export { attributes_3 as attributes };
}
export namespace FlatMeshTexture {
    let vertex_6: string;
    export { vertex_6 as vertex };
    let fragment_6: string;
    export { fragment_6 as fragment };
    export namespace uniforms_4 {
        let alpha_4: number;
        export { alpha_4 as alpha };
        let objectMatrix_4: Matrix4;
        export { objectMatrix_4 as objectMatrix };
    }
    export { uniforms_4 as uniforms };
    let attributes_4: string[];
    export { attributes_4 as attributes };
}
export namespace SculptShader {
    let vertex_7: string;
    export { vertex_7 as vertex };
    let fragment_7: string;
    export { fragment_7 as fragment };
    export namespace uniforms_5 {
        let alpha_5: number;
        export { alpha_5 as alpha };
        export let hasTexture: number;
        let uColor_1: number[];
        export { uColor_1 as uColor };
        let objectMatrix_5: Matrix4;
        export { objectMatrix_5 as objectMatrix };
    }
    export { uniforms_5 as uniforms };
    let attributes_5: string[];
    export { attributes_5 as attributes };
}
export namespace SculptShaderSimple {
    let vertex_8: string;
    export { vertex_8 as vertex };
    let fragment_8: string;
    export { fragment_8 as fragment };
    export namespace uniforms_6 {
        let alpha_6: number;
        export { alpha_6 as alpha };
        let hasTexture_1: number;
        export { hasTexture_1 as hasTexture };
        let uColor_2: number[];
        export { uColor_2 as uColor };
        let objectMatrix_6: Matrix4;
        export { objectMatrix_6 as objectMatrix };
    }
    export { uniforms_6 as uniforms };
    let attributes_6: string[];
    export { attributes_6 as attributes };
}
export namespace SculptShaderHexDeform {
    let vertex_9: string;
    export { vertex_9 as vertex };
    let fragment_9: string;
    export { fragment_9 as fragment };
    export namespace uniforms_7 {
        let alpha_7: number;
        export { alpha_7 as alpha };
        let hasTexture_2: number;
        export { hasTexture_2 as hasTexture };
        let uColor_3: number[];
        export { uColor_3 as uColor };
        let objectMatrix_7: Matrix4;
        export { objectMatrix_7 as objectMatrix };
    }
    export { uniforms_7 as uniforms };
    let attributes_7: string[];
    export { attributes_7 as attributes };
}
export namespace MeshEditShader {
    let vertex_10: string;
    export { vertex_10 as vertex };
    let fragment_10: string;
    export { fragment_10 as fragment };
    export namespace uniforms_8 {
        let alpha_8: number;
        export { alpha_8 as alpha };
        let objectMatrix_8: Matrix4;
        export { objectMatrix_8 as objectMatrix };
    }
    export { uniforms_8 as uniforms };
    let attributes_8: string[];
    export { attributes_8 as attributes };
}
export namespace MeshIDShader {
    let vertex_11: string;
    export { vertex_11 as vertex };
    let fragment_11: string;
    export { fragment_11 as fragment };
    export namespace uniforms_9 {
        let objectMatrix_9: Matrix4;
        export { objectMatrix_9 as objectMatrix };
        export let pointSize: number;
    }
    export { uniforms_9 as uniforms };
    let attributes_9: string[];
    export { attributes_9 as attributes };
}
export namespace MeshLinearZShader {
    let vertex_12: string;
    export { vertex_12 as vertex };
    let fragment_12: string;
    export { fragment_12 as fragment };
    export namespace uniforms_10 {
        let objectMatrix_10: Matrix4;
        export { objectMatrix_10 as objectMatrix };
    }
    export { uniforms_10 as uniforms };
    let attributes_10: string[];
    export { attributes_10 as attributes };
}
export namespace NormalPassShader {
    let vertex_13: string;
    export { vertex_13 as vertex };
    let fragment_13: string;
    export { fragment_13 as fragment };
    export namespace uniforms_11 {
        let alpha_9: number;
        export { alpha_9 as alpha };
        let objectMatrix_11: Matrix4;
        export { objectMatrix_11 as objectMatrix };
    }
    export { uniforms_11 as uniforms };
    let attributes_11: string[];
    export { attributes_11 as attributes };
}
export namespace BasicLineShader2D {
    let vertex_14: string;
    export { vertex_14 as vertex };
    let fragment_14: string;
    export { fragment_14 as fragment };
    export namespace uniforms_12 {
        let alpha_10: number;
        export { alpha_10 as alpha };
    }
    export { uniforms_12 as uniforms };
    let attributes_12: string[];
    export { attributes_12 as attributes };
}
export namespace WidgetMeshShader {
    let vertex_15: string;
    export { vertex_15 as vertex };
    let fragment_15: string;
    export { fragment_15 as fragment };
    export namespace uniforms_13 {
        let pointSize_1: number;
        export { pointSize_1 as pointSize };
        let objectMatrix_12: Matrix4;
        export { objectMatrix_12 as objectMatrix };
        export let color: number[];
    }
    export { uniforms_13 as uniforms };
    let attributes_13: string[];
    export { attributes_13 as attributes };
}
export namespace CellularNoiseFragment {
    let fragment_16: string;
    export { fragment_16 as fragment };
}
export namespace SimplexGradientNoise {
    let fragment_17: string;
    export { fragment_17 as fragment };
}
export const TexPaintShaderLib: "\nfloat hash(float f) {\n  float sign = f < 0.0 ? -1.0 : 1.0;\n  f *= sign;\n\n  float f2 = fract(f);\n  f2 = sign < 0.0 ? 1.0 - f2 : f2;\n\n  f = f*3.316624*128.0*f2;\n\n  bool sign2 = f < 0.0;\n  f = fract(f);\n\n  if (sign2) {\n    f = 1.0 - f;\n  }\n\n  return f;\n}\n\nfloat hash3(float x, float y, float z) {\n  float f = x*sqrt(3.0) + y*sqrt(5.0)*10.0 + z*sqrt(7.0)*100.0;\n  return hash(f);\n}\n\nvec2 rot2d(vec2 p, float th) {\n  return vec2(cos(th)*p[0] + sin(th)*p[1], cos(th)*p[1] - sin(th)*p[0]);\n}\n\nfloat tent(float f) {\n  return 1.0 - abs(fract(f)-0.5)*2.0;\n}\n";
export namespace TexturePaintShader {
    let vertex_16: string;
    export { vertex_16 as vertex };
    let fragment_18: string;
    export { fragment_18 as fragment };
    export namespace uniforms_14 {
        let pointSize_2: number;
        export { pointSize_2 as pointSize };
        let objectMatrix_13: Matrix4;
        export { objectMatrix_13 as objectMatrix };
        export let projectionMatrix: Matrix4;
        let color_1: number[];
        export { color_1 as color };
    }
    export { uniforms_14 as uniforms };
    let attributes_14: string[];
    export { attributes_14 as attributes };
}
export namespace LineTriStripShader {
    let vertex_17: string;
    export { vertex_17 as vertex };
    let fragment_19: string;
    export { fragment_19 as fragment };
    export namespace uniforms_15 {
        let pointSize_3: number;
        export { pointSize_3 as pointSize };
        let objectMatrix_14: Matrix4;
        export { objectMatrix_14 as objectMatrix };
        let color_2: number[];
        export { color_2 as color };
    }
    export { uniforms_15 as uniforms };
    let attributes_15: string[];
    export { attributes_15 as attributes };
}
export namespace SubSurfPatchShader {
    let vertex_18: string;
    export { vertex_18 as vertex };
}
export namespace ShaderDef {
    export { BasicLineShader };
    export { ObjectLineShader };
    export { BasicLineShader2D };
    export { BasicLitMesh };
    export { BasicLitMeshTexture };
    export { MeshEditShader };
    export { MeshIDShader };
    export { WidgetMeshShader };
    export { NormalPassShader };
    export { MeshLinearZShader };
    export { SculptShader };
    export { SculptShaderSimple };
    export { LineTriStripShader };
    export { TexturePaintShader };
    export { FlatMeshTexture };
    export { SculptShaderHexDeform };
}
export let Shaders: {};
import { ShaderProgram } from "../core/webgl.js";
import { Matrix4 } from '../util/vectormath.js';

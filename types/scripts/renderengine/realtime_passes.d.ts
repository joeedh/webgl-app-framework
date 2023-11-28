export class BasePass extends RenderPass {
    static nodedef(): {
        uiname: string;
        name: string;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
        shader: string;
    };
}
export class NormalPass extends RenderPass {
    static nodedef(): {
        uiname: string;
        name: string;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
        shaderPre: string;
        shader: string;
    };
}
export class OutputPass extends RenderPass {
    static nodedef(): {
        uiname: string;
        name: string;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
        shaderPre: string;
        shader: string;
    };
}
export class AOPass extends RenderPass {
    static nodedef(): {
        uiname: string;
        name: string;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
        shaderPre: string;
        shader2: string;
        shader: string;
    };
}
export class BlurPass extends RenderPass {
    static nodedef(): {
        uiname: string;
        name: string;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
        shaderPre: string;
        shader2: string;
        shader: string;
    };
    getDebugName(): "blur_y" | "blur_x";
    shaderPre: any;
}
export class DenoiseBlur extends RenderPass {
    static nodedef(): {
        uiname: string;
        name: string;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
        shaderPre: string;
        shader: string;
    };
    getDebugName(): "denoise_y" | "denoise_x";
    shaderPre: any;
}
export class SharpenPass extends RenderPass {
    static nodedef(): {
        uiname: string;
        name: string;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
        shaderPre: string;
        uniforms: {
            sharpen: number;
        };
        shader: string;
    };
    getDebugName(): "SharpenY" | "SharpenX";
    shaderPre: any;
}
export class AccumPass extends RenderPass {
    static nodedef(): {
        uiname: string;
        name: string;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
        shaderPre: string;
        shader: string;
    };
}
export class PassThruPass extends RenderPass {
    static nodedef(): {
        uiname: string;
        name: string;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
        shader: string;
    };
}
import { RenderPass } from "./renderpass.js";

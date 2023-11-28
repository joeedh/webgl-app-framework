export namespace CubeMapOrder {
    let POSX: number;
    let NEGX: number;
    let POSY: number;
    let NEGY: number;
    let POSZ: number;
    let NEGZ: number;
}
export class CubeFace {
    constructor(gl: any, mat: any, cmat: any, size: any, face: any, cubeColor: any, cubeDepth: any, near: any, far: any);
    fbo: FBO;
    _queueResetSamples: boolean;
    cubeColor: any;
    cubeDepth: any;
    near: any;
    far: any;
    cameraMatrix: any;
    size: any;
    projectionMatrix: Matrix4;
    iprojectionMatrix: Matrix4;
    face: any;
    render(gl: any, scene: any, light: any): void;
}
export class CubeMap extends Array<any> {
    constructor(size: any, near: any, far: any);
    near: any;
    far: any;
    size: any;
    texDepth: any;
    texColor: any;
    gl: any;
    getUniformValue(): any;
    makeCubeTex(gl: any): void;
    gltex: CubeTexture;
}
export const LightIdSymbol: unique symbol;
export class ShaderCacheItem {
    constructor(shader: any, gen: any);
    shader: any;
    gen: any;
}
export class ShaderCache {
    cache: {};
    gen: number;
    drawStart(gl: any): void;
    has(id: any): boolean;
    remove(id: any): void;
    destroy(gl: any): void;
    add(gl: any, id: any, shader: any): void;
    get(id: any): any;
    drawEnd(gl: any): void;
}
export class RenderLight {
    constructor(light: any, id: any);
    light: any;
    _digest: util.HashDigest;
    id: any;
    shadowmap: any;
    co: Vector3;
    seed: number;
    calcUpdateHash(): number;
    calcCo(): void;
    update(light: any, uSample: any): void;
}
export class RenderSettings {
    sharpen: boolean;
    filterWidth: number;
    sharpenWidth: number;
    sharpenFac: number;
    minSamples: number;
    ao: boolean;
    calcUpdateHash(): number;
}
export namespace RenderSettings {
    let STRUCT: string;
}
export class RealtimeEngine extends RenderEngine {
    constructor(view3d: any, settings: any);
    _digest: util.HashDigest;
    renderSettings: any;
    projmat: Matrix4;
    lights: {};
    light_idgen: number;
    view3d: any;
    gl: any;
    scene: any;
    _last_envlight_hash: number;
    _last_camerahash: any;
    cache: ShaderCache;
    rendergraph: RenderGraph;
    uSample: number;
    weightSum: number;
    maxSamples: number;
    shaderUpdateGen: number;
    _last_update_hash: any;
    rebuildGraph(): void;
    basePass: BasePass;
    norPass: NormalPass;
    outPass: OutputPass;
    accumOutPass: AccumPass;
    passThru: PassThruPass;
    aoPass: AOPass | DenoiseBlur;
    sharpx: SharpenPass;
    sharpy: SharpenPass;
    updateSharpen(): void;
    update(gl: any): void;
    addLight(light: any): RenderLight;
    updateLight(light: any): void;
    updateLights(): void;
    _getLightId(light: any): any;
    updateSceneLights(): void;
    renderShadowMaps(): void;
    render(camera: any, gl: any, viewbox_pos: any, viewbox_size: any, scene: any, extraDrawCB: any, ...args: any[]): void;
    _queueResetSamples: boolean;
    _render(camera: any, gl: any, viewbox_pos: any, viewbox_size: any, scene: any, extraDrawCB: any): void;
    camera: any;
    extraDrawCB: any;
    renderShadowCube(rlight: any, co: any, near?: number, far?: number): void;
    getProjMat(camera: any, viewbox_size: any): Matrix4;
    render_normals(camera: any, gl: any, viewbox_pos: any, viewbox_size: any, scene: any): void;
    getNullTex(gl: any): any;
    queueResetSamples(): void;
    resetSamples(): void;
    render_intern(camera: any, gl: any, viewbox_pos: any, viewbox_size: any, scene: any, shiftx?: number, shifty?: number): Matrix4;
}
import { FBO } from '../core/fbo.js';
import { Matrix4 } from '../util/vectormath.js';
import { CubeTexture } from '../core/webgl.js';
import * as util from '../util/util.js';
import { Vector3 } from '../util/vectormath.js';
import { RenderEngine } from "./renderengine_base.js";
import { RenderGraph } from "./renderpass.js";
import { BasePass } from "./realtime_passes.js";
import { NormalPass } from "./realtime_passes.js";
import { OutputPass } from "./realtime_passes.js";
import { AccumPass } from "./realtime_passes.js";
import { PassThruPass } from "./realtime_passes.js";
import { AOPass } from "./realtime_passes.js";
import { DenoiseBlur } from "./realtime_passes.js";
import { SharpenPass } from "./realtime_passes.js";

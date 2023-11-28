export function makeDefaultBrushes(): {};
export function makeDefaultBrushes_MediumRes(): {};
export function setBrushSet(set: any): void;
/**
 Ensures that at least one brush instance of each brush tool type
 exists in the datalib
 * */
export function getBrushes(ctx: any, overrideDefaultBrushes?: boolean): any[];
export namespace BrushSpacingModes {
    let NONE: number;
    let EVEN: number;
}
export namespace BrushFlags {
    let SELECT: number;
    let SHARED_SIZE: number;
    let DYNTOPO: number;
    let INVERT_CONCAVE_FILTER: number;
    let MULTIGRID_SMOOTH: number;
    let PLANAR_SMOOTH: number;
    let CURVE_RAKE_ONLY_POS_X: number;
    let INVERT: number;
    let LINE_FALLOFF: number;
    let SQUARE: number;
    let USE_LINE_CURVE: number;
}
export namespace DynTopoModes {
    let SCREEN: number;
    let WORLD: number;
}
export namespace SculptTools {
    let CLAY: number;
    let FILL: number;
    let SCRAPE: number;
    let SMOOTH: number;
    let DRAW: number;
    let SHARP: number;
    let INFLATE: number;
    let SNAKE: number;
    let TOPOLOGY: number;
    let GRAB: number;
    let HOLE_FILLER: number;
    let MASK_PAINT: number;
    let WING_SCRAPE: number;
    let PINCH: number;
    let DIRECTIONAL_FAIR: number;
    let SLIDE_RELAX: number;
    let BVH_DEFORM: number;
    let PAINT: number;
    let PAINT_SMOOTH: number;
    let COLOR_BOUNDARY: number;
    let TEXTURE_PAINT: number;
    let FACE_SET_DRAW: number;
}
export namespace DynTopoFlags {
    let SUBDIVIDE: number;
    let COLLAPSE: number;
    let ENABLED: number;
    let FANCY_EDGE_WEIGHTS: number;
    let QUAD_COLLAPSE: number;
    let ALLOW_VALENCE4: number;
    let DRAW_TRIS_AS_QUADS: number;
    let ADAPTIVE: number;
}
export namespace DynTopoOverrides {
    let SUBDIVIDE_1: number;
    export { SUBDIVIDE_1 as SUBDIVIDE };
    let COLLAPSE_1: number;
    export { COLLAPSE_1 as COLLAPSE };
    let ENABLED_1: number;
    export { ENABLED_1 as ENABLED };
    let FANCY_EDGE_WEIGHTS_1: number;
    export { FANCY_EDGE_WEIGHTS_1 as FANCY_EDGE_WEIGHTS };
    let QUAD_COLLAPSE_1: number;
    export { QUAD_COLLAPSE_1 as QUAD_COLLAPSE };
    let ALLOW_VALENCE4_1: number;
    export { ALLOW_VALENCE4_1 as ALLOW_VALENCE4 };
    let DRAW_TRIS_AS_QUADS_1: number;
    export { DRAW_TRIS_AS_QUADS_1 as DRAW_TRIS_AS_QUADS };
    let ADAPTIVE_1: number;
    export { ADAPTIVE_1 as ADAPTIVE };
    export let VALENCE_GOAL: number;
    export let EDGE_SIZE: number;
    export let DECIMATE_FACTOR: number;
    export let SUBDIVIDE_FACTOR: number;
    export let MAX_DEPTH: number;
    export let EDGE_COUNT: number;
    let NONE_1: number;
    export { NONE_1 as NONE };
    export let REPEAT: number;
    export let SPACING_MODE: number;
    export let SPACING: number;
    export let EDGEMODE: number;
    export let SUBDIV_MODE: number;
    export let EVERYTHING: number;
}
export namespace SubdivModes {
    let SIMPLE: number;
    let SMART: number;
}
export class DynTopoSettings {
    static apiKeyToOverride(k: any): any;
    overrideMask: number;
    subdivMode: number;
    edgeMode: number;
    valenceGoal: number;
    edgeSize: number;
    decimateFactor: number;
    subdivideFactor: number;
    maxDepth: number;
    spacing: number;
    spacingMode: number;
    flag: number;
    edgeCount: number;
    repeat: number;
    calcHashKey(d?: util.HashDigest): number;
    equals(b: any): boolean;
    loadDefaults(defaults: any): this;
    load(b: any): this;
    copy(): DynTopoSettings;
}
export namespace DynTopoSettings {
    let STRUCT: string;
}
export const SculptIcons: {};
export class BrushDynChannel {
    constructor(name?: string);
    name: string;
    curve: any;
    useDynamics: boolean;
    calcHashKey(digest?: util.HashDigest): number;
    equals(b: any): boolean;
    loadSTRUCT(reader: any): void;
    copyTo(b: any): void;
}
export namespace BrushDynChannel {
    let STRUCT_1: string;
    export { STRUCT_1 as STRUCT };
}
export class BrushDynamics {
    channels: any[];
    calcHashKey(d?: util.HashDigest): number;
    equals(b: any): boolean;
    loadDefault(name: any): void;
    hasChannel(name: any): boolean;
    getChannel(name: any, autoCreate?: boolean): any;
    getCurve(channel: any): any;
    loadSTRUCT(reader: any): void;
    copyTo(b: any): void;
}
export namespace BrushDynamics {
    let STRUCT_2: string;
    export { STRUCT_2 as STRUCT };
}
export class SculptBrush extends DataBlock {
    static nodedef(): {
        name: string;
        uiname: string;
        flag: number;
    };
    flag: number;
    smoothRadiusMul: number;
    smoothProj: number;
    spacingMode: number;
    texUser: ProceduralTexUser;
    concaveFilter: number;
    dynTopo: DynTopoSettings;
    rakeCurvatureFactor: number;
    tool: number;
    sharp: number;
    strength: number;
    spacing: number;
    radius: number;
    autosmooth: number;
    autosmoothInflate: number;
    planeoff: number;
    rake: number;
    pinch: number;
    normalfac: number;
    falloff: any;
    falloff2: any;
    color: Vector4;
    bgcolor: Vector4;
    dynamics: BrushDynamics;
    equals(b: any, fast?: boolean, ignoreRadiusStrength?: boolean): boolean;
    calcHashKey(digest?: util.HashDigest, ignoreRadiusStrength?: boolean): number;
    calcMemSize(): number;
    copy(addLibUsers?: boolean): any;
    dataLink(getblock: any, getblock_adduser: any): void;
}
export class PaintToolSlot {
    constructor(tool: any);
    brush: any;
    tool: any;
    dataLink(owner: any, getblock: any, getblock_addUser: any): void;
    setBrush(brush: any, scene: any): void;
    resolveBrush(ctx: any): any;
    getBrushList(ctx: any): any[];
}
export namespace PaintToolSlot {
    let STRUCT_3: string;
    export { STRUCT_3 as STRUCT };
}
export namespace BrushSets {
    let HIGH_RES: number;
    let MEDIUM_RES: number;
}
export const BrushSetFactories: (typeof makeDefaultBrushes)[];
export const DefaultBrushes: {};
export const brushSet: any;
import * as util from '../util/util.js';
import { DataBlock } from "../core/lib_api.js";
import { ProceduralTexUser } from '../texture/proceduralTex.js';
import { Vector4 } from '../util/vectormath.js';

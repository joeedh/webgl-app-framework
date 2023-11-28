export function makeDefaultShaderNetwork(): ShaderNetwork;
export namespace MaterialFlags {
    let SELECT: number;
}
export namespace ShadowFlags {
    let NO_SHADOWS: number;
}
export class ShadowSettings {
    bias: number;
    flag: number;
    copyTo(b: any): void;
    copy(): ShadowSettings;
}
export namespace ShadowSettings {
    let STRUCT: string;
}
export class ShaderNetwork extends DataBlock {
    static nodedef(): {
        uiname: string;
        name: string;
        inputs: {};
        outputs: {
            onTopologyChange: DependSocket;
        };
    };
    shadow: ShadowSettings;
    flag: number;
    graph: Graph;
    _regen: boolean;
    _last_update_hash: any;
    usedNodes: Set<any>;
    updateHash: number;
    copyTo(b: any, arg: any): void;
    getUsedNodes(): Set<any>;
    calcUpdateHash(): number;
    _on_flag_resort(): void;
    flagRegen(): void;
    dataLink(getblock: any, getblock_addUser: any): void;
    generate(scene: any, rlights: any, defines?: string): {
        fragment: any;
        vertex: any;
        uniforms: {};
        attributes: string[];
        setUniforms(gl: any, graph: any, uniforms: any): void;
        compile(gl: any): import("../core/webgl.js").ShaderProgram;
    };
}
import { DataBlock } from '../core/lib_api.js';
import { Graph } from '../core/graph.js';
import { DependSocket } from "../core/graphsockets.js";
export { ShaderNetworkClass, ShaderNodeTypes, ShaderGenerator } from "./shader_nodes.js";

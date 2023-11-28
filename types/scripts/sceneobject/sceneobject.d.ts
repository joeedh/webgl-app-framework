export function composeObjectMatrix(loc: any, rot: any, scale: any, rotorder: any, mat?: Matrix4): Matrix4;
export namespace ObjectFlags {
    let SELECT: number;
    let HIDE: number;
    let LOCKED: number;
    let HIGHLIGHT: number;
    let ACTIVE: number;
    let INTERNAL: number;
    let DRAW_WIREFRAME: number;
}
export let Colors: {
    [x: number]: number[];
    0: number[];
};
export class SceneObject extends DataBlock {
    static nodedef(): {
        name: string;
        inputs: {
            depend: DependSocket;
            matrix: Matrix4Socket;
            color: Vec4Socket;
            loc: Vec3Socket;
            rot: Vec3Socket;
            rotOrder: EnumSocket;
            scale: Vec3Socket;
        };
        outputs: {
            color: Vec4Socket;
            matrix: Matrix4Socket;
            depend: DependSocket;
        };
    };
    constructor(data?: any);
    data: any;
    flag: number;
    get rotationEuler(): any;
    set rotationOrder(arg: any);
    get rotationOrder(): any;
    get location(): any;
    get scale(): any;
    set material(arg: any);
    get material(): any;
    get locationWorld(): any;
    getEditorColor(): number[];
    graphDisplayName(): string;
    ensureGraphConnection(): boolean;
    exec(): void;
    loadMatrixToInputs(mat: any): void;
    copyTo(b: any): void;
    copy(addLibUsers?: boolean): any;
    getBoundingBox(): any;
    dataLink(getblock: any, getblock_addUser: any): void;
    draw(view3d: any, gl: any, uniforms: any, program: any): void;
    drawWireframe(view3d: any, gl: any, uniforms: any, program: any): void;
    drawOutline(view3d: any, gl: any, uniforms: any, program: any): void;
    drawIds(view3d: any, gl: any, selectMask: any, uniforms: any): void;
}
import { Matrix4 } from '../util/vectormath.js';
import { DataBlock } from '../core/lib_api.js';
import { DependSocket } from '../core/graphsockets.js';
import { Matrix4Socket } from '../core/graphsockets.js';
import { Vec4Socket } from '../core/graphsockets.js';
import { Vec3Socket } from '../core/graphsockets.js';
import { EnumSocket } from '../core/graphsockets.js';

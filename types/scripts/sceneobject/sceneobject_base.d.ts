export const ObjectDataTypes: any[];
export class SceneObjectData extends DataBlock {
    static dataDefine(): {
        name: string;
        selectMask: number;
        tools: typeof StandardTools;
    };
    static nodedef(): {
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
        flag: {
            data: any;
        };
    };
    static getTools(): typeof StandardTools;
    materials: any[];
    usesMaterial: boolean;
    applyMatrix(matrix?: any): this;
    exec(): void;
    copy(): void;
    getOwningObject(): any;
    copyAddUsers(): void;
    getBoundingBox(): Vector3[];
    /**draws IDs.  no need for packing,
     they're drawn into a float framebuffer
  
     red should be sceneobject id + 1.
     green should be any sub-id (also + 1) provided by
     sceneobjectdata, e.g. vertices in a mesh.
     */
    drawIds(view3d: any, gl: any, selectMask: any, uniforms: any, object: any): void;
    draw(view3d: any, gl: any, uniforms: any, program: any, object: any): void;
    drawWireframe(view3d: any, gl: any, uniforms: any, program: any, object: any): void;
    drawOutline(view3d: any, gl: any, uniforms: any, program: any, object: any, ...args: any[]): void;
    onContextLost(e: any): void;
    dataLink(getblock: any, getblock_addUser: any): void;
}
import { DataBlock } from '../core/lib_api.js';
import { Vector3 } from '../util/vectormath.js';
import { StandardTools } from './stdtools.js';

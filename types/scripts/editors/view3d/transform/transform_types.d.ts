export class MeshTransType extends TransDataType {
    /**FIXME this only handles the active mesh object, it should
      iterate over ctx.selectedMeshObjets*/
    static genData(ctx: any, selectmode: any, propmode: any, propradius: any): TransDataList;
    static calcUndoMem(ctx: any, undodata: any): number;
    static getOriginMatrix(ctx: any, list: any, selmask: any, spacemode: any, space_matrix_out: any): Matrix4;
    static undoPre(ctx: any, elemlist: any): {
        cos: {};
        nos: {};
        fnos: {};
        fcos: {};
    };
    static getCenter(ctx: any, list: any, selmask: any, spacemode: any, space_matrix_out: any): any;
    static calcAABB(ctx: any, selmask: any): Vector3[];
}
export class ObjectTransform {
    constructor(ob: any);
    invmatrix: Matrix4;
    tempmat: Matrix4;
    matrix: Matrix4;
    loc: Vector3;
    rot: Vector3;
    scale: Vector3;
    ob: any;
    copy(): ObjectTransform;
}
export class ObjectTransType extends TransDataType {
    static genData(ctx: any, selectmode: any, propmode: any, propradius: any): TransDataList;
    static calcUndoMem(ctx: any, undodata: any): number;
    static undoPre(ctx: any, elemlist: any): {};
    static getOriginMatrix(ctx: any, list: any, selmask: any, spacemode: any, space_matrix_out: any): Matrix4;
    static getCenter(ctx: any, list: any, selmask: any, spacemode: any, space_matrix_out: any): Vector3;
    static calcAABB(ctx: any, selmask: any): any[];
}
import { TransDataType } from './transform_base.js';
import { TransDataList } from './transform_base.js';
import { Matrix4 } from '../../../util/vectormath.js';
import { Vector3 } from '../../../util/vectormath.js';

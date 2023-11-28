/**
 *
 * Iterates over pathset.  If
 * a path refers to a SceneObject
 * or is "_all_objects_",
 *
 * Each mesh will
 * have a .ownerMatrix property set referring
 * to sceneobject.outputs.matrix.getValue()
 *
 * Along with .ownerId referencing sceneobject.lib_id
 * And .meshDataPath for origin src API data path
 * */
export function resolveMeshes(ctx: any, pathset: any): Generator<any, void, unknown>;
export function saveUndoMesh(mesh: any): {
    dview: DataView;
    drawflag: any;
};
export function loadUndoMesh(ctx: any, data: any): any;
export class MeshOp extends View3DOp {
    static tooldef(): {
        inputs: any;
    };
    getActiveMesh(ctx: any): any;
    getMeshes(ctx: any): any[];
    execPost(ctx: any): void;
    calcUndoMem(ctx: any): number;
    undoPre(ctx: any): void;
    _undo: {};
    undo(ctx: any): void;
}
export class MeshDeformOp extends MeshOp {
    calcUndoMem(): number;
}
import { View3DOp } from '../editors/view3d/view3d_ops.js';

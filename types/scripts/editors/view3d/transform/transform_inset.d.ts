export class InsetTransformOp extends TransformOp {
    static tooldef(): {
        uiname: string;
        description: string;
        toolpath: string;
        is_modal: boolean;
        inputs: any;
        icon: number;
    };
    constructor(start_mpos: any);
    startMpos: Vector2;
    scale: number;
    plane: Vector3;
    regions: Region[];
    first: boolean;
    getRegions(mesh: any): Region[];
}
import { TransformOp } from './transform_ops.js';
import { Vector2 } from '../../../path.ux/scripts/pathux.js';
import { Vector3 } from '../../../path.ux/scripts/pathux.js';
declare class Region {
    faces: Set<any>;
    verts: Set<any>;
    edges: Set<any>;
    outervs: Set<any>;
    outeres: Set<any>;
    startCos: Map<any, any>;
    dirmap: Map<any, any>;
    no: Vector3;
}
export {};

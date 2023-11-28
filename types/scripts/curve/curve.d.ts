import { Vector3 } from '../path.ux/scripts/pathux';
import { Vertex, Edge } from '../mesh/mesh_types';
import { Mesh } from "../mesh/mesh.js";
import { MeshTools } from "../mesh/mesh_stdtools.js";
import { SimpleMesh } from "../core/simplemesh.js";
import { View3D } from "../editors/view3d/view3d";
import { StructReader } from "../path.ux/scripts/path-controller/types/util/nstructjs";
export declare function basis(ks: number[], t: number, i: number, deg: number): number;
export declare class WalkRet {
    v: Vertex;
    e: Edge;
    constructor(v: any, e: any);
    load(v: any, e: any): this;
}
export * from './curve_knot';
export declare class CurveSpline extends Mesh {
    static STRUCT: string;
    isClosed: boolean;
    knots: number[];
    degree: number;
    knotpad: number | undefined;
    owningToolMode: string;
    _length: number;
    speedLength: number;
    private _evaluate_vs;
    private _last_check_key;
    constructor();
    getBoundingBox(useGrids?: boolean): Vector3[];
    copy(): this;
    walk(all_verts?: boolean): Generator<any, void, unknown>;
    get length(): number;
    updateKnots(): void;
    update(): void;
    _genRenderElements(): void;
    genRender(): void;
    switchDirection(): void;
    static blockDefine(): {
        typeName: string;
        defaultName: string;
        uiName: string;
        flag: number;
        icon: number;
    };
    static nodedef(): {
        name: string;
        uiname: string;
        flag: number;
        inputs: {
            data: any;
        };
        outputs: {
            data: any;
        };
    };
    static dataDefine(): {
        name: string;
        selectMask: number;
        tools: typeof MeshTools;
    };
    exec(): void;
    sortVerts(): this;
    evaluateSpeed2(s: number): number;
    evaluateSpeed(s: number): number;
    /** s_out: array to hold [s, ds]*/
    evaluate(s: number, dv_out?: Vector3 | undefined, no_out?: Vector3 | undefined, e_out?: Edge[] | undefined, s_out?: Number[] | undefined): any;
    genRender_curves(gl: WebGL2RenderingContext, combinedWireframe: boolean, view3d: View3D, layers?: number): SimpleMesh;
    closestPoint(p: Vector3, mode: number): void;
    checkClosed(): void;
    checkUpdate(): void;
    draw(): void;
    drawElements(): void;
    loadSTRUCT(reader: StructReader<this>): void;
}

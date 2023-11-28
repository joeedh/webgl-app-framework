export class SpatialHash {
    static fromMesh(mesh: any, verts: any): SpatialHash;
    constructor(cellsize: any, size?: any);
    cursize: number;
    cellsize: any;
    size: number;
    used: number;
    table: Float64Array;
    _resize(): void;
    closestVerts(co: any, r: any): Set<any>;
    addPoint(id: any, co: any, r?: number): boolean;
}

export const visibleMask: number;
export class SceneBVH {
    constructor(scene: any);
    scene: any;
    _castRay(matrix: any, ob: any, origin: any, ray: any): any;
    castRay(origin: any, ray: any, mask?: number, notMask?: number): any;
}

export class GPUTile {
    constructor(fbo: any, width: any, height?: any);
    width: any;
    height: any;
    glTex: any;
    fbo: any;
    u: number;
    v: number;
    x: number;
    y: number;
    id: number;
}
export class GPUTileManager {
    constructor(size: any);
    tileSize: any;
    idmap: {};
    tiles: any[];
    freelist: any[];
    add(tile: any): any;
    alloc(gl: any): any;
    free(tile: any): this;
    clear(): this;
}
export const UNDO_TILESIZE: 256;
export const tileManager: GPUTileManager;

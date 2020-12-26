import {FBO} from '../core/fbo.js';

export class GPUTile {
  constructor(fbo, width, height=width) {
    this.width = width;
    this.height = height;
    this.glTex = fbo.texColor;
    this.fbo = fbo;
    this.u = 0;
    this.v = 0;
    this.x = 0;
    this.y = 0;
    this.id = -1;
  }
}

let idgen = 1;

export class GPUTileManager {
  constructor(size) {
    this.tileSize = size;
    this.idmap = {};
    this.tiles = [];
    this.freelist = [];
  }

  add(tile) {
    tile.id = idgen++;

    this.tiles.push(tile);
    this.idmap[tile.id] = tile;

    return tile;
  }

  alloc(gl) {
    if (this.freelist.length > 0) {
      return this.add(this.freelist.pop());
    }

    let fbo = new FBO(gl, this.tileSize, this.tileSize);
    fbo.update(gl, this.tileSize, this.tileSize);
    fbo.create(gl);

    let tile = new GPUTile(fbo, this.tileSize, this.tileSize);

    return this.add(tile);
  }

  free(tile) {
    if (tile.id !== -1) {
      this.freelist.push(tile);
      this.tiles.remove(tile);
      delete this.idmap[tile.id];

      tile.id = -1;
    }

    return this;
  }

  clear() {
    for (let tile of this.tiles.concat([])) {
      this.free(tile);
    }

    return this;
  }
}

export const UNDO_TILESIZE = 256;

export const tileManager = new GPUTileManager(UNDO_TILESIZE);

import {DataBlock} from '../core/lib_api.js';
import {nstructjs, util, color2css, Vector2, Vector3, Vector4, Matrix4} from '../path.ux/scripts/pathux.js';
import {Icons} from '../editors/icon_enum.js';
import {DependSocket} from '../core/graphsockets.js';
import {GraphFlags, NodeFlags} from '../core/graph.js';
import {Texture} from '../core/webgl.js';
import {FBO} from '../core/fbo.js';
import {Vector3, Vector4, Matrix4, Vector2} from '../util/vectormath.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js';
import {SimpleMesh, LayerTypes, PrimitiveTypes} from '../core/simplemesh.js';

export const GPUTileFlags = {
  UPDATE      : 1,
  UNDO_SWAPPED: 2
};

let gpuidgen = 1;

export class GPUTile {
  constructor(x, y, width, height, u, v, index) {
    this.width = width;
    this.height = height;

    this.gltex = undefined;
    this.gltex2 = undefined; //backbuffer

    this.fbo = undefined;
    this.ready = false;
    this.flag = 0;
    this.index = index;

    this.id = gpuidgen++;

    this.x = x;
    this.y = y;
    this.u = u;
    this.v = v;
  }

  swap(gl) {
    this.fbo.setTexColor(gl, this.gltex);

    let t = this.gltex;
    this.gltex = this.gltex2;

    this.gltex2 = t;

    return this;
  }

  duplicate(gl) {
    let tile = new GPUTile(this.x, this.y, this.width, this.height, this.u, this.v);

    tile.genTex(gl);
    tile.index = this.index;

    tile.fbo.bind(gl);
    tile.fbo.drawQuad(gl, this.width, this.height, this.gltex);
    gl.finish();
    tile.fbo.unbind();

    tile.swap();

    return tile;
  }

  genTex(gl) {
    let tex = new Texture(undefined, gl.createTexture());
    Texture.defaultParams(gl, tex, gl.TEXTURE_2D);
    tex.initEmpty(gl, gl.TEXTURE_2D, this.width, this.height);
    this.gltex = tex;

    tex = new Texture(undefined, gl.createTexture());
    Texture.defaultParams(gl, tex, gl.TEXTURE_2D);
    tex.initEmpty(gl, gl.TEXTURE_2D, this.width, this.height);
    this.gltex2 = tex;

    let fbo = this.fbo = new FBO(gl, this.width, this.height);
    fbo.texColor = this.gltex2;
    fbo.update(gl, this.width, this.height);

    this.ready = true;
  }

  destroy(gl) {
    if (this.gltex) {
      this.gltex.destroy(gl);
    }

    this.gltex = undefined;
    return this;
  }
}

export class GPUTiledImage {
  constructor(gl, width, height, tilesize = 512) {
    this.width = width;
    this.height = height;
    this.tilesize = tilesize;
    this.smesh = undefined;
    this.islands = []; //simplemesh islands, one per tile
    this.tiles = [];
    this.makeTiles();
    this.gl = gl;
  }

  makeTiles(gl) {
    let lf = LayerTypes;
    let lflag = lf.LOC | lf.UV;

    let sm = this.smesh = new SimpleMesh(lflag);

    this.tiles = [];
    this.islands = [];

    let tsize = this.tilesize;
    let totx = Math.ceil(this.width/tsize);
    let toty = Math.ceil(this.height/tsize);

    totx = Math.max(totx, 1);
    toty = Math.max(toty, 1);

    let ilen = totx*toty;
    for (let i = 0; i < ilen; i++) {
      let ix = i%totx, iy = ~~(i/totx);

      let w, h;
      let x = ix*tsize, y = iy*tsize;

      if (ix === totx - 1) {
        w = this.width%tsize;
      } else {
        w = tsize;
      }

      if (iy === toty - 1) {
        h = this.height%tsize;
      } else {
        h = tsize;
      }

      let u = x/this.width;
      let v = y/this.height;

      let du = w/tsize;
      let dv = h/tsize;

      let island = sm.add_island();

      let quad = island.quad([u, v, 0], [u, v + dv, 0], [u + du, v + dv, 0], [u + du, v, 0]);
      quad.uvs([u, v], [u, v + dv], [u + du, v + dv], [u + du, v]);

      let tile = new GPUTile(x, y, w, h, u, v, this.tiles.length);
      tile.genTex(gl);

      this.tiles.push(tile);
      this.islands.push(island);
    }
  }

  draw(gl, uniforms, program, bindFBOs = false, onbind = undefined, onunbind = undefined) {
    gl.depthMask(false);
    gl.disable(gl.DEPTH_TEST);


    for (let i = 0; i < this.tiles.length; i++) {
      let island = this.islands[i], tile = this.tiles[i];
      uniforms.rgba = tile.gltex;

      if (bindFBOs) {
        tile.fbo.bind(gl);
        if (onbind) {
          onbind(tile, island);
        }
      }

      island.draw(gl, uniforms, program);

      if (bindFBOs) {
        tile.fbo.unbind(gl);
        if (onunbind) {
          onunbind(tile, island);
        }
      }
    }
  }

  swap(gl) {
    for (let tile of this.tiles) {
      tile.swap(gl);
    }
  }

  destroy(gl = this.gl) {
    this.smesh.destroy(gl);
    for (let tile of this.tiles) {
      tile.destroy(gl);
    }

    this.tiles = [];
    this.islands = [];
    this.smesh = undefined;

    return this;
  }
}

export class GPUHistoryImage extends GPUTiledImage {
  constructor(gl, width, height, tilesize = 512) {
    super(gl, width, height, tilesize = 512);

    this.history = [];
    this.setpoints = [0];
    this.history.cur = 0;
    this.setpoints.cur = 0;
  }

  dirty(x, y, w, h) {
    x /= this.tilesize;
    y /= this.tilesize;
    w /= this.tilesize;
    h /= this.tilesize;

    w = Math.ceil(w);
    h = Math.ceil(h);

    x = Math.floor(x);
    y = Math.floor(y);

    for (let j = y; j < y + h; j++) {
      for (let i = x; i < x + w; i++) {
        let idx = j*this.tilesize + i;

        this.tiles[idx].flag |= GPUTileFlags.UPDATE;
      }
    }
  }

  saveDirtyTiles(gl = this.gl) {
    for (let tile of this.tiles) {
      if (tile.flag & GPUTileFlags.UPDATE) {
        tile.flag &= ~GPUTileFlags.UPDATE;

        this.history.push(tile.duplicate(gl));
      }
    }

    this.history.cur = this.history.length;
  }

  undo(gl = this.gl) {
    if (this.setpoints.cur < 0) {
      return;
    }

    let scur = this.setpoints.cur;
    let start = this.setpoints[scur];
    let end = scur < this.setpoints.length ? this.setpoints[scur+1] : this.history.length;

    for (let i=start; i<end; i++) {
      let tile1 = this.history[i];
      let tile2 = this.tiles[i];

      this.tiles[i] = tile2;
      this.history[i] = tile1;

      tile1.flag &= ~GPUTileFlags.UNDO_SWAPPED;
      tile2.flag |= GPUTileFlags.UNDO_SWAPPED;
    }

    this.setpoints.cur--;
    this.history.cur = start;

    return this;
  }

  redo(gl = this.gl) {
    if (this.setpoints.cur >= this.setpoints.length-1) {
      return;
    }

    this.setpoints.cur++;

    let scur = this.setpoints.cur;
    let start = this.setpoints[scur];
    let end = scur < this.setpoints.length ? this.setpoints[scur+1] : this.history.length;

    for (let i=start; i<end; i++) {
      let tile1 = this.history[i];
      let tile2 = this.tiles[i];

      this.tiles[i] = tile2;
      this.history[i] = tile1;

      tile1.flag &= ~GPUTileFlags.UNDO_SWAPPED;
      tile2.flag |= GPUTileFlags.UNDO_SWAPPED;
    }

    this.history.cur = end;
    return this;
  }

  addSetPoint() {
    this.setpoints.push(this.history.length);
    this.setpoints.cur = this.setpoints.length;
  }

  truncateHistory(gl = this.gl) {
    for (let i = this.history.cur; i < this.history.length; i++) {
      this.history[i].destroy(gl);
    }

    this.history.length = this.history.cur;
    this.setpoints.length = this.setpoints.cur;

    return this;
  }
}

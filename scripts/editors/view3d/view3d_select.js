import {Vector3, Vector2, Matrix4} from '../../util/vectormath.js';
import {FBO, FrameStage, FramePipeline} from "../../core/fbo.js";
import {Shaders} from '../../shaders/shaders.js';
import {FindNearestTypes} from './findnearest.js';
import * as util from '../../util/util.js';
import * as cconst from '../../core/const.js';

import {calcUpdateHash} from './view3d_utils.js';
import {getFBODebug} from "../debug/gldebug.js";

let _cache = {};

let IOB=0, IDATA=1, ITOT=2;

export class GPUSelectBuffer {
  constructor() {
    this.regen = true;
    this.pos = new Vector2([0, 0]);
    this.size = new Vector2([0, 0]);
    this.fbo = undefined;
    this.idbuf = undefined;
    this.depth_fbo = undefined;
    this._last_hash = undefined;
    this._last_selmask = undefined;
  }

  dirty() {
    this.regen = true;
  }

  destroy(gl) {
    this.depth_fbo.destroy(gl);
    this.fbo.destroy(gl);
  }

  gen(ctx, gl, view3d) {
    this.regen = false;

    let w = this.size[0] = ~~view3d.size[0];
    let h = this.size[1] = ~~view3d.size[1];

    if (this.fbo === undefined) {
      this.fbo = new FBO(gl, w, h);
      this.depth_fbo = new FBO(gl, w, h);
    } else {
      this.fbo.update(gl, w, h);
      this.depth_fbo.update(gl, w, h);
    }
    console.warn("regenerating selection buffer");

    if (!this.idbuf || this.idbuf.length !== w*h*4) {
      this.idbuf = new Float32Array(w * h * 4);
      this.depthbuf = new Float32Array(w * h * 4);
    }

    //make sure depth drawing fbo is all set up for later use
    this.fbo.bind(gl);
    this.fbo.unbind(gl);
    this.depth_fbo.bind(gl);
    this.depth_fbo.unbind(gl);
  }

  draw(ctx, gl, view3d, selmask=ctx.selectMask) {
    console.log("Selection Buffer Draw");

    if (cconst.DEBUG.debugUIUpdatePerf) {
      return;
    }

    /*
    if (this.fbo === undefined) {
      this.fbo = new FBO(gl, ~~this.size[0], ~~this.size[1]);

    } else {
      this.fbo.update(gl, ~~this.size[0], ~~this.size[1]);
    }
    //*/

    let camera = view3d.activeCamera;

    console.warn("selection buffer draw");

    this.size.floor();

    this.fbo.update(gl, this.size[0], this.size[1]);
    this.fbo.bind(gl);

    let uniforms = {
      projectionMatrix : camera.rendermat,
      objectMatrix : new Matrix4(),
      normalMatrix     : camera.normalmat,
      near   : camera.near,
      far    : camera.far,
      size   : this.size,
      aspect : camera.aspect,
      object_id : -1
    };

    gl.clearDepth(1.0);
    gl.clearColor(0, 0, 0, 0);

    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DITHER);
    gl.disable(gl.BLEND);
    gl.disable(gl.CULL_FACE);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    //gl.viewport(0, 0, this.size[0], this.size[1]);

    let toolmode = ctx.scene.toolmode;

    let uniforms2 = {};

    for (let ob of view3d.sortedObjects) {
      Object.assign(uniforms2, uniforms);

      if (toolmode && toolmode.drawsObjectIdsExclusively(ob)) {
        continue;
      }

      uniforms2.objectMatrix.load(ob.outputs.matrix.getValue());

      let ok = false;

      for (let fn of FindNearestTypes) {
        if (fn.drawsObjectExclusively(view3d, ob)) {
          fn.drawIDs(view3d, gl, uniforms2, ob, selmask);
          ok = true;
          break;
        }
      }

      if (!ok) {
        for (let fn of FindNearestTypes) {
          fn.drawIDs(view3d, gl, uniforms2, ob, selmask);
        }
      }
    }

    this.fbo.unbind(gl);
    this.fbo.bind(gl);

    //do any additional drawing the toolmode wants. . .
    if (ctx.scene.toolmode) {
      Object.assign(uniforms2, uniforms);
      uniforms = uniforms2;

      uniforms2.objectMatrix = new Matrix4();
      uniforms2.projectionMatrix = view3d.activeCamera.rendermat;
      uniforms2.object_id = -1;

      ctx.scene.toolmode.drawIDs(view3d, gl, uniforms2);
    }

    gl.finish();

    if (cconst.cacheSelectBufs) {
      let start = util.time_ms();

      gl.readPixels(0, 0, ~~this.size[0], ~~this.size[1], gl.RGBA, gl.FLOAT, this.idbuf);
      gl.finish();
      this.fbo.unbind(gl);

      this.depth_fbo.update(gl, ~~this.size[0], ~~this.size[1]);
      this.depth_fbo.bind(gl);

      this.depth_fbo.drawDepth(gl, ~~this.size[0], ~~this.size[1], this.fbo.texDepth);
      this.depth_fbo.drawDepth(gl, ~~this.size[0], ~~this.size[1], this.fbo.texDepth);
      gl.finish();

      gl.readPixels(0, 0, ~~this.size[0], ~~this.size[1], gl.RGBA, gl.FLOAT, this.depthbuf);

      gl.finish();
      this.depth_fbo.unbind(gl);
      this.fbo.unbind(gl);

      window._selbuf_ms = util.time_ms() - start;
    } else {
      this.fbo.unbind(gl);
    }

    getFBODebug(gl).pushFBO("select", this.fbo);
  }

  sampleBlock(ctx, gl, view3d, x, y, w=16, h=16, sampleDepth=false, selmask=ctx.selectMask) {
    //console.log(x, y, this.pos[0], this.pos[1]);
    let ret;

    w = Math.max(w, 1);
    h = Math.max(h, 1);

    try {
      ret = this.sampleBlock_intern(ctx, gl, view3d, x, y, w, h, sampleDepth, selmask);
    } catch (error) {
      util.print_stack(error);
      console.log("error in sampleBlock");

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return undefined;
    }

    //XXX try to avoid screen flashing bug
    gl.finish();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    //window.redraw_viewport();

    return ret;
  }

  getSearchOrder(n) {
    if (n in _cache) {
      return _cache[n];
    }

    let ret = _cache[n] = [];

    for (let i=0; i<n*n; i++) {
      ret.push(i);
    }

    ret.sort((a, b) => {
      let x1 = a % n, y1 = ~~(a / n);
      let x2 = b % n, y2 = ~~(b / n);

      x1 -= n*0.5; y1 -= n*0.5;
      x2 -= n*0.5; y2 -= n*0.5;

      let w1 = /*Math.atan2(y1, x1) */ (x1*x1 + y1*y1);
      let w2 = /*Math.atan2(y2, x2) */ (x2*x2 + y2*y2);

      return w1-w2;
    });

    return ret;
  }

  _check(ctx, gl, view3d, selmask = this._last_selmask) {
    let bad = this.size.vectorDistance(view3d.glSize) !== 0.0;
    //bad = bad || this._last_selmask !== selmask;

    //bad = bad || this.pos.vectorDistance(view3d.glPos) != 0.0;

    if (bad) {
      this.pos.load(view3d.glPos).floor();
      this.size.load(view3d.glSize).floor();

      this.dirty();
    }

    let update;

    view3d.push_ctx_active();
    let hash = calcUpdateHash(view3d);
    view3d.pop_ctx_active();

    hash ^= selmask;

    if (hash !== this._last_hash) {
      console.log("HASH", hash);
      update = true;
      console.warn("SELMASK", selmask);
    }

    this._last_selmask = selmask;
    this._last_hash = hash;

    if (this.regen) {
      update = true;
      this.gen(ctx, gl, view3d);
    }

    if (update) {
      console.log("DRAWING");
    //window.setTimeout(() => {
      this.draw(ctx, gl, view3d, selmask);
    //}, 1);
    }
  }


  sampleBlock_intern(ctx, gl, view3d, x, y, w=16, h=16, sampleDepth=false, selmask=ctx.selectMask) {
    this._check(ctx, gl, view3d, selmask);

    if (!cconst.cacheSelectBufs) {
      return this.sampleBlock_intern_old(...arguments);
    }

    let dpi = devicePixelRatio;


    if (w*h > 2) {
      w = Math.ceil(w*dpi + 0.5);
      h = Math.ceil(h*dpi + 0.5);
    }

    let x1 = ~~(x*dpi + 0.5);
    let y1 = ~~(y*dpi + 0.5);

    y1 = (~~this.size[1]) - (y1 + h);

    let x2 = x1+w, y2 = y1+h;
    let data = new Float32Array(w*h*4);
    let depthData = new Float32Array(w*h*4);

    let width = this.size[0], height = this.size[1];

    let idbuf = this.idbuf;
    let dbuf = this.depthbuf;

    for (let x=x1, x3=0; x<x2; x++, x3++) {
      for (let y=y1, y3=0; y<y2; y++, y3++) {
        let idx = (y * width + x)*4;

        let idx2 = (y3 * w + x3)*4;

        for (let i=0; i<4; i++) {
          data[idx2+i] = idbuf[idx+i];
        }

        depthData[idx2] = dbuf[idx];
      }
    }

    return {
      data  : data,
      depthData : depthData,
      order : this.getSearchOrder(w)
    };
  }

  sampleBlock_intern_old(ctx, gl, view3d, x, y, w=16, h=16, sampleDepth=false, selmask=ctx.selectMask) {
    this._check(ctx, gl, view3d, selmask);

    let dpi = gl.canvas.dpi;

    w = ~~(w*dpi + 0.5);
    h = ~~(h*dpi + 0.5);

    x = ~~(x*dpi + 0.5);
    y = ~~(y*dpi + 0.5);

    gl.finish();

    this.fbo.bind(gl);
    let data = new Float32Array(w*h*4);

    //gl.readPixels(x, y , w, h, gl.RGBA, gl.FLOAT, data);
    gl.readPixels(x, (~~this.size[1]) - (y + h), w, h, gl.RGBA, gl.FLOAT, data);
    this.fbo.unbind(gl);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    //this.fbo.drawQuadScaled(gl, this.size[0], this.size[1], this.fbo.texColor, 1.0/15.0);

    if (sampleDepth) {
      let depthData = new Float32Array(w*h*4);

      this.depth_fbo.update(gl, ~~this.size[0], ~~this.size[1]);
      this.depth_fbo.bind(gl);

      this.depth_fbo.drawDepth(gl, ~~this.size[0], ~~this.size[1], this.fbo.texDepth);
      gl.finish();
      gl.readPixels(x, (~~this.size[1]) - (y + h), w, h, gl.RGBA, gl.FLOAT, depthData);
      gl.finish();
      this.depth_fbo.unbind(gl);
      gl.finish();

      return {
        data  : data,
        depthData : depthData,
        order : this.getSearchOrder(w)
      };
    }

    return {
      data  : data,
      order : this.getSearchOrder(w)
    };
  }
};

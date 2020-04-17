import {Vector3, Vector2} from '../../util/vectormath.js';
import {FBO, FrameStage, FramePipeline} from "../../core/fbo.js";
import {Shaders} from './view3d_shaders.js';
import {FindNearestTypes} from './findnearest.js';
import * as util from '../../util/util.js';

let _cache = {};

export class GPUSelectBuffer {
  constructor() {
    this.regen = true;
    this.pos = new Vector2([0, 0]);
    this.size = new Vector2([0, 0]);
  }

  dirty() {
    this.regen = true;
  }

  gen(ctx, gl, view3d) {
    if (this.fbo !== undefined) {
      this.fbo.destroy(gl);
    }
    this.fbo = new FBO(gl, ~~this.size[0], ~~this.size[1]);
    /*
    if (this.fbo === undefined) {
      this.fbo = new FBO(gl, ~~this.size[0], ~~this.size[1]);

    } else {
      this.fbo.update(gl, ~~this.size[0], ~~this.size[1]);
    }
    //*/

    this.fbo.bind(gl);

    let uniforms = {
      projectionMatrix : view3d.camera.rendermat,
      objectMatrix : undefined
    };

    gl.clearDepth(1000000);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DITHER);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    gl.viewport(0, 0, ~~this.size[0], ~~this.size[1]);

    for (let ob of ctx.scene.objects.editable) {
      uniforms.objectMatrix = ob.outputs.matrix.getValue();

      for (let fn of FindNearestTypes) {
        fn.drawIDs(view3d, gl, uniforms, ob, ob.data, 0);
      }
    }

    gl.finish();

    this.fbo.unbind(gl);
  }

  sampleBlock(ctx, gl, view3d, x, y, w=16, h=16) {
    //console.log(x, y, this.pos[0], this.pos[1]);
    let ret;

    try {
      ret = this.sampleBlock_intern(ctx, gl, view3d, x, y, w, h);
    } catch (error) {
      util.print_stack(error);
      console.log("error in sampleBlock");

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return undefined;
    }

    //XXX try to avoid screen flashing bug
    gl.finish();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    window.redraw_viewport();

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

  sampleBlock_intern(ctx, gl, view3d, x, y, w=16, h=16) {
    let dpi = gl.canvas.dpi;

    w = ~~(w*dpi + 0.5);
    h = ~~(h*dpi + 0.5);

    x = ~~(x*dpi + 0.5);
    y = ~~(y*dpi + 0.5);

    if (this.pos.vectorDistance(view3d.glPos) != 0.0 ||
        this.size.vectorDistance(view3d.glSize) != 0.0) {
      this.pos.load(view3d.glPos);
      this.size.load(view3d.glSize);

      this.dirty();
    }

    if (this.regen) {
      this.gen(ctx, gl, view3d);
    }

    this.fbo.bind(gl);

    let data = new Float32Array(w*h*4);

    //gl.readPixels(x, y , w, h, gl.RGBA, gl.FLOAT, data);
    gl.readPixels(x, (~~this.size[1]) - (y + h), w, h, gl.RGBA, gl.FLOAT, data);

    this.fbo.unbind(gl);

    return {
      data  : data,
      order : this.getSearchOrder(w)
    };
  }
};

import {Vector3, Vector2, Matrix4} from '../../util/vectormath.js';
import {FBO, FrameStage, FramePipeline} from "../../core/fbo.js";
import {Shaders} from '../../shaders/shaders.js';
import {FindNearestTypes} from './findnearest.js';
import * as util from '../../util/util.js';
import * as cconst from '../../core/const.js';

let _cache = {};

export class GPUSelectBuffer {
  constructor() {
    this.regen = true;
    this.pos = new Vector2([0, 0]);
    this.size = new Vector2([0, 0]);
    this.fbo = undefined;
    this.depth_fbo = undefined;
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

    this.size[0] = ~~view3d.glSize[0];
    this.size[1] = ~~view3d.glSize[1];

    if (this.depth_fbo !== undefined) {
      this.depth_fbo.destroy(gl);
    }
    if (this.fbo !== undefined) {
      this.fbo.destroy(gl);
    }

    this.fbo = new FBO(gl, ~~this.size[0], ~~this.size[1]);
    this.depth_fbo = new FBO(gl, ~~this.size[0], ~~this.size[1]);

    //make sure depth drawing fbo is all set up for later use
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

    this.fbo.update(gl, ~~this.size[0], ~~this.size[1]);
    this.fbo.bind(gl);

    let uniforms = {
      projectionMatrix : camera.rendermat,
      objectMatrix : undefined,
      near   : camera.near,
      far    : camera.far,
      size   : this.size,
      aspect : camera.aspect
    };

    gl.clearDepth(view3d.activeCamera.far);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);

    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.DITHER);

    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    gl.viewport(0, 0, ~~this.size[0], ~~this.size[1]);

    for (let ob of ctx.scene.objects.visible) {
      uniforms.objectMatrix = ob.outputs.matrix.getValue();

      for (let fn of FindNearestTypes) {
        let def = fn.define();

        //if (fn.selectMask & selmask) {
          fn.drawIDs(view3d, gl, uniforms, ob, ob.data, 0);
        //}
      }
    }

    if (ctx.scene.toolmode) {
      uniforms.objectMatrix = new Matrix4();
      uniforms.projectionMatrix = view3d.activeCamera.rendermat;
      uniforms.object_id = -1;

      ctx.scene.toolmode.drawIDs(view3d, gl, uniforms);
    }

    gl.finish();

    this.fbo.unbind(gl);
  }

  sampleBlock(ctx, gl, view3d, x, y, w=16, h=16, sampleDepth=false, selmask=ctx.selectMask) {
    //console.log(x, y, this.pos[0], this.pos[1]);
    let ret;

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

  sampleBlock_intern(ctx, gl, view3d, x, y, w=16, h=16, sampleDepth=false, selmask=ctx.selectMask) {
    let dpi = gl.canvas.dpi;

    w = ~~(w*dpi + 0.5);
    h = ~~(h*dpi + 0.5);

    x = ~~(x*dpi + 0.5);
    y = ~~(y*dpi + 0.5);

    let bad = this.size.vectorDistance(view3d.glSize) != 0.0;
    //bad = bad || this.pos.vectorDistance(view3d.glPos) != 0.0;

    if (bad) {
      this.pos.load(view3d.glPos);
      this.size.load(view3d.glSize).floor();

      this.dirty();
    }

    let update = ~~view3d.glSize[0] !== this.size[0] || ~~view3d.glSize[1] !== this.size[1];

    if (this.regen || update) {
      this.gen(ctx, gl, view3d);
    }

    this.draw(ctx, gl, view3d, selmask);

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

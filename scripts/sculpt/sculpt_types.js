import {RenderBuffer, Texture, ShaderProgram} from "../core/webgl.js";

export class PipelineCtx {
  constructor(gl) {
    this.gl = gl;
  }
}

export class GPUTriMesh {
  constructor() {
    this.buffers = new RenderBuffer();
    this.regen = 1;
    this.gl = undefined;
    this.pipeline = [];
  }
}
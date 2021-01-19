import {Vector2, Vector3, Vector4, Matrix4} from "../util/vectormath.js";
import {loadShader} from './shader.js';

import _glslang from "../node_modules/@webgpu/glslang/dist/web-devel/glslang.js";

let glslang;
_glslang().then((module) => {
  glslang = module;
  window.glslang = glslang;
});

/*
* #define Cmd_End 0
#define Cmd_Circle 1
#define Cmd_Line 2
#define Cmd_Fill 3
#define Cmd_Stroke 4
#define Cmd_FillEdge 5
#define Cmd_DrawFill 6
#define Cmd_Solid 7
#define Cmd_Jump 8
#define Cmd_Bail 9
#define Cmd_size 20*/

export let CMD_END = 0;
export let CMD_CIRCLE = 1;
export let CMD_LINE = 2;
export let CMD_FILL = 3;
export let CMD_STROKE = 4;
export let CMD_FILLEDGE = 5;
export let CMD_DRAWFILL = 6;
export let CMD_SOLID = 7;
export let CMD_JUMP = 8;
export let CMD_BAIL = 9;

export class Stroke {
  constructor(x1, y1, x2, y2) {
    this.v1 = new Vector2([x1, y1]);
    this.v2 = new Vector2([x2, y2]);
  }
}

export function keycolor(color) {
  return color[0] + ":" + color[1] + ":" + color[2] + ":" + (color[3] === undefined ? 1.0 : color[3]);
}

export function color2int(c) {
  let r = ~~(c[0]*255);
  let g = ~~(c[1]*255);
  let b = ~~(c[2]*255);
  let a = ~~((c[3] === undefined ? 1.0 : c[3])*255);

  return a + (b<<8) + (g<<16) + (r<<24);
  //return r + (g<<8) + (b<<16) + (a<<24);
}

export class Path {
  constructor(render) {
    this.render = render;
    this.regen = 1;
    this.commands = [];
    this.strokes = [];
    this.id = -1;
    this.colors = [];
    this.colormap = new Map();

    this.lastx = 0;
    this.lasty = 0;
    this.matrix = new Matrix4();

    this.fillcolor = new Vector4([0, 0, 0, 1]);
    this.strokecolor = new Vector4([0, 0, 0, 1]);
    this.backdrop = new Vector4([0.5, 0.5, 0.5, 1.0]);

    this.lineWidth = 1.0;
  }

  _getColorRef(color) {
    return color2int(color);
    /*
    let key = keycolor(color);
    if (!this.colormap.has(key)) {
      color = new Vector4(color);
      color[3] = color[3] === undefined ? 1.0 : color[3];

      this.colormap.set(key, this.colors.length);
      this.colors.push(color);
    }*/
  }

  moveTo(x, y) {
    this.lastx = x;
    this.lasty = y;
  }

  pushCmd() {
    let cmds = this.commands;

    for (let i=0; i<arguments.length; i++) {
      cmds.push(arguments[i]);
    }
  }

  lineTo(x, y) {
    let stroke = new Stroke(this.lastx, this.lasty, x, y);
    let sref = this.strokes.length;
    this.strokes.push(stroke);

    let color = this.strokecolor;

    this.pushCmd(CMD_LINE, sref, this.lineWidth*0.5, color);

    this.lastx = x;
    this.lasty = y;
  }

  end() {
    this.pushCmd(CMD_END);
  }

  stroke() {
    this.pushCmd(CMD_STROKE);
  }

  fill() {
    this.pushCmd(CMD_DRAWFILL, color2int(this.backdrop), color2int(this.fillcolor));
    this.pushCmd(CMD_FILL);
  }

  reset() {
    this.regen = 1;
    this.commands = [];
    this.strokes = [];
  }
}

let idgen = 0;

export class PathRender {
  constructor() {
    this.paths = [];
    this.ready = false;
    this.adaptor = undefined;
    this.device = undefined;

    this.regen = 1;
  }

  newPath() {
    let p = new Path(this);
    this.paths.push(p);
    p.id = idgen++;

    return p;
  }

  init() {
    //this.loadShaders();

    navigator.gpu.requestAdapter({
      powerPreference : "high-performance"
    }).then((adaptor) => {
      this.adaptor = adaptor;

      return adaptor.requestDevice({
        extensions : [
          //"pipeline-statistics-query"
        ]
      })
    }).then((device) => {
      this.device = device;
      this.loadShaders();
    });
  }

  loadShader(path) {
    let buf = loadShader(path);
    buf = `#version 450
#extension GL_KHR_shader_subgroup_basic : enable
    ` + buf;

    console.log(glslang);

    let shader = this.device.createShaderModule({
      code : glslang.compileGLSL(buf, "compute")
    });

    return shader;
  }
  loadShaders() {
    this.ready =  true;

    if (!glslang) {
      console.log("waiting for glslang");
      setTimeout(() => {
        this.loadShaders();
      }, 350);

      return;
    }

    this.kernels = {
      kernel1 : this.loadShader("kernel1.comp"),
      kernel2f : this.loadShader("kernel2f.comp"),
      kernel2s : this.loadShader("kernel2s.comp"),
      kernel3 : this.loadShader("kernel3.comp"),
      kernel4 : this.loadShader("kernel4.comp"),
    };
  }

  destroy() {

  }
}

window.glslang = glslang;

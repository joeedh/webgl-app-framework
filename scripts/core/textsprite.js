import {Texture} from './webgl.js'
import {CSSFont, css2color, color2css} from "../path.ux/scripts/ui_base.js";
import {SimpleMesh, LayerTypes} from "./simplemesh.js";
import {loadShader, PolygonOffset} from "../editors/view3d/view3d_shaders.js";
import {Vector2, Vector3, Vector4, Matrix4, Quat} from "../util/vectormath.js";

export class FontEncoding {
  constructor() {
    this.map = {};
    this.characters = "";
  }

  add(chr) {
    let i;
    if (typeof chr === "number") {
      i = chr;
      chr = String.fromCharCode(chr);
    } else {
      i = chr.charCodeAt(0);
    }

    this.map[i] = this.characters.length;
    this.characters += chr;
  }
}

let latin_1 = new FontEncoding();

for (let i=97; i<=122; i++) {
  latin_1.add(i)
}
for (let i=65; i<=90; i++) {
  latin_1.add(i)
}
for (let i=48; i<=57; i++) {
  latin_1.add(i);
}
let extra = `<>?,./;':"[]{}\|\``;
extra += `!@#$%^&*()_+-=~`;

for (let i=0; i<extra.length; i++) {
  latin_1.add(extra[i]);
}

latin_1.add(0x20ac); //euro symbol

/*included in extended charset below
latin_1.add(0x00bf); //upside down question mark
latin_1.add(0x00B0); //degrees symbol
*/

//extended characters
for (let i=161; i<255; i++) {
  latin_1.add(i);
}

export const TextShader = {
  vertex : `precision mediump float;  
attribute vec3 position;
attribute vec2 uv;
attribute vec4 color;

uniform vec2 size;
uniform mat4 projectionMatrix;
uniform mat4 objectMatrix;
uniform mat4 normalMatrix;
uniform vec2 shift;

${PolygonOffset.pre}

varying vec4 vColor;
varying vec2 vUv;

void main() {
  vec4 p = objectMatrix * vec4(position, 1.0);
  p = projectionMatrix * vec4(p.xyz, 1.0);
  
  ${PolygonOffset.vertex("p")}
  p.xy += shift*p.w;
  gl_Position = p;
  
  vUv = uv;
  vColor = color;
}

  `,

  fragment : `precision mediump float;
uniform float alpha;

uniform sampler2D font;

varying vec4 vColor;
varying vec2 vUv;
${PolygonOffset.pre}

uniform vec4 outlineColor;
uniform float outlineWidth;

void main() {
  vec2 uv = vUv;
  vec4 f = texture2D(font, uv);
  float alpha = f[2];
  float outline = f[0];
  vec4 color = vColor;
  
  float th = 0.05;
  
  if (outline > th) {
    float mixf = alpha;
    
    mixf = 1.0 - mixf;
    color = mix(color, outlineColor, mixf);
    
    float alpha2 = (outline-th) / (1.0 - th);
    alpha2 = min(alpha2/(th*0.5), 1.0);
    
    alpha = max(alpha, alpha2);
  }
  
  if (alpha < 0.1) {
    discard;
  }
  
  ${PolygonOffset.fragment}
  
  gl_FragColor = vec4(color.rgb, color.a*alpha);
}
  `,

  uniforms : {
    polygonOffset : 0.0,
    size : [512, 512],
    outlineWidth : 1.0,
    outlineColor : [1, 1, 1, 1]
  },

  attributes : [
    "position", "uv", "color"
  ]
};

let glShader = undefined;

export const encoding = latin_1;
export const defaultFontName = "sans-serif";

export const FONTSCALE = 1.0 / 64;

export class SpriteFontSheet {
  constructor(encoding, size, font) {
    this.encoding = encoding;
    this.size = size;
    this.kerning = {};
    this.font = font;
  }

  render() {
    let chars = this.encoding.characters;
    let cells = Math.ceil(Math.sqrt(chars.length));
    let cellsize = this.size;
    let font = this.font;

    let blur = Math.max(~~(this.size*0.3), 2);

    this.cells = cells;
    this.cellsize = cellsize;

    font.size = this.size - 2;

    let width = cellsize*cells;
    let height = cellsize*cells;

    let canvas = this.canvas = document.createElement("canvas");
    let g = this.g = canvas.getContext("2d");

    canvas.width = width;
    canvas.height = height;

    //*
    g.shadowBlur = blur;
    g.shadowColor = "red";

    g.beginPath();
    g.fillStyle = "black";
    g.rect(0, 0, canvas.width, canvas.height);
    g.fill();
    //*/

    g.fillStyle = "rgb(0, 255, 255)";
    g.strokeStyle = "rgb(0, 255, 255)";

    g.font = font.genCSS(this.size*2-2);
    g.font = (~~(this.size)) + "px sans-serif";
    canvas.font = g.font;
    canvas.style["font"] = g.font;

    //canvas.font = font.genCSS(this.size*2-2);

    console.log(g.font, g.fillText); //font.genCSS(this.size*2-2));

    /*
    g.beginPath();
    for (let i=0; i<chars.length; i++) {
      let x = i % cells, y = ~~(i / cells);

      x *= cellsize;
      y *= cellsize;
      g.rect(x, y, x+cellsize, y+cellsize);
    }
    g.stroke();
    //*/

    for (let i=0; i<chars.length; i++) {
      let c = chars[i];
      let ci = chars.charCodeAt(i);
      let s = 0.7;

      let w = g.measureText(c).width * s;
      this.kerning[ci] = w;

      let x = i % cells, y = ~~(i / cells);

      y += 0.8;

      x *= cellsize;
      y *= cellsize;

      x += 0;

      g.scale(s, s);
      g.fillText(c, x/s, y/s);
      g.scale(1/s, 1/s);
    }
  }

  startMesh() {
    let sm = new SimpleMesh(LayerTypes.LOC|LayerTypes.UV|LayerTypes.COLOR);

    sm.lastColor = "white";
    sm.lastPos = [0, 0, 0];

    return sm;
  }

  appendMesh(smesh, text, color=smesh.lastColor) {
    for (let i=0; i<text.length; i++) {
      this.appendChar(smesh, text[i], color);
    }
  }

  appendChar(smesh, char, color=smesh.lastColor) {
    char = char.charCodeAt(0);

    let i = this.encoding.map[char];

    color = typeof color === "string" ? css2color(color) : color;
    let scale = FONTSCALE;
    let margin = 0.0;

    if (color.length < 4) {
      color = [color[0], color[1], color[2], 1.0];
    }

    let x = smesh.lastPos[0];
    let d = this.size, w = this.kerning[char]*2.0;

    smesh.lastPos[0] += w*scale;

    let vs = [
      new Vector3([-w, d, 0]),
      new Vector3([-w, -d, 0]),
      new Vector3([w, -d, 0]),
      new Vector3([w, d, 0]),
    ];

    for (let v of vs) {
      v.mulScalar(scale);
      v[0] += x;
    }

    //let
    let ux = (i % this.cells) / this.cells;
    let uy = (~~(i / this.cells)) / this.cells;
    let uxscale = w / this.size;

    let m = margin;

    let uvs = [
      new Vector2([-m, -m]),
      new Vector2([-m, 1+m]),
      new Vector2([1+m, 1+m]),
      new Vector2([1+m, -m]),
    ];

    for (let i=0; i<4; i++) {
      uvs[i].mulScalar(1.0 / this.cells);
      uvs[i][0] *= uxscale;

      uvs[i][0] += ux;
      uvs[i][1] += uy;
    }

    let quad = smesh.quad(vs[0], vs[1], vs[2], vs[3]);
    quad.uvs(uvs[0], uvs[1], uvs[2], uvs[3]);
    quad.colors(color, color, color, color);
  }

  makeTex(gl) {
    let canvas = this.canvas;

    let data = this.g.getImageData(0, 0, canvas.width, canvas.height);

    let tex = Texture.load(gl, canvas.width, canvas.height, data.data);

    gl.bindTexture(gl.TEXTURE_2D, tex.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

    this.glTex = tex;
  }

  drawMeshScreenSpace(gl, smesh, co, uniforms={}) {
    //copy uniforms
    uniforms = Object.assign({}, uniforms);

    uniforms.objectMatrix = new Matrix4();
    uniforms.projectionMatrix = new Matrix4();

    let aspect = 1.0;
    if (uniforms.aspect) {
      aspect = uniforms.aspect;
    }

    let scale = 0.05/this.size;
    scale /= FONTSCALE;

    uniforms.projectionMatrix.translate(co[0], co[1], 0.0);
    uniforms.projectionMatrix.scale(scale/aspect, scale, scale);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);

    this.drawMesh(gl, smesh, uniforms);
  }

  drawMesh(gl, smesh, uniforms) {
    return;
    if (!this.glTex) {
      this.makeTex(gl);
    }

    if (1||glShader === undefined) {
      glShader = loadShader(gl, TextShader);
    }

    uniforms.font = this.glTex;

    smesh.draw(gl, uniforms, glShader);
  }

  onContextLost(e) {
    this.glTex = undefined;
  }
}

export function onContextLost(e) {
  glShader = undefined;
}

export class SpriteFont {
  constructor(font) {
    if (typeof font === "string") {
      font = new CSSFont({
        font : font
      });
    }

    this.sheets = {};
    this.font = font;
  }

  update(gl) {
    if (this.gl === undefined) {
      this.gl = gl;
    }

    if (glShader === undefined) {
      glShader = loadShader(gl, TextShader);
    }
  }

  onContextLost(e) {
    for (let k in this.sheets) {
      this.sheets[k].onContextLost(e);
    }
  }

  getSheet(size=64) {
    let dpi = devicePixelRatio;

    size = ~~(size * dpi);
    size = Math.max(size, 10);

    if (!(size in this.sheets)) {
      this.sheets[size] = new SpriteFontSheet(encoding, size, this.font);
      this.sheets[size].render();
    }

    return this.sheets[size];
  }
}

export let defaultFont = new SpriteFont(defaultFontName);

let testCanvas = undefined;

window.test_sprite_fonts = function(size=12, font="sans-serif") {
  if (testCanvas !== undefined) {
    testCanvas.remove();
  }

  font = new CSSFont({
    font  : font,
    color : "black"
  });

  let sheet = new SpriteFontSheet(encoding, size, font);
  sheet.render();

  let canvas = sheet.canvas;

  canvas.style["position"] = "absolute";
  canvas.style["z-index"] = 2;
  canvas.style["left"] = "10px";
  canvas.style["top"] = "10px";
  testCanvas = canvas;

  document.body.appendChild(canvas);

};

let _testmesh = undefined;
export function testDraw(gl, uniforms) {
   let mesh = _testmesh;
   let font = defaultFont.getSheet(24);

   if (mesh === undefined) {
     mesh = _testmesh = font.startMesh();
     font.appendMesh(mesh, "yay", "black");
     font.appendMesh(mesh, "yay2", "blue");
   }

   font.drawMesh(gl, mesh, uniforms);

   let co = new Vector2(_appstate.screen.mpos);
   let view3d = _appstate.ctx.view3d;

   co[0] = (co[0] - view3d.glPos[0]) / view3d.glSize[0];
   co[1] = (co[1] - view3d.glPos[1]) / view3d.glSize[1];

   co[0] = co[0]*2.0 - 1.0;
   co[1] = co[1]*2.0 - 1.0;
   co[1] = -co[1];

  font.drawMeshScreenSpace(gl, mesh, co, uniforms);
}



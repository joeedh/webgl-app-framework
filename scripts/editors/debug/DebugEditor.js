import {Area} from '../../path.ux/scripts/screen/ScreenArea.js';
import {saveFile, loadFile} from '../../path.ux/scripts/pathux.js';
import {PackFlags} from "../../path.ux/scripts/core/ui_base.js";

import {Editor, VelPan} from '../editor_base.js';
import {nstructjs} from '../../path.ux/scripts/pathux.js';
import {DataPathError} from '../../path.ux/scripts/pathux.js';
import {KeyMap, HotKey} from '../../path.ux/scripts/util/simple_events.js';
import {UIBase, color2css, _getFont, css2color} from '../../path.ux/scripts/core/ui_base.js';
import {Container, RowFrame, ColumnFrame} from '../../path.ux/scripts/core/ui.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {DataRef} from '../../core/lib_api.js';
import {NodeEditor} from "../node/NodeEditor.js";
import {glDebug, Shaders} from "./gldebug.js";
import {getWebGL} from '../view3d/view3d.js';
import {SimpleMesh, LayerTypes} from "../../core/simplemesh.ts";
import {Texture} from '../../core/webgl.js';
import {DisplayModes} from './DebugEditor_base.js';
import {loadShader} from "../../shaders/shaders.js";
import {Icons} from '../icon_enum.js';

export const DrawShaders = {
  IDS: { //key should map to one of DisplayModes keys
    vertex: `#version 300 es
precision mediump float;

uniform sampler2D rgba;
uniform sampler2D depth;

in vec3 position;
in vec2 uv;

out vec2 v_Uv;

void main(void) {
  gl_Position = vec4(position, 1.0);
  v_Uv = uv;
}
    
  `,
    fragment: `#version 300 es

precision mediump float;


uniform sampler2D rgba;
uniform sampler2D depth;
uniform float valueScale;

in vec2 v_Uv;
out vec4 fragColor;

void main(void) {
  vec4 color = texture(rgba, v_Uv);

  for (int i=0; i<3; i++) {
    float f = color[i];
    
    f /= sqrt(5.0)*sqrt(3.0);
    f += sqrt(5.0);
    
    if (f == 0.0) {
      f = 0.0;
    } else {
      f = fract(f*0.2)*0.8 + 0.2;
    }
    
    color[i] = f;
  }
  
  fragColor = vec4(color.rgb*valueScale, 1.0);
  
  gl_FragDepth = texture(depth, v_Uv)[0];
}

  `,
    uniforms: {},
    attributes: ["position", "uv"]
  }
}

export class DebugEditor extends Editor {
  constructor() {
    super();

    this.displayMode = DisplayModes.RAW;
    this.activeFBOHistory = "render_final";

    this._last_update_key = undefined;

    this.glSize = new Vector2([512, 512]);
    this.glPos = new Vector2([0, 0]);

    this.curTex = 0;
    this._ignore_tab_change = false;
    this.shaders = {};
  }

  static defineAPI(api) {
    let dedstruct = super.defineAPI(api);

    let redrawDebug = function () {
      let editor = this.dataref;

      editor._redraw();
    }

    let edef = dedstruct.enum("displayMode", "displayMode", DisplayModes);

    edef.icons({
      RAW   : Icons.VIEW_RAW,
      NORMAL: Icons.VIEW_NORMALS,
      DEPTH : Icons.VIEW_DEPTH,
      ALPHA : Icons.VIEW_ALPHA
    });

    edef.on("change", redrawDebug);

    return dedstruct;
  }

  updateShaders(gl) {
    if (gl !== this.gl) {
      this.shaders = {};
    }

    for (let k in DrawShaders) {
      if (k in this.shaders) {
        continue;
      }

      this.shaders[DisplayModes[k]] = loadShader(gl, DrawShaders[k]);
    }
  }

  init() {
    super.init();

    this.gl = getWebGL();
    this.canvas = this.gl.canvas;

    /*
    if (DEBUG.gl) {
      this.gldebug = glDebug.getDebug(this.gl);
    } else {
      this.gldebug = undefined;
    }//*/

    this.header = this.header.row();

    this.defineKeyMap();
  }

  rebuildHeader() {
    let header = this.header;
    header.clear();
    header.prop("debugEditor.displayMode", PackFlags.USE_ICONS);

    console.log("rebuilding header");

    let gld = this.gldebug;
    if  (!gld) {
      return;
    }

    let enumdef = {};
    let i = 0;
    let idmap = {};

    for (let k in gld.fbos) {
      enumdef[k] = i;
      idmap[i] = k;
      i++;
    }

    header.listenum(undefined, {
      enumDef : enumdef,
      name : "Active History",
      defaultval : this.activeFBOHistory
    }).onselect = (val) => {
      this.activeFBOHistory = idmap[val];
    };
  }

  _redraw() {
    window.redraw_viewport();
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("Right", [], () => {
        this.curTex = Math.max(this.curTex-1, 0);
        this._redraw();
        console.log("curTex", this.curTex);
      }),
      new HotKey("Left", [], () => {
        this.curTex++;
        this._redraw();
        console.log("curTex", this.curTex);
      })
    ]);
  }

  drawStart(gl) {
    if (!this.gldebug || !gl)
      return;

    //this.gldebug.saveGL();
    //this.gldebug.loadCleanGL();

    let dpi = this.canvas.dpi;

    let x = this.owning_sarea.pos[0]*dpi, y = (this.owning_sarea.pos[1] + this.owning_sarea.size[1])*dpi;
    let w = this.owning_sarea.size[0]*dpi, h = this.owning_sarea.size[1]*dpi;

    let screen = this.ctx.screen;
    y = (screen.pos[1]+screen.size[1]) - y;

    //let rect = this.getBoundingClientRect();
    //y = rect.height - y;

    this.glPos[0] = ~~x;
    this.glPos[1] = ~~y;
    this.glSize[0] = ~~w;
    this.glSize[1] = ~~h;

    //console.log(this.glPos, this.glSize);

    gl.viewport(this.glPos[0], this.glPos[1], this.glSize[0], this.glSize[1]);
    gl.scissor(this.glPos[0], this.glPos[1], this.glSize[0], this.glSize[1]);

    //gl.disable(gl.SCISSOR_TEST);

    gl.clearColor(0.25, 0.25, 0.25, 1.0);
    gl.clearDepth(1.0);
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  }

  viewportDraw(gl) {
    //must go before this.gl assignment
    this.updateShaders(gl);

    this.gl = gl;
    let gld = this.gldebug;

    this.drawStart(gl);

    if (!gld) {
      return;
    }

    if (!(this.activeFBOHistory in gld.fbos)) {
      for (let k in gld.fbos) {
        this.activeFBOHistory = k;
        this.doOnce(this.rebuildHeader);
      }

      this.drawEnd();
      return;
    }

    let history = gld.fbos[this.activeFBOHistory];
    if (history.length === 0) {
      this.drawEnd();
      return;
    }

    let fbo = history[history.length - 1];
    let program = this.shaders[this.displayMode];

    gl.disable(gl.DEPTH_TEST);
    fbo.drawQuad(gl, fbo.size[0], fbo.size[1], undefined, undefined, program);

    /*
    let texs = gld.texs;

    let tex = texs[texs.length-this.curTex-1];
    if (tex !== undefined) {
      this.rect(gl, tex);
    }*/

    this.drawEnd();
  }

  drawEnd() {
    if (!this.gldebug)
      return;

    let gl = this.gl;

    //this.gldebug.restoreGL();
  }

  rect(gl, tex, uniforms={}) {
    if (this._rect === undefined) {
      let mesh = new SimpleMesh(LayerTypes.LOC | LayerTypes.UV);

      let quad = mesh.quad([-1, -1, 0], [-1, 1, 0], [1, 1, 0], [1, -1, 0]);
      quad.uvs([0, 0], [0, 1], [1, 1], [1, 0]);

      this._rect = mesh;
    }

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.DITHER);
    gl.disable(gl.BLEND);

    gl.depthMask(false);

    let depth = new Texture(1, tex.depth);
    tex = new Texture(0, tex);

    uniforms.rgba = tex;
    uniforms.depth = depth;

    let mesh = this._rect;

    if (this.displayMode === DisplayModes.RAW)
      mesh.program = Shaders.DisplayShader;
    else if (this.displayMode === DisplayModes.DEPTH)
      mesh.program = Shaders.DepthShader;

    mesh.program.bind(gl, uniforms);

    mesh.draw(gl, uniforms);
  }

  updateGlDebug() {
    if (!this.gl) {
      return;
    }

    let gldebug = glDebug.getDebug(this.gl);
    let rebuild = false;

    if (this.gldebug !== gldebug) {
      console.log("initializing gl debug");
      this.gldebug = gldebug;
      rebuild = true;
    }

    let key = "";
    let gld = this.gldebug;

    for (let k in gld.fbos) {
      key += k + ":";
    }

    rebuild = rebuild || key !== this._last_update_key;
    this._last_update_key = key;

    if (rebuild) {
      this.rebuildHeader();
    }
  }

  update() {
    let key = "";
    if (this.gldebug) {
      this.updateGlDebug();
    }

    super.update();
    this.updateGlDebug();
  }

  copy() {
    let ret = document.createElement("debug-editor-x");
    ret.ctx = this.ctx;

    return ret;
  }

  static define() {return {
    has3D     : true,
    tagname   : "debug-editor-x",
    areaname  : "DebugEditor",
    apiname   : "debugEditor",
    uiname    : "Debug",
    icon      : -1
  }}
}

DebugEditor.STRUCT = nstructjs.inherit(DebugEditor, Editor) + `
  displayMode      : int;
  activeFBOHistory : string;
}
`;

nstructjs.register(DebugEditor);
Editor.register(DebugEditor);

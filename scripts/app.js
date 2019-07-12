//handle to module.  never access in code; for debug console use only.
var _app = undefined;

window.APPVERSION = 0.001;

//stupid fix for stupid rjs bug
window.setTimeout(function(){
require([
  "util", "linear_algebra", "canvas_patch", "vectormath", "webgl",
  "camera_controls", "simplemesh", "sym", "ui", "mesh", "objloader",
  "fbo", "bluenoise_mask", "octree", "graph"
], function(util, linalg, canvas_patch, vectormath, webgl,
            camera_controls, simplemesh, sym, ui, mesh, objloader,
            fbo, unusedmask, octree) {
  "use strict";

  var exports = _app = {};
  
  window.APPNAME = "webgl_framework";
  window.LOCALSTORAGE_KEY = "startup_file_" + APPNAME;
  window.IGLOBALTIME_MUL = 1.0/1000.0
  window.LOCALSTORAGE_MODEL = "startup_model"
  
  var patch_canvas2d = canvas_patch.patch_canvas2d;
  var Vector2 = vectormath.Vector2, Vector3 = vectormath.Vector3;
  var Vector4 = vectormath.Vector4, Matrix4 = vectormath.Matrix4;
  var Camera = webgl.Camera, init_webgl = webgl.init_webgl,
      ShaderProgram = webgl.ShaderProgram;
  var CameraControls = camera_controls.CameraControls;
  var SimpleMesh = simplemesh.SimpleMesh;

  var sin=Math.sin, cos=Math.cos, abs=Math.abs, log=Math.log,
      asin=Math.asin, exp=Math.exp, acos=Math.acos, fract=Math.fract,
      sign=Math.sign, tent=Math.tent, atan2=Math.atan2, atan=Math.atan,
      pow=Math.pow, sqrt=Math.sqrt, floor=Math.floor, ceil=Math.ceil,
      min=Math.min, max=Math.max, PI=Math.PI, E=2.718281828459045;

  var unproject_p = new Vector3();

  var proj_cache_vs = util.cachering.fromConstructor(Vector4, 64);
  var unproj_cache_vs = util.cachering.fromConstructor(Vector4, 64);
  
  
  let AOShader = {
    vertex : `precision highp float;
uniform sampler2D rgba;
uniform sampler2D depth;

attribute vec3 position;
attribute vec2 uv;
uniform mat4 projectionMatrix;
uniform mat4 iprojectionMatrix;

varying vec2 v_Uv;

void main(void) {
  gl_Position = vec4(position, 1.0);
  v_Uv = uv;
}

`,
    fragment : `
#extension GL_EXT_frag_depth : require
    
precision highp float;
uniform mat4 projectionMatrix;
uniform mat4 iprojectionMatrix;

uniform sampler2D rgba;
uniform sampler2D depth;

uniform sampler2D bluemask;
uniform vec2 bluemask_size;

uniform vec2 size;
uniform float dist, factor, steps;
uniform int samples;
uniform float seed1, seed2;

varying vec2 v_Uv;

vec4 unproject(vec4 p) {
  vec4 p2 = iprojectionMatrix * vec4(p.xyz, 1.0);
  
  p2.xyz /= p2.w;
  
  return p2;
}

float sample_blue(vec2 uv) {
  float x = fract(uv[0] * size[0] / bluemask_size[0]); 
  float y = fract(uv[1] * size[1] / bluemask_size[1]); 
  
  return texture2D(bluemask, vec2(x, y))[0];
}

float rand1(float seed) {
  seed += 1.0;
  seed = fract(seed*0.00134234 + seed*0.1234543 + seed*10.23432423 + seed);
  
  seed = 1.0 / (0.00001*seed + 0.00001);
  return fract(fract(seed*3.234324)*5.234324);
}

float nrand1(float seed) {
  return (rand1(seed)*0.5 + rand1(seed+0.5)*0.5);
}
float wrand(float x, float y, float seed) {
    
  float b = sample_blue(v_Uv);
  
  //b = rand1(x*y + x + y);
  b = floor(b * steps)/steps;
  //b *= 100.0;
  float f = rand1(b + seed); //*0.01 + seed*0.1 + seed);
  
  return f;
  //x = (x*size[0]) + size[0]*(rand1(seed)-0.5);
  //y = (y*size[1]) + size[1]*(rand1(seed+0.5)-0.5);
  
  //1.593 1.5689000000000002
  //1.797 1.682
  //float f = fract(x*sqrt(2.0) + y*sqrt(3.0));
  //float f = fract(x*1.593 + y*1.56890);
  //float f = fract(x*seed1 + y*seed2); //0000000000001
  //float f = fract(x*1.539 + y*1.6572);
  
  float white = rand1((x+10.0) * (y+10.0)*0.001);
  //f += (rand1(seed + x*y) - f)*0.5;
  //f += (white - f)*0.5;
  f = white;
  
  //f = fract(1.0 / (0.00001*f + 0.00001));
  return f;
  //return fract(f*(seed+1.0)*sqrt(5.));
  
  seed += 1.0;
  seed = fract(seed*0.01 + seed*0.1 + seed*10.0 + seed);
  
  seed = 1.0 / (0.00001*seed + 0.00001);
  return fract(fract(seed*3.234324)*5.234324);
}

float rand(float x, float y, float seed) {
  //return (wrand(x, y, seed) + wrand(x, y, seed+0.5523) + wrand(x, y, seed+0.8324)) / 3.0;
  return wrand(x, y, seed);
}

void main(void) {
  vec4 p = vec4(gl_FragCoord.xyz, 1.0);
  p.xy = (p.xy / size)*2.0 - 1.0;

  p.z = texture2D(depth, v_Uv)[0];
  float z = p.z;

  p = unproject(p);
  
  float seed = 0.0;
  
  float f = 0.0;
  float tot = 0.0;
  
  for (int i=0; i<256; i++) {
    if (i > samples) {
      break;
    }
    
    vec3 n;
    n[0] = rand(v_Uv[0], v_Uv[1], seed)-0.5;
    n[1] = rand(v_Uv[0], v_Uv[1], seed+1.0)-0.5;
    n[2] = rand(v_Uv[0], v_Uv[1], seed+2.0)-0.5;
    
    n *= dist;
    vec4 p2 = vec4(p.xyz, 1.0) + vec4(n, 0.0);
    p2 = projectionMatrix * p2;
    
    p2.xyz /= p2.w;
    float oldz = p2.z;
    
    vec4 c = texture2D(rgba, (p2.xy*0.5 + 0.5));
    p2.z = texture2D(depth, (p2.xy*0.5 + 0.5))[0];
    
    vec4 p3 = unproject(p2);
    //float w = min(length(p3.xyz - p.xyz) / dist, 1.0);
    float w = length(p3.xyz - p.xyz) / dist;
    w = w > 2.0 ? 0.0 : min(w, 1.0);
    //w = min(w, 1.0);
    
    //float weight = abs(z - p2.z);
    //w=1.0;
    
    if (p2.z + (1.0+0.01*seed1)*abs(oldz-p2.z) > oldz) {
      w = 0.0;
    }
    
    f += w;
    
    seed += 3.0;
    tot += 1.0;
  }

  f /= tot;
  f = pow(1.0 - f, factor);

  //f = rand(v_Uv[0], v_Uv[1], 0.0);
  
  vec4 color = texture2D(rgba, v_Uv);
  gl_FragColor = vec4(color.rgb*f + f*0.1, color.a);
  
  //gl_FragColor = vec4(texture2D(rgba, v_Uv).rgb, 1.0);
  gl_FragDepthEXT = texture2D(depth, v_Uv)[0];
}
    
`,
    attributes : ["position", "uv"],
    uniforms : {
      samples : new webgl.IntUniform(5),
      dist : 0.5,
      factor : 1.0
    }
  };
  
  class AppState {
    constructor() {
      this.g = this.gl = undefined;
      this.canvas2d = undefined;
      this.canvas3d = undefined;
      
      this.pipeline = new fbo.FramePipeline();

      //make fun little grid
      this.mesh = new SimpleMesh();
      
      this.start_iGlobalTime = util.time_ms() * IGLOBALTIME_MUL;
      this.iGlobalTime = util.time_ms()*IGLOBALTIME_MUL - this.start_iGlobalTime;
      
      var d = 0.5;
      //var quad = this.mesh.quad([-d, -d, 0], [-d, d, 0], [d, d, 0], [d, -d, 0]);
      //quad.uvs([0, 0], [0, 1], [1, 1], [1, 0]);
      
      this.size = [0, 0];
      this.aspect = 1.0;

      this.camera = new Camera();
      this.camera_controls = new CameraControls();
      
      this._last_smoothshading = true;
      
      this.make_grid();
      this.settings = {
        setting1 : 1,
        samples : 8,
        dist : 1.0,
        factor : 1.0,
        seed1 : Math.sqrt(2),
        seed2 : Math.sqrt(3),
        smoothShading : true,
        steps : 5
      };
    }
    
    loadFile() {
      return new Promise((accept, reject) => {
        let input = document.createElement("input")
        input.setAttribute("type", "file")
        input.type = "file";
        
        input.onchange = () => {
          var file = input.files[0];
          
          var reader = new FileReader();
          reader.onload = function(e) {
              var buf = e.target.result;
              
              accept(buf);
          };
          
          reader.readAsText(file);
        }
        
        input.click();
      });
    }
    
    initPipeline() {
      let gl = this.gl;
      
      if (this.pipeline !== undefined) {
        this.pipeline.destroy(gl);
      }
      
      //*
      let bluemask = bluenoise_mask;
      let data = [];
      for (let i=0; i<bluemask.length; i++) {
        let f = bluemask[i] / 65535;
        
        f *= 255;
        data.push(f);
        data.push(f);
        data.push(f);
        data.push(f);
      }
      
      data = new Uint8Array(data);
      this.bluemask = webgl.Texture.load(gl,  bluenoise_mask_dimen, bluenoise_mask_dimen, data);
      this.bluemask.texture_slot = 2;
      this.bluemask.dimen = bluenoise_mask_dimen;
      //*/
      
      this.pipeline = new fbo.FramePipeline();
      this.pipeline.addStage(gl, AOShader);
    }
    
    loadOBJ(buf) {
      console.log("loading Wavefront OBJ file. . .");
      this.mesh = objloader.readOBJ(buf);
      //this.mesh.rescale();
      this.mesh.regenRender();
    }
    
    makeUI() {
        if (this.ui !== undefined) {
          this.ui.destroy();
        }
        
        this.ui = new ui.UI("", this);
        
        this.ui.button("load", "Load OBJ", () => {
          console.log("loading obj. . .");
          this.loadFile().then((buf) => {
            this.loadOBJ(buf);
            this.mesh.setShadeSmooth(this.settings.smoothShading);
            localStorage[LOCALSTORAGE_MODEL] = buf;
          });
        });
        
        var panel = this.ui.panel("Settings");
        panel.check("settings.setting1", "Setting 1", false);
        
        panel.listenum("settings.testenum", "Test Enum", {RED: 0, GREEN: 1, BLUE: 2}, 0);
        
        panel.slider("settings.dist", "Distance", 1.5, 0.0, 1, 0.01, false, false);
        panel.slider("settings.factor", "Factor", 1.0, 0.0, 55, 0.01, false, false);
        panel.slider("settings.seed1", "Bias", 1.0, 0.0, 0.2, 0.0001, false, false);
        panel.slider("settings.seed2", "Seed2", 1.0, 0.0, 1.75, 0.0001, false, false);
        panel.slider("settings.samples", "Samples", 1.0, 0, 512, 1, true, false);
        panel.slider("settings.steps", "Steps", 1.0, 0, 32, 1, true, false);
        panel.check("settings.smoothShading", "Smooth");
    }
    
    make_grid() {
      var mesh = this.mesh;

      var steps = 64;
      var v1 = new Vector3(), v2 = new Vector3(), v3 = new Vector3(), v4 = new Vector3();
      
      var du = 2.0 / (steps-1);
      var dv = 2.0 / (steps-1);
      var duv_u = 1.0 / (steps-1);
      var duv_v = 1.0 / (steps-1);
      
      var u1 = [0, 0], u2 = [0, 0], u3 = [0, 0], u4 = [0, 0];
      
      var u=-1.0, u22=0.0;
      for (var i=0; i<steps; i++, u += du, u22 += duv_u) {
        var v = -1.0, v22=0.0;
        
        for (var j=0; j<steps; j++, v += dv, v22 += duv_v) {
          v1[0] = u,    v1[1] = v;
          v2[0] = u,    v2[1] = v+dv;
          v3[0] = u+du, v3[1] = v+dv;
          v4[0] = u+du, v4[1] = v;
          
          u1[0] = u22,        u1[1] = v22;
          u2[0] = u22,        u2[1] = v22+duv_v;
          u3[0] = u22+duv_u,  u3[1] = v22+duv_v;
          u4[0] = u22+duv_u,  u4[1] = v22;
          
          var quad = mesh.quad(v1, v2, v3, v4);
          quad.uvs(u1, u2, u3, u4);
        }
      }
    }
    
    toJSON() {
      var ret = {
        camera   : this.camera.toJSON(),
        settings : this.settings,
        version  : this.version
      }
      
      return ret;
    }
    
    on_resize(size) {
      this.size[0] = size[0];
      this.size[1] = size[1];
      
      this.aspect = size[1]/this[0];
    }
    
    mouse_pre(e) {
      var p = new Vector2([e.pageX, this.canvas2d.height-e.pageY]);
      //this.unproject2d(p);
      
      return p;
    }
    
    loadJSON(obj) {
      if (obj.settings !== undefined) {
        for (let k in obj.settings) {
          this.settings[k] = obj.settings[k];
        }
      }
      //this.settings = obj.settings === undefined ? {} : obj.settings;
    }
    
    load() {
      try {
        var buf = localStorage[LOCALSTORAGE_KEY];
        var obj = JSON.parse(buf);
        
        console.log(obj);
        
        this.camera.loadJSON(obj.camera);
        this.loadJSON(obj);
        
        if (LOCALSTORAGE_MODEL in localStorage) {
          this.loadOBJ(localStorage[LOCALSTORAGE_MODEL]);
          this.mesh.setShadeSmooth(this.settings.smoothShading);
        }
        
        window.redraw_all();
      } catch(error) {
        this.camera = new Camera();
        
        util.print_stack(error);
        console.log("failed to load stored startup file");
      }
    }
    
    save() {
      var obj = this.toJSON();
      
      var buf = JSON.stringify(obj);
      localStorage[LOCALSTORAGE_KEY] = buf;
    }
    
    normalize_screenco(p) {
      p[0] = (p[0]/this.size[0]-0.5)*2.0;
      p[1] = (p[1]/this.size[1]-0.5)*2.0;
      
      return p;
    }
    
    denormalize_screenco(p) {
      p[0] = (p[0]+1.0)*0.5*this.size[0];
      p[1] = (p[1]+1.0)*0.5*this.size[1];
      
      return p;
    }
    
    unproject(p, not_normalized) {
      var orig = p;
      
      p = unproj_cache_vs.next().load(p);
      
      if (p[2] == undefined)
        p[2] = 0.0;
      p[3] = 1.0;
      
      if (not_normalized) 
        this.normalize_screenco(p);
      
      p.multVecMatrix(this.camera.irendermat);
      var w = p[3];
      p.mulScalar(1.0/w);
      
      orig[0] = p[0];
      orig[1] = p[1];
      if (orig.length > 2)
        orig[2] = p[2];
      if (orig.length > 3)
        orig[3] = w;
      
      return w;
    }
    
    project(p, not_normalized) {
      var orig = p;
      
      p = proj_cache_vs.next().load(p);
      
      if (p[2] == undefined)
        p[2] = 0.0;
      p[3] = 1.0;
      
      if (not_normalized) 
        this.normalize_screenco(p);
      
      p.multVecMatrix(this.camera.rendermat);
      var w = p[3];
      p.mulScalar(1.0/w);
      
      orig[0] = p[0];
      orig[1] = p[1];
      if (orig.length > 2)
        orig[2] = p[2];
      if (orig.length > 3)
        orig[3] = w;
      
      return w;
    }
    
    unproject2d(p) {
      unproject_p[0] = p[0], unproject_p[1] = p[1];
      unproject_p[2] = 0.0;
      
      unproject_p.multVecMatrix(this.g._imatrix);
      
      p[0] = unproject_p[0];
      p[1] = unproject_p[1];
      
      return p;
    }

    reload_shaders() {
      var gl = this.gl;
      
      gl.simple_shader = ShaderProgram.load_shader("simpleshader");
      gl.simple_shader.then(function() {
        console.log("shader loaded");
        window.redraw_all();
      });
      
      gl.program = gl.simple_shader;
    }
    
    on_gl_init() {
      var gl = this.gl
      console.log("gl init")
      
      this.reload_shaders();
      
      this.mesh.program = gl.program;
      this.mesh.uniforms = Object.assign(this.mesh.uniforms, {
        projectionMatrix : this.camera.rendermat,
        modelViewMatrix  : this.camera.cameramat,
        normalMatrix     : this.camera.normalmat,
        iGlobalTime      : this.iGlobalTime
      });
    }
    
    on_mousedown(e) {
      var mpos = this.mouse_pre(e);
      
      console.log("mousedown");
      
      this.camera_controls.start(document.body);
      
      //console.log(mpos);
    }
    
    on_mousemove(e) {
      var mpos = this.mouse_pre(e);
      //console.log(mpos);
    }
    
    on_mouseup(e) {
    }
      
    gl_draw(gl) {
      var aspect = this.aspect = this.size[0] / this.size[1];
      this.camera.regen_mats(aspect);

      this.mesh.uniforms.projectionMatrix = this.camera.rendermat;
      this.mesh.uniforms.modelViewMatrix  = this.camera.cameramat;
      this.mesh.uniforms.normalMatrix = this.camera.normalmat;
      this.mesh.uniforms.iGlobalTime = this.iGlobalTime;
      
      gl.viewport(0, 0, this.size[0], this.size[1]);
      
      gl.enable(gl.DEPTH_TEST);
      
      gl.clearDepth(1000000.0);
      gl.clearColor(0.3, 0.4, 1.0, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      
      this.mesh.draw(gl);
    }
    
    draw_transform2d(g) {
      g._matrix.makeIdentity();
      g.scale(this.size[0], this.size[1]);
      g.translate(0.5, 0.5);
      
      var asp = this.size[0]/this.size[1];
      if (asp > 1.0) {
        g.scale(1.0/asp, 1.0);
      } else {
        g.scale(1.0, asp);
      }
      
      var scale = this.scale = 0.4;
      g.scale(scale, -scale);
      g._imatrix.load(g._matrix).invert();
      
      this.scale *= Math.max(this.size[0], this.size[1]);
    }
    
    draw(g) {
      if (this._last_smoothshading != this.settings.smoothShading) {
        this._last_smoothshading = this.settings.smoothShading;
        this.mesh.setShadeSmooth(this.settings.smoothShading);
      }
      
      if (this.iGlobalTime > 50) {
        this.start_iGlobalTime = Math.floor(util.time_ms()*IGLOBALTIME_MUL);
        this.start_iGlobalTime -= this.iGlobalTime % 1;
        console.log("iglobaltime reset");
      }
      
      this.iGlobalTime = util.time_ms()*IGLOBALTIME_MUL - this.start_iGlobalTime;
      
        //save startup file
      this.save();
      
      g._matrix.makeIdentity();
      g.clearRect(0, 0, this.size[0], this.size[1]);
      this.draw_transform2d(g);
      
      var aspect = this.aspect = this.size[0] / this.size[1];
      this.camera.regen_mats(aspect);
      
      let dimen = this.bluemask.dimen;
      
      //set some ao uniforms
      this.pipeline.stages[1].shader.uniforms.samples = new webgl.IntUniform(this.settings.samples);
      this.pipeline.stages[1].shader.uniforms.dist = this.settings.dist*3.0;
      this.pipeline.stages[1].shader.uniforms.factor = this.settings.factor*0.0625;
      this.pipeline.stages[1].shader.uniforms.seed1 = this.settings.seed1;
      this.pipeline.stages[1].shader.uniforms.seed2 = this.settings.seed2;
      this.pipeline.stages[1].shader.uniforms.bluemask = this.bluemask;
      this.pipeline.stages[1].shader.uniforms.bluemask_size = [dimen, dimen];
      this.pipeline.stages[1].shader.uniforms.steps = this.settings.steps;
            
      this.pipeline.draw(this.gl, this.gl_draw.bind(this), this.size[0], this.size[1], this.camera);
      this.pipeline.drawFinal(this.gl);
      
      //this.gl_draw(this.gl);
      
      //loop animation
      window.redraw_all();
    }
    
    on_keydown(e) {
      console.log(e.keyCode);
      switch (e.keyCode) {
        case 189: //minuskey
          this.camera_controls.zoomstep(1);
          break;
        case 187: //pluskey
          this.camera_controls.zoomstep(-1);
          break;
        case 75: //kkey
          console.log("reload shaders");
          this.reload_shaders();
          break;
      }
    }
    
    on_keyup(e) {
    }}

  var animReq = undefined;

  var checksize = function() {
    var w = window.innerWidth, h = window.innerHeight;
    
    if (w != _appstate.size[0] || h != _appstate.size[1]) {
      console.log("size changed");
      
      _appstate.size[0] = w;
      _appstate.size[1] = h;
      
      _appstate.canvas2d.width = w;
      _appstate.canvas2d.height = h;
      _appstate.canvas3d.width = w;
      _appstate.canvas3d.height = h;
      
      _appstate.on_resize([w, h]);
      
      window.redraw_all();
    }
  }

  window.setInterval(function() {
    checksize();
  }, 50);

  var draw = exports.draw = function draw() {
    animReq = undefined;
    checksize();
    
    _appstate.draw(_appstate.g);
  }

  window.redraw_all = function() {
    if (animReq == undefined) {
      animReq = requestAnimationFrame(draw);
    }
  }

  window.clear_anim_req = function() {
    animReq = undefined;
  }

  var init = function() {
    window._appstate = new AppState();
    
    var canvas = document.getElementById("canvas2d");
    _appstate.canvas2d = canvas;
    var g = _appstate.g = canvas.getContext("2d");
    
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    
    _appstate.size = [window.innerWidth, window.innerHeight];
    
    patch_canvas2d(g);
    
    window.redraw_all();
    
    var canvas3d = document.getElementById("canvas3d");
    let cc = document.getElementById("content")
    cc.style["width"] = "100%";
    cc.style["height"] = "100%";
    
    cc.addEventListener("mousedown", function(e) {
      console.log("mousedown");
      _appstate.on_mousedown(e);
    }, true);
    cc.addEventListener("mousemove", function(e) {
      console.log("mousemove");
      _appstate.on_mousemove(e);
    }, true);
    cc.addEventListener("mouseup", function(e) {
      console.log("mouseup");
      _appstate.on_mouseup(e);
    }, true);
    
    _appstate.gl = init_webgl(canvas3d);
    _appstate.canvas3d = canvas3d;
    
    canvas3d.width = window.innerWidth;
    canvas3d.height = window.innerHeight;
    
    _appstate.on_gl_init();
    
    //load startup file
    _appstate.load();
    _appstate.makeUI();

    _appstate.initPipeline();
    
    console.log("initialized!")
  }

  init();

  window.addEventListener("keydown", function(e) {
    _appstate.on_keydown(e);
  });
  window.addEventListener("keyup", function(e) {
    _appstate.on_keyup(e);
  });
  return exports;
});
}, 250);

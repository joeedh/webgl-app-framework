import {Editor, HotKey, VelPan} from '../editor_base.js';
import {Icons} from '../icon_enum.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../../util/vectormath.js';
import * as util from '../../util/util.js';
import {
  nstructjs, ToolOp, color2css, css2color, math, KeyMap, UIBase, eventWasTouch, haveModal, saveUIData, loadUIData,
  EnumProperty, Menu
} from '../../path.ux/scripts/pathux.js';
import {VelPanPanOp} from '../velpan.js';
import {Colors, ObjectFlags} from '../../sceneobject/sceneobject.js';
import {MeshFlags, MeshTypes, MeshSymFlags} from '../../mesh/mesh_base.js';
import {snap} from '../../path.ux/scripts/screen/FrameManager_mesh.js';
import {SelectOneUVOp} from './uv_selectops.js';
import {SelOneToolModes} from '../view3d/selectmode.js';
import {ImageBlock, ImageFlags, ImageGenTypes, ImageTypes, ImageUser} from '../../image/image.js';
import {PrimitiveTypes, LayerTypes, SimpleMesh} from '../../core/simplemesh.ts';
import {UVWrangler} from '../../mesh/unwrapping.js';
import {Shaders} from '../../shaders/shaders.js';
import {DataRefProperty} from '../../core/lib_api.js';

import './uv_selectops.js';
import './uv_transformops.js';
import './uv_ops.js';
import {AttrRef, UVFlags} from '../../mesh/mesh_customdata.js';
import {resetUnwrapSolvers} from '../../mesh/mesh_uvops.js';

let _projtmp = new Vector2();

export const NearestUVTypes = {
  VERTEX: 1,
  EDGE  : 2,
  FACE  : 4
};

export class NearestUVRet {
  constructor() {
    this.type = 0;
    this.dist = 0;
    this.uv = new Vector2();
    this.l = undefined;
    this.z = 0;
  }
}

let findnearestRets = util.cachering.fromConstructor(NearestUVRet, 2048);

let uvp = new Vector2();

export function findnearestUV(localX, localY, uvEditor, limit        = 55,
                              type                                   = NearestUVTypes.VERTEX, cd_uv = undefined,
                              snapLimit = 0.00025, selectedFacesOnly = true) {
  let x = localX, y = localY;

  limit /= uvEditor.getScale()*(uvEditor.glSize[1]/UIBase.getDPI());
  //console.log(limit)
  //XXX remember to fix me
  limit = 0.2;


  let mesh = uvEditor.getMesh();

  if (!mesh) {
    return undefined
  }

  if (cd_uv === undefined) {
    cd_uv = mesh.loops.customData.getLayerIndex("uv");
  }
  if (cd_uv < 0) {
    return undefined;
  }

  let mindis, minret;
  let p = uvp;

  p[0] = localX;
  p[1] = localY;

  let list = [];
  let li = 0;

  let iter = selectedFacesOnly ? mesh.faces.selected.editable : mesh.faces;

  //have to iterate over faces to get z order right
  for (let f of iter) {
    for (let l of f.loops) {
      let uv = l.customData[cd_uv].uv;
      let dis = uv.vectorDistance(p);

      if (dis < limit) {
        let ret = findnearestRets.next();
        ret.l = l;
        ret.uv.load(uv);
        ret.dis = dis;
        ret.type = NearestUVTypes.VERTEX;
        ret.z = li;

        list.push(ret);
        li++;
      }
    }
  }

  let maxli = li;

  if (list.length === 0) {
    return undefined;
  }

  list.sort((a, b) => {
    let ret = (a.dis - b.dis);

    //for uvs stacked on top of each other, sort so top most comes first
    if (a.uv.vectorDistance(b.uv) < snapLimit) {
      ret = ret*maxli + (b.z - a.z)/maxli;
    } else {
      //weight by selection
      let s1 = !!(a.l.flag & MeshFlags.SELECT);
      let s2 = !!(b.l.flag & MeshFlags.SELECT);

      ret += (s1 - s2)/maxli;
    }

    return ret;
  });

  /*
  let i = 0;
  while (i < list.length && list[i].uv.vectorDistance(list[0].uv) < snapLimit) {
    i++;
  }

  list.length =i;
  //*/

  return list;
}

let localtemps = util.cachering.fromConstructor(Vector2, 64);

/**
 expects a datapath attribute references a Mesh
 and a selfpath attribute for building a path to itself
 **/
export class UVEditor extends UIBase {
  constructor() {
    super();

    this.matrix = new Matrix4();
    this.imatrix = new Matrix4();

    this.smesh2 = undefined;
    this.smesh = undefined;

    this.glPos = new Vector2(); //is set by parent
    this.glSize = new Vector2([512, 512]); //is set by parent

    this.mpos = new Vector2();
    this.start_mpos = new Vector2();

    this.selectedFacesOnly = true;

    this.snapLimit = 0.0001;

    this.canvas = document.createElement("canvas");
    this.g = this.canvas.getContext("2d");

    this.size = new Vector2([512, 512]);
    this.velpan = new VelPan();

    this.imageUser = new ImageUser();
    this.velpan.onchange = this.onVelPanChange.bind(this);

    this._redraw_req = undefined;
    this._last_update_key = "";

    this.drawlines = [];
    this.shadow.appendChild(this.canvas);
  }

  resetDrawLines() {
    this.drawlines.length = 0;
  }

  addDrawLine(v1, v2, color = "black") {
    if (typeof color === "object") {
      color = color2css(color);
    }

    let dl = new DrawLine(v1, v2, color);
    this.drawlines.push(dl);

    return dl;
  }

  findnearest(localX, localY, limit) {
    return findnearestUV(localX, localY, this, limit);
  }

  onVelPanChange() {
    this.flagRedraw();
  }

  getScale() {
    return this.velpan.scale[0];
  }

  static defineAPI(api) {
    let st = api.mapStruct(UVEditor, true);

    st.struct("velpan", "velpan", "VelPan", api.mapStruct(VelPan));
    st.struct("imageUser", "imageUser", "Image", api.mapStruct(ImageUser));

    return st;
  }

  init() {
    super.init();

    this.addEventListener("mousedown", this.on_mousedown.bind(this));
    this.addEventListener("mousemove", this.on_mousemove.bind(this));
    this.addEventListener("mouseup", this.on_mouseup.bind(this));
    this.addEventListener("mousewheel", this.on_mousewheel.bind(this));
  }

  on_mousewheel(e) {
    let dt = 1.0 - e.deltaY*0.001;

    let scale = this.velpan.scale[0]*dt;

    this.velpan.scale[0] = this.velpan.scale[1] = scale;
    this.velpan.update();

    e.preventDefault();
    e.stopPropagation();
  }

  on_mousedown(e) {
    if (haveModal()) {
      this.mdown = false;
      return;
    }

    this.mpos[0] = e.x;
    this.mpos[1] = e.y;

    if (!this.ctx) {
      return;
    }
    console.log("mdown");

    let wasTouch = eventWasTouch(e);
    let ok = wasTouch && e.altKey;
    ok = ok || (e.button !== 0 && !wasTouch);
    ok = ok || (e.button === 0 && e.altKey);

    //console.log("ok", ok, e.button, wasTouch);

    if (ok) {
      let op = new VelPanPanOp();
      let path = this.getAttribute("selfpath");
      path += ".velpan";

      op.inputs.velpanPath.setValue(path);
      this.ctx.api.execTool(this.ctx, op);
      //console.log("pan op");
    } else if (e.button === 0 || (eventWasTouch(e) && e.touches.length === 1)) {
      this.doSelect(e);

      this.mdown = true;
      this.start_mpos.load(this.mpos);
    }
  }

  doSelect(e) {
    let mpos = this.getLocalMouse(e.x, e.y);
    let snapLimit = this.snapLimit;
    let loops = findnearestUV(mpos[0], mpos[1], this, undefined, snapLimit);

    if (!loops) {
      return;
    }

    let i = 0;
    while (i < loops.length && loops[i].uv.vectorDistance(loops[0].uv) < snapLimit) {
      i++;
    }

    if (i === 0) {
      return;
    }

    let tool = new SelectOneUVOp();

    let mode;
    if (e.shiftKey) {
      mode = (loops[0].flag & MeshFlags.SELECT) ? SelOneToolModes.SUB : SelOneToolModes.ADD;
    } else {
      mode = SelOneToolModes.UNIQUE;
    }

    tool.inputs.mode.setValue(mode);

    i--;
    while (i >= 0) {
      tool.inputs.loopEids.push(loops[i].l.eid);
      i--;
    }

    console.log(tool);

    this.ctx.api.execTool(this.ctx, tool);
    this.flagRedraw();
  }

  updateHighlight(localX, localY) {
    let f = findnearestUV(localX, localY, this);

    let mesh = this.getMesh();
    if (!mesh) {
      return;
    }

    if (f) {
      f = f[0];
    }

    let l = f ? f.l : undefined;
    let redraw = l !== mesh.loops.highlight;

    //console.log(f, l);

    mesh.loops.highlight = l;

    if (redraw) {
      this.flagRedraw();
    }
  }

  on_mousemove(e) {
    //console.log(e, e.x, e.y);
    let x = e.x;//e.screenX;
    let y = e.y;//e.screenY;

    this.mpos[0] = x;
    this.mpos[1] = y;

    if (this.mdown && this.mpos.vectorDistance(this.start_mpos) > 15) {
      console.log("transform!");
      this.mdown = false;
      this.ctx.api.execTool(this.ctx, "uveditor.translate()");
    }

    if (!this.ctx) {
      return;
    }

    let p = this.getLocalMouse(x, y);
    this.updateHighlight(p[0], p[1]);

    //if (!window._over) {
    //window._over = document.createElement("overdraw-x");
    //window._over.start(_appstate.screen);
    //}
    //console.log(p[0], p[1], );
    //findnearestUV
    //console.log(this.getLocalMouse(e.x, e.y));
    //console.log("mmove");
  }

  on_mouseup(e) {
    this.mdown = false;
    this.mpos[0] = e.x;
    this.mpos[1] = e.y;

    e.stopPropagation();

    if (!this.ctx) {
      return;
    }
    console.log("mup");
  }

  getLocalMouse(x, y) {
    /*
    let r = this.canvas.getBoundingClientRect();
    if (!r) {
      return new Vector2([x, y]);
    }

    let p = new Vector2();

    p[0] = (x - r.x);
    p[1] = (y - r.y);
    //*/

    let p = localtemps.next();
    let dpi = UIBase.getDPI();

    let pos = this.parentEditor.pos;

    //console.log("pos", pos);


    let posy = this.ctx.screen.size[1]*dpi - this.glPos[1];
    //let posy = pos[1]*dpi;

    //y = this.ctx.screen.size - y;
    let h = window.innerHeight;
    //if (window.visualViewport) {
    h = visualViewport.height;
    //}
    //h = this.ctx.screen.size[1];

    y = h - y;

    //*
    p[0] = x*dpi - this.glPos[0];
    p[1] = y*dpi - this.glPos[1];
    //*/

    //p[1] = this.glSize[1] - p[1];

    this.unproject(p);

    return p;
  }

  project(p) {
    let p2 = _projtmp.load(p);

    //p2.mulScalar(this.glSize[1]/UIBase.getDPI());
    p2.multVecMatrix(this.matrix);

    //let dpi = UIBase.getDPI();

    p[0] = (p2[0]*0.5 + 0.5)*(this.glSize[0]);
    p[1] = (p2[1]*0.5 + 0.5)*(this.glSize[1]);

    return p;
  }

  unproject(p) {
    let p2 = _projtmp;

    p2[0] = (p[0]/this.glSize[0])*2.0 - 1.0;
    p2[1] = (p[1]/this.glSize[1])*2.0 - 1.0;

    p2.multVecMatrix(this.imatrix);

    p[0] = p2[0];
    p[1] = p2[1];

    return p;
  }

  getMesh() {
    if (!this.ctx) {
      return undefined;
    }
    return this.ctx.api.getValue(this.ctx, this.getAttribute("datapath"));
  }

  hasMesh() {
    return this.getMesh() !== undefined;
  }

  flagRedraw() {
    window.redraw_viewport(false);

    //console.warn("Redraw");

    if (this._redraw_req) {
      return;
    }

    this._redraw_req = 1;
    //window.setTimeout(() => this.redraw());

    //requestAnimationFrame(() => this.redraw());
  }

  updateMatrix() {
    let smat = new Matrix4();
    let smat2 = new Matrix4();
    let scale = this.glSize[1]/UIBase.getDPI();

    smat.scale(scale, scale, 1.0);
    smat2.scale(1/scale, 1/scale, 1.0);

    this.matrix.makeIdentity();

    let tmat1 = new Matrix4();
    let tmat2 = new Matrix4();

    let amat = new Matrix4();
    let aspect = this.glSize[1]/this.glSize[0];
    amat.scale(aspect, 1.0, 1.0);
    //amat.scale(1.0, 1.0/aspect, 1.0);

    let pan = this.velpan.pos;
    let pmat = new Matrix4();
    let zoom = this.velpan.scale[0];

    pmat.translate(2.0*pan[0]/this.size[1], 2.0*pan[1]/this.size[1], 0.0);

    smat.makeIdentity();
    smat.scale(zoom, -zoom, 1.0);


    let d = 0.5;
    tmat1.translate(-d, d, 0.0);
    tmat2.translate(-d, -d, 0.0);

    //this.matrix.multiply(tmat2);
    this.matrix.multiply(tmat1);
    this.matrix.multiply(amat);
    this.matrix.multiply(smat);
    this.matrix.multiply(pmat);

    //this.matrix.multiply(tmat1);

    let mat = new Matrix4();
    let image = this.ctx.activeTexture;

    if (image && image.ready) {
      aspect = image.width / image.height;
    } else {
      aspect = 1.0;
    }

    mat.scale(aspect, 1.0, 1.0);
    this.matrix.multiply(mat);

    this.imatrix.load(this.matrix).invert();
  }

  drawDrawLines(gl, uniforms, program) {
    let lf = LayerTypes.LOC|LayerTypes.UV|LayerTypes.COLOR|LayerTypes.ID;

    let sm = new SimpleMesh(lf);
    sm.primflag |= PrimitiveTypes.ADVANCED_LINES|PrimitiveTypes.LINES;

    for (let dl of this.drawlines) {
      let line = sm.line(dl.v1, dl.v2);

      line.colors(dl.color, dl.color);
      line.ids(2, 2, 2);
      line.uvs([0, 0], [1, 1]);
    }

    sm.draw(gl, uniforms, program);
    sm.destroy(gl);
  }

  viewportDraw(gl) {
    this.gl = gl;

    this.updateMatrix();

    let gltex;
    let image = this.ctx.activeTexture;

    if (this._redraw_req || !this.smesh) {
      console.log("regenerated uveditor meshes");
      this.genMeshes(gl);
    }

    let dpi = UIBase.getDPI();


    //console.log(this.glPos, this.glSize);

    let wsmat = new Matrix4();
    let wmat = new Matrix4();

    wsmat.scale(1.0, -1.0, 1.0);
    wmat.translate(0.0, 0.5, 0.0);

    let matrix = new Matrix4();

    //flip y
    //matrix.multiply(wmat);
    //matrix.multiply(wsmat);

    matrix.multiply(this.matrix);

    if (image && image.ready) {
      gltex = image.getGlTex(gl);
    } else if (image) {
      image.update();
    }

    let uniforms = {
      size            : this.glSize,
      aspect          : this.glSize[0]/this.glSize[1],
      near            : 0.0001,
      far             : 1.0,
      polygonOffset   : 0.0,
      projectionMatrix: matrix,
      objectMatrix    : new Matrix4(),
      pointSize       : 5*dpi,
      active_id       : -1,
      highlight_id    : -1,
      texture         : gltex,
      opacity : 1.0,
      alpha : 1.0
    }

    gl.clearColor(0.3, 0.3, 0.3, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.CULL_FACE);

    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    //gl.disable(gl.BLEND);

    this.smesh2.islands[0].draw(gl, uniforms);

    if (gltex) {
      this.smesh2.islands[1].draw(gl, uniforms);
    }

    this.smesh.draw(gl, uniforms, Shaders.MeshEditShader);
    this.drawDrawLines(gl, uniforms, Shaders.MeshEditShader);
  }

  genMeshes(gl = this.gl) {
    this.redraw();

    if (!this.gl || !this.ctx || !this.ctx.mesh) {
      return;
    }

    let colors = {};
    for (let k in Colors) {
      let c = new Vector4(Colors[k]);
      c[3] = 0.7;

      colors[k] = c;
    }

    function getColor(isSel, isHigh, isAct, isPin) {
      let mask = 0;

      if (isSel) {
        mask |= ObjectFlags.SELECT;
      }

      if (isAct) {
        mask |= ObjectFlags.ACTIVE;
      }

      if (isHigh) {
        mask |= ObjectFlags.HIGHLIGHT;
      }

      if (mask === 0) {
        return [0.1, 0.1, 0.1, 0.7];
      }

      return colors[mask];
    }

    this._redraw_req = undefined;
    let island1, island2;

    if (this.smesh) {
      this.smesh.reset(this.gl);
      this.smesh2.reset(this.gl);

      island1 = this.smesh2.islands[0];
      island2 = this.smesh2.islands[1];
    } else {
      this.smesh = new SimpleMesh(LayerTypes.UV | LayerTypes.COLOR | LayerTypes.ID | LayerTypes.LOC);
      this.smesh2 = new SimpleMesh(LayerTypes.UV | LayerTypes.COLOR | LayerTypes.ID | LayerTypes.LOC);
      this.smesh2.add_island();

      this.smesh.primflag |= PrimitiveTypes.POINTS | PrimitiveTypes.LINES;
      this.smesh2.island.primflag |= PrimitiveTypes.TRIS;

      island1 = this.smesh2.islands[0];
      island2 = this.smesh2.islands[1];
    }

    island1.program = Shaders.MeshEditShader;
    island2.program = Shaders.FlatMeshTexture;

    //let quad = this.smesh2.quad([0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]);
    let bg = 0.7, bg2 = 0.8;
    bg = [bg, bg, bg, 1.0];
    bg2 = [bg2, bg2, bg2, 1.0];

    let steps = 32;
    for (let i = 0; i < steps*steps; i++) {
      let ix = i%steps, iy = ~~(i/steps);
      let ds = 1.0/steps;

      let x = ix/steps, y = iy/steps;

      let quad = island1.quad([x, y, 0], [x, y + ds, 0], [x + ds, y + ds, 0], [x + ds, y, 0]);

      let c = (ix + iy) & 1 ? bg : bg2;
      quad.colors(c, c, c, c);
      quad.ids(1, 1, 1, 1);
    }

    let white = [1, 1, 1, 1];
    let quad = island2.quad([0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]);

    quad.ids(1, 1, 1, 1);
    quad.uvs([0, 0], [0, 1], [1, 1], [1, 0]);
    quad.colors(white, white, white, white);

    let sm = this.smesh;
    let mesh = this.ctx.mesh;
    let cd_uv = mesh.loops.customData.getLayerIndex("uv");

    if (cd_uv < 0) {
      return;
    }

    let wr = new UVWrangler(mesh, mesh.faces.selected.editable, new AttrRef(cd_uv));
    wr.buildIslands();
    //let wr = mesh.getUVWrangler(true, true);

    let lhighlight = mesh.loops.highlight;
    let lactive = mesh.loops.active;

    let red = [1, 0, 0, 0.6];

    for (let island of wr.islands) {
      for (let v of island) {
        v.co[2] = 0.0;

        let p = sm.point(v.co);
        p.ids(v.eid);

        let sel = false, high = false, active = false;
        let pin = false;

        for (let l of wr.vertMap.get(v)) {
          if (l.flag & MeshFlags.SELECT) {
            sel = true;
          }

          if (l === lhighlight) {
            high = true;
          }

          if (l === lactive) {
            active = true;
          }

          if (l.customData[cd_uv].flag & UVFlags.PIN) {
            pin = true;
          }

          if (wr.islandLoopMap.get(l) !== island) {
            // continue;
          }

          let v2 = wr.loopMap.get(l.next);
          v2.co[3] = 0.0;

          let line = sm.line(v.co, v2.co);
          line.ids(l.eid, l.eid);
        }

        let color = getColor(sel, high, active);
        p.colors(color);

        if (pin) {
          p = sm.point(v.co);
          p.ids(v.eid);
          p.colors(red);
        }
      }
    }


  }

  redraw() {
    return;
    //return this.genMeshes();

    this._redraw_req = undefined;
    //return;

    let g = this.g;
    let canvas = this.canvas;

    //console.log("redraw");

    let bg = this.getDefault("background");
    let lineclr = this.getDefault("gridLines");

    g.strokeStyle = lineclr;
    g.fillStyle = bg;

    //g.save();
    g.beginPath();
    g.rect(0, 0, canvas.width, canvas.height);
    //g.fill();

    g.clearRect(0, 0, canvas.width, canvas.height);

    let quad = [
      [0, 0], [0, 1], [1, 1], [1, 0]
    ];
    for (let i = 0; i < 4; i++) {
      this.project(quad[i]);
      let p = quad[i];

      p[1] = this.glSize[1] - p[1];
    }

    //console.log(quad);

    g.fillStyle = "rgba(200, 200, 200, 0.1)";
    g.beginPath();
    g.moveTo(quad[0][0], quad[0][1]);
    g.lineTo(quad[1][0], quad[1][1]);
    g.lineTo(quad[2][0], quad[2][1]);
    g.lineTo(quad[3][0], quad[3][1]);
    g.lineTo(quad[0][0], quad[0][1]);
    g.fill();

    let dpi = UIBase.getDPI();

    let cell = 32;
    let offx = this.velpan.pos[0];
    let offy = this.velpan.pos[1];
    let scale = this.velpan.scale[0];

    g.resetTransform();

    let width = canvas.width/dpi;
    let height = canvas.height/dpi;

    g.scale(dpi, dpi);

    let ysteps = Math.ceil(canvas.height/cell) + 1;
    let xsteps = ysteps;

    g.beginPath();
    let lp = new Vector2();
    for (let i = 0; i < xsteps + 1; i++) {
      let dt = i/xsteps;
      lp[0] = dt;
      lp[1] = 0;
      this.project(lp);

      g.moveTo(lp[0], lp[1]);
      lp[0] = dt;
      lp[1] = 1.0;

      this.project(lp);
      g.lineTo(lp[0], lp[1]);
    }

    for (let i = 0; i < ysteps + 1; i++) {
      let dt = i/ysteps;
      lp[1] = dt;
      lp[0] = 0;
      this.project(lp);

      g.moveTo(lp[0], lp[1]);
      lp[1] = dt;
      lp[0] = 1.0;

      this.project(lp);
      g.lineTo(lp[0], lp[1]);
    }

    g.stroke();

    return;

    if (this.imageUser.image) {
      let image = this.imageUser.image;

      //console.log("image", image);
      image.update();

      if (image.ready) {
        //get image field directly
        g.save();
        let p = this.velpan.pos;
        let s = this.velpan.scale[0];

        g.scale(s, s);

        g.translate(p[0], p[1]);

        let wid = this.size[1];
        g.scale(wid/image._image.width, wid/image._image.height);

        //g.drawImage(image._image, 0, 0)
        g.restore();
      }
    }

    //let scale = this.velpan.

    let drawtmps = util.cachering.fromConstructor(Vector2, 64);
    let mesh = this.getMesh();

    if (!mesh) {
      console.log("No mesh");
      //g.restore();
      return;
    }

    let cd_uv = mesh.loops.customData.getLayerIndex("uv");

    if (cd_uv < 0) {
      console.log("No uvs");
      //g.restore();
      return;
    }

    //scale /= this.size[1];

    g.beginPath();

    let colors = {};
    for (let k in Colors) {
      let c = new Vector4(Colors[k]);
      c[3] = 0.7;
      colors[k] = color2css(c);
    }

    function getColor(l) {
      let mask = 0;

      if (l.flag & MeshFlags.SELECT) {
        mask |= ObjectFlags.SELECT;
      }

      if (l === mesh.loops.active) {
        mask |= ObjectFlags.ACTIVE;
      }

      if (l === mesh.loops.highlight) {
        mask |= ObjectFlags.HIGHLIGHT;
      }

      if (mask === 0) {
        return "rgba(22, 22, 22, 0.7)";
      }

      return colors[mask];
    }

    let vsize = 4;

    function inrect(p) {
      return p[0] >= 0 && p[0] < width && p[1] > 1 && p[1] <= height;
    }

    let selectedFacesOnly = true;
    let iter = selectedFacesOnly ? mesh.faces.selected.editable : mesh.faces;

    for (let f of iter) {
      if (f.flag & MeshFlags.HIDE) {
        continue;
      }

      for (let list of f.lists) {
        let lastp, lastinside;
        let firstp, firstinside;

        for (let l of list) {
          let bad = l.flag & MeshFlags.HIDE;
          bad = bad || (l.f.flag & MeshFlags.HIDE);

          if (bad) {
            continue;
          }

          let uv = l.customData[cd_uv].uv;

          let color = getColor(l);

          let p = drawtmps.next().load(uv);
          this.project(p);

          //p[0] += this.velpan.pos[0];

          let inside = inrect(p);

          if (lastp && (lastinside || inside)) {
            g.moveTo(lastp[0], lastp[1]);
            g.lineTo(p[0], p[1]);
            g.strokeStyle = "rgba(0,0,0,0.5)";
            g.stroke();
          } else {
            firstp = p;
            firstinside = inside;
          }

          if (inside) {
            g.fillStyle = color;
            g.beginPath();
            g.rect(p[0] - vsize*0.5, p[1] - vsize*0.5, vsize, vsize);
            g.fill();
          }

          lastp = p;
          lastinside = inside;
        }

        if (firstp) {
          g.moveTo(lastp[0], lastp[1]);
          g.lineTo(firstp[0], firstp[1]);
          g.strokeStyle = "rgba(0,0,0,0.5)";
          g.stroke();
        }
      }
    }

    for (let dl of this.drawlines) {
      let v1 = new Vector2(dl.v1);
      let v2 = new Vector2(dl.v2);

      this.project(v1);
      this.project(v2);

      g.beginPath();
      g.moveTo(v1[0], v1[1]);
      g.lineTo(v2[0], v2[1]);
      g.strokeStyle = dl.color;
      g.stroke();
    }

    //g.restore();
  }

  setCSS() {
    super.setCSS();

    this.style["width"] = this.size[0] + "px";
    this.style["height"] = this.size[1] + "px";
    this.style["overflow"] = "hidden";
  }

  updateSize() {
    let dpi = UIBase.getDPI();
    let w = ~~(this.size[0]*dpi);
    let h = ~~(this.size[1]*dpi);

    let ok = w !== this.canvas.width || h !== this.canvas.height;

    if (!ok) {
      return;
    }

    this.setCSS();
    let canvas = this.canvas;
    console.log("size update");

    canvas.width = w;
    canvas.height = h;
    canvas.style["width"] = (w/dpi) + "px";
    canvas.style["height"] = (h/dpi) + "px";

    this.redraw();
  }

  updateMesh() {
    if (!this.ctx) {
      return;
    }

    let mesh = this.getMesh();
    let key = "";

    if (mesh) {
      key += mesh.lib_id + ":" + mesh.loops.length + ":" + ":" + mesh.uvRecalcGen;
    }

    let image = this.imageUser.image;


    if (key !== this._last_update_key) {
      this._last_update_key = key;
      this.flagRedraw();
    }
  }

  update() {
    if (!this.ctx) {
      return;
    }

    this.updateMatrix();
    super.update();

    //deal with any possible (rare) cases of dataLink failing to be called correctly
    if (this.imageUser.image && this.imageUser.image instanceof DataRef) {
      this.imageUser.image = this.ctx.datalib.get(this.imageUser.image);
      this.imageUser.image.lib_addUser();
    }

    if (this.imageUser.image) {
      this.imageUser.image.update();
    }

    this.updateMesh();
    this.velpan.maxVelocity = 0.0003;

    /*
    let velpan = this.velpan;
    let b = this.velpan.bounds;

    b[0][0] = -this.size[1]*3.0;
    b[0][1] = -this.size[1]*3.0;

    console.log(b[0][0], this.velpan.pos[0]);
    */

    this.velpan.update(true, false);
    this.updateSize();
  }

  static newSTRUCT() {
    return UIBase.createElement("uv-editor-x");
  }

  loadSTRUCT(reader) {
    reader(this);

    this.velpan.onchange = this.onVelPanChange.bind(this);
  }

  dataLink(owner, getblock, getblock_addUser) {
    this.imageUser.dataLink(owner, getblock, getblock_addUser);
  }

  static define() {
    return {
      tagname: "uv-editor-x",
      style  : "uveditor"
    }
  }
}

UVEditor.STRUCT = `
UVEditor {
  velpan              : VelPan;
  meshpath            : string | this.getAttribute("datapath");
  selfpath            : string | this.getAttribute("selfpath");
  imageUser           : ImageUser;
  selectedFacesOnly   : bool; 
}
`;
nstructjs.register(UVEditor);
UIBase.register(UVEditor);

export class DrawLine {
  constructor(v1, v2, color="black") {
    if (typeof color === "string") {
      color = css2color(color);
    }

    let a = color.length > 3 ? color[3] : 1.0;
    color = new Vector4(color);
    color[3] = a;

    this.v1 = new Vector3(v1);
    this.v2 = new Vector3(v2);
    this.v1[2] = this.v2[2] = 0.0;

    this.color = color;
  }
}

export class ImageBlockOp extends ToolOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      inputs  : {
        image : new DataRefProperty(ImageBlock),
        type  : new EnumProperty(ImageTypes.FLOAT_BUFFER, ImageTypes)
      }
    }
  }

  undoPre(ctx) {
    let image = this.inputs.image.getValue();
    image = ctx.datalib.get(image);

    let ud = this._undo = {

    };

    if (!image) {
      ud.type = "empty";
      return;
    }

    ud.dataref = DataRef.fromBlock(image);
    ud.type = "image";
    ud.image = image.copy();
  }

  undo(ctx) {
    let ud = this._undo;

    if (ud.type === "empty") {
      return;
    }

    let image = ctx.datalib.get(ud.dataref);
    if (!image) {
      console.warn("Missing image in undo handler");
      return;
    }

    ud.image.copyTo(image);
    image.flag |= ImageFlags.UPDATE;
    image.glReady = false;
    image.ready = false;
  }
}

export class SetImageTypeOp extends ImageBlockOp {
  static tooldef() {
    return {
      uiname  : "Set Image Type",
      toolpath: "image.set_type",
      inputs  : ToolOp.inherit()
    }
  }

  exec(ctx) {
    let image = ctx.datalib.get(this.inputs.image.getValue());

    if (!image) {
      console.warn("Missing image", this.inputs.image.getValue());
      return;
    }

    image.convertTypeTo(this.inputs.type.getValue());
    image.flag |= ImageFlags.UPDATE;
    image.update();
  }
}

ToolOp.register(SetImageTypeOp);

export class ImageEditor extends Editor {
  constructor() {
    super();

    this.glPos = new Vector2();
    this.glSize = new Vector2([256, 256]);

    this.container.noMarginsOrPadding();

    this.uvEditor = document.createElement("uv-editor-x");
    this.uvEditor.parentEditor = this;
    this.uvEditor.setAttribute("datapath", "mesh");
    this.uvEditor.setAttribute("selfpath", "imageEditor.uvEditor");

    //panel.style["z-order"] = "5";

    this.sidebar = this.makeSideBar();

    this.subframe = this.container.row();
    this.subframe.noMarginsOrPadding();

    this.rebuildLayout();
  }

  makeSideBar() {
    let sidebar = super.makeSideBar();

    return sidebar;
  }

  rebuildLayout() {
    this.uvEditor.remove();
    this.sidebar.remove();

    this.subframe.clear();

    this.subframe.add(this.uvEditor);
    this.subframe.add(this.sidebar);

    this.updateSideBar = true;
  }

  flagSidebarRegen() {
    this.updateSideBar = true;
  }

  onFileLoad(isActive) {
    /*
    let data = saveUIData(this.sidebar, "imageeditor");
    this.regenSidebar();
    loadUIData(this.sidebar, data);
    */
  }

  makeImageTypeMenu(con, path) {
    let on_select = (id) => {
      console.log("callback", id);
      let rdef = this.ctx.api.resolvePath(this.ctx, path);
      let image = rdef ? rdef.obj : undefined;

      if (!image) {
        console.warn("no image");
        return;
      }

      let tool = new SetImageTypeOp();
      tool.inputs.image.setValue(image);
      tool.inputs.type.setValue(id);

      this.ctx.api.execTool(this.ctx, tool);
    }

    let dropbox = con.listenum(undefined,  {
      name : "Type",
      enumDef : ImageTypes
    });

    dropbox.onselect = on_select;

    dropbox.update.after(() => {
      let val;

      try {
        val = dropbox.ctx.api.getValue(this.ctx, path);
      } catch (error) {
        dropbox.internalDisabled = true;
        return;
      }

      dropbox.internalDisabled = false;

      dropbox.setValue(val);
    });
  }

  regenSidebar() {
    if (!this.ctx || !this.updateSideBar) {
      this.updateSideBar = true;
      return;
    }

    this.updateSideBar = false;

    let uidata = saveUIData(this.sidebar, "sidebar");

    let sidebar = this.sidebar;

    sidebar.clear();

    let tabs = sidebar.tabpanel;
    let tab, panel, strip, path;
    let row, col;

    tab = tabs.tab("Workspace");
    tab.useIcons(false);

    col = tab.col();
    row = col.row();

    row.useIcons(true);
    row.prop("scene.propEnabled");
    row.useIcons(false);

    row.prop("scene.propMode");
    col.prop("scene.propRadius").range = [0.1, 500.0];
    col.prop("scene.propIslandOnly");

    tab = tabs.tab("Image Settings");
    let basepath = "imageEditor.uvEditor";

    path = basepath + ".imageUser.image";
    tab.dataPrefix = path;

    tab.prop("name");

    this.makeImageTypeMenu(tab, path + ".type");


    panel = tab.panel("Generator Settings");

    panel.prop("genType");
    let color = panel.prop("genColor");
    color.update.after(function () {
      if (!this.ctx) {
        return;
      }

      let image = this.ctx.api.getValue(this.ctx, "imageEditor.uvEditor.imageUser.image");
      let enabled = image;
      enabled = enabled && image.genType === ImageGenTypes.COLOR;
      enabled = enabled && image.type === ImageTypes.GENERATED;

      if (!!color.disabled !== !enabled) {
        color.disabled = !enabled;
      }
    });

    let sizeUpdate = function () {
      let image = this.ctx.api.getValue(this.ctx, "imageEditor.uvEditor.imageUser.image");
      let enabled = image && image.type === ImageTypes.GENERATED;

      if (!!this.disabled !== !enabled) {
        this.disabled = !enabled;
      }
    }

    panel.prop("width").update.after(sizeUpdate);
    panel.prop("height").update.after(sizeUpdate);

    tab = tabs.tab("Tools");
    col = tab.col();
    row = col.row();

    row.tool("mesh.unwrap_solve()");
    row.tool("mesh.relax_uvs()");

    row = col.row();
    row.tool("mesh.voxel_unwrap()");
    row.tool("mesh.randomize_uvs()");

    row = col.row();
    row.tool("mesh.reset_uvs()");
    row.tool("mesh.grid_uvs()");

    row = col.row();
    row.tool("mesh.pack_uvs()");
    row.tool("uveditor.project_uvs()");

    row = col.row();
    row.tool("mesh.fix_seams()");
    row.button("Reset Solver", () => {
      resetUnwrapSolvers();
    });

    loadUIData(this.sidebar, uidata);
    this.sidebar.flushUpdate();
  }

  init() {
    super.init();

    this.doOnce(this.regenSidebar);

    let header = this.header;
    let row = header.row().strip();

    let image_menu = [
      "image.open()|Open",
      Menu.SEP
    ];

    row.menu("Image", image_menu);
    row.menu("Edit", this.buildEditMenu());
    row.menu("View", []);

    let col = header.col();
    row = col.row();

    row.iconbutton(Icons.HOME, "Reset Pan/Zoom", () => {
      this.uvEditor.velpan.reset();
    });

    let browser = document.createElement("data-block-browser-x");
    browser.setAttribute("datapath", "imageEditor.uvEditor.imageUser.image");
    browser.blockClass = ImageBlock;

    row.add(browser);

    row = col.row();
    row.prop("scene.propEnabled");
    row.prop("scene.propMode");
    row.prop("scene.propRadius").range = [0.1, 500.0];

  }

  buildEditMenu() {
    return [
      "uveditor.toggle_select_all(mode='AUTO')",
      "uveditor.pick_select_linked(mode='ADD' immediateMode=true)",
      "uveditor.pick_select_linked(mode='SUB' immediateMode=true)",
      "uveditor.translate()",
      "uveditor.scale()",
      "uveditor.rotate()",
      "uveditor.set_flag(flag='PIN')|Set Pin",
      "uveditor.clear_flag(flag='PIN')|Clear Pin",
    ];
  }

  defineKeyMap() {
    this.keymap = new KeyMap([
      new HotKey("A", [], "uveditor.toggle_select_all(mode='AUTO')"),
      new HotKey("L", [], "uveditor.pick_select_linked(mode='ADD' immediateMode=true)"),
      new HotKey("L", ["SHIFT"], "uveditor.pick_select_linked(mode='SUB' immediateMode=true)"),
      new HotKey("G", [], "uveditor.translate()"),
      new HotKey("S", [], "uveditor.scale()"),
      new HotKey("R", [], "uveditor.rotate()"),
      new HotKey("P", [], "uveditor.set_flag(flag='PIN')"),
      new HotKey("P", ["ALT"], "uveditor.clear_flag(flag='PIN')")
    ]);
  }

  setCSS() {
    super.setCSS();
    this.background = "rgba(0,0,0,0)";//this.getDefault("DefaultPanelBG");
  }

  update() {
    if (!this.ctx) {
      return;
    }

    if (this.updateSideBar) {
      this.doOnce(this.regenSidebar);
    }

    this.push_ctx_active(false);
    super.update();

    let uve = this.uvEditor;
    let w = this.owning_sarea.size[0];
    let h = this.owning_sarea.size[1] - 100;

    uve.update();

    if (uve.size[0] !== w || uve.size[1] !== h) {
      uve.size[0] = w;
      uve.size[1] = h;
      uve.updateSize();
    }

    this.push_ctx_active(false);
  }

  static defineAPI(api) {
    let st = super.defineAPI(api);

    let uvst = UVEditor.defineAPI(api);

    st.struct("uvEditor", "uvEditor", "UV Editor Component", uvst);

    return st;
  }

  viewportDraw(gl) {
    if (!gl || !this.ctx || !this.ctx.screen) {
      return;
    }

    let dpi = UIBase.getDPI();
    if (0) {
      let screen = this.ctx.screen;

      let r = this.getBoundingClientRect();
      this.glPos[0] = r.x*dpi;
      this.glPos[1] = (screen.size[1] - (r.bottom))*dpi;
      this.glPos.floor();

      this.glSize.load(this.size).mulScalar(dpi).ceil();
      //this.glSize[0] = ~~(r.width*dpi);
      //this.glSize[1] = ~~(r.height*dpi);

    } else {
      this.glPos.load(this.pos);
      this.glPos[1] = this.ctx.screen.size[1] - (this.pos[1] + this.size[1]);
      this.glPos.mulScalar(dpi).floor();

      this.glSize.load(this.size).mulScalar(dpi).ceil();
    }

    let rect = this.uvEditor.getBoundingClientRect();
    let rect2 = this.header.getBoundingClientRect();
    window.rect = rect;
    window.rect2 = rect2;

    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(this.glPos[0], this.glPos[1], this.glSize[0], this.glSize[1]);
    gl.viewport(this.glPos[0], this.glPos[1], this.glSize[0], this.glSize[1]);

    this.style["background-color"] = "rgba(0,0,0,0)";
    this.container.style["background-color"] = "rgba(0,0,0,0)";
    this.uvEditor.style["background-color"] = "rgba(0,0,0,0)";

    this.uvEditor.glPos = this.glPos;
    this.uvEditor.glSize = this.glSize;

    this.uvEditor.viewportDraw(gl);
  }

  loadSTRUCT(reader) {
    let uve = this.uvEditor;

    this.uvEditor.remove();
    this.uvEditor = undefined;

    reader(this);
    super.loadSTRUCT(reader);

    if (!this.uvEditor) {
      this.uvEditor = uve;
    } else {
      this.uvEditor.setAttribute("datapath", uve.getAttribute("datapath"));
      this.uvEditor.setAttribute("selfpath", uve.getAttribute("selfpath"));
    }

    this.uvEditor.parentEditor = this;
    this.rebuildLayout();
  }

  dataLink(owner, getblock, getblock_addUser) {
    super.dataLink(owner, getblock, getblock_addUser);

    this.uvEditor.dataLink(owner, getblock, getblock_addUser);
  }

  static define() {
    return {
      areaname: "ImageEditor",
      tagname : "uv-image-editor-x",
      uiname  : "Image Editor",
      apiname : "imageEditor",
      flag    : 0,
      icon    : Icons.IMAGE_EDITOR,
      has3D   : true
    }
  }
}

ImageEditor.STRUCT = nstructjs.inherit(ImageEditor, Editor) + `
  uvEditor  : UVEditor;
  snapLimit : float;
}`;

nstructjs.register(ImageEditor);
Editor.register(ImageEditor);

window.redraw_uveditors = function () {
  if (!_appstate || !_appstate.screen) {
    return;
  }

  for (let sarea of _appstate.screen.sareas) {
    let editor = sarea.editor;

    if (editor instanceof ImageEditor) {
      editor.flagRedraw();
    }
  }
}

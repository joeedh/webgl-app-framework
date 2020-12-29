import {BrushProperty, PaintSample, PaintSampleProperty} from './pbvh_base.js';
import * as util from '../../../util/util.js';
import {
  BoolProperty,
  Curve1DProperty,
  EnumProperty, FlagProperty, FloatArrayProperty,
  FloatProperty, IntProperty, Matrix4, Quat, ToolOp,
  Vec3Property, Vec4Property, Vector2, Vector3,
  Vector4, math, Mat4Property, Vec2Property
} from '../../../path.ux/scripts/pathux.js';
import {DynamicsMask, SculptTools} from '../../../brush/brush.js';
import {BVHFlags} from '../../../util/bvh.js';
import {GridBase} from '../../../mesh/mesh_grids.js';
import {ImageTypes} from '../../../image/image.js';
import {FBO} from '../../../core/fbo.js';
import {LayerTypes, PrimitiveTypes, SimpleMesh} from '../../../core/simplemesh.js';
import {Shaders, ShaderDef} from '../../../shaders/shaders.js';
import {getFBODebug} from '../../debug/gldebug.js';
import {Texture, getShader} from '../../../core/webgl.js';
import {project} from '../view3d_utils.js';

let _id = 0;

import {tileManager, UNDO_TILESIZE} from '../../../image/gpuimage.js';

export class TexPaintOp extends ToolOp {
  constructor() {
    super();

    this.first = true;
    this.start_mpos = new Vector3();
    this.last_p = new Vector4();
    this.last_radius = undefined;
    this.last_mpos = new Vector3();
    this.mpos = new Vector3();
  }

  static tooldef() {
    return {
      uiname  : "Paint Stroke (Texture)",
      toolpath: "bvh.texpaint",
      inputs  : {
        brush    : new BrushProperty(),
        samples  : new PaintSampleProperty(),
        rendermat: new Mat4Property(),
        glSize   : new Vec2Property(),
        viewSize : new Vec2Property()
      },

      is_modal: true
    }
  }

  getShader(gl, brush) {
    let sdef = Object.assign({}, ShaderDef.TexturePaintShader);

    let uniforms = {
      brushAngle : 0.0
    };

    if (brush.texUser.texture) {
      let pre = '#define BRUSH_TEX\n';

      let tex = brush.texUser.texture;
      pre += tex.genGlslPre("inP", "outC", uniforms);

      let code = tex.genGlsl("inP", "outC", uniforms);

      //put code in new block scope
      code = `{\n${code}\n}\n`;

      let frag = sdef.fragment;
      frag = frag.replace(/\/\/\{BRUSH_TEX_PRE\}/, pre);
      frag = frag.replace(/\BRUSH_TEX/, code);

      sdef.fragment = frag.trim();
    }

    return getShader(gl, sdef);
  }

  on_keydown(e) {
    super.on_keydown(e);
  }

  on_mousemove(e) {
    let ctx = this.modal_ctx;
    let view3d = ctx.view3d;
    let mesh = ctx.mesh;

    if (!mesh || !view3d) {
      return;
    }

    let mpos = view3d.getLocalMouse(e.x, e.y);
    let x = mpos[0], y = mpos[1];

    this.mpos.load(mpos);

    let toolmode = ctx.toolmode;

    //the bvh toolmode is responsible for drawing brush circle,
    //make sure it has up to date info for that
    toolmode.mpos[0] = e.x;
    toolmode.mpos[1] = e.y;

    let bvh = mesh.getBVH(false);
    //log("sample!");

    let axes = [-1];
    let sym = mesh.symFlag;

    for (let i = 0; i < 3; i++) {
      if (mesh.symFlag & (1<<i)) {
        axes.push(i);
      }
    }

    let view = view3d.getViewVec(x, y);
    let origin = view3d.activeCamera.pos;

    let cam = view3d.activeCamera;

    let rendermat = cam.rendermat;

    this.inputs.rendermat.setValue(cam.rendermat);
    this.inputs.glSize.setValue(view3d.glSize);
    this.inputs.viewSize.setValue(view3d.size);

    let ob = ctx.object;

    let isect;

    //isect = bvh.castRay(origin, view);

    for (let axis of axes) {
      let origin2 = new Vector3(origin), view2 = new Vector3(view);

      if (axis !== -1) {
        let obmat = ob.outputs.matrix.getValue();
        let mat = new Matrix4(ob.outputs.matrix.getValue());
        mat.invert();

        origin2 = new Vector4(origin);
        origin2[3] = 1.0;

        view2 = new Vector4(view);
        view2[3] = 0.0;

        origin2.multVecMatrix(mat);
        origin2[axis] = -origin2[axis];

        view2.multVecMatrix(mat);
        view2[axis] = -view2[axis];

        origin2[3] = 1.0;
        view2[3] = 0.0;

        origin2.multVecMatrix(obmat);
        view2.multVecMatrix(obmat);
        view2.normalize();
        //log(origin2, view2);
      }

      let isect2 = bvh.castRay(origin2, view2);

      //log(isect2);

      if (isect2 && (!isect || isect2.dist < isect.dist)) {
        isect = isect2.copy();
        origin = origin2;
        view = view2;
      }
    }

    if (!isect) {
      return;
    }

    if (this.first) {
      this.first = false;
      this.mpos.load(mpos);
      this.start_mpos.load(mpos);
      this.last_mpos.load(mpos);
      this.last_p.load(isect.p);
      return;
    }


    let brush = this.inputs.brush.getValue();
    let radius = brush.radius;

    toolmode._radius = radius;

    //log("isect:", isect);

    let color = e.ctrlKey ? brush.bgcolor : brush.color;

    let p4 = new Vector4(isect.p);
    p4[3] = 1.0;

    p4.multVecMatrix(rendermat);
    let w = p4[3];

    if (w < 0.0) {
      return;
    }

    radius /= Math.max(view3d.glSize[0], view3d.glSize[1]);
    radius *= Math.abs(w);

    let spacing = this.inputs.brush.getValue().spacing;
    let steps = isect.p.vectorDistance(this.last_p)/(radius*spacing);
    //log("steps", steps);

    if (steps < 1) {
      return;
    }
    steps = Math.max(Math.ceil(steps), 1);

    p4.load(isect.p);
    p4[3] = w;

    let dx = this.mpos[0] - this.last_mpos[0];
    let dy = this.mpos[1] - this.last_mpos[1];

    let th = Math.atan2(dy, dx);

    let list = this.inputs.samples.getValue();
    let lastw;

    if (list.length > 0) {
      lastw = list[list.length-1].w;
    } else {
      lastw = w;
    }

    for (let i = 0; i < steps; i++) {
      let t = i/(steps - 1);

      let ps = new PaintSample();

      ps.w = w + (lastw - w) * t;

      ps.viewvec.load(view);
      ps.vieworigin.load(origin);

      ps.strength = brush.strength;
      ps.color.load(color);
      ps.angle = th;

      ps.p.load(this.last_p).interp(isect.p, t);

      ps.mpos = new Vector2(this.last_mpos).interp(this.mpos, t);
      ps.radius = radius;

      this.inputs.samples.push(ps);

      this.execDot(ctx, ps);
    }

    this.last_mpos.load(mpos);
    this.last_p.load(isect.p);
    this.last_p[3] = w;

    window.redraw_viewport();

  }

  exec(ctx) {
    let mesh = ctx.mesh;

    if (!mesh) {
      return;
    }

    let cd_uv = mesh.loops.customData.getLayerIndex("uv");
    if (cd_uv < 0) {
      return;
    }

    //check that UV island mesh is up to date
    mesh.getUVWrangler(true, true);

    for (let ps of this.inputs.samples) {
      this.execDot(ctx, ps);
    }
  }

  execDot(ctx, ps) {
    let gl = _gl;

    function log() {
      if (window.__dolog) {
        console.log(...arguments);
      }
    }

    if (!ctx.mesh || !ctx.activeTexture) {
      return;
    }

    let texture = ctx.activeTexture;

    if (!texture.ready) {
      return;
    }

    if (texture.type !== ImageTypes.FLOAT_BUFFER) {// || texture.type !== ImageTypes.BYTE_BUFFER) {
      if (texture.glTex) {
        texture.glTex.destroy(gl)
        texture.glTex = undefined;
      }
      if (texture._drawFBO) {
        texture._drawFBO.destroy(gl);
        texture._drawFBO = undefined;
      }

      texture.convertTypeTo(ImageTypes.FLOAT_BUFFER);
      texture.update();
    }

    if (!texture.ready) {
      return;
    }

    let fbo;

    texture.getDrawFBO(gl);

    let co = new Vector3(ps.p);
    let w = ps.p[3];
    let radius = ps.radius;
    let strength = ps.strength;

    let mesh = ctx.mesh;
    let bvh = mesh.getBVH(false);

    fbo = texture._drawFBO;

    let wrangler = mesh.getUVWrangler(false, false);

    let gltex = texture.getGlTex(gl);
    texture.gpuHasData = true;

    let cd_grid = GridBase.meshGridOffset(mesh);
    let haveGrids = cd_grid >= 0;

    let cd_color, cd_uv;

    cd_uv = mesh.loops.customData.getLayerIndex("uv");
    if (cd_uv < 0) {
      console.error("no uvs");
      return;
    }

    if (haveGrids) {
      cd_color = mesh.loops.customData.getLayerIndex("color");
    } else {
      cd_color = mesh.verts.customData.getLayerIndex("color");
    }

    let haveColor = cd_color >= 0;

    //let vs = bvh.closestVerts(co, radius);
    let ts = bvh.closestTris(co, radius);

    //log(ts, haveColor, cd_color);
    //*
    let avgno = new Vector3();

    ts = ts.filter((t) => {
      t.no.load(math.normal_tri(t.v1, t.v2, t.v3));

      let area = t.area = math.tri_area(t.v1, t.v2, t.v3);
      avgno.addFac(t.no, area);

      let dot = t.no.dot(ps.viewvec);
      //log("DOT", dot, ps.viewvec, t.no);
      return dot <= 0.0;
    });

    avgno.normalize();

    if (ts.size === 0) {
      return;
    }

    // */

    let rendermat = this.inputs.rendermat.getValue(); //view3d.activeCamera.rendermat;
    let glSize = this.inputs.glSize.getValue();
    let viewSize = this.inputs.viewSize.getValue();

    let brush = this.inputs.brush.getValue();
    let brushco = new Vector3(ps.p);

    let w0 = project(brushco, rendermat, viewSize);
    brushco.load(ps.mpos);
    brushco[2] = 0.0;

    let radius2 = brush.radius;
    radius2 *= 0.5;

    //radius2 = radius;

    let sm = new SimpleMesh(LayerTypes.LOC | LayerTypes.UV | LayerTypes.CUSTOM); // | LayerTypes.COLOR | LayerTypes.NORMAL);

    let sm_loc = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 4, "sm_loc").index;
    let sm_params = sm.addDataLayer(PrimitiveTypes.TRIS, LayerTypes.CUSTOM, 2, "sm_params").index;


    let ltris = mesh._ltris;
    let uv1 = new Vector3();
    let uv2 = new Vector3();
    let uv3 = new Vector3();

    let size = new Vector2().loadXY(texture.width, texture.height);
    let isize = new Vector2().addScalar(1.0).div(size);

    let texelU = 1.0/texture.width;
    let texelV = 1.0/texture.height;

    let params = [new Vector4(), new Vector4(), new Vector4()];

    let centuv = new Vector2();
    let duv = new Vector2();

    function getcorner(l) {
      return wrangler.loopMap.get(l).corner;
      let ret = l !== l.radial_next && wrangler.islandLoopMap.get(l) !== wrangler.islandLoopMap.get(l.radial_next);

      l = l.next;
      ret = ret || (l !== l.radial_next && wrangler.islandLoopMap.get(l) !== wrangler.islandLoopMap.get(l.radial_next));

      l = l.prev.prev;
      ret = ret || (l !== l.radial_next && wrangler.islandLoopMap.get(l) !== wrangler.islandLoopMap.get(l.radial_next));

      return ret;
    }

    function processuv(uv, cent, corner) {
      //corner = false;
      let d = -0.001;
      let fac = corner ? 3.5 : 0.0;

      duv.load(uv).sub(cent).normalize();

      uv.mul(size);
      uv.addFac(duv, fac);
      uv.addScalar(d).floor().addScalar(0.5).mul(isize);
    }


    let umin = new Vector2().addScalar(1e17);
    let umax = new Vector2().addScalar(-1e17);
    let utmp = new Vector2();
    let triuv2 = new Vector2();

    let radiusx = brush.radius/texture.width;
    let radiusy = brush.radius/texture.height;
    let pradius = new Vector2().loadXY(radiusx, radiusy);

    for (let tri of ts) {
      let cr1, cr2, cr3;

      if (haveGrids) {
        uv1.load(tri.v1.customData[cd_uv].uv);
        uv2.load(tri.v2.customData[cd_uv].uv);
        uv3.load(tri.v3.customData[cd_uv].uv);
        cr1 = cr2 = cr3 = false;
      } else {
        let li = tri.tri_idx;
        let l1 = ltris[li];
        let l2 = ltris[li + 1];
        let l3 = ltris[li + 2];

        cr1 = getcorner(l1);
        cr2 = getcorner(l2);
        cr3 = getcorner(l3);

        uv1.load(l1.customData[cd_uv].uv);
        uv2.load(l2.customData[cd_uv].uv);
        uv3.load(l3.customData[cd_uv].uv);
      }

      centuv.load(uv1).add(uv2).add(uv3).mulScalar(1.0/3.0);

      processuv(uv1, centuv, cr1 && cr2);
      processuv(uv2, centuv, cr2 && cr3);
      processuv(uv3, centuv, cr3 && cr1);

      let p1 = new Vector4(tri.v1);
      let p2 = new Vector4(tri.v2);
      let p3 = new Vector4(tri.v3);

      p1[3] = p2[3] = p3[3] = 1.0;


      project(p1, rendermat, viewSize);
      project(p2, rendermat, viewSize);
      project(p3, rendermat, viewSize);

      let triuv;

      if (0) {
        let [axis1, axis2] = math.calc_projection_axes(tri.no);
        triuv = math.barycentric_v2(ps.p, tri.v1, tri.v2, tri.v3, axis1, axis2);
      } else {
        triuv = math.barycentric_v2(brushco, p1, p2, p3, 0, 1);
      }

      triuv.minScalar(1.0);
      triuv.maxScalar(0.0);

      let w2 = triuv[0]*p1[3] + triuv[1]*p2[3] + (1.0 - triuv[0] - triuv[1])*p3[3];
      //w2 = w0;

      let rx = (w2/texture.width)//*(glSize[1]/texture.width);
      let ry = (w2/texture.height)//*(glSize[1]/texture.height);

      rx = w2/glSize[1];
      ry = w2/glSize[1];

      rx *= 6.0;
      ry *= 6.0;

      //rx *= 2;
      //ry *= 2;

      log("RADIUS", (rx*texture.width).toFixed(4), (ry*texture.height).toFixed(4));
      //console.log("TRIUV", triuv);

      triuv2.zero();

      triuv2.addFac(uv1, triuv[0]);
      triuv2.addFac(uv2, triuv[1]);
      triuv2.addFac(uv3, 1.0 - triuv[0] - triuv[1]);

      umin.min(triuv2);
      umax.max(triuv2);

      //rx = 0.0;
      //ry = 0.0;

      utmp.loadXY(rx, ry).add(triuv2);
      umin.min(utmp);
      umax.max(utmp);

      utmp.loadXY(rx, ry).negate().add(triuv2);
      umin.min(utmp);
      umax.max(utmp);

      uv1.mulScalar(2.0).subScalar(1.0);
      uv2.mulScalar(2.0).subScalar(1.0);
      uv3.mulScalar(2.0).subScalar(1.0);

      uv1[2] = uv2[2] = uv3[2] = 0.0;

      let tri2 = sm.tri(uv1, uv2, uv3);

      let fade = Math.abs(tri.no.dot(ps.viewvec));

      tri2.custom(sm_loc, p1, p2, p3);

      let pw = 3.0;
      params[0][0] = Math.abs(tri.v1.no.dot(ps.viewvec))**pw;
      params[1][0] = Math.abs(tri.v2.no.dot(ps.viewvec))**pw;
      params[2][0] = Math.abs(tri.v3.no.dot(ps.viewvec))**pw;

      tri2.custom(sm_params, params[0], params[1], params[2]);

      //tri2.normals(tri.v1.no, tri.v2.no, tri.v3.no);
    }

    //umin.sub(pradius);
    //umax.add(pradius);

    let margin = 8;
    margin = new Vector2().loadXY(margin/texture.width, margin/texture.height);

    umin.sub(margin);
    umax.add(margin);

    let usize = new Vector2(umax).sub(umin);
    let tsize = new Vector2(usize).addScalar(0.0001).mul(size).ceil();
    tsize.max([4, 4]);

    size[0] = texture.width;
    size[1] = texture.height;

    umin.addScalar(0.00001).mul(size).floor();
    umax.addScalar(0.00001).mul(size).ceil();

    log(umin, umax);

    let saveUndoTile_intern = (tx, ty) => {
      let smin = new Vector2([tx*UNDO_TILESIZE, ty*UNDO_TILESIZE]);
      smin[0] /= texture.width;
      smin[1] /= texture.height;

      let smax = new Vector2([(tx + 1)*UNDO_TILESIZE, (ty + 1)*UNDO_TILESIZE]);
      smax[0] /= texture.width;
      smax[1] /= texture.height;

      let ssize = new Vector2([UNDO_TILESIZE, UNDO_TILESIZE]);


      console.log(ssize, smin, smax);

      //let gldebug = getFBODebug(gl);
      let tile = tileManager.alloc(gl);

      let savetile = tile.fbo; //new FBO(gl, ssize[0], ssize[1]);
      savetile.update(gl, ssize[0], ssize[1]);

      let sm = new SimpleMesh(LayerTypes.LOC | LayerTypes.UV);
      sm.primflag = PrimitiveTypes.TRIS;
      sm.island.primflag = PrimitiveTypes.TRIS;

      let quad = sm.quad(
        [-1, -1, 0],
        [-1, 1, 0],
        [1, 1, 0],
        [1, -1, 0]
      );

      Texture.unbindAllTextures(gl);

      quad.uvs(
        [smin[0], smin[1]],
        [smin[0], smax[1]],
        [smax[0], smax[1]],
        [smax[0], smin[1]]
      );

      sm.program = fbo.getBlitShader(gl);
      sm.uniforms.rgba = texture.glTex;
      sm.uniforms.valueScale = 1.0;

      gl.disable(gl.DEPTH_TEST);
      gl.disable(gl.CULL_FACE);
      gl.disable(gl.BLEND);
      gl.disable(gl.SCISSOR_TEST);

      gl.depthMask(false);

      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      savetile.bind(gl);

      sm.draw(gl, sm.uniforms, sm.program);

      gl.finish();

      let rowsize = Math.ceil(texture.width/UNDO_TILESIZE);
      let id = ty*rowsize + tx;

      //gldebug.saveDrawBuffer("undotile:" + id); //"buf:" + (_id++));

      gl.finish();
      savetile.unbind(gl);

      tile.x = tx*UNDO_TILESIZE;
      tile.y = ty*UNDO_TILESIZE;
      tile.u = (tx*UNDO_TILESIZE)/texture.width;
      tile.v = (ty*UNDO_TILESIZE)/texture.height;

      sm.destroy(gl);

      return tile;
    }

    let saveUndoTile = (smin, smax) => {
      smin[0] = Math.min(Math.max(smin[0], 0), texture.width - 1);
      smin[1] = Math.min(Math.max(smin[1], 0), texture.height - 1);

      smax[0] = Math.min(Math.max(smax[0], 0), texture.width);
      smax[1] = Math.min(Math.max(smax[1], 0), texture.height);

      smin.mulScalar(1.0/UNDO_TILESIZE).floor();
      smax.mulScalar(1.0/UNDO_TILESIZE).ceil();

      smax[0] = Math.max(smax[0], smin[0] + 1);
      smax[1] = Math.max(smax[1], smin[1] + 1);

      let rowsize = Math.ceil(texture.width/UNDO_TILESIZE);

      //console.log(smin, smax);

      for (let iy = smin[1]; iy < smax[1]; iy++) {
        for (let ix = smin[0]; ix < smax[0]; ix++) {
          let idx = (iy*rowsize + ix);
          if (!(idx in this._tilemap)) {
            let t = saveUndoTile_intern(ix, iy);

            this._tilemap[idx] = t;
            this._tiles.push(t);

            console.log("saving tile", ix, iy);
          }
        }
      }
    }

    if (1) {
      let smin = new Vector2(umin), smax = new Vector2(umax);
      if (!fbo.__first) {
        smin.zero();
        smax[0] = texture.width;
        smax[1] = texture.height;
      }

      saveUndoTile(smin, smax);
      Texture.unbindAllTextures(gl);

      fbo.update(gl, texture.width, texture.height);
      fbo.bind(gl);

      gl.depthMask(false);
      gl.disable(gl.DEPTH_TEST);

      if (!fbo.__first) {
        gl.disable(gl.SCISSOR_TEST);

        fbo.__first = true;
      } else {
        gl.enable(gl.SCISSOR_TEST);
        gl.scissor(umin[0], umin[1], (umax[0] - umin[0]), (umax[1] - umin[1]));
      }

      gl.clearColor(1, 0.5, 0.25, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.disable(gl.DEPTH_TEST);
      fbo.drawQuad(gl, texture.width, texture.height, texture.glTex, null);
      gl.disable(gl.DEPTH_TEST);

      let color = new Vector4(ps.color);
      color[3] *= strength;

      let matrix = new Matrix4();

      let uniforms = {
        size            : [texture.width, texture.height],
        aspect          : texture.width/texture.height,
        projectionMatrix: matrix,
        uColor          : color,
        brushCo         : brushco,
        radius          : radius2,
        brushAngle      : ps.angle
      };

      gl.depthMask(false);

      sm.program = this.getShader(gl, brush);
      //sm.program = Shaders.TexturePaintShader;
      sm.uniforms = uniforms;

      gl.enable(gl.BLEND);
      gl.blendColor(1.0, 1.0, 1.0, 1.0);
      //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.CONSTANT_ALPHA, gl.CONSTANT_ALPHA);
      sm.draw(gl, uniforms, Shaders.TexturePaintShader);

      window.sm = sm;

      //gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.finish();

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, gltex.texture);

      //gl.readBuffer(gl.COLOR_ATTACHMENT0);

      //gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, texture.width, texture.height);

      fbo.unbind(gl);

      texture.swapWithFBO(gl);
    }

    if (haveColor && 0) {
      for (let t of ts) {
        let c1 = t.v1.customData[cd_color].color;
        let c2 = t.v2.customData[cd_color].color;
        let c3 = t.v3.customData[cd_color].color;

        let dis = math.dist_to_tri_v3(co, t.v1, t.v2, t.v3, t.no);

        c1[0] = dis/radius;
        c2[0] = dis/radius;
        c3[0] = dis/radius;

        if (t.node) {
          t.node.flag |= BVHFlags.UPDATE_DRAW;
          //bvh.updateNodes.add(t.node);
        }
      }
    }

    sm.destroy(gl);

    bvh.update();
    window.redraw_viewport();
    //console.log(vs);
  }

  modalStart(ctx) {
    this.first = true;

    let mesh = ctx.mesh;
    if (mesh) {
      //check that UV island mesh is up to date
      mesh.getUVWrangler(true, true);
    }

    return super.modalStart(ctx);
  }

  undoPre(ctx) {
    this._tiles = [];
    this._tilemap = {};

    console.warn("undoPre: implement me!");
  }

  undo(ctx) {
    console.warn("undo: implement me!");
    console.log(this._tiles);

    if (!ctx.mesh || !ctx.activeTexture) {
      return;
    }

    let texture = ctx.activeTexture;

    //check texture is in proper float buffer state
    if (texture.type !== ImageTypes.FLOAT_BUFFER) {
      texture.convertTypeTo(ImageTypes.FLOAT_BUFFER);
      texture.update();
    }

    if (!texture.ready || !texture.glTex) {
      if (texture.ready) {
        texture.getGlTex(ctx.gl);
      }

      //hrm, should be a rare case
      if (this._tiles.length > 0) {
        console.warn("Texture race condition?");
        let time = util.time_ms();

        //try again
        window.setTimeout(() => {
          //is texture still not ready after 5 seconds?
          if (util.time_ms() - time > 5000) {
            console.warn("Undo timeout");
            return;
          }

          this.undo(ctx);
        }, 10);

        return;
      }
      return;
    }

    let gl = ctx.gl;

    console.log("texture paint undo!");

    let dbuf = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING);
    let rbuf = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);

    let fbo = texture.getDrawFBO(gl);

    fbo.bind(gl);

    gl.disable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.BLEND);
    gl.disable(gl.DITHER);

    fbo.drawQuad(gl, texture.width, texture.height, texture.glTex, null);
    fbo.unbind(gl);

    for (let tile of this._tiles) {
      let tilefbo = tile.fbo;

      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, tilefbo.fbo);
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbo.fbo);

      let w = tile.width, h = tile.height;

      w = Math.max(w + tile.x, texture.width - 1) - tile.x;
      h = Math.max(h + tile.y, texture.height - 1) - tile.y;

      console.log(w, h, tile.x, tile.y);

      gl.blitFramebuffer(0, 0, w, h,
        tile.x, tile.y, tile.x + w, tile.y + h,
        gl.COLOR_BUFFER_BIT, gl.NEAREST);
    }

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, dbuf);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rbuf);

    gl.enable(gl.DITHER);

    fbo.__first = true;

    texture.swapWithFBO(gl);
    texture.freeDrawFBO(gl);

    window.redraw_viewport(true);
  }

  modalEnd() {
    let ctx = this.modal_ctx;

    let ret = super.modalEnd(...arguments);

    if (ctx.toolmode) {
      //stop custom radius drawing for brush circle
      ctx.toolmode._radius = undefined;
    }

    return ret;
  }

  on_mouseup(e) {
    this.modalEnd();
  }
}

ToolOp.register(TexPaintOp);

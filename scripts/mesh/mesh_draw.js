import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js';

import {MeshDrawFlags, MeshFeatures, MeshFlags, MeshTypes, RecalcFlags} from "./mesh_base.js";
import {CustomDataElem} from "./customdata";
import {nstructjs} from '../path.ux/scripts/pathux.js';
import {Colors} from "../sceneobject/sceneobject.js";
import {ChunkedSimpleMesh, LayerTypes, PrimitiveTypes} from "../core/simplemesh.ts";
import {NormalLayerElem, UVLayerElem} from "./mesh_customdata.js";
import {SelMask} from "../editors/view3d/selectmode.js";
import {Grid, GridBase} from "./mesh_grids.js";
import {getFaceSetColor, getFaceSets} from './mesh_facesets.js';

export function genRenderMesh(gl, mesh, uniforms, combinedWireframe = false) {
  let recalc;

  let times = [];
  let start = util.time_ms();

  function pushtime(tag) {
    let s = util.time_ms() - start;
    s = (s/1000.0).toFixed(3) + "s";
    s = tag + ":" + s;

    start = util.time_ms();
    times.push(s);
  }

  pushtime("start");

  if (mesh.recalc & RecalcFlags.ELEMENTS) {
    recalc = MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.FACE;
  } else {
    recalc = MeshTypes.FACE;
  }

  let lineuv1 = [0, 0];
  let lineuv2 = [1, 1];

  mesh.recalc &= ~RecalcFlags.ELEMENTS;

  //let selcolor = uniforms.select_color || Colors[1];
  let selcolor = Colors[1];
  let unselcolor = new Vector4(Colors[0]).mulScalar(0.5);

  function facecolor(c) {
    c = new Vector4(c);

    //desaturate a bit
    for (let i = 0; i < c.length; i++) {
      c[i] = Math.pow(c[i], 0.5);
    }

    return c;
  }

  let face_selcolor = facecolor(selcolor);
  let face_unselcolor = facecolor(unselcolor);

  let getmesh = (key) => {
    let layerflag = LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.ID;

    //LayerTypes.NORMAL | LayerTypes.UV | LayerTypes.ID | LayerTypes.COLOR;

    if (key === "faces") {
      layerflag |= LayerTypes.UV | LayerTypes.NORMAL;
    } else if (key === "edges") {
      layerflag |= LayerTypes.UV;
    }

    if (!(key in mesh._fancyMeshes)) {
      mesh._fancyMeshes[key] = new ChunkedSimpleMesh(layerflag);
    }

    let sm = mesh._fancyMeshes[key];

    return sm;
  }

  let trilen = mesh._ltris === undefined ? mesh.faces.length : mesh._ltris.length;
  let updatekey = "" + trilen + ":" + mesh.verts.length + ":" + mesh.edges.length;

  if (updatekey !== mesh._last_elem_update_key) {
    //console.log("full element draw regen", updatekey);

    recalc = MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.FACE;

    for (let v of mesh.verts) {
      v.flag |= MeshFlags.UPDATE;
    }
    for (let e of mesh.edges) {
      e.flag |= MeshFlags.UPDATE;
    }
    for (let f of mesh.faces) {
      f.flag |= MeshFlags.UPDATE;
    }

    mesh._last_elem_update_key = updatekey;
    for (let k in mesh._fancyMeshes) {
      mesh._fancyMeshes[k].destroy(gl);
    }

    mesh._fancyMeshes = {};
  }

  let cd_fset = getFaceSets(mesh, false);

  let ecolors = {};
  ecolors[0] = [0, 0, 0, 1];
  ecolors[MeshFlags.SELECT] = selcolor;
  ecolors[MeshFlags.SEAM] = [0, 1.0, 1.0, 1.0];

  let clr = new Vector4(selcolor).interp(ecolors[MeshFlags.SEAM], 0.5);
  ecolors[MeshFlags.SELECT | MeshFlags.SEAM] = clr;

  for (let k of Object.keys(ecolors)) {
    let clr = ecolors[k];
    k = parseInt(k);

    clr = new Vector4(clr);
    if (!k) {
      clr[2] = 0.5;
    } else {
      clr.mulScalar(0.75);
      clr[3] = 1.0;
    }

    ecolors[k | MeshFlags.DRAW_DEBUG] = clr;
    ecolors[k | MeshFlags.SINGULARITY] = clr;
  }

  for (let k of Object.keys(ecolors)) {
    let clr = ecolors[k];
    k = parseInt(k);

    clr = new Vector4(clr);
    if (!k) {
      clr[0] = 0.75;
    } else {
      clr[1] *= 0.5;
      clr[2] *= 0.5;
      clr[0] += (1.0 - clr[0])*0.5;
    }

    ecolors[k | MeshFlags.DRAW_DEBUG2] = clr;
    ecolors[k | MeshFlags.SINGULARITY] = clr;
  }

  pushtime("start2");

  let tempcolor = new Vector4();
  let tempcolor2 = new Vector4();
  let tempcolor3 = new Vector4();

  let axes = [-1];
  for (let i = 0; i < 3; i++) {
    if (mesh.symFlag & (1<<i)) {
      axes.push(i);
    }
  }

  let sm;
  let meshes = mesh._fancyMeshes;
  let white = [1, 1, 1, 1];
  let black = [0, 0, 0, 1];

  if (recalc & MeshTypes.VERTEX) {
    mesh.updateMirrorTags();

    let tot = 0;

    sm = getmesh("verts");
    sm.primflag = PrimitiveTypes.POINTS;

    for (let v of mesh.verts) {
      if ((v.flag & MeshFlags.HIDE) || !(v.flag & MeshFlags.UPDATE)) {
        continue;
      }

      let p = sm.point(v.eid, v.co);

      let colormask = v.flag & (MeshFlags.SELECT | MeshFlags.SINGULARITY | MeshFlags.DRAW_DEBUG | MeshFlags.DRAW_DEBUG2);
      let color = ecolors[colormask];

      for (let i = 0; i < v.edges.length; i++) {
        let e = v.edges[i];
        e.flag |= MeshFlags.UPDATE;
      }

      tot++;
      p.ids(v.eid);
      p.colors(color);
    }

    pushtime("vertex");

    sm = getmesh("handles");
    sm.primflag = PrimitiveTypes.POINTS;

    for (let h of mesh.handles) {
      if (!h.visible || !(h.flag & MeshFlags.UPDATE)) {
        continue;
      }
      let p = sm.point(h.eid, h.co);

      //let color = h.flag & MeshFlags.SELECT ? selcolor : black;
      let colormask = h.flag & (MeshFlags.SELECT | MeshFlags.SINGULARITY | MeshFlags.DRAW_DEBUG | MeshFlags.DRAW_DEBUG2);
      let color = ecolors[colormask];


      p.ids(h.eid);
      p.colors(color);
    }

    pushtime("handles");
  }

  if (recalc & MeshTypes.EDGE) {
    if (mesh.features & MeshFeatures.EDGE_CURVES_ONLY) {
      if (meshes.edges) {
        meshes.edges.destroy(gl);
      }

      //XXX
      let view3d = _appstate.ctx.view3d;

      for (let e of mesh.edges) {
        if (e.flag & MeshFlags.UPDATE) {
          e.updateLength();
        }
      }

      meshes.edges = mesh.genRender_curves(gl, false, view3d, LayerTypes.LOC | LayerTypes.UV | LayerTypes.ID | LayerTypes.COLOR);
      meshes.edges.primflag = PrimitiveTypes.LINES;

      pushtime("curves");
    } else {
      sm = getmesh("edges");
      sm.primflag = PrimitiveTypes.LINES

      let smoothline = mesh.edges.length < 100000;

      if (smoothline) {
        sm.primflag |= PrimitiveTypes.ADVANCED_LINES;
      }

      for (let e of mesh.edges) {
        let update = e.v1.flag & MeshFlags.UPDATE;
        update = update || (e.v2.flag & MeshFlags.UPDATE);
        update = update || (e.flag & MeshFlags.UPDATE);
        update = update && !(e.flag & MeshFlags.HIDE);

        if (!update) {
          continue;
        }

        e.updateLength();

        let l = e.l;
        if (l) {
          let _i = 0;

          do {
            l.f.flag |= MeshFlags.UPDATE;
            l = l.radial_next;
          } while (l !== e.l && _i++ < 10);
        }


        let line = smoothline ? sm.smoothline(e.eid, e.v1.co, e.v2.co) : sm.line(e.eid, e.v1.co, e.v2.co);

        let mask = e.flag & (MeshFlags.SELECT | MeshFlags.SEAM | MeshFlags.DRAW_DEBUG | MeshFlags.DRAW_DEBUG2);

        let color = ecolors[mask];

        line.colors(color, color);

        line.ids(e.eid, e.eid);
        line.uvs(lineuv1, lineuv2);
      }
    }

    pushtime("edges");
  }

  let cd_grid = GridBase.meshGridOffset(mesh);
  let have_grids = cd_grid >= 0;

  if (have_grids && (recalc & MeshTypes.FACE)) {
    sm = getmesh("faces");
    sm.primflag = PrimitiveTypes.TRIS;

    for (let l of mesh.loops) {
      let grid = l.customData[cd_grid];

      grid.makeDrawTris(mesh, sm, l, cd_grid);
    }

    pushtime("grids");
  } else if (!have_grids && (recalc & MeshTypes.FACE)) {
    let useLoopNormals = mesh.drawflag & MeshDrawFlags.USE_LOOP_NORMALS;
    useLoopNormals = useLoopNormals && mesh.loops.customData.hasLayer(NormalLayerElem);

    let cd_nor = useLoopNormals ? mesh.loops.customData.getLayerIndex(NormalLayerElem) : -1;

    let haveUVs = mesh.loops.customData.hasLayer(UVLayerElem);
    let cd_uvs = haveUVs ? mesh.loops.customData.getLayerIndex(UVLayerElem) : -1;

    let cd_color = mesh.verts.customData.getLayerIndex("color");
    let haveColors = cd_color >= 0;

    sm = getmesh("faces");
    sm.primflag = PrimitiveTypes.TRIS;

    let ltris = mesh._ltris;
    ltris = ltris === undefined ? [] : ltris;

    let p1 = new Vector3();
    let p2 = new Vector3();
    let p3 = new Vector3();

    for (let i = 0; i < ltris.length; i += 3) {
      let v1 = ltris[i].v;
      let v2 = ltris[i + 1].v;
      let v3 = ltris[i + 2].v;
      let f = ltris[i].f;

      if ((f.flag & MeshFlags.HIDE) || !(f.flag & MeshFlags.UPDATE)) {
        continue;
      }

      for (let axis of axes) {
        let tri;

        if (axis === -1) {
          tri = sm.tri(i, v1.co, v2.co, v3.co);
        } else {
          p1.load(v1);
          p2.load(v2);
          p3.load(v3);

          p1[axis] = -p1[axis];
          p2[axis] = -p2[axis];
          p3[axis] = -p3[axis];

          tri = sm.tri(ltris.length + i*3 + axis, p1, p2, p3);
        }
        tri.ids(f.eid, f.eid, f.eid);

        if (f.flag & MeshFlags.SELECT) {
          tempcolor.load(face_selcolor);
        } else {
          tempcolor.load(face_unselcolor);
        }

        if (cd_fset >= 0) {
          let fset = Math.abs(ltris[i].f.customData[cd_fset].value);

          let color = getFaceSetColor(fset);
          tempcolor.interp(color, 0.5);
        }

        if (cd_color >= 0) {
          let c1 = v1.customData[cd_color].color;
          let c2 = v2.customData[cd_color].color;
          let c3 = v3.customData[cd_color].color;

          tempcolor2.load(c2).mul(tempcolor);
          tempcolor3.load(c3).mul(tempcolor);
          tempcolor.mul(c1);

          tri.colors(tempcolor, tempcolor2, tempcolor3);
        } else {

          tri.colors(tempcolor, tempcolor, tempcolor);
        }

        if (useLoopNormals) {
          tri.normals(ltris[i].customData[cd_nor].no, ltris[i + 1].customData[cd_nor].no, ltris[i + 2].customData[cd_nor].no);
        } else if (f.flag & MeshFlags.SMOOTH_DRAW) {
          tri.normals(ltris[i].v.no, ltris[i + 1].v.no, ltris[i + 2].v.no);
        } else {
          tri.normals(f.no, f.no, f.no);
        }

        if (haveUVs) {
          tri.uvs(ltris[i].customData[cd_uvs].uv, ltris[i + 1].customData[cd_uvs].uv, ltris[i + 2].customData[cd_uvs].uv);
        }
      }
    }

    if (combinedWireframe) { //simplemesh_shapes.js uses this code path
      for (let e of mesh.edges) {
        if (e.flag & MeshFlags.HIDE) {
          continue;
        }

        let line = sm.line(e.eid, e.v1.co, e.v2.co);

        //line.ids(e.eid+1, e.eid+1);
        line.colors(white, white);

        if (haveUVs) {
          line.uvs(lineuv1, lineuv2);
        }

        line.normals(e.v1.no, e.v2.no);
      }
    }
    pushtime("faces");
  }

  for (let k in mesh._fancyMeshes) {
    let sm = mesh._fancyMeshes[k];
  }

  mesh.clearUpdateFlags(recalc);
  pushtime("final");

  /*
  let buf = 'genRenderMesh times:\n';
  for (let time of times) {
    buf += '  ' + time + '\n';
  }

  console.log(buf);
   */
}

export function drawMeshElements(mesh, view3d, gl, selmask, uniforms, program, object, drawTransFaces = false) {

  uniforms = uniforms !== undefined ? Object.assign({}, uniforms) : {};

  if (!uniforms.active_color) {
    uniforms.active_color = [1.0, 0.8, 0.2, 1.0];
  }
  if (!uniforms.highlight_color) {
    uniforms.highlight_color = [1.0, 0.5, 0.25, 1.0];
  }
  if (!uniforms.select_color) {
    uniforms.select_color = [1.0, 0.7, 0.5, 1.0];
  }

  if (mesh.recalc & RecalcFlags.TESSELATE) {
    mesh.tessellate();
  }

  if (mesh.recalc & RecalcFlags.ELEMENTS) {
    //console.log("_genRenderElements");
    mesh._genRenderElements(gl, uniforms);
  }

  uniforms.alpha = uniforms.alpha === undefined ? 1.0 : uniforms.alpha;

  let meshes = mesh._fancyMeshes;

  uniforms.pointSize = uniforms.pointSize === undefined ? 10 : uniforms.pointSize;
  uniforms.polygonOffset = uniforms.polygonOffset === undefined ? 0.5 : uniforms.polygonOffset;

  let draw_list = (list, key) => {
    uniforms.active_id = list.active !== undefined ? list.active.eid : -1;
    uniforms.highlight_id = list.highlight !== undefined ? list.highlight.eid : -1;

    if (!meshes[key]) {
      console.warn("missing mesh element draw data", key);
      mesh.regenElementsDraw();
      return;
    }

    meshes[key].draw(gl, uniforms, program);
  }

  if (selmask & SelMask.FACE) {
    let alpha = uniforms.alpha;

    if (drawTransFaces) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      uniforms.alpha = 0.25;

      //gl.depthMask(false);
      //gl.disable(gl.DEPTH_TEST);
    }

    if (selmask & SelMask.EDGE) {
      uniforms.polygonOffset *= 0.5;
      let alpha = uniforms.alpha;
      uniforms.alpha = 1.0;

      draw_list(mesh.edges, "edges");
      uniforms.alpha = alpha;
    }

    uniforms.polygonOffset *= 0.25;
    draw_list(mesh.faces, "faces");

    if (drawTransFaces) {
      /*
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(true);

      gl.enable(gl.BLEND);
      draw_list(mesh.faces, "faces");

      gl.disable(gl.BLEND);
      gl.enable(gl.DEPTH_TEST);
       */
      gl.disable(gl.BLEND);
    }
  } else if (selmask & SelMask.EDGE) {
    draw_list(mesh.edges, "edges");
  }

  if (selmask & SelMask.VERTEX) {
    draw_list(mesh.verts, "verts");
  }
  if (selmask & SelMask.HANDLE) {
    draw_list(mesh.handles, "handles");
  }
}

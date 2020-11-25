import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as math from '../util/math.js';
import * as util from '../util/util.js';

import {MeshDrawFlags, MeshFeatures, MeshFlags, MeshTypes, RecalcFlags} from "./mesh_base.js";
import {CustomDataElem} from "./customdata.js";
import {nstructjs} from '../path.ux/scripts/pathux.js';
import {Colors} from "../sceneobject/sceneobject.js";
import {ChunkedSimpleMesh, LayerTypes, PrimitiveTypes} from "../core/simplemesh.js";
import {NormalLayerElem, UVLayerElem} from "./mesh_customdata.js";
import {SelMask} from "../editors/view3d/selectmode.js";
import {Grid} from "./mesh_grids.js";

export function genRenderMesh(gl, mesh, uniforms) {
  let recalc;

  if (mesh.recalc & RecalcFlags.ELEMENTS) {
    recalc = MeshTypes.VERTEX | MeshTypes.EDGE | MeshTypes.FACE;
  } else {
    recalc = MeshTypes.FACE;
  }

  mesh.recalc &= ~RecalcFlags.ELEMENTS;

  let selcolor = uniforms.select_color || Colors[1];
  let unselcolor = [0.5, 0.5, 1.0, 1.0];

  let getmesh = (key) => {
    if (!(key in mesh._fancyMeshes)) {
      mesh._fancyMeshes[key] = new ChunkedSimpleMesh(LayerTypes.LOC | LayerTypes.NORMAL | LayerTypes.UV | LayerTypes.ID | LayerTypes.COLOR);
    }

    return mesh._fancyMeshes[key];
  }

  let trilen = mesh._ltris === undefined ? 0 : mesh._ltris.length;
  let updatekey = "" + trilen + ":" + mesh.verts.length + ":" + mesh.edges.length;

  if (updatekey !== mesh._last_elem_update_key) {
    console.log("full element draw regen", updatekey);

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

  let axes = [-1];
  for (let i=0; i<3; i++) {
    if (mesh.symFlag & (1<<i)) {
      axes.push(i);
    }
  }

  let sm;
  let meshes = mesh._fancyMeshes;

  if (recalc & MeshTypes.VERTEX) {
    mesh.updateMirrorTags();

    let tot = 0;
    sm = getmesh("verts");
    sm.primflag = PrimitiveTypes.POINTS;

    for (let v of mesh.verts) {
      if ((v.flag & MeshFlags.HIDE) || !(v.flag & MeshFlags.UPDATE)) {
        continue;
      }

      let p = sm.point(v.eid, v);

      let color = v.flag & MeshFlags.SELECT ? selcolor : v.color;

      for (let i = 0; i < v.edges.length; i++) {
        let e = v.edges[i];
        e.flag |= MeshFlags.UPDATE;
      }

      tot++;
      p.ids(v.eid);
      p.colors(color);
    }

    console.log("  ", tot, "vertices updated");

    sm = getmesh("handles");
    sm.primflag = PrimitiveTypes.POINTS;
    for (let h of mesh.handles) {
      if (!h.visible || !(h.flag & MeshFlags.UPDATE)) {
        continue;
      }
      let p = sm.point(h.eid, h);

      let color = h.flag & MeshFlags.SELECT ? selcolor : h.color;

      p.ids(h.eid);
      p.colors(color);
    }
  }

  if (recalc & MeshTypes.EDGE) {
    if (mesh.features & MeshFeatures.EDGE_CURVES_ONLY) {
      if (meshes.edges) {
        meshes.edges.destroy(gl);
      }

      //XXX
      let view3d = _appstate.ctx.view3d;

      meshes.edges = mesh.genRender_curves(gl, false, view3d, LayerTypes.LOC | LayerTypes.UV | LayerTypes.ID | LayerTypes.COLOR);
      meshes.edges.primflag = PrimitiveTypes.LINES;
    } else {
      sm = getmesh("edges");
      sm.primflag = PrimitiveTypes.LINES;

      for (let e of mesh.edges) {
        let update = e.v1.flag & MeshFlags.UPDATE;
        update = update || (e.v2.flag & MeshFlags.UPDATE);
        update = update || (e.flag & MeshFlags.UPDATE);
        update = update && !(e.flag & MeshFlags.HIDE);

        if (!update) {
          continue;
        }

        let l = e.l;
        if (l) {
          let _i = 0;

          do {
            l.f.flag |= MeshFlags.UPDATE;
            l = l.radial_next;
          } while (l !== e.l && _i++ < 10);
        }

        let line = sm.line(e.eid, e.v1, e.v2);

        if (e.flag & MeshFlags.SELECT) {
          line.colors(selcolor, selcolor);
        } else {
          line.colors(e.v1.color, e.v2.color);
        }

        line.ids(e.eid, e.eid);
        line.uvs([0, 0], [1, 1])
      }
    }
  }

  let have_grids = mesh.loops.customData.hasLayer("grid");
  let cd_grid = mesh.loops.customData.getLayerIndex("grid");

  if (have_grids && (recalc & MeshTypes.FACE)) {
    sm = getmesh("faces");
    sm.primflag = PrimitiveTypes.TRIS;

    for (let l of mesh.loops) {
      let grid = l.customData[cd_grid];

      grid.makeDrawTris(mesh, sm, l, cd_grid);
    }
  } else if (!have_grids && (recalc & MeshTypes.FACE)) {
    let useLoopNormals = mesh.drawflag & MeshDrawFlags.USE_LOOP_NORMALS;
    useLoopNormals = useLoopNormals && mesh.loops.customData.hasLayer(NormalLayerElem);

    let cd_nor = useLoopNormals ? mesh.loops.customData.getLayerIndex(NormalLayerElem) : -1;

    let haveUVs = mesh.loops.customData.hasLayer(UVLayerElem);
    let cd_uvs = haveUVs ? mesh.loops.customData.getLayerIndex(UVLayerElem) : -1;

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
          tri = sm.tri(i, v1, v2, v3);
        } else {
          p1.load(v1);
          p2.load(v2);
          p3.load(v3);

          p1[axis] = -p1[axis];
          p2[axis] = -p2[axis];
          p3[axis] = -p3[axis];

          tri = sm.tri(ltris.length + i*3+axis, p1, p2, p3);
        }
        tri.ids(f.eid, f.eid, f.eid);

        if (f.flag & MeshFlags.SELECT) {
          tri.colors(selcolor, selcolor, selcolor);
        } else {
          tri.colors(unselcolor, unselcolor, unselcolor);
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
  }

  mesh.clearUpdateFlags(recalc);
}

export function drawMeshElements(mesh, view3d, gl, selmask, uniforms, program, object, drawTransFaces = false) {
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

  uniforms = uniforms !== undefined ? Object.assign({}, uniforms) : {};
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
      draw_list(mesh.edges, "edges");
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
  }

  if (selmask & SelMask.VERTEX) {
    draw_list(mesh.verts, "verts");
  }
  if (selmask & SelMask.HANDLE) {
    draw_list(mesh.handles, "handles");
  }
}

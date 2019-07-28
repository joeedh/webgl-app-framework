import * as util from '../../util/util.js';
import {Vector3} from '../../util/vectormath.js';
import {Mesh, MeshFlags, MeshTypes} from "../../mesh/mesh.js";
import {LayerTypes} from "../../core/simplemesh.js";
import {SelMask} from "./selectmode.js";
import {Shaders} from "./view3d_shaders.js";

export const Colors = {
  DRAW_DEBUG : [0, 1.0, 0.5, 1.0],
  SELECT     : [1.0, 0.8, 0.4, 1.0],
  UNSELECT   : [1.0, 0.2, 0.0, 1.0],
  ACTIVE     : [0.3, 1.0, 0.3, 1.0],
  LAST       : [0.0, 0.3, 1.0, 1.0],
  HIGHLIGHT  : [1.0, 1.0, 0.3, 1.0],
  POINTSIZE  : 7,
  POLYGON_OFFSET : 1.0,
  FACE_UNSEL : [0.75, 0.75, 0.75, 0.3]
};
window._Colors = Colors; //debugging global

export function elemColor(e) {
  if (e.flag & MeshFlags.DRAW_DEBUG) {
    return Colors.DRAW_DEBUG;
  } else if (e.flag & MeshFlags.SELECT) {
    return Colors.SELECT;
  } else {
    return Colors.UNSELECT;
  }
}

export class OrigRef {
  constructor(element, ref) {
    this.ref = ref; //eid
    this.e = element;
    this.co = new Vector3();
  }
}

export class LoopTriRet {
  constructor() {
    this.ref = undefined; //eid
    this.ls = [0, 0, 0];
    this.i = 0;
  }
}

//let origrets
export class MeshDrawInterface {
  constructor(mesh, meshcache) {
  }

  destroy(gl) {

  }

  origVerts(mesh) {

  }

  origEdges(mesh) {

  }

  origFaceCenters(mesh) {

  }

  origFaces(mesh) {

  }

  sync(view3d, gl, object) {
  }

  draw(view3d, gl, object, uniforms, program) {

  }

  drawIDs(view3d, gl, object, uniforms, program) {

  }
}

let orig_rets = util.cachering.fromConstructor(OrigRef, 128);
let ltri_rets = util.cachering.fromConstructor(LoopTriRet, 128);

export class BasicMeshDrawer extends MeshDrawInterface {
  constructor(mesh, meshcache) {
    super();

    this._regen = true;
    this.mc = meshcache;
  }

  destroy(gl) {

  }

  origVerts(mesh) {
    return (function*() {
      for (let v of mesh.verts) {
        let ret = orig_rets.next();

        ret.ref = v.eid;
        ret.e = v;

        yield ret;
      }
    });
  }

  origEdges(mesh) {
    return (function*() {
      for (let e of mesh.edges) {
        let ret = orig_rets.next();

        ret.ref = e.eid;
        ret.e = e;

        yield ret;
      }
    });
  }

  origFaceCenters(mesh) {
    return (function*() {
      for (let f of mesh.faces) {
        let ret = orig_rets.next();

        ret.ref = f.eid;
        ret.e = f;
        ret.co.load(f.cent);

        yield ret;
      }
    });
  }

  origFaces(mesh) {
    return (function*() {
      for (let f of mesh.faces) {
        let ret = orig_rets.next();

        ret.ref = f.eid;
        ret.e = f;

        yield ret;
      }
    });
  }

  loopTris(mesh) {
    let ltris = mesh.loopTris;

    for (let i=0; i<ltris.length; i += 3) {
      let ret = ltri_rets.next();

      ret.ls[0] = ltris[i];
      ret.ls[1] = ltris[i+1];
      ret.ls[2] = ltris[i+2];

      ret.ref = ret.ls[0].f.eid;
      ret.i = i;
    }
  }

  _generate(view3d, gl, object) {
    let mesh = object.data;
    let mc = this.mc;
    let layerTypes = LayerTypes.LOC|LayerTypes.COLOR|LayerTypes.ID;

    let vm = mc.makeChunkedMesh("verts", layerTypes);

    for (let v of mesh.verts) {
      if (v.flag & MeshFlags.HIDE)
        continue;

      let p = vm.point(v.eid, v);

      p.ids(v.eid);
      p.colors(elemColor(v));
    }

    let em = mc.makeChunkedMesh("edges", layerTypes);
    for (let e of mesh.edges) {
      if (e.flag & MeshFlags.HIDE)
        continue;

      let l = em.line(e.eid, e.v1, e.v2);

      let c = elemColor(e);

      l.ids(e.eid, e.eid);
      l.colors(c, c);
    }

    let fm = mc.makeChunkedMesh("faces", layerTypes);

    let ltris = mesh.loopTris;

    for (let i=0; i<ltris.length; i += 3) {
      let l1 = ltris[i], l2 = ltris[i+1], l3 = ltris[i+2];
      let f = l1.f;

      if (f.flag & MeshFlags.HIDE) {
        continue;
      }

      let c = elemColor(f);
      if (!(f.flag & MeshFlags.SELECT)) {
        c = Colors.FACE_UNSEL;
      }

      let tri = fm.tri(i, l1.v, l2.v, l3.v);

      tri.colors(c, c, c);
      tri.ids(f.eid, f.eid, f.eid);
    }
  }

  sync(view3d, gl, object) {
    if (this._regen) {
      this._regen = false;
      this._generate(view3d, gl, object);

      return;
    }

    let mc = this.mc;
    let mesh = object.data;

    let fm = mc.getMesh("faces");
    let ulist = mesh.lastUpdateList;
    let eidmap = mesh.eidmap;
    let ltris = mesh._ltris;
    mc.partialGen = mesh.partialUpdateGen;

    for (let eid in ulist) {
      let f = eidmap[eid];
      if (f === undefined || f.type != MeshTypes.FACE || (f.flag & MeshFlags.HIDE)) {
        continue;
      }

      let li = mesh._ltrimap_start[f.eid];
      let len = mesh._ltrimap_len[f.eid];

      let c = elemColor(f);
      if (!(f.flag & MeshFlags.SELECT)) {
        c = Colors.FACE_UNSEL;
      }

      for (let i=0; i<len; i++) {
        let idx = li;

        let l1 = ltris[li++];
        let l2 = ltris[li++];
        let l3 = ltris[li++];

        let tri = fm.tri(idx, l1.v, l2.v, l3.v);

        tri.colors(c, c, c);
        tri.ids(f.eid, f.eid, f.eid);
      }
    }

    let em = mc.getMesh("edges");
    for (let eid in ulist) {
      let e = eidmap[eid];

      if (e === undefined || e.type != MeshTypes.EDGE || (e.flag & MeshFlags.HIDE)) {
        continue;
      }

      let l = em.line(e.eid, e.v1, e.v2);

      let c = elemColor(e);

      l.ids(e.eid, e.eid);
      l.colors(c, c);
    }

    let vm = mc.getMesh("verts");
    for (let eid in ulist) {
      let v = eidmap[eid];

      if (v === undefined || v.type != MeshTypes.VERTEX || (v.flag & MeshFlags.HIDE)) {
        continue;
      }

      if (v.flag & MeshFlags.HIDE)
        continue;

      let p = vm.point(v.eid, v);

      p.ids(v.eid);
      p.colors(elemColor(v));
    }
  }

  draw(view3d, gl, object, uniforms, program) {
    if (this._regen) {
      this._regen = false;
      this._generate(view3d, gl, object);
    }

    let mc = this.mc;

    let mesh = object.data;

    let selmode = view3d.selectmode;
    let program2 = Shaders.MeshEditShader;

    mesh.draw(gl, uniforms, program);

    function drawElements(list, smesh, alpha=1.0) {
      program2.uniforms.active_id = list.active !== undefined ? list.active.eid : -1;
      program2.uniforms.highlight_id = list.highlight !== undefined ? list.highlight.eid : -1;
      program2.uniforms.last_id = list.last !== undefined ? list.last.eid : -1;
      program2.uniforms.projectionMatrix = view3d.camera.rendermat;

      program2.uniforms.polygonOffset = Colors.POLYGON_OFFSET;
      uniforms.polygonOffset = Colors.POLYGON_OFFSET;
      program2.uniforms.active_color = Colors.ACTIVE;
      program2.uniforms.highlight_color = Colors.HIGHLIGHT;
      program2.uniforms.last_color = Colors.LAST;
      program2.uniforms.alpha = alpha;
      program2.uniforms.pointSize = Colors.POINTSIZE;

      smesh.draw(gl, uniforms, program2);
    }

    if (selmode & SelMask.VERTEX) {
      drawElements(mesh.verts, mc.meshes["verts"]);
    }

    drawElements(mesh.edges, mc.meshes["edges"]);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    //gl.depthMask(0);
    //drawElements(mesh.faces, mc.meshes["faces"], 0.1);
    //gl.depthMask(1);
    drawElements(mesh.faces, mc.meshes["faces"], 0.1);
    gl.disable(gl.BLEND);
    //console.log(mc.meshes["faces"]);
  }

  drawIDs(view3d, gl, object, uniforms) {
    if (this._regen) {
      this._regen = false;
      this._generate(view3d, gl, object);
    }

    if (object.data === undefined || !(object.data instanceof Mesh))
      return false;

    let mesh = object.data;
    let mc = this.mc;

    let program2 = Shaders.MeshIDShader;
    program2.bind(gl);

    let drawElements = (list, smesh) => {
      program2.uniforms.object_id = object.lib_id;
      program2.uniforms.projectionMatrix = view3d.camera.rendermat;
      program2.uniforms.objectMatrix = object.outputs.matrix.getValue();
      program2.uniforms.pointSize = Colors.POINTSIZE;

      gl.disable(gl.BLEND);
      gl.disable(gl.DITHER);
      smesh.draw(gl, uniforms, program2);
      gl.enable(gl.DITHER);
    }

    //console.log("drawing ids");

    gl.disable(gl.DITHER);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);

    gl.clearDepth(100000.0);
    gl.clearColor(0.0, 0.0, 0.0, 0.0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    program2.uniforms.polygonOffset = 0.0;
    drawElements(mesh.faces, mc.meshes["faces"]);

    program2.uniforms.polygonOffset = Colors.POLYGON_OFFSET;
    drawElements(mesh.verts, mc.meshes["verts"]);
    drawElements(mesh.edges, mc.meshes["edges"]);

    gl.finish();

    return false;
  }
}

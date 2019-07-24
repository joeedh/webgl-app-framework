import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import * as util from '../util/util.js';
import {MeshTypes, MeshFlags} from '../mesh/mesh.js';

export function subdivide(mesh, faces=mesh.faces) {
  let fset = new util.set();
  let eset = new util.set();
  let vset = new util.set();
  let splitvs = new util.set();

  console.log(faces);
  for (let f of faces) {
    console.log("f", f.eid);
  }

  for (let f of faces) {
    fset.add(f);
    f.calcCent();

    for (let list of f.lists) {
      for (let l of list) {
        vset.add(l.v);
        eset.add(l.e);
      }
    }
  }

  let vcos = new Array(vset.length);

  let vset2 = new util.set();
  for (let v of vset) {
    vset2.add(v);
    for (let f of v.faces) {
      for (let list of f.lists) {
        for (let l of list) {
          vset2.add(l.v);
        }
      }
    }
  }

  let i = 0;
  for (let v of vset2) {
    v.index = i;
    vcos[i] = new Vector3(v);
    i++;
  }

  for (let v of vset) {
    let val = v.edges.length;

    let wa = 3.0/(2*val);
    let wb = 1.0/(4*val);
    let wv = 1.0 - wa - wb;

    wa /= val;
    wb /= val;

    let tot = wv;
    v.load(vcos[v.index]);
    v.mulScalar(wv);

    for (let e of v.edges) {
      let v2 = e.otherVertex(v);

      v.addFac(vcos[v2.index], wa);
      tot += wa;

      let l = e.l;

      do {
        let v3;
        if (l.v === v) {
          v3 = l.next.v;
        } else {
          v3 = l.v;
        }

        v.addFac(vcos[v2.index], wb);
        tot += wb;

        l = l.radial_next;
      } while (l !== e.l)
    }

    v.mulScalar(1.0 / tot);
  }

  for (let e of eset) {
    console.log("subdividing edge", e.eid);
    let ret = mesh.splitEdge(e, 0.5);

    let ne = ret[0], nv = ret[1];

    mesh.verts.setSelect(nv, true);
    mesh.edges.setSelect(ne, true);

    splitvs.add(nv);
  }

  for (let f of fset) {
    let centv = mesh.makeVertex(f.cent);

    mesh.verts.setSelect(centv, true);

    let l = f.lists[0].l;
    let _i = 0;
    do {
      let v1 = l.v;
      let v2 = l.next.v;
      let v3 = centv;
      let v4 = l.prev.v;

      let f2 = mesh.makeQuad(v1, v2, v3, v4);

      mesh.faces.setSelect(f2, true);

      for (let l of f2.lists[0]) {
        mesh.edges.setSelect(l.e, true);
      }

      if (_i++ > 10000) {
        console.warn("infinite loop in subdiivde");
        break;
      }

      l = l.next.next;
    } while (l !== f.lists[0].l);

    mesh.killFace(f);
  }

  mesh.validateMesh();

  return mesh;
}


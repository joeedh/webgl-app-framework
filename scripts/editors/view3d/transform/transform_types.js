import {Vector3, Vector2, Vector4, Matrix4, Quat} from '../../../util/vectormath.js';
import {ToolOp, UndoFlags} from '../../../path.ux/scripts/pathux.js';
import {keymap} from '../../../path.ux/scripts/util/simple_events.js';
import {MeshFlags, MeshTypes, Mesh} from '../../../mesh/mesh.js';
import {SelMask} from '../selectmode.js';
import {SceneObject, ObjectFlags} from "../../../sceneobject/sceneobject.js";
import {PropModes, TransDataType, TransDataElem, TransDataList} from './transform_base.js';
import * as util from '../../../util/util.js';
import {aabb_union} from '../../../util/math.js';
import {SpatialHash} from '../../../util/spatialhash.js';

import {ConstraintSpaces} from "./transform_base.js";
let meshGetCenterTemps = util.cachering.fromConstructor(Vector3, 64);
let meshGetCenterTemps2 = util.cachering.fromConstructor(Vector3, 64);
let meshGetCenterTempsMats = util.cachering.fromConstructor(Matrix4, 16);

let meshapplytemp = new Vector3();

export class MeshTransType extends TransDataType {
  static transformDefine() {return {
    name   : "mesh",
    uiname : "Mesh",
    flag   : 0,
    icon   : -1
  }}

  /**FIXME this only handles the active mesh object, it should
    iterate over ctx.selectedMeshObjets*/
  static genData(ctx, selectmode, propmode, propradius) {
    let mesh = ctx.mesh;
    let tdata = new TransDataList(this);

    if (!mesh || !(selectmode & SelMask.GEOM)) {
      return undefined;
    }

    let faces = tdata.faces = new Set();
    let normalvs = tdata.normalvs = new Set();

    let propconnected = true;

    if (propmode !== undefined && !propconnected) {
      let i = 0;
      let unset_w = 100000.0;

      let visit = new WeakSet();
      let vs = new Set(mesh.verts.selected.editable);
      let boundary = new Set();

      for (let v of vs) {
        v.index = i;

        let td = new TransDataElem();

        td.mesh = mesh;
        td.data1 = v;
        td.w = 0.0;
        td.data2 = new Vector3(v);
        td.symFlag = mesh.symFlag;

        tdata.push(td);

        for (let e of v.edges) {
          let v2 = e.otherVertex(v);
          let ok = !(v2.flag & MeshFlags.HIDE);
          ok = ok && !(v2.flag & MeshFlags.SELECT);

          if (ok) {
            boundary.add(v);
            break;
          }
        }

        td.w = v.flag & MeshFlags.SELECT ? 0.0 : unset_w;
        i++;
      }

      //let shash = SpatialHash.fromMesh(mesh, mesh.verts.editable);
      //console.log("shash:", shash);

      let bvh = mesh.getBVH();
      bvh.update();

      let tvs = new Map();
      for (let v of boundary) {
        for (let v2 of bvh.closestVerts(v, propradius*1.1)) {
        //for (let v2 of shash.closestVerts(v, propradius)) {
        //  v2 = mesh.eidMap.get(v2);

          if (boundary.has(v2) || v === v2) {
            continue;
          }

          let w = tvs.get(v2);
          if (w === undefined) {
            tvs.set(v2, v.vectorDistanceSqr(v2));
          } else {
            w = Math.min(w, v.vectorDistanceSqr(v2));
            tvs.set(v2, w);
          }
        }
      }

      for (let [v, dis] of tvs) {
        let td = new TransDataElem();

        td.mesh = mesh;
        td.data1 = v;
        td.w = Math.sqrt(dis);
        td.data2 = new Vector3(v);
        td.symFlag = mesh.symFlag;

        tdata.push(td);
      }

      console.log(tvs);

      for (let td of tdata) {
        td.w = TransDataType.calcPropCurve(td.w, propmode, propradius);
      }
    } else if (propmode !== undefined) {
      let i = 0;
      let unset_w = 100000.0;

      let visit = new WeakSet();
      let vs = new Set(mesh.verts.selected.editable);
      let boundary = new Set();

      for (let v of vs) {
        v.index = i;

        let td = new TransDataElem();

        td.mesh = mesh;
        td.data1 = v;
        td.w = 0.0;
        td.data2 = new Vector3(v.co);
        td.symFlag = mesh.symFlag;

        tdata.push(td);

        for (let e of v.edges) {
          let v2 = e.otherVertex(v);
          let ok = !(v2.flag & MeshFlags.HIDE);
          ok = ok && !(v2.flag & MeshFlags.SELECT);

          if (ok) {
            boundary.add(v);
            break;
          }
        }

        td.w = v.flag & MeshFlags.SELECT ? 0.0 : unset_w;
        i++;
      }

      let limit = 2;

      let doneset = new WeakSet();
      let stack = [];

      stack.cur = 0;
      stack.end = 0;

      for (let vboundary of vs) {
        stack.push(vboundary);
        stack.push(vboundary);
        stack.push(0);
      }
      stack.end = stack.length;

      stack.length *= 8;

      let _i = 0;

      let vi = 0;
      let wmap = new Array(mesh.verts.length);
      let totmap = new Array(mesh.verts.length);
      let vmap = new Array(mesh.verts.length);

      let finalvs = new Set();

      for (let v of mesh.verts) {
        wmap[vi] = -1;
        totmap[vi] = 0;
        v.index = vi++;
      }

      for (let v of vs) {
        wmap[v.index] = 0.0;
      }

      let radius = propradius*1.01;

      while (stack.length > 0 && Math.abs(stack.cur - stack.end) !== 0) {
        let v = stack[stack.cur++];
        let vboundary = stack[stack.cur++];
        let waccum = stack[stack.cur++];

        let w = v.co.vectorDistance(vboundary.co);

        //if (_i++ > 1000000) {
        //  console.warn("infinite loop detected");
        // break;
        //}

        stack.cur = stack.cur%stack.length;

        let td = new TransDataElem();

        td.data1 = v;
        td.data2 = new Vector3(v.co);
        td.mesh = mesh;
        td.w = w;
        td.symFlag = mesh.symFlag;

        tdata.push(td);
        for (let e of v.edges) {
          let v2 = e.otherVertex(v);


          if (v === v2 || (v2.flag & (MeshFlags.SELECT | MeshFlags.HIDE))) {
            continue;
          }

          let dis = v2.co.vectorDistance(v.co);
          let dx = v2.co[0] - v.co[0];
          let dy = v2.co[1] - v.co[1];
          let dz = v2.co[2] - v.co[2];


          //hackish, try to cull unrelated geometry with geometric distance
          if (w + dis > propradius) {
            continue;
          }

          let w2 = w + dis;
          let w3 = !doneset.has(v2) ? w2 : wmap[v2.index];

          wmap[v2.index] = Math.min(w2, w3);

          if (doneset.has(v2)) {
            continue;
          }

          doneset.add(v2);

          let end = (stack.end + 3)%stack.length;

          if (end === stack.cur) {
            console.warn("Reallocating stack", stack.length, stack.cur, stack.end);
            let len = stack.length*3;

            let stack2 = new Array(len);
            for (let i = 0; i < stack.length; i++) {
              let i2 = (i + stack.cur)%stack.length;
              stack2[i] = stack[i2];
            }

            stack2.cur = 0;
            stack2.end = stack.length - 3;
            stack = stack2;
          }

          stack[stack.end++] = v2;
          stack[stack.end++] = vboundary;
          stack[stack.end++] = waccum + dis;
          stack.end = (stack.end)%stack.length;
        }

      }

      for (let v of vs) {
        //wmap[v.index] = 0;
      }

      for (let td of tdata) {
        td.w = wmap[td.data1.index];

        let tot = totmap[td.data1.index];
        tot = !tot ? 1.0 : tot;

        td.w /= tot;
        td.w = TransDataType.calcPropCurve(td.w, propmode, propradius);
      }

//      tdata[v.index].w = TransDataType.calcPropCurve(tdata[v.index].w, propmode, propradius);
    } else {
      for (let v of mesh.verts.selected.editable) {
        let td = new TransDataElem();
        td.data1 = v;
        td.data2 = new Vector3(v.co);
        td.mesh = mesh;
        td.w = 1.0;
        td.symFlag = mesh.symFlag;

        tdata.push(td);
      }
    }

    for (let td of tdata) {
      let v = td.data1;

      normalvs.add(v);

      for (let f of v.faces) {
        faces.add(f);
      }
    }

    for (let f of faces) {
      for (let l of f.loops) {
        normalvs.add(l.v);

        /*
        if (l === l.radial_next) {
          continue;
        }

        for (let v of l.radial_next.f.verts) {
          normalvs.add(v);
        }//*/
      }
    }
    return tdata;
  }

  static applyTransform(ctx, elem, do_prop, matrix, toolop) {
    let td = elem;

    td.mesh.regenBVH();
    td.mesh.graphUpdate();

    let v = td.data1;
    v.flag |= MeshFlags.UPDATE;
    /*

    for (let e of v.edges) {
      e.flag |= MeshFlags.UPDATE;

      if (e.l) {
        let l = e.l;
        let _i = 0;

        do {
          l.f.flag |= MeshFlags.UPDATE;
          l = l.radial_next;
        } while (l !== e.l && _i++ < 100);
      }
    }*/

    let co = meshapplytemp;

    co.load(td.data2).multVecMatrix(matrix);
    v.co.load(td.data2).interp(co, td.w);

    if (v.flag & MeshFlags.MIRRORED) {
      for (let i=0; i<3; i++) {
        if (td.symFlag & (1<<i)) {
          v.co[i] = 0.0;
        }
      }
    }
  }

  static calcUndoMem(ctx, undodata) {
    let ud = undodata;

    function count(obj) {
      let c = 0;

      for (let k in obj) {
        c++;
      }

      return c*3*8;
    }

    return count(ud.cos) + count(ud.nos) + count(ud.fnos) + count(ud.fcos);
  }

  static getOriginMatrix(ctx, list, selmask, spacemode, space_matrix_out) {
    if (!(selmask & SelMask.GEOM)) {
      return undefined;
    }

    let cent = this.getCenter(ctx, list, selmask, spacemode, space_matrix_out);

    if (cent) {
      let mat = new Matrix4();

      return mat;
    }
  }

  static undoPre(ctx, elemlist) {
    let cos = {};
    let nos = {};
    let fnos = {};
    let fcos = {};

    for (let td of elemlist) {
      let v = td.data1;

      for (let f of v.faces) {
        if (f.eid in fnos)
          continue;

        fnos[f.eid] = new Vector3(f.no);
        fcos[f.eid] = new Vector3(f.cent);
      }

      cos[v.eid] = new Vector3(v.co);
      nos[v.eid] = new Vector3(v.no);
    }

    return {
      cos: cos,
      nos: nos,
      fnos: fnos,
      fcos: fcos
    };
  }

  static undo(ctx, undodata) {
    let cos = undodata.cos;
    let nos = undodata.nos;
    let fcos = undodata.fcos;
    let fnos = undodata.fnos;
    let mesh = ctx.mesh;

    for (let k in cos) {
      let v = mesh.eidMap.get(k);

      if (v === undefined) {
        console.warn("Mesh integrity error in Transform undo");
        continue;
      }

      v.co.load(cos[k]);
      v.no.load(nos[k]);
      v.flag |= MeshFlags.UPDATE;
    }

    for (let k in fcos) {
      let f = mesh.eidMap.get(k);

      if (f === undefined) {
        console.warn("Mesh integrity error in Transform undo");
        continue;
      }

      f.no.load(fnos[k]);
      f.cent.load(fcos[k]);

      f.flag |= MeshFlags.UPDATE;
    }

    mesh.regenRender();
    if (mesh.haveNgons) {
      mesh.regenTessellation();
    }
  }

  static getCenter(ctx, list, selmask, spacemode, space_matrix_out) {
    let c = meshGetCenterTemps.next().zero();
    let tot = 0.0;

    if (!(selmask & SelMask.GEOM)) {
      return undefined;
    }

    let quat = new Quat();
    let spacetots = 0.0;

    for (let ob of ctx.selectedMeshObjects) {
      let mesh = ob.data;
      let obmat = ob.outputs.matrix.getValue();

      if (spacemode === ConstraintSpaces.LOCAL) {
        //XXX implement me
      }

      for (let v of mesh.verts.selected.editable) {
        c.add(v.co);
        tot++;
      }

      for (let f of mesh.faces.selected.editable) {
        if (spacemode === ConstraintSpaces.NORMAL) {
          let mat = meshGetCenterTempsMats.next();

          let up = meshGetCenterTemps2.next();
          let n = meshGetCenterTemps2.next();

          n.load(f.no).normalize();

          n.multVecMatrix(obmat);

          if (n.dot(n) == 0.0 || isNaN(n.dot(n))) {
            console.warn("NaN");
            continue; //ignore bad/corrupted normal
          }

          //if (v.edges.length > 0) {
          let l = f.lists[0].l;
          up.load(l.next.v.co).sub(l.v.co).normalize();
          //  up.load(v.edges[0].otherVertex(v)).sub(v).normalize();
          //} else {
          //  up.zero();

          if (Math.abs(up.dot(n)) > 0.9 || up.dot(up) < 0.0001) {
            up.zero();

            if (n[2] > 0.95) {
              up[1] = 1.0;
            } else {
              up[2] = 1.0;
            }
          }


          let x = meshGetCenterTemps2.next();
          let y = meshGetCenterTemps2.next();

          x.load(n).cross(up).normalize();
          y.load(x).cross(n).normalize();
          //y.negate();

          let mat2 = meshGetCenterTempsMats.next();
          mat2.makeIdentity();
          let m = mat2.$matrix;

          m.m11 = x[0];
          m.m12 = x[1];
          m.m13 = x[2];

          m.m21 = y[0];
          m.m22 = y[1];
          m.m23 = y[2];

          m.m31 = n[0];
          m.m32 = n[1];
          m.m33 = n[2];
          m.m44 = 1.0;

          //mat2.transpose();
          //mat2.invert();
          if (space_matrix_out) {
            space_matrix_out.load(mat2);
          }

          let quat2 = new Quat();
          quat2.matrixToQuat(mat2);
          quat.add(quat2);
          spacetots++;

          //XXX implement me
        }
      }
    }

    if (isNaN(quat.dot(quat))) {
      console.warn("NaN error calculating mesh transformation space!");
    }

    if (space_matrix_out) {
      //space_matrix_out.makeIdentity();
    }

    if (spacetots > 0.0 && quat.dot(quat) > 0.0 && !isNaN(quat.dot(quat))) {
      //quat.mulScalar(1.0 / spacetots);
      quat.normalize();
      //console.log("quat", quat);

      if (space_matrix_out) {
        //quat.toMatrix(space_matrix_out);
        //console.log(JSON.stringify(space_matrix_out.$matrix));
      }
    }

    if (tot > 0) {
      c.mulScalar(1.0 / tot);
    }

    return c;
  }

  static calcAABB(ctx, selmask) {
    if (!(selmask & SelMask.GEOM)) {
      return undefined;
    }

    let d = 1e17;
    let min = new Vector3([d, d, d]), max = new Vector3([-d, -d, -d]);
    let ok = false;

    for (let ob of ctx.selectedMeshObjects) {
      let mesh = ob.data;

      for (let v of mesh.verts.selected.editable) {
        min.min(v.co);
        max.max(v.co);
        ok = true;
      }
    }

    if (!ok) {
      min.zero();
      max.zero();
    }

    return [min, max];
  }

  static update(ctx, elemlist) {
    let mesh = ctx.mesh;

    if (mesh.haveNgons) {
      mesh.regenTessellation();
    }

    if (elemlist === undefined) {
      mesh.recalcNormals();
      mesh.regenElementsDraw();
      mesh.regenRender();
      mesh.graphUpdate();

      return;
    }

    /*
    for (let v of elemlist.normalvs) {
      v.flag |= MeshFlags.UPDATE;
    }
    for (let td of elemlist) {
      let v = td.data1;
      v.flag |= MeshFlags.UPDATE;
    }

    mesh.regenRender();
    mesh.outputs.depend.graphUpdate();
    return;
    //*/

    for (let v of elemlist.normalvs) {
      v.no[0] = v.no[1] = v.no[2] = 0.0;
    }

    for (let f of elemlist.faces) {
      f.calcNormal();

      mesh.flagElemUpdate(f);

      for (let v of f.verts) {
        v.no.add(f.no);
      }
    }

    for (let v of elemlist.normalvs) {
      v.no.normalize();
    }

    for (let e of elemlist) {
      let v = e.data1;
      mesh.flagElemUpdate(v);
    }

    mesh.regenElementsDraw();
    mesh.regenRender();
    mesh.outputs.depend.graphUpdate();
    return;
    if (elemlist !== undefined) {
      let doneset = new WeakSet();

      for (let e of elemlist) {
        let v = e.data1;

        let n = v.no;
        n[0] = n[1] = n[2] = 0.0;


        for (let f of v.faces) {
          if (!doneset.has(f)) {
            doneset.add(f);

            f.calcCent();
            f.calcNormal();

            mesh.flagElemUpdate(f);

          }

          v.no.add(f.no);
        }
        /*
        for (let e of v.edges) {
          if (!e.l) {
            continue;
          }
          let l = e.l;
          let _i = 0;

          do {
            let f = l.f;

            if (!doneset.has(f)) {
              doneset.add(f);

              f.calcCent();
              f.calcNormal();

              mesh.flagElemUpdate(f);

              v.no.add(f.no);
            }
            l = l.radial_next;
          } while (l !== e.l && _i++ < 10);
        }
         */

        v.no.normalize();
        mesh.flagElemUpdate(v);
      }
    } else {
      mesh.recalcNormals();
    }

    //mesh.regenTessellation(); //slow, disables partial redraw for that frame
    mesh.regenElementsDraw();
    mesh.regenRender();
    mesh.outputs.depend.graphUpdate();
    //mesh.regenPartial();
  }
}
TransDataType.register(MeshTransType);

export class ObjectTransform {
  constructor(ob) {
    this.invmatrix = new Matrix4();
    this.tempmat = new Matrix4();
    this.matrix = new Matrix4(ob.outputs.matrix.getValue());
    this.loc = new Vector3(ob.inputs.loc.getValue());
    this.rot = new Vector3(ob.inputs.rot.getValue());
    this.scale = new Vector3(ob.inputs.scale.getValue());
    this.ob = ob;

    this.invmatrix.load(this.matrix).invert();
  }

  copy() {
    let ret = new ObjectTransform(this.ob);
    return ret;
  }
}

export class ObjectTransType extends TransDataType {
  static transformDefine() {return {
    name   : "object",
    uiname : "Object",
    flag   : 0,
    icon   : -1
  }}

  static genData(ctx, selectmode, propmode, propradius) {
    let ignore_meshes = selectmode & (SelMask.VERTEX|SelMask.EDGE|SelMask.FACE);

    //console.warn("OBJECT GEN", selectmode, selectmode & (SelMask.OBJECT));

    if (!(selectmode & SelMask.OBJECT)) {
      return undefined;
    }

    let tdata = new TransDataList(this);

    function get_transform_parent(ob) {
      if (ob.inputs.matrix.edges.length > 0) {
        let parent = ob.inputs.matrix.edges[0].node;

        if (parent instanceof SceneObject) {
          if ((parent.flag & ObjectFlags.SELECT) && !(parent.flag & (ObjectFlags.HIDE|ObjectFlags.LOCKED))) {
            return parent;
          } else {
            return get_transform_parent(parent);
          }
        }
      }

      return ob;
    }

    for (let ob of ctx.selectedObjects) {
      let ok = get_transform_parent(ob) === ob;
      ok = ok && (!ignore_meshes || !(ob.data instanceof Mesh));

      if (!ok) {
        continue;
      }

      console.warn("processing transform sceneobject", ob.name, ob);

      let td = new TransDataElem();

      td.data1 = ob;
      td.data2 = new ObjectTransform(ob);
      tdata.push(td);
    }

    return tdata;
  }

  static applyTransform(ctx, elem, do_prop, matrix, toolop) {
    let mat = elem.data2.tempmat;

    mat.load(elem.data2.matrix);

    //mat.makeIdentity();

    mat.preMultiply(matrix);
    //mat.multiply(elem.data2.invmatrix);

    let ob = elem.data1;

    let order = ob.inputs.rotOrder.getValue();
    let r = undefined, s = undefined;

    r = ob.inputs.rot.getValue();
    s = ob.inputs.scale.getValue();

    mat.decompose(ob.inputs.loc.getValue(), r, s, undefined, undefined, order);

    ob.graphUpdate();
  }

  static calcUndoMem(ctx, undodata) {
    let ud = undodata;
    let tot = 0;

    for (let k in ud) {
      tot += 16*8 + 32; //matrix4
    }

    return tot;
  }

  static undoPre(ctx, elemlist) {
    let undo = {};

    for (let td of elemlist) {
      let transform = td.data2.copy();
      transform.ob = undefined; //kill unwanted reference
      undo[td.data1.lib_id] = transform;
    }

    return undo;
  }

  static undo(ctx, undodata) {
    for (let k in undodata) {
      k = parseInt(k);

      let ob = ctx.datalib.get(k);
      let transform = undodata[k];

      if (ob === undefined) {
        console.warn("error in transform", k, typeof k);
        continue;
      }

      ob.inputs.loc.setValue(transform.loc);
      ob.inputs.rot.setValue(transform.rot);
      ob.inputs.scale.setValue(transform.scale);
      ob.outputs.matrix.setValue(transform.matrix);

      ob.graphUpdate();
    }

    window.updateDataGraph();
  }

  static getOriginMatrix(ctx, list, selmask, spacemode, space_matrix_out) {
    let cent = this.getCenter(ctx, list, selmask, spacemode, space_matrix_out);

    if (cent !== undefined) { //getCenter does validation for us
      let tmat = new Matrix4();
      let ob = ctx.object;

      if (ob) {
        tmat.load(ob.outputs.matrix.getValue());
        tmat.makeRotationOnly();
        tmat.invert();
      }

      return tmat;
    }
  }

  static getCenter(ctx, list, selmask, spacemode, space_matrix_out) {
    if (!(selmask & SelMask.OBJECT)) {
      return undefined;
    }

    if (space_matrix_out !== undefined) {
      space_matrix_out.makeIdentity();
    }

    let cent = new Vector3();
    let temp = new Vector3();
    let tot = 0.0;

    for (let ob of ctx.selectedObjects) {
      let bbox = ob.getBoundingBox();


      let co = new Vector3(bbox[0]).interp(bbox[1], 0.5);
      cent.add(co);
      
      //temp.zero();
      //temp.multVecMatrix(ob.outputs.matrix.getValue());

      //cent.add(temp);

      tot++;
    }

    if (tot > 0) {
      cent.mulScalar(1.0 / tot);
    }

    return cent;
  }

  static calcAABB(ctx, selmask) {
    let ret = undefined;

    if (!(selmask & SelMask.OBJECT)) {
      return undefined;
    }

    for (let ob of ctx.selectedObjects) {
      let aabb = ob.getBoundingBox();

      if (ret === undefined) {
        ret = [aabb[0].copy(), aabb[1].copy()];
      } else {
        aabb_union(ret, aabb);
      }
    }

    return ret;
  }

  static update(ctx, elemlist) {
    for (let td of elemlist) {
      td.data1.graphUpdate();
    }

    window.updateDataGraph();
    window.redraw_viewport();
  }
}
TransDataType.register(ObjectTransType);

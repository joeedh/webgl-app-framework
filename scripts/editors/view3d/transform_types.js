import {Vector3, Vector2, Vector4, Matrix4, Quat} from '../../util/vectormath.js';
import {ToolOp, UndoFlags} from '../../path.ux/scripts/simple_toolsys.js';
import {keymap} from '../../path.ux/scripts/simple_events.js';
import {MeshFlags, MeshTypes, Mesh} from '../../mesh/mesh.js';
import {SelMask} from './selectmode.js';
import {SceneObject, ObjectFlags} from "../../sceneobject/sceneobject.js";
import {PropModes, TransDataType, TransDataElem} from './transform_base.js';
import * as util from '../../util/util.js';
import {aabb_union} from '../../util/math.js';

import {ConstraintSpaces} from "./transform_base.js";
let meshGetCenterTemps = util.cachering.fromConstructor(Vector3, 64);
let meshGetCenterTemps2 = util.cachering.fromConstructor(Vector3, 64);
let meshGetCenterTempsMats = util.cachering.fromConstructor(Matrix4, 16);

export class MeshTransType extends TransDataType {
  static transformDefine() {return {
    name   : "mesh",
    uiname : "Mesh",
    flag   : 0,
    icon   : -1
  }}

  /**FIXME this only handles the active mesh object, it should
    iterator over ctx.selectedMeshObjets*/
  static genData(ctx, selectmode, propmode, propradius) {
    let mesh = ctx.mesh;
    let tdata = [];

    if (!mesh || !(selectmode & SelMask.GEOM)) {
      return undefined;
    }

    console.log("MESH GEN", selectmode & SelMask.GEOM, selectmode);

    if (propmode != PropModes.NONE) {
      let i = 0;
      let unset_w = 100000.0;

      for (let v of mesh.verts.editable) {
        v.index = i;

        let td = new TransDataElem();
        td.data1 = v;
        td.data2 = new Vector3(v);

        tdata.push(td);

        td.w = v.flag & MeshFlags.SELECT ? 0.0 : unset_w;
        i++;
      }

      //let visit = new util.set();
      let visit = new Array(tdata.length);
      let limit = 2;

      for (let i = 0; i < visit.length; i++) {
        visit[i] = 0;
      }

      let stack = new Array(1024);
      stack.cur = 0;

      for (let v of mesh.verts.selected.editable) {
        stack.cur = 0;
        stack[0] = v;
        let startv = v;

        while (stack.cur >= 0) {
          let v = stack[stack.cur--];
          let td1 = tdata[v.index];

          for (let e of v.edges) {
            let v2 = e.otherVertex(v);

            if (visit[v2.index] > limit || (v2.flag & MeshFlags.HIDE) || (v2.flag & MeshFlags.SELECT)) {
              continue;
            }

            let td2 = tdata[v2.index];
            let dis = td1.w + e.v2.vectorDistance(e.v1);
            td2.w = Math.min(td2.w, dis);

            if (td2.w < propradius) {
              stack[stack.cur++] = v2;
            }
          }

          if (stack.cur >= stack.length - 50) {
            stack.length = ~~(stack.length * 1.5);
            console.log("reallocation in proportional edit mode recursion stack", stack.length);
          }
        }
      }

      for (let v of mesh.verts.editable) {
        if (v.flag & MeshFlags.SELECT) {
          tdata[v.index].w = 1;
        } else if (tdata[v.index].w == unset_w) {
          tdata[v.index].w = 0;
        } else {
          tdata[v.index].w = TransDataType.calcPropCurve(tdata[v.index].w);
        }
      }
    } else {
      for (let v of mesh.verts.selected.editable) {
        let td = new TransDataElem();
        td.data1 = v;
        td.data2 = new Vector3(v);
        td.w = 1.0;

        tdata.push(td);
      }
    }

    return tdata;
  }

  static applyTransform(ctx, elem, do_prop, matrix, toolop) {
    let td = elem;

    td.data1.load(td.data2).multVecMatrix(matrix);
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

      cos[v.eid] = new Vector3(v);
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
      let v = mesh.eidmap[k];

      if (v === undefined) {
        console.warn("Mesh integrity error in Transform undo");
        continue;
      }

      v.load(cos[k]);
      v.no.load(nos[k]);
    }

    for (let k in fcos) {
      let f = mesh.eidmap[k];

      if (f === undefined) {
        console.warn("Mesh integrity error in Transform undo");
        continue;
      }

      f.no.load(fnos[k]);
      f.cent.load(fcos[k]);
    }

    mesh.regenRender();
  }

  static getCenter(ctx, selmask, spacemode, space_matrix_out) {
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

      if (spacemode == ConstraintSpaces.LOCAL) {
        //XXX implement me
      }

      for (let v of mesh.verts.selected.editable) {
        c.add(v);
        tot++;
      }

      for (let f of mesh.faces.selected.editable) {
        if (spacemode == ConstraintSpaces.NORMAL) {
          let mat = meshGetCenterTempsMats.next();

          let up = meshGetCenterTemps2.next();
          let n = meshGetCenterTemps2.next();

          n.load(f.no).normalize();

          //console.log(obmat.$matrix);/
          n.multVecMatrix(obmat);

          if (n.dot(n) == 0.0 || isNaN(n.dot(n))) {
            console.warn("NaN");
            continue; //ignore bad/corrupted normal
          }

          //if (v.edges.length > 0) {
          let l = f.lists[0].l;
          up.load(l.next.v).sub(l.v).normalize();
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

    for (let ob in ctx.selectedMeshObjects) {
      let mesh = ob.data;

      for (let v of mesh.verts.editable()) {
        min.min(v);
        max.max(v);
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

    if (elemlist !== undefined) {
      let fset = new util.set();
      let vset = new util.set();

      for (let e of elemlist) {
        let v = e.data1;
        vset.add(v);

        for (let e2 of v.edges) {
          for (let f of e2.faces) {
            fset.add(f);
          }
        }
      }

      for (let v of vset) {
        v.no.zero();
      }

      for (let f of fset) {
        f.calcNormal();
        f.calcCent();
      }

      for (let v of vset) {
        for (let f of v.faces) {
          v.no.add(f.no);
          mesh.flagElemUpdate(f);
        }

        for (let e of v.edges) {
          mesh.flagElemUpdate(e);
        }

        v.no.normalize();
        mesh.flagElemUpdate(v);
      }
    } else {
      mesh.recalcNormals();

      for (let item of elemlist) {
        mesh.flagElemUpdate(item.data1);

        for (let e of item.data1.edges) {
          mesh.flagElemUpdate(e);
          e.update();
        }

        for (let f of item.data1.faces) {
          mesh.flagElemUpdate(f);
        }
      }
    }

    mesh.regenTesellation();
    mesh.regenRender();
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

    console.warn("OBJECT GEN", selectmode, selectmode & (SelMask.OBJECT));

    if (!(selectmode & SelMask.OBJECT)) {
      return undefined;
    }

    let tdata = [];

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

    mat.makeIdentity();

    mat.multiply(elem.data2.matrix);
    mat.multiply(elem.data2.invmatrix);
    mat.multiply(matrix);

    let ob = elem.data1;

    mat.decompose(ob.inputs.loc.getValue(), ob.inputs.rot.getValue(), ob.inputs.scale.getValue());
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
      let ob = ctx.datalib.get(k);
      let transform = undodata[k];

      if (ob === undefined) {
        console.warn("error in transform", k);
        continue;
      }

      ob.inputs.loc.setValue(transform.loc);
      ob.inputs.rot.setValue(transform.rot);
      ob.inputs.scale.setValue(transform.scale);
      ob.outputs.matrix.setValue(transform.matrix);

      ob.update();
    }

    window.updateDataGraph();
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

    //console.log("calculating aabb");

    for (let ob of ctx.selectedObjects) {
      let aabb = ob.getBoundingBox();

      if (ret === undefined) {
        ret = [aabb[0].copy(), aabb[1].copy()];
      } else {
        aabb_union(ret, aabb);
      }
    }

    //console.log(ret);

    return ret;
  }

  static update(ctx, elemlist) {
    for (let td of elemlist) {
      td.data1.update();
    }

    window.updateDataGraph();
    window.redraw_viewport();
  }
}
TransDataType.register(ObjectTransType);

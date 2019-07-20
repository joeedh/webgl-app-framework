import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SimpleMesh, LayerTypes} from '../core/simplemesh.js';
import {IntProperty, BoolProperty, FloatProperty, EnumProperty,
  FlagProperty, ToolProperty, Vec3Property, Mat4Property,
  PropFlags, PropTypes, PropSubTypes} from '../path.ux/scripts/toolprop.js';
import {ToolOp, ToolFlags, UndoFlags} from '../path.ux/scripts/simple_toolsys.js';
import {dist_to_line_2d} from '../path.ux/scripts/math.js';
import {CallbackNode, NodeFlags} from "../core/graph.js";
import {DependSocket} from '../core/graphsockets.js';
import * as util from '../util/util.js';
import {SelMask} from '../editors/view3d/selectmode.js';

import {Mesh, MeshTypes} from '../core/mesh.js';
import {MeshOp} from './mesh_ops_base.js';

export class ExtrudeRegionsOp extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {return {
    uiname   : "Extrude Regions",
    icon     : -1,
    toolpath : "mesh.extrude_regions",
    undoflag : 0,
    flag     : 0,
    inputs   : {},
    outputs  : {
      normal : new Vec3Property(),
      normalSpace : new Mat4Property()
    }
  }}

  _exec_intern(ctx, mesh) {
    let fset = new util.set(mesh.faces.selected.editable);
    let vset = new util.set();
    let eset = new util.set();

    for (let f of fset) {
      for (let list of f.lists) {
        for (let l of list) {
          vset.add(l.v);
          eset.add(l.e);
        }
      }
    }

    let vmap = {}, emap = {};

    for (let v of vset) {
      let v2 = vmap[v.eid] = mesh.makeVertex(v);
      mesh.copyElemData(v2, v);
    }

    for (let e of eset) {
      let v1 = vmap[e.v1.eid];
      let v2 = vmap[e.v2.eid];

      let e2 = emap[e.eid] = mesh.makeEdge(v1, v2);
      mesh.copyElemData(e2, e);
    }

    for (let v of vset) {
      mesh.verts.setSelect(v, false);
    }

    for (let e of eset) {
      mesh.edges.setSelect(e, false);
    }

    let no = new Vector3();

    for (let f of fset) {
      no.add(f.no);

      let f2 = mesh.copyFace(f, vmap);
      console.log(f2);

      if (f === mesh.faces.active) {
        mesh.setActive(f2);
      }
      mesh.faces.setSelect(f2);

      let quadvs = new Array(4);

      for (let i=0; i<f2.lists.length; i++) {
        let list1 = f.lists[i];
        let list2 = f2.lists[i];

        let l1 = list1.l;
        let l2 = list2.l;
        let _i = 0;

        do {
          quadvs[0] = l1.v;
          quadvs[1] = l1.next.v;
          quadvs[2] = l2.next.v;
          quadvs[3] = l2.v;

          let f3 = mesh.makeFace(quadvs);
          let l = f3.lists[0].l;

          mesh.copyElemData(l, l1);
          mesh.copyElemData(l.next, l1.next);
          mesh.copyElemData(l.next.next, l2.next);
          mesh.copyElemData(l.prev, l2);

          if (_i++ > 100000) {
            console.warn("infinite loop detected");
            break;
          }
          l2 = l2.next;
          l1 = l1.next;
        } while (l1 !== list1.l);
      }
      mesh.killFace(f);
    }

    for (let e of eset) {
      if (e.l === undefined) {
        mesh.killEdge(e);
      }
    }

    for (let v of vset) {
      if (v.edges.length == 0) {
        mesh.killVertex(v);
      }
    }

    for (let k in vmap) {
      mesh.verts.setSelect(vmap[k], true);
    }

    no.normalize();
    if (no.dot(no) == 0.0) {
      no[2] = 1.0;
    }

    this.outputs.normalSpace.setValue(new Matrix4().makeNormalMatrix(no));
    this.outputs.normal.setValue(no);

    mesh.tessellate();

    mesh.regenRender();
    mesh.regenTesellation();
    window.redraw_viewport();
  }

  exec(ctx) {
    for (let ob of ctx.selectedMeshObjects) {
      this._exec_intern(ctx, ob.data);
    }
  }
}

ToolOp.register(ExtrudeRegionsOp);


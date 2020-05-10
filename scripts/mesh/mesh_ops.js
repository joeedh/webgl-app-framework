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
import {Icons} from '../editors/icon_enum.js';

import {MeshFlags, MeshTypes, MeshFeatures} from './mesh_base.js';
import {MeshOp} from './mesh_ops_base.js';
import {subdivide} from '../subsurf/subsurf_mesh.js';
import {MeshToolBase} from "../editors/view3d/tools/meshtool.js";

export class DeleteOp extends MeshOp {
  static tooldef() {return {
    uiname : "Delete Selected",
    icon : Icons.TINY_X,
    toolpath : "mesh.delete_selected",
    inputs : ToolOp.inherit(),
    outputs : ToolOp.inherit()
  }}

  exec(ctx) {
    console.warn("mesh.delete_selected");

    for (let mesh of this.getMeshes(ctx)) {
      let del = [];

      for (let v of mesh.verts.selected.editable) {
        del.push(v);
      }

      for (let v of del) {
        mesh.killVertex(v);
      }

      mesh.regenRender();
      mesh.regenTesellation();
      mesh.update();
    }

    window.redraw_viewport();
  }
}
ToolOp.register(DeleteOp);

export class ExtrudeOneVertexOp extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {return {
    uiname       : "Extrude Vertex",
    icon         : Icons.EXTRUDE,
    toolpath     : "mesh.extrude_one_vertex",
    description  : "Extrude one vertex",
    inputs       : ToolOp.inherit({
      co         : new Vec3Property(),
      select     : new BoolProperty(true),
      setActive  : new BoolProperty(true)
    }),
    outputs : ToolOp.inherit({
      vertex : new IntProperty(-1), //output vertex eid
      edge   : new IntProperty(-1) //output edge eid
    })
  }}

  exec(ctx) {
    let mesh = this.getActiveMesh(ctx);

    if (!(mesh.features & MeshFeatures.MAKE_VERT)) {
      ctx.error("Mesh doesn't support making new vertices");
      ctx.toolstack.toolCancel(ctx, this);
      return;
    }

    let co = this.inputs.co.getValue();
    let v = mesh.makeVertex(co);

    let ok = mesh.verts.active !== undefined;
    ok = ok && (mesh.features & MeshFeatures.MAKE_EDGE);
    ok = ok && v !== mesh.verts.active; //in case of auto-setting somewhere

    ok = ok && (mesh.verts.active.edges.length < 2 || (mesh.features & MeshFeatures.GREATER_TWO_VALENCE));

    this.outputs.vertex.setValue(v.eid);

    if (ok) {
      let e = mesh.makeEdge(mesh.verts.active, v);
      this.outputs.edge.setValue(e.eid);
    }

    if (this.inputs.select.getValue()) {
      mesh.setSelect(v, true);
    }

    if (this.inputs.setActive.getValue()) {
      mesh.setActive(v);
    }

    mesh.regenTesellation();
    mesh.regenRender();
  }
}
ToolOp.register(ExtrudeOneVertexOp);

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
    inputs   : ToolOp.inherit({}),
    outputs  : {
      normal : new Vec3Property(),
      normalSpace : new Mat4Property()
    }
  }}

  _exec_intern(ctx, mesh) {
    let fset = new util.set(mesh.faces.selected.editable);
    let vset = new util.set();
    let eset = new util.set();
    let boundary = new util.set();

    for (let f of fset) {
      for (let list of f.lists) {
        for (let l of list) {
          vset.add(l.v);
          eset.add(l.e);
        }
      }
    }

    for (let e of eset) {
      let l = e.l;

      if (l === undefined) {
        continue;
      }

      let _i = 0;
      do {
        if (!fset.has(l.f)) {
          boundary.add(e);
          break;
        }

        if (_i++ > 10000) {
          console.log("infinite loop detected");
          break;
        }
        l = l.radial_next;
      } while (l !== e.l);

      if (_i == 1) {
        boundary.add(e);
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

      if (f === mesh.faces.active) {
        mesh.setActive(f2);
      }

      mesh.faces.setSelect(f2, true);
      for (let list2 of f2.lists) {
        for (let l2 of list2) {
          mesh.edges.setSelect(l2.e, true);
        }
      }

      let quadvs = new Array(4);

      for (let i=0; i<f2.lists.length; i++) {
        let list1 = f.lists[i];
        let list2 = f2.lists[i];

        let l1 = list1.l;
        let l2 = list2.l;
        let _i = 0;

        do {
          if (boundary.has(l1.e)) {
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
          }

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

    for (let e of mesh.edges) {
      e.flag &= ~MeshFlags.DRAW_DEBUG;
    }

    for (let e of boundary) {
      //mesh.edges.setSelect(e, true);
      e.flag |= MeshFlags.DRAW_DEBUG;
      //mesh.verts.setSelect(e.v1, true);
      //mesh.verts.setSelect(e.v2, true);
    }

    for (let e of eset) {
      if (!boundary.has(e) && e.l === undefined) {
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
    for (let mesh of this.getMeshes(ctx)) {
      this._exec_intern(ctx, mesh);
    }
  }
}

ToolOp.register(ExtrudeRegionsOp);

export class CatmullClarkeSubd extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {return {
    uiname   : "Subdivide Smooth",
    icon     : Icons.SUBDIVIDE,
    toolpath : "mesh.subdivide_smooth",
    undoflag : 0,
    flag     : 0,
    inputs   : ToolOp.inherit({}),
  }}

  exec(ctx) {
    console.log("subdivide smooth!");

    for (let mesh of this.getMeshes(ctx)) {
      console.log("doing mesh", mesh.lib_id);

      subdivide(mesh, list(mesh.faces.selected.editable));
      mesh.regenRender();

      let es = new util.set();

      for (let e of mesh.edges.selected.editable) {
        if (!e.l) {
          es.add(e);
        }
      }

      //handle wire edges
      let vs = new util.set();

      for (let e of es) {
        vs.add(e.v1);
        vs.add(e.v2);

        let ret = mesh.splitEdge(e, 0.5);

        if (ret.length > 0) {
          vs.add(ret[1]);
          mesh.setSelect(ret[0], true);
          mesh.setSelect(ret[1], true);
        }
      }

      vertexSmooth(mesh, vs);

      mesh.regenRender();
      mesh.regenTesellation();
      mesh.update();
    }
  }
}
ToolOp.register(CatmullClarkeSubd);

export function vertexSmooth(mesh, verts=mesh.verts.selected.editable, fac=0.5) {
  let cos = {};

  for (let v of verts) {
    cos[v.eid] = new Vector3(v);
  }

  for (let v of verts) {
    v.zero();
    let tot = 0.0;

    for (let e of v.edges) {
      let v2 = e.otherVertex(v);

      v.add(cos[v2.eid]);
      tot++;
    }

    if (tot == 0.0) {
      v.load(cos[v.eid]);
    } else {
      v.mulScalar(1.0 / tot);
      v.interp(cos[v.eid], 1.0-fac);
    }
  }

  for (let v of verts) {
    mesh.flagElemUpdate(v);

    for (let e of v.edges) {
      mesh.flagElemUpdate(e);
    }

    for (let f of v.faces) {
      mesh.flagElemUpdate(f);
    }
  }

  mesh.regenPartial();
}

export class VertexSmooth extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {return {
    uiname   : "Vertex Smooth",
    icon     : -1,
    toolpath : "mesh.vertex_smooth",
    undoflag : 0,
    flag     : 0,
    inputs   : ToolOp.inherit({}),
  }}

  exec(ctx) {
    console.log("smooth!");

    for (let mesh of this.getMeshes(ctx)) {
      vertexSmooth(mesh);
    }
  }
}
ToolOp.register(VertexSmooth);

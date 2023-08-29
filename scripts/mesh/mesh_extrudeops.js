import {MeshOp} from './mesh_ops_base.js';
import {Icons} from '../editors/icon_enum.js';
import {
  BoolProperty, IntProperty, Mat4Property, Matrix4, ToolMacro, ToolOp, Vec3Property, Vector3
} from '../path.ux/pathux.js';
import {LogContext, MeshFeatures, MeshFlags, ReusableIter} from './mesh_base.js';
import {InflateOp, TranslateOp} from '../editors/view3d/transform/transform_ops.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import * as util from '../util/util.js';
import {vertexSmooth} from './mesh_utils.js';

export class ExtrudeOneVertexOp extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname     : "Extrude Vertex",
      icon       : Icons.EXTRUDE,
      toolpath   : "mesh.extrude_one_vertex",
      description: "Extrude one vertex",
      inputs     : ToolOp.inherit({
        co       : new Vec3Property(),
        select   : new BoolProperty(true),
        setActive: new BoolProperty(true)
      }),
      outputs    : ToolOp.inherit({
        vertex: new IntProperty(-1), //output vertex eid
        edge  : new IntProperty(-1) //output edge eid
      })
    }
  }

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

    mesh.regenTessellation();
    mesh.regenRender();
  }
}

ToolOp.register(ExtrudeOneVertexOp);

export class ExtrudeRegionsOp extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname  : "Extrude Regions",
      icon    : -1,
      toolpath: "mesh.extrude_regions",
      undoflag: 0,
      flag    : 0,
      inputs  : ToolOp.inherit({}),
      outputs : {
        normal     : new Vec3Property(),
        normalSpace: new Mat4Property()
      }
    }
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if (args["transform"]) {
      let macro = new ToolMacro();
      macro.add(tool);

      let translate = new TranslateOp();
      translate.inputs.selmask.setValue(SelMask.GEOM);
      translate.inputs.constraint.setValue([0, 0, 1]);

      macro.add(translate);

      macro.connect(tool, "normalSpace", translate, "constraint_space");

      macro.connect(tool, translate, () => {
        //  translate.inputs.constraint_space.setValue(tool.outputs.normalSpace.getValue());
      });

      return macro;
    }

    return tool;
  }

  _exec_intern(ctx, mesh) {
    let fset = new Set(mesh.faces.selected.editable);
    let vset = new Set();
    let eset = new Set();
    let boundary = new Set();

    for (let f of fset) {
      for (let list of f.lists) {
        for (let l of list) {
          vset.add(l.v);
          eset.add(l.e);
        }
      }
    }

    for (let v of vset) {
      v.flag |= MeshFlags.UPDATE;
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

      if (_i === 1) {
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
      e2.flag |= MeshFlags.UPDATE;

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

      for (let i = 0; i < f2.lists.length; i++) {
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
      if (v.edges.length === 0) {
        mesh.killVertex(v);
      }
    }

    for (let k in vmap) {
      mesh.verts.setSelect(vmap[k], true);
    }

    no.normalize();
    if (no.dot(no) === 0.0) {
      no[2] = 1.0;
    }

    this.outputs.normalSpace.setValue(new Matrix4().makeNormalMatrix(no));
    this.outputs.normal.setValue(no);

    mesh.regenRender();
    mesh.regenTessellation();
    mesh.recalcNormals();
    mesh.graphUpdate();
    mesh.regenBVH();

    window.redraw_viewport();
  }

  exec(ctx) {
    for (let mesh of this.getMeshes(ctx)) {
      this._exec_intern(ctx, mesh);
    }
  }
}

ToolOp.register(ExtrudeRegionsOp);

export function extrudeIndivFaces(mesh, faces, lctx) {
  faces = ReusableIter.getSafeIter(faces);

  let emap = new Map();

  let flag = MeshFlags.NOAPI_TEMP1;

  for (let f of faces) {
    for (let l of f.loops) {
      if (l.v === l.e.v1) {
        l.e.flag |= flag;
      } else {
        l.e.flag &= ~flag;
      }

      let oldv = l.v;

      l.v = mesh.makeVertex(l.v, undefined, lctx);
      l.v.flag |= MeshFlags.UPDATE;

      mesh.copyElemData(l.v, oldv);
    }

    for (let l of f.loops) {
      let e;

      if (l.e.flag & flag) {
        e = mesh.ensureEdge(l.v, l.next.v, lctx, l.e);
      } else {
        e = mesh.ensureEdge(l.next.v, l.v, lctx, l.e);
      }

      e.flag |= MeshFlags.UPDATE;

      emap.set(e, l.e);
      mesh.replaceLoopEdge(l, e);
    }
  }

  for (let [e2, e1] of emap) {
    let l = e2.l;

    console.log(e1, e2);

    let f;

    let v1 = e1.v1;
    let v2 = e2.v1;
    let v3 = e2.v2;
    let v4 = e1.v2;

    if (l.v !== e2.v1) {
      f = mesh.makeQuad(v1, v2, v3, v4, lctx);
    } else {
      f = mesh.makeQuad(v4, v3, v2, v1, lctx);
    }

    for (let l of f.loops) {
      if (l.e === e2 || l.e === e1) {
        mesh.copyElemData(l, l.radial_next);
      }
    }

    for (let l of f.loops) {
      if (l.e !== e2 && l.e !== e1) {
        mesh.copyElemData(l, l.next);
      }
    }
  }
}

export class ExtrudeFaceIndivOp extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Extrude Faces (Individual)",
      toolpath: "mesh.extrude_individual_faces",
      inputs  : ToolOp.inherit({})
    }
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if (args["transform"]) {
      let macro = new ToolMacro();

      macro.add(tool);
      let inflate = new InflateOp();
      macro.add(inflate);

      return macro;
    }
    return tool;
  }

  exec(ctx) {
    for (let mesh of this.getMeshes(ctx)) {
      let faces = new Set(mesh.faces.selected.editable);

      let lctx = new LogContext();

      lctx.onnew = function (e) {
        e.flag |= MeshFlags.UPDATE;
      }

      extrudeIndivFaces(mesh, faces, lctx);

      mesh.selectNone();

      for (let f of faces) {
        mesh.setSelect(f, true);

        for (let l of f.loops) {
          mesh.setSelect(l.v, true);
          mesh.setSelect(l.e, true);
        }
      }

      mesh.regenAll();
      mesh._clearGPUMeshes(ctx.gl);
      mesh.recalcNormals();
      mesh.graphUpdate();

      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(ExtrudeFaceIndivOp);


export class InsetHoleOp extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname  : "Inset Faces",
      icon    : -1,
      toolpath: "mesh.inset_regions",
      undoflag: 0,
      flag    : 0,
      inputs  : ToolOp.inherit({}),
      outputs : {
        normal     : new Vec3Property(),
        normalSpace: new Mat4Property()
      }
    }
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if (args["transform"]) {
      let macro = new ToolMacro();
      macro.add(tool);

      let translate = new TranslateOp();
      translate.inputs.selmask.setValue(SelMask.GEOM);
      translate.inputs.constraint.setValue([0, 0, 1]);

      macro.add(translate);

      macro.connect(tool, "normalSpace", translate, "constraint_space");

      macro.connect(tool, translate, () => {
        //  translate.inputs.constraint_space.setValue(tool.outputs.normalSpace.getValue());
      });

      return macro;
    }

    return tool;
  }

  _exec_intern(ctx, mesh) {
    const no = new Vector3();

    for (let f of mesh.faces.selected.editable) {
      no.add(f.no);
    }

    no.normalize();


    let vset = new Set();
    let eset = new Set();
    let fset = new Set();

    for (let f of mesh.faces.selected.editable) {
      fset.add(f);
    }

    let loops = [];
    let outervs = new Set();
    let outeres = new Set();
    let outerls = new Set();

    for (let f of fset) {
      for (let list of f.lists) {
        for (let l of list) {
          let ok = false;
          vset.add(l.v);
          eset.add(l.e);

          loops.push(l);

          let l2 = l;
          do {
            if (!fset.has(l2.f)) {
              ok = true;
              break;
            }
          } while ((l2 = l2.radial_next) !== l);

          if (ok) {
            outeres.add(l.e);
            outervs.add(l.e.v1);
            outervs.add(l.e.v2);
          } 
        }
      }
    }


    console.log(outervs, outeres);

    for (let e of outeres) {
      for (let l of e.loops) {
        if (fset.has(l.f)) {
          outerls.add(l);
        }
      }
    }

    /* Disconnect faces. */
    for (let l of loops) { //outerls
      mesh._radialRemove(l.e, l);
    }

    let newvs = new Map();
    let newes = new Map();

    /* Split verts. */
    for (let v of outervs) {
      let v2 = mesh.makeVertex(v);
      mesh.copyElemData(v2, v);

      mesh.verts.setSelect(v, false);
      mesh.verts.setSelect(v2, true);

      newvs.set(v, v2);
    }

    for (let e of outeres) {
      let v1 = newvs.get(e.v1), v2 = newvs.get(e.v2);

      let e2 = mesh.makeEdge(v1, v2);
      mesh.copyElemData(e2, e);

      mesh.edges.setSelect(e, false);
      mesh.edges.setSelect(e2, true);

      newes.set(e, e2);
    }

    /* Splice edges that belongs to the region but
       do not lie on the boundary.
     */
    for (let e of eset) {
      if (outeres.has(e)) {
        continue;
      }

      let v;

      if ((v = newvs.get(e.v1))) {
        mesh._diskRemove(e.v1, e);
        e.v1 = v;
        mesh._diskInsert(v, e);
      }

      if ((v = newvs.get(e.v2))) {
        mesh._diskRemove(e.v2, e);
        e.v2 = v;
        mesh._diskInsert(v, e);
      }
    }

    for (let l of loops) {
      let v2 = newvs.get(l.v);
      if (v2 === undefined) {
        continue;
      }

      l.v = v2;
    }

    for (let l of loops) {
      l.e = mesh.ensureEdge(l.v, l.next.v);
      mesh._radialInsert(l.e, l);
    }


    let visit = new WeakSet();
    for (let e of outeres) {
      if (visit.has(e)) {
        continue;
      }

      let bound = [];
      let hole = [];

      let v;
      if (e.l) {
        v = e.v1 === e.l.v1 ? e.v1 : e.v2;
      } else {
        v = e.v1;
      }

      let firstv = v;

      do {
        bound.push(v);
        hole.push(newvs.get(v));
        visit.add(e);

        v = e.otherVertex(v);
        let ok = false;

        for (let e2 of v.edges) {
          if (e2 !== e && outeres.has(e2)) {
            ok = true;
            e = e2;
            break;
          }
        }

        if (!ok) {
          break;
        }
      } while (firstv !== v);

      hole.reverse();

      console.log("bound:", bound, hole);
      let newf = mesh.makeFace(bound);
      mesh.makeHole(newf, hole);
    }

    this.outputs.normalSpace.setValue(new Matrix4().makeNormalMatrix(no));
    this.outputs.normal.setValue(no);

    mesh.regenRender();
    mesh.regenTessellation();
    mesh.recalcNormals();
    mesh.graphUpdate();
    mesh.regenBVH();

    window.redraw_viewport();
  }

  exec(ctx) {
    for (let mesh of this.getMeshes(ctx)) {
      this._exec_intern(ctx, mesh);
    }
  }
}

ToolOp.register(InsetHoleOp);

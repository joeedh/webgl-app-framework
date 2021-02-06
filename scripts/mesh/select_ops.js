"use strict";

import {
  IntProperty, EnumProperty, BoolProperty,
  FloatProperty, FlagProperty, ToolOp, UndoFlags, ReportProperty
} from "../path.ux/scripts/pathux.js";
import {MeshTypes, MeshFlags, LogContext} from './mesh_base.js';
import * as util from '../util/util.js';
import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../util/vectormath.js';
import {SelMask, SelOneToolModes, SelToolModes} from '../editors/view3d/selectmode.js';
import {DataRefListProperty, DataRefProperty} from "../core/lib_api.js";
import {Icons} from '../editors/icon_enum.js';
import {MeshOp} from "./mesh_ops_base.js";
import {SceneObject} from "../sceneobject/sceneobject.js";
import {Element} from './mesh_types.js';
import {FindNearest} from '../editors/view3d/findnearest.js';
import {getEdgeLoop} from './mesh_utils.js';

export class SelectOpBase extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname     : "Mesh Select",
      toolpath   : "{selectopbase}",
      icon       : -1,
      description: "select an element",
      inputs     : ToolOp.inherit({
        object : new DataRefProperty("object").private(),
        selmask: new FlagProperty(undefined, SelMask).private(),
        mode   : new EnumProperty(undefined, SelToolModes)
      })
    }
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if (!("selmask" in args)) {
      tool.inputs.selmask.setValue(ctx.selectMask);
    }

    return tool;
  }

  calcUndoMem(ctx) {
    let tot = 0;

    for (let k in this._undo) {
      if (k === "activeObject") {
        tot += 8;
        continue;
      }

      let ud = this._undo[k];
      tot += ud.data.length*8 + ud.dataPath.length;
    }

    return tot;
  }

  undoPre(ctx) {
    this._undo = {};

    if (ctx.object !== undefined) {
      this._undo.activeObject = ctx.object.lib_id;
    } else {
      this._undo.activeObject = -1;
    }

    for (let mesh of this.getMeshes(ctx)) {
      let object_id = mesh.ownerId !== undefined ? mesh.ownerId : -1;

      let ud = this._undo[mesh.lib_id] = {
        object  : object_id,
        dataPath: mesh.meshDataPath,
        actives : {},
        data    : []
      };

      let data = ud.data;

      for (let elist of mesh.getElemLists()) {
        if (elist.active !== undefined) {
          ud.actives[elist.type] = elist.active.eid;
        } else {
          ud.actives[elist.type] = -1;
        }

        if (elist.type === MeshTypes.LOOP) {
          continue;
        }

        for (let e of elist) {
          if (e.flag & MeshFlags.SELECT) {
            data.push(e.eid);
          }
        }
      }
    }

    //we put this here to avoid polluting exec
    window.redraw_viewport();
  }

  undo(ctx) {
    if (this._undo.activeObject !== undefined) {
      let ob = ctx.datalib.get(this._undo.activeObject);

      ctx.scene.objects.setActive(ob);
    }

    for (let k in this._undo) {
      if (k === "activeObject") {
        continue;
      }

      let ud = this._undo[k];
      let mesh = ctx.api.getValue(ctx, ud.dataPath);
      //let mesh = ctx.datalib.get(k);

      if (mesh === undefined) {
        console.warn("Bad undo data", k);
        continue;
      }

      if (mesh instanceof SceneObject) {
        mesh = mesh.data;
      }

      mesh.selectNone();

      for (let elist of mesh.getElemLists()) {
        elist.active = mesh.eidmap[ud.actives[elist.type]];
      }

      for (let eid of ud.data) {
        let e = mesh.eidmap[eid];

        if (e === undefined) {
          console.warn("Bad eid in selectopbase undo", eid);
          continue;
        }

        if (!(e.flag & MeshFlags.SELECT)) {
          e.flag |= MeshFlags.UPDATE;
        }

        mesh.setSelect(e, true);
      }

      mesh.regenRender();
      window.redraw_viewport();
    }
  }
};

export class SelectLinkedOp extends SelectOpBase {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname     : "Select Linked (Mesh)",
      toolpath   : "mesh.select_linked",
      icon       : -1,
      description: "select linked elements",
      inputs     : ToolOp.inherit({})
    }
  }

  exec(ctx) {
    for (let mesh of this.getMeshes(ctx)) {
      let vs = new Set(mesh.verts.selected.editable);

      for (let e of mesh.edges.selected.editable) {
        vs.add(e.v1);
        vs.add(e.v2);
      }

      for (let f of mesh.faces.selected.editable) {
        for (let v of f.verts) {
          vs.add(v);
        }
      }

      let mode = this.inputs.mode.getValue();
      let selmask = this.inputs.selmask.getValue();

      let stack = [];
      let doneset = new WeakSet();

      mode = mode === SelToolModes.ADD;

      for (let v of vs) {
        if (doneset.has(v)) {
          continue;
        }

        this.selLinked(mesh, v, doneset, stack);
      }

      mesh.regenElementsDraw();
      mesh.regenRender();

      window.redraw_viewport(true);
    }
  }

  selLinked(mesh, v, doneset, stack) {
    let mode = this.inputs.mode.getValue();
    mode = mode === SelToolModes.ADD;

    doneset.add(v);

    stack.length = 0;
    stack.push(v);

    while (stack.length > 0) {
      let v2 = stack.pop();

      doneset.add(v2);

      if ((v2.flag & MeshFlags.SELECT) !== mode) {
        v2.flag |= MeshFlags.UPDATE;
      }
      mesh.verts.setSelect(v2, mode);

      for (let e of v2.edges) {
        if (!!(e.flag & MeshFlags.SELECT) !== mode) {
          e.flag |= MeshFlags.UPDATE;
        }

        mesh.edges.setSelect(e, mode);

        for (let l of e.loops) {
          if ((l.f.flag & MeshFlags.SELECT) !== mode) {
            l.f.flag |= MeshFlags.UPDATE;
          }
          mesh.faces.setSelect(l.f, mode);
        }

        let v3 = e.otherVertex(v2);
        if (!doneset.has(v3)) {
          stack.push(v3);
        }
      }
    }
  }
}

ToolOp.register(SelectLinkedOp);

export class SelectLinkedPickOp extends SelectLinkedOp {
  static tooldef() {
    return {
      uiname     : "Pick Select Linked (Mesh)",
      toolpath   : "mesh.pick_select_linked",
      icon       : -1,
      description: "select linked elements",
      inputs     : ToolOp.inherit({
        elemEid: new IntProperty(-1).private(),
        mesh   : new DataRefProperty("mesh")
      }),
      is_modal   : true
    }
  }

  modalStart(ctx) {
    super.modalStart(ctx);

    let view3d = ctx.view3d;
    if (!view3d) {
      this.modalEnd(true);
    }

    let ret = FindNearest(ctx, ctx.selectMask, view3d.last_mpos, view3d, 75);
    if (!ret || ret.length === 0) {
      this.modalEnd(true);
      return;
    }

    let ok = false;

    for (let item of ret) {
      if (item.data && Element.isElement(item.data)) {
        this.inputs.mesh.setValue(item.mesh);
        this.inputs.elemEid.setValue(item.data.eid);
        ok = true;
      }
    }

    console.log(ret, ok);

    this.modalEnd(!ok);

    if (ok) {
      this.exec(ctx);
    }
  }

  exec(ctx) {
    let mesh = ctx.datalib.get(this.inputs.mesh.getValue());

    if (!mesh) {
      ctx.error("mesh was bad");
      return;
    }

    let eid = this.inputs.elemEid.getValue();
    let elem = mesh.eidmap[eid];

    if (!elem) {
      ctx.error("eid was bad");
      return;
    }

    if (elem.type === MeshTypes.EDGE) {
      elem = elem.v1;
    } else if (elem.type === MeshTypes.FACE) {
      elem = elem.lists[0].l.v;
    } else if (elem.type !== MeshTypes.VERTEX) {
      ctx.error("got bad element", elem);
      return;
    }

    this.selLinked(mesh, elem, new WeakSet(), []);

    mesh.regenElementsDraw();
    mesh.regenRender();

    window.redraw_viewport(true);
  }
}

ToolOp.register(SelectLinkedPickOp);

export class SelectMoreLess extends SelectOpBase {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname     : "Select More/Less",
      toolpath   : "mesh.select_more_less",
      icon       : -1,
      description: "Grow or shrink selection along boundaries",
      inputs     : ToolOp.inherit({})
    }
  }

  exec(ctx) {
    let mode = this.inputs.mode.getValue();
    let selmask = this.inputs.selmask.getValue();

    mode = mode === SelToolModes.ADD;

    for (let mesh of this.getMeshes(ctx)) {
      let vset = new Set(mesh.verts.selected.editable);
      let eset = new Set(mesh.edges.selected.editable);
      let fset = new Set(mesh.faces.selected.editable);

      console.log("SELMASK", selmask);

      if (selmask & SelMask.VERTEX) {
        for (let v of vset) {
          if (mode) {
            for (let e of v.edges) {
              let v2 = e.otherVertex(v);
              mesh.verts.setSelect(v2, true);
            }
          } else {
            let ok = true;

            for (let e of v.edges) {
              let v2 = e.otherVertex(v);
              if (!vset.has(v2)) {
                ok = false
              }
            }

            if (!ok) {
              mesh.verts.setSelect(v, false);
            }
          }
        }
      }

      if (selmask & SelMask.EDGE) {
        for (let e of eset) {
          if (mode) {
            for (let i = 0; i < 2; i++) {
              let v = i ? e.v2 : e.v1;

              for (let e2 of v.edges) {
                mesh.edges.setSelect(e2, true);
              }
            }
          } else {
            let ok = true;

            let tot = 0;

            for (let i = 0; i < 2; i++) {
              let v = i ? e.v2 : e.v1;

              for (let e2 of v.edges) {
                tot++;

                if (!eset.has(e2)) {
                  ok = false;
                }
              }
            }

            ok = ok && tot > 1;
            if (!ok) {
              mesh.edges.setSelect(e, false);
            }
          }
        }
      }

      if (selmask & SelMask.FACE) {
        for (let f of fset) {
          if (mode) {
            for (let l of f.loops) {
              if (l.e.flag & MeshFlags.SEAM) {
                continue;
              }

              for (let l2 of l.e.loops) {
                if (l2.f === f) {
                  continue;
                }

                mesh.faces.setSelect(l2.f, true);
              }
            }
          } else {
            let ok = true;
            let tot = 0;

            for (let l of f.loops) {
              if (l.radial_next !== l) {
                tot++;
              }

              for (let l2 of l.e.loops) {
                if (!fset.has(l2.f)) {
                  ok = false;
                }
              }
            }

            if (!ok && tot > 0) {
              mesh.faces.setSelect(f, false);
            }
          }
        }
      }

      mesh.selectFlush(selmask);
      mesh.regenElementsDraw();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(SelectMoreLess);

export class SelectOneOp extends SelectOpBase {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname     : "Mesh Select",
      toolpath   : "mesh.selectone",
      icon       : -1,
      description: "select an element",
      inputs     : ToolOp.inherit({
        mode           : new EnumProperty(undefined, SelOneToolModes),
        setActiveObject: new BoolProperty(true),
        eid            : new IntProperty(-1).private()
      })
    }
  }

  exec(ctx) {
    let mesh = this.getMeshes(ctx)[0];

    let e = mesh.eidmap[this.inputs.eid.getValue()];

    if (e === undefined) {
      console.warn("invalid eid " + this.inputs.eid.getValue() + " in selectoneop.exec");
      return;
    }

    switch (this.inputs.mode.getValue()) {
      case SelOneToolModes.UNIQUE:
        mesh.selectNone();
        mesh.setSelect(e, true);
        mesh.setActive(e);
        break;
      case SelOneToolModes.ADD:
        mesh.setSelect(e, true);
        mesh.setActive(e);
        break;
      case SelOneToolModes.SUB:
        mesh.setSelect(e, false);
        break;
    }
    ;

    e.flag |= MeshFlags.UPDATE;

    mesh.selectFlush(this.inputs.selmask.getValue());
    mesh.regenRender();
  }
};
ToolOp.register(SelectOneOp);

export class ToggleSelectAll extends SelectOpBase {
  constructor() {
    super();
  }

  static invoke(ctx, args) {
    let ret = super.invoke(ctx, args);

    //ret.inputs.selmask.setValue(ctx.view3d.ctx.selectMask);
    ret.inputs.selmask.setValue(SelMask.VERTEX | SelMask.EDGE | SelMask.FACE);

    if ("mode" in args) {
      let mode = args.mode;

      if (typeof mode == "string") {
        mode = mode.toUpperCase();
      }

      ret.inputs.mode.setValue(mode)
    } else {
      ret.inputs.mode.setValue(SelToolModes.AUTO);
    }

    return ret;
  }

  static tooldef() {
    return {
      uiname     : "Toggle Select All",
      toolpath   : "mesh.toggle_select_all",
      icon       : Icons.TOGGLE_SEL_ALL,
      description: "toggle select all",
      inputs     : ToolOp.inherit({
        selmask: new FlagProperty(undefined, SelMask).private(),
        mode   : new EnumProperty(undefined, SelToolModes)
      })
    }
  }

  exec(ctx) {
    console.log("toggle select all!", this.inputs.mode.getValue(), this.inputs.selmask.getValue())
    let selmask = this.inputs.selmask.getValue();
    let mode = this.inputs.mode.getValue();

    for (let mesh of this.getMeshes(ctx)) {
      let mode2 = mode;

      if (mode === SelToolModes.AUTO) {
        mode2 = SelToolModes.ADD;

        for (let elist of mesh.getElemLists()) {
          if (!(elist.type & selmask)) {
            continue;
          }

          if (elist.selected.length > 0) {
            mode2 = SelToolModes.SUB;
          }
        }
      }

      console.log("mode2", mode2, SelToolModes);

      for (let elist of mesh.getElemLists()) {
        if (!(elist.type & selmask)) {
          continue;
        }

        for (let e of elist.editable) {
          elist.setSelect(e, mode2 === SelToolModes.ADD);
          e.flag |= MeshFlags.UPDATE;
        }
      }

      mesh.selectFlush(selmask);
      mesh.regenRender();
    }
  }
}

ToolOp.register(ToggleSelectAll);

export class SetFaceSmoothOp extends ToolOp {
  static tooldef() {
    return {
      uiname  : "Shade Smooth/Flat",
      toolpath: "mesh.set_smooth",
      inputs  : {
        set: new BoolProperty(true)
      }
    }
  }

  undoPre(ctx) {
    this._undo = {};

    let mesh = ctx.mesh;

    if (!mesh) {
      this._undo.mesh = undefined;
      return;
    }

    this._undo.mesh = mesh.lib_id;
    let data = this._undo.data = {};

    for (let f of mesh.faces.selected.editable) {
      data[f.eid] = f.flag;
    }
  }

  undo(ctx) {
    let ud = this._undo;
    let data = ud.data;
    let mesh = ud.mesh;

    if (mesh === undefined) {
      return;
    }

    mesh = ctx.datalib.get(mesh);

    if (mesh === undefined) {
      return;
    }

    for (let eid in data) {
      let f = mesh.eidmap[eid];

      if (!f || f.type !== MeshTypes.FACE) {
        console.warn("Undo reference error, missing face " + eid, f);
        continue;
      }

      let flag = data[eid];

      //ensure select is absolutely not modified
      f.flag = flag & ~MeshFlags.SELECT;
      f.flag |= MeshFlags.UPDATE;

      for (let v of f.verts) {
        v.flag |= MeshFlags.UPDATE;
      }
    }

    mesh.recalcNormals();
    mesh.regenRender();
    mesh.graphUpdate();
    mesh.regenElementsDraw();

    window.redraw_viewport();
  }

  exec(ctx) {
    let mesh = ctx.mesh;

    if (!mesh) {
      return;
    }

    let mode = this.inputs.set.getValue();
    for (let f of mesh.faces.selected.editable) {
      if (mode) {
        f.flag |= MeshFlags.SMOOTH_DRAW;
      } else {
        f.flag &= ~MeshFlags.SMOOTH_DRAW;
      }

      f.flag |= MeshFlags.UPDATE;
    }

    mesh.recalcNormals();
    mesh.regenRender();
    mesh.regenElementsDraw();
    mesh.graphUpdate();

    window.redraw_viewport();
  }
}

ToolOp.register(SetFaceSmoothOp);


export class SelectEdgeLoopOp extends SelectOpBase {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname     : "Edge Loop Select",
      toolpath   : "mesh.edgeloop_select",
      icon       : Icons.EDGELOOP,
      description: "Select edge loop",
      inputs     : ToolOp.inherit({
        selmask: new FlagProperty(undefined, SelMask).private(),
        mode   : new EnumProperty(undefined, SelOneToolModes),
        edgeEid: new IntProperty(-1)
      })
    }
  }

  exec(ctx) {
    let selmask = this.inputs.selmask.getValue();
    let mode = this.inputs.mode.getValue();

    let eid = this.inputs.edgeEid.getValue();

    let doBoundary = (mesh, e) => {
      for (let step=0; step<2; step++) {
        let visit = new WeakSet();
        let startv = step ? e.v2 : e.v1;
        let e2 = e;

        let v = startv;

        do {
          if (visit.has(v)) {
            break;
          }

          visit.add(v);
          mesh.setSelect(v, true);
          mesh.setSelect(e2, true);

          v = e2.otherVertex(v);

          let ok = false;

          for (let e3 of v.edges) {
            if (e3 !== e2 && (!e3.l || e3.l === e3.l.radial_next)) {
              e2 = e3;
              ok = true;
              break;
            }
          }

          if (!ok) {
            break;
          }
        } while (v !== startv);
      }
    }

    for (let mesh of this.getMeshes(ctx)) {
      let e = mesh.eidmap[eid];

      if (!e || e.type !== MeshTypes.EDGE || !e.l) {
        continue;
      }

      //boundary and already selected?
      if ((e.flag & MeshFlags.SELECT) && e.l && e.l === e.l.radial_next) {
        doBoundary(mesh, e);

        mesh.selectFlush(selmask);
        mesh.regenRender();
        continue;
      }

      let state = mode !== SelOneToolModes.SUB;
      if (mode === SelOneToolModes.UNIQUE) {
        mesh.edges.selectNone();
      }

      let startl = e.l;

      if (startl.v.edges.length !== 4) {
        startl = startl.radial_next;
      }

      let l = startl;
      let _i = 0;
      do {
        //break;
        if (_i++ > 1000000) {
          console.warn("Infinite loop detected");
          break;
        }

        if (l.v.edges.length !== 4) {
          break;
        }

        mesh.setSelect(l.e, state);

        if (l.next.v.edges.length !== 4) {
          break;
        }

        l = l.next;

        if (l.radial_next.v === l.v) {
          l = l.radial_next;
        } else {
          l = l.radial_next.next;
        }
      } while (l !== e.l);

      //now go backwards
      l = startl;
      do {
        if (_i++ > 1000000) {
          console.warn("Infinite loop detected");
          break;
        }

        mesh.setSelect(l.e, state);

        if (l.v.edges.length !== 4) {
          break;
        }
        l = l.prev;

        if (l.radial_next.v === l.v) {
          l = l.radial_next.next;
        } else {
          l = l.radial_next.prev;
        }
      } while (l !== e.l);

      mesh.selectFlush(selmask);
      mesh.regenRender();
    }
  }
}

ToolOp.register(SelectEdgeLoopOp);




export class SelectInverse extends SelectOpBase {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname     : "Select Inverse",
      toolpath   : "mesh.select_inverse",
      icon       : Icons.SELECT_INVERSE,
      description: "Invert selection",
      inputs     : ToolOp.inherit({
        selmask: new FlagProperty(undefined, SelMask).private(),
      })
    }
  }

  exec(ctx) {
    let selmask = this.inputs.selmask.getValue();

    for (let mesh of this.getMeshes(ctx)) {
      let elist;

      if (selmask & MeshTypes.FACE) {
        elist = mesh.faces;
      } else if (selmask & MeshTypes.EDGE) {
        elist = mesh.edges;
      } else if (selmask & MeshTypes.VERTEX) {
        elist = mesh.verts;
      }

      for (let e of elist.editable) {
        elist.setSelect(e, !(e.flag & MeshFlags.SELECT));
      }

      mesh.selectFlush(selmask);
      mesh.regenRender();
    }
  }
}

ToolOp.register(SelectInverse);

export class SelectNonManifold extends SelectOpBase {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname     : "Select Non-Manifold Edges",
      toolpath   : "mesh.select_non_manifold",
      icon       : -1,
      description: "select an element",
      inputs     : ToolOp.inherit({
        boundary : new BoolProperty(false),
        wire     : new BoolProperty(false)
      })
    }
  }

  exec(ctx) {
    for (let mesh of this.getMeshes(ctx)) {
      let selmask = this.inputs.selmask.getValue();
      let boundary = this.inputs.boundary.getValue();
      let wire = this.inputs.wire.getValue();

      for (let e of mesh.edges) {
        if (e.flag & MeshFlags.HIDE) {
          continue;
        }

        let ok = wire && !e.l;
        ok = ok || (boundary && e.l && e.l === e.l.radial_next);

        if (!ok) {
          let count = 0;

          for (let l of e.loops) {
            count++;
          }

          ok = count > 2;
        }

        if (ok) {
          mesh.edges.setSelect(e, true);
          e.flag |= MeshFlags.UPDATE;
        }
      }

      mesh.selectFlush(this.inputs.selmask.getValue());
      mesh.regenRender();
    }
  }
};
ToolOp.register(SelectNonManifold);


export class SelectShortestLoop extends SelectOpBase {
  constructor() {
    super();

    this.mode = true;

    //disable unused mode input
    this.inputs.mode.private();
  }

  static tooldef() {
    return {
      uiname  : "Select Shortest Loop",
      toolpath: "mesh.select_shortest_edgeloop",
      inputs  : ToolOp.inherit({
        everything : new BoolProperty(false)
          .saveLastValue()
          .setDescription("Process all possible edges (slower)"),
        edgeCount: new ReportProperty("0"),
        minEdges: new IntProperty(0)
          .saveLastValue()
          .setDescription("Minimum edge count, ignored if 0")
          .setRange(0, 100000)
          .setUIName("Min Count")
          .noUnits()
      })
    }
  }

  exec(ctx) {
    for (let mesh of this.getMeshes(ctx)) {
      let flag = MeshFlags.NOAPI_TEMP1;

      mesh.selectNone();

      let doAll = this.inputs.everything.getValue();

      for (let e of mesh.edges) {
        e.flag &= ~flag;
      }

      let loops = [];
      let minEdges = this.inputs.minEdges.getValue();

      for (let e of mesh.edges) {
        let ok = !(e.flag & flag);

        ok = ok && e.l;
        ok = ok && e.l.f.isQuad();
        ok = ok && e.loopCount < 3;
        ok = ok && e.l.radial_next.f.isQuad();

        if (!ok) {
          continue;
        }

        e.flag |= flag;

        let eloop = getEdgeLoop(e);

        if (minEdges > 0 && eloop.length < minEdges) {
          continue;
        }

        loops.push({e,  eloop});

        if (!doAll) {
          for (let e2 of eloop) {
            e2.flag |= flag;
          }
        }
      }

      let msg = "0";

      let sign = this.mode ? 1 : -1;

      loops.sort((a, b) => sign*(a.eloop.length - b.eloop.length));
      if (loops.length > 0) {
        let count = 0;

        for (let e of loops[0].eloop) {
          mesh.edges.setSelect(e, true);
          count++;
        }

        msg = "" + count;
        mesh.edges.setActive(loops[0].e);
      }

      this.inputs.edgeCount.setValue(msg);

      mesh.selectFlush(this.inputs.selmask.getValue());

      for (let e of mesh.edges.selected.editable) {
        e.flag |= MeshFlags.UPDATE;
        e.v1.flag |= MeshFlags.UPDATE;
        e.v2.flag |= MeshFlags.UPDATE;

        for (let l of e.loops) {
          l.f.flag |= MeshFlags.UPDATE;
        }
      }

      mesh.regenRender();
      mesh.recalcNormals();
      mesh.graphUpdate();
      window.redraw_viewport(true);
    }
  }
}

ToolOp.register(SelectShortestLoop);

export class SelectLongestLoop extends SelectShortestLoop {
  constructor() {
    super();

    this.mode = false;
  }

  static tooldef() {
    return {
      uiname  : "Select Longest Loop",
      toolpath: "mesh.select_longest_edgeloop",
      inputs : ToolOp.inherit({

      })
    }
  }
}
ToolOp.register(SelectLongestLoop);

let SimilarModes = {
  NUMBER_OF_EDGES : 0
};

export class SelectSimilarOp extends SelectOpBase {
  static tooldef() {return {
    uiname : "Select Similar",
    toolpath : "mesh.select_similar",
    inputs : ToolOp.inherit({
      mode : new EnumProperty(0, SimilarModes)
    })
  }}

  exec(ctx) {
    let mode = this.inputs.mode.getValue();

    let selmask = this.inputs.selmask.getValue();

    for (let mesh of this.getMeshes(ctx)) {
      let vs = new Set(mesh.verts.selected.editable);
      let hs = new Set(mesh.handles.selected.editable);
      let es = new Set(mesh.edges.selected.editable);
      let fs = new Set(mesh.faces.selected.editable);

      if (selmask & SelMask.FACE) {
        let counts = new Set();

        switch (mode) {
          case SimilarModes.NUMBER_OF_EDGES:
            for (let f of fs) {
              counts.add(f.length);
            }

            for (let f of mesh.faces) {
              if (f.flag & MeshFlags.HIDE) {
                continue;
              }

              if (counts.has(f.length)) {
                mesh.faces.setSelect(f, true);
              }
            }
            break;
        }
      } else if (selmask & SelMask.EDGE) {
        let counts = new Set();

        switch (mode) {
          case SimilarModes.NUMBER_OF_EDGES:
            for (let e of es) {
              let val1 = e.v1.valence, val2 = e.v2.valence;
              let key = "" + Math.min(val1, val2) + ":" + Math.max(val1, val2);
              counts.add(key);
            }

            for (let e of mesh.edges) {
              if (e.flag & MeshFlags.HIDE) {
                continue;
              }

              let val1 = e.v1.valence, val2 = e.v2.valence;
              let key = "" + Math.min(val1, val2) + ":" + Math.max(val1, val2);

              if (counts.has(key)) {
                mesh.edges.setSelect(e, true);
              }
            }
            break;
        }
      } else if (selmask & SelMask.VERTEX) {
        let counts = new Set();

        switch (mode) {
          case SimilarModes.NUMBER_OF_EDGES:
            for (let v of vs) {
              counts.add(v.valence);
            }
            for (let v of mesh.verts) {
              if (v.flag & MeshFlags.HIDE) {
                continue;
              }

              if (counts.has(v.valence)) {
                mesh.verts.setSelect(v, true)
              }
            }
            break;
        }
      }

      mesh.regenRender();
    }

    window.redraw_viewport(true);
  }
}
ToolOp.register(SelectSimilarOp);

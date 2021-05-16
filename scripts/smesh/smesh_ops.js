import * as util from '../util/util.js';
import {ToolOp, nstructjs, BoolProperty} from '../path.ux/pathux.js';
import {Vector3} from '../util/vectormath.js';
import {SMesh} from './smesh.js';
import {DataRefProperty} from '../core/lib_api.js';
import {SceneObject} from '../sceneobject/sceneobject.js';
import {makeCube} from '../core/mesh_shapes.js';

function saveUndoSMesh(mesh) {
  let data = [];
  nstructjs.writeObject(data, mesh);
  data = new Uint8Array(data);

  return new DataView(data.buffer);
}

function loadUndoSMesh(mesh, data) {
  let mesh2 = nstructjs.readObject(data, SMesh);

  mesh.swapDataBlockContents(mesh2);
  mesh.regenAll();
  mesh.graphUpdate();

  return mesh;
}

export class SMeshOpBase extends ToolOp {
  static tooldef() {
    return {
      inputs : {},
      outputs: {}
    }
  }

  getMeshes(ctx) {
    let smesh = ctx.smesh;

    if (smesh) {
      return [smesh];
    } else {
      return [];
    }
  }

  calcUndoMem(ctx) {
    if (!this._undo) {
      return 0;
    }

    let tot = 0;

    for (let k in this._undo) {
      tot += this._undo[k].buffer.byteLength;
    }

    return tot;
  }

  undoPre(ctx) {
    let undo = this._undo = {};

    for (let mesh of this.getMeshes(ctx)) {
      undo[mesh.lib_id] = saveUndoSMesh(mesh);
    }
  }

  undo(ctx) {
    if (!this._undo) {
      return;
    }

    for (let k in this._undo) {
      let id = parseInt(k);
      let mesh = ctx.datalib.get(id);

      if (!mesh || !(mesh instanceof SMesh)) {
        console.warn("Missing smesh " + k);
        continue;
      }

      loadUndoSMesh(mesh, this._undo[k]);
    }

    window.redraw_viewport(true);
  }

  execPost(ctx) {
    let ob = ctx.object;
    if (ob) {
      ob.graphUpdate();
    }

    for (let mesh of this.getMeshes(ctx)) {
      mesh.graphUpdate();
      mesh.regenRender();
    }

    window.redraw_viewport(true);
    window.updateDataGraph();
  }
}


export class SMeshCreateOp extends ToolOp {
  static tooldef() {
    return {
      inputs: {
        newObject: new BoolProperty(true)
      },

      outputs: {
        newObject: new DataRefProperty(SceneObject)
      }
    }
  }

  calcUndoMem(ctx) {
    if (!this._undo) {
      return 0;
    }

    if (this._undo.makenew) {
      //just estimate
      return 512;
    } else {
      let data = this._undo.smesh;

      if (data) {
        return data.buffer.byteLength;
      }
    }

    return 0;
  }

  undo(ctx) {
    if (!this._undo) {
      return;
    }

    let undo = this._undo;

    if (undo.makenew) {
      let ob = undo.newObject;
      if (ob === undefined) {
        return;
      }

      ob = ctx.datalib.get(ob);
      if (!ob) {
        ctx.error("Undo error");
        return;
      }

      ctx.scene.remove(ob);

      ob.data.lib_remUser(ob);

      ctx.datalib.remove(ob.data);
      ctx.datalib.remove(ob);

      ctx.datalib.idgen = undo.idgen.copy();

      for (let sel of undo.sel) {
        sel = ctx.datalib.get(sel);

        if (sel) {
          ctx.scene.objects.setSelect(sel, true);
        }
      }

      let act = ctx.datalib.get(undo.active);
      let high = ctx.datalib.get(undo.highlight);

      if (act) {
        ctx.scene.objects.setActive(act);
        act.graphUpdate();
      }

      if (high) {
        ctx.scene.objects.setHighlight(high);
        high.graphUpdate();
      }
    } else {
      let data = undo.smesh;
      let smesh = ctx.smesh;

      if (!smesh || !data) {
        ctx.error("undo error");
        return;
      }

      loadUndoSMesh(smesh, data);

      smesh.graphUpdate();
      smesh.regenAll();
    }

    window.redraw_viewport(true);
  }

  undoPre(ctx) {
    this._undo = {};

    let makenew = this.inputs.newObject.getValue();

    this._undo.makenew = makenew;
    if (makenew) {
      this._undo.idgen = ctx.datalib.idgen.copy();

      this._undo.sel = [];
      let sel = this._undo.sel;

      for (let ob of ctx.scene.objects.selected) {
        sel.push(ob.lib_id);
      }

      this._undo.active = ctx.scene.objects.active ? ctx.scene.objects.active.lib_id : -1;
      this._undo.highlight = ctx.scene.objects.highlight ? ctx.scene.objects.highlight.lib_id : -1;
    } else {
      let smesh = ctx.smesh;

      if (smesh) {
        this._undo.smesh = saveUndoSMesh(smesh);
      }

    }
  }

  exec(ctx) {
    let ob;
    let scene = ctx.scene;
    let smesh;

    if (this.inputs.newObject.getValue()) {
      scene.objects.clearSelection();

      ob = new SceneObject();
      smesh = new SMesh();

      ctx.datalib.add(ob);
      ctx.datalib.add(smesh);

      smesh.lib_addUser(ob);
      ob.data = smesh;

      scene.add(ob);
      scene.objects.setSelect(ob, true);
      scene.objects.setActive(ob, true);

      ob.graphUpdate();

      if (this._undo) {
        this._undo.newObject = ob.lib_id;
      }
      this.outputs.newObject.setValue(ob);
    } else {
      smesh = ctx.smesh;
      if (!smesh) {
        ctx.error("Need smesh");
        return;
      }
    }

    this.internalCreate(ctx, smesh);

    smesh.graphUpdate();
    smesh.regenAll();
    smesh.recalcNormals();

    window.redraw_viewport(true);
    window.updateDataGraph();
  }

  internalCreate(ctx, smesh) {
    console.error("Implement me!");
  }
}

export class MakeSCubeOp extends SMeshCreateOp {
  static tooldef() {
    return {
      uiname  : "Make Cube (SMesh)",
      toolpath: "smesh.make_cube",
      inputs  : ToolOp.inherit(),
      outputs : ToolOp.inherit()
    }
  }

  internalCreate(ctx, smesh) {
    let cube = makeCube().mesh;

    let vi = 0;
    for (let v of cube.verts) {
      v.index = vi++;

      smesh.makeVertex(v);
    }

    for (let f of cube.faces) {
      let vs = [];

      for (let v of f.verts) {
        vs.push(v.index);
      }

      smesh.makeFace(vs);
    }
  }
}
ToolOp.register(MakeSCubeOp);


import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import {
  math, nstructjs, ToolOp, StringProperty, Vec3Property, Vec2Property, Vec4Property,
  EnumProperty, FlagProperty, FloatProperty, BoolProperty, IntProperty, eventWasTouch
} from '../path.ux/scripts/pathux.js';
import * as util from '../util/util.js';
import {MeshTypes, MeshFlags} from './mesh_base.js';
import {View3DOp} from '../editors/view3d/view3d_ops.js';
import {MeshOp} from './mesh_ops_base.js';


export class MeshOpBaseUV extends MeshOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      inputs: ToolOp.inherit({
        selectedFacesOnly: new BoolProperty()
      })
    }
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if (!("selectedFacesOnly" in args)) {
      let uve = ctx.editors.imageEditor;
      if (uve) {
        uve = uve.uvEditor;

        tool.inputs.selectedFacesOnly.setValue(uve.selectedFacesOnly);
      }
    }

    return tool;
  }

  getFaces(ctx) {
    let mesh = ctx.mesh;

    if (!mesh) {
      return [];
    }

    let selFsOnly = this.inputs.selectedFacesOnly.getValue();
    return selFsOnly ? mesh.faces.selected.editable : mesh.faces.editable;
  }

  getLoops(ctx, selOnly=false) {
    let selFsOnly = this.inputs.selectedFacesOnly.getValue();
    let mesh = ctx.mesh;

    if (!mesh) {
      return [];
    }

    let iter = selFsOnly ? mesh.faces.selected.editable : mesh.faces.editable;
    let ret = new Set();

    for (let f of iter) {
      for (let l of f.loops) {
        if (l.flag & MeshFlags.HIDE) {
          continue;
        }

        if (selOnly && !(l.flag & MeshFlags.SELECT)) {
          continue;
        }

        ret.add(l);
      }
    }

    return ret;
  }
}

export class UnwrapOpBase extends MeshOpBaseUV {
  execPre(ctx) {
    super.execPre(ctx);

    let mesh = ctx.mesh;

    if (!mesh) {
      return;
    }

    if (!mesh.loops.customData.hasLayer("uv")) {
      mesh.loops.addCustomDataLayer("uv");
    }
  }
}

export class UVOpBase extends View3DOp {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      inputs: ToolOp.inherit({
        selectedFacesOnly: new BoolProperty()
      })
    }
  }

  static invoke(ctx, args) {
    let tool = super.invoke(ctx, args);

    if (!("selectedFacesOnly" in args)) {
      let uve = ctx.editors.imageEditor;
      if (uve) {
        uve = uve.uvEditor;

        tool.inputs.selectedFacesOnly.setValue(uve.selectedFacesOnly);
      }
    }

    return tool;
  }

  getLoops(ctx, selOnly=false) {
    let selFsOnly = this.inputs.selectedFacesOnly.getValue();
    let mesh = ctx.mesh;

    if (!mesh) {
      return [];
    }

    let iter = selFsOnly ? mesh.faces.selected.editable : mesh.faces.editable;
    let ret = new Set();

    for (let f of iter) {
      for (let l of f.loops) {
        if (l.flag & MeshFlags.HIDE) {
          continue;
        }

        if (selOnly && !(l.flag & MeshFlags.SELECT)) {
          continue;
        }

        ret.add(l);
      }
    }

    return ret;
  }
}


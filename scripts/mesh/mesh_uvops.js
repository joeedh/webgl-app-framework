import {MeshOpBaseUV, UnwrapOpBase} from './mesh_uvops_base.js';
import {BoolProperty, FloatProperty, IntProperty, ToolOp, Vector2} from '../path.ux/pathux.js';
import {UVWrangler, voxelUnwrap} from './unwrapping.js';
import * as util from '../util/util.js';
import {fixSeams, relaxUVs, UnWrapSolver} from './unwrapping_solve.js';
import {MeshOp} from './mesh_ops_base.js';
import {MeshFlags} from './mesh_base.js';
import {Face} from './mesh_types.js';
import {AttrRef} from './customdata.js';

export class VoxelUnwrapOp extends UnwrapOpBase {
  static tooldef() {
    return {
      uiname  : "Voxel Unwrap",
      toolpath: "mesh.voxel_unwrap",
      icon    : -1,
      inputs  : ToolOp.inherit({
        setSeams  : new BoolProperty(true),
        leafLimit : new IntProperty(255).setRange(1, 1024).noUnits().saveLastValue(),
        depthLimit: new IntProperty(25).setRange(0, 75).noUnits().saveLastValue(),
        splitVar  : new FloatProperty(0.16).setRange(0.0, 5.0).noUnits().saveLastValue()
      }),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.voxel_unwrap");

    let setSeams = this.inputs.setSeams.getValue();
    let leafLimit = this.inputs.leafLimit.getValue();
    let depthLimit = this.inputs.depthLimit.getValue();
    let splitVar = this.inputs.splitVar.getValue();

    for (let mesh of this.getMeshes(ctx)) {
      voxelUnwrap(mesh, mesh.faces.selected.editable, undefined,
        setSeams, leafLimit, depthLimit, splitVar);

      mesh.regenBVH();
      mesh.regenTessellation();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(VoxelUnwrapOp);


export class RandomizeUVsOp extends MeshOpBaseUV {
  static tooldef() {
    return {
      uiname  : "Randomize UVs",
      toolpath: "mesh.randomize_uvs",
      icon    : -1,
      inputs  : ToolOp.inherit({
        setSeams: new BoolProperty(true),
        randAll : new BoolProperty(false)
      }),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.randomize_uvs");


    for (let mesh of this.getMeshes(ctx)) {
      let cd_uv = mesh.loops.customData.getLayerIndex("uv");
      if (cd_uv < 0) {
        continue;
      }

      let scale = 0.1;

      let randAll = this.inputs.randAll.getValue();
      if (randAll) {
        for (let l of mesh.loops) {
          let uv = l.customData[cd_uv].uv;

          uv[0] += (Math.random() - 0.5)*scale;
          uv[1] += (Math.random() - 0.5)*scale;
        }
        continue;
      }

      let wr = new UVWrangler(mesh, this.getFaces(ctx), new AttrRef(cd_uv));
      wr.buildIslands();

      for (let island of wr.islands) {
        //scale = Math.min(island.boxsize[0], island.boxsize[1]) + 0.1;
        let newmin = new Vector2(island.min);
        newmin.fract();

        for (let v of island) {
          if (isNaN(v.co[0]) || isNaN(v.co[1])) {
            v.co[0] = Math.random();
            v.co[1] = Math.random();
          }

          v.co[0] += (Math.random() - 0.5)*scale;
          v.co[1] += (Math.random() - 0.5)*scale;

          //v.sub(island.min).add(newmin);
          v.co[2] = 0.0;
        }
      }

      //wr.packIslands();
      wr.finish();

      mesh.regenBVH();
      mesh.regenTessellation();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    window.redraw_viewport();
  }
}

ToolOp.register(RandomizeUVsOp);

let unwrap_solvers = window._unwrap_solvers = new Map();
unwrap_solvers.clear = function () {
  for (let k of new Set(unwrap_solvers.keys())) {
    unwrap_solvers.delete(k);
  }
}

export function resetUnwrapSolvers() {
  unwrap_solvers = window._unwrap_solvers = new Map();
}

export class UnwrapSolveOp extends UnwrapOpBase {
  static tooldef() {
    return {
      uiname  : "Unwrap Solve",
      toolpath: "mesh.unwrap_solve",
      icon    : -1,
      inputs  : ToolOp.inherit({
        preserveIslands: new BoolProperty(false).saveLastValue(),
        enableSolve    : new BoolProperty(true).saveLastValue(),
        reset          : new BoolProperty(),
        solverWeight   : new FloatProperty(0.4).noUnits().setRange(0.0, 1.0).saveLastValue(),
      }),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.unwrap_solve");

    let i = 0;
    let meshes = new Set(this.getMeshes(ctx));

    if (unwrap_solvers.size > 5) {
      unwrap_solvers = new Map();
    }

    let preserveIslands = this.inputs.preserveIslands.getValue();

    let time = util.time_ms();
    for (let mesh of meshes) {
      let faces = mesh.faces.selected.editable;

      /* not working
      let faces2 = new Set();
      for (let f of faces) {
        for (let l of f.loops) {
          if ((l.flag & MeshFlags.SELECT) && !(l.flag & MeshFlags.HIDE)) {
            faces2.add(f);
            break;
          }
        }
      }*/

      let solver;

      if (this.inputs.enableSolve.getValue() && !this.inputs.reset.getValue()) {
        solver = UnWrapSolver.restoreOrRebuild(mesh, faces, unwrap_solvers.get(mesh.lib_id),
          undefined, preserveIslands, false);
      } else {
        solver = new UnWrapSolver(mesh, faces, mesh.loops.customData.getLayerIndex("uv"));
        solver.start();
      }

      let w = this.inputs.solverWeight.getValue();

      if (this.inputs.enableSolve.getValue()) {
        while (util.time_ms() - time < 400) {
          solver.step(undefined, w);
        }
      }

      solver.finish();

      unwrap_solvers.set(mesh.lib_id, solver.save())

      mesh.regenBVH();
      mesh.regenUVEditor();
      mesh.regenRender();
      mesh.regenElementsDraw();
      mesh.graphUpdate();
    }

    console.log("unwrap_solvers:", unwrap_solvers);

    window.redraw_viewport();
  }
}

ToolOp.register(UnwrapSolveOp)

export class RelaxUVsOp extends MeshOpBaseUV {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname  : "Relax UVs",
      toolpath: "mesh.relax_uvs",
      icon    : -1,
      inputs  : ToolOp.inherit({
        doSolve     : new BoolProperty(true).saveLastValue(),
        steps       : new IntProperty(1).saveLastValue().setRange(1, 55).noUnits(),
        useSeams    : new BoolProperty().saveLastValue(),
        solverWeight: new FloatProperty(0.4).noUnits().setRange(0.0, 1.0).saveLastValue(),
      }),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.relax_uvs");

    for (let mesh of this.getMeshes(ctx)) {
      let cd_uv = mesh.loops.customData.getLayerIndex("uv");

      if (cd_uv >= 0) {
        let steps = this.inputs.steps.getValue();

        for (let i = 0; i < steps; i++) {
          if (this.inputs.doSolve.getValue()) {
            let faces = mesh.faces.selected.editable;
            let solver = UnWrapSolver.restoreOrRebuild(mesh, faces, unwrap_solvers.get(mesh.lib_id), undefined, true);
            //let solver = new UnWrapSolver(mesh, faces, cd_uv, true);
            solver.step(undefined, this.inputs.solverWeight.getValue());
            solver.finish();

            unwrap_solvers.set(mesh.lib_id, solver.save())
          }

          relaxUVs(mesh, cd_uv, this.getLoops(ctx), false, undefined, this.inputs.useSeams.getValue());
        }

        /*
        let wr = new UVWrangler(mesh, mesh.faces);

        wr.buildIslands();
        wr.packIslands();
        wr.finish();
         */

        mesh.regenBVH();
        mesh.regenUVEditor();
        mesh.regenRender();
        mesh.regenElementsDraw();
        mesh.graphUpdate();
      }
    }

    window.redraw_viewport();
  }
}

ToolOp.register(RelaxUVsOp)

export class FixUvSeamsOp extends MeshOpBaseUV {
  constructor() {
    super();
  }

  static tooldef() {
    return {
      uiname  : "Fix Seams",
      toolpath: "mesh.fix_seams",
      icon    : -1,
      inputs  : ToolOp.inherit({}),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.fix_seams");


    for (let mesh of this.getMeshes(ctx)) {
      let cd_uv = mesh.loops.customData.getLayerIndex("uv");

      if (cd_uv >= 0) {
        fixSeams(mesh, cd_uv);

        mesh.regenBVH();
        mesh.regenUVEditor();
        mesh.regenRender();
        mesh.regenElementsDraw();
        mesh.graphUpdate();
      }
    }

    window.redraw_viewport();
  }
}

ToolOp.register(FixUvSeamsOp)

export class ResetUVs extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Reset UVs",
      toolpath: "mesh.reset_uvs",
      icon    : -1,
      inputs  : ToolOp.inherit({}),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.relax_uvs");


    for (let mesh of this.getMeshes(ctx)) {
      let cd_uv = mesh.loops.customData.getLayerIndex("uv");

      if (cd_uv >= 0) {
        for (let f of mesh.faces.selected.editable) {
          for (let list of f.lists) {
            let count = 0;
            for (let l of list) {
              count++;
            }

            let l = list.l;

            l.f.flag |= MeshFlags.UPDATE;

            l.customData[cd_uv].uv.loadXY(0, 0);
            l.next.customData[cd_uv].uv.loadXY(0, 1);
            l.next.next.customData[cd_uv].uv.loadXY(1, 1);

            if (count === 4) {
              l.prev.customData[cd_uv].uv.loadXY(1, 0);
            }
          }
        }

        /*
        let wr = new UVWrangler(mesh, mesh.faces);

        wr.buildIslands();
        wr.packIslands();
        wr.finish();
         */

        mesh.regenBVH();
        mesh.regenUVEditor();
        mesh.regenRender();
        mesh.regenElementsDraw();
        mesh.graphUpdate();
      }
    }

    window.redraw_viewport();
  }
}

ToolOp.register(ResetUVs)


export class GridUVs extends MeshOp {
  static tooldef() {
    return {
      uiname  : "Grid UVs",
      toolpath: "mesh.grid_uvs",
      icon    : -1,
      inputs  : ToolOp.inherit({}),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.grid_uvs");


    for (let mesh of this.getMeshes(ctx)) {
      let cd_uv = mesh.loops.customData.getLayerIndex("uv");

      if (cd_uv >= 0) {
        let i = 0;
        let count = 0;

        for (let f of mesh.faces.selected.editable) {
          for (let list of f.lists) {
            for (let l of list) {
              //if ((l.flag & MeshFlags.SELECT) && !(l.flag & MeshFlags.HIDE)) {
              count++;
              //}
            }
          }
        }

        let dimen = Math.ceil(Math.sqrt(count*0.25));
        let idimen = 1.0/dimen;

        for (let f of mesh.faces.selected.editable) {
          for (let list of f.lists) {
            let count = 0;
            for (let l of list) {
              count++;
            }

            let l = list.l;

            l.f.flag |= MeshFlags.UPDATE;

            let x = i%dimen, y = ~~(i/dimen);
            x *= idimen;
            y *= idimen;

            let pad = idimen*0.025;

            l.customData[cd_uv].uv.loadXY(x + pad, y + pad);
            l.next.customData[cd_uv].uv.loadXY(x + pad, y + idimen - pad*2.0);
            l.next.next.customData[cd_uv].uv.loadXY(x + idimen - pad*2.0, y + idimen - pad*2.0);

            if (count === 4) {
              l.prev.customData[cd_uv].uv.loadXY(x + idimen - pad*2.0, y + pad);
            }

            i++;
          }

          let off = new Vector2().loadXY(Math.random(), Math.random());

          for (let l of f.loops) {
            // l.customData[cd_uv].uv.add(off);
          }
        }

        /*
        let wr = new UVWrangler(mesh, mesh.faces);

        wr.buildIslands();
        wr.packIslands();
        wr.finish();
        // */

        mesh.regenBVH();
        mesh.regenUVEditor();
        mesh.regenRender();
        mesh.regenElementsDraw();
        mesh.graphUpdate();
      }
    }

    window.redraw_viewport();
  }
}

ToolOp.register(GridUVs)


export class PackIslandsOp extends MeshOpBaseUV {
  static tooldef() {
    return {
      uiname  : "Pack UVs",
      toolpath: "mesh.pack_uvs",
      icon    : -1,
      inputs  : ToolOp.inherit({}),
      outputs : ToolOp.inherit()
    }
  }

  exec(ctx) {
    console.warn("mesh.pack_uvs");


    for (let mesh of this.getMeshes(ctx)) {
      let cd_uv = mesh.loops.customData.getLayerIndex("uv");

      if (cd_uv >= 0) {
        let iter = this.inputs.selectedFacesOnly.getValue() ? mesh.faces.selected.editable : mesh.faces;

        let wr = new UVWrangler(mesh, iter);

        wr.buildIslands();
        wr.packIslands();
        wr.finish();

        mesh.regenBVH();
        mesh.regenUVEditor();
        mesh.regenRender();
        mesh.regenElementsDraw();
        mesh.graphUpdate();
      }
    }

    window.redraw_viewport();
  }
}

ToolOp.register(PackIslandsOp)

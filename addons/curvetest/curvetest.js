import {calcCurvMesh} from '../../scripts/mesh/mesh_curvature_test.js';
import {SmoothMemoizer} from '../../scripts/mesh/mesh_displacement.js';
import {makeCurvToolMode} from './curvaturetool.js';

let _api;

export const addonDefine = {
  name: "Curvature Tester"
};

function makeColors(mesh, colorMode, scale) {
  let cd_curvt = mesh.verts.customData.getLayerIndex("curvetest");
  let maxdis = -1e17;

  for (let v of mesh.verts) {
    let pv = v.customData[cd_curvt];

    maxdis = Math.max(maxdis, pv.k);
  }

  let cd_vcol = mesh.verts.customData.getLayerIndex("color");
  maxdis = Math.max(maxdis, 0.00001);

  for (let v of mesh.verts) {
    if (cd_vcol < 0) {
      break;
    }

    let col = v.customData[cd_vcol].color;
    let pv = v.customData[cd_curvt];

    let dis = pv.k/maxdis;

    if (colorMode) {
      dis *= scale*0.3;

      col[0] = Math.tent(dis*3.0);
      col[1] = Math.tent(dis*4.0);
      col[2] = Math.tent(dis*5.0);
    } else {
      col[0] = col[1] = col[2] = Math.fract(dis*scale);
    }

    col[3] = 1.0;

    v.flag |= _api.mesh.MeshFlags.UPDATE;
  }
}

export function register(api) {
  _api = api;
  let mesh_curvature_test = api.mesh.curvature_test;

  api.curvetest = makeCurvToolMode(api);

  let ToolOp = api.toolop.ToolOp;
  let MeshFlags = api.mesh.MeshFlags;
  let DrawFlags = api.curvetest.DrawFlags;

  class CurvTestOp extends api.toolop.MeshOp {
    static tooldef() {
      return {
        uiname  : "Curvature Test",
        toolpath: "curvetool.test",
        inputs  : ToolOp.inherit({
          drawFlag : new api.toolop.FlagProperty(0, DrawFlags).saveLastValue(),
          drawScale: new api.toolop.FloatProperty(5).noUnits().setRange(0.1, 25.0),
        }),
        outputs : ToolOp.inherit({})
      }
    }

    static invoke(ctx, args) {
      let tool = super.invoke(ctx, args);

      let toolmode = ctx.toolmode;

      if (toolmode.constructor.toolModeDefine().name === "curvetest") {
        tool.inputs.drawFlag.setValue(toolmode.drawFlag);
        tool.inputs.drawScale.setValue(toolmode.drawScale);
      }

      return tool;
    }

    exec(ctx) {
      for (let mesh of this.getMeshes(ctx)) {
        for (let v of mesh.verts) {
          v.flag |= MeshFlags.UPDATE;
        }

        mesh_curvature_test.calcCurvMesh(mesh, undefined);

        let scale = this.inputs.drawScale.getValue();
        makeColors(mesh, this.inputs.drawFlag.getValue() & DrawFlags.COLOR, scale);

        mesh.regenRender();
        mesh.graphUpdate();
        window.redraw_viewport(true);
      }
    }
  }

  api.register(CurvTestOp);

  class SmoothParamTansOp extends api.toolop.MeshOp {
    static tooldef() {
      return {
        uiname  : "Smooth Tangents",
        toolpath: "curvetool.smooth",
        inputs  : ToolOp.inherit({
          drawFlag : new api.toolop.FlagProperty(0, DrawFlags).saveLastValue(),
          drawScale: new api.toolop.FloatProperty(5).noUnits().setRange(0.1, 25.0).saveLastValue()
        }),
        outputs : ToolOp.inherit({})
      }
    }

    static invoke(ctx, args) {
      let tool = super.invoke(ctx, args);

      let toolmode = ctx.toolmode;

      if (toolmode.constructor.toolModeDefine().name === "curvetest") {
        tool.inputs.drawFlag.setValue(toolmode.drawFlag);
        tool.inputs.drawScale.setValue(toolmode.drawScale);
      }

      return tool;
    }

    exec(ctx) {
      for (let mesh of this.getMeshes(ctx)) {
        for (let v of mesh.verts) {
          v.flag |= MeshFlags.UPDATE;
        }

        mesh_curvature_test.smoothParam(mesh);

        let scale = this.inputs.drawScale.getValue();
        makeColors(mesh, this.inputs.drawFlag.getValue() & DrawFlags.COLOR, scale);

        mesh.regenRender();
        mesh.graphUpdate();
        window.redraw_viewport(true);
      }
    }
  }

  api.register(SmoothParamTansOp);
}

export function unregister(api) {

}


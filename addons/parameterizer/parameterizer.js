import {makeParamToolMode} from './paramtool.js';

let _api;

export const addonDefine = {
  name: "Parameterizer"
};

export function register(api) {
  _api = api;
  let mesh_paramizer = api.mesh.paramizer;

  api.paramtool = makeParamToolMode(api);

  let ToolOp = api.toolop.ToolOp;
  let MeshFlags = api.mesh.MeshFlags;
  let DrawModes = api.paramtool.DrawModes;
  let DrawFlags = api.paramtool.DrawFlags;

  class ParamizeMeshOp extends api.toolop.MeshOp {
    static tooldef() {
      return {
        uiname  : "Parameterize",
        toolpath: "paramize.test",
        inputs  : ToolOp.inherit({
          drawMode : new api.toolop.EnumProperty(DrawModes.GEODESIC, DrawModes).saveLastValue(),
          drawFlag : new api.toolop.FlagProperty(0, DrawFlags).saveLastValue(),
          drawScale : new api.toolop.FloatProperty(5).noUnits().setRange(0.1, 25.0)
        }),
        outputs : ToolOp.inherit({})
      }
    }

    static invoke(ctx, args) {
      let tool = super.invoke(ctx, args);

      let toolmode = ctx.toolmode;

      console.error(toolmode instanceof api.paramtool.ParamToolMode, "toolmode");
      console.log(toolmode);

      if (toolmode.constructor.toolModeDefine().name === "paramtool") {
        tool.inputs.drawMode.setValue(toolmode.drawMode);
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

        mesh_paramizer.paramizeMesh(mesh);
        let cd_pvert = mesh.verts.customData.getLayerIndex("paramvert");
        let maxdis = -1e17;
        let scale = this.inputs.drawScale.getValue();

        for (let v of mesh.verts) {
          let pv = v.customData[cd_pvert];

          maxdis = Math.max(maxdis, pv.disUV[0]);
        }

        let cd_vcol = mesh.verts.customData.getLayerIndex("color");
        maxdis = Math.max(maxdis, 0.00001);

        for (let v of mesh.verts) {
          if (cd_vcol < 0) {
            break;
          }

          let col = v.customData[cd_vcol].color;
          let pv = v.customData[cd_pvert];

          let dis = pv.disUV[0] / maxdis;

          if (this.inputs.drawFlag.getValue() & DrawFlags.COLOR) {
            dis *= scale*0.3;

            col[0] = Math.tent(dis*3.0);
            col[1] = Math.tent(dis*4.0);
            col[2] = Math.tent(dis*5.0);
          } else {
            col[0] = col[1] = col[2] = Math.fract(dis*scale);
          }
          col[3] = 1.0;

          v.flag |= MeshFlags.UPDATE;
        }
        mesh.regenRender();
        mesh.graphUpdate();
        window.redraw_viewport(true);
      }
    }
  }
  api.register(ParamizeMeshOp);


  class SmoothParamTansOp extends api.toolop.MeshOp {
    static tooldef() {
      return {
        uiname  : "Smooth Tangents",
        toolpath: "paramize.smooth",
        inputs  : ToolOp.inherit({
          drawMode : new api.toolop.EnumProperty(DrawModes.GEODESIC, DrawModes).saveLastValue(),
          drawFlag : new api.toolop.FlagProperty(0, DrawFlags).saveLastValue(),
          drawScale : new api.toolop.FloatProperty(5).noUnits().setRange(0.1, 25.0)
        }),
        outputs : ToolOp.inherit({})
      }
    }

    static invoke(ctx, args) {
      let tool = super.invoke(ctx, args);

      let toolmode = ctx.toolmode;

      console.error(toolmode instanceof api.paramtool.ParamToolMode, "toolmode");
      console.log(toolmode);

      if (toolmode.constructor.toolModeDefine().name === "paramtool") {
        tool.inputs.drawMode.setValue(toolmode.drawMode);
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

        mesh_paramizer.smoothParam(mesh);

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


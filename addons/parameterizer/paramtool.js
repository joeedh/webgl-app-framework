import {Shaders} from '../../scripts/shaders/shaders.js';
import {PrimitiveTypes} from '../../scripts/core/simplemesh.js';

export function makeParamToolMode(api) {
  let exports = {};

  let DrawModes = exports.DrawModes = {
    GEODESIC      : 0,
    UV            : 1
  }

  let DrawFlags = exports.DrawFlags = {
    COLOR : 1
  };

  let ParamVert = api.mesh.paramizer.ParamVert;
  let {LayerTypes, PrimitiveTypes, SimpleMesh} = api.simplemesh;

  let ParamToolMode = exports.ParamToolMode = class ParamToolMode extends api.toolmode.MeshToolBase {
    constructor() {
      super();

      this.selectMask = api.SelMask.VERTEX;
      this.vertexPointSize = 3;

      this.paramMesh = undefined;
      this.drawMode = DrawModes.GEODESIC;
      this.drawFlag = 0;
      this.drawScale = 20.0;
      this.drawVerts = true;

      let _last_pmesh_key = '';
    }

    static defineAPI(api) {
      let st = super.defineAPI(api);

      st.enum("drawMode", "drawMode", DrawModes, "Draw Mode");
      st.flags("drawFlag", "drawFlag", DrawFlags, "Draw Flags");
      st.float("drawScale", "drawScale", "Scale").noUnits().range(0.1, 25.0);
      st.bool("drawVerts", "drawVerts", "Draw Verts");


      return st;
    }

    static buildHeader(header, addRow) {
      let row = addRow();

      let strip = row.strip();
      strip.useIcons(false);

      strip.tool("paramize.test()");
      strip.prop("scene.tool.drawVerts");
    }

    static buildSettings(con) {
      let panel = con.panel("Tools");

      panel.toolPanel("mesh.test_disp_smooth()");

      let strip = panel.strip();
      strip.useIcons(false);
      strip.tool("paramize.test()");
      strip.tool("paramize.smooth()");

      strip = panel.strip();
      strip.prop("scene.tool.drawMode");
      strip.prop("scene.tool.drawFlag");

      panel.prop("scene.tool.drawScale");
      panel.prop("scene.tool.drawVerts");

      panel = con.panel("Settings");
      panel.prop("mesh.vertsData.paramvert.settings.smoothTangents");
      panel.prop("mesh.vertsData.paramvert.settings.weightMode");
    }

    updateParamMesh(gl) {
      if (!this.mesh) {
        return;
      }

      let mesh = this.mesh;
      let cd_pvert = mesh.verts.customData.getLayerIndex("paramvert");

      let key = "" + mesh.lib_id + ":" + mesh.updateGen + ":" + cd_pvert;

      if (this.paramMesh && key === this._last_pmesh_key) {
        return;
      }

      this._last_pmesh_key = key;

      if (this.paramMesh) {
        this.paramMesh.destroy(gl);
      }

      let lf = LayerTypes;
      let lflag = lf.LOC | lf.COLOR | lf.UV;

      let sm = this.paramMesh = new SimpleMesh(lflag);
      sm.primflag = PrimitiveTypes.LINES;

      if (cd_pvert < 0) {
        console.log("no param verts");
        return;
      }

      let white = [1, 1, 1, 1];
      let tmp = new Vector3();

      for (let v of mesh.verts) {
        let pv = v.customData[cd_pvert];

        let dis = 0;
        let tot = 0;
        for (let v2 of v.neighbors) {
          let dis2 = v.vectorDistance(v2);
          dis += dis2;
          tot++;
        }

        if (tot) {
          dis /= tot;
        }

        dis = Math.max(dis, 0.01);

        let v1 = v;
        let v2 = tmp.zero();

        v2[0] = pv.smoothTan[0];
        v2[1] = pv.smoothTan[1];
        v2[2] = pv.smoothTan[2];

        v2.cross(v.no);

        v2.normalize();

        v2.mulScalar(dis);

        v2.add(v);

        let l = sm.line(v1, v2);
        l.colors(white, white);
      }
    }

    on_drawend(view3d, gl) {
      if (this.drawVerts) {
        super.on_drawend(view3d, gl);
      }

      let ob = this.ctx.object;
      let color = [1, 0.8, 0.7, 1.0];

      let uniforms = {
        projectionMatrix: view3d.activeCamera.rendermat,
        objectMatrix    : ob.outputs.matrix.getValue(),
        object_id       : ob.lib_id,
        aspect          : view3d.activeCamera.aspect,
        size            : view3d.glSize,
        near            : view3d.activeCamera.near,
        far             : view3d.activeCamera.far,
        color           : color,
        uColor          : color,
        alpha           : 1.0,
        opacity         : 1.0,
        polygonOffset   : 1.0
      };

      this.mesh = this.ctx.mesh;

      if (this.mesh) {
        this.updateParamMesh(gl);

        if (this.paramMesh) {
          gl.enable(gl.DEPTH_TEST);
          this.paramMesh.draw(gl, uniforms, Shaders.WidgetMeshShader);
        }
      }
    }

    static toolModeDefine() {
      return {
        name        : "paramtool",
        uiname      : "Parameterizer Tool",
        icon        : api.Icons.SHOW_LOOPS,
        description : "Parameterizer Tool",
        transWidgets: [],
        flag        : 0
      }
    }
  }

  ParamToolMode.STRUCT = nstructjs.inherit(ParamToolMode, api.toolmode.ToolMode) + `
    drawMode       : int;
    drawFlag       : int;
    drawScale      : float;
    drawVerts      : bool;
  }
  `;

  api.register(ParamToolMode);

  return exports;
}

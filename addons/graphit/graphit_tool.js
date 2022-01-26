import {Shaders} from '../../scripts/shaders/shaders.js';
import {PrimitiveTypes} from '../../scripts/core/simplemesh.js';
import {KDrawModes} from '../../scripts/mesh/mesh_paramizer.js';

export function makeGraphItToolMode(api) {
  let exports = {};

  let nstructjs = api.nstructjs;

  let DrawModes = exports.DrawModes = {
    GEODESIC      : 0,
    UV            : 1
  }

  let DrawFlags = exports.DrawFlags = {
    COLOR : 1
  };

  let ParamVert = api.mesh.paramizer.ParamVert;
  let {LayerTypes, PrimitiveTypes, SimpleMesh} = api.simplemesh;

  let GraphItToolMode = exports.GraphItToolMode = class GraphItToolMode extends api.toolmode.MeshToolBase {
    constructor() {
      super();

      this.drawTangents = true;
      this.drawVerts = true;

      this.selectMask = api.SelMask.VERTEX;
      this.vertexPointSize = 3;
    }

    static defineAPI(api) {
      let st = super.defineAPI(api);

      let onchange = () => window.redraw_viewport(true);

      return st;
    }

    update() {
    }

    static buildHeader(header, addRow) {
      let row = addRow();

      let strip = row.strip();
      strip.useIcons(false);
    }

    static buildSettings(con) {
      let panel = con.panel("Tools");

      let strip = panel.strip();

      strip.useIcons(false);
      //strip.toolPanel("graphit.load");
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

      return;

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

      if (!ob) {
        return;
      }

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

      if (this.mesh && this.drawTangents) {
        this.updateParamMesh(gl);

        if (this.paramMesh) {
          gl.enable(gl.DEPTH_TEST);
          this.paramMesh.draw(gl, uniforms, Shaders.WidgetMeshShader);
        }
      }
    }

    static toolModeDefine() {
      return {
        name        : "GraphItTool",
        uiname      : "GraphIt",
        icon        : api.Icons.GRAPH,
        description : "GraphIt Tool Mode",
        transWidgets: [],
        flag        : 0
      }
    }
  }

  GraphItToolMode.STRUCT = nstructjs.inherit(GraphItToolMode, api.toolmode.ToolMode) + `
    drawTangents : bool;
    drawVerts    : bool;
  }
  `;

  api.register(GraphItToolMode);

  return exports;
}

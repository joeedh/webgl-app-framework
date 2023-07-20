import {makeGraphItToolMode} from './graphit_tool.js';

let _api;

export const addonDefine = {
  name: "Graph It"
};

export const DataTypes = {
  GRID: 0
};

export const DataAxes = {
  XYZ: 0,
  XZY: 1,
  YXZ: 2,
  YZX: 3,
  ZXY: 4,
  ZYX: 5
}

let axismap = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0]
];

//returns if argv is valid for this addon, and addon should
//be forcibly enabled
export function validArgv(api, argv) {
  let ret = false;

  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i].toLowerCase();

    if (arg === "--graphit") {
      console.error("graph!");
      ret = true;
    }
  }

  return ret;
}

export function handleArgv(api, argv) {
  let ret = false;
  let file;
  let order = 'XYZ';

  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i].toLowerCase().trim();

    if (arg === "--graphit") {
      if (i < argv.length - 1) {
        file = argv[i + 1];
        ret = true;
      }
    }

    if (arg === '--order') {
      order = argv[i + 1];
    }
  }

  if (!ret) {
    return;
  }

  order = order.trim().toUpperCase();
  order = DataAxes[order];

  console.error("ORDER", order);

  console.error("graph!");
  let ctx = api.ctx;

  ctx.scene.switchToolMode('GraphItTool');
  window.redraw_viewport();
  window.updateDataGraph();

  let fs = require('fs');
  file = file.trim();

  if (!file.startsWith("./") && !file.startsWith('.\\')) {
    file = './' + file
  }

  let buf = fs.readFileSync(file, 'utf8');

  ctx.api.execTool(ctx, "graphit.load", {
    data: buf,
    axes: order
  });

  return ret;
}

export function register(api) {
  _api = api;
  let mesh_paramizer = api.mesh.paramizer;

  api.graphtool = makeGraphItToolMode(api);

  let ToolOp = api.toolop.ToolOp;
  let MeshFlags = api.mesh.MeshFlags;
  let MeshTypes = api.mesh.MeshTypes;

  class LoadGraphOp extends ToolOp {
    static tooldef() {
      return {
        uiname  : "Load Data",
        toolpath: "graphit.load",
        inputs  : {
          data    : new api.toolop.StringProperty().saveLastValue().private(),
          dataType: new api.toolop.EnumProperty(DataTypes.GRID, DataTypes).saveLastValue(),
          axes    : new api.toolop.EnumProperty(DataAxes.XYZ, DataAxes),
          dimen   : new api.toolop.Vec3Property(),
        },
        outputs : {
          objectId: new api.toolop.IntProperty()
        }
      }
    }

    loadGrid(ob, mesh, data) {
      data = data.split("\n");

      let order = this.inputs.axes.getValue();
      order = axismap[order];

      let [xaxis, yaxis, zaxis] = order;

      let min = new Vector3(), max = new Vector3();
      min.addScalar(1e17);
      max.addScalar(-1e17);

      let jumps = [0, 0, 0];
      let totjumps = [0, 0, 0];
      let vs = [];

      for (let line of data) {
        line = line.replace(/[ \t]+/g, ' ').trim();
        if (line.length === 0) {
          continue;
        }

        line = line.split(" ");
        line = line.map(f => parseFloat(f));

        while (line.length < 3) {
          line.push(0.0);
        }

        let v = mesh.makeVertex();

        v[xaxis] = line[0];
        v[yaxis] = line[1];
        v[zaxis] = line[2];

        vs.push(v);

        min.min(v);
        max.max(v);
      }

      max.sub(min);
      let scale = Math.max(max[0], max[1], max[2]);
      scale = 7.0/scale;

      console.error("SCALE", scale);

      for (let v of mesh.verts) {
        v.sub(min).mulScalar(scale);
        v.flag |= MeshFlags.UPDATE;
      }

      if (vs.length === 0) {
        return;
      }


      //derive dimensions?
      let dimen = this.inputs.dimen.getValue();

      if (dimen.dot(dimen) === 0.0) {
        //this.deriveDimen(mesh, ob, vs);
        //return;
      }

      api.mesh_utils.delauney3D(mesh, vs);
    }

    deriveDimen(mesh, ob, vs) {
      let dimen = Math.max(Math.max(max[0], max[1]), max[2]);

      let lastv = vs[0];
      let dv = new Vector3();

      for (let i = 1; i < vs.length; i++) {
        let v = vs[i];

        dv.load(v).sub(lastv);
        dv.abs();

        let limit = 0.3;
        for (let j = 0; j < 3; j++) {
          if (dv[j] > limit) {
            jumps[j] += dv[j];
            totjumps[j]++;
          }
        }

        lastv = v;
      }

      let maxjump = undefined;

      let axis = 0;
      dimen = 208;

      for (let i = 0; i < 3; i++) {
        if (maxjump === undefined || totjumps[i] > maxjump) {
          axis = i;
          dimen = ~~(jumps[i] + 0.0001);
          maxjump = i;
        }
      }

      let row = [];
      let rows = [row];

      for (let v of vs) {
        if (row.length === dimen) {
          row = [];
          rows.push(row);
        }

        row.push(v);
      }

      for (let i = 0; i < rows.length - 1; i++) {
        let r1 = rows[i];
        let r2 = rows[i + 1];

        for (let j = 0; j < dimen - 1; j++) {
          let r1 = rows[j];
          let r2 = rows[j + 1];

          if (!r1 || !r2 || r2.length - 1 <= i) {
            continue;
          }

          let v1 = r1[i];
          let v2 = r1[i + 1];
          let v3 = r2[i + 1];
          let v4 = r2[i];

          mesh.makeQuad(v1, v2, v3, v4);
        }
      }

      console.log("axis", axis, "dimen", dimen);
    }

    exec(ctx) {
      let ob, mesh;

      if (ctx.object && ctx.object.data instanceof Mesh) {
        //use existing mesh
        ob = ctx.object;
        mesh = ob.data;
      } else {
        mesh = new api.mesh.Mesh();

        ctx.datalib.add(mesh);
        ob = new api.sceneobject.SceneObject();
        ctx.datalib.add(ob);

        ob.data = mesh;
        ctx.scene.add(ob);
        ctx.scene.objects.setActive(ob);
      }

      this.outputs.objectId.setValue(ob.lib_id);

      mesh.clear();

      if (this.inputs.dataType.getValue() === DataTypes.GRID) {
        this.loadGrid(ob, mesh, this.inputs.data.getValue());
      }

      mesh.regenAll();
      mesh.regenTessellation();
      mesh.recalcNormals();
      mesh.graphUpdate();

      ob.graphUpdate();

      window.updateDataGraph();
      window.redraw_viewport();
    }
  }

  api.register(LoadGraphOp);

}

export function unregister(api) {

}


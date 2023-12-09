import {SceneObjectData} from '../sceneobject/sceneobject_base.js';
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '../util/vectormath.js';
import * as util from '../util/util.js';
import * as math from '../util/math.js';
import {MeshIDShader, Shaders} from '../shaders/shaders.js';
import {Node, NodeFlags} from '../core/graph.js';
import {SelMask} from '../editors/view3d/selectmode.js';
import {DataBlock} from '../core/lib_api.js';
import {LayerTypes, PrimitiveTypes, SimpleMesh} from '../core/simplemesh.ts';

import {nstructjs} from '../path.ux/scripts/pathux.js';

export const Generators = [];
export const GenTypes = {};

let _digest = new util.HashDigest();

export class ProceduralGen {
  constructor() {
    let def = this.constructor.genDefine();

    this.flag = def.flag !== undefined ? def.flag : 0;
    this.typeName = def.typeName;
    this.uiName = def.uiName;

    this._last_hash = undefined;
  }

  getBoundingBox() {
    throw new Error("implement me");
  }

  static genDefine() {
    return {
      typeName: "",
      uiName  : "",
      flag    : 0
    }
  }

  static buildSettings(ui) {

  }

  static apiDefine(api) {
    let st = api.mapStruct(this);

    return st;
  }

  hashSettings(digest) {
    throw new Error("implement me");
  }

  getSimpleMesh(gl) {
    _digest.reset();
    this.hashSettings(_digest);

    let hash = _digest.get();
    if (hash !== this._last_hash) {
      this._last_hash = hash;

      console.log("Generating new draw mesh", hash);

      this.smesh = this.genSimpleMesh(gl);
    }

    return this.smesh;
  }

  genSimpleMesh(gl) {
    throw new Error("implement me");
  }

  genMesh() {
    throw new Error("implement me");
  }

  loadSTRUCT(reader) {
    reader(this);
  }

  static register(cls) {
    let def = cls.genDefine();
    GenTypes[def.typeName.toUpperCase()] = Generators.length;

    if (!cls.structName) {
      throw new Error("must register with nstructjs");
    }

    Generators.push(cls);
  }
}

ProceduralGen.STRUCT = `
mesh.ProceduralGen {

}
`;
nstructjs.register(ProceduralGen);

let VX=0, VY=1, VZ=2, VTOT = 3;

export class CubeGenerator extends ProceduralGen {
  constructor() {
    super();

    this.dimen = 2;
    this.toSphere = 0.0;
    this.aabb = [new Vector3(), new Vector3()];

    this.aabb[0].subScalar(-1.0);
    this.aabb[1].addScalar(1.0);
  }

  getBoundingBox() {
    return this.aabb;
  }

  _gen() {
    let dimen = this.dimen;

    function hashv(x, y, z) {
      return z*dimen*dimen*dimen + y*dimen*dimen + x*dimen;
    }

    let verts = [];
    let quads = [];

    let co = new Vector3();
    let hashmap = new Map();
    let grid = new Array(dimen*dimen);
    let co2 = new Vector3();
    let toSphere = this.toSphere;

    for (let face=0; face<6; face++) {
      let axis = face % 3, sign = face >= 3 ? 0 : 1;

      for (let i = 0; i < dimen; i++) {
        for (let j = 0; j < dimen; j++) {
          let u = i/(dimen - 1), v = j/(dimen - 1);

          co[axis] = u;
          co[(axis+1)%3] = v;
          co[(axis+2)%3] = sign;

          let h = hashv(co[0], co[1], co[2]);

          //h = "" + co[0] + ":" + co[1] + ":" + co[2];
          let vi = hashmap.get(h);

          co[0] = co[0]*2.0 - 1.0;
          co[1] = co[1]*2.0 - 1.0;
          co[2] = co[2]*2.0 - 1.0;

          if (vi === undefined) {
            vi = verts.length;
            hashmap.set(h, vi);
            verts.length += VTOT;
          }

          co2.load(co).normalize();

          co.interp(co2, toSphere);

          verts[vi] = co[0];
          verts[vi+1] = co[1];
          verts[vi+2] = co[2];

          grid[j*dimen + i] = vi;
        }
      }

      for (let i=0; i<dimen-1; i++) {
        for (let j=0; j<dimen-1; j++) {
          if (face < 3) {
            quads.push(grid[j*dimen + i+1]);
            quads.push(grid[(j+1)*dimen + i + 1]);
            quads.push(grid[(j+1)*dimen + i]);
            quads.push(grid[j*dimen + i]);
          } else {
            quads.push(grid[j*dimen + i]);
            quads.push(grid[(j+1)*dimen + i]);
            quads.push(grid[(j+1)*dimen + i + 1]);
            quads.push(grid[j*dimen + i+1]);
          }
        }
      }
    }

    return {
      verts, quads
    };
  }

  genSimpleMesh() {
    let {verts, quads} = this._gen();

    let p1 = new Vector3();
    let p2 = new Vector3();
    let p3 = new Vector3();
    let p4 = new Vector3();
    let n = new Vector3();
    let an = new Vector3();

    let layerflag = LayerTypes.LOC | LayerTypes.NORMAL; // | LayerTypes.INDEX
    let sm = this.smesh = new SimpleMesh(layerflag);

    console.error("Generating mesh");

    let c = new Vector4();
    let b = new Vector4();
    let n2 = new Vector4();

    b[3] = 1.0;
    //c.addScalar(1.0);

    function doline(v1, v2) {
      let line = sm.line(v1, v2);
      //line.colors(b, b);
      return line;
    }

    let toSphere = this.toSphere;
    let v = new Vector3();

    if (0) {
      let idx = sm.island.getIndexBuffer(PrimitiveTypes.TRIS);
      sm.island.indexedMode = true;

      sm.island.setPrimitiveCount(PrimitiveTypes.TRIS, verts.length);
      sm.island.tottri = quads.length*2;

      let cos = sm.island.tri_cos._getWriteData();
      let nos = sm.island.tri_normals._getWriteData();

      for (let i=0; i<verts.length; i += 3) {
        let i2 = i;


        cos[i2] = v[0] = verts[i];
        cos[i2+1] = v[1] = verts[i+1];
        cos[i2+2] = v[2] = verts[i+2];

        n2.load(v).normalize();
        an.load(v).abs().normalize();
        an.interp(n2, toSphere).normalize();

        nos[i2] = an[0];
        nos[i2+1] = an[1];
        nos[i2+2] = an[2];
      }

      let ti = 0;

      idx.setCount(quads.length*2*3);
      idx = idx._getWriteData();
      sm.island.regen = true;

      for (let i=0; i<quads.length; i += 4) {
        let v1 = quads[i], v2 = quads[i + 1], v3 = quads[i + 2], v4 = quads[i + 3];

        idx[ti++] = ~~(v1/VTOT+0.000001);
        idx[ti++] = ~~(v2/VTOT+0.000001);
        idx[ti++] = ~~(v3/VTOT+0.000001);

        idx[ti++] = ~~(v1/VTOT+0.000001);
        idx[ti++] = ~~(v3/VTOT+0.000001);
        idx[ti++] = ~~(v4/VTOT+0.000001);
      }

      return sm;
    }

    for (let i=0; i<quads.length; i += 4) {
      let v1 = quads[i], v2 = quads[i+1], v3 = quads[i+2], v4 = quads[i+3];

      for (let j=0; j<3; j++) {
        p1[j] = verts[v1+j];
        p2[j] = verts[v2+j];
        p3[j] = verts[v3+j];
        p4[j] = verts[v4+j];
      }

      let quad = sm.quad(p1, p2, p3, p4);

      n2.load(p1).add(p2).add(p3).add(p4).mulScalar(0.25);
      an.load(n2).abs();
      n.zero();

      if (an[0] > an[1] && an[0] > an[2]) {
        n[0] = Math.sign(an[0]);
      } else if (an[1] > an[0] && an[1] > an[2]) {
        n[1] = Math.sign(an[1]);
      } else {
        n[2] = Math.sign(an[2]);
      }

      n2.normalize();
      n.interp(n2, toSphere).normalize();

      quad.normals(n, n, n, n);
      //quad.colors(c, c, c, c);

      ///*
      doline(p1, p2);
      doline(p2, p3);
      doline(p3, p4);
      doline(p4, p1);
      //*/
    }

    return sm;
  }

  genMesh() {
    let {verts, quads} = this._gen();

    let c = new Vector4();

    c.addScalar(1.0);

    let mesh = new Mesh();

    let vs = [];

    for (let i=0; i<verts.length; i += VTOT) {
      let x = verts[i], y = verts[i+1], z = verts[i+2];

      let v = mesh.makeVertex();
      v.co[0] = x;
      v.co[1] = y;
      v.co[2] = z;

      v.index = vs.length;
      vs.push(v);
    }

    for (let i=0; i<quads.length; i += 4) {
      let v1 = quads[i], v2 = quads[i+1], v3 = quads[i+2], v4 = quads[i+3];

      v1 = vs[v1/VTOT];
      v2 = vs[v2/VTOT];
      v3 = vs[v3/VTOT];
      v4 = vs[v4/VTOT];

      let f = mesh.makeQuad(v1, v2, v3, v4);
    }

    mesh.regenTessellation();
    mesh.recalcNormals();
    mesh.regenElementsDraw();
    mesh.regenRender();

    return mesh;
  }

  hashSettings(digest) {
    digest.add(this.dimen);
    digest.add(this.toSphere);

    return digest.get();
  }

  static buildSettings(ui) {
    ui.prop("dimen");
    ui.prop("toSphere");
  }

  static apiDefine(api) {
    let st = super.apiDefine(api);

    st.int("dimen", "dimen", "dimen")
      .noUnits()
      .range(2, 512)
      .step(5)
      .on('change', () => window.redraw_viewport(true));

    st.float("toSphere", "toSphere", "Sphere")
      .noUnits()
      .range(-1.0, 1.0)
      .step(0.01)
      .on('change', () => window.redraw_viewport(true));

    return st;
  }

  static genDefine() {
    return {
      typeName: "CUBE",
      uiName  : "Cube",
      flag    : 0
    }
  }
}

CubeGenerator.STRUCT = nstructjs.inherit(CubeGenerator, ProceduralGen, "mesh.CubeGenerator") + `
  dimen    : int;
  toSphere : float;
}
`;
nstructjs.register(CubeGenerator);
ProceduralGen.register(CubeGenerator);

export class ProceduralMesh extends SceneObjectData {
  constructor() {
    super();

    this.generator = new CubeGenerator();
    this.recalc = 1;
  }

  draw(view3d, gl, uniforms, program, object) {
    this.generator.getSimpleMesh(gl).draw(gl, uniforms, program);
    this.generator.getSimpleMesh(gl).drawLines(gl, uniforms, program);
  }

  drawIds(view3d, gl, selectMask, uniforms, object) {
    this.generator.getSimpleMesh(gl).draw(gl, uniforms, Shaders.MeshIDShader);
  }

  drawWireframe(view3d, gl, uniforms, program, object) {
    this.generator.getSimpleMesh(gl).drawLines(gl, uniforms, program);
  }

  drawOutline(view3d, gl, uniforms, program, object) {
    this.generator.getSimpleMesh(gl).drawLines(gl, uniforms, program);
  }

  static dataDefine() {return {
    name : "ProceduralMesh",
    selectMask : SelMask.PROCMESH
  }}

  static blockDefine() { return {
    typeName : "ProceduralMesh",
    uiName : "Procedural Mesh",
    defaultName : "Procedural Mesh",
  }}

  static nodedef() {return {
    uiname : "Procedural Mesh",
    name : "ProceduralMesh",
    inputs : Node.inherit({}),
    outputs : Node.inherit({}),
    flag : Node.inherit(NodeFlags.SAVE_PROXY)
  }}

  getBoundingBox() {
    return this.generator.getBoundingBox();
  }
}

ProceduralMesh.STRUCT = nstructjs.inherit(ProceduralMesh, SceneObjectData, "mesh.ProceduralMesh") + `
  generator : abstract(mesh.ProceduralGen);
}`;
nstructjs.register(ProceduralMesh);
SceneObjectData.register(ProceduralMesh);
DataBlock.register(ProceduralMesh);

export function buildProcMeshAPI(api) {
  for (let cls of Generators) {
    cls.apiDefine(api);
  }

  let st = api.inheritStruct(ProceduralMesh, DataBlock);
  st.dynamicStruct("generator", "generator", "Generator");

  return st;
}

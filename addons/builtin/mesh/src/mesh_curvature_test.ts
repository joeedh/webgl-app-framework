import {util, math} from '@framework/api'
import {nstructjs, DataAPI, DataStruct} from '@framework/pathux'
import {CustomDataElem, LayerSettingsBase} from './customdata'
import {StructReader} from '@framework/api'
import {Vector2, Vector3, Vector4, Matrix4, Quat} from '@framework/api'
import '../../../../scripts/util/numeric.js'

declare const numeric: {
  eig(matrix: number[][], maxiter?: number): {E: {x: number[][]}, lambda: {x: number[]}}
  dot(a: number[] | number[][], b: number[] | number[][]): number[]
}

const Queue = util.Queue
import {MeshTypes, MeshFlags} from './mesh_base.js'
import {buildCotanVerts, getCotanData, VAREA, VCTAN1, VCTAN2, VW, VETOT, vertexSmooth} from './mesh_utils.js'
import type {Vertex, Edge, Face, Loop} from './mesh_types'
import type {Mesh} from './mesh'

export const calcCurvModes = {
  SELECTED: 1,
  MAX_Z   : 2,
}

const tmp1 = new Vector3()
const tmp2 = new Vector3()
const tmp3 = new Vector3()

const gtmps = util.cachering.fromConstructor(Vector3, 256)

export const KDrawModes = {
  NO        : 0,
  TAN       : 1,
  BIN       : 2,
  DK1       : 3,
  DK2       : 4,
  DK3       : 5,
  D2K1      : 6,
  D2K2      : 7,
  D2K3      : 8,
  D3K1      : 9,
  D3K2      : 10,
  D3K3      : 11,
  ERROR     : 12,
  SMOOTH_TAN: 13,
}

//window.kdrawmode = KDrawModes.TAN

export const WeightModes = {
  SIMPLE     : 0,
  EDGE_LENGTH: 1,
  COTAN      : 2,
}

export class CurvVert2Settings extends LayerSettingsBase {
  declare updateGen: number
  declare smoothTangents: boolean
  declare weightMode: number

  constructor() {
    super()

    this.updateGen = 0
    this.smoothTangents = true
    this.weightMode = WeightModes.EDGE_LENGTH
  }

  static apiDefine(api: DataAPI, st?: DataStruct) {
    const ret = super.apiDefine(api, st!)

    ret.int('updateGen', 'updateGen', 'Generation').noUnits().readOnly()
    ret.bool('smoothTangents', 'smoothTangents', 'Smooth Tangents') //.noUnits().range(0, 25);
    ret.enum('weightMode', 'weightMode', WeightModes, 'Weight Mode')

    return ret
  }

  copyTo(b: this) {
    b.updateGen = this.updateGen
    b.smoothTangents = this.smoothTangents
    b.weightMode = this.weightMode
  }
}

CurvVert2Settings.STRUCT =
  nstructjs.inherit(CurvVert2Settings, LayerSettingsBase) +
  `
  updateGen      : int;
  smoothTangents : bool;
  weightMode     : int;
}`

const tmp = new Vector3()
const itmp1 = new Vector3()
const itmp2 = new Vector3()
const itmp3 = new Vector3()
const itmp4 = new Vector3()

export class CurvVert2 extends CustomDataElem {
  error: number
  errorvec: Vector3
  lastd2k1: Vector3
  lastd2k2: Vector3
  lastd2k3: Vector3
  no: Vector3
  tan: Vector3
  bin: Vector3
  k1: number
  k2: number
  k3: number
  d2k1: Vector3
  d2k2: Vector3
  d2k3: Vector3
  dk1: Vector3
  dk2: Vector3
  dk3: Vector3
  d3k1: Vector3
  d3k2: Vector3
  d3k3: Vector3
  updateGen: number
  needsSmooth: boolean
  smoothTan: Vector3
  totarea: number
  k: number
  wlist: number[]
  dis!: number
  dv!: Vector3

  constructor() {
    super()

    this.error = 0.0

    this.errorvec = new Vector3() //not saved, for debugging use

    this.lastd2k1 = new Vector3()
    this.lastd2k2 = new Vector3()
    this.lastd2k3 = new Vector3()

    this.no = new Vector3()
    this.tan = new Vector3()
    this.bin = new Vector3()

    this.k1 = this.k2 = this.k3 = 0.0

    this.d2k1 = new Vector3()
    this.d2k2 = new Vector3()
    this.d2k3 = new Vector3()
    this.dk1 = this.dk2 = this.dk3 = new Vector3()
    this.d3k1 = this.d3k2 = this.d3k3 = new Vector3()

    this.updateGen = 0

    this.needsSmooth = false
    this.smoothTan = new Vector3()
    this.totarea = 0.0

    this.k = 0.0

    this.wlist = []
  }

  static define() {
    return {
      elemTypeMask : 0,
      typeName     : 'curvetest',
      uiTypeName   : 'Curv Test',
      defaultName  : 'Curv Test',
      valueSize    : undefined,
      flag         : 0,
      settingsClass: CurvVert2Settings,
    }
  }

  calcMemSize() {
    return 32
  }

  getValue() {
    return this.tan
  }

  /*calculate tangent and smooth with neighbors
   * if necassary */
  updateTangent(ps: CurvVert2Settings, owning_v: Vertex, cd_curvt: number, noNorm = false) {
    let v = owning_v

    this.updateGen = ps.updateGen

    const pv = v.customData[cd_curvt] as CurvVert2 as CurvVert2
    const d1 = pv.k

    const dv = tmp1.zero()

    if (v.valence !== this.wlist.length) {
      this.updateWeights(ps, owning_v, cd_curvt)
    }

    const norm = 0.0
    const cotan = ps.weightMode === WeightModes.COTAN
    const edge_length = ps.weightMode === WeightModes.EDGE_LENGTH

    let i = 0
    for (const e of v.edges) {
      const v2 = e.otherVertex(v)
      const pv2 = v2.customData[cd_curvt] as CurvVert2 as CurvVert2

      const d2 = pv2.k

      let w = 1.0

      w = this.wlist[i]

      let dv2
      dv2 = tmp3.load(v2.co).sub(v.co)

      if (!noNorm) {
        dv2.normalize()
      }

      dv2.mulScalar((d2 - d1) * w)

      dv.add(dv2)

      i++
    }

    if (cotan) {
      //norm = this.totarea**2;
      //dv.mulScalar(1.0 / norm);
    }

    if (noNorm) {
      if (i) {
        dv.mulScalar(1.0 / i)
      }
    } else {
      dv.normalize()
    }

    pv.smoothTan[1] = dv[0]
    pv.smoothTan[2] = dv[1]
    pv.smoothTan[3] = dv[2]

    pv.smoothTan.addFac(v.no, -v.no.dot(pv.smoothTan))

    if (!noNorm) {
      pv.smoothTan.normalize()
    }
  }

  smooth(ps: CurvVert2Settings, v: Vertex, cd_curvt: number, fac = 0.5) {
    let k = 0
    let tot = 0.0
    let i = 0

    this.updateWeights(ps, v, cd_curvt)

    for (let v2 of v.neighbors) {
      let pv2 = v2.customData[cd_curvt] as CurvVert2
      let w = this.wlist[i]

      k += pv2.k * w
      tot += w
      i++
    }

    if (tot === 0.0) {
      return
    }

    k /= tot
    this.k += (k - this.k) * fac
  }

  interp(dest: this, datas: this[], ws: number[]) {
    let k1 = 0,
      k2 = 0,
      k3 = 0,
      error = 0.0,
      k = 0.0
    let tan = itmp1.zero(),
      no = itmp2.zero(),
      bin = itmp3.zero()

    for (let i = 0; i < datas.length; i++) {
      let w = ws[i]
      let d = datas[i]

      tan.addFac(d.tan, w)
      no.addFac(d.no, w)
      bin.addFac(d.bin, w)

      k1 += d.k1 * w
      k2 += d.k2 * w
      k3 += d.k3 * w
      error += d.error * w
      k += d.k * w
    }

    dest.error = error

    dest.k1 = k1
    dest.k2 = k2
    dest.k3 = k3
    dest.k = k

    dest.no.load(no)
    dest.tan.load(tan)
    dest.bin.load(bin)
  }

  updateWeights(ps: CurvVert2Settings, owning_v: Vertex, cd_curvt: number) {
    const val = owning_v.valence

    if (this.wlist.length !== val) {
      this.wlist.length = val
    }

    if (ps.weightMode === WeightModes.SIMPLE) {
      let w = 1.0 / val

      for (let i = 0; i < val; i++) {
        this.wlist[i] = w
      }
    } else if (ps.weightMode === WeightModes.EDGE_LENGTH) {
      let wi = 0
      let tot = 0.0
      const wlist = this.wlist

      for (let v2 of owning_v.neighbors) {
        let a = v2
        let b = owning_v

        /*
        if (cd_disp !== undefined) {
          a = v2.customData[cd_disp].worldco;
          b = owning_v.customData[cd_disp].worldco;
        }*/

        const w = a.co.vectorDistance(b.co)

        wlist[wi++] = w
        tot += w
      }

      if (tot) {
        tot = 1.0 / tot
      }

      for (let i = 0; i < val; i++) {
        wlist[i] *= tot
      }
    } else {
      this.updateCotan(ps, owning_v, cd_curvt)
    }
  }

  updateCotan(ps: CurvVert2Settings, owning_v: Vertex, cd_curvt: number) {
    if (ps.weightMode !== WeightModes.COTAN) {
      return
    }

    let v = owning_v

    let vdata = getCotanData(v)
    let totarea = 0.0
    let totw = 0.0

    let wi = 0
    let vi = VETOT //skip first entry

    for (let e of v.edges) {
      let area = vdata[vi + VAREA]
      let cot1 = vdata[vi + VCTAN1]
      let cot2 = vdata[vi + VCTAN2]

      let w = vdata[vi + VW]

      //cot1 = 1.0 / (cot1 + 0.00001);
      //cot2 = 1.0 / (cot2 + 0.00001);
      w = 1.0 //cot1 + cot2;

      if (area !== 0.0) {
        w *= area
      }

      if (!area) {
        vi += VETOT
        wi++
        continue
      }

      totarea += area

      //w = -(cot1 + cot2);

      this.wlist[wi] = w //*area;

      vi += VETOT
      wi++
    }

    totw = totw ? 1.0 / totw : 0.0

    for (let i = 0; i < wi; i++) {
      this.wlist[wi] *= totw
    }

    this.totarea = totarea
  }

  mulScalar(f: number) {
    this.tan.mulScalar(f)
    return this
  }

  clear() {
    this.tan.zero()
    return this
  }

  add(b: this) {
    this.tan.add(b.tan)
    return this
  }

  addFac(b: this, fac: number) {
    this.tan.addFac(b.tan, fac)
    return this
  }

  sub(b: this) {
    this.tan.sub(b.tan)
    return this
  }

  setValue(v: this) {
    this.tan.load(v.tan)
  }

  loadSTRUCT(reader: StructReader<this>) {
    super.loadSTRUCT(reader)
  }

  copyTo(b: this) {
    b.k1 = this.k1
    b.k2 = this.k2
    b.k3 = this.k3
    b.k = this.k

    b.smoothTan.load(this.smoothTan)
    b.error = this.error

    b.no.load(this.no)
    b.tan.load(this.tan)
    b.bin.load(this.bin)

    b.totarea = this.totarea

    b.dk1.load(this.dk1)
    b.d2k1.load(this.d2k1)
    b.d3k1.load(this.d3k1)

    b.dk2.load(this.dk2)
    b.d2k2.load(this.d2k2)
    b.d3k2.load(this.d3k2)

    b.dk3.load(this.dk3)
    b.d2k3.load(this.d2k3)
    b.d3k3.load(this.d3k3)
  }
}

CurvVert2.STRUCT =
  nstructjs.inherit(CurvVert2, CustomDataElem) +
  `
    no           : vec3;
    tan          : vec3;
    bin          : vec3;
    k1           : double;
    k2           : double;
    k3           : double;
    k            : double;
    error        : double;
    updateGen    : int;
    smoothTan    : vec3;
    wlist        : array(float);
    totarea      : float;
  }`

export function curvatureTest(mesh: Mesh, cd_curvt: number, shell: Face[], mode: number) {
  let ps = mesh.verts.customData.flatlist[cd_curvt].getTypeSettings() as CurvVert2Settings

  let verts = new Set<Vertex>()
  let edges = new Set<Edge>()
  let loops = new Set<Loop>()
  let faces = new Set<Face>()

  //used by cov()
  let cntmp2 = new Vector3()

  let startv: Vertex | undefined = undefined

  console.log('cd_curvt', cd_curvt)
  for (let f of shell) {
    faces.add(f)

    for (let l of f.loops) {
      verts.add(l.v)
      edges.add(l.e)
      loops.add(l)

      if (startv === undefined || l.v.flag & MeshFlags.SELECT) {
        startv = l.v
      }
    }
  }

  let co = new Vector3()
  let n = new Vector3()
  let dv = new Vector3()
  let mat = new Matrix4()

  let spacemat = new Matrix4()
  let spacetan_tmp = new Vector3()

  for (let v of verts) {
    let pv = v.customData[cd_curvt] as CurvVert2

    co.zero()
    n.zero()
    let tot = 0.0

    for (let v2 of v.neighbors) {
      co.add(v2.co)
      n.add(v2.no)
      tot++
    }

    if (!tot) {
      continue
    }

    co.mulScalar(1.0 / tot)
    n.normalize()

    let dis = v.co.vectorDistance(co) * 0.1
    //dis = n.dot(v.no);
    //dis = Math.acos(n.dot(v.no);

    co.sub(v.co)
    pv.dis = dis
    pv.dv = new Vector3(co)
  }

  const CURVATURE = true
  let dvtmp = new Vector3()

  let cos = []
  const flag = MeshFlags.MAKE_FACE_TEMP
  let ispacemat = new Matrix4()

  for (let v of verts) {
    let pv = v.customData[cd_curvt] as CurvVert2

    spacemat.makeIdentity()
    let spacetan

    //set up 2d projection matrix for v.no
    if (v.edges.length > 0) {
      let e = v.edges[0]

      spacetan = spacetan_tmp.load(v.edges[0].otherVertex(v).co).sub(v.co)
      spacetan.normalize()
    }
    ispacemat.makeNormalMatrix(v.no, spacetan)

    //XXX
    //ispacemat.makeIdentity();

    spacemat.load(ispacemat).transpose()

    //set up normal covariance matrix
    mat.makeIdentity()
    let m = mat.$matrix

    m.m11 = m.m22 = m.m33 = m.m44 = 0.0

    let w = 1.0 / v.edges.length

    for (let v2 of v.neighbors) {
      v2.flag &= ~flag
      for (let v3 of v2.neighbors) {
        v3.flag &= ~flag
      }
    }

    v.flag |= flag

    let count = 0

    for (let v2 of v.neighbors) {
      //cov(m, v.no, v2.no, -1);
      //count += 1;

      for (let v3 of v2.neighbors) {
        if (!(v3.flag & flag)) {
          v3.flag |= flag

          let w = v3.co.vectorDistance(v.co)

          cov(m, v.no, v3.no, w)
          count += 1
        }
      }
    }

    if (count > 0) {
      let mul = 1.0 / count

      m.m11 *= mul
      m.m12 *= mul
      m.m13 *= mul
      m.m21 *= mul
      m.m22 *= mul
      m.m23 *= mul
      m.m31 *= mul
      m.m32 *= mul
      m.m33 *= mul
    }

    //cov(m, new Vector3(), v.no, 1.0);

    let dv = dvtmp
    let dv2 = new Vector3()
    let dv3 = new Vector3()
    let k1, k2, k3

    let lastn: Vector3 | undefined = undefined

    /** multplies n by ispacemat */
    function eigen(n: Vector3, k1: number | undefined, doPowerSolve = false): number {
      /*
      on factor;
      off period;

      x2 := x*m11 + y*m21 + z*m31;
      y2 := x*m12 + y*m22 + z*m32;
      z2 := x*m13 + y*m23 + z*m33;

      len := (x2**2 + y2**2 + z2**2)**0.5;

      on fort;

      df(len, x, 2);
      df(len, y, 2);
      df(len, z, 2);
      x2 / len;
      y2 / len;
      z2 / len;

      off fort;

      */
      //this[0] = x*matrix.$matrix.m11 + y*matrix.$matrix.m21 + z*matrix.$matrix.m31;
      //this[1] = x*matrix.$matrix.m12 + y*matrix.$matrix.m22 + z*matrix.$matrix.m32;
      //this[2] = x*matrix.$matrix.m13 + y*matrix.$matrix.m23 + z*matrix.$matrix.m33;

      if (doPowerSolve) {
        k1 = 0.0

        for (let j = 0; j < 35; j++) {
          n.multVecMatrix(mat)
          k1 = n.dot(n)
          n.normalize()

          if (0 && lastn !== undefined && Math.abs(n.dot(lastn)) > 0.99) {
            n[0] = Math.random() - 0.5
            n[1] = Math.random() - 0.5
            n[2] = Math.random() - 0.5
            n.normalize()
          }
        }
      }

      //spacemat should have already been inverted by now
      n.multVecMatrix(ispacemat)

      let m11 = m.m11,
        m12 = m.m12,
        m13 = m.m13
      let m21 = m.m21,
        m22 = m.m22,
        m23 = m.m23
      let m31 = m.m31,
        m32 = m.m32,
        m33 = m.m33
      let x = n[0],
        y = n[1],
        z = n[2]
      let sqrt = Math.sqrt

      //first derivative
      let dx =
        ((m22 * y + m32 * z + m12 * x) * m12 +
          (m23 * y + m33 * z + m13 * x) * m13 +
          (m21 * y + m31 * z + m11 * x) * m11) /
        sqrt(
          (m21 * y + m31 * z + m11 * x) ** 2 + (m22 * y + m32 * z + m12 * x) ** 2 + (m23 * y + m33 * z + m13 * x) ** 2
        )
      let dy =
        ((m22 * y + m32 * z + m12 * x) * m22 +
          (m23 * y + m33 * z + m13 * x) * m23 +
          (m21 * y + m31 * z + m11 * x) * m21) /
        sqrt(
          (m21 * y + m31 * z + m11 * x) ** 2 + (m22 * y + m32 * z + m12 * x) ** 2 + (m23 * y + m33 * z + m13 * x) ** 2
        )
      let dz =
        ((m22 * y + m32 * z + m12 * x) * m32 +
          (m23 * y + m33 * z + m13 * x) * m33 +
          (m21 * y + m31 * z + m11 * x) * m31) /
        sqrt(
          (m21 * y + m31 * z + m11 * x) ** 2 + (m22 * y + m32 * z + m12 * x) ** 2 + (m23 * y + m33 * z + m13 * x) ** 2
        )

      dv[0] = dx
      dv[1] = dy
      dv[2] = dz

      //second derivative
      dx =
        (((m22 * y + m32 * z + m12 * x) ** 2 +
          (m23 * y + m33 * z + m13 * x) ** 2 +
          (m21 * y + m31 * z + m11 * x) ** 2) *
          (m12 ** 2 + m13 ** 2 + m11 ** 2) -
          ((m22 * y + m32 * z + m12 * x) * m12 +
            (m23 * y + m33 * z + m13 * x) * m13 +
            (m21 * y + m31 * z + m11 * x) * m11) **
            2) /
        (sqrt(
          (m21 * y + m31 * z + m11 * x) ** 2 + (m22 * y + m32 * z + m12 * x) ** 2 + (m23 * y + m33 * z + m13 * x) ** 2
        ) *
          ((m22 * y + m32 * z + m12 * x) ** 2 +
            (m23 * y + m33 * z + m13 * x) ** 2 +
            (m21 * y + m31 * z + m11 * x) ** 2))

      dy =
        (((m22 * y + m32 * z + m12 * x) ** 2 +
          (m23 * y + m33 * z + m13 * x) ** 2 +
          (m21 * y + m31 * z + m11 * x) ** 2) *
          (m22 ** 2 + m23 ** 2 + m21 ** 2) -
          ((m22 * y + m32 * z + m12 * x) * m22 +
            (m23 * y + m33 * z + m13 * x) * m23 +
            (m21 * y + m31 * z + m11 * x) * m21) **
            2) /
        (sqrt(
          (m21 * y + m31 * z + m11 * x) ** 2 + (m22 * y + m32 * z + m12 * x) ** 2 + (m23 * y + m33 * z + m13 * x) ** 2
        ) *
          ((m22 * y + m32 * z + m12 * x) ** 2 +
            (m23 * y + m33 * z + m13 * x) ** 2 +
            (m21 * y + m31 * z + m11 * x) ** 2))

      dz =
        (((m22 * y + m32 * z + m12 * x) ** 2 +
          (m23 * y + m33 * z + m13 * x) ** 2 +
          (m21 * y + m31 * z + m11 * x) ** 2) *
          (m32 ** 2 + m33 ** 2 + m31 ** 2) -
          ((m22 * y + m32 * z + m12 * x) * m32 +
            (m23 * y + m33 * z + m13 * x) * m33 +
            (m21 * y + m31 * z + m11 * x) * m31) **
            2) /
        (sqrt(
          (m21 * y + m31 * z + m11 * x) ** 2 + (m22 * y + m32 * z + m12 * x) ** 2 + (m23 * y + m33 * z + m13 * x) ** 2
        ) *
          ((m22 * y + m32 * z + m12 * x) ** 2 +
            (m23 * y + m33 * z + m13 * x) ** 2 +
            (m21 * y + m31 * z + m11 * x) ** 2))

      dv2[0] = dx
      dv2[1] = dy
      dv2[2] = dz

      dx =
        (-3 *
          (((m22 * y + m32 * z + m12 * x) ** 2 +
            (m23 * y + m33 * z + m13 * x) ** 2 +
            (m21 * y + m31 * z + m11 * x) ** 2) *
            (m12 ** 2 + m13 ** 2 + m11 ** 2) -
            ((m22 * y + m32 * z + m12 * x) * m12 +
              (m23 * y + m33 * z + m13 * x) * m13 +
              (m21 * y + m31 * z + m11 * x) * m11) **
              2) *
          ((m22 * y + m32 * z + m12 * x) * m12 +
            (m23 * y + m33 * z + m13 * x) * m13 +
            (m21 * y + m31 * z + m11 * x) * m11)) /
        (sqrt(
          (m21 * y + m31 * z + m11 * x) ** 2 + (m22 * y + m32 * z + m12 * x) ** 2 + (m23 * y + m33 * z + m13 * x) ** 2
        ) *
          ((m22 * y + m32 * z + m12 * x) ** 2 +
            (m23 * y + m33 * z + m13 * x) ** 2 +
            (m21 * y + m31 * z + m11 * x) ** 2) **
            2)

      dy =
        (-3 *
          (((m22 * y + m32 * z + m12 * x) ** 2 +
            (m23 * y + m33 * z + m13 * x) ** 2 +
            (m21 * y + m31 * z + m11 * x) ** 2) *
            (m22 ** 2 + m23 ** 2 + m21 ** 2) -
            ((m22 * y + m32 * z + m12 * x) * m22 +
              (m23 * y + m33 * z + m13 * x) * m23 +
              (m21 * y + m31 * z + m11 * x) * m21) **
              2) *
          ((m22 * y + m32 * z + m12 * x) * m22 +
            (m23 * y + m33 * z + m13 * x) * m23 +
            (m21 * y + m31 * z + m11 * x) * m21)) /
        (sqrt(
          (m21 * y + m31 * z + m11 * x) ** 2 + (m22 * y + m32 * z + m12 * x) ** 2 + (m23 * y + m33 * z + m13 * x) ** 2
        ) *
          ((m22 * y + m32 * z + m12 * x) ** 2 +
            (m23 * y + m33 * z + m13 * x) ** 2 +
            (m21 * y + m31 * z + m11 * x) ** 2) **
            2)

      dz =
        (-3 *
          (((m22 * y + m32 * z + m12 * x) ** 2 +
            (m23 * y + m33 * z + m13 * x) ** 2 +
            (m21 * y + m31 * z + m11 * x) ** 2) *
            (m32 ** 2 + m33 ** 2 + m31 ** 2) -
            ((m22 * y + m32 * z + m12 * x) * m32 +
              (m23 * y + m33 * z + m13 * x) * m33 +
              (m21 * y + m31 * z + m11 * x) * m31) **
              2) *
          ((m22 * y + m32 * z + m12 * x) * m32 +
            (m23 * y + m33 * z + m13 * x) * m33 +
            (m21 * y + m31 * z + m11 * x) * m31)) /
        (sqrt(
          (m21 * y + m31 * z + m11 * x) ** 2 + (m22 * y + m32 * z + m12 * x) ** 2 + (m23 * y + m33 * z + m13 * x) ** 2
        ) *
          ((m22 * y + m32 * z + m12 * x) ** 2 +
            (m23 * y + m33 * z + m13 * x) ** 2 +
            (m21 * y + m31 * z + m11 * x) ** 2) **
            2)

      dv3[0] = dx
      dv3[1] = dy
      dv3[2] = dz

      return k1!
    }

    n.load(v.no)

    if (1) {
      let nmat = [
        [m.m11, m.m21, m.m31],
        [m.m12, m.m22, m.m32],
        [m.m13, m.m23, m.m33],
      ]

      let ret
      try {
        ret = numeric.eig(nmat, 1050)
      } catch (error: unknown) {
        ret = {
          E: {
            x: [new Vector3([0, 0, 0]), new Vector3([0, 0, 0]), new Vector3([0, 0, 0])],
          },
          lambda: {x: new Vector3([0, 0, 0])},
        }

        console.log((error as Error).stack)
        console.log(error)
        console.log('numeric.eigen error')
      }

      let x = ret.E.x
      pv.no[0] = x[0][0]
      pv.no[1] = x[1][0]
      pv.no[2] = x[2][0]

      pv.tan[0] = x[0][1]
      pv.tan[1] = x[1][1]
      pv.tan[2] = x[2][1]

      pv.bin[0] = x[0][2]
      pv.bin[1] = x[1][2]
      pv.bin[2] = x[2][2]

      pv.k1 = ret.lambda.x[0]
      pv.k2 = ret.lambda.x[1]
      pv.k3 = ret.lambda.x[2]

      if (Math.random() > 0.995) {
        let t = new Vector3(pv.no)
        let t2 = new Vector3(t)
        t.multVecMatrix(mat)

        t2.normalize()

        let t3a = [t[0], t[1], t[2]]
        let t3 = new Vector3(numeric.dot(t3a, nmat))
        t3.normalize()

        console.log(t, t2, t.dot(t2), ret, t3.dot(t2), t3)
        console.log(mat.toString())
      }

      //XXX
      /*
      pv.no.addFac(v.no, -pv.no.dot(v.no)).normalize();
      pv.tan.addFac(v.no, -pv.tan.dot(v.no)).normalize();
      pv.bin.addFac(v.no, -pv.bin.dot(v.no)).normalize();
      //*/

      pv.k = pv.k1

      eigen(pv.no, pv.k1)
      pv.lastd2k1.load(pv.d2k1)
      pv.dk1 = new Vector3(dv)
      pv.d2k1 = new Vector3(dv2)
      pv.d3k1 = new Vector3(dv3)

      eigen(pv.tan, pv.k2)
      pv.lastd2k2.load(pv.d2k2)
      pv.dk2 = new Vector3(dv)
      pv.d2k2 = new Vector3(dv2)
      pv.d3k2 = new Vector3(dv3)

      eigen(pv.bin, pv.k3)
      pv.lastd2k3.load(pv.d2k3)
      pv.dk3 = new Vector3(dv)
      pv.d2k3 = new Vector3(dv2)
      pv.d3k3 = new Vector3(dv3)
    } else {
      n.load(v.no).multVecMatrix(spacemat)

      pv.k1 = eigen(n, undefined, true)
      pv.lastd2k1.load(pv.d2k1)
      pv.no = new Vector3(n)
      pv.dk1 = new Vector3(dv)
      pv.d2k1 = new Vector3(dv2)
      pv.d3k1 = new Vector3(dv3)

      lastn = pv.no

      /*
      for (let v2 of v.neighbors) {
        if (v2.vectorDistanceSqr(v) > 0.00001) {
          n.load(v2).sub(v).normalize();
          break;
        }
      }//*/

      //n.addFac(v.no, -n.dot(v.no));
      //n.negate();

      n.cross(v.no).normalize().multVecMatrix(spacemat)

      //bias away from previous eigenvector
      m.m11 -= pv.k1
      m.m22 -= pv.k1
      m.m33 -= pv.k1
      //no need to invert here, matrix is symmetric

      pv.k2 = eigen(n, undefined, true)
      pv.lastd2k2.load(pv.d2k2)
      pv.tan = new Vector3(n)
      pv.dk2 = new Vector3(dv)
      pv.d2k2 = new Vector3(dv2)
      pv.d3k2 = new Vector3(dv3)

      pv.k = pv.k2
      //bias away from previous eigenvector
      m.m11 -= pv.k2
      m.m22 -= pv.k2
      m.m33 -= pv.k2
      //no need to invert here, matrix is symmetric

      n.cross(v.no).normalize().multVecMatrix(spacemat) //.negate();
      pv.k3 = eigen(n, undefined, true)
      pv.lastd2k3.load(pv.d2k3)
      pv.bin = new Vector3(n)
      pv.dk3 = new Vector3(dv)
      pv.d2k3 = new Vector3(dv2)
      pv.d3k3 = new Vector3(dv3)
    }

    if (0) {
      //XXX
      pv.no.addFac(v.no, -pv.no.dot(v.no))
      pv.tan.addFac(v.no, -pv.tan.dot(v.no))
      pv.bin.addFac(v.no, -pv.bin.dot(v.no))
    }
  }

  let dv2 = new Vector3()
  let dv3 = new Vector3()
  let dv4 = new Vector3()
  let dv5 = new Vector3()
  let dv6 = new Vector3()

  function cov(m: Matrix4['$matrix'], vno: Vector3, otherno: Vector3, w: number) {
    cntmp2.load(otherno).sub(vno).multVecMatrix(spacemat)
    //cntmp2.normalize();
    n = cntmp2

    m.m11 += n[0] * n[0] * w
    m.m12 += n[0] * n[1] * w
    m.m13 += n[0] * n[2] * w
    m.m21 += n[1] * n[0] * w
    m.m22 += n[1] * n[1] * w
    m.m23 += n[1] * n[2] * w
    m.m31 += n[2] * n[0] * w
    m.m32 += n[2] * n[1] * w
    m.m33 += n[2] * n[2] * w
  }

  for (let i = 0; i < 0; i++) {
    for (let v of verts) {
      let pv = v.customData[cd_curvt] as CurvVert2
      let dis = 0.0
      let tot = 0.0

      dv.zero()
      let error = 0.0

      for (let v2 of v.neighbors) {
        let pv2 = v2.customData[cd_curvt] as CurvVert2
        let w = 1.0

        dis += pv2.error * w
        tot += w
      }

      if (!tot) {
        continue
      }

      dis /= tot
      error /= tot

      pv.error += (dis - error) * 0.75

      v.flag |= MeshFlags.UPDATE
    }
  }

  let tmp2 = new Vector3()
  let tmp3 = new Vector3()
  let tmp4 = new Vector3()

  for (let v of verts) {
    v.flag |= MeshFlags.UPDATE

    let pv = v.customData[cd_curvt] as CurvVert2

    let error = (pv.k2 + pv.k3) ** 2
    let vec = tmp3

    tmp2.load(pv.dk2).add(pv.dk3).mul(tmp2)

    vec
      .load(pv.d2k2)
      .add(pv.d2k3)
      .mulScalar(pv.k2 + pv.k3)
    vec.add(tmp2).mulScalar(2.0)

    error = vec.dot(vec) //pv.d2k3.dot(pv.d2k3);

    tmp4.load(pv.dk2).add(pv.dk3)
    tmp2.load(pv.d2k2).add(pv.d2k3).mul(tmp4).mulScalar(3.0)

    vec
      .load(pv.d3k2)
      .add(pv.d3k3)
      .mulScalar(pv.k2 + pv.k3)
    vec.add(tmp2).mulScalar(2.0)

    vec.load(pv.d2k2).add(pv.d2k3)

    if (vec.dot(vec) === 0.0) {
      continue
    }

    error /= vec.dot(vec)

    let co = new Vector3(v.co)

    let fac = -0.005

    if (isNaN(co.dot(co))) {
      console.warn('NaN!')
      co.load(v.co)
    }

    fac = pv.d2k1.vectorLength() //*0.5 + pv.dk3.vectorLength()*0.5;
    if (Math.abs(fac) > 1.0) {
      //fac = 1.0 / fac;
    }

    //co.addFac(v.no, fac);

    //v.addFac(pv.no, k*0.01);

    tmp2.load(pv.dk2).add(pv.dk3).mul(tmp2)

    vec
      .load(pv.d2k2)
      .add(pv.d2k3)
      .mulScalar(pv.k2 + pv.k3)
    vec.add(tmp2).mulScalar(2.0)

    error = (pv.k2 + pv.k3) ** 2
    //error = pv.d2k2.dot(pv.d2k2) + pv.d2k3.dot(pv.d2k3);
    pv.error = error //pv.d2k2.dot(pv.d2k2) + pv.d2k3.dot(pv.d2k3);

    pv.errorvec.load(vec)

    if (0) {
      let totg = vec.dot(vec)
      if (totg > 0.0) {
        error /= totg

        co.addFac(vec, -error * 0.2)
      }
    } else if (0) {
      let fac = (pv.k1 + pv.k2 + pv.k3) ** 2

      if (fac !== 0.0) {
        fac = 1.0 / fac
      }

      fac *= -0.5

      co.addFac(pv.dk1, fac)
      co.addFac(pv.dk2, fac)
      co.addFac(pv.dk3, fac)
    }

    cos.push(co)
    //v.addFac(pv.bin, -k*0.01);
  }

  let vi = 0
  for (let v of verts) {
    //v.load(cos[vi]);
    vi++
  }

  //vertexSmooth(mesh, verts, 0.5);

  mesh.recalcNormals()
  mesh.regenRender()

  return {
    verts,
    edges,
    loops,
    faces,
  }
}

export function calcCurvShell(mesh: Mesh, cd_curvt: number, shell: Face[], mode: number) {
  let {verts, edges, faces} = curvatureTest(mesh, cd_curvt, shell, mode)
}

export function smoothParam(mesh: Mesh, verts: Iterable<Vertex> = mesh.verts) {
  if (!mesh.verts.customData.hasLayer('curvetest')) {
    console.error('No parameterization customdata layer')
    return
  }

  let cd_curvt = mesh.verts.customData.getLayerIndex('curvetest')
  let ps = mesh.verts.customData.flatlist[cd_curvt].getTypeSettings() as CurvVert2Settings

  for (let v of verts) {
    let pv = v.customData[cd_curvt] as CurvVert2
    pv.needsSmooth = true
  }

  for (let v of verts) {
    let pv = v.customData[cd_curvt] as CurvVert2

    pv.smooth(ps, v, cd_curvt)
  }

  for (let v of verts) {
    let pv = v.customData[cd_curvt] as CurvVert2

    pv.updateTangent(ps, v, cd_curvt)
  }
}

export function calcCurvMesh(mesh: Mesh, cd_curvt?: number, mode = calcCurvModes.SELECTED) {
  console.log('calcCurvMesh')

  if (cd_curvt === undefined) {
    cd_curvt = mesh.verts.customData.getLayerIndex('curvetest')
  }

  if (!mesh.verts.customData.hasLayer('curvetest')) {
    cd_curvt = mesh.verts.addCustomDataLayer('curvetest').index
  }

  let ps = mesh.verts.customData.flatlist[cd_curvt].getTypeSettings() as CurvVert2Settings

  let visit = new WeakSet()
  let stack: Face[] = []
  let shells: Face[][] = []

  for (let f of mesh.faces) {
    if (visit.has(f)) {
      continue
    }

    let shell: Face[] = []
    shells.push(shell)

    stack.push(f)
    while (stack.length > 0) {
      f = stack.pop()!
      visit.add(f)
      shell.push(f)

      for (let l of f.loops) {
        for (let l2 of l.e.loops) {
          if (!visit.has(l2.f)) {
            stack.push(l2.f)
            visit.add(l2.f)
          }
        }
      }
    }
  }

  console.log('shells', shells)

  for (let shell of shells) {
    calcCurvShell(mesh, cd_curvt, shell, mode)
  }

  for (let v of mesh.verts) {
    let pv = v.customData[cd_curvt] as CurvVert2
    pv.updateTangent(ps, v, cd_curvt)
  }
}

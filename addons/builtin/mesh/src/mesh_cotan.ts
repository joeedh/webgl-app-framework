import {Vector3} from '../../../../scripts/util/vectormath.js'
import * as util from '../../../../scripts/util/util.js'
import * as math from '../../../../scripts/util/math.js'
import {nstructjs, Vector3Like} from '../../../../scripts/path.ux/scripts/pathux.js'
import {CustomDataElem} from './customdata'
import {StructReader} from '../../../../scripts/path.ux/scripts/util/nstructjs.js'
import type {Vertex} from './mesh_types'

export const CotanVertFlags = {
  UPDATE: 1,
}

const digest = new util.HashDigest()

const _cota = new Vector3()
const _cotb = new Vector3()
const _cotc = new Vector3()

export function cotangent_tri_weight_v3(v1: Vector3Like, v2: Vector3Like, v3: Vector3Like): number {
  let c_len
  const a = _cota
  const b = _cotb
  const c = _cotc

  a.load(v2).sub(v1)
  b.load(v3).sub(v1)
  c.load(a).cross(b)

  c_len = c.vectorLength()

  if (c_len > 0.00001) {
    return a.dot(b) / c_len
  }

  return 0.0
}

// TODO: check if (mathematically speaking) is it really necassary
// to sort the edge lists around verts

const _pr = new Vector3()
const _pq = new Vector3()

// from http://rodolphe-vaillant.fr/?e=20
export function tri_voronoi_area(p: Vector3Like, q: Vector3Like, r: Vector3Like): number {
  const pr = _pr
  const pq = _pq

  pr.load(p).sub(r)
  pq.load(p).sub(q)

  const angles = math.tri_angles(p, q, r)

  if (angles[0] > Math.PI * 0.5) {
    return math.tri_area(p, q, r) / 2.0
  } else if (angles[1] > Math.PI * 0.5 || angles[2] > Math.PI * 0.5) {
    return math.tri_area(p, q, r) / 2.0
  } else {
    const dpr = pr.dot(pr)
    const dpq = pq.dot(pq)

    const area = (1.0 / 8.0) * (dpr * cotangent_tri_weight_v3(q, p, r) + dpq * cotangent_tri_weight_v3(r, q, p))

    return area
  }
}

export class CotanVert extends CustomDataElem {
  ws: number[]
  cot1: number[]
  cot2: number[]
  areas: number[]
  totarea: number
  _last_hash: number
  flag: number

  constructor() {
    super()

    this.ws = []
    this.cot1 = []
    this.cot2 = []
    this.areas = []
    this.totarea = 0

    this._last_hash = 0

    this.flag = CotanVertFlags.UPDATE
  }

  static define() {
    return {
      elemTypeMask : 0,
      typeName     : 'cotan',
      uiName       : 'cotan',
      defaultName  : 'cotan',
      valueSize    : undefined,
      settingsClass: undefined,
    }
  }

  calcMemSize(): number {
    return this.ws.length * 8 * 4 + 8
  }

  interp(dest: this, _datas: this[], _ws: number[]) {
    dest.flag |= CotanVertFlags.UPDATE
  }

  copyTo(b: this) {
    b.flag = this.flag | CotanVertFlags.UPDATE

    b.ws = this.ws.concat([])
    b.cot1 = this.cot1.concat([])
    b.cot2 = this.cot2.concat([])
    b.areas = this.areas.concat([])
    b.totarea = this.totarea
  }

  check(v: Vertex, cd_cotan: number): boolean {
    if (this.flag & CotanVertFlags.UPDATE) {
      this.recalc(v)
      return true
    }

    digest.reset()
    digest.add(v.co[0])
    digest.add(v.co[1])
    digest.add(v.co[2])
    digest.add(v.edges.length)
    digest.add(v.no[0])
    digest.add(v.no[1])
    digest.add(v.no[2])

    const hash = digest.get()

    if (hash !== this._last_hash) {
      this._last_hash = hash
      this.flag |= CotanVertFlags.UPDATE

      //flag surrounding verts too
      for (const v2 of v.neighbors) {
        ;(v2.customData[cd_cotan] as CotanVert).flag |= CotanVertFlags.UPDATE
      }
    }

    if (this.flag & CotanVertFlags.UPDATE) {
      this.recalc(v)
      return true
    }

    return false
  }

  recalc(v: Vertex) {
    this.flag &= ~CotanVertFlags.UPDATE
    const val = v.edges.length

    if (this.ws.length !== val) {
      this.ws.length = val
      this.cot1.length = val
      this.cot2.length = val
      this.areas.length = val
    }

    let totarea = 0.0

    const ws = this.ws
    const cot1 = this.cot1
    const cot2 = this.cot2
    const areas = this.areas

    for (let i = 0; i < val; i++) {
      const eprev = v.edges[(i + val - 1) % val]
      const e = v.edges[i]
      const enext = v.edges[(i + 1) % val]

      const v1 = eprev.otherVertex(v)
      const v2 = e.otherVertex(v)
      const v3 = enext.otherVertex(v)

      const cot1_th = cotangent_tri_weight_v3(v1.co, v.co, v2.co)
      const cot2_th = cotangent_tri_weight_v3(v3.co, v2.co, v.co)

      let area = tri_voronoi_area(v.co, v1.co, v2.co)

      const w = cot1_th + cot2_th

      if (isNaN(w) || isNaN(area)) {
        console.log(v, v1, v2)
        debugger
        area = tri_voronoi_area(v.co, v1.co, v2.co)
      }

      ws[i] = w
      cot1[i] = cot1_th
      cot2[i] = cot2_th
      areas[i] = area
      totarea += area
    }

    if (totarea === 0.0) {
      return
    }

    const mul = 1.0 / (2.0 * totarea)

    for (let i = 0; i < val; i++) {
      ws[i] *= mul

      if (isNaN(ws[i])) {
        debugger
      }
    }
  }

  loadSTRUCT(reader: StructReader<this>) {
    super.loadSTRUCT(reader)

    this.flag |= CotanVertFlags.UPDATE
  }
}

CotanVert.STRUCT =
  nstructjs.inherit(CotanVert, CustomDataElem) +
  `
  ws           : array(float);
  cot1         : array(float);
  cot2         : array(float);
  areas        : array(float);
  totarea      : float;
  flag         : int;
  _last_hash   : int;
}`

nstructjs.register(CotanVert)
CustomDataElem.register(CotanVert)

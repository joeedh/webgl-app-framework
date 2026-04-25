import {nstructjs} from '../path.ux/pathux'
import {AttrSet} from './litemesh_attrSet'
import {AttrTypes} from './litemesh_base'
import { BoolAttribute, Float3Attribute, Int2Attribute, Int4Attribute, IntAttribute, ShortAttribute } from './litemesh_types'

export class VertexData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.VertexData {}')

  constructor() {
    super()

    this.ensureAttr(AttrTypes.FLOAT3, 'positions')
    this.ensureAttr(AttrTypes.FLOAT3, 'normals')
    this.ensureAttr(AttrTypes.BOOL, 'select')
    this.ensureAttr(AttrTypes.INT, 'e')
  }

  get positions() {
    return this.attrs.get('positions') as Float3Attribute
  }
  get normals() {
    return this.attrs.get('normals') as Float3Attribute
  }
  get select() {
    return this.attrs.get('select') as BoolAttribute
  }
}

export class EdgeData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.EdgeData {}')

  constructor() {
    super()
    this.ensureAttr(AttrTypes.INT2, '.edge.vs')
    this.ensureAttr(AttrTypes.INT4, '.edge.vs.disk')
    this.ensureAttr(AttrTypes.BOOL, '.edge.select')
    this.ensureAttr(AttrTypes.INT, '.edge.c')
  }

  get vs() {
    return this.attrs.get('.edge.vs') as Int2Attribute
  }
  get disk() {
    return this.attrs.get('.edge.vs.disk') as Int4Attribute
  }
  get select() {
    return this.attrs.get('.edge.select') as BoolAttribute
  }
  get c() {
    return this.attrs.get('.edge.c') as IntAttribute
  }
}


export class CornerData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.CornerData {}')
  constructor() {
    super()
    this.ensureAttr(AttrTypes.INT, '.corner.v')
    this.ensureAttr(AttrTypes.INT, '.corner.e')
    this.ensureAttr(AttrTypes.INT, '.corner.l')
    this.ensureAttr(AttrTypes.INT, '.corner.next')
    this.ensureAttr(AttrTypes.INT, '.corner.prev')
    this.ensureAttr(AttrTypes.INT, '.corner.radial_next')
    this.ensureAttr(AttrTypes.INT, '.corner.radial_prev')
  }
  get v() {
    return this.attrs.get('.corner.v') as IntAttribute
  }
  get e() {
    return this.attrs.get('.corner.e') as IntAttribute
  }
  get l() {
    return this.attrs.get('.corner.l') as IntAttribute
  }
  get next() {
    return this.attrs.get('.corner.next') as IntAttribute
  }
  get prev() {
    return this.attrs.get('.corner.prev') as IntAttribute
  }
  get radial_next() {
    return this.attrs.get('.corner.radial_next') as IntAttribute
  }
  get radial_prev() {
    return this.attrs.get('.corner.radial_prev') as IntAttribute
  }
}

/** Face boundary/hole list. */
export class ListData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.ListData {}')
  constructor() {
    super()
    this.ensureAttr(AttrTypes.INT, '.list.c')
    this.ensureAttr(AttrTypes.INT, '.list.f')
    this.ensureAttr(AttrTypes.INT, '.list.next')
    this.ensureAttr(AttrTypes.INT, '.list.size')
  }
  get c() {
    return this.attrs.get('.list.c') as IntAttribute
  }
  get f() {
    return this.attrs.get('.list.f') as IntAttribute
  }
  get next() {
    return this.attrs.get('.list.next') as IntAttribute
  }
  get size() {
    return this.attrs.get('.list.size') as IntAttribute
  }
}

export class FaceData extends AttrSet {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.FaceData {}')
  constructor() {
    super()
    this.ensureAttr(AttrTypes.SHORT, '.face.list_count')
    this.ensureAttr(AttrTypes.INT, '.face.list')
    this.ensureAttr(AttrTypes.FLOAT3, '.face.normal')
  }
  get list_count() {
    return this.attrs.get('.face.list_count') as ShortAttribute
  }
  get list() {
    return this.attrs.get('.face.list') as IntAttribute
  }
  get normal() {
    return this.attrs.get('.face.normal') as Float3Attribute
  }
}

export class LiteMesh {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.LiteMesh {
        v: litemesh.VertexData;
    }
    `
  )

  v = new VertexData()

  constructor() {
    //
  }
}

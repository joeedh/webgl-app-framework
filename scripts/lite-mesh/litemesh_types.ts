import {nstructjs, Vector2, Vector3, Vector4} from '../path.ux/pathux'
import {cachering} from '../util/util'
import {AttrTypes} from './litemesh_base'
import {AttrPageType} from './litemesh_page'

export type AttrPageOf<T extends AttrTypes> = AttrPageType & {type: T}

export abstract class Attribute<T extends AttrTypes, V extends number | number[] | Vector2 | Vector3 | Vector4> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.Attribute {
      name: string;
      pageSize: int;
      pages: array(abstract(litemesh.AttrPage));
    }
  `
  )

  name: string = ''
  type: AttrTypes
  pageSize: number = 4096
  // since there is no such thing as a float3[] array buffer,
  // we store each component in a separate page
  pageDivisor: number = 1
  pages: AttrPageOf<T>[] = []

  constructor(type: AttrTypes) {
    this.type = type
  }

  abstract get(i: number): V
  abstract set(i: number, value: V): void

  loadSTRUCT(reader: nstructjs.StructReader<this>) {
    reader(this)
  }
}

export type AttributeAny = Attribute<AttrTypes, any>

class NumberAttribute<TYPE extends AttrTypes> extends Attribute<TYPE, number> {
  get(i: number): number {
    return this.pages[~~(i / this.pageSize)]!.data![i % this.pageSize]
  }
  set(i: number, value: number): void {
    this.pages[~~(i / this.pageSize)]!.data![i % this.pageSize] = value
  }
}

export class FloatAttribute extends NumberAttribute<AttrTypes.FLOAT> {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.FloatAttribute')
  constructor() {
    super(AttrTypes.FLOAT)
  }
}
export class ByteAttribute extends NumberAttribute<AttrTypes.BYTE> {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.ByteAttribute')
  constructor() {
    super(AttrTypes.BYTE)
  }
}

export class IntAttribute extends NumberAttribute<AttrTypes.INT> {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.IntAttribute')
  constructor() {
    super(AttrTypes.INT)
  }
}

export class ShortAttribute extends NumberAttribute<AttrTypes.SHORT> {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.ShortAttribute')
  constructor() {
    super(AttrTypes.SHORT)
  }
}

export class Float2Attribute extends Attribute<AttrTypes.FLOAT2, Vector2> {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.Float2Attribute')
  protected cachering = cachering.fromConstructor(Vector2, 64)

  constructor() {
    super(AttrTypes.FLOAT2)
  }

  /** Warning: returns values in a cachering! */
  get(i: number) {
    let i2 = (i % this.pageSize) * 2
    const data = this.pages[~~(i / this.pageSize)].data!
    const x = data[i2]
    const y = data[i2 + 1]
    return this.cachering.next().loadXY(x, y)
  }

  set(i: number, value: Vector2): void {
    let i2 = (i % this.pageSize) * 2
    const data = this.pages[~~(i / this.pageSize)].data!
    data[i2] = value[0]
    data[i2 + 1] = value[1]
  }
}

export class Float3Attribute extends Attribute<AttrTypes.FLOAT3, Vector3> {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.Float3Attribute')
  protected cachering = cachering.fromConstructor(Vector3, 64)

  constructor() {
    super(AttrTypes.FLOAT3)
  }

  /** Warning: returns values in a cachering! */
  get(i: number) {
    let i2 = (i % this.pageSize) * 3
    const data = this.pages[~~(i / this.pageSize)].data!
    const x = data[i2]
    const y = data[i2 + 1]
    const z = data[i2 + 2]
    return this.cachering.next().loadXYZ(x, y, z)
  }

  set(i: number, value: Vector3): void {
    let i2 = (i % this.pageSize) * 3
    const data = this.pages[~~(i / this.pageSize)].data!
    data[i2] = value[0]
    data[i2 + 1] = value[1]
    data[i2 + 2] = value[2]
  }
}

export class Float4Attribute extends Attribute<AttrTypes.FLOAT4, Vector4> {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.Float4Attribute')
  protected cachering = cachering.fromConstructor(Vector4, 64)

  constructor() {
    super(AttrTypes.FLOAT4)
  }

  /** Warning: returns values in a cachering! */
  get(i: number) {
    let i2 = (i % this.pageSize) * 4
    const data = this.pages[~~(i / this.pageSize)].data!
    const x = data[i2]
    const y = data[i2 + 1]
    const z = data[i2 + 2]
    const w = data[i2 + 3]
    return this.cachering.next().loadXYZW(x, y, z, w)
  }

  set(i: number, value: Vector4): void {
    let i2 = (i % this.pageSize) * 4
    const data = this.pages[~~(i / this.pageSize)].data!
    data[i2] = value[0]
    data[i2 + 1] = value[1]
    data[i2 + 2] = value[2]
    data[i2 + 3] = value[3]
  }
}

export class Int2Attribute extends Attribute<AttrTypes.INT2, Vector2> {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.Int2Attribute')
  protected cachering = cachering.fromConstructor(Vector2, 64)

  constructor() {
    super(AttrTypes.INT2)
  }

  /** Warning: returns values in a cachering! */
  get(i: number) {
    let i2 = (i % this.pageSize) * 2
    const data = this.pages[~~(i / this.pageSize)].data!
    const x = data[i2]
    const y = data[i2 + 1]
    return this.cachering.next().loadXY(x, y)
  }

  set(i: number, value: Vector2): void {
    let i2 = (i % this.pageSize) * 2
    const data = this.pages[~~(i / this.pageSize)].data!
    data[i2] = value[0]
    data[i2 + 1] = value[1]
  }
}

export class Int3Attribute extends Attribute<AttrTypes.INT3, Vector3> {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.Int3Attribute')
  protected cachering = cachering.fromConstructor(Vector3, 64)

  constructor() {
    super(AttrTypes.INT3)
  }

  /** Warning: returns values in a cachering! */
  get(i: number) {
    let i2 = (i % this.pageSize) * 3
    const data = this.pages[~~(i / this.pageSize)].data!
    const x = data[i2]
    const y = data[i2 + 1]
    const z = data[i2 + 2]
    return this.cachering.next().loadXYZ(x, y, z)
  }

  set(i: number, value: Vector3): void {
    let i2 = (i % this.pageSize) * 3
    const data = this.pages[~~(i / this.pageSize)].data!
    data[i2] = value[0]
    data[i2 + 1] = value[1]
    data[i2 + 2] = value[2]
  }
}

export class Int4Attribute extends Attribute<AttrTypes.INT4, Vector4> {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.Int4Attribute')
  protected cachering = cachering.fromConstructor(Vector4, 64)

  constructor() {
    super(AttrTypes.INT4)
  }

  /** Warning: returns values in a cachering! */
  get(i: number) {
    let i2 = (i % this.pageSize) * 4
    const data = this.pages[~~(i / this.pageSize)].data!
    const x = data[i2]
    const y = data[i2 + 1]
    const z = data[i2 + 2]
    const w = data[i2 + 3]
    return this.cachering.next().loadXYZW(x, y, z, w)
  }

  set(i: number, value: Vector4): void {
    let i2 = (i % this.pageSize) * 4
    const data = this.pages[~~(i / this.pageSize)].data!
    data[i2] = value[0]
    data[i2 + 1] = value[1]
    data[i2 + 2] = value[2]
    data[i2 + 3] = value[3]
  }
}

export class BoolAttribute extends ByteAttribute {
  static STRUCT = nstructjs.inlineRegister(this, 'litemesh.BoolAttribute')
  
  constructor() {
    super()
  }
}

export const AttributeClasses = {
  [AttrTypes.FLOAT] : FloatAttribute,
  [AttrTypes.BYTE]  : ByteAttribute,
  [AttrTypes.BOOL]  : BoolAttribute,
  [AttrTypes.SHORT] : ShortAttribute,
  [AttrTypes.INT]   : IntAttribute,
  [AttrTypes.FLOAT3]: Float3Attribute,
  [AttrTypes.INT2]  : Int2Attribute,
  [AttrTypes.INT3]  : Int3Attribute,
  [AttrTypes.INT4]  : Int4Attribute,
} as const

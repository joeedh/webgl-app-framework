import {StructReader} from 'nstructjs'
import {nstructjs} from '../path.ux/pathux'
import {AttrTypes} from './litemesh_base'

export abstract class AttrPage<T, TYPE extends AttrTypes> {
  type: TYPE
  length: number
  data?: T

  static STRUCT = nstructjs.inlineRegister(
    this,
    `
        litemesh.AttrPage {
            type: byte;
            length: int;
        }
    `
  )

  constructor(type: TYPE, length: number) {
    this.type = type
    this.length = length
  }

  abstract construct(): void
}

export class IntPage extends AttrPage<Int32Array, AttrTypes.INT> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.IntPage {
        data: iter(int) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrTypes.INT, length)
  }

  construct() {
    this.data = new Int32Array(this.length)
  }

  loadSTRUCT(reader: StructReader) {
    reader(this)
    if (!this.data?.length) {
      this.data = undefined
    } else {
      this.data = new Int32Array(this.data)
    }
  }
}

export class ShortPage extends AttrPage<Int16Array, AttrTypes.SHORT> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.IntPage {
        data: iter(short) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrTypes.SHORT, length)
  }

  construct() {
    this.data = new Int16Array(this.length)
  }

  loadSTRUCT(reader: StructReader) {
    reader(this)
    if (!this.data?.length) {
      this.data = undefined
    } else {
      this.data = new Int16Array(this.data)
    }
  }
}

export class BytePage extends AttrPage<Int8Array, AttrTypes.BYTE> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.BytePage {
        data: iter(byte) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrTypes.BYTE, length)
  }

  construct() {
    this.data = new Int8Array(this.length)
  }

  loadSTRUCT(reader: StructReader) {
    reader(this)
    if (!this.data?.length) {
      this.data = undefined
    } else {
      this.data = new Int8Array(this.data)
    }
  }
}

export class FloatPage extends AttrPage<Float32Array, AttrTypes.FLOAT> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.FloatPage {
        data: iter(float) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrTypes.FLOAT, length)
  }

  construct() {
    this.data = new Float32Array(this.length)
  }

  loadSTRUCT(reader: StructReader) {
    reader(this)
    if (!this.data?.length) {
      this.data = undefined
    } else {
      this.data = new Float32Array(this.data)
    }
  }
}

export class Vec2Page extends AttrPage<Float32Array, AttrTypes.FLOAT2> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.Vec2Page {
        data: iter(float) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrTypes.FLOAT2, length)
  }

  construct() {
    this.data = new Float32Array(this.length * 2)
  }

  loadSTRUCT(reader: StructReader) {
    reader(this)
    if (!this.data?.length) {
      this.data = undefined
    } else {
      this.data = new Float32Array(this.data)
    }
  }
}

export class Vec3Page extends AttrPage<Float32Array, AttrTypes.FLOAT3> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.Vec3Page {
        data: iter(float) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrTypes.FLOAT3, length)
  }

  construct() {
    this.data = new Float32Array(this.length * 3)
  }

  loadSTRUCT(reader: StructReader) {
    reader(this)
    if (!this.data?.length) {
      this.data = undefined
    } else {
      this.data = new Float32Array(this.data)
    }
  }
}

export class Vec4Page extends AttrPage<Float32Array, AttrTypes.FLOAT4> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.Vec4Page {
        data: iter(float) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrTypes.FLOAT4, length)
  }

  construct() {
    this.data = new Float32Array(this.length * 4)
  }

  loadSTRUCT(reader: StructReader) {
    reader(this)
    if (!this.data?.length) {
      this.data = undefined
    } else {
      this.data = new Float32Array(this.data)
    }
  }
}




export class Int2Page extends AttrPage<Int32Array, AttrTypes.INT2> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.Int2Page {
        data: iter(int) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrTypes.INT2, length)
  }

  construct() {
    this.data = new Int32Array(this.length * 2)
  }

  loadSTRUCT(reader: StructReader) {
    reader(this)
    if (!this.data?.length) {
      this.data = undefined
    } else {
      this.data = new Int32Array(this.data)
    }
  }
}

export class Int3Page extends AttrPage<Int32Array, AttrTypes.INT3> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.Int3Page {
        data: iter(int) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrTypes.INT3, length)
  }

  construct() {
    this.data = new Int32Array(this.length * 3)
  }

  loadSTRUCT(reader: StructReader) {
    reader(this)
    if (!this.data?.length) {
      this.data = undefined
    } else {
      this.data = new Int32Array(this.data)
    }
  }
}

export class Int4Page extends AttrPage<Int32Array, AttrTypes.INT4> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.Int4Page {
        data: iter(int) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrTypes.INT4, length)
  }

  construct() {
    this.data = new Int32Array(this.length * 4)
  }

  loadSTRUCT(reader: StructReader) {
    reader(this)
    if (!this.data?.length) {
      this.data = undefined
    } else {
      this.data = new Int32Array(this.data)
    }
  }
}


export const AttrPageClasses = {
  [AttrTypes.BOOL] : BytePage,
  [AttrTypes.BYTE] : BytePage,
  [AttrTypes.SHORT] : ShortPage,
  [AttrTypes.INT]  : IntPage,
  [AttrTypes.FLOAT]: FloatPage,
  [AttrTypes.FLOAT2] : Vec2Page,
  [AttrTypes.FLOAT3] : Vec3Page,
  [AttrTypes.FLOAT4] : Vec4Page,
  [AttrTypes.INT2] : Int2Page,
  [AttrTypes.INT3] : Int3Page,
  [AttrTypes.INT4] : Int4Page,
} as const

export type AttrPageType = IntPage | BytePage | FloatPage | Vec2Page | Vec3Page | Vec4Page | Int2Page | Int3Page | Int4Page

import {StructReader} from 'nstructjs'
import {nstructjs} from '../path.ux/pathux'
import {AttrType} from './litemesh_base'

export abstract class AttrPage<T, TYPE extends AttrType> {
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

export class IntPage extends AttrPage<Int32Array, AttrType.INT> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.IntPage {
        data: iter(int) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrType.INT, length)
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

export class ShortPage extends AttrPage<Int16Array, AttrType.SHORT> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.IntPage {
        data: iter(short) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrType.SHORT, length)
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

export class BytePage extends AttrPage<Int8Array, AttrType.BYTE> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.BytePage {
        data: iter(byte) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrType.BYTE, length)
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

export class FloatPage extends AttrPage<Float32Array, AttrType.FLOAT> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.FloatPage {
        data: iter(float) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrType.FLOAT, length)
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

export class Vec2Page extends AttrPage<Float32Array, AttrType.FLOAT2> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.Vec2Page {
        data: iter(float) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrType.FLOAT2, length)
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

export class Vec3Page extends AttrPage<Float32Array, AttrType.FLOAT3> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.Vec3Page {
        data: iter(float) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrType.FLOAT3, length)
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

export class Vec4Page extends AttrPage<Float32Array, AttrType.FLOAT4> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.Vec4Page {
        data: iter(float) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrType.FLOAT4, length)
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




export class Int2Page extends AttrPage<Int32Array, AttrType.INT2> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.Int2Page {
        data: iter(int) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrType.INT2, length)
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

export class Int3Page extends AttrPage<Int32Array, AttrType.INT3> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.Int3Page {
        data: iter(int) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrType.INT3, length)
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

export class Int4Page extends AttrPage<Int32Array, AttrType.INT4> {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
    litemesh.Int4Page {
        data: iter(int) | this.data ?? [];
    }
    `
  )
  constructor(length: number) {
    super(AttrType.INT4, length)
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
  [AttrType.BOOL] : BytePage,
  [AttrType.BYTE] : BytePage,
  [AttrType.SHORT] : ShortPage,
  [AttrType.INT]  : IntPage,
  [AttrType.FLOAT]: FloatPage,
  [AttrType.FLOAT2] : Vec2Page,
  [AttrType.FLOAT3] : Vec3Page,
  [AttrType.FLOAT4] : Vec4Page,
  [AttrType.INT2] : Int2Page,
  [AttrType.INT3] : Int3Page,
  [AttrType.INT4] : Int4Page,
} as const

export type AttrPageType = IntPage | BytePage | FloatPage | Vec2Page | Vec3Page | Vec4Page | Int2Page | Int3Page | Int4Page

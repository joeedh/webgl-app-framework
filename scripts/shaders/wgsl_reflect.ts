/**
 * WGSL uniform-struct reflection.
 *
 * WGSL declares uniform buffer layouts explicitly. To keep the loose
 * `uniforms` object call sites already pass through `IUniformsBlock`,
 * we parse WGSL source at pipeline-creation time, extract each uniform
 * struct's field names + types + std140-ish offsets, and let
 * `Pipeline.setUniforms(obj)` write fields by name.
 *
 * The parser is regex-level — WGSL uniform structs in the shaders we
 * emit are simple (scalar + vec/mat + arrays of them, no nested structs
 * other than `array<T, N>`).
 */

export type WgslScalarType = 'f32' | 'i32' | 'u32'
export type WgslType =
  | WgslScalarType
  | 'vec2f' | 'vec3f' | 'vec4f'
  | 'vec2i' | 'vec3i' | 'vec4i'
  | 'vec2u' | 'vec3u' | 'vec4u'
  | 'mat2x2f' | 'mat3x3f' | 'mat4x4f'
  | `array<${string}>`

export interface WgslField {
  name: string
  type: WgslType
  offset: number
  /** Byte size of one element (sans array stride padding). */
  size: number
  /** For `array<T,N>` fields: element count. */
  arrayLength?: number
}

export interface WgslStruct {
  name: string
  fields: WgslField[]
  /** Total byte size, padded to struct alignment. */
  size: number
}

/**
 * std140-ish size + alignment table for WGSL types. WGSL's actual rules
 * differ slightly from GLSL's std140 — see
 * https://www.w3.org/TR/WGSL/#alignment-and-size. For the field types we
 * actually use this matches the spec.
 */
const TYPE_TABLE: Record<string, {size: number; align: number}> = {
  f32     : {size: 4 , align: 4 },
  i32     : {size: 4 , align: 4 },
  u32     : {size: 4 , align: 4 },
  vec2f   : {size: 8 , align: 8 },
  vec2i   : {size: 8 , align: 8 },
  vec2u   : {size: 8 , align: 8 },
  vec3f   : {size: 12, align: 16},
  vec3i   : {size: 12, align: 16},
  vec3u   : {size: 12, align: 16},
  vec4f   : {size: 16, align: 16},
  vec4i   : {size: 16, align: 16},
  vec4u   : {size: 16, align: 16},
  mat2x2f : {size: 16, align: 8 },
  mat3x3f : {size: 48, align: 16},
  mat4x4f : {size: 64, align: 16},
}

const STRUCT_RE = /struct\s+(\w+)\s*\{([^}]*)\}/g
const ARRAY_RE = /^array<\s*(\w+)\s*,\s*(\d+)\s*>$/
// Match `field: type,` with optional `@align(N) @size(N)` decorators that
// we currently ignore (the layout we compute is the default WGSL layout).
const FIELD_RE = /(?:@\w+\([^)]*\)\s*)*(\w+)\s*:\s*([^,]+?)\s*(?:,|$)/g

function alignUp(value: number, align: number): number {
  return Math.ceil(value / align) * align
}

function lookupType(typeStr: string): {size: number; align: number; arrayLength?: number} {
  const arrayMatch = ARRAY_RE.exec(typeStr)
  if (arrayMatch) {
    const elem = arrayMatch[1]
    const len = parseInt(arrayMatch[2], 10)
    const inner = TYPE_TABLE[elem]
    if (!inner) throw new Error(`wgsl_reflect: unknown array element type ${elem}`)
    // Array stride in WGSL is the element size rounded up to its alignment.
    const stride = alignUp(inner.size, inner.align)
    return {size: stride * len, align: inner.align, arrayLength: len}
  }
  const entry = TYPE_TABLE[typeStr]
  if (!entry) throw new Error(`wgsl_reflect: unknown type ${typeStr}`)
  return entry
}

/**
 * Parse all `struct` declarations from a WGSL source. Caller picks the
 * one that matches its `@group(_) @binding(_) var<uniform>` declaration.
 */
export function reflectWgslStructs(source: string): Map<string, WgslStruct> {
  const out = new Map<string, WgslStruct>()
  const stripped = source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

  let m: RegExpExecArray | null
  STRUCT_RE.lastIndex = 0
  while ((m = STRUCT_RE.exec(stripped))) {
    const name = m[1]
    const body = m[2]
    const fields: WgslField[] = []
    let offset = 0
    let maxAlign = 4

    FIELD_RE.lastIndex = 0
    let fm: RegExpExecArray | null
    while ((fm = FIELD_RE.exec(body))) {
      const fieldName = fm[1]
      const typeStr = fm[2].trim()
      const t = lookupType(typeStr)
      offset = alignUp(offset, t.align)
      fields.push({
        name        : fieldName,
        type        : typeStr as WgslType,
        offset,
        size        : t.size,
        arrayLength : t.arrayLength,
      })
      offset += t.size
      maxAlign = Math.max(maxAlign, t.align)
    }

    out.set(name, {name, fields, size: alignUp(offset, maxAlign)})
  }

  return out
}

/**
 * Writer for a single uniform struct. Builds an ArrayBuffer matching the
 * struct's layout and exposes `.set(field, value)` for typed writes.
 */
export class UniformWriter {
  readonly struct: WgslStruct
  readonly buffer: ArrayBuffer
  private readonly f32: Float32Array
  private readonly i32: Int32Array
  private readonly u32: Uint32Array
  private readonly fieldMap: Map<string, WgslField>

  constructor(struct: WgslStruct) {
    this.struct = struct
    this.buffer = new ArrayBuffer(struct.size)
    this.f32 = new Float32Array(this.buffer)
    this.i32 = new Int32Array(this.buffer)
    this.u32 = new Uint32Array(this.buffer)
    this.fieldMap = new Map(struct.fields.map(f => [f.name, f]))
  }

  set(name: string, value: number | ArrayLike<number>): void {
    const field = this.fieldMap.get(name)
    if (!field) throw new Error(`UniformWriter: unknown field ${name}`)
    const byteOffset = field.offset
    const wordOffset = byteOffset >> 2

    if (typeof value === 'number') {
      if (field.type === 'i32') this.i32[wordOffset] = value
      else if (field.type === 'u32') this.u32[wordOffset] = value
      else this.f32[wordOffset] = value
      return
    }

    // Vector / matrix / array: copy element-by-element into the right view.
    const target =
      field.type.endsWith('i') ? this.i32 :
      field.type.endsWith('u') ? this.u32 :
      this.f32
    for (let i = 0; i < value.length; i++) {
      target[wordOffset + i] = value[i]
    }
  }

  /** Bulk-apply a `{fieldName: value}` map. Silently ignores unknown keys. */
  apply(obj: Record<string, number | ArrayLike<number>>): void {
    for (const [name, value] of Object.entries(obj)) {
      if (this.fieldMap.has(name)) this.set(name, value)
    }
  }
}

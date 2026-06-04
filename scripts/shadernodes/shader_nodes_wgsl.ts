/**
 * WGSL emitter for the shader-node graph. Walks the graph in sorted order
 * and asks each node to emit its own WGSL via `node.genWgsl(this)` (the
 * per-node codegen lives on the `ShaderNode` subclasses themselves, in
 * `shader_nodes.ts` / `math_node.ts`). This generator owns the shared
 * machinery: socket naming, type coercion, uniform/texture collection, and
 * assembly of the final WGSL module.
 *
 * Conventions (see `shader_lib_wgsl.ts`):
 *   `@group(0)` — per-frame uniforms + AO texture
 *   `@group(1)` — material: POINTLIGHTS @binding(0), SUNLIGHTS @binding(1),
 *                 material struct @binding(2), images @binding(3+)
 *   `@group(2)` — per-object (objectMatrix, normalMatrix, object_id, alpha)
 */

import type {Graph, GenericNode, NodeSocketType} from '../core/graph.js'
import {SocketTypes} from '../core/graph.js'
import {FloatSocket, Vec2Socket, Vec3Socket, Vec4Socket, Matrix4Socket} from '../core/graphsockets.js'
import type {ImageBlock} from '../image/image.js'
import {ShaderNode, OutputNode, ShaderContext, ClosureSocket} from './shader_nodes.js'
import {
  CLOSURE_WGSL,
  OBJECT_UNIFORMS_WGSL,
  FRAME_UNIFORMS_WGSL,
  SHADER_LIB_WGSL,
  ALPHA_HASH_WGSL,
  LightGenWgsl,
  type IRenderLights,
} from './shader_lib_wgsl.js'
import {preprocess} from '../shaders/preprocess.js'

/**
 * One geometry attribute a material reads (via an `AttributeNode`). Collected
 * while walking the graph, deduped by `name`, slot-assigned after the walk.
 * This array is the contract the renderengine hands to sculptcore: build one
 * vertex buffer per entry (by name), at the given `slot`, of `elemSize`
 * components — default-filled when the source layer is absent.
 */
export interface RequestedAttrDesc {
  /** Source attribute name on the mesh (e.g. `uv`, `color`). */
  name: string
  /** `AttributeCategory` (matches sculptcore AttrUse: COLOR=2, UV=4, GENERIC=0). */
  category: number
  /** Sanitized WGSL field name in VsIn/VsOut (e.g. `attr_uv`). */
  field: string
  /** WGSL element type (`vec2f` / `vec3f` / `vec4f`). */
  wgslType: string
  /** sculptcore `AttrType` bitflag (FLOAT2=2, FLOAT3=4, FLOAT4=8). */
  gpuType: number
  /** Component count (2 / 3 / 4). */
  elemSize: number
  /** Vertex `@location`, assigned after the graph walk (2 + index). */
  slot: number
}

/** Map an `AttributeCategory` to its WGSL/GPU element type. */
function attrCategoryType(category: number): {wgslType: string; gpuType: number; elemSize: number} {
  // AttributeCategory.COLOR === 2, UV === 4 (AttrUse bitflags); GENERIC === 0.
  if (category === 4) return {wgslType: 'vec2f', gpuType: 2, elemSize: 2} // UV → FLOAT2
  if (category === 2) return {wgslType: 'vec4f', gpuType: 8, elemSize: 4} // COLOR → FLOAT4
  return {wgslType: 'vec3f', gpuType: 4, elemSize: 3} // GENERIC → FLOAT3
}

function sanitizeAttrField(name: string): string {
  return 'attr_' + name.trim().replace(/[^A-Za-z0-9_]/g, '_')
}

export class WgslShaderGenerator {
  scene: unknown
  paramnames: Record<number, string>
  uniforms: Record<string, NodeSocketType>
  textures: Map<ImageBlock, number>
  requestedAttrs: Map<string, RequestedAttrDesc>
  graph: Graph<unknown> | undefined
  buf: string
  wgsl: string | undefined

  constructor(scene: unknown) {
    this.scene = scene
    this.paramnames = {}
    this.uniforms = {}
    this.textures = new Map()
    this.requestedAttrs = new Map()
    this.buf = ''

    this.paramnames[ShaderContext.GLOBALCO] = 'input.vGlobalCo'
    this.paramnames[ShaderContext.LOCALCO] = 'input.vLocalCo'
    this.paramnames[ShaderContext.SCREENCO] = 'vec3f(input.clipPos.xy, input.clipPos.z)'
    // COLOR has no fixed varying anymore — vertex color is requested by name
    // through an AttributeNode (category COLOR). Fall back to local position.
    this.paramnames[ShaderContext.COLOR] = 'vec3f(input.vLocalCo)'
  }

  getType(sock: NodeSocketType): string {
    if (sock instanceof ClosureSocket) return 'Closure'
    if (sock instanceof FloatSocket) return 'f32'
    if (sock instanceof Vec3Socket) return 'vec3f'
    if (sock instanceof Vec4Socket) return 'vec4f'
    if (sock instanceof Vec2Socket) return 'vec2f'
    if (sock instanceof Matrix4Socket) return 'mat4x4f'
    return 'f32'
  }

  getSocketName(sock: NodeSocketType): string {
    let name = sock.socketName
    name = '_' + name.trim().replace(/[ \t\n\r]/g, '_')
    name += '_' + sock.graph_id
    return name
  }

  coerce(socka: NodeSocketType, sockb: NodeSocketType): string {
    const n = this.getSocketName(socka)
    const ctorA = socka.constructor as new () => NodeSocketType
    const ctorB = sockb.constructor as new () => NodeSocketType
    if (socka instanceof ctorB || sockb instanceof ctorA) return n

    const sa = socka as NodeSocketType
    const sb = sockb as NodeSocketType

    if (sb instanceof FloatSocket) {
      if (sa instanceof Vec2Socket) return `(length(${n})/sqrt(2.0))`
      if (sa instanceof Vec3Socket) return `(length(${n})/sqrt(3.0))`
      if (sa instanceof Vec4Socket) return `(length(${n})/sqrt(4.0))`
      if (sa instanceof ClosureSocket) return `closure2float(${n})`
    } else if (sb instanceof Vec2Socket) {
      if (sa instanceof FloatSocket) return `vec2f(${n}, ${n})`
      if (sa instanceof Vec3Socket || sa instanceof Vec4Socket) return `(${n}).xy`
      if (sa instanceof ClosureSocket) return `closure2vec2(${n})`
    } else if (sb instanceof Vec3Socket) {
      if (sa instanceof FloatSocket) return `vec3f(${n}, ${n}, ${n})`
      if (sa instanceof Vec4Socket) return `(${n}).xyz`
      if (sa instanceof Vec2Socket) return `vec3f(${n}, 0.0)`
      if (sa instanceof ClosureSocket) return `closure2vec3(${n})`
    } else if (sb instanceof Vec4Socket) {
      if (sa instanceof FloatSocket) return `vec4f(${n}, ${n}, ${n}, 1.0)`
      if (sa instanceof Vec3Socket) return `vec4f(${n}, 1.0)`
      if (sa instanceof Vec2Socket) return `vec4f(${n}, 0.0, 0.0, 1.0)`
      if (sa instanceof ClosureSocket) return `closure2vec4(${n})`
    } else if (sb instanceof ClosureSocket) {
      if (sa instanceof Vec3Socket) return `vec3toclosure(${n})`
      if (sa instanceof Vec4Socket) return `vec4toclosure(${n})`
      if (sa instanceof FloatSocket) return `floattoclosure(${n})`
    }

    console.warn('WgslShaderGenerator: failed coercion', sa, sb)
    return '0.0'
  }

  /**
   * Resolve a socket to a WGSL expression. If connected, follows the edge
   * (coercing types if needed). Otherwise `fallback` decides the default:
   * a number indexes a `ShaderContext` coordinate-space varying, a string
   * is used verbatim as a WGSL expression; with no fallback an input socket
   * becomes a material uniform and an output socket its own name.
   */
  getSocketValue(sock: NodeSocketType, fallback?: number | string): string {
    if (sock.edges.length > 0 && sock.socketType === SocketTypes.INPUT) {
      const ctorA = sock.constructor as new () => NodeSocketType
      if (!(sock.edges[0] instanceof ctorA)) {
        return this.coerce(sock.edges[0], sock)
      }
      return this.getSocketValue(sock.edges[0])
    }
    if (fallback !== undefined) {
      return typeof fallback === 'number' ? this.paramnames[fallback] : fallback
    }
    if (sock.socketType === SocketTypes.INPUT) return this.getUniform(sock)
    return this.getSocketName(sock)
  }

  getUniform(sock: NodeSocketType): string {
    const name = this.getSocketName(sock)
    this.uniforms[name] = sock
    return `material.${name}`
  }

  getTexture(image: ImageBlock): string {
    if (!this.textures.has(image)) this.textures.set(image, this.textures.size)
    return `sampler_${image.lib_id}`
  }

  /**
   * Record that the material reads geometry attribute `name` (in `category`),
   * returning the WGSL expression (`input.<field>`) that reads its per-fragment
   * varying and the element type. Deduped by name; slots are assigned after the
   * full graph walk (see `_assignAttrSlots`). The renderer turns the collected
   * set into per-attribute vertex buffers handed to sculptcore.
   */
  requestAttribute(name: string, category: number): {field: string; wgslType: string} {
    let desc = this.requestedAttrs.get(name)
    if (!desc) {
      const {wgslType, gpuType, elemSize} = attrCategoryType(category)
      desc = {name, category, field: sanitizeAttrField(name), wgslType, gpuType, elemSize, slot: -1}
      this.requestedAttrs.set(name, desc)
    }
    return {field: `input.${desc.field}`, wgslType: desc.wgslType}
  }

  /** Assign each requested attribute its vertex `@location` (2 + index; 0/1 are
   * the implicit position/normal). Call once after the graph walk. */
  private _assignAttrSlots(): void {
    let i = 0
    for (const desc of this.requestedAttrs.values()) {
      desc.slot = 2 + i++
    }
  }

  /** Build the `VsIn` (vertex buffer layout) + `VsOut` (varyings) structs and
   * the `vs_main` pass-through, all sized to the requested-attribute set. This
   * is the single source of truth for the vertex interface — the C++ ShaderDef
   * attr order must match the `slot` field. */
  private _buildVertexStagesWgsl(): string {
    const attrs = [...this.requestedAttrs.values()].sort((a, b) => a.slot - b.slot)

    let vsIn = 'struct VsIn {\n'
    vsIn += '  @location(0) position : vec3f,\n'
    vsIn += '  @location(1) normal   : vec3f,\n'
    for (const a of attrs) vsIn += `  @location(${a.slot}) ${a.field} : ${a.wgslType},\n`
    vsIn += '};\n'

    let vsOut = 'struct VsOut {\n'
    vsOut += '  @builtin(position) clipPos : vec4f,\n'
    vsOut += '  @location(0) vNormal   : vec3f,\n'
    vsOut += '  @location(1) vGlobalCo : vec3f,\n'
    vsOut += '  @location(2) vLocalCo  : vec3f,\n'
    let loc = 3
    for (const a of attrs) vsOut += `  @location(${loc++}) ${a.field} : ${a.wgslType},\n`
    vsOut += '};\n'

    let passthrough = ''
    for (const a of attrs) passthrough += `  out.${a.field} = in.${a.field};\n`

    const vsMain = `
@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  let p_obj = object.objectMatrix * vec4f(in.position, 1.0);
  out.clipPos   = frame.projectionMatrix * vec4f(p_obj.xyz, 1.0);
  out.vNormal   = (object.normalMatrix * vec4f(in.normal, 0.0)).xyz;
  out.vGlobalCo = p_obj.xyz;
  out.vLocalCo  = in.position;
${passthrough}  return out;
}
`
    return `${vsIn}\n${vsOut}\n${vsMain}`
  }

  /** The collected requested-attribute set, slot-ordered. The renderengine
   * hands this to sculptcore after `generate()`. */
  getRequestedAttrs(): RequestedAttrDesc[] {
    return [...this.requestedAttrs.values()].sort((a, b) => a.slot - b.slot)
  }

  out(s: string): void {
    this.buf += s
  }

  generate(
    graph: Graph<unknown>,
    rlights: IRenderLights,
    extraDefines: Record<string, number | string | boolean> = {}
  ): this {
    this.graph = graph
    graph.sort()

    let output: OutputNode | undefined
    for (const node of graph.nodes) {
      if (node instanceof OutputNode) {
        output = node as OutputNode
        break
      }
    }
    if (!output) {
      this.wgsl = buildFallbackWgsl()
      return this
    }

    const visit: Record<number, 1> = {}
    const rec = (n: GenericNode<unknown>) => {
      if (n.graph_id in visit) return
      visit[n.graph_id] = 1
      for (const k in n.inputs) {
        for (const e of n.inputs[k].edges) rec(e.node)
      }
    }
    rec(output)

    this.buf = ''
    for (const node of graph.sortlist) {
      if (!(node.graph_id in visit)) continue
      this.out(`// ${node.constructor?.name ?? 'node'}\n`)
      for (const k in node.outputs) {
        const sock = node.outputs[k]
        const type = this.getType(sock)
        const name = this.getSocketName(sock)
        this.out(`var ${name} : ${type};\n`)
      }
      this.out('{\n')
      ;(node as ShaderNode).genWgsl(this)
      this.out('\n}\n')
    }

    // Attributes were collected during the walk (via requestAttribute); assign
    // their vertex slots now and build the matching VsIn/VsOut/vs_main.
    this._assignAttrSlots()
    const vertexStages = this._buildVertexStagesWgsl()

    let materialStruct = 'struct MaterialUniforms {\n'
    const fields: string[] = []
    for (const k in this.uniforms) {
      const t = this.getType(this.uniforms[k])
      fields.push(`  ${k} : ${t}`)
    }
    if (fields.length === 0) fields.push('  _unused : f32')
    materialStruct += fields.join(',\n') + ',\n};\n'
    materialStruct += '@group(1) @binding(2) var<uniform> material : MaterialUniforms;\n'

    let texdecl = ''
    let texBinding = 3
    for (const image of this.textures.keys()) {
      const key = `sampler_${image.lib_id}`
      texdecl += `@group(1) @binding(${texBinding}) var ${key}_tex : texture_2d<f32>;\n`
      texdecl += `@group(1) @binding(${texBinding + 1}) var ${key}_smp : sampler;\n`
      texBinding += 2
    }

    const lightPre = LightGenWgsl.pre()
    const defines: Record<string, number | string | boolean> = {
      ...LightGenWgsl.genDefines(rlights),
      ...extraDefines,
    }

    const wgslBody = `
${CLOSURE_WGSL}
${FRAME_UNIFORMS_WGSL}
${OBJECT_UNIFORMS_WGSL}
${lightPre}
${materialStruct}
${texdecl}
${vertexStages}
${SHADER_LIB_WGSL}

@fragment
fn fs_main(input : VsOut) -> @location(0) vec4f {
  var _mainSurface : Closure;
  _mainSurface.diffuse  = vec3f(0.0);
  _mainSurface.light    = vec3f(0.0);
  _mainSurface.emission = vec3f(0.0);
  _mainSurface.scatter  = vec3f(0.0);
  _mainSurface.alpha    = 1.0;

  ${this.buf.replace(/SHADER_SURFACE/g, '_mainSurface')}

  ${ALPHA_HASH_WGSL.replace(/SHADER_SURFACE/g, '_mainSurface')}

  return vec4f(_mainSurface.light + _mainSurface.emission, _mainSurface.alpha);
}
`
    // The preprocessor only handles `#ifdef`/`#define`/`#endif`; it does
    // NOT macro-expand `#define`d names inside arbitrary code lines.
    // Light templates use `MAXPLIGHT` as a literal inside
    // `array<PointLight, MAXPLIGHT>` and `li < MAXPLIGHT`, so after
    // preprocess we have to swap the integer values in by hand.
    let wgsl = preprocess(wgslBody, {defines})
    for (const [k, v] of Object.entries(defines)) {
      wgsl = wgsl.replace(new RegExp(`\\b${k}\\b`, 'g'), String(v))
    }
    this.wgsl = wgsl
    return this
  }

  /**
   * Pack material-side uniforms (`_color_42` etc) into `uniforms` for
   * `UniformBindings.write` to consume.
   */
  setMaterialUniforms(graph: Graph<unknown>, uniforms: Record<string, unknown>): void {
    for (const node of graph.sortlist) {
      for (const k in node.inputs) {
        const sock = node.inputs[k]
        if (sock.edges.length === 0) {
          const name = this.getSocketName(sock)
          if (name in this.uniforms) {
            uniforms[name] = sock.getValue() as unknown
          }
        }
      }
    }
  }
}

/** Minimal vertex interface (position+normal only) for the no-output fallback
 * shader — no requested attributes, so just the implicit slots 0/1. */
const FALLBACK_VERTEX_WGSL = `
struct VsIn {
  @location(0) position : vec3f,
  @location(1) normal   : vec3f,
};
struct VsOut {
  @builtin(position) clipPos : vec4f,
  @location(0) vNormal   : vec3f,
  @location(1) vGlobalCo : vec3f,
  @location(2) vLocalCo  : vec3f,
};
@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  let p_obj = object.objectMatrix * vec4f(in.position, 1.0);
  out.clipPos   = frame.projectionMatrix * vec4f(p_obj.xyz, 1.0);
  out.vNormal   = (object.normalMatrix * vec4f(in.normal, 0.0)).xyz;
  out.vGlobalCo = p_obj.xyz;
  out.vLocalCo  = in.position;
  return out;
}
`

function buildFallbackWgsl(): string {
  return `
${CLOSURE_WGSL}
${FRAME_UNIFORMS_WGSL}
${OBJECT_UNIFORMS_WGSL}
${FALLBACK_VERTEX_WGSL}
@fragment fn fs_main(input : VsOut) -> @location(0) vec4f { return vec4f(0.0, 0.0, 0.0, 1.0); }
`
}

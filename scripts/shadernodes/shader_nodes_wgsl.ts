/**
 * WGSL emitter for the shader-node graph. Mirror of `ShaderGenerator`
 * in `shader_nodes.ts` that targets WGSL instead of GLSL.
 *
 * Per-node emission lives in this file (not on the node classes
 * themselves) via a dispatch table keyed by node constructor. Keeps the
 * existing GLSL `genCode(gen)` methods untouched and lets nodes that
 * haven't been ported yet fall back to a default zero/passthrough
 * emission with a one-time warning.
 *
 * Conventions (see `shader_lib_wgsl.ts`):
 *   `@group(0)` — per-frame uniforms + AO texture
 *   `@group(1)` — material: POINTLIGHTS @binding(0), SUNLIGHTS @binding(1),
 *                 material struct @binding(2), images @binding(3+)
 *   `@group(2)` — per-object (objectMatrix, normalMatrix, object_id, alpha)
 */

import type {Graph, GenericNode, NodeSocketType} from '../core/graph.js'
import {SocketTypes} from '../core/graph.js'
import {
  FloatSocket,
  Vec2Socket,
  Vec3Socket,
  Vec4Socket,
  Matrix4Socket,
} from '../core/graphsockets.js'
import type {ImageBlock} from '../image/image.js'
import {
  ShaderNode,
  OutputNode,
  MixNode,
  MixModes,
  ImageNode,
  DiffuseNode,
  GeometryNode,
  ShaderContext,
  ClosureSocket,
} from './shader_nodes.js'
import {MathNode, MathNodeFuncs} from './math_node.js'
import {
  CLOSURE_WGSL,
  OBJECT_UNIFORMS_WGSL,
  FRAME_UNIFORMS_WGSL,
  VERTEX_INPUTS_WGSL,
  VERTEX_MAIN_WGSL,
  SHADER_LIB_WGSL,
  ALPHA_HASH_WGSL,
  LightGenWgsl,
  DiffuseBRDFWgsl,
  type IRenderLights,
} from './shader_lib_wgsl.js'
import {preprocess} from '../shaders/preprocess.js'

export class WgslShaderGenerator {
  scene: unknown
  paramnames: Record<number, string>
  uniforms: Record<string, NodeSocketType>
  textures: Map<ImageBlock, number>
  graph: Graph<unknown> | undefined
  buf: string
  wgsl: string | undefined

  constructor(scene: unknown) {
    this.scene = scene
    this.paramnames = {}
    this.uniforms = {}
    this.textures = new Map()
    this.buf = ''

    this.paramnames[ShaderContext.LOCALCO] = 'input.vLocalCo'
    this.paramnames[ShaderContext.GLOBALCO] = 'input.vGlobalCo'
    this.paramnames[ShaderContext.NORMAL] = 'input.vNormal'
    this.paramnames[ShaderContext.UV] = 'input.vuv'
    this.paramnames[ShaderContext.COLOR] = 'input.vColor'
    this.paramnames[ShaderContext.ID] = 'object.object_id'
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

  getSocketValue(sock: NodeSocketType, default_param?: number): string {
    if (sock.edges.length > 0 && sock.socketType === SocketTypes.INPUT) {
      const ctorA = sock.constructor as new () => NodeSocketType
      if (!(sock.edges[0] instanceof ctorA)) {
        return this.coerce(sock.edges[0], sock)
      }
      return this.getSocketValue(sock.edges[0])
    }
    if (default_param !== undefined) return this.paramnames[default_param]
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
      emitNode(node as ShaderNode, this)
      this.out('\n}\n')
    }

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
${VERTEX_INPUTS_WGSL}
${SHADER_LIB_WGSL}
${VERTEX_MAIN_WGSL}

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
   * `UniformBindings.write` to consume. Mirrors the GLSL side's
   * `IShaderDefCompilable.setUniforms` per-socket loop.
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

function buildFallbackWgsl(): string {
  return `
${CLOSURE_WGSL}
${FRAME_UNIFORMS_WGSL}
${OBJECT_UNIFORMS_WGSL}
${VERTEX_INPUTS_WGSL}
${VERTEX_MAIN_WGSL}
@fragment fn fs_main(input : VsOut) -> @location(0) vec4f { return vec4f(0.0, 0.0, 0.0, 1.0); }
`
}

// -------- per-node WGSL emission --------------------------------------------

type WgslEmit = (node: ShaderNode, gen: WgslShaderGenerator) => void
const emitters = new Map<unknown, WgslEmit>()

export function registerWgslEmit<T extends new (...args: never[]) => ShaderNode>(
  ctor: T,
  fn: (node: InstanceType<T>, gen: WgslShaderGenerator) => void
): void {
  emitters.set(ctor as unknown, fn as WgslEmit)
}

const warned = new Set<string>()

function emitNode(node: ShaderNode, gen: WgslShaderGenerator): void {
  const fn = emitters.get(node.constructor as unknown)
  if (fn) {
    fn(node, gen)
    return
  }
  const name = node.constructor?.name ?? '<unknown>'
  if (!warned.has(name)) {
    warned.add(name)
    console.warn(`WgslShaderGenerator: no emitter for ${name} — emitting defaults`)
  }
  for (const k in node.outputs) {
    const sock = node.outputs[k]
    const t = gen.getType(sock)
    const n = gen.getSocketName(sock)
    if (t === 'f32') gen.out(`${n} = 0.0;\n`)
    else if (t === 'vec2f') gen.out(`${n} = vec2f(0.0, 0.0);\n`)
    else if (t === 'vec3f') gen.out(`${n} = vec3f(0.0, 0.0, 0.0);\n`)
    else if (t === 'vec4f') gen.out(`${n} = vec4f(0.0, 0.0, 0.0, 1.0);\n`)
    else if (t === 'Closure') {
      gen.out(`${n}.diffuse = vec3f(0.0); ${n}.light = vec3f(0.0); `)
      gen.out(`${n}.emission = vec3f(0.0); ${n}.scatter = vec3f(0.0); ${n}.alpha = 1.0;\n`)
    }
  }
}

registerWgslEmit(OutputNode, (node, gen) => {
  gen.out(`_mainSurface = ${gen.getSocketValue(node.inputs.surface)};\n`)
})

registerWgslEmit(MixNode, (node, gen) => {
  let expr = 'a + (b - a)*fac'
  switch (node.mode) {
    case MixModes.MIX:
      expr = 'a + (b - a)*fac'
      break
    case MixModes.MULTIPLY:
      expr = 'a + (a*b - a)*fac'
      break
    case MixModes.DIVIDE:
      expr = 'a + (a/b - a)*fac'
      break
    case MixModes.ADD:
      expr = 'a + ((a+b) - a)*fac'
      break
    case MixModes.SUBTRACT:
      expr = 'a + ((a-b) - a)*fac'
      break
  }
  gen.out(`
    let a : vec4f = ${gen.getSocketValue(node.inputs.color1)};
    let b : vec4f = ${gen.getSocketValue(node.inputs.color2)};
    let fac : f32 = ${gen.getSocketValue(node.inputs.factor)};
    ${gen.getSocketName(node.outputs.color)} = ${expr};
  `)
})

registerWgslEmit(ImageNode, (node, gen) => {
  const out = gen.getSocketName(node.outputs.color)
  if (node.imageUser.image) {
    const tex = gen.getTexture(node.imageUser.image)
    gen.out(`
      let uv : vec2f = ${gen.getSocketValue(node.inputs.uv, ShaderContext.UV)};
      let _c : vec4f = textureSample(${tex}_tex, ${tex}_smp, uv);
      ${out} = vec4f(_c.rgb, 1.0);
    `)
  } else {
    gen.out(`${out} = vec4f(1.0, 1.0, 1.0, 1.0);\n`)
  }
})

registerWgslEmit(DiffuseNode, (node, gen) => {
  const brdf = DiffuseBRDFWgsl.gen('cl', 'co', 'normal', 'color')
  const lights = LightGenWgsl.generate('cl', 'co', 'normal', 'color', brdf)
  const surfName = gen.getSocketName(node.outputs.surface)
  gen.out(`
    var cl : Closure;
    cl.diffuse  = vec3f(0.0);
    cl.light    = vec3f(0.0);
    cl.emission = vec3f(0.0);
    cl.scatter  = vec3f(0.0);
    cl.alpha    = 1.0;

    let co : vec3f = input.vGlobalCo;
    let roughness : f32 = ${gen.getSocketValue(node.inputs.roughness)};
    let normal : vec3f = ${gen.getSocketValue(node.inputs.normal, ShaderContext.NORMAL)};
    let color : vec4f = ${gen.getSocketValue(node.inputs.color)};

    cl.alpha   = color.a;
    cl.diffuse = color.rgb;

    ${lights}
    ${surfName} = cl;
  `)
})

registerWgslEmit(GeometryNode, (node, gen) => {
  gen.out(`
    ${gen.getSocketName(node.outputs.position)} = input.vGlobalCo;
    ${gen.getSocketName(node.outputs.local)}    = input.vLocalCo;
    ${gen.getSocketName(node.outputs.normal)}   = input.vNormal;
    ${gen.getSocketName(node.outputs.uv)}       = input.vuv;
    ${gen.getSocketName(node.outputs.screen)}   = vec3f(input.clipPos.xy, input.clipPos.z);
  `)
})

const WgslMathSnippets: Record<number, string> = {
  [MathNodeFuncs.ADD]  : 'A + B',
  [MathNodeFuncs.SUB]  : 'A - B',
  [MathNodeFuncs.MUL]  : 'A * B',
  [MathNodeFuncs.DIV]  : 'A / B',
  [MathNodeFuncs.POW]  : 'pow(A, B)',
  [MathNodeFuncs.SQRT] : 'sqrt(A)',
  [MathNodeFuncs.FLOOR]: 'floor(A)',
  [MathNodeFuncs.CEIL] : 'ceil(A)',
  [MathNodeFuncs.MIN]  : 'min(A, B)',
  [MathNodeFuncs.MAX]  : 'max(A, B)',
  [MathNodeFuncs.FRACT]: 'fract(A)',
  [MathNodeFuncs.TENT] : 'abs(fract(A) - 0.5) * 2.0',
  [MathNodeFuncs.COS]  : 'cos(A)',
  [MathNodeFuncs.SIN]  : 'sin(A)',
  [MathNodeFuncs.TAN]  : 'tan(A)',
  [MathNodeFuncs.ACOS] : 'acos(A)',
  [MathNodeFuncs.ASIN] : 'asin(A)',
  [MathNodeFuncs.ATAN] : 'atan(A)',
  [MathNodeFuncs.ATAN2]: 'atan2(B, A)',
  [MathNodeFuncs.LOG]  : 'log(A)',
  [MathNodeFuncs.EXP]  : 'exp(A)',
}

registerWgslEmit(MathNode, (node, gen) => {
  const snippet = WgslMathSnippets[node.mathFunc] ?? 'A'
  gen.out(`
    let A : f32 = ${gen.getSocketValue(node.inputs.a)};
    let B : f32 = ${gen.getSocketValue(node.inputs.b)};
    ${gen.getSocketName(node.outputs.value)} = ${snippet};
  `)
})

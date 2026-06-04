/**
 * WGSL port of `shader_lib.ts` ShaderFragments + LightGen + BRDFGen.
 *
 * The legacy GLSL emitter has been deleted; shader-node materials are
 * WGSL-only. The WGSL emitter (`WgslShaderGenerator`) consumes these
 * strings and produces a pipeline-ready WGSL module. Note the vertex
 * stages (`VsIn`/`VsOut`/`vs_main`) are no longer static — the generator
 * builds them dynamically per material from its requested-attribute set
 * (`_buildVertexStagesWgsl`), so only the uniform/closure/light fragments
 * below are shared here.
 *
 * Conventions:
 * - Per-frame uniforms live in `@group(0)` (mirrors `wgsl_shaders.ts`).
 * - Per-material uniforms live in `@group(1)` — the shader-network's
 *   emitted uniforms (RGB/value sliders, image textures) plus the
 *   light arrays and ambient/AO inputs.
 * - Per-object uniforms (`objectMatrix`, `object_id`, `alpha`) live in
 *   `@group(2)`. Same layout as `wgsl_shaders.ts:WIDGET_MESH_WGSL`.
 *
 * Light arrays use fixed `MAXPLIGHT` / `MAXSLIGHT` sizes injected via
 * the preprocessor's `defines` map.
 */

import {LightTypes} from '../light/light.js'
import {Vector3} from '../util/vectormath.js'
import * as util from '../util/util.js'
import type {Matrix4} from '../util/vectormath.js'
import type {RenderLight} from '../renderengine/renderengine_realtime.js'

export type IRenderLights = Record<string, RenderLight>

/**
 * Closure struct — mirrors `ClosureGLSL`. Carries the per-fragment
 * shading data that lighting / BRDF code accumulates into.
 */
export const CLOSURE_WGSL = `
struct Closure {
  diffuse      : vec3f,
  light        : vec3f,
  emission     : vec3f,
  scatter      : vec3f,
  // Per-channel world scatter radius (red bleeds widest). sssRadius is the
  // max component, used as the kernel footprint + silhouette mask; the full
  // vector drives the per-channel blur weights.
  sssRadiusVec : vec3f,
  sssRadius    : f32,
  alpha        : f32,
};
`

/**
 * Per-object uniform block — what `view3d_shaders.Shaders.BasicLitMesh`
 * stamps onto every drawable. The shader-network emitter stays at this
 * layout so `UniformBindings` can resolve `objectMatrix`/`object_id`/
 * `alpha` against existing IUniformsBlock callers without renaming.
 */
export const OBJECT_UNIFORMS_WGSL = `
struct ObjectUniforms {
  objectMatrix : mat4x4f,
  normalMatrix : mat4x4f,
  object_id    : f32,
  alpha        : f32,
  _pad0        : f32,
  _pad1        : f32,
};
@group(2) @binding(0) var<uniform> object : ObjectUniforms;
`

/**
 * Per-frame uniform block — mirrors `FRAME_UNIFORMS_WGSL` in
 * `wgsl_shaders.ts` but adds the ambient + AO controls the shader-net
 * emitter needs.
 */
export const FRAME_UNIFORMS_WGSL = `
struct FrameUniforms {
  projectionMatrix : mat4x4f,
  ambientColor     : vec3f,
  ambientPower     : f32,
  viewportSize     : vec2f,
  uSample          : f32,
  _pad0            : f32,
};
@group(0) @binding(0) var<uniform> frame : FrameUniforms;
@group(0) @binding(1) var passAO_tex : texture_2d<f32>;
@group(0) @binding(2) var passAO_smp : sampler;
`

/*
 * The vertex stages (`VsIn`/`VsOut`/`vs_main`) used to live here as fixed
 * `position`/`normal`/`uv`/`color` templates. They're now generated per
 * material from the requested-attribute set — see
 * `WgslShaderGenerator._buildVertexStagesWgsl` / `FALLBACK_VERTEX_WGSL` in
 * `shader_nodes_wgsl.ts`.
 */

/**
 * Closure helpers — vec3/vec4/float → Closure coercion, used by
 * `WgslShaderGenerator.coerce` when a node connects a non-closure
 * value to a closure-typed socket.
 *
 * Hash helpers (`hash1f`/`hash2f`/`hash3f`) mirror the GLSL versions in
 * `ShaderFragments.SHADERLIB` — used by `ALPHA_HASH`.
 */
export const SHADER_LIB_WGSL = `
fn hash1f(seed_in : f32) -> f32 {
  var seed = seed_in + frame.uSample;
  seed = fract(seed * 0.25234 + seed * sqrt(11.0));
  return fract(1.0 / (0.00001 + 0.00001 * fract(seed)));
}

fn hash2f(p : vec2f) -> f32 {
  let seed = p.y * sqrt(3.0) + p.x * sqrt(5.0);
  return fract(seed + frame.uSample * sqrt(2.0));
}

fn hash3f(p : vec3f) -> f32 {
  var seed = p.y * sqrt(3.0) + p.x * sqrt(5.0);
  seed = seed + fract(p.z * sqrt(11.0));
  return fract(seed + frame.uSample * sqrt(2.0));
}

fn vec3toclosure(c : vec3f) -> Closure {
  var ret : Closure;
  ret.diffuse  = vec3f(0.0);
  ret.light    = vec3f(0.0);
  ret.emission = c;
  ret.scatter  = vec3f(0.0);
  ret.alpha    = 1.0;
  return ret;
}

fn vec4toclosure(c : vec4f) -> Closure {
  var ret : Closure;
  ret.diffuse  = vec3f(0.0);
  ret.light    = vec3f(0.0);
  ret.emission = c.rgb;
  ret.scatter  = vec3f(0.0);
  ret.alpha    = c.a;
  return ret;
}

fn floattoclosure(c : f32) -> Closure {
  var ret : Closure;
  ret.diffuse  = vec3f(0.0);
  ret.light    = vec3f(0.0);
  ret.emission = vec3f(c, c, c);
  ret.scatter  = vec3f(0.0);
  ret.alpha    = 1.0;
  return ret;
}

fn closure2float(c : Closure) -> f32 {
  return (c.emission.x + c.emission.y + c.emission.z + c.light.x + c.light.y + c.light.z) / 6.0;
}

fn closure2vec2(c : Closure) -> vec2f {
  let s = c.emission + c.light;
  return vec2f(s.x, s.y);
}

fn closure2vec3(c : Closure) -> vec3f {
  return c.emission + c.light;
}

fn closure2vec4(c : Closure) -> vec4f {
  return vec4f(c.emission + c.light, c.alpha);
}
`

/**
 * Ambient + AO injection. Substitutes `CLOSURE` for the closure
 * variable name at the call site. `#ifdef WITH_AO` is honored by the
 * preprocessor when the material has AO upstream.
 */
export const AMBIENT_WGSL = `
{
#ifdef WITH_AO
  let _ao_uv = vec2f(input.clipPos.x, input.clipPos.y) / frame.viewportSize;
  let _ao = textureSample(passAO_tex, passAO_smp, _ao_uv).r;
  CLOSURE.light = CLOSURE.light + CLOSURE.diffuse * vec3f(_ao, _ao, _ao) * frame.ambientColor * frame.ambientPower;
#else
  CLOSURE.light = CLOSURE.light + CLOSURE.diffuse * frame.ambientColor * frame.ambientPower;
#endif
}
`

/**
 * Per-fragment alpha-hash dithering. `SHADER_SURFACE` gets substituted
 * for the actual closure variable name (typically `_mainSurface`).
 */
export const ALPHA_HASH_WGSL = `
{
  let _cam = (object.normalMatrix * vec4f(input.vGlobalCo, 1.0)).xyz;
  let _prob = hash3f(vec3f(input.clipPos.xy, _cam.z * 0.01));
  if (_prob > SHADER_SURFACE.alpha) {
    discard;
  }
}
`

// ---------------------------------------------------------------------------
// LightGen — same template-substitution machinery as the GLSL side, but
// emitting WGSL. PointLight and SunLight ports below.
// ---------------------------------------------------------------------------

export const LightGeneratorsWgsl: LightGenWgsl[] = []

interface LightGenWgslArgs {
  uniformName: string
  lightType: number
  name: string
  totname: string
  pre: string
  lightLoop: string
  getLightVector: (co: string, i: string) => string
  defines: string[]
}

export class LightGenWgsl {
  uniformName: string
  lightType: number
  name: string
  totname: string
  pre: string
  lightLoop: string
  getLightVector: (co: string, i: string) => string
  defines: string[]

  constructor(args: LightGenWgslArgs) {
    this.uniformName = args.uniformName
    this.lightType = args.lightType
    this.name = args.name
    this.totname = args.totname
    this.pre = args.pre
    this.lightLoop = args.lightLoop
    this.getLightVector = args.getLightVector
    this.defines = args.defines
  }

  /**
   * Pack the per-light arrays into the WebGPU material bind group. The
   * shape mirrors `LightGen.setUniforms` (light.ts side) so the same
   * RenderLight machinery feeds both backends.
   */
  static setUniforms(
    uniforms: Record<string, unknown>,
    scene: unknown,
    renderlights: IRenderLights = {},
    use_jitter = false,
    seed = 0.0
  ): void {
    void scene
    const p = new Vector3()
    const r = new Vector3()

    if (use_jitter) {
      util.seed(seed)
    }

    for (const gen of LightGeneratorsWgsl) {
      let i = 0

      for (const k in renderlights) {
        const rlight = renderlights[k]
        const light = rlight.light

        if (light.data.type !== gen.lightType) {
          continue
        }

        const mat = light.outputs.matrix.getValue() as Matrix4
        const m = (mat as unknown as {$matrix: Record<string, number>}).$matrix
        const dir = new Vector3([m.m31, m.m32, m.m33])

        const uname = gen.uniformName + `[${i}]`
        i++

        p.zero()
        p.multVecMatrix(mat)

        if (use_jitter) {
          switch (light.data.type) {
            case LightTypes.AREA_DISK:
            case LightTypes.AREA_RECT:
            case LightTypes.SUN:
              uniforms[uname + '.dir'] = dir
            // fallthrough
            case LightTypes.POINT:
            default:
              //XXX
              //r[0] = (util.random() - 0.5) * 2.0
              //r[1] = (util.random() - 0.5) * 2.0
              //r[2] = (util.random() - 0.5) * 2.0
              r.mulScalar(light.data.inputs.radius.getValue() as number)
              p.add(r)
              break
          }
        }

        uniforms[uname + '.co'] = p
        uniforms[uname + '.power'] = light.data.inputs.power.getValue()
        uniforms[uname + '.radius'] = light.data.inputs.radius.getValue()
        uniforms[uname + '.distance'] = light.data.inputs.distance.getValue()
        uniforms[uname + '.color'] = light.data.inputs.color.getValue()
      }
    }
  }

  genDefines(rlights: IRenderLights): Record<string, number> {
    let tot = 0
    for (const k in rlights) {
      if (rlights[k].light.data.type === this.lightType) tot++
    }
    if (tot === 0) return {}
    return {[this.totname]: tot}
  }

  static genDefines(rlights: IRenderLights): Record<string, number> {
    const out: Record<string, number> = {}
    for (const gen of LightGeneratorsWgsl) {
      Object.assign(out, gen.genDefines(rlights))
    }
    return out
  }

  gen(closure: string, co: string, normal: string, color: string, brdf: string): string {
    return this.lightLoop
      .replace(/CLOSURE/g, closure)
      .replace(/CO/g, co)
      .replace(/NORMAL/g, normal)
      .replace(/COLOR/g, color)
      .replace(/BRDF/g, brdf)
  }

  static register(generator: LightGenWgsl): void {
    LightGeneratorsWgsl.push(generator)
  }

  static pre(): string {
    let ret = ''
    for (const gen of LightGeneratorsWgsl) ret += gen.pre + '\n'
    return ret
  }

  static generate(closure: string, co: string, normal: string, color: string, brdf: string): string {
    let ret = ''
    for (const gen of LightGeneratorsWgsl) ret += gen.gen(closure, co, normal, color, brdf) + '\n'
    ret += AMBIENT_WGSL.replace(/CLOSURE/g, closure)
    return ret
  }
}

export const PointLightCodeWgsl = new LightGenWgsl({
  lightType     : LightTypes.POINT,
  name          : 'POINTLIGHT',
  uniformName   : 'POINTLIGHTS',
  totname       : 'MAXPLIGHT',
  pre: `
#ifdef MAXPLIGHT
  #define HAVE_POINTLIGHT
  struct PointLight {
    co          : vec3f,
    power       : f32,
    radius      : f32,
    _pad0       : f32,
    color       : vec3f,
    distance    : f32,
    shadow_near : f32,
    shadow_far  : f32,
    _pad1       : f32,
    _pad2       : f32,
  };
  @group(1) @binding(0) var<uniform> POINTLIGHTS : array<PointLight, MAXPLIGHT>;
#endif
`,
  // Substitutes CLOSURE / CO / NORMAL / COLOR / BRDF
  lightLoop: `
#ifdef HAVE_POINTLIGHT
  for (var li : i32 = 0; li < MAXPLIGHT; li = li + 1) {
    let lvec = POINTLIGHTS[li].co - CO;
    let ln   = normalize(lvec);

    BRDF;

    let f = brdf_out * dot(ln, NORMAL);

    let energy = (1.0 / (1.0 + sqrt(length(lvec) / POINTLIGHTS[li].distance))) * POINTLIGHTS[li].power;
    let shadow = 1.0;

    CLOSURE.light = CLOSURE.light + f * POINTLIGHTS[li].color * energy * shadow;
  }
#endif
`,
  defines       : ['MAXPLIGHT'],
  getLightVector: (co, i) => `normalize(POINTLIGHTS[${i}].co - ${co})`,
})
LightGenWgsl.register(PointLightCodeWgsl)

export const SunLightCodeWgsl = new LightGenWgsl({
  lightType     : LightTypes.SUN,
  name          : 'SUNLIGHT',
  uniformName   : 'SUNLIGHTS',
  totname       : 'MAXSLIGHT',
  pre: `
#ifdef MAXSLIGHT
  #define HAVE_SUNLIGHT
  struct SUNLight {
    co          : vec3f,
    power       : f32,
    dir         : vec3f,
    radius      : f32,
    color       : vec3f,
    distance    : f32,
    shadow_near : f32,
    shadow_far  : f32,
    _pad0       : f32,
    _pad1       : f32,
  };
  @group(1) @binding(1) var<uniform> SUNLIGHTS : array<SUNLight, MAXSLIGHT>;
#endif
`,
  lightLoop: `
#ifdef HAVE_SUNLIGHT
  for (var li : i32 = 0; li < MAXSLIGHT; li = li + 1) {
    let lvec = SUNLIGHTS[li].dir;
    let ln   = normalize(lvec);

    BRDF;

    let f = brdf_out * max(dot(ln, NORMAL), 0.0);
    let energy = SUNLIGHTS[li].power;
    let shadow = 1.0;

    CLOSURE.light = CLOSURE.light + f * SUNLIGHTS[li].color * energy * shadow;
  }
#endif
`,
  defines       : ['MAXSLIGHT'],
  getLightVector: (_co, i) => `SUNLIGHTS[${i}].dir`,
})
LightGenWgsl.register(SunLightCodeWgsl)

// ---------------------------------------------------------------------------
// BRDFGen
// ---------------------------------------------------------------------------

export class BRDFGenWgsl {
  code: string

  constructor(code: string) {
    this.code = code
  }

  gen(closure: string, co: string, normal: string, color: string): string {
    return this.code
      .replace(/CLOSURE/g, closure)
      .replace(/COLOR/g, color)
      .replace(/CO/g, co)
      .replace(/NORMAL/g, normal)
  }
}

/**
 * Lambert diffuse — emits `brdf_out` (a vec3f) for the surrounding
 * light loop to multiply against `dot(ln, N)`. Matches the GLSL
 * `DiffuseBRDF`.
 */
export const DiffuseBRDFWgsl = new BRDFGenWgsl(`
  let brdf_out : vec3f = COLOR.rgb;
`)

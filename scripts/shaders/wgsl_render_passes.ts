/**
 * WGSL ports of the render passes in
 * `scripts/renderengine/realtime_passes.ts`. Phase 5 sibling of
 * `wgsl_shaders.ts` — the GLSL `RenderPass.compileShader` builds a
 * template-driven full-screen shader at runtime; the WebGPU port goes
 * the opposite direction (one fragment per pass, registered ahead of
 * time) since WGSL doesn't tolerate the `#define WEBGL1` / `#version`
 * conditionals the GL template relies on.
 *
 * Bind-group convention for render passes (diverges from
 * mesh shaders — render passes need bound input textures, not per-
 * object matrices):
 *
 *   @group(0) @binding(0)  var<uniform> pass : PassUniforms
 *   @group(0) @binding(1+) input textures + samplers
 *
 * Vertex layout: `FULLSCREEN_QUAD_LAYOUT` in
 * `scripts/webgpu/render_context.ts` (vec2 position + vec2 uv,
 * stride 16). The shared VS_BLIT_WGSL preamble is reused across every
 * pass — every pass fragment is appended onto it.
 */

import type {PipelineDescriptor} from '../webgpu/pipeline.js'
import {FULLSCREEN_QUAD_LAYOUT} from '../webgpu/render_context.js'
import {preprocess, type PreprocessOptions} from './preprocess.js'

/**
 * Shared full-screen vertex shader. Pass-fragment WGSL is appended
 * onto this string at registration time.
 */
export const VS_BLIT_WGSL = `
struct VsOut {
  @builtin(position) clipPos : vec4f,
  @location(0) v_Uv : vec2f,
};

@vertex
fn vs_main(@location(0) position : vec2f, @location(1) uv : vec2f) -> VsOut {
  var out : VsOut;
  out.clipPos = vec4f(position, 0.0, 1.0);
  out.v_Uv = uv;
  return out;
}
`

/**
 * Per-render-pass uniforms — projection + sample counters. Mirrors
 * what `RenderPass.renderIntern` (renderpass.ts:411) sets on the GLSL
 * side (`size`, `uSample`, `projectionMatrix`, `iprojectionMatrix`,
 * `viewMatrix`, `iviewMatrix`).
 */
export const PASS_UNIFORMS_WGSL = `
struct PassUniforms {
  projectionMatrix  : mat4x4f,
  iprojectionMatrix : mat4x4f,
  viewMatrix        : mat4x4f,
  iviewMatrix       : mat4x4f,
  size              : vec2f,
  uSample           : f32,
  weightSum         : f32,
};
@group(0) @binding(0) var<uniform> pass : PassUniforms;
`

/**
 * OutputPass — port of `OutputPass` (realtime_passes.ts:283-346).
 * Divides the accumulator by `weightSum`, writes opaque color +
 * sampled depth. Final blit before swap-chain present.
 *
 * Bindings:
 *   @group(0) @binding(1) fbo_rgba_tex   texture_2d<f32>
 *   @group(0) @binding(2) fbo_smp        sampler
 *   @group(0) @binding(3) fbo_depth_tex  texture_2d<f32>
 */
export const OUTPUT_PASS_WGSL = `
${VS_BLIT_WGSL}
${PASS_UNIFORMS_WGSL}

@group(0) @binding(1) var fbo_rgba_tex  : texture_2d<f32>;
@group(0) @binding(2) var fbo_smp       : sampler;
@group(0) @binding(3) var fbo_depth_tex : texture_2d<f32>;

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  let sampled = textureSample(fbo_rgba_tex, fbo_smp, in.v_Uv);
  out.color = vec4f(sampled.rgb / pass.weightSum, 1.0);
  out.depth = textureSampleLevel(fbo_depth_tex, fbo_smp, in.v_Uv, 0.0).r;
  return out;
}
`

/**
 * PassThruPass — port of `PassThruPass` (realtime_passes.ts:887-914).
 * Straight color + depth copy; useful as a graph-debugging passthrough.
 *
 * Bindings: same as OUTPUT_PASS_WGSL.
 */
export const PASSTHRU_PASS_WGSL = `
${VS_BLIT_WGSL}
${PASS_UNIFORMS_WGSL}

@group(0) @binding(1) var fbo_rgba_tex  : texture_2d<f32>;
@group(0) @binding(2) var fbo_smp       : sampler;
@group(0) @binding(3) var fbo_depth_tex : texture_2d<f32>;

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  out.color = textureSample(fbo_rgba_tex, fbo_smp, in.v_Uv);
  out.depth = textureSampleLevel(fbo_depth_tex, fbo_smp, in.v_Uv, 0.0).r;
  return out;
}
`

/**
 * AccumPass — port of `AccumPass` (realtime_passes.ts:808-885). Adds
 * the input pass into the accumulator with weight `w` (one extra
 * uniform on top of the base PassUniforms).
 *
 * Bindings: same as OUTPUT_PASS_WGSL; uses pass.weightSum (already in
 * PassUniforms) and an extra inline uniform `w` via @group(0) @binding(4).
 */
export const ACCUM_PASS_WGSL = `
${VS_BLIT_WGSL}
${PASS_UNIFORMS_WGSL}

@group(0) @binding(1) var fbo_rgba_tex  : texture_2d<f32>;
@group(0) @binding(2) var fbo_smp       : sampler;
@group(0) @binding(3) var fbo_depth_tex : texture_2d<f32>;

struct AccumUniforms {
  w : f32,
};
@group(0) @binding(4) var<uniform> accum : AccumUniforms;

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  let sampled = textureSample(fbo_rgba_tex, fbo_smp, in.v_Uv);
  out.color = vec4f(sampled.rgb * accum.w, 1.0);
  out.depth = textureSampleLevel(fbo_depth_tex, fbo_smp, in.v_Uv, 0.0).r;
  return out;
}
`

/**
 * BlurPass — port of `BlurPass` (realtime_passes.ts:502-582). 1D
 * gaussian-ish blur with `BLUR_AXIS` (x or y) and `BLUR_SAMPLES`
 * (radius, default 3).
 *
 * GLSL writes `p2[BLUR_AXIS] += f` which can't survive a textual
 * substitution into WGSL — vec2 isn't subscriptable by an integer
 * literal in WGSL. The port uses `#ifdef BLUR_AXIS_Y` to gate the
 * `.x` vs `.y` access instead; callers register one entry per axis
 * (`BlurPassX`, `BlurPassY`) plus pick a sample count by passing
 * `{BLUR_SAMPLES: n}` through `buildPassPipelineDescriptor`'s
 * preprocess hook.
 *
 * Define: `BLUR_SAMPLES` (numeric, required); `BLUR_AXIS_Y` (Y axis
 * variant — omit for X).
 */
export const BLUR_PASS_WGSL = `
${VS_BLIT_WGSL}
${PASS_UNIFORMS_WGSL}

@group(0) @binding(1) var fbo_rgba_tex  : texture_2d<f32>;
@group(0) @binding(2) var fbo_smp       : sampler;
@group(0) @binding(3) var fbo_depth_tex : texture_2d<f32>;

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  var accum = vec4f(0.0);
  var tot : f32 = 0.0;
  var p = in.v_Uv * pass.size;

  for (var i : i32 = -BLUR_SAMPLES; i < BLUR_SAMPLES; i = i + 1) {
    let w = 1.0 - abs(f32(i) / f32(BLUR_SAMPLES));
    var p2 = p;
#ifdef BLUR_AXIS_Y
    p2.y = p2.y + f32(i);
#else
    p2.x = p2.x + f32(i);
#endif
    let color = textureSample(fbo_rgba_tex, fbo_smp, p2 / pass.size);
    accum = accum + color * w;
    tot = tot + w;
  }

  accum = accum / tot;
  out.color = accum;
  out.depth = textureSampleLevel(fbo_depth_tex, fbo_smp, in.v_Uv, 0.0).r;
  return out;
}
`

/**
 * SharpenPass — port of `SharpenPass` (realtime_passes.ts:725-806).
 * Same 1D scan as BlurPass but with a remapped weight curve and a
 * post-blur mix back toward the original sample using `sharpen` as
 * the lerp factor. Defines mirror BlurPass: `SAMPLES`, `AXIS_Y`.
 */
export const SHARPEN_PASS_WGSL = `
${VS_BLIT_WGSL}
${PASS_UNIFORMS_WGSL}

@group(0) @binding(1) var fbo_rgba_tex  : texture_2d<f32>;
@group(0) @binding(2) var fbo_smp       : sampler;
@group(0) @binding(3) var fbo_depth_tex : texture_2d<f32>;

struct SharpenUniforms {
  sharpen : f32,
};
@group(0) @binding(4) var<uniform> sharpenU : SharpenUniforms;

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  var accum = vec4f(0.0);
  var tot : f32 = 0.0;
  let p = in.v_Uv * pass.size;

  for (var i : i32 = -SAMPLES; i < SAMPLES; i = i + 1) {
    var w = 1.0 - abs(f32(i) / f32(SAMPLES));
    w = w * w * (3.0 - 2.0 * w);
    w = w - 0.4;
    var p2 = p;
#ifdef AXIS_Y
    p2.y = p2.y + f32(i);
#else
    p2.x = p2.x + f32(i);
#endif
    let color = textureSample(fbo_rgba_tex, fbo_smp, p2 / pass.size);
    accum = accum + color * w;
    tot = tot + w;
  }

  accum = accum / tot;
  let center = textureSample(fbo_rgba_tex, fbo_smp, in.v_Uv);
  let mixed = accum + (center - accum) * (1.0 - sharpenU.sharpen);
  out.color = vec4f(mixed.xyz, 1.0);
  out.depth = textureSampleLevel(fbo_depth_tex, fbo_smp, in.v_Uv, 0.0).r;
  return out;
}
`

/**
 * DenoiseBlur — port of `DenoiseBlur` (realtime_passes.ts:584-723).
 * A depth-weighted 1D blur: the input fbo carries the depth value in
 * `.b`, the persw in `.a`, and the renderer scales by a depth term
 * before accumulating. Used by the realtime AO/denoise chain.
 *
 * Defines:
 *   BLUR_SAMPLES (required) — radius
 *   BLUR_AXIS_Y (optional) — Y-axis variant (omit for X)
 *   DEPTH_SCALE, DEPTH_OFFSET, DEPTH_PRESCALE (required) — JS-injected
 *     floats (the GLSL side serializes from FloatSockets)
 *
 * The GLSL `#if BLUR_AXIS == 0` branch is rewritten as `#ifdef
 * BLUR_AXIS_Y` (preprocess.ts intentionally doesn't implement
 * `#if expr`). The `#define CALCD(d) ...` function-like macro is
 * hand-inlined since the preprocessor only handles simple
 * NAME → value substitution.
 */
export const DENOISE_BLUR_WGSL = `
${VS_BLIT_WGSL}
${PASS_UNIFORMS_WGSL}

@group(0) @binding(1) var fbo_rgba_tex  : texture_2d<f32>;
@group(0) @binding(2) var fbo_smp       : sampler;
@group(0) @binding(3) var fbo_depth_tex : texture_2d<f32>;

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  var accum = vec4f(0.0);
  var tot : f32 = 0.0;
  let p = in.v_Uv * pass.size;

  let samp = textureSample(fbo_rgba_tex, fbo_smp, in.v_Uv);
  let persw = samp.a;
  let d = (samp.b * DEPTH_PRESCALE + DEPTH_OFFSET) * DEPTH_SCALE;

  for (var i : i32 = -BLUR_SAMPLES; i < BLUR_SAMPLES; i = i + 1) {
    let w = 1.0 - abs(f32(i) / f32(BLUR_SAMPLES));
    var p2 = p;
#ifdef BLUR_AXIS_Y
    p2.y = p2.y + f32(i);
#else
    p2.x = p2.x + f32(i);
#endif
    var color = textureSample(fbo_rgba_tex, fbo_smp, p2 / pass.size);
    let d2 = (color.b * DEPTH_PRESCALE + DEPTH_OFFSET) * DEPTH_SCALE;
    color.r = color.r * d2;
    accum = accum + color * w;
    tot = tot + w;
  }

  accum = accum / tot;
  let denom = select(d, 0.0001, d == 0.0);
  accum = accum / denom;

#ifdef BLUR_AXIS_Y
  out.color = vec4f(accum.r, accum.r, accum.r, 1.0);
#else
  out.color = vec4f(accum.r, accum.r, d, persw);
#endif
  out.depth = textureSampleLevel(fbo_depth_tex, fbo_smp, in.v_Uv, 0.0).r;
  return out;
}
`

export interface WgslPassEntry {
  key: string
  source: string
  vertexBuffers: GPUVertexBufferLayout[]
  colorTargets: GPUColorTargetState[]
  primitive?: GPUPrimitiveState
  depthStencil?: GPUDepthStencilState
}

const REGISTRY = new Map<string, WgslPassEntry>()

export function registerWgslPass(entry: WgslPassEntry): void {
  REGISTRY.set(entry.key, entry)
}

export function lookupWgslPass(key: string): WgslPassEntry | undefined {
  return REGISTRY.get(key)
}

export function buildPassPipelineDescriptor(
  entry: WgslPassEntry,
  defines?: PreprocessOptions['defines']
): PipelineDescriptor {
  const wgsl = defines && Object.keys(defines).length > 0
    ? preprocess(entry.source, {defines})
    : entry.source
  return {
    label        : entry.key,
    wgsl,
    vertexBuffers: entry.vertexBuffers,
    colorTargets : entry.colorTargets,
    primitive    : entry.primitive,
    depthStencil : entry.depthStencil,
  }
}

const PASS_COLOR_TARGET: GPUColorTargetState = {
  format: 'rgba16float',
}

const PASS_DEPTH_STENCIL: GPUDepthStencilState = {
  format            : 'depth24plus',
  depthWriteEnabled : true,
  depthCompare      : 'always',
}

registerWgslPass({
  key          : 'OutputPass',
  source       : OUTPUT_PASS_WGSL,
  vertexBuffers: [FULLSCREEN_QUAD_LAYOUT],
  colorTargets : [PASS_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : PASS_DEPTH_STENCIL,
})

registerWgslPass({
  key          : 'PassThruPass',
  source       : PASSTHRU_PASS_WGSL,
  vertexBuffers: [FULLSCREEN_QUAD_LAYOUT],
  colorTargets : [PASS_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : PASS_DEPTH_STENCIL,
})

registerWgslPass({
  key          : 'AccumPass',
  source       : ACCUM_PASS_WGSL,
  vertexBuffers: [FULLSCREEN_QUAD_LAYOUT],
  colorTargets : [PASS_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : PASS_DEPTH_STENCIL,
})

// BlurPass needs preprocess() defines (BLUR_SAMPLES, BLUR_AXIS_Y) —
// callers run buildPassPipelineDescriptor with the right defines map
// rather than registering a static variant. The raw source goes in
// under a single key; consumers tag the resulting Pipeline by
// (key, defines-hash) themselves.
registerWgslPass({
  key          : 'BlurPass',
  source       : BLUR_PASS_WGSL,
  vertexBuffers: [FULLSCREEN_QUAD_LAYOUT],
  colorTargets : [PASS_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : PASS_DEPTH_STENCIL,
})

registerWgslPass({
  key          : 'SharpenPass',
  source       : SHARPEN_PASS_WGSL,
  vertexBuffers: [FULLSCREEN_QUAD_LAYOUT],
  colorTargets : [PASS_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : PASS_DEPTH_STENCIL,
})

registerWgslPass({
  key          : 'DenoiseBlur',
  source       : DENOISE_BLUR_WGSL,
  vertexBuffers: [FULLSCREEN_QUAD_LAYOUT],
  colorTargets : [PASS_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : PASS_DEPTH_STENCIL,
})

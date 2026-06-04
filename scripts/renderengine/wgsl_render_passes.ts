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
import {preprocess, type PreprocessOptions} from '../shaders/preprocess.js'

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
// "pass" is a WGSL reserved keyword, so the binding is named "passU".
@group(0) @binding(0) var<uniform> passU : PassUniforms;
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
@group(0) @binding(3) var fbo_depth_tex : texture_depth_2d;
@group(0) @binding(7) var depth_smp     : sampler;

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  let sampled = textureSample(fbo_rgba_tex, fbo_smp, in.v_Uv);
  out.color = vec4f(sampled.rgb / passU.weightSum, 1.0);
  out.depth = textureSampleLevel(fbo_depth_tex, depth_smp, in.v_Uv, 0);
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
@group(0) @binding(3) var fbo_depth_tex : texture_depth_2d;
@group(0) @binding(7) var depth_smp     : sampler;

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  // Multiply by 1 + (passU.weightSum * 0) so the WGSL compiler can't
  // strip the binding-0 uniform. Without this, getBindGroupLayout(0)
  // drops binding 0 and the engine bind group fails validation.
  let keep : f32 = 1.0 + passU.weightSum * 0.0;
  out.color = textureSample(fbo_rgba_tex, fbo_smp, in.v_Uv) * keep;
  out.depth = textureSampleLevel(fbo_depth_tex, depth_smp, in.v_Uv, 0);
  return out;
}
`

/**
 * AccumPass — port of `AccumPass` (realtime_passes.ts:808-885). Adds
 * the input pass into the accumulator with weight `w` (one extra
 * uniform on top of the base PassUniforms).
 *
 * Bindings: PassUniforms + input color/depth at 1/2/3, AccumUniforms at 4,
 * plus `last_buf_tex` at binding 5 — the previous frame's accumulator
 * (PassThruPass's ping-pong slot). The GL formula is
 *   color = current*w + last*(uSample > 1 ? 1 : 0)
 * which only adds the prior accumulator after the first sample so the
 * very first frame doesn't double-count uninitialized texels.
 */
export const ACCUM_PASS_WGSL = `
${VS_BLIT_WGSL}
${PASS_UNIFORMS_WGSL}

@group(0) @binding(1) var fbo_rgba_tex  : texture_2d<f32>;
@group(0) @binding(2) var fbo_smp       : sampler;
@group(0) @binding(3) var fbo_depth_tex : texture_depth_2d;
@group(0) @binding(7) var depth_smp     : sampler;

struct AccumUniforms {
  w : f32,
};
@group(0) @binding(4) var<uniform> accum : AccumUniforms;

@group(0) @binding(5) var last_buf_tex  : texture_2d<f32>;

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  let sampled = textureSample(fbo_rgba_tex, fbo_smp, in.v_Uv);
  let prior   = textureSample(last_buf_tex, fbo_smp, in.v_Uv);
  let carry   = select(0.0, 1.0, passU.uSample > 1.0);
  out.color = vec4f(sampled.rgb * accum.w + prior.rgb * carry, 1.0);
  out.depth = textureSampleLevel(fbo_depth_tex, depth_smp, in.v_Uv, 0);
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
@group(0) @binding(3) var fbo_depth_tex : texture_depth_2d;
@group(0) @binding(7) var depth_smp     : sampler;

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  var accum = vec4f(0.0);
  var tot : f32 = 0.0;
  var p = in.v_Uv * passU.size;

  for (var i : i32 = -BLUR_SAMPLES; i < BLUR_SAMPLES; i = i + 1) {
    let w = 1.0 - abs(f32(i) / f32(BLUR_SAMPLES));
    var p2 = p;
#ifdef BLUR_AXIS_Y
    p2.y = p2.y + f32(i);
#else
    p2.x = p2.x + f32(i);
#endif
    let color = textureSample(fbo_rgba_tex, fbo_smp, p2 / passU.size);
    accum = accum + color * w;
    tot = tot + w;
  }

  accum = accum / tot;
  out.color = accum;
  out.depth = textureSampleLevel(fbo_depth_tex, depth_smp, in.v_Uv, 0);
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
@group(0) @binding(3) var fbo_depth_tex : texture_depth_2d;
@group(0) @binding(7) var depth_smp     : sampler;

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
  let p = in.v_Uv * passU.size;

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
    let color = textureSample(fbo_rgba_tex, fbo_smp, p2 / passU.size);
    accum = accum + color * w;
    tot = tot + w;
  }

  accum = accum / tot;
  let center = textureSample(fbo_rgba_tex, fbo_smp, in.v_Uv);
  let mixed = accum + (center - accum) * (1.0 - sharpenU.sharpen);
  out.color = vec4f(mixed.xyz, 1.0);
  out.depth = textureSampleLevel(fbo_depth_tex, depth_smp, in.v_Uv, 0);
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
@group(0) @binding(3) var fbo_depth_tex : texture_depth_2d;
@group(0) @binding(7) var depth_smp     : sampler;

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  var accum = vec4f(0.0);
  var tot : f32 = 0.0;
  let p = in.v_Uv * passU.size;

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
    var color = textureSample(fbo_rgba_tex, fbo_smp, p2 / passU.size);
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
  out.depth = textureSampleLevel(fbo_depth_tex, depth_smp, in.v_Uv, 0);
  return out;
}
`

/**
 * AOPass — port of `AOPass` (realtime_passes.ts:348-500). Per-fragment
 * screen-space AO sampling with blue-noise-decorrelated random
 * directions. The `samples` count is fixed at 25 to match the GLSL
 * `#define samples 25`; tune by editing this source or branching on a
 * preprocess define.
 *
 * Bindings:
 *   @group(0) @binding(0)  pass         (PassUniforms)
 *   @group(0) @binding(1)  fbo_rgba_tex (texture_2d<f32>)  — normals.rgb encoded *2-1
 *   @group(0) @binding(2)  fbo_smp      (sampler)
 *   @group(0) @binding(3)  fbo_depth_tex(texture_2d<f32>)
 *   @group(0) @binding(4)  ao           (AOUniforms — dist/factor/steps + blue mask params)
 *   @group(0) @binding(5)  blue_mask_tex(texture_2d<f32>)
 *   @group(0) @binding(6)  blue_smp     (sampler)
 */
export const AO_PASS_WGSL = `
${VS_BLIT_WGSL}
${PASS_UNIFORMS_WGSL}

@group(0) @binding(1) var fbo_rgba_tex  : texture_2d<f32>;
@group(0) @binding(2) var fbo_smp       : sampler;
@group(0) @binding(3) var fbo_depth_tex : texture_depth_2d;
@group(0) @binding(7) var depth_smp     : sampler;

struct AOUniforms {
  blueUVOff   : vec2f,
  blueUVScale : vec2f,
  dist        : f32,
  factor      : f32,
  steps       : f32,
  _pad        : f32,
};
@group(0) @binding(4) var<uniform> ao : AOUniforms;
@group(0) @binding(5) var blue_mask_tex : texture_2d<f32>;
@group(0) @binding(6) var blue_smp      : sampler;

const SAMPLES : i32 = 25;
const SEED1   : f32 = 0.23432;

fn sampleBlue(uv : vec2f) -> vec4f {
  return textureSample(blue_mask_tex, blue_smp, uv * ao.blueUVScale + ao.blueUVOff);
}

fn unproject(p : vec4f) -> vec4f {
  var p2 = passU.iprojectionMatrix * vec4f(p.xyz, 1.0);
  p2 = vec4f(p2.xyz / p2.w, p2.w);
  return p2;
}

fn rng(uv : vec2f, seed_in : f32) -> f32 {
  var sf = sampleBlue(uv).x;
  sf = floor(sf * 10.0) / 10.0;
  sf = sf + fract(passU.uSample * sqrt(3.0)) * 0.1;
  var seed = seed_in + sf * 1012.23432;
  var f = fract(fract(seed * 312.23432) + seed);
  f = fract(1.0 / (f * 0.00001 + 0.00001));
  return f;
}

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  // VsOut.clipPos is the framebuffer position when read in the fragment
  // stage (the @builtin(position) interp does that automatically). Don't
  // redeclare a second @builtin(position) param — WGSL rejects duplicates.
  var p = vec4f(in.clipPos.xyz, 1.0);
  p = vec4f((p.xy / passU.size) * 2.0 - vec2f(1.0), p.z, p.w);
  let depthSample = textureSampleLevel(fbo_depth_tex, depth_smp, in.v_Uv, 0);
  p.z = depthSample;
  let pWorld = unproject(p);

  var seed : f32 = 0.0;
  var f    : f32 = 0.0;
  var tot  : f32 = 0.0;
  let nin = textureSample(fbo_rgba_tex, fbo_smp, in.v_Uv).rgb * 2.0 - vec3f(1.0);

  for (var i : i32 = 0; i < SAMPLES; i = i + 1) {
    var n = vec3f(
      rng(in.v_Uv, seed)             - 0.5,
      rng(in.v_Uv, seed + 2.23432)   - 0.5,
      rng(in.v_Uv, seed + 1.9234)    - 0.5,
    );
    if (dot(n, nin) < 0.0) { n = -n; }
    n = n * ao.dist;

    var p2 = passU.projectionMatrix * vec4f(pWorld.xyz + n, 1.0);
    p2 = vec4f(p2.xyz / p2.w, p2.w);
    let oldz = p2.z;

    let uv2 = p2.xy * 0.5 + vec2f(0.5);
    let c = textureSample(fbo_rgba_tex, fbo_smp, uv2);
    let z2 = textureSampleLevel(fbo_depth_tex, depth_smp, uv2, 0);
    let p3 = unproject(vec4f(p2.xy, z2, 1.0));
    var w = length(p3.xyz - pWorld.xyz) / ao.dist;
    w = select(min(w, 1.0), 0.0, w > 2.0);
    if (c.a < 0.2 || z2 + (1.0 + 0.00025 * SEED1) * abs(oldz - z2) > oldz) {
      w = 0.0;
    }
    f = f + w;
    seed = seed + 3.0;
    tot = tot + 1.0;
  }

  f = select(f / tot, 1.0, tot == 0.0);
  f = fract(f);
  f = min(f, 1.0);
  f = pow(1.0 - f, ao.factor);
  if (f != f) { f = 1.0; }  // NaN guard

  var out : FsOut;
  out.color = vec4f(f, f, f, 1.0);
  out.depth = depthSample;
  return out;
}
`

/**
 * NormalPass — port of `NormalPass` (realtime_passes.ts:249-281). On
 * WebGL this delegates to `engine.render_normals` (a mesh render, not a
 * quad blit). The WGSL side is a placeholder shader-key only — the
 * actual encode is done by `WebGpuRenderGraph` issuing a normal-mesh
 * render pass instead of invoking this WGSL. We register the key so
 * the dispatcher recognizes NormalPass and routes accordingly.
 *
 * The placeholder fragment is a black-clear no-op kept around so a
 * generic pass-walker doesn't crash on a missing entry; real callers
 * should branch on `entry.key === 'NormalPass'` before issuing draw.
 */
export const NORMAL_PASS_WGSL = `
${VS_BLIT_WGSL}
${PASS_UNIFORMS_WGSL}

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  out.color = vec4f(0.0, 0.0, 0.0, 1.0);
  out.depth = 1.0;
  return out;
}
`

/**
 * SSSBlurPass — one axis of a Jimenez-style separable screen-space
 * subsurface-scatter blur. The input color carries the SSS irradiance
 * (rgb) and the per-pixel **world-space** scatter radius (a) — for the X
 * pass that's BasePass `colors[1]`, for the Y pass it's the X-pass output
 * (which passes the radius through unchanged in `.a`).
 *
 * The world radius (already includes the node's CPU-side unit factor) is
 * projected to screen pixels per-fragment using depth + the pass
 * projection (same view-space unproject/project trick as AOPass), then the
 * kernel steps along X or Y weighting by a per-channel Gaussian (red
 * diffuses widest). Pixels with radius == 0 pass straight through, so
 * non-SSS geometry is a no-op (risk R6).
 *
 * Defines: `SAMPLES` (numeric, required — half-width of the tap loop),
 * `AXIS_Y` (Y-axis variant; omit for X).
 * Binding 4 = SSSBlurUniforms.
 */
export const SSS_BLUR_PASS_WGSL = `
${VS_BLIT_WGSL}
${PASS_UNIFORMS_WGSL}

@group(0) @binding(1) var fbo_rgba_tex   : texture_2d<f32>;
@group(0) @binding(2) var fbo_smp        : sampler;
@group(0) @binding(3) var fbo_depth_tex  : texture_depth_2d;
@group(0) @binding(7) var depth_smp      : sampler;
// Per-channel world scatter radius (BasePass colors[2].rgb), sampled at the
// center pixel only — it's a per-pixel constant, so both blur axes read it from
// the base pass to build per-channel kernel weights (red bleeds widest).
@group(0) @binding(8) var fbo_radius_tex : texture_2d<f32>;

struct SSSBlurUniforms {
  falloff     : f32,  // diffusion-profile falloff multiplier on the radius
  maxScreenPx : f32,  // clamp on the screen-space kernel half-width
  _pad0       : f32,
  _pad1       : f32,
};
@group(0) @binding(4) var<uniform> sssU : SSSBlurUniforms;

fn sssUnproject(p : vec4f) -> vec4f {
  var p2 = passU.iprojectionMatrix * vec4f(p.xyz, 1.0);
  return vec4f(p2.xyz / p2.w, p2.w);
}

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  let depthSample = textureSampleLevel(fbo_depth_tex, depth_smp, in.v_Uv, 0);
  // textureSampleLevel (explicit LOD, no derivatives) — the radius early-out
  // below makes control flow non-uniform, and plain textureSample is illegal
  // there. These are full-res screen textures, so LOD 0 is exact anyway.
  let center      = textureSampleLevel(fbo_rgba_tex, fbo_smp, in.v_Uv, 0.0);
  let worldRadius = center.a;
  // Per-channel world radius for the diffusion profile (clamped away from 0 so
  // the per-channel weight below never divides by zero). The footprint/spacing
  // is driven by the max radius (worldRadius); the per-channel radii only shape
  // how fast each colour band falls off within that footprint.
  let radiusVec = max(textureSampleLevel(fbo_radius_tex, fbo_smp, in.v_Uv, 0.0).rgb, vec3f(1.0e-6));

  // No scatter radius here — pass irradiance + radius through untouched so
  // the next pass / composite sees a clean no-op for non-SSS pixels.
  if (worldRadius <= 0.0) {
    out.color = center;
    out.depth = depthSample;
    return out;
  }

  // Convert the per-pixel world scatter radius to a screen-space kernel
  // half-width *along the blur axis*. Measure how far one screen pixel travels
  // in world space at this fragment's depth — unproject the fragment and a
  // neighbour one pixel away on the blur axis (same depth) — then
  // screenPx = worldRadius / worldDistancePerPixel.
  //
  // This MUST be measured along the screen axis. The earlier code offset the
  // unprojected world point along a *world* axis (world +X / +Y) and reprojected;
  // wherever that world axis foreshortens toward the camera the reprojected
  // delta collapses to ~0, starving the blur along a screen-space line and
  // leaving a hard seam (the "vertical line" bug). Stepping along the actual
  // screen axis is depth-correct and independent of camera orientation.
  let centerW = sssUnproject(vec4f(in.v_Uv * 2.0 - vec2f(1.0), depthSample, 1.0)).xyz;
#ifdef AXIS_Y
  let stepUv = in.v_Uv + vec2f(0.0, 1.0 / passU.size.y);
#else
  let stepUv = in.v_Uv + vec2f(1.0 / passU.size.x, 0.0);
#endif
  let stepW = sssUnproject(vec4f(stepUv * 2.0 - vec2f(1.0), depthSample, 1.0)).xyz;
  let worldPerPx = max(length(stepW - centerW), 1.0e-9);
  var screenPx = (worldRadius / worldPerPx) * sssU.falloff;
  screenPx = clamp(screenPx, 0.0, sssU.maxScreenPx);

  var accum = vec3f(0.0);
  var wsum  = vec3f(0.0);
  let p = in.v_Uv * passU.size;

  for (var i : i32 = -SAMPLES; i <= SAMPLES; i = i + 1) {
    let t = f32(i) / f32(SAMPLES);  // -1..1 along the kernel
    var p2 = p;
#ifdef AXIS_Y
    p2.y = p2.y + t * screenPx;
#else
    p2.x = p2.x + t * screenPx;
#endif
    // Per-channel Gaussian: each colour band falls off over its OWN world
    // scatter radius, so a narrow channel (e.g. blue) stays sharp while a wide
    // one (red) bleeds, even though all share one sample footprint. worldDist is
    // this tap's world-space offset from center.
    let worldDist = abs(t) * screenPx * worldPerPx;
    let xr = vec3f(worldDist) / radiusVec;
    let w  = exp(-xr * xr * 3.0);
    let s  = textureSampleLevel(fbo_rgba_tex, fbo_smp, p2 / passU.size, 0.0);
    // Only gather from texels that are themselves SSS (radius > 0) so the
    // blur never drags background irradiance across the silhouette.
    let mask = select(0.0, 1.0, s.a > 0.0);
    accum = accum + s.rgb * w * mask;
    wsum  = wsum + w * mask;
  }

  let safe = max(wsum, vec3f(1.0e-5));
  out.color = vec4f(accum / safe, worldRadius);
  out.depth = depthSample;
  return out;
}
`

/**
 * SSSCompositePass — fold the diffused SSS irradiance back into the lit
 * frame using a difference composite that conserves energy. The SSS node
 * leaves its diffuse irradiance in BOTH \`cl.light\` (so the frame is
 * correct with SSS off) and \`cl.scatter\` (the SSS attachment). Here we
 * add \`blurred - original\` so the sharp diffuse is *replaced* by the
 * diffused version; for non-SSS pixels both are 0 and the frame is
 * untouched.
 *
 * Bindings: binding 1 = lit color (BasePass \`colors[0]\`), binding 5 =
 * blurred SSS (\`sssBlurB.colors[0]\`), binding 6 = original SSS irradiance
 * (BasePass \`colors[1]\`), binding 4 = SSSCompositeUniforms.
 */
export const SSS_COMPOSITE_PASS_WGSL = `
${VS_BLIT_WGSL}
${PASS_UNIFORMS_WGSL}

@group(0) @binding(1) var fbo_rgba_tex  : texture_2d<f32>;
@group(0) @binding(2) var fbo_smp       : sampler;
@group(0) @binding(3) var fbo_depth_tex : texture_depth_2d;
@group(0) @binding(7) var depth_smp     : sampler;

struct SSSCompositeUniforms {
  strength : f32,
  _pad0    : f32,
  _pad1    : f32,
  _pad2    : f32,
};
@group(0) @binding(4) var<uniform> sssC : SSSCompositeUniforms;

@group(0) @binding(5) var sss_blur_tex : texture_2d<f32>;
@group(0) @binding(6) var sss_orig_tex : texture_2d<f32>;

struct FsOut {
  @location(0)         color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  let lit      = textureSample(fbo_rgba_tex, fbo_smp, in.v_Uv);
  let blurred  = textureSample(sss_blur_tex, fbo_smp, in.v_Uv);
  let original = textureSample(sss_orig_tex, fbo_smp, in.v_Uv);
  // strength is the fraction of diffuse irradiance that scatters subsurface.
  // On an SSS pixel original == lit, so lit + (blurred - original)*s is exactly
  // mix(lit, blurred, s) — a proper blend ONLY for s in [0,1]. With s > 1 the
  // sharp term gets a negative weight, turning the composite into an
  // overshooting unsharp mask that rings at any edge (e.g. a mesh normal seam),
  // which shows up as spurious lines / concentric banding. Clamp to the
  // physical range; "more SSS" is achieved by widening the radius, not by
  // extrapolating past full scatter.
  let strength = clamp(sssC.strength, 0.0, 1.0);
  let diff = (blurred.rgb - original.rgb) * strength;
  // Keep the generically-wired PassUniforms binding (0) referenced so the
  // auto-derived bind-group layout doesn't strip it (same trick as PassThru).
  let keep : f32 = 1.0 + passU.weightSum * 0.0;
  out.color = vec4f((lit.rgb + diff * keep), lit.a);
  out.depth = textureSampleLevel(fbo_depth_tex, depth_smp, in.v_Uv, 0);
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
  // Always preprocess — even with no defines we need `#ifdef` blocks
  // stripped. WGSL doesn't parse `#` as a comment so unprocessed
  // directives crash the shader module.
  const wgsl = preprocess(entry.source, {defines: defines ?? {}})
  return {
    label: entry.key,
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
  format           : 'depth24plus',
  depthWriteEnabled: true,
  depthCompare     : 'always',
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

registerWgslPass({
  key          : 'AOPass',
  source       : AO_PASS_WGSL,
  vertexBuffers: [FULLSCREEN_QUAD_LAYOUT],
  colorTargets : [PASS_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : PASS_DEPTH_STENCIL,
})

// SSS separable blur — like BlurPass, callers select SAMPLES / AXIS_Y via
// buildPassPipelineDescriptor's defines map (one Pipeline per axis).
registerWgslPass({
  key          : 'SSSBlurPass',
  source       : SSS_BLUR_PASS_WGSL,
  vertexBuffers: [FULLSCREEN_QUAD_LAYOUT],
  colorTargets : [PASS_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : PASS_DEPTH_STENCIL,
})

registerWgslPass({
  key          : 'SSSCompositePass',
  source       : SSS_COMPOSITE_PASS_WGSL,
  vertexBuffers: [FULLSCREEN_QUAD_LAYOUT],
  colorTargets : [PASS_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : PASS_DEPTH_STENCIL,
})

// NormalPass is a marker entry — the WebGPU graph dispatcher must see
// the key and route to a mesh render rather than a quad blit.
registerWgslPass({
  key          : 'NormalPass',
  source       : NORMAL_PASS_WGSL,
  vertexBuffers: [FULLSCREEN_QUAD_LAYOUT],
  colorTargets : [PASS_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : PASS_DEPTH_STENCIL,
})

// BasePass — like NormalPass, a marker entry. BasePass renders the
// scene materials (one pipeline per material, compiled on demand by
// `WgslShaderGenerator`) rather than a quad blit, so the WGSL source is
// a placeholder. `WebGpuRenderGraph` special-cases the key and routes
// to `hooks.encodeMeshBasePass`.
registerWgslPass({
  key          : 'BasePass',
  source       : NORMAL_PASS_WGSL, // placeholder — see comment above
  vertexBuffers: [FULLSCREEN_QUAD_LAYOUT],
  colorTargets : [PASS_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : PASS_DEPTH_STENCIL,
})

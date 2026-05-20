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

export function buildPassPipelineDescriptor(entry: WgslPassEntry): PipelineDescriptor {
  return {
    label        : entry.key,
    wgsl         : entry.source,
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

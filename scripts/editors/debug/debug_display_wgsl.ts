/**
 * WGSL blit shader + pipeline descriptor for the FBO debug editor.
 * Mirrors the four `DisplayModes` branches (RAW / NORMAL / DEPTH /
 * ALPHA) via a single `mode: u32` uniform so one pipeline serves all
 * view modes.
 */

import type {PipelineDescriptor} from '../../webgpu/pipeline.js'
import {FULLSCREEN_QUAD_LAYOUT} from '../../webgpu/render_context.js'

export const DEBUG_DISPLAY_WGSL = /* wgsl */ `
struct DebugUniforms {
  mode       : u32,
  valueScale : f32,
  _pad0      : f32,
  _pad1      : f32,
};

@group(0) @binding(0) var u_sampler : sampler;
@group(0) @binding(1) var u_tex     : texture_2d<f32>;
@group(0) @binding(2) var<uniform> u : DebugUniforms;

struct VsOut {
  @builtin(position) pos : vec4<f32>,
  @location(0) uv        : vec2<f32>,
};

@vertex
fn vs_main(@location(0) position : vec2<f32>, @location(1) uv : vec2<f32>) -> VsOut {
  var o : VsOut;
  o.pos = vec4<f32>(position, 0.0, 1.0);
  // Flip V — the WebGL editor samples with origin-bottom-left FBO
  // contents through a quad with uv (0,0)..(1,1); the WebGPU canvas
  // texture is origin-top-left, so without this the image is upside
  // down vs the WebGL backend.
  o.uv  = vec2<f32>(uv.x, 1.0 - uv.y);
  return o;
}

// DisplayModes (must match DebugEditor_base.ts):
//   RAW = 0, IDS = 1, NORMAL = 2, DEPTH = 3, ALPHA = 4
@fragment
fn fs_main(in : VsOut) -> @location(0) vec4<f32> {
  let c = textureSample(u_tex, u_sampler, in.uv);
  switch (u.mode) {
    case 1u: { // IDS — non-linear scramble per channel so neighbouring IDs differ
      var col = c.rgb;
      for (var i = 0; i < 3; i = i + 1) {
        var f = col[i];
        f = f / (sqrt(5.0) * sqrt(3.0));
        f = f + sqrt(5.0);
        if (f != 0.0) {
          f = fract(f * 0.2) * 0.8 + 0.2;
        }
        col[i] = f;
      }
      return vec4<f32>(col * u.valueScale, 1.0);
    }
    case 2u: { // NORMAL — unpack [0,1] → [-1,1] then renormalize for visual
      let n = normalize(c.rgb * 2.0 - vec3<f32>(1.0));
      return vec4<f32>(n * 0.5 + vec3<f32>(0.5), 1.0);
    }
    case 3u: { // DEPTH — non-linear scramble to visualize near/far range
      let f = fract(c.r * 720022.32423);
      return vec4<f32>(f, f, f, 1.0);
    }
    case 4u: { // ALPHA
      return vec4<f32>(c.a, c.a, c.a, 1.0);
    }
    default: { // RAW
      return vec4<f32>(c.rgb * u.valueScale, 1.0);
    }
  }
}
`

// Builds the descriptor for the debug-display pipeline. `targetFormat`
// is the canvas surface format (passed from the active
// `WebGpuRenderContext.surfaceFormat`).
export function buildDebugDisplayDescriptor(targetFormat: GPUTextureFormat): PipelineDescriptor {
  return {
    label        : 'debug-display',
    wgsl         : DEBUG_DISPLAY_WGSL,
    vertexBuffers: [FULLSCREEN_QUAD_LAYOUT],
    colorTargets : [{format: targetFormat}],
    primitive    : {topology: 'triangle-list'},
  }
}

// Bytes for the `DebugUniforms` block. WGSL std140-equivalent layout
// for the uniform is u32 + f32 + 2×f32 padding = 16 bytes.
export function writeDebugUniforms(device: GPUDevice, buffer: GPUBuffer, mode: number, valueScale: number): void {
  const data = new ArrayBuffer(16)
  const u32 = new Uint32Array(data)
  const f32 = new Float32Array(data)
  u32[0] = mode | 0
  f32[1] = valueScale
  device.queue.writeBuffer(buffer, 0, data)
}

export const DEBUG_UNIFORMS_SIZE = 16

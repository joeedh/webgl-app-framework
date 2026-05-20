/**
 * WGSL ports of the GLSL shaders in `scripts/shaders/shaders.ts`. Runs
 * side-by-side with the GLSL versions per Phase 4b of the migration
 * plan — each shader can flip independently once its WGSL variant
 * matches visually.
 *
 * Bind-group convention (matches `scripts/webgpu/bind_group.ts`):
 *
 *   @group(0)  per-frame    — projection, viewport, near/far, time
 *   @group(1)  per-material — textures, samplers
 *   @group(2)  per-object   — object matrix, object id, alpha, color
 *
 * Variants that the GLSL side gates on `#ifdef` (SMOOTH_LINE, HAVE_COLOR,
 * VCOL_PATCH, DRAW_FLAT, …) live as separate registry entries here. The
 * preprocessor in `preprocess.ts` runs over the WGSL source before
 * `Pipeline` compilation so the registration helper can reuse one source
 * string with multiple `defines` maps.
 */

import type {PipelineDescriptor} from '../webgpu/pipeline.js'
import {preprocess, type PreprocessOptions} from './preprocess.js'

/**
 * Per-frame uniform layout. Stable across every shader; populated once
 * per frame by the render engine.
 */
export const FRAME_UNIFORMS_WGSL = `
struct FrameUniforms {
  projectionMatrix : mat4x4f,
  size             : vec2f,
  aspect           : f32,
  near             : f32,
  far              : f32,
  _pad             : f32,
};
@group(0) @binding(0) var<uniform> frame : FrameUniforms;
`

/**
 * BasicLineShader — port of `BasicLineShader` (shaders.ts:131-187).
 * Vertex attributes: position (vec3), uv (vec2), color (vec4).
 */
export const BASIC_LINE_WGSL = `
${FRAME_UNIFORMS_WGSL}

struct ObjectUniforms {
  objectMatrix : mat4x4f,
  alpha        : f32,
  _pad0        : f32,
  _pad1        : f32,
  _pad2        : f32,
};
@group(2) @binding(0) var<uniform> object : ObjectUniforms;

struct VsIn {
  @location(0) position : vec3f,
  @location(1) uv       : vec2f,
  @location(2) color    : vec4f,
};

struct VsOut {
  @builtin(position) clipPos : vec4f,
  @location(0) vColor : vec4f,
  @location(1) vUv    : vec2f,
};

@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  let p = frame.projectionMatrix * object.objectMatrix * vec4f(in.position, 1.0);
  out.clipPos = p;
  out.vColor = in.color;
  out.vUv = in.uv;
  return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4f {
  return in.vColor * vec4f(1.0, 1.0, 1.0, object.alpha);
}
`

/**
 * ObjectLineShader — port of `ObjectLineShader` (shaders.ts:189-250).
 * Wireframe overlay; per-object `shift` (vec2) offset in clip space.
 */
export const OBJECT_LINE_WGSL = `
${FRAME_UNIFORMS_WGSL}

struct ObjectUniforms {
  objectMatrix : mat4x4f,
  uColor       : vec4f,
  shift        : vec2f,
  alpha        : f32,
  _pad0        : f32,
};
@group(2) @binding(0) var<uniform> object : ObjectUniforms;

struct VsIn {
  @location(0) position : vec3f,
  @location(1) uv       : vec2f,
  @location(2) color    : vec4f,
};

struct VsOut {
  @builtin(position) clipPos : vec4f,
  @location(0) vUv : vec2f,
};

@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  var p = frame.projectionMatrix * object.objectMatrix * vec4f(in.position, 1.0);
  p = vec4f(p.xy + object.shift * p.w, p.zw);
  out.clipPos = p;
  out.vUv = in.uv;
  return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4f {
  return object.uColor * vec4f(1.0, 1.0, 1.0, object.alpha);
}
`

/**
 * WidgetMeshShader — port of `WidgetMeshShader` (shaders.ts:1411-1465).
 * Solid-color widget mesh; used by NullObject, Light, Camera helpers.
 */
export const WIDGET_MESH_WGSL = `
${FRAME_UNIFORMS_WGSL}

struct ObjectUniforms {
  objectMatrix : mat4x4f,
  normalMatrix : mat4x4f,
  color        : vec4f,
  pointSize    : f32,
  _pad0        : f32,
  _pad1        : f32,
  _pad2        : f32,
};
@group(2) @binding(0) var<uniform> object : ObjectUniforms;

struct VsIn {
  @location(0) position : vec3f,
  @location(1) normal   : vec3f,
  @location(2) uv       : vec2f,
  @location(3) color    : vec4f,
};

struct VsOut {
  @builtin(position) clipPos : vec4f,
};

@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  out.clipPos = frame.projectionMatrix * object.objectMatrix * vec4f(in.position, 1.0);
  return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4f {
  return vec4f(object.color.rgb, object.color.a);
}
`

/**
 * BasicLitMesh — port of `BasicLitMesh` (shaders.ts:303-368). Default
 * viewport shading. The `#ifdef HAVE_COLOR` variant is honoured by the
 * preprocessor — pass `{HAVE_COLOR: true}` to `buildPipelineDescriptor`.
 */
export const BASIC_LIT_MESH_WGSL = `
${FRAME_UNIFORMS_WGSL}

struct ObjectUniforms {
  objectMatrix : mat4x4f,
  normalMatrix : mat4x4f,
  alpha        : f32,
  _pad0        : f32,
  _pad1        : f32,
  _pad2        : f32,
};
@group(2) @binding(0) var<uniform> object : ObjectUniforms;

struct VsIn {
  @location(0) position : vec3f,
  @location(1) normal   : vec3f,
  @location(2) uv       : vec2f,
  @location(3) color    : vec4f,
};

struct VsOut {
  @builtin(position) clipPos : vec4f,
  @location(0) vColor : vec4f,
  @location(1) vNormal : vec3f,
  @location(2) vUv : vec2f,
};

@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  out.clipPos = frame.projectionMatrix * object.objectMatrix * vec4f(in.position, 1.0);
  let n = object.normalMatrix * vec4f(in.normal, 0.0);
  out.vNormal = n.xyz;
  out.vUv = in.uv;
  out.vColor = in.color;
  return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4f {
  let no = normalize(in.vNormal);
  var f = no.y * 0.333 + no.z * 0.333 + no.x * 0.333;
  if (f < 0.0) { f = -f * 0.2; }
  f = f * 0.8 + 0.2;
  let c = vec4f(f, f, f, 1.0);

#ifdef HAVE_COLOR
  let vcolor = in.vColor;
#else
  let vcolor = vec4f(1.0, 1.0, 1.0, 1.0);
#endif

  return c + (c * vcolor - c) * vcolor.a;
}
`

/**
 * MeshIDShader — port of `MeshIDShader` (shaders.ts:1153-1220). Renders
 * (object_id+1, vertex_id+1, 0, 1) into a float framebuffer for picking.
 * Vertex attributes: position (vec3), uv (vec2), color (vec4), id (f32).
 */
export const MESH_ID_WGSL = `
${FRAME_UNIFORMS_WGSL}

struct ObjectUniforms {
  objectMatrix : mat4x4f,
  object_id    : f32,
  pointSize    : f32,
  _pad0        : f32,
  _pad1        : f32,
};
@group(2) @binding(0) var<uniform> object : ObjectUniforms;

struct VsIn {
  @location(0) position : vec3f,
  @location(1) uv       : vec2f,
  @location(2) color    : vec4f,
  @location(3) id       : f32,
};

struct VsOut {
  @builtin(position) clipPos : vec4f,
  @location(0) vId : f32,
};

@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  out.clipPos = frame.projectionMatrix * object.objectMatrix * vec4f(in.position, 1.0);
  out.vId = in.id + 1.0;
  return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4f {
  return vec4f(object.object_id + 1.0, in.vId, 0.0, 1.0);
}
`

/**
 * Standard vertex layout used by `SimpleMesh` / `ChunkedSimpleMesh` when
 * all four interleaved layers (position, uv, color, id) are present.
 * Stride = 3*4 + 2*4 + 4*4 + 1*4 = 40 bytes.
 *
 * Phase 4c swaps `SimpleIsland`'s buffer upload to emit this layout
 * against a single `GpuBuffer`.
 */
export const STANDARD_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 40,
  attributes: [
    {shaderLocation: 0, offset: 0,  format: 'float32x3'}, // position
    {shaderLocation: 1, offset: 12, format: 'float32x2'}, // uv
    {shaderLocation: 2, offset: 20, format: 'float32x4'}, // color
    {shaderLocation: 3, offset: 36, format: 'float32'},   // id
  ],
}

/**
 * Variant of `STANDARD_VERTEX_LAYOUT` without the `id` attribute —
 * matches `BasicLineShader` / `ObjectLineShader`. Stride = 36 bytes.
 */
export const NO_ID_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 36,
  attributes: [
    {shaderLocation: 0, offset: 0,  format: 'float32x3'},
    {shaderLocation: 1, offset: 12, format: 'float32x2'},
    {shaderLocation: 2, offset: 20, format: 'float32x4'},
  ],
}

/**
 * Lit-mesh layout: position + normal + uv + color. Matches
 * `BasicLitMesh` / `WidgetMeshShader`. Stride = 48 bytes.
 */
export const LIT_MESH_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 48,
  attributes: [
    {shaderLocation: 0, offset: 0,  format: 'float32x3'}, // position
    {shaderLocation: 1, offset: 12, format: 'float32x3'}, // normal
    {shaderLocation: 2, offset: 24, format: 'float32x2'}, // uv
    {shaderLocation: 3, offset: 32, format: 'float32x4'}, // color
  ],
}

export interface WgslShaderEntry {
  /** Stable key — set by the GLSL side as `program.wgslKey`. */
  key: string
  /** Raw (un-preprocessed) WGSL source. */
  source: string
  /** Vertex buffer layout(s) the pipeline expects. */
  vertexBuffers: GPUVertexBufferLayout[]
  /** Default color target — caller can override per-pass. */
  colorTargets: GPUColorTargetState[]
  /** Default primitive topology. */
  primitive?: GPUPrimitiveState
  /** Default depth state. */
  depthStencil?: GPUDepthStencilState
}

const DEFAULT_COLOR_TARGET: GPUColorTargetState = {
  format: 'bgra8unorm',
  blend: {
    color: {srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add'},
    alpha: {srcFactor: 'one',       dstFactor: 'one-minus-src-alpha', operation: 'add'},
  },
}

const ID_PICKING_TARGET: GPUColorTargetState = {
  format: 'rgba32float',
}

/**
 * Registry of ported shaders, keyed by the same name used on the GLSL
 * side. The WebGPU queue adapter consumes this via `lookupWgslShader()`
 * to resolve a `Submission.pipeline` (a `ShaderProgram` tagged with
 * `.wgslKey`) into a `PipelineDescriptor`.
 */
const REGISTRY = new Map<string, WgslShaderEntry>()

export function registerWgslShader(entry: WgslShaderEntry): void {
  REGISTRY.set(entry.key, entry)
}

export function lookupWgslShader(key: string): WgslShaderEntry | undefined {
  return REGISTRY.get(key)
}

/**
 * Resolve a registry entry to a `PipelineDescriptor` ready for
 * `PipelineCache.get()`. `defines` lets a caller request a `#ifdef`
 * variant (e.g. `{SMOOTH_LINE: true}`) without forking the registry.
 */
export function buildPipelineDescriptor(
  entry: WgslShaderEntry,
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

// ---------------------------------------------------------------------------
// Built-in registrations
// ---------------------------------------------------------------------------

registerWgslShader({
  key          : 'BasicLineShader',
  source       : BASIC_LINE_WGSL,
  vertexBuffers: [NO_ID_VERTEX_LAYOUT],
  colorTargets : [DEFAULT_COLOR_TARGET],
  primitive    : {topology: 'line-list'},
})

registerWgslShader({
  key          : 'MeshIDShader',
  source       : MESH_ID_WGSL,
  vertexBuffers: [STANDARD_VERTEX_LAYOUT],
  colorTargets : [ID_PICKING_TARGET],
  primitive    : {topology: 'triangle-list'},
})

registerWgslShader({
  key          : 'ObjectLineShader',
  source       : OBJECT_LINE_WGSL,
  vertexBuffers: [NO_ID_VERTEX_LAYOUT],
  colorTargets : [DEFAULT_COLOR_TARGET],
  primitive    : {topology: 'line-list'},
})

registerWgslShader({
  key          : 'WidgetMeshShader',
  source       : WIDGET_MESH_WGSL,
  vertexBuffers: [LIT_MESH_VERTEX_LAYOUT],
  colorTargets : [DEFAULT_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
})

registerWgslShader({
  key          : 'BasicLitMesh',
  source       : BASIC_LIT_MESH_WGSL,
  vertexBuffers: [LIT_MESH_VERTEX_LAYOUT],
  colorTargets : [DEFAULT_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
})

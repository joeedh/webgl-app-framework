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
 * MeshEditShader — port of `MeshEditShader` (shaders.ts:1072-1150).
 * Selection overlay: per-vertex coloring with active/highlight/last
 * tinting. Used by view3d_draw.ts when rendering edit-mode element
 * overlays. Attribute layout matches POS_COLOR_ID (no normal/uv).
 */
export const MESH_EDIT_WGSL = `
${FRAME_UNIFORMS_WGSL}

struct ObjectUniforms {
  objectMatrix    : mat4x4f,
  active_color    : vec4f,
  highlight_color : vec4f,
  last_color      : vec4f,
  alpha           : f32,
  active_id       : f32,
  highlight_id    : f32,
  last_id         : f32,
  pointSize       : f32,
  _pad0           : f32,
  _pad1           : f32,
  _pad2           : f32,
};
@group(2) @binding(0) var<uniform> object : ObjectUniforms;

struct VsIn {
  @location(0) position : vec3f,
  @location(1) color    : vec4f,
  @location(2) id       : f32,
};

struct VsOut {
  @builtin(position) clipPos : vec4f,
  @location(0) vColor : vec4f,
};

@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  out.clipPos = frame.projectionMatrix * object.objectMatrix * vec4f(in.position, 1.0);

  if (object.highlight_id == in.id) {
    out.vColor = object.highlight_color;
  } else if (object.last_id == in.id) {
    out.vColor = object.last_color;
  } else if (object.active_id == in.id) {
    out.vColor = object.active_color;
  } else {
    out.vColor = in.color;
  }
  return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4f {
  return in.vColor * vec4f(1.0, 1.0, 1.0, object.alpha);
}
`

/**
 * BasicLineShader2D — port of `BasicLineShader2D` (shaders.ts:1373-1409).
 * UI overlay; bypasses projectionMatrix and maps `position.xy / size`
 * to NDC directly.
 */
export const BASIC_LINE_2D_WGSL = `
${FRAME_UNIFORMS_WGSL}

struct ObjectUniforms {
  alpha : f32,
  _pad0 : f32,
  _pad1 : f32,
  _pad2 : f32,
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
  let ndc = (in.position.xy / frame.size) * 2.0 - vec2f(1.0);
  out.clipPos = vec4f(ndc, in.position.z, 1.0);
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
 * NormalPassShader — port of `NormalPassShader` (shaders.ts:1309-1371).
 * Writes (normal * 0.5 + 0.5) into RGB; flips normal towards camera.
 */
export const NORMAL_PASS_WGSL = `
${FRAME_UNIFORMS_WGSL}

struct ObjectUniforms {
  objectMatrix : mat4x4f,
  normalMatrix : mat4x4f,
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
  @location(0) vNormal       : vec3f,
  @location(1) vCameraNormal : vec3f,
};

@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  out.clipPos = frame.projectionMatrix * object.objectMatrix * vec4f(in.position, 1.0);
  let cn = normalize(frame.projectionMatrix * object.objectMatrix * vec4f(in.normal, 0.0));
  out.vNormal = in.normal;
  out.vCameraNormal = cn.xyz;
  return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4f {
  var no = normalize(in.vNormal);
  if (in.vCameraNormal.z > 0.0) { no = -no; }
  return vec4f(no * 0.5 + vec3f(0.5), 1.0);
}
`

/**
 * MeshLinearZShader — port of `MeshLinearZShader` (shaders.ts:1222-1306).
 * Renders linear depth into `frag_depth`, viewed through `cameraMatrix`
 * (typically a light camera for shadow passes). Attribute layout:
 * position + color + id (no normal/uv — matches the GLSL `attributes`
 * declaration).
 */
export const MESH_LINEAR_Z_WGSL = `
${FRAME_UNIFORMS_WGSL}

struct ObjectUniforms {
  objectMatrix : mat4x4f,
  cameraMatrix : mat4x4f,
  object_id    : f32,
  pointSize    : f32,
  _pad0        : f32,
  _pad1        : f32,
};
@group(2) @binding(0) var<uniform> object : ObjectUniforms;

struct VsIn {
  @location(0) position : vec3f,
  @location(1) color    : vec4f,
  @location(2) id       : f32,
};

struct VsOut {
  @builtin(position) clipPos : vec4f,
  @location(0) vLightZ       : f32,
};

@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  out.clipPos = frame.projectionMatrix * object.objectMatrix * vec4f(in.position, 1.0);
  let lp = (object.cameraMatrix * object.objectMatrix * vec4f(in.position, 1.0)).xyz;
  out.vLightZ = lp.z;
  return out;
}

struct FsOut {
  @location(0)        color : vec4f,
  @builtin(frag_depth) depth : f32,
};

@fragment
fn fs_main(in : VsOut) -> FsOut {
  var out : FsOut;
  out.color = vec4f(0.5, 0.5, 0.5, 1.0);
  out.depth = in.vLightZ / frame.far;
  return out;
}
`

/**
 * Compact `position + color + id` layout (no uv/normal). Used by
 * `MeshLinearZShader`. Stride = 3*4 + 4*4 + 1*4 = 32 bytes.
 */
export const POS_COLOR_ID_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 32,
  attributes: [
    {shaderLocation: 0, offset: 0,  format: 'float32x3'},
    {shaderLocation: 1, offset: 12, format: 'float32x4'},
    {shaderLocation: 2, offset: 28, format: 'float32'},
  ],
}

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

/**
 * Strip-line layout for `LineTriStripShader`. Position + _strip_dir +
 * _strip_uv (normal/uv/color/id from the source `attributes` list are
 * declared on the GLSL side but not read by the vertex stage — they're
 * tagged for the GL bind path and irrelevant to the WGSL pipeline).
 * Stride = 3*4 + 4*4 + 2*4 = 36 bytes.
 */
export const STRIP_LINE_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 36,
  attributes: [
    {shaderLocation: 0, offset: 0,  format: 'float32x3'}, // position
    {shaderLocation: 1, offset: 12, format: 'float32x4'}, // _strip_dir
    {shaderLocation: 2, offset: 28, format: 'float32x2'}, // _strip_uv
  ],
}

/**
 * LineTriStripShader — port of `LineTriStripShader` (shaders.ts:2003-2086).
 * Triangle-strip line renderer that extrudes width from `_strip_dir` /
 * `_strip_uv`. Inlines `PolygonOffset.pre/vertex/fragment` (shaders.ts:4)
 * since both pieces fold into a single uniform + a z-bias in clip space.
 */
export const LINE_TRI_STRIP_WGSL = `
${FRAME_UNIFORMS_WGSL}

struct ObjectUniforms {
  objectMatrix  : mat4x4f,
  color         : vec4f,
  pointSize     : f32,
  polygonOffset : f32,
  _pad0         : f32,
  _pad1         : f32,
};
@group(2) @binding(0) var<uniform> object : ObjectUniforms;

struct VsIn {
  @location(0) position  : vec3f,
  @location(1) strip_dir : vec4f,
  @location(2) strip_uv  : vec2f,
};

struct VsOut {
  @builtin(position) clipPos : vec4f,
  @location(0) vStripUv : vec2f,
  @location(1) vColor   : vec4f,
};

@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  let width = in.strip_dir.w;

  var p = object.objectMatrix * vec4f(in.position, 1.0);
  p = frame.projectionMatrix * vec4f(p.xyz, 1.0);

  // PolygonOffset.vertex(p, near, far, size)
  let off = 5.0 * object.polygonOffset / (frame.far - frame.near + 0.00001);
  p.z = p.z - off;

  var dir = object.objectMatrix * vec4f(in.strip_dir.xyz, 0.0);
  dir = frame.projectionMatrix * dir;
  dir = normalize(dir);

  var pn = p.xyz / p.w;
  let s = width / frame.size.y;
  pn.x = pn.x + dir.y  * in.strip_uv.x * s;
  pn.y = pn.y + (-dir.x) * in.strip_uv.x * s;
  p = vec4f(pn * p.w, p.w);

  out.clipPos = p;
  out.vStripUv = vec2f(in.strip_uv.x, width);
  out.vColor = object.color;
  return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4f {
  var f = abs(in.vStripUv.x);
  let t = in.vStripUv.y - 1.5;
  f = f * in.vStripUv.y;
  if (f > t) {
    f = 1.0 - (f - t) / (in.vStripUv.y - t);
  } else {
    f = 1.0;
  }
  return object.color * in.vColor * vec4f(1.0, 1.0, 1.0, f);
}
`

/**
 * SculptShaderSimple — port of `SculptShaderSimple` (shaders.ts:764-884).
 * Lit-mesh shader for the sculpt PBVH nodes, simple lambert + texture +
 * vertex color. `DRAW_FLAT` variant computes normal from screen-space
 * derivatives instead of the interpolated attribute.
 *
 * Defines: `DRAW_FLAT` (recomputes normal via `dpdx`/`dpdy`).
 */
export const SCULPT_SIMPLE_WGSL = `
${FRAME_UNIFORMS_WGSL}

struct ObjectUniforms {
  objectMatrix : mat4x4f,
  normalMatrix : mat4x4f,
  uColor       : vec4f,
  alpha        : f32,
  hasTexture   : f32,
  polygonOffset: f32,
  _pad0        : f32,
};
@group(2) @binding(0) var<uniform> object : ObjectUniforms;

@group(1) @binding(0) var sculptTex : texture_2d<f32>;
@group(1) @binding(1) var sculptSmp : sampler;

struct VsIn {
  @location(0) position : vec3f,
  @location(1) normal   : vec3f,
  @location(2) uv       : vec2f,
  @location(3) color    : vec4f,
};

struct VsOut {
  @builtin(position) clipPos : vec4f,
  @location(0) vColor  : vec4f,
  @location(1) vNormal : vec3f,
  @location(2) vUv     : vec2f,
#ifdef DRAW_FLAT
  @location(3) vWorldCo : vec3f,
#endif
};

@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  var p = object.objectMatrix * vec4f(in.position, 1.0);
#ifdef DRAW_FLAT
  out.vWorldCo = p.xyz;
#endif
  p = frame.projectionMatrix * vec4f(p.xyz, 1.0);
  var n = object.objectMatrix * vec4f(in.normal, 0.0);
  n = frame.projectionMatrix * n;

  let off = 5.0 * object.polygonOffset / (frame.far - frame.near + 0.00001);
  p.z = p.z - off;

  out.clipPos = p;
  out.vUv = in.uv;
  out.vNormal = normalize(n.xyz);
  out.vColor = in.color;
  return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4f {
  var no = normalize(in.vNormal);
#ifdef DRAW_FLAT
  let n1 = dpdx(in.vWorldCo);
  let n2 = dpdy(in.vWorldCo);
  var nflat = cross(n1, n2);
  nflat = (frame.projectionMatrix * vec4f(nflat, 0.0)).xyz;
  no = normalize(nflat);
#endif
  let l = vec3f(0.096, -0.288, 0.96);
  var f = dot(no, l);
  if (f < 0.0) { f = -f * 0.5; }
  f = f * 0.8 + 0.2;

  var tex = textureSample(sculptTex, sculptSmp, in.vUv);
  tex = tex + (vec4f(1.0, 1.0, 1.0, 1.0) - tex) * (1.0 - object.hasTexture);

  var c = vec4f(f, f, f, 1.0) * object.uColor * in.vColor;
  c.a = c.a * object.alpha;
  return c * tex;
}
`

/**
 * SculptShaderHexDeform — port of `SculptShaderHexDeform`
 * (shaders.ts:886-1070). Adds trilinear hex-box deformation on the
 * vertex position. `WITH_BOXVERTS` chooses between uniform-array box
 * corners and a texture-sampled definition (`nodeDefTex`); the WGSL
 * port keeps both variants behind the same `#ifdef` so callers don't
 * have to flip storage at the pipeline layer.
 *
 * Defines: `WITH_BOXVERTS`, `DRAW_FLAT`.
 */
export const SCULPT_HEX_DEFORM_WGSL = `
${FRAME_UNIFORMS_WGSL}

#ifdef WITH_BOXVERTS
struct ObjectUniforms {
  objectMatrix  : mat4x4f,
  normalMatrix  : mat4x4f,
  uColor        : vec4f,
  boxverts      : array<vec4f, 8>, // .xyz used; vec4 for std140 align
  alpha         : f32,
  hasTexture    : f32,
  polygonOffset : f32,
  _pad0         : f32,
};
#else
struct ObjectUniforms {
  objectMatrix  : mat4x4f,
  normalMatrix  : mat4x4f,
  uColor        : vec4f,
  nodeDefTexUV  : vec2f,
  nodeDefTexDu  : f32,
  alpha         : f32,
  hasTexture    : f32,
  polygonOffset : f32,
  _pad0         : f32,
  _pad1         : f32,
};
#endif
@group(2) @binding(0) var<uniform> object : ObjectUniforms;

@group(1) @binding(0) var sculptTex : texture_2d<f32>;
@group(1) @binding(1) var sculptSmp : sampler;
#ifndef WITH_BOXVERTS
@group(1) @binding(2) var nodeDefTex : texture_2d<f32>;
@group(1) @binding(3) var nodeDefSmp : sampler;
#endif

struct VsIn {
  @location(0) position  : vec3f,
  @location(1) normal    : vec3f,
  @location(2) uv        : vec2f,
  @location(3) color     : vec4f,
  @location(4) bvhDefVs  : vec2f,
};

struct VsOut {
  @builtin(position) clipPos : vec4f,
  @location(0) vColor  : vec4f,
  @location(1) vNormal : vec3f,
  @location(2) vUv     : vec2f,
#ifdef DRAW_FLAT
  @location(3) vWorldCo : vec3f,
#endif
};

fn trilinear_v3(uvw : vec3f, bvhDefVs : vec2f) -> vec3f {
  let u = uvw.x;
  let v = uvw.y;
  let w = uvw.z;

#ifdef WITH_BOXVERTS
  let a1 = object.boxverts[0].xyz;
  let b1 = object.boxverts[1].xyz - a1;
  let c1 = object.boxverts[2].xyz - a1;
  let d1 = object.boxverts[3].xyz - a1;
  let a2 = object.boxverts[4].xyz - a1;
  let b2 = object.boxverts[5].xyz - a1;
  let c2 = object.boxverts[6].xyz - a1;
  let d2 = object.boxverts[7].xyz - a1;
#else
  let uvT = bvhDefVs;
  let s1 = textureSampleLevel(nodeDefTex, nodeDefSmp, uvT, 0.0);
  let a1 = s1.xyz;
  let b1 = textureSampleLevel(nodeDefTex, nodeDefSmp, uvT + vec2f(object.nodeDefTexDu * 1.0, 0.0), 0.0).xyz - a1;
  let c1 = textureSampleLevel(nodeDefTex, nodeDefSmp, uvT + vec2f(object.nodeDefTexDu * 2.0, 0.0), 0.0).xyz - a1;
  let d1 = textureSampleLevel(nodeDefTex, nodeDefSmp, uvT + vec2f(object.nodeDefTexDu * 3.0, 0.0), 0.0).xyz - a1;
  let a2 = textureSampleLevel(nodeDefTex, nodeDefSmp, uvT + vec2f(object.nodeDefTexDu * 4.0, 0.0), 0.0).xyz - a1;
  let b2 = textureSampleLevel(nodeDefTex, nodeDefSmp, uvT + vec2f(object.nodeDefTexDu * 5.0, 0.0), 0.0).xyz - a1;
  let c2 = textureSampleLevel(nodeDefTex, nodeDefSmp, uvT + vec2f(object.nodeDefTexDu * 6.0, 0.0), 0.0).xyz - a1;
  let d2 = textureSampleLevel(nodeDefTex, nodeDefSmp, uvT + vec2f(object.nodeDefTexDu * 7.0, 0.0), 0.0).xyz - a1;
#endif

  let x = (((a2.x - b2.x) * v - a2.x + (c2.x - d2.x) * v + d2.x) * u
           - ((a2.x - b2.x) * v - a2.x)
           - (((c1.x - d1.x) * v + d1.x - b1.x * v) * u + b1.x * v)) * w
          + ((c1.x - d1.x) * v + d1.x - b1.x * v) * u + b1.x * v;
  let y = (((a2.y - b2.y) * v - a2.y + (c2.y - d2.y) * v + d2.y) * u
           - ((a2.y - b2.y) * v - a2.y)
           - (((c1.y - d1.y) * v + d1.y - b1.y * v) * u + b1.y * v)) * w
          + ((c1.y - d1.y) * v + d1.y - b1.y * v) * u + b1.y * v;
  let z = (((a2.z - b2.z) * v - a2.z + (c2.z - d2.z) * v + d2.z) * u
           - ((a2.z - b2.z) * v - a2.z)
           - (((c1.z - d1.z) * v + d1.z - b1.z * v) * u + b1.z * v)) * w
          + ((c1.z - d1.z) * v + d1.z - b1.z * v) * u + b1.z * v;

  return vec3f(x, y, z) + a1;
}

@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  let warped = trilinear_v3(in.position, in.bvhDefVs);
  var p = object.objectMatrix * vec4f(warped, 1.0);
#ifdef DRAW_FLAT
  out.vWorldCo = p.xyz;
#endif
  p = frame.projectionMatrix * vec4f(p.xyz, 1.0);
  var n = object.objectMatrix * vec4f(in.normal, 0.0);
  n = frame.projectionMatrix * n;

  let off = 5.0 * object.polygonOffset / (frame.far - frame.near + 0.00001);
  p.z = p.z - off;

  out.clipPos = p;
  out.vUv = in.uv;
  out.vNormal = normalize(n.xyz);
  out.vColor = in.color;
  return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4f {
  var no = normalize(in.vNormal);
#ifdef DRAW_FLAT
  let n1 = dpdx(in.vWorldCo);
  let n2 = dpdy(in.vWorldCo);
  var nflat = cross(n1, n2);
  nflat = (frame.projectionMatrix * vec4f(nflat, 0.0)).xyz;
  no = normalize(nflat);
#endif
  let l = vec3f(0.096, -0.288, 0.96);
  var f = dot(no, l);
  if (f < 0.0) { f = -f * 0.5; }
  f = f * 0.8 + 0.2;

  var tex = textureSample(sculptTex, sculptSmp, in.vUv);
  tex = tex + (vec4f(1.0, 1.0, 1.0, 1.0) - tex) * (1.0 - object.hasTexture);

  var c = vec4f(f, f, f, 1.0) * object.uColor * in.vColor;
  c.a = c.a * object.alpha;
  return c * tex;
}
`

/**
 * Hex-deform layout: position + normal + uv + color + BVHDefVs. Adds a
 * `vec2` BVH-def attribute at location 4 on top of `LIT_MESH_VERTEX_LAYOUT`.
 * Stride = 48 + 8 = 56 bytes.
 */
export const SCULPT_HEX_DEFORM_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 56,
  attributes: [
    {shaderLocation: 0, offset: 0,  format: 'float32x3'},
    {shaderLocation: 1, offset: 12, format: 'float32x3'},
    {shaderLocation: 2, offset: 24, format: 'float32x2'},
    {shaderLocation: 3, offset: 32, format: 'float32x4'},
    {shaderLocation: 4, offset: 48, format: 'float32x2'},
  ],
}

/**
 * SculptShader — port of `SculptShader` (shaders.ts:480-762). Full
 * sculpt-mode shader with per-primitive vertex colors and optional
 * cubic-bezier-triangle color patching (`VCOL_PATCH`). The GLSL source
 * carries three dead `#elif 0` branches plus the active `#elif 1` cubic
 * bezier path — the dead branches are *not* ported here (preprocess.ts
 * doesn't implement `#elif`, and Phase 2 explicitly limits to
 * `#if 0|1`). Only the active branch is included; if you need to
 * resurrect the bilinear/quadratic variants, add them as separate
 * registry keys.
 *
 * Defines: `VCOL_PATCH` (enables cubic-bezier-triangle interpolation
 * of vPrimC1..vPrimC6; otherwise vcol = vColor).
 */
export const SCULPT_WGSL = `
${FRAME_UNIFORMS_WGSL}

struct ObjectUniforms {
  objectMatrix  : mat4x4f,
  normalMatrix  : mat4x4f,
  uColor        : vec4f,
  alpha         : f32,
  hasTexture    : f32,
  polygonOffset : f32,
  iTime         : f32,
};
@group(2) @binding(0) var<uniform> object : ObjectUniforms;

@group(1) @binding(0) var sculptTex : texture_2d<f32>;
@group(1) @binding(1) var sculptSmp : sampler;

struct VsIn {
  @location(0) position : vec3f,
  @location(1) normal   : vec3f,
  @location(2) uv       : vec2f,
  @location(3) color    : vec4f,
  @location(4) primUV   : vec4f,
  @location(5) primc1   : vec4f,
  @location(6) primc2   : vec4f,
  @location(7) primc3   : vec4f,
  @location(8) primc4   : vec4f,
  @location(9) primc5   : vec4f,
  @location(10) primc6  : vec4f,
};

struct VsOut {
  @builtin(position) clipPos : vec4f,
  @location(0) vColor  : vec4f,
  @location(1) vNormal : vec3f,
  @location(2) vUv     : vec2f,
  @location(3) vPrimUV : vec4f,
  @location(4) vPrimC1 : vec4f,
  @location(5) vPrimC2 : vec4f,
  @location(6) vPrimC3 : vec4f,
  @location(7) vPrimC4 : vec4f,
  @location(8) vPrimC5 : vec4f,
  @location(9) vPrimC6 : vec4f,
};

@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  var p = object.objectMatrix * vec4f(in.position, 1.0);
  p = frame.projectionMatrix * vec4f(p.xyz, 1.0);
  let n = object.normalMatrix * vec4f(in.normal, 0.0);

  let off = 5.0 * object.polygonOffset / (frame.far - frame.near + 0.00001);
  p.z = p.z - off;

  out.clipPos = p;
  out.vUv = in.uv;
  out.vNormal = n.xyz;
  out.vColor = in.color;
  out.vPrimUV = in.primUV;
  out.vPrimC1 = in.primc1;
  out.vPrimC2 = in.primc2;
  out.vPrimC3 = in.primc3;
  out.vPrimC4 = in.primc4;
  out.vPrimC5 = in.primc5;
  out.vPrimC6 = in.primc6;
  return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4f {
  let no = normalize(in.vNormal);
  var f = no.y * 0.333 + no.z * 0.333 + no.x * 0.333;
  if (f < 0.0) { f = -f * 0.5; }
  f = f * 0.8 + 0.2;

  let uvw = vec3f(in.vPrimUV.xy, 1.0 - in.vPrimUV.x - in.vPrimUV.y);
  var vcol : vec4f;

#ifdef VCOL_PATCH
  // Cubic bezier triangle (shaders.ts:649-709, the active "#elif 1" branch)
  let ww = 0.5;
  let ww2 = 0.0;
  var w1 = uvw.x;
  var w2 = uvw.y;

  w1 = w1 * w1 * (3.0 - 2.0 * w1);
  w2 = w2 * w2 * (3.0 - 2.0 * w2);

  var j1 = in.vPrimC4;
  var j5 = in.vPrimC5;
  var j9 = in.vPrimC6;

  var k1 = in.vPrimC1;
  var k5 = in.vPrimC2;
  var k9 = in.vPrimC3;

  let tt = 1.0;
  j1 = k1 + (j1 - k1) * tt;
  j5 = k5 + (j5 - k5) * tt;
  j9 = k9 + (j9 - k9) * tt;

  let tt2 = -1.0;
  k1 = k1 + (in.vPrimC4 - k1) * tt2;
  k5 = k5 + (in.vPrimC5 - k5) * tt2;
  k9 = k9 + (in.vPrimC6 - k9) * tt2;

  let k2 = k1 + (j5 - k1) * 0.25;
  let k3 = j1 + (j5 - j1) * 0.5;
  let k4 = j1 + (k5 - j1) * 0.75;

  let k6 = k5 + (j9 - k5) * 0.25;
  let k7 = j5 + (j9 - j5) * 0.5;
  let k8 = j5 + (k9 - j5) * 0.75;

  let k10 = k9 + (j1 - k9) * 0.25;
  let k11 = j9 + (j1 - j9) * 0.5;
  let k12 = j9 + (k1 - j9) * 0.75;

  var k13 = (k3 + k11) * 0.5;
  var k14 = (k3 + k7) * 0.5;
  var k15 = (k7 + k11) * 0.5;

  let tt3 = -1.5;
  k13 = k13 + (in.vPrimC4 - in.vPrimC1) * tt3;
  k14 = k14 + (in.vPrimC5 - in.vPrimC2) * tt3;
  k15 = k15 + (in.vPrimC6 - in.vPrimC3) * tt3;

  let s = w2 - 1.0 + w1;
  vcol = -(((s * k6 - (k4 * w1 + k5 * w2)) * w2
            - (s * k7 - (k14 * w1 + k6 * w2)) * s
            + (s * k14 - (k3 * w1 + k4 * w2)) * w1) * w2
           - ((s * k8 - (k15 * w1 + k7 * w2)) * w2
              - (s * k9 - (k10 * w1 + k8 * w2)) * s
              + (s * k10 - (k11 * w1 + k15 * w2)) * w1) * s
           + ((s * k12 - (k1 * w1 + k2 * w2)) * w1
              + (s * k13 - (k2 * w1 + k3 * w2)) * w2
              - (s * k11 - (k12 * w1 + k13 * w2)) * s) * w1);
#else
  vcol = in.vColor;
#endif

  var tex = textureSample(sculptTex, sculptSmp, in.vUv);
  tex = tex + (vec4f(1.0, 1.0, 1.0, 1.0) - tex) * (1.0 - object.hasTexture);

  var c = vec4f(f, f, f, 1.0) * object.uColor * vcol;
  c.a = c.a * object.alpha;
  return c * tex;
}
`

/**
 * Sculpt-patch layout for `SculptShader`: position + normal + uv +
 * color + primUV + primc1..primc6. Stride =
 *   3*4 + 3*4 + 2*4 + 4*4 + 4*4 + 6*(4*4) = 160 bytes.
 */
export const SCULPT_PATCH_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 160,
  attributes: [
    {shaderLocation: 0,  offset: 0,   format: 'float32x3'}, // position
    {shaderLocation: 1,  offset: 12,  format: 'float32x3'}, // normal
    {shaderLocation: 2,  offset: 24,  format: 'float32x2'}, // uv
    {shaderLocation: 3,  offset: 32,  format: 'float32x4'}, // color
    {shaderLocation: 4,  offset: 48,  format: 'float32x4'}, // primUV
    {shaderLocation: 5,  offset: 64,  format: 'float32x4'}, // primc1
    {shaderLocation: 6,  offset: 80,  format: 'float32x4'}, // primc2
    {shaderLocation: 7,  offset: 96,  format: 'float32x4'}, // primc3
    {shaderLocation: 8,  offset: 112, format: 'float32x4'}, // primc4
    {shaderLocation: 9,  offset: 128, format: 'float32x4'}, // primc5
    {shaderLocation: 10, offset: 144, format: 'float32x4'}, // primc6
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

registerWgslShader({
  key          : 'BasicLineShader2D',
  source       : BASIC_LINE_2D_WGSL,
  vertexBuffers: [NO_ID_VERTEX_LAYOUT],
  colorTargets : [DEFAULT_COLOR_TARGET],
  primitive    : {topology: 'line-list'},
})

registerWgslShader({
  key          : 'NormalPassShader',
  source       : NORMAL_PASS_WGSL,
  vertexBuffers: [LIT_MESH_VERTEX_LAYOUT],
  colorTargets : [DEFAULT_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
})

registerWgslShader({
  key          : 'MeshLinearZShader',
  source       : MESH_LINEAR_Z_WGSL,
  vertexBuffers: [POS_COLOR_ID_VERTEX_LAYOUT],
  colorTargets : [DEFAULT_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : {format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal'},
})

registerWgslShader({
  key          : 'MeshEditShader',
  source       : MESH_EDIT_WGSL,
  vertexBuffers: [POS_COLOR_ID_VERTEX_LAYOUT],
  colorTargets : [DEFAULT_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
})

registerWgslShader({
  key          : 'LineTriStripShader',
  source       : LINE_TRI_STRIP_WGSL,
  vertexBuffers: [STRIP_LINE_VERTEX_LAYOUT],
  colorTargets : [DEFAULT_COLOR_TARGET],
  primitive    : {topology: 'triangle-strip'},
})

registerWgslShader({
  key          : 'SculptShaderSimple',
  source       : SCULPT_SIMPLE_WGSL,
  vertexBuffers: [LIT_MESH_VERTEX_LAYOUT],
  colorTargets : [DEFAULT_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : {format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal'},
})

registerWgslShader({
  key          : 'SculptShaderHexDeform',
  source       : SCULPT_HEX_DEFORM_WGSL,
  vertexBuffers: [SCULPT_HEX_DEFORM_VERTEX_LAYOUT],
  colorTargets : [DEFAULT_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : {format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal'},
})

registerWgslShader({
  key          : 'SculptShader',
  source       : SCULPT_WGSL,
  vertexBuffers: [SCULPT_PATCH_VERTEX_LAYOUT],
  colorTargets : [DEFAULT_COLOR_TARGET],
  primitive    : {topology: 'triangle-list'},
  depthStencil : {format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal'},
})

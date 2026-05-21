/**
 * WGSL ports of the sculptcore spatial shaders that LiteMesh draws
 * through. Sourced from `sculptcore/source/spatial/shaders/spatial_shaders.cc`.
 *
 * Binding convention differs from `scripts/shaders/wgsl_shaders.ts`:
 * sculptcore's `WebGPUBatchExecutor` only binds `@group(0)` per draw, so
 * `drawMatrix`/`normalMatrix`/`uColor` are packed into a single
 * `SpatialUniforms` struct at `@group(0) @binding(0)`. The matching
 * uniform-buffer write happens through `UniformBindings` (reflection
 * pairs the WGSL field names to the loose uniforms block).
 *
 * `wgslForSpatialShader` dispatches by `ShaderDef.name` — the C++ side
 * names both shaders ("Basic Mesh Shader" / "Basic Line Shader") and
 * those strings round-trip through the wasm binding system unchanged.
 */

import type {ShaderDef} from '@sculptcore/api'

export const SPATIAL_BASIC_LINE_WGSL = `
struct SpatialUniforms {
  drawMatrix : mat4x4f,
  uColor     : vec4f,
};
@group(0) @binding(0) var<uniform> spatial : SpatialUniforms;

struct VsIn {
  @location(0) position : vec3f,
  @location(1) color    : vec4f,
};

struct VsOut {
  @builtin(position) clipPos : vec4f,
  @location(0) vColor : vec4f,
};

@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  out.clipPos = spatial.drawMatrix * vec4f(in.position, 1.0);
  out.vColor = in.color;
  return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4f {
  return spatial.uColor * in.vColor;
}
`

export const SPATIAL_BASIC_MESH_WGSL = `
struct SpatialUniforms {
  drawMatrix   : mat4x4f,
  normalMatrix : mat4x4f,
  uColor       : vec4f,
};
@group(0) @binding(0) var<uniform> spatial : SpatialUniforms;

struct VsIn {
  @location(0) position : vec3f,
  // The C++ ShaderDef declares 'normal' with elemsize 4, so the
  // executor binds a float32x4 buffer here even though only .xyz is
  // read. Keep this as vec4f to match the vertex layout.
  @location(1) normal   : vec4f,
};

struct VsOut {
  @builtin(position) clipPos : vec4f,
  @location(0) vNormal : vec3f,
};

@vertex
fn vs_main(in : VsIn) -> VsOut {
  var out : VsOut;
  out.clipPos = spatial.drawMatrix * vec4f(in.position, 1.0);
  let n = spatial.normalMatrix * vec4f(in.normal.xyz, 0.0);
  out.vNormal = normalize(n.xyz);
  return out;
}

@fragment
fn fs_main(in : VsOut) -> @location(0) vec4f {
  let no = in.vNormal;
  let f1 = dot(no, normalize(vec3f(0.1, 0.2, -1.0)));
  var f = f1;
  if (f1 < 0.0) { f = -f1 * 0.2; }
  f = f * 0.8 + 0.2;

  var vcolor = vec4f(1.0, 1.0, 1.0, 1.0);
  if (f1 < 0.0) {
    vcolor.z = vcolor.z * 0.8;
    vcolor.x = vcolor.x * 0.5;
  }
  return vec4f(vcolor.rgb * f, vcolor.a);
}
`

export function wgslForSpatialShader(sdef: ShaderDef): string {
  const name = sdef.name
  if (name === 'Basic Mesh Shader') return SPATIAL_BASIC_MESH_WGSL
  if (name === 'Basic Line Shader') return SPATIAL_BASIC_LINE_WGSL
  throw new Error(
    `litemesh_wgsl: no WGSL port registered for sculptcore ShaderDef "${name}". ` +
      `Add it to litemesh_wgsl.ts.`
  )
}

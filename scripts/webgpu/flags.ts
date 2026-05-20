/**
 * WebGPU usage-flag constants. The TS DOM lib version in use here
 * declares `GPUBufferUsage` / `GPUTextureUsage` as *types* but not as
 * runtime value-constants. The numeric flags are spec-fixed
 * (https://www.w3.org/TR/webgpu/), so we mirror them locally and use
 * these everywhere under `scripts/webgpu/` instead of relying on the
 * browser-provided globals.
 */

export const BufferUsage = {
  MAP_READ      : 0x0001,
  MAP_WRITE     : 0x0002,
  COPY_SRC      : 0x0004,
  COPY_DST      : 0x0008,
  INDEX         : 0x0010,
  VERTEX        : 0x0020,
  UNIFORM       : 0x0040,
  STORAGE       : 0x0080,
  INDIRECT      : 0x0100,
  QUERY_RESOLVE : 0x0200,
} as const

export const TextureUsage = {
  COPY_SRC          : 0x01,
  COPY_DST          : 0x02,
  TEXTURE_BINDING   : 0x04,
  STORAGE_BINDING   : 0x08,
  RENDER_ATTACHMENT : 0x10,
} as const

export const ShaderStage = {
  VERTEX   : 0x1,
  FRAGMENT : 0x2,
  COMPUTE  : 0x4,
} as const

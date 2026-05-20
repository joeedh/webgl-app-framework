/**
 * `scripts/webgpu/` — WebGPU abstraction layer. Built parallel to the
 * existing WebGL stack in `scripts/webgl/` per Phase 1 of the WebGL→WebGPU
 * migration plan. Nothing in the app wires up to this yet; Phase 4 swaps
 * the `DrawQueue` backend over.
 */

export {GpuContext} from './gpucontext.js'
export type {GpuContextOptions} from './gpucontext.js'

export {GpuBuffer} from './buffer.js'
export type {GpuBufferOptions, GpuBufferUsage} from './buffer.js'

export {GpuTexture, createSampler} from './texture.js'
export type {GpuTextureOptions, GpuSamplerOptions} from './texture.js'

export {RenderTarget} from './render_target.js'
export type {RenderTargetOptions} from './render_target.js'

export {Pipeline, PipelineCache} from './pipeline.js'
export type {PipelineDescriptor} from './pipeline.js'

export {BindGroupBuilder, BindGroupSlot} from './bind_group.js'
export type {BindGroupEntry} from './bind_group.js'

export {BufferUsage, TextureUsage, ShaderStage} from './flags.js'

export {WebGPUDrawQueueAdapter} from './queue_adapter.js'
export type {WebGPUFrameContext} from './queue_adapter.js'

export {WebGpuRenderContext, FULLSCREEN_QUAD_LAYOUT} from './render_context.js'
export type {WebGpuRenderContextOptions} from './render_context.js'

export {TexpaintBridge} from './texpaint_bridge.js'
export type {BridgedTexture} from './texpaint_bridge.js'

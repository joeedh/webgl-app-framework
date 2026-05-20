'use strict'

import {ShaderProgram, IUniformsBlock} from '../webgl/webgl'
import {PrimitiveTypes} from '../webgl/simplemesh'

/**
 * Anything that can be drawn by binding a program and calling its draw method.
 * SimpleMesh, ChunkedSimpleMesh, and the FancyMeshes line/tri batches all satisfy
 * this. Sculptcore's WebGLBatchExecutor outputs do too.
 */
export interface Drawable {
  draw(gl: WebGL2RenderingContext, uniforms: IUniformsBlock, program: ShaderProgram): void
}

/**
 * Per-frame state. Set up once by the render-engine, threaded through every
 * SceneObjectData.draw(view3d, queue, frame, object) call.
 *
 * `gl` is still here for the WebGL adapter and the scheduleRawGLPass escape
 * hatch. Once the WebGPU adapter lands it carries a GPUCommandEncoder /
 * GPURenderPassEncoder instead, and `gl` becomes optional.
 */
export interface FrameContext {
  gl: WebGL2RenderingContext
  uniforms: IUniformsBlock
  /**
   * Default pipeline for the current draw — set by the SceneObject dispatcher
   * when it invokes drawQ / drawWireframeQ / drawOutlineQ / drawIdsQ. Used by
   * the base-class bridges that delegate to the legacy immediate-mode draw
   * methods; new code reads it as `frame.program` if it wants a starting point
   * for its own submissions, or supplies its own pipeline per submit().
   */
  program?: ShaderProgram
}

/**
 * One draw record. The shape is deliberately small so the WebGL adapter can
 * translate it directly into `program.bind() + mesh.draw()` and the future
 * WebGPU adapter can translate it into `setPipeline + setBindGroup* + draw`.
 *
 * `uniforms` is per-submission; when omitted the adapter falls back to the
 * frame-wide uniforms on FrameContext.
 */
export interface Submission {
  pipeline: ShaderProgram
  mesh: Drawable
  uniforms?: IUniformsBlock
  primflag?: PrimitiveTypes
}

/**
 * Recording surface passed to SceneObjectData.draw. The WebGL adapter
 * dispatches immediately; the WebGPU adapter (Phase 4) records into a
 * command encoder.
 */
export interface DrawQueue {
  submit(s: Submission): void
  scheduleRawGLPass(cb: (gl: WebGL2RenderingContext) => void): void
}

/**
 * Drop-in WebGL backend: each submit() translates to today's imperative
 * program.bind / mesh.draw sequence. Lets the call-site refactor land before
 * any WebGPU code exists.
 */
export class WebGLDrawQueueAdapter implements DrawQueue {
  frame: FrameContext

  constructor(frame: FrameContext) {
    this.frame = frame
  }

  submit(s: Submission): void {
    const gl = this.frame.gl
    const uniforms = s.uniforms ?? this.frame.uniforms
    s.pipeline.bind(gl, uniforms)
    s.mesh.draw(gl, uniforms, s.pipeline)
  }

  scheduleRawGLPass(cb: (gl: WebGL2RenderingContext) => void): void {
    cb(this.frame.gl)
  }
}

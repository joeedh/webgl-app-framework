/**
 * WebGPU sibling of `view3d_draw.ts` / `View3D.viewportDraw_intern`.
 *
 * Owns the per-canvas WebGPU lifecycle (`GpuContext` +
 * `WebGpuRenderContext`) and drives a single canvas-targeted render
 * pass that walks the scene-object draw chain. Because
 * `createDrawQueue` in `scripts/render/queue_factory.ts` already
 * branches on `isWebGPU()` + the registered active context, all we
 * have to do here is:
 *
 *   1. Construct + register the `WebGpuRenderContext` once per canvas.
 *   2. Each frame: acquire the canvas surface, open one full-canvas
 *      render pass, set viewport/scissor to the view3d region, then
 *      drive the existing scene-object draw chain inside it.
 *
 * The color + depth attachments cover the *entire canvas surface*
 * (otherwise WebGPU rejects the pass with a size-mismatch). The
 * view3d region inside that canvas is enforced with `setViewport`
 * + `setScissorRect` so multi-area screens render to the right
 * rectangles.
 *
 * The legacy WebGL `ShaderProgram` objects in `view3d_shaders.Shaders`
 * are replaced by `wgslKey`-tagged stubs on the WebGPU path (see
 * `loadWgslShaderStubs` in `view3d.ts`), so existing `ob.draw(view3d,
 * gl, uniforms, program)` calls flow through `createDrawQueue` →
 * `WebGPUDrawQueueAdapter`, which resolves the pipeline from the
 * WGSL registry via that key.
 */

import {Matrix4, Vector2} from '../../path.ux/scripts/util/vectormath.js'
import type {Vector3, Vector4} from '../../path.ux/scripts/util/vectormath.js'
import type {DrawMats, IUniformsBlock, ShaderProgram} from '../../webgl/webgl.js'
import {SimpleMesh, LayerTypes} from '../../webgl/simplemesh.js'
import type {FrameContext} from '../../render/queue.js'
import {isWebGPU} from '../../core/renderer_flag.js'
import {GpuContext} from '../../webgpu/gpucontext.js'
import {WebGpuRenderContext} from '../../webgpu/render_context.js'
import {GpuTexture} from '../../webgpu/texture.js'
import {TextureUsage} from '../../webgpu/flags.js'
import {setActiveWebGpuContext, createDrawQueue} from '../../render/queue_factory.js'
import {View3DFlags} from './view3d_base.js'
import * as view3d_shaders from '../../shaders/shaders.js'

interface WebGpuViewport {
  gpu: GpuContext
  ctx: WebGpuRenderContext
  /** Cached depth texture; recreated when canvas surface size changes. */
  depth: GpuTexture | undefined
  depthSize: [number, number]
}

const viewports = new WeakMap<HTMLCanvasElement | OffscreenCanvas, WebGpuViewport>()
const inflightInits = new WeakMap<HTMLCanvasElement | OffscreenCanvas, Promise<WebGpuViewport>>()

function fakeDrawMats(): DrawMats {
  return {} as DrawMats
}

async function initViewport(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  size: [number, number]
): Promise<WebGpuViewport> {
  const gpu = await GpuContext.create({canvas, powerPreference: 'high-performance'})
  const ctx = new WebGpuRenderContext({
    device       : gpu.device,
    drawmats     : fakeDrawMats(),
    size,
    surfaceFormat: gpu.surfaceFormat,
  })
  setActiveWebGpuContext(ctx)
  const viewport: WebGpuViewport = {gpu, ctx, depth: undefined, depthSize: [0, 0]}
  viewports.set(canvas, viewport)
  // Debug hook — exposes the live device + ctx so the DevTools console
  // can `gpuDevice.popErrorScope()` etc. without touching app code.
  ;(globalThis as unknown as {__webgpuDebug?: unknown}).__webgpuDebug = {
    gpu, ctx, device: gpu.device, viewport,
  }
  gpu.device.addEventListener?.('uncapturederror', (ev) => {
    const e = ev as unknown as {error: GPUError}
    console.error('[webgpu] uncapturederror:', e.error.message)
  })
  return viewport
}

function ensureDepth(viewport: WebGpuViewport, w: number, h: number): GpuTexture {
  if (viewport.depth && viewport.depthSize[0] === w && viewport.depthSize[1] === h) {
    return viewport.depth
  }
  viewport.depth?.destroy()
  viewport.depth = new GpuTexture(viewport.gpu.device, {
    label : 'view3d.depth',
    width : w,
    height: h,
    format: 'depth24plus',
    usage : TextureUsage.RENDER_ATTACHMENT,
  })
  viewport.depthSize = [w, h]
  return viewport.depth
}

const warnedFeatures = new Set<string>()
function warnOnce(key: string, message: string): void {
  if (warnedFeatures.has(key)) return
  warnedFeatures.add(key)
  console.warn(`[webgpu] ${key}: ${message}`)
}

/**
 * `view3d.viewportDraw_intern`'s WebGPU sibling. Synchronous —
 * kicks the async device init on the first call and returns; the
 * frame draws on the second `redraw_viewport()` after init resolves.
 */
export function drawViewportWebGpu(view3d: ViewLike): void {
  if (!isWebGPU()) return
  const canvas = view3d.canvas
  if (!canvas) return

  let viewport = viewports.get(canvas)
  if (!viewport) {
    let pending = inflightInits.get(canvas)
    if (!pending) {
      const initSize: [number, number] = [
        Math.max(1, canvas.width | 0),
        Math.max(1, canvas.height | 0),
      ]
      pending = initViewport(canvas, initSize).finally(() => {
        inflightInits.delete(canvas)
      })
      inflightInits.set(canvas, pending)
      pending.then(() => {
        // The first frame's drawViewportWebGpu call returned early
        // before init resolved. Nothing else will schedule a frame
        // (the rAF loop only re-fires on `redraw_viewport()` /
        // interaction), so kick one ourselves once the device is up.
        const w = window as unknown as {redraw_viewport?: () => void}
        w.redraw_viewport?.()
      }).catch(err => {
        console.error('[webgpu] init failed — falling back to WebGL on next frame', err)
      })
    }
    return
  }

  if (view3d.activeCamera) viewport.ctx.drawmats = view3d.activeCamera

  const canvasTex = viewport.gpu.canvasContext.getCurrentTexture()
  // The canvas texture is sized to the full HTMLCanvasElement
  // (canvas.width × canvas.height), so the depth attachment MUST
  // match that, not the view3d region's glSize.
  const surfaceW = canvasTex.width
  const surfaceH = canvasTex.height
  viewport.ctx.size = [surfaceW, surfaceH]
  const depth = ensureDepth(viewport, surfaceW, surfaceH)

  const desc: GPURenderPassDescriptor = {
    label          : 'view3d.canvasPass',
    colorAttachments: [{
      view      : canvasTex.createView(),
      clearValue: {r: 0.15, g: 0.15, b: 0.15, a: 1},
      loadOp    : 'clear',
      storeOp   : 'store',
    }],
    depthStencilAttachment: {
      view             : depth.view,
      depthClearValue  : 1.0,
      depthLoadOp      : 'clear',
      depthStoreOp     : 'store',
    },
  }

  viewport.ctx.beginFrame()
  try {
    viewport.ctx.renderStageDesc(desc, (pass) => {
      // Clip to the view3d region inside the full-canvas attachments.
      const x = clamp(view3d.glPos[0] | 0, 0, surfaceW)
      const y = clamp(view3d.glPos[1] | 0, 0, surfaceH)
      const w = clamp(view3d.glSize[0] | 0, 0, surfaceW - x)
      const h = clamp(view3d.glSize[1] | 0, 0, surfaceH - y)
      if (w > 0 && h > 0) {
        pass.setViewport(x, y, w, h, 0, 1)
        pass.setScissorRect(x, y, w, h)
      }
      drawSceneWebGpu(view3d)
    })
  } finally {
    viewport.ctx.endFrame()
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/**
 * Drive the scene-object draw chain plus a minimal set of overlays
 * inside the open WebGPU render pass.
 *
 * Each overlay is wrapped in its own try/catch so a failure in one
 * (say, an unported widget pipeline) doesn't kill the entire frame.
 */
function drawSceneWebGpu(view3d: ViewLike): void {
  // Scene-object meshes — routes through createDrawQueue, which
  // returns the WebGPU adapter while currentPass is open.
  try {
    view3d.drawObjects?.()
  } catch (err) {
    warnOnce('drawObjects', `${(err as Error).message}`)
  }

  drawGridWebGpu(view3d)
  drawDrawLinesWebGpu(view3d)

  // Toolmode overlays — most call SimpleMesh.draw / SimpleMesh.drawLines,
  // which route through createDrawQueue on WebGPU. The legacy
  // gl.enable/depthMask/blendFunc bookkeeping inside on_drawstart/end
  // hits the permissive stub which no-ops it.
  const scene = (view3d as ViewLike & {ctx?: {scene?: SceneLike}}).ctx?.scene
  if (scene?.toolmode) {
    try {
      scene.toolmode.on_drawstart?.(view3d, view3d.gl as WebGL2RenderingContext)
    } catch (err) {
      warnOnce('toolmode.on_drawstart', `${(err as Error).message}`)
    }
  }

  // Widgets — `WidgetShape.draw` calls `this.mesh.draw(gl)` which
  // SimpleMesh routes through the queue on WebGPU.
  try {
    view3d.widgets?.draw?.(view3d, view3d.gl as WebGL2RenderingContext)
  } catch (err) {
    warnOnce('widgets', `${(err as Error).message}`)
  }

  if (scene?.toolmode) {
    try {
      scene.toolmode.on_drawend?.(view3d, view3d.gl as WebGL2RenderingContext)
    } catch (err) {
      warnOnce('toolmode.on_drawend', `${(err as Error).message}`)
    }
  }

  // The RealtimeEngine pass graph (drawRender) still needs its own
  // WGSL port — that lives in scripts/webgpu/render_graph.ts but
  // none of the realtime passes have a WGSL sibling yet. The smoke
  // path only matters when SHOW_RENDER / ONLY_RENDER is set.
  if (view3d.flag !== undefined &&
      (view3d.flag & (View3DFlags.SHOW_RENDER | View3DFlags.ONLY_RENDER))) {
    warnOnce('drawRender',
      'RealtimeEngine pass graph not yet on WebGPU — flip off SHOW_RENDER to see scene-object meshes.')
  }
}

function drawGridWebGpu(view3d: ViewLike): void {
  if (!view3d.grid) return
  if (view3d.flag === undefined || !(view3d.flag & View3DFlags.SHOW_GRID)) return

  const program = view3d_shaders.Shaders.BasicLineShader
  if (!program) {
    warnOnce('grid', 'view3d_shaders.Shaders.BasicLineShader not initialized')
    return
  }

  try {
    const uniforms: IUniformsBlock = {
      ...sharedUniforms(view3d),
      objectMatrix : new Matrix4(),
      polygonOffset: 0.0,
      alpha        : 1.0,
    } as unknown as IUniformsBlock
    submitMeshWebGpu(view3d, view3d.grid, program, uniforms)
  } catch (err) {
    warnOnce('grid', `${(err as Error).message}`)
  }
}

function drawDrawLinesWebGpu(view3d: ViewLike): void {
  const drawlines = view3d.drawlines
  if (!drawlines || drawlines.length === 0) return

  const program = view3d_shaders.Shaders.BasicLineShader
  if (!program) {
    warnOnce('drawDrawLines', 'view3d_shaders.Shaders.BasicLineShader not initialized')
    return
  }

  try {
    const sm  = new SimpleMesh(LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV)
    const sm2 = new SimpleMesh(LayerTypes.LOC | LayerTypes.COLOR | LayerTypes.UV)
    for (let i = 0; i < drawlines.length; i++) {
      const dl = drawlines[i] as DrawLineLike
      const line = (dl.useZ ? sm : sm2).line(dl.v1, dl.v2)
      line.uvs(new Vector2([0, 0]), new Vector2([1, 1]))
      line.colors(dl.color, dl.color)
    }
    const uniforms: IUniformsBlock = {
      ...sharedUniforms(view3d),
      objectMatrix : new Matrix4(),
      polygonOffset: 2.5,
      alpha        : 1.0,
    } as unknown as IUniformsBlock
    submitMeshWebGpu(view3d, sm2 as unknown as SimpleMesh, program, uniforms)
    submitMeshWebGpu(view3d, sm as unknown as SimpleMesh, program, uniforms)
    // Don't sm.destroy(gl) — gl is the throwing Proxy. The buffers
    // are short-lived; GpuBuffers get GC'd along with the SimpleMesh.
  } catch (err) {
    warnOnce('drawDrawLines', `${(err as Error).message}`)
  }
}

/**
 * Submit a SimpleMesh-like through createDrawQueue. The WebGPU adapter
 * resolves `program.wgslKey` against the WGSL shader registry, then
 * calls `mesh.drawGPU(pass, pipeline, uniforms)` after uploading any
 * pending vertex buffers via `_uploadGpuBuffers`.
 */
function submitMeshWebGpu(
  view3d: ViewLike,
  mesh: SimpleMesh,
  program: ShaderProgram,
  uniforms: IUniformsBlock
): void {
  const frame: FrameContext = {gl: view3d.gl as WebGL2RenderingContext, uniforms, program}
  const queue = createDrawQueue(frame)
  queue.submit({pipeline: program, mesh, uniforms})
}

function sharedUniforms(view3d: ViewLike): IUniformsBlock {
  const cam = view3d.activeCamera
  return {
    projectionMatrix: cam.rendermat,
    normalMatrix    : cam.normalmat,
    near            : cam.near,
    far             : cam.far,
    aspect          : cam.aspect,
    size            : view3d.glSize,
    polygonOffset   : 0.0,
    object_id       : 0,
  } as unknown as IUniformsBlock
}

// Minimal structural type — we don't import View3D to avoid pulling
// the whole editor module graph into the WebGPU module.
interface ViewLike {
  canvas: HTMLCanvasElement | OffscreenCanvas
  activeCamera: DrawMatsCamera
  glSize: ArrayLike<number>
  glPos: ArrayLike<number>
  size: ArrayLike<number>
  gl: unknown
  flag?: number
  grid?: SimpleMesh
  drawlines?: ArrayLike<DrawLineLike>
  drawObjects?: () => void
  widgets?: {draw?: (view3d: ViewLike, gl: WebGL2RenderingContext) => void}
}

interface SceneLike {
  toolmode?: {
    on_drawstart?: (view3d: ViewLike, gl: WebGL2RenderingContext) => void
    on_drawend?: (view3d: ViewLike, gl: WebGL2RenderingContext) => void
  }
}

interface DrawMatsCamera extends DrawMats {
  rendermat: Matrix4
  normalmat: Matrix4
  near: number
  far: number
  aspect: number
}

interface DrawLineLike {
  v1: Vector3
  v2: Vector3
  color: Vector4
  useZ: boolean
}

/**
 * Replacement for `window._gl` when the app boots in WebGPU mode.
 *
 * WebGPU encodes pixel-pipeline state (blend, depth, viewport, clear
 * color, polygon offset, ...) into the pipeline + render-pass
 * descriptors rather than via per-call gl.enable/gl.depthMask/etc, so
 * the imperative GL state-setting calls have no per-frame WebGPU
 * equivalent. The stub silently no-ops those — they're dead writes,
 * not failures.
 *
 * Actual GPU work (draws, buffer uploads, texture creation, shader
 * compiles) still throws so a stray legacy code path surfaces at the
 * exact line that needed an `isWebGPU()` guard.
 */

// WebGL state-management methods that have no per-call WebGPU
// equivalent (handled by pipeline state / pass descriptor instead).
// These are SILENT NO-OPS on the stub — legacy code that calls them
// is harmless on the WebGPU path.
const SILENT_NOOP_METHODS = new Set([
  'enable', 'disable', 'isEnabled',
  'depthMask', 'depthFunc', 'depthRange',
  'blendFunc', 'blendFuncSeparate', 'blendEquation', 'blendEquationSeparate', 'blendColor',
  'colorMask', 'stencilMask', 'stencilFunc', 'stencilFuncSeparate',
  'stencilOp', 'stencilOpSeparate',
  'cullFace', 'frontFace', 'lineWidth', 'polygonOffset',
  'scissor', 'viewport',
  'clearColor', 'clearDepth', 'clearStencil', 'clear',
  'pixelStorei', 'hint',
  'activeTexture', 'bindTexture', 'bindFramebuffer', 'bindRenderbuffer',
  'bindBuffer', 'bindBufferBase', 'bindBufferRange',
  'bindVertexArray', 'bindSampler',
  'useProgram',
  'flush', 'finish',
  'getError',
  'disableVertexAttribArray', 'enableVertexAttribArray',
  'uniform1i', 'uniform1f', 'uniform2f', 'uniform2fv', 'uniform2i', 'uniform2iv',
  'uniform3f', 'uniform3fv', 'uniform3i', 'uniform3iv',
  'uniform4f', 'uniform4fv', 'uniform4i', 'uniform4iv',
  'uniform1iv', 'uniform1fv',
  'uniformMatrix2fv', 'uniformMatrix3fv', 'uniformMatrix4fv',
  'vertexAttribPointer', 'vertexAttribIPointer', 'vertexAttribDivisor',
  'sampleCoverage',
])

// Methods whose return value the caller probably reads — give them
// something innocuous instead of a throw. (E.g. getParameter is used
// for capability detection.)
const SAFE_GETTER_METHODS = new Set([
  'getParameter', 'getExtension', 'getSupportedExtensions',
  'getContextAttributes',
  'getUniformLocation', 'getAttribLocation',
])

const noop = () => undefined

export function makeWebGpuGlStub(canvas: HTMLCanvasElement | OffscreenCanvas): WebGL2RenderingContext {
  const target = {canvas} as {canvas: typeof canvas}
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop === 'canvas') return t.canvas
      if (typeof prop === 'symbol') return undefined
      const name = prop as string
      if (SILENT_NOOP_METHODS.has(name)) return noop
      if (SAFE_GETTER_METHODS.has(name)) {
        // Return a function that gives `null` for any lookup (which is
        // exactly what WebGL returns for missing uniforms/attribs/extensions).
        return () => null
      }
      // WebGL enum constants are all-caps. Return a placeholder number so
      // legacy code can read e.g. `gl.DEPTH_TEST` without crashing.
      if (/^[A-Z][A-Z0-9_]*$/.test(name)) return 0
      throw new Error(
        `[webgpu] WebGL property "${name}" accessed on WebGPU stub — ` +
          `this code path needs an isWebGPU() guard (or, if it's harmless ` +
          `state, add it to SILENT_NOOP_METHODS in view3d_draw_webgpu.ts).`
      )
    },
  }) as unknown as WebGL2RenderingContext
  return proxy
}

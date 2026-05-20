/**
 * WebGPU sibling of `view3d_draw.ts` / `View3D.viewportDraw_intern`.
 *
 * Owns the per-canvas WebGPU lifecycle (`GpuContext` + `WebGpuRenderContext`)
 * and drives a single canvas-targeted render pass that walks the
 * scene-object draw chain. Because `createDrawQueue` in
 * `scripts/render/queue_factory.ts` already branches on `isWebGPU()` +
 * the registered active context, all we have to do here is:
 *
 *   1. Construct + register the `WebGpuRenderContext` once per canvas.
 *   2. Each frame: acquire the canvas surface, open a render pass, set
 *      `currentPass`, run the per-object draw loop inside it.
 *
 * Everything else (grid, drawlines, widgets, toolmode overlays, the
 * full `RealtimeEngine` pass graph) is intentionally skipped on this
 * smoke-test path. Each is tagged TODO(webgpu-followup) and has its
 * own per-feature port pending — see the migration plan.
 */

import type {Matrix4} from '../../path.ux/scripts/util/vectormath.js'
import type {DrawMats} from '../../webgl/webgl.js'
import {isWebGPU} from '../../core/renderer_flag.js'
import {GpuContext} from '../../webgpu/gpucontext.js'
import {WebGpuRenderContext} from '../../webgpu/render_context.js'
import {GpuTexture} from '../../webgpu/texture.js'
import {TextureUsage} from '../../webgpu/flags.js'
import {setActiveWebGpuContext} from '../../render/queue_factory.js'

interface WebGpuViewport {
  gpu: GpuContext
  ctx: WebGpuRenderContext
  /** Cached depth texture, recreated on size change. */
  depth: GpuTexture | undefined
  depthSize: [number, number]
}

const viewports = new WeakMap<HTMLCanvasElement | OffscreenCanvas, WebGpuViewport>()
const inflightInits = new WeakMap<HTMLCanvasElement | OffscreenCanvas, Promise<WebGpuViewport>>()

/**
 * `DrawMats` is required by `WebGpuRenderContextOptions` but the
 * matrices are mutable on the camera and we update them in place — so
 * any concrete `DrawMats` (the active camera) works fine. We grab one
 * here lazily; the context's `drawmats` reference is rebound each
 * frame in `drawViewportWebGpu`.
 */
function fakeDrawMats(): DrawMats {
  // We only need the shape; nothing reads it until callers wire up a
  // real camera, at which point drawViewportWebGpu replaces it.
  return {} as DrawMats
}

async function initViewport(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  size: [number, number]
): Promise<WebGpuViewport> {
  const gpu = await GpuContext.create({canvas, powerPreference: 'high-performance'})
  const ctx = new WebGpuRenderContext({
    device  : gpu.device,
    drawmats: fakeDrawMats(),
    size,
  })
  setActiveWebGpuContext(ctx)
  const viewport: WebGpuViewport = {gpu, ctx, depth: undefined, depthSize: [0, 0]}
  viewports.set(canvas, viewport)
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

let warnedSkipped = false

function warnSkippedFeaturesOnce(): void {
  if (warnedSkipped) return
  warnedSkipped = true
  console.warn(
    '[webgpu] viewport draw on WebGPU is a smoke-test path — these features are skipped:\n' +
      '  - RealtimeEngine pass graph (drawRender)\n' +
      '  - grid lines\n' +
      '  - drawDrawLines\n' +
      '  - scene.toolmode.on_drawstart / on_drawend / drawObject\n' +
      '  - widgets.draw\n' +
      'see scripts/editors/view3d/view3d_draw_webgpu.ts for per-feature TODOs.'
  )
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

  const sz = view3d.glSize ?? view3d.size
  const size: [number, number] = [Math.max(1, ~~sz[0]), Math.max(1, ~~sz[1])]

  let viewport = viewports.get(canvas)
  if (!viewport) {
    let pending = inflightInits.get(canvas)
    if (!pending) {
      pending = initViewport(canvas, size).finally(() => {
        inflightInits.delete(canvas)
      })
      inflightInits.set(canvas, pending)
      pending.catch(err => {
        console.error('[webgpu] init failed — falling back to WebGL on next frame', err)
      })
    }
    // First frame after a `?renderer=webgpu` flip: nothing to draw yet.
    return
  }

  warnSkippedFeaturesOnce()

  // Keep size + matrices fresh — the camera matrices are populated by
  // viewportDraw_intern's caller (regen_mats already ran), so we
  // just point at the active camera's DrawMats.
  viewport.ctx.size = size
  if (view3d.activeCamera) viewport.ctx.drawmats = view3d.activeCamera

  const canvasTex = viewport.gpu.canvasContext.getCurrentTexture()
  const depth = ensureDepth(viewport, size[0], size[1])

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
    viewport.ctx.renderStageDesc(desc, () => {
      drawObjectsWebGpu(view3d)
    })
  } finally {
    viewport.ctx.endFrame()
  }
}

/**
 * Per-object loop, WebGPU edition. Mirrors `View3D.drawObjects()` but
 * skips toolmode.drawObject — toolmode overlays haven't been ported
 * and they'd touch the stub `gl` directly.
 *
 * Reuses the existing `ob.draw(view3d, gl, uniforms, program)`
 * signature; `gl` is a stub Proxy in WebGPU mode and never executed
 * because the draw flows through `createDrawQueue` → WebGPU adapter.
 */
function drawObjectsWebGpu(view3d: ViewLike): void {
  const scene = view3d.ctx?.scene
  if (!scene) return
  const camera = view3d.activeCamera
  if (!camera) return

  // `Shaders` is loaded by WebGL boot — pull it lazily so this module
  // doesn't pull the WebGL chain into the WebGPU smoke path's
  // dependency graph at import time.
  const Shaders = (globalThis as unknown as {view3d_shaders?: {Shaders?: Record<string, unknown>}})
    .view3d_shaders?.Shaders
  // Fall through with undefined program — the WebGPU adapter resolves
  // via `submission.pipeline.wgslKey`, so as long as ob.draw passes a
  // ShaderProgram that carries the wgslKey tag, we're fine. The
  // legacy `Shaders.BasicLitMesh` is the default.
  const program = (Shaders?.BasicLitMesh ?? null) as unknown
  if (program === null) {
    // Shaders not yet loaded — should be impossible since glInit runs first,
    // but bail rather than crash.
    return
  }

  const uniforms = {
    projectionMatrix: camera.rendermat,
    normalMatrix    : camera.normalmat,
    near            : camera.near,
    far             : camera.far,
    aspect          : camera.aspect,
    size            : view3d.glSize,
    polygonOffset   : 0.0,
    objectMatrix    : undefined as unknown,
    object_id       : 0,
    alpha           : 1.0,
  }

  const gl = view3d.gl // the stub Proxy; routed only to the WebGL adapter,
                       // which createDrawQueue skips on WebGPU.

  for (const ob of scene.objects.visible) {
    uniforms.objectMatrix = ob.outputs.matrix.getValue()
    uniforms.object_id = ob.lib_id
    ob.draw(view3d, gl, uniforms, program)
  }
}

// Minimal structural type — we don't import View3D to avoid pulling
// the whole editor module graph into the WebGPU module.
interface ViewLike {
  canvas: HTMLCanvasElement | OffscreenCanvas
  ctx: {scene?: SceneLike}
  activeCamera: DrawMatsCamera
  glSize: ArrayLike<number>
  size: ArrayLike<number>
  gl: unknown
}

interface DrawMatsCamera extends DrawMats {
  rendermat: Matrix4
  normalmat: Matrix4
  near: number
  far: number
  aspect: number
}

interface SceneLike {
  objects: {visible: Iterable<SceneObjectLike>}
}

interface SceneObjectLike {
  lib_id: number
  outputs: {matrix: {getValue: () => Matrix4}}
  draw: (view3d: ViewLike, gl: unknown, uniforms: unknown, program: unknown) => void
}

/**
 * Replacement for `window._gl` when the app boots in WebGPU mode. Holds
 * the real canvas (so `getWebGL().canvas` and `this.canvas = this.gl.canvas`
 * still work) but throws on any other property access — surfaces the
 * exact line that tried to call a WebGL API on the WebGPU path.
 */
export function makeWebGpuGlStub(canvas: HTMLCanvasElement | OffscreenCanvas): WebGL2RenderingContext {
  const target = {canvas} as {canvas: typeof canvas}
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (prop === 'canvas') return t.canvas
      throw new Error(
        `[webgpu] WebGL property "${String(prop)}" accessed on WebGPU stub — ` +
          `this code path needs an isWebGPU() guard.`
      )
    },
  }) as unknown as WebGL2RenderingContext
  return proxy
}

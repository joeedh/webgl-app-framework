/**
 * Renderer backend flag — `'webgl'` (default) or `'webgpu'`.
 *
 * Per Phase 4 of the WebGL→WebGPU migration plan: keep both backends in
 * the tree, select between them at runtime. URL param `?renderer=webgpu`
 * or `localStorage.renderer = 'webgpu'` flips the active backend; the
 * dispatcher in the render engine reads `getRenderer()` to decide whether
 * to construct `WebGLDrawQueueAdapter` or `WebGPUDrawQueueAdapter` per
 * frame.
 *
 * Default stays on WebGL until the WebGPU port reaches parity (Phase 4b/c
 * porting all SimpleIsland + WebGLBatchExecutor consumers, Phase 5
 * porting the render passes).
 */

export type RendererBackend = 'webgl' | 'webgpu'

let cached: RendererBackend | undefined

function detect(): RendererBackend {
  // URL takes precedence — useful for A/B testing & visual regression.
  if (typeof location !== 'undefined') {
    const params = new URLSearchParams(location.search)
    const param = params.get('renderer')
    if (param === 'webgpu' || param === 'webgl') return param
  }
  if (typeof localStorage !== 'undefined') {
    const stored = localStorage.getItem('renderer')
    if (stored === 'webgpu' || stored === 'webgl') return stored
  }
  return 'webgl'
}

export function getRenderer(): RendererBackend {
  if (cached === undefined) cached = detect()
  return cached
}

export function setRenderer(backend: RendererBackend): void {
  cached = backend
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('renderer', backend)
  }
}

/** Test-only — clear the cached value so the next `getRenderer()` re-detects. */
export function resetRendererCache(): void {
  cached = undefined
}

/**
 * Convenience for branching code paths.
 *
 *     if (isWebGPU()) { ... } else { ... }
 */
export function isWebGPU(): boolean {
  return getRenderer() === 'webgpu' && typeof navigator !== 'undefined' && !!(navigator as Navigator & {gpu?: unknown}).gpu
}

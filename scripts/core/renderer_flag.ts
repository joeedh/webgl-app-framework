/**
 * Renderer backend flag — `'webgpu'` (default) or `'webgl'`.
 *
 * Default flipped to WebGPU on 2026-05-22 once the renderengine port and
 * overlays-port (grid, drawDrawLines, drawObjects, widgets, toolmode
 * overlays) reached parity. `isWebGPU()` still gates on `navigator.gpu`,
 * so browsers without WebGPU support transparently fall back to WebGL.
 *
 * Escape hatches preserved: URL param `?renderer=webgl` or
 * `localStorage.renderer = 'webgl'` forces the legacy backend for A/B
 * testing and visual regression.
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
  return 'webgpu'
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
  return (
    getRenderer() === 'webgpu' && typeof navigator !== 'undefined' && !!(navigator as Navigator & {gpu?: unknown}).gpu
  )
}

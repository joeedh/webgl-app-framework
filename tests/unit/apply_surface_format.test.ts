/**
 * Pure-function tests for `applySurfaceFormat` — the canvas-format
 * rewrite that runs on every pipeline descriptor right before it
 * reaches `PipelineCache.get`. Extracted from
 * `WebGPUDrawQueueAdapter._applySurfaceFormat` so it can be exercised
 * without standing up a `GPUDevice`.
 */

import {applySurfaceFormat, type PipelineDescriptor} from '../../scripts/webgpu/pipeline'

function desc(formats: GPUTextureFormat[]): PipelineDescriptor {
  return {
    wgsl         : '',
    vertexBuffers: [],
    colorTargets : formats.map((format) => ({format})),
  }
}

describe('applySurfaceFormat', () => {
  test('no surface format → unchanged', () => {
    const d = desc(['bgra8unorm'])
    const out = applySurfaceFormat(d, undefined)
    expect(out.colorTargets[0].format).toBe('bgra8unorm')
  })

  test('bgra → rgba canvas rewrites bgra targets', () => {
    const out = applySurfaceFormat(desc(['bgra8unorm']), 'rgba8unorm')
    expect(out.colorTargets[0].format).toBe('rgba8unorm')
  })

  test('rgba → bgra canvas rewrites rgba targets', () => {
    const out = applySurfaceFormat(desc(['rgba8unorm']), 'bgra8unorm')
    expect(out.colorTargets[0].format).toBe('bgra8unorm')
  })

  test('matching format is a no-op rewrite', () => {
    const out = applySurfaceFormat(desc(['bgra8unorm']), 'bgra8unorm')
    expect(out.colorTargets[0].format).toBe('bgra8unorm')
  })

  test('non-interchangeable formats pass through (rgba32float for IDs)', () => {
    const out = applySurfaceFormat(desc(['rgba32float']), 'rgba8unorm')
    expect(out.colorTargets[0].format).toBe('rgba32float')
  })

  test('multiple targets: only interchangeable ones rewrite', () => {
    const out = applySurfaceFormat(
      desc(['bgra8unorm', 'rgba32float', 'rgba8unorm']),
      'bgra8unorm',
    )
    expect(out.colorTargets.map((t) => t.format)).toEqual([
      'bgra8unorm', 'rgba32float', 'bgra8unorm',
    ])
  })

  test('does not mutate the input descriptor', () => {
    const input = desc(['bgra8unorm'])
    applySurfaceFormat(input, 'rgba8unorm')
    expect(input.colorTargets[0].format).toBe('bgra8unorm')
  })
})

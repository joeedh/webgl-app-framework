/**
 * Tests the shader preprocessor's identifier substitution, added so the
 * WGSL render passes in `scripts/renderengine/wgsl_render_passes.ts` can use
 * numeric defines like `BLUR_SAMPLES`, `DEPTH_SCALE`, etc. directly in
 * source. Phase 0.2 of the renderengine WebGPU port plan
 * (documentation/plans/renderengine-webgpu-port-2026-05-21.md).
 */

import {preprocess} from '../../scripts/shaders/preprocess'

describe('preprocess identifier substitution', () => {
  test('numeric define is substituted into source', () => {
    const src = `for (var i : i32 = -BLUR_SAMPLES; i < BLUR_SAMPLES; i = i + 1) {}`
    const out = preprocess(src, {defines: {BLUR_SAMPLES: 5}})
    expect(out).toBe(`for (var i : i32 = -5; i < 5; i = i + 1) {}`)
  })

  test('string-valued define is substituted', () => {
    const src = `let f = DEPTH_SCALE;`
    const out = preprocess(src, {defines: {DEPTH_SCALE: '10.0'}})
    expect(out).toBe(`let f = 10.0;`)
  })

  test('boolean define (no value) is NOT substituted into source', () => {
    const src = `let BLUR_AXIS_Y = 1; // identifier kept`
    const out = preprocess(src, {defines: {BLUR_AXIS_Y: true}})
    expect(out).toBe(src)
  })

  test('boolean define still gates #ifdef blocks', () => {
    const src = ['#ifdef AXIS_Y', 'YES', '#else', 'NO', '#endif'].join('\n')
    expect(preprocess(src, {defines: {AXIS_Y: true}})).toBe('YES')
    expect(preprocess(src, {defines: {}})).toBe('NO')
  })

  test('word-boundary respected (NAME_2 not matched)', () => {
    const src = `let x = FOO_BAR; let y = FOO;`
    const out = preprocess(src, {defines: {FOO: 'X'}})
    expect(out).toBe(`let x = FOO_BAR; let y = X;`)
  })

  test('multiple defines substituted independently', () => {
    const src = `let f = (samp * DEPTH_PRESCALE + DEPTH_OFFSET) * DEPTH_SCALE;`
    const out = preprocess(src, {
      defines: {DEPTH_PRESCALE: '1.0', DEPTH_OFFSET: '-0.9', DEPTH_SCALE: '10.0'},
    })
    expect(out).toBe(`let f = (samp * 1.0 + -0.9) * 10.0;`)
  })

  test('substitution does not re-expand (single-pass)', () => {
    const src = `let v = A;`
    const out = preprocess(src, {defines: {A: 'B', B: '42'}})
    expect(out).toBe(`let v = B;`)
  })

  test('substitution skipped inside disabled #ifdef block', () => {
    const src = ['#ifdef GATE', 'X = N;', '#endif'].join('\n')
    expect(preprocess(src, {defines: {N: '5'}})).toBe('')
    expect(preprocess(src, {defines: {GATE: true, N: '5'}})).toBe('X = 5;')
  })

  test('inline #define value is substituted on following lines', () => {
    const src = ['#define K 7', 'let n = K;'].join('\n')
    expect(preprocess(src)).toBe('let n = 7;')
  })
})

/**
 * Tests the default-scene builder hook. Step 3 of the refactor (plan §3, §6 step 3).
 */

import {
  _resetDefaultSceneBuilderForTests,
  buildDefaultSceneContents,
  getDefaultSceneBuilder,
  setDefaultSceneBuilder,
} from '../../scripts/core/default_file'

describe('default_file builder', () => {
  beforeEach(() => {
    _resetDefaultSceneBuilderForTests()
  })

  test('starts with no builder', () => {
    expect(getDefaultSceneBuilder()).toBeNull()
  })

  test('setDefaultSceneBuilder + buildDefaultSceneContents invokes the callback', () => {
    const calls: unknown[][] = []
    setDefaultSceneBuilder((ctx, lib, scene) => {
      calls.push([ctx, lib, scene])
    })

    const fakeCtx = {} as any
    const fakeLib = {} as any
    const fakeScene = {} as any

    buildDefaultSceneContents(fakeCtx, fakeLib, fakeScene)

    expect(calls).toHaveLength(1)
    expect(calls[0][0]).toBe(fakeCtx)
    expect(calls[0][1]).toBe(fakeLib)
    expect(calls[0][2]).toBe(fakeScene)
  })

  test('buildDefaultSceneContents is a no-op when nothing is registered', () => {
    expect(() => buildDefaultSceneContents({} as any, {} as any, {} as any)).not.toThrow()
  })

  test('setDefaultSceneBuilder(null) clears the builder', () => {
    setDefaultSceneBuilder(() => {})
    expect(getDefaultSceneBuilder()).not.toBeNull()
    setDefaultSceneBuilder(null)
    expect(getDefaultSceneBuilder()).toBeNull()
  })
})

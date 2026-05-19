/**
 * Tests the data_kinds registry contract. Step 3 of the refactor (plan §3, §6 step 3).
 */

import {
  _resetDataKindsForTests,
  getDataKind,
  listDataKinds,
  registerDataKind,
  unregisterDataKind,
} from '../../scripts/core/data_kinds'

describe('data_kinds registry', () => {
  beforeEach(() => {
    _resetDataKindsForTests()
  })

  test('register / get round-trip', () => {
    registerDataKind({id: 'mesh', uiName: 'Mesh'})
    expect(getDataKind('mesh')?.uiName).toBe('Mesh')
  })

  test('duplicate registration throws', () => {
    registerDataKind({id: 'mesh'})
    expect(() => registerDataKind({id: 'mesh'})).toThrow(/already registered/)
  })

  test('unregister removes the entry', () => {
    registerDataKind({id: 'mesh'})
    unregisterDataKind('mesh')
    expect(getDataKind('mesh')).toBeUndefined()
  })

  test('listDataKinds returns all entries', () => {
    registerDataKind({id: 'mesh'})
    registerDataKind({id: 'curve'})
    expect(listDataKinds().map((k) => k.id).sort()).toEqual(['curve', 'mesh'])
  })
})

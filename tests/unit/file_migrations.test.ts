/**
 * Tests the file-migrations registry. Step 3 of the refactor (plan §3, §6 step 3).
 */

import {jest} from '@jest/globals'
import {
  _resetFileMigratorsForTests,
  listFileMigrators,
  registerFileMigrator,
  runFileMigrations,
  unregisterFileMigrator,
} from '../../scripts/core/file_migrations'

describe('file_migrations registry', () => {
  beforeEach(() => {
    _resetFileMigratorsForTests()
  })

  test('runs migrators in ascending fromVersion order', () => {
    const order: string[] = []
    registerFileMigrator({id: 'm6', fromVersion: 6, apply: () => order.push('m6')})
    registerFileMigrator({id: 'm5', fromVersion: 5, apply: () => order.push('m5')})
    registerFileMigrator({id: 'm7', fromVersion: 7, apply: () => order.push('m7')})

    runFileMigrations({fromVersion: 5, toVersion: 8, datalib: {} as any})

    expect(order).toEqual(['m5', 'm6', 'm7'])
  })

  test('only runs migrators in range', () => {
    const order: string[] = []
    registerFileMigrator({id: 'm5', fromVersion: 5, apply: () => order.push('m5')})
    registerFileMigrator({id: 'm9', fromVersion: 9, apply: () => order.push('m9')})

    runFileMigrations({fromVersion: 6, toVersion: 9, datalib: {} as any})

    expect(order).toEqual([])
  })

  test('migrator throw is logged but does not abort the chain', () => {
    const order: string[] = []
    const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    registerFileMigrator({
      id         : 'bad',
      fromVersion: 5,
      apply: () => {
        throw new Error('boom')
      },
    })
    registerFileMigrator({id: 'good', fromVersion: 6, apply: () => order.push('good')})

    runFileMigrations({fromVersion: 5, toVersion: 7, datalib: {} as any})

    expect(order).toEqual(['good'])
    expect(errSpy).toHaveBeenCalledWith(expect.stringMatching(/bad/), expect.any(Error))
    errSpy.mockRestore()
  })

  test('duplicate id rejected', () => {
    registerFileMigrator({id: 'm5', fromVersion: 5, apply: () => {}})
    expect(() => registerFileMigrator({id: 'm5', fromVersion: 6, apply: () => {}})).toThrow(/already registered/)
  })

  test('unregister removes the migrator', () => {
    registerFileMigrator({id: 'm5', fromVersion: 5, apply: () => {}})
    unregisterFileMigrator('m5')
    expect(listFileMigrators()).toHaveLength(0)
  })
})

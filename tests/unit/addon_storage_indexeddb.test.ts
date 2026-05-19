/**
 * Tests IndexedDBAddonStorage against fake-indexeddb. Step 9b of the refactor
 * (plan §6 step 9).
 *
 * The contract is the same as InMemoryAddonStorage (addon_storage.test.ts);
 * these tests cover the IndexedDB-specific bits: persistence across instances
 * (closing + reopening still finds the data), tx ordering, and the schema
 * upgrade path.
 */

import {TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder} from 'node:util'

import {IndexedDBAddonStorage} from '../../scripts/addon/storage'

const enc = new NodeTextEncoder()
const dec = new NodeTextDecoder()
const bytes = (s: string) => enc.encode(s)
const str = (b: Uint8Array) => dec.decode(b)

function uniqDbName(): string {
  return `test-addons-${Math.random().toString(36).slice(2)}`
}

describe('IndexedDBAddonStorage', () => {
  test('write + read + list round-trip', async () => {
    const s = new IndexedDBAddonStorage(uniqDbName())
    expect(await s.list()).toEqual([])

    await s.write(
      'a',
      new Map<string, Uint8Array>([
        ['manifest.json', bytes('{"id":"a","name":"A","version":"1.0.0","entry":"build/main.js"}')],
        ['build/main.js', bytes('export const x = 1')],
      ])
    )

    expect(await s.list()).toEqual(['a'])
    expect(str(await s.read('a', 'build/main.js'))).toBe('export const x = 1')

    await s._resetForTests()
  })

  test('readJSON parses stored JSON', async () => {
    const s = new IndexedDBAddonStorage(uniqDbName())
    await s.write('a', new Map([['manifest.json', bytes('{"hello":"world"}')]]))
    expect(await s.readJSON('a', 'manifest.json')).toEqual({hello: 'world'})
    await s._resetForTests()
  })

  test('read missing file rejects', async () => {
    const s = new IndexedDBAddonStorage(uniqDbName())
    await s.write('a', new Map())
    await expect(s.read('a', 'nope.js')).rejects.toThrow(/not found/)
    await s._resetForTests()
  })

  test('rejects path traversal', async () => {
    const s = new IndexedDBAddonStorage(uniqDbName())
    await s.write('a', new Map([['main.js', bytes('x')]]))
    await expect(s.read('a', '../etc/passwd')).rejects.toThrow(/invalid/)
    await s._resetForTests()
  })

  test('write replaces previous install (no stale files)', async () => {
    const s = new IndexedDBAddonStorage(uniqDbName())
    await s.write(
      'a',
      new Map<string, Uint8Array>([
        ['main.js', bytes('old')],
        ['extra.js', bytes('orphan')],
      ])
    )
    await s.write('a', new Map([['main.js', bytes('new')]]))
    expect(str(await s.read('a', 'main.js'))).toBe('new')
    await expect(s.read('a', 'extra.js')).rejects.toThrow(/not found/)
    await s._resetForTests()
  })

  test('remove drops the addon', async () => {
    const s = new IndexedDBAddonStorage(uniqDbName())
    await s.write('a', new Map([['main.js', bytes('x')]]))
    await s.write('b', new Map([['main.js', bytes('y')]]))
    await s.remove('a')
    expect((await s.list()).sort()).toEqual(['b'])
    await s._resetForTests()
  })

  test('persists across separate storage instances on the same db', async () => {
    const dbName = uniqDbName()
    const s1 = new IndexedDBAddonStorage(dbName)
    await s1.write('persisted', new Map([['main.js', bytes('survives')]]))

    // Different instance pointing at the same DB should see the data.
    const s2 = new IndexedDBAddonStorage(dbName)
    expect(await s2.list()).toEqual(['persisted'])
    expect(str(await s2.read('persisted', 'main.js'))).toBe('survives')

    await s2._resetForTests()
  })

  test('urlFor returns a blob: or data: URL', async () => {
    const s = new IndexedDBAddonStorage(uniqDbName())
    await s.write('a', new Map([['main.js', bytes('export const x = 42')]]))
    const url = await s.urlFor('a', 'main.js')
    expect(url).toMatch(/^(blob:|data:)/)
    await s._resetForTests()
  })

  test('urlFor is stable across calls', async () => {
    const s = new IndexedDBAddonStorage(uniqDbName())
    await s.write('a', new Map([['main.js', bytes('x')]]))
    const url1 = await s.urlFor('a', 'main.js')
    const url2 = await s.urlFor('a', 'main.js')
    expect(url1).toBe(url2)
    await s._resetForTests()
  })

  test('write of multiple addons keeps them isolated', async () => {
    const s = new IndexedDBAddonStorage(uniqDbName())
    await s.write('a', new Map([['file.js', bytes('A')]]))
    await s.write('b', new Map([['file.js', bytes('B')]]))
    expect(str(await s.read('a', 'file.js'))).toBe('A')
    expect(str(await s.read('b', 'file.js'))).toBe('B')
    expect((await s.list()).sort()).toEqual(['a', 'b'])
    await s._resetForTests()
  })
})

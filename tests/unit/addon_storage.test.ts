/**
 * Tests InMemoryAddonStorage. Step 9 of the refactor (plan §6 step 9).
 */

import {TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder} from 'node:util'

import {InMemoryAddonStorage} from '../../scripts/addon/storage'

// jsdom doesn't expose TextEncoder/TextDecoder globally; pull from node:util
// so tests don't have to depend on browser-only globals.
const enc = new NodeTextEncoder()
const dec = new NodeTextDecoder()

function bytes(s: string): Uint8Array {
  return enc.encode(s)
}

function str(b: Uint8Array): string {
  return dec.decode(b)
}

describe('InMemoryAddonStorage', () => {
  test('write + read + list round-trip', async () => {
    const s = new InMemoryAddonStorage()
    expect(await s.list()).toEqual([])

    const files = new Map<string, Uint8Array>([
      ['manifest.json', bytes('{"id":"a","name":"A","version":"1.0.0","entry":"build/main.js"}')],
      ['build/main.js', bytes('export const x = 1')],
    ])
    await s.write('a', files)

    expect(await s.list()).toEqual(['a'])
    expect(str(await s.read('a', 'build/main.js'))).toBe('export const x = 1')
  })

  test('readJSON parses', async () => {
    const s = new InMemoryAddonStorage()
    await s.write('a', new Map([['manifest.json', bytes('{"hello": "world"}')]]))
    expect(await s.readJSON('a', 'manifest.json')).toEqual({hello: 'world'})
  })

  test('read missing file throws', async () => {
    const s = new InMemoryAddonStorage()
    await s.write('a', new Map())
    await expect(s.read('a', 'nope.js')).rejects.toThrow(/not found/)
  })

  test('read from missing addon throws', async () => {
    const s = new InMemoryAddonStorage()
    await expect(s.read('ghost', 'x')).rejects.toThrow(/not installed/)
  })

  test('rejects path traversal', async () => {
    const s = new InMemoryAddonStorage()
    await s.write('a', new Map([['main.js', bytes('x')]]))
    await expect(s.read('a', '../etc/passwd')).rejects.toThrow(/invalid/)
    await expect(s.read('a', '/abs')).rejects.toThrow(/invalid/)
  })

  test('write replaces previous install', async () => {
    const s = new InMemoryAddonStorage()
    await s.write('a', new Map([['main.js', bytes('old')]]))
    await s.write('a', new Map([['main.js', bytes('new')]]))
    expect(str(await s.read('a', 'main.js'))).toBe('new')
  })

  test('remove drops the addon', async () => {
    const s = new InMemoryAddonStorage()
    await s.write('a', new Map([['main.js', bytes('x')]]))
    await s.write('b', new Map([['main.js', bytes('y')]]))
    await s.remove('a')
    expect((await s.list()).sort()).toEqual(['b'])
  })

  test('urlFor returns a blob: or data: URL', async () => {
    // In real browsers / Electron we'd get a blob: URL via URL.createObjectURL.
    // jsdom doesn't implement createObjectURL, so storage.ts falls back to a
    // data: URL. Both are valid module URLs for dynamic import().
    const s = new InMemoryAddonStorage()
    await s.write('a', new Map([['main.js', bytes('export const x = 42')]]))
    const url = await s.urlFor('a', 'main.js')
    expect(url).toMatch(/^(blob:|data:)/)

    // For data: URLs the contents are inline-base64 — decode to verify.
    if (url.startsWith('data:')) {
      const b64 = url.split(',')[1]
      const decoded = Buffer.from(b64, 'base64').toString('utf-8')
      expect(decoded).toBe('export const x = 42')
    }
  })

  test('urlFor is stable across calls', async () => {
    const s = new InMemoryAddonStorage()
    await s.write('a', new Map([['main.js', bytes('x')]]))
    const url1 = await s.urlFor('a', 'main.js')
    const url2 = await s.urlFor('a', 'main.js')
    expect(url1).toBe(url2)
  })
})

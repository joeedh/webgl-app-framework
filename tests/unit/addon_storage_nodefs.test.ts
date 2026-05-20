/**
 * Tests NodeFsAddonStorage against Node's real fs/promises (operating on a
 * temp directory). This is the backend the Electron renderer uses via
 * scripts/addon/storage_electron.ts. Step 9c of the refactor (plan §6 step 9).
 *
 * The contract is the same as InMemoryAddonStorage / IndexedDBAddonStorage —
 * tests here focus on the fs-specific paths: directory creation,
 * write-with-stale-files-removed, persistence across instances on the same
 * baseDir, listing only directories (not stray files in baseDir).
 */

import fsp from 'node:fs/promises'
import os from 'node:os'
import pathlib from 'node:path'
import {TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder} from 'node:util'

import {NodeFsAddonStorage} from '../../scripts/addon/storage'

const enc = new NodeTextEncoder()
const dec = new NodeTextDecoder()
const bytes = (s: string) => enc.encode(s)
const str = (b: Uint8Array) => dec.decode(b)

let tmpRoot: string

beforeEach(async () => {
  tmpRoot = await fsp.mkdtemp(pathlib.join(os.tmpdir(), 'webgl-addons-'))
})

afterEach(async () => {
  await fsp.rm(tmpRoot, {recursive: true, force: true})
})

function mkStorage(): NodeFsAddonStorage {
  return new NodeFsAddonStorage({baseDir: tmpRoot, fs: fsp, pathlib})
}

describe('NodeFsAddonStorage', () => {
  test('list() returns empty for nonexistent baseDir', async () => {
    const s = new NodeFsAddonStorage({
      baseDir: pathlib.join(tmpRoot, 'no-such-dir'),
      fs     : fsp,
      pathlib,
    })
    expect(await s.list()).toEqual([])
  })

  test('write + read + list round-trip', async () => {
    const s = mkStorage()
    await s.write(
      'a',
      new Map<string, Uint8Array>([
        ['manifest.json', bytes('{"id":"a","name":"A","version":"1.0.0","entry":"main.js"}')],
        ['build/main.js', bytes('export const x = 1')],
      ])
    )

    expect(await s.list()).toEqual(['a'])
    expect(str(await s.read('a', 'build/main.js'))).toBe('export const x = 1')
    expect(str(await s.read('a', 'manifest.json'))).toMatch(/"id":"a"/)
  })

  test('write replaces previous install (no stale files)', async () => {
    const s = mkStorage()
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
  })

  test('write creates nested directories', async () => {
    const s = mkStorage()
    await s.write(
      'a',
      new Map([['build/deep/nested/file.js', bytes('hi')]])
    )
    expect(str(await s.read('a', 'build/deep/nested/file.js'))).toBe('hi')
  })

  test('remove drops the addon directory', async () => {
    const s = mkStorage()
    await s.write('a', new Map([['main.js', bytes('x')]]))
    await s.write('b', new Map([['main.js', bytes('y')]]))
    await s.remove('a')
    expect((await s.list()).sort()).toEqual(['b'])
    await expect(s.read('a', 'main.js')).rejects.toThrow(/not found/)
  })

  test('persists across separate storage instances on the same baseDir', async () => {
    const s1 = mkStorage()
    await s1.write('persisted', new Map([['main.js', bytes('survives')]]))

    const s2 = mkStorage()
    expect(await s2.list()).toEqual(['persisted'])
    expect(str(await s2.read('persisted', 'main.js'))).toBe('survives')
  })

  test('list ignores stray files in baseDir', async () => {
    const s = mkStorage()
    await s.write('a', new Map([['main.js', bytes('x')]]))
    // Drop a stray file into baseDir.
    await fsp.writeFile(pathlib.join(tmpRoot, 'README.txt'), 'not an addon')
    expect(await s.list()).toEqual(['a'])
  })

  test('rejects path traversal', async () => {
    const s = mkStorage()
    await s.write('a', new Map([['main.js', bytes('x')]]))
    await expect(s.read('a', '../etc/passwd')).rejects.toThrow(/invalid/)
    await expect(s.read('a', '/abs/path')).rejects.toThrow(/invalid/)
  })

  test('readJSON parses', async () => {
    const s = mkStorage()
    await s.write('a', new Map([['manifest.json', bytes('{"hello":"world"}')]]))
    expect(await s.readJSON('a', 'manifest.json')).toEqual({hello: 'world'})
  })

  test('urlFor returns blob: or data: URL', async () => {
    const s = mkStorage()
    await s.write('a', new Map([['main.js', bytes('export const x = 42')]]))
    const url = await s.urlFor('a', 'main.js')
    expect(url).toMatch(/^(blob:|data:)/)
  })
})

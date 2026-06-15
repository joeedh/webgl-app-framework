/**
 * Unit tests for the autosave split-serialization container + placeholder
 * helpers (scripts/core/autosave_format.ts). Covers placeholder encode/decode,
 * the container round-trip (shell + blob table), and the rejection paths the
 * recovery loader relies on to fall back to plain-.wproj loading.
 */
import {
  makeBlobPlaceholder,
  readBlobPlaceholder,
  isAutosaveContainer,
  assembleAutosaveContainer,
  parseAutosaveContainer,
  type AutosaveBlob,
} from '../../scripts/core/autosave_format.js'

describe('blob placeholder', () => {
  test('round-trips a blobId', () => {
    for (const id of [0, 1, 42, 65535, 0x7fffffff, 0xfffffffe]) {
      const p = makeBlobPlaceholder(id)
      expect(p.length).toBe(8)
      expect(readBlobPlaceholder(p)).toBe(id)
    }
  })

  test('rejects non-placeholders', () => {
    expect(readBlobPlaceholder(new Uint8Array(8))).toBe(-1) // right length, wrong magic
    expect(readBlobPlaceholder(makeBlobPlaceholder(5).subarray(0, 7))).toBe(-1) // wrong length
    expect(readBlobPlaceholder(new Uint8Array([0x53, 0x43, 0x55, 0x4c, 0x50, 0x54, 0x30, 0x30]))).toBe(-1) // SCULPT00
  })
})

describe('autosave container', () => {
  function makeBytes(n: number, seed: number): Uint8Array {
    const a = new Uint8Array(n)
    for (let i = 0; i < n; i++) a[i] = (i * seed + 7) & 0xff
    return a
  }

  test('round-trips shell + blob table', () => {
    const shell = makeBytes(500, 13)
    const blobs: AutosaveBlob[] = [
      {blobId: 0, bytes: makeBytes(120, 3)},
      {blobId: 1, bytes: makeBytes(0, 1)}, // empty blob is legal
      {blobId: 2, bytes: makeBytes(4096, 91)},
    ]

    const file = assembleAutosaveContainer(shell, blobs)
    expect(isAutosaveContainer(file)).toBe(true)

    const parsed = parseAutosaveContainer(file)
    expect(Array.from(parsed.shell)).toEqual(Array.from(shell))
    expect(parsed.blobs.size).toBe(3)
    for (const b of blobs) {
      expect(Array.from(parsed.blobs.get(b.blobId)!)).toEqual(Array.from(b.bytes))
    }
  })

  test('round-trips with no blobs', () => {
    const shell = makeBytes(64, 5)
    const parsed = parseAutosaveContainer(assembleAutosaveContainer(shell, []))
    expect(parsed.blobs.size).toBe(0)
    expect(Array.from(parsed.shell)).toEqual(Array.from(shell))
  })

  test('isAutosaveContainer is false for short / foreign bytes', () => {
    expect(isAutosaveContainer(new Uint8Array(4))).toBe(false)
    expect(isAutosaveContainer(new Uint8Array([0x57, 0x50, 0x52, 0x4a]))).toBe(false) // WPRJ
  })

  test('parse throws on bad magic', () => {
    expect(() => parseAutosaveContainer(new Uint8Array(20))).toThrow()
  })
})

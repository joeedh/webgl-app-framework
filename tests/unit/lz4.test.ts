/**
 * Unit tests for the dependency-free LZ4 codec + sculptcore mesh-blob framing
 * (scripts/util/lz4.ts) used by the autosave worker (plan §5). Covers block
 * round-trips across the boundary sizes (the end-of-block literal rules),
 * compressible vs. incompressible inputs, and the `SCULPT00` container header
 * that must match `serial::writeMesh`. Cross-language decode (C++
 * `LZ4_decompress_safe`) is exercised by the sculptcore serialize round-trip
 * integration test.
 */
import {readFileSync} from 'fs'
import {fileURLToPath} from 'url'
import {dirname, resolve} from 'path'
import {
  lz4Compress,
  lz4Decompress,
  lz4CompressBound,
  compressMeshBlob,
  decompressMeshBlob,
  splitMeshBlob,
  MESH_FORMAT_VERSION,
} from '../../scripts/util/lz4.js'

function roundtrip(src: Uint8Array): Uint8Array {
  const comp = lz4Compress(src)
  const back = lz4Decompress(comp, src.length)
  expect(back.length).toBe(src.length)
  expect(Array.from(back)).toEqual(Array.from(src))
  return comp
}

function lcg(n: number, seed: number): Uint8Array {
  const a = new Uint8Array(n)
  let s = seed >>> 0
  for (let i = 0; i < n; i++) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    a[i] = (s >>> 16) & 0xff
  }
  return a
}

describe('lz4 block round-trip', () => {
  test('empty', () => {
    roundtrip(new Uint8Array(0))
  })
  test('tiny (below match limit)', () => {
    roundtrip(new Uint8Array([1, 2, 3, 4, 5]))
  })

  test('boundary sizes around MFLIMIT', () => {
    for (const n of [11, 12, 13, 16, 20, 100]) {
      const a = new Uint8Array(n)
      for (let i = 0; i < n; i++) a[i] = i & 0xff
      roundtrip(a)
    }
  })

  test('long runs compress hard and restore', () => {
    const a = new Uint8Array(100000).fill(0x41)
    const comp = roundtrip(a)
    expect(comp.length).toBeLessThan(2000)
  })

  test('short repeating pattern (overlapping copies)', () => {
    const n = 65536
    const a = new Uint8Array(n)
    for (let i = 0; i < n; i++) a[i] = i % 7
    const comp = roundtrip(a)
    expect(comp.length).toBeLessThan(1000)
  })

  test('incompressible random survives (worst case within bound)', () => {
    const a = lcg(200000, 12345)
    const comp = roundtrip(a)
    expect(comp.length).toBeLessThanOrEqual(lz4CompressBound(a.length))
  })
})

describe('lz4Decompress validation', () => {
  test('throws on a size mismatch', () => {
    const comp = lz4Compress(new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2, 1]))
    expect(() => lz4Decompress(comp, 1000)).toThrow()
  })
})

describe('mesh-blob container', () => {
  test('SCULPT00 header + payload round-trip', () => {
    const n = 300000
    const raw = new Uint8Array(n)
    for (let i = 0; i < n; i++) raw[i] = (i * 131) & 0xff

    const blob = compressMeshBlob(raw)

    // Header must match serial::writeMesh: magic, LITTLE_ENDIAN|COMPRESSED, v{0,0,1}.
    expect(String.fromCharCode(...blob.subarray(0, 8))).toBe('SCULPT00')
    expect(blob[8]).toBe(3)
    expect(blob[11]).toBe(1)

    const parts = splitMeshBlob(blob)
    expect(parts.rawSize).toBe(n)

    const back = decompressMeshBlob(blob)
    expect(Array.from(back)).toEqual(Array.from(raw))
  })

  test('rejects a non-SCULPT00 blob', () => {
    expect(() => splitMeshBlob(new Uint8Array(24))).toThrow()
  })
})

/* Cross-language drift guard: the TS blob writer stamps MESH_FORMAT_VERSION, but
 * the C++ reader (serial::readMesh) validates against kMeshFormatVersion. If they
 * drift, autosave blobs get mislabeled and migrate() runs the wrong upgrade path
 * on already-current bytes (the v3-over-v4 out-of-bounds read this replaces).
 * Parse the constant straight out of the C++ header so the two can never diverge
 * unnoticed. */
describe('mesh format version parity with C++', () => {
  test('MESH_FORMAT_VERSION matches serial::kMeshFormatVersion', () => {
    const here = dirname(fileURLToPath(import.meta.url))
    const header = resolve(here, '../../sculptcore/source/mesh/mesh_serialize.h')
    const src = readFileSync(header, 'utf8')
    const m = src.match(/kMeshFormatVersion\s*=\s*(\d+)/)
    expect(m).not.toBeNull()
    const cppVersion = Number(m![1])
    expect(MESH_FORMAT_VERSION).toBe(cppVersion)
  })
})

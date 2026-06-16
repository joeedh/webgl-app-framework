/**
 * Autosave split-serialization container (plan §5.3, option b).
 *
 * An autosave file is the normal `createFile()` "shell" — with each LiteMesh's
 * mesh bytes replaced inline by an 8-byte placeholder (`LMB1` + u32 blobId) —
 * followed by a blob table mapping blobId → that mesh's `SCULPT00` compressed
 * bytes. Recovery parses the table into a resolver the LiteMesh load path
 * consults (see serialize_cache `DeferredBlobResolver`). This is a separate
 * versioned artifact; the canonical `app.save` format is untouched.
 *
 * Pure byte plumbing — no sculptcore / lite-mesh imports — so it sits in core
 * and is unit-testable in isolation.
 */

const PLACEHOLDER_MAGIC = [0x4c, 0x4d, 0x42, 0x31] // "LMB1"
const PLACEHOLDER_LEN = 8 // magic(4) + u32 blobId

const CONTAINER_MAGIC = [0x57, 0x41, 0x53, 0x56] // "WASV" (webgl-app autosave)
const CONTAINER_VERSION = 1
/** magic(4) + u32 version + u32 shellLen. */
const CONTAINER_HEADER_LEN = 12

function writeU32LE(b: Uint8Array, o: number, v: number): void {
  b[o] = v & 0xff
  b[o + 1] = (v >>> 8) & 0xff
  b[o + 2] = (v >>> 16) & 0xff
  b[o + 3] = (v >>> 24) & 0xff
}

function readU32LE(b: Uint8Array, o: number): number {
  return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
}

/** The inline placeholder a deferred-mode `LiteMesh.serialize()` returns. */
export function makeBlobPlaceholder(blobId: number): Uint8Array {
  const out = new Uint8Array(PLACEHOLDER_LEN)
  out.set(PLACEHOLDER_MAGIC, 0)
  writeU32LE(out, 4, blobId)
  return out
}

/** The blobId encoded in a placeholder, or -1 if `data` isn't one. */
export function readBlobPlaceholder(data: Uint8Array): number {
  if (data.length !== PLACEHOLDER_LEN) {
    return -1
  }
  for (let i = 0; i < PLACEHOLDER_MAGIC.length; i++) {
    if (data[i] !== PLACEHOLDER_MAGIC[i]) {
      return -1
    }
  }
  return readU32LE(data, 4)
}

/** True if `bytes` begins with the autosave container magic. */
export function isAutosaveContainer(bytes: Uint8Array): boolean {
  if (bytes.length < CONTAINER_HEADER_LEN) {
    return false
  }
  for (let i = 0; i < CONTAINER_MAGIC.length; i++) {
    if (bytes[i] !== CONTAINER_MAGIC[i]) {
      return false
    }
  }
  return true
}

/** One entry of the blob table: a placeholder's id and its `SCULPT00` bytes. */
export interface AutosaveBlob {
  blobId: number
  bytes: Uint8Array
}

/**
 * Stitch the shell + the (already compressed) mesh blobs into one container:
 * `[magic][u32 version][u32 shellLen][shell][u32 count]{ [u32 id][u32 len][bytes] }*`.
 */
export function assembleAutosaveContainer(shell: Uint8Array, blobs: AutosaveBlob[]): Uint8Array {
  let total = CONTAINER_HEADER_LEN + shell.length + 4
  for (const b of blobs) {
    total += 8 + b.bytes.length
  }
  const out = new Uint8Array(total)
  out.set(CONTAINER_MAGIC, 0)
  writeU32LE(out, 4, CONTAINER_VERSION)
  writeU32LE(out, 8, shell.length)
  out.set(shell, CONTAINER_HEADER_LEN)

  let o = CONTAINER_HEADER_LEN + shell.length
  writeU32LE(out, o, blobs.length)
  o += 4
  for (const b of blobs) {
    writeU32LE(out, o, b.blobId)
    writeU32LE(out, o + 4, b.bytes.length)
    out.set(b.bytes, o + 8)
    o += 8 + b.bytes.length
  }
  return out
}

/** The shell bytes + a blobId→bytes map parsed from a container. */
export interface ParsedAutosaveContainer {
  shell: Uint8Array
  blobs: Map<number, Uint8Array>
}

/** Parse a container produced by assembleAutosaveContainer. Throws on bad magic
 * / version or truncation, so callers can fall back to plain-`.wproj` loading. */
export function parseAutosaveContainer(bytes: Uint8Array): ParsedAutosaveContainer {
  if (!isAutosaveContainer(bytes)) {
    throw new Error('parseAutosaveContainer: bad magic')
  }
  const version = readU32LE(bytes, 4)
  if (version !== CONTAINER_VERSION) {
    throw new Error(`parseAutosaveContainer: unsupported version ${version}`)
  }
  const shellLen = readU32LE(bytes, 8)
  let o = CONTAINER_HEADER_LEN
  const shell = bytes.subarray(o, o + shellLen)
  o += shellLen

  const blobs = new Map<number, Uint8Array>()
  const count = readU32LE(bytes, o)
  o += 4
  for (let i = 0; i < count; i++) {
    const blobId = readU32LE(bytes, o)
    const len = readU32LE(bytes, o + 4)
    o += 8
    if (o + len > bytes.length) {
      throw new Error('parseAutosaveContainer: truncated blob table')
    }
    blobs.set(blobId, bytes.subarray(o, o + len))
    o += len
  }
  return {shell, blobs}
}

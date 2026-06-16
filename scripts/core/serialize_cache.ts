/**
 * Shared opt-in flags for autosave serialization (plan §4–5 / M2–M3).
 *
 * Core owns the flags; downstream serializers (e.g. LiteMesh.serialize) read
 * them so core needn't import an addon. The collector / resolver below carry the
 * M3 split-serialization (deferred-blob) handshake without core depending on the
 * lite-mesh / sculptcore layers — those layers produce the actual mesh bytes and
 * register them through the opaque interfaces here.
 */

let _useSerializeCache = false

export function setSerializeCacheMode(on: boolean): void {
  _useSerializeCache = on
}

export function getSerializeCacheMode(): boolean {
  return _useSerializeCache
}

/** One mesh blob handed to the split serializer's collector. `raw` bytes are an
 * uncompressed `Mesh_serializeRaw` payload the worker still has to lz4-frame;
 * `compressed` bytes are a ready `SCULPT00` blob (reused from the M2 cache). */
export interface DeferredMeshBlob {
  state: 'raw' | 'compressed'
  bytes: Uint8Array
  /** Called once with the final `SCULPT00` bytes (after compression) so the
   * producer can refresh its M2 cache; only set for `raw` entries. */
  onCompressed?: (compressed: Uint8Array) => void
}

/** Sink the deferred-blob serializer installs while it drives createFile(). */
export interface DeferredBlobCollector {
  /** Register one mesh's blob; returns the integer blobId to embed inline. */
  add(blob: DeferredMeshBlob): number
}

let _collector: DeferredBlobCollector | null = null

export function setDeferredBlobCollector(c: DeferredBlobCollector | null): void {
  _collector = c
}

export function getDeferredBlobCollector(): DeferredBlobCollector | null {
  return _collector
}

/** Maps a placeholder blobId back to its `SCULPT00` bytes during recovery. */
export type DeferredBlobResolver = (blobId: number) => Uint8Array | undefined

let _resolver: DeferredBlobResolver | null = null

export function setDeferredBlobResolver(r: DeferredBlobResolver | null): void {
  _resolver = r
}

export function getDeferredBlobResolver(): DeferredBlobResolver | null {
  return _resolver
}

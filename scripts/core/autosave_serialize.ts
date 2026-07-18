/**
 * M3 split-serialization autosave serializer (plan §5.2).
 *
 * `serialize()` builds the cheap TS "shell" on the main thread (createFile with
 * each LiteMesh writing only a placeholder), grabs each changed mesh's raw,
 * uncompressed payload via the deferred-blob collector, then hands the lz4
 * compression off to a pluggable `BlobCompressor` (default: inline; M3's worker
 * swaps in an off-thread one). The compressed blobs + shell are stitched into
 * the autosave container (autosave_format.ts). Unchanged meshes contribute their
 * cached SCULPT00 blob directly, so the worker only ever sees changed meshes.
 *
 * Core-only: the lite-mesh / sculptcore work happens behind the
 * DeferredBlobCollector seam, so this never imports those layers.
 */

import type {AppState} from './appstate'
import type {AutosaveSerializer} from './autosave'
import {
  type DeferredBlobCollector,
  type DeferredMeshBlob,
  setDeferredBlobCollector,
  setDeferredBlobResolver,
} from './serialize_cache'
import {type AutosaveBlob, assembleAutosaveContainer, parseAutosaveContainer} from './autosave_format'
import {compressMeshBlob} from '../util/lz4'

/** lz4-frame each raw `Mesh_serializeRaw` payload into a `SCULPT00` blob.
 * Index-aligned: `out[i]` is the compressed form of `raws[i]`. */
export type BlobCompressor = (raws: Uint8Array[]) => Promise<Uint8Array[]>

/** Default compressor: synchronous, on the main thread (no worker). */
const inlineCompressor: BlobCompressor = async (raws) => raws.map((r) => compressMeshBlob(r))

class Collector implements DeferredBlobCollector {
  entries: DeferredMeshBlob[] = []
  add(blob: DeferredMeshBlob): number {
    this.entries.push(blob)
    return this.entries.length - 1
  }
}

export class SplitSerializer implements AutosaveSerializer {
  private compress: BlobCompressor
  private onDispose?: () => void

  constructor(compress: BlobCompressor = inlineCompressor, onDispose?: () => void) {
    this.compress = compress
    this.onDispose = onDispose
  }

  dispose(): void {
    this.onDispose?.()
  }

  async serialize(state: AppState): Promise<Uint8Array> {
    const collector = new Collector()
    setDeferredBlobCollector(collector)
    let shellBuf: ArrayBuffer
    try {
      shellBuf = state.createFile({save_toolstack: false, save_screen: true, compress: false})
    } finally {
      setDeferredBlobCollector(null)
    }
    const shell = new Uint8Array(shellBuf)
    const entries = collector.entries

    // Compress only the changed (raw) meshes; unchanged ones already hold a blob.
    const rawIdx: number[] = []
    const raws: Uint8Array[] = []
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].state === 'raw') {
        rawIdx.push(i)
        raws.push(entries[i].bytes)
      }
    }
    const compressed = raws.length ? await this.compress(raws) : []

    const blobs: AutosaveBlob[] = new Array(entries.length)
    let ci = 0
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i]
      if (e.state === 'compressed') {
        blobs[i] = {blobId: i, bytes: e.bytes}
      } else {
        const bytes = compressed[ci++]
        e.onCompressed?.(bytes) // refresh the producer's M2 cache
        blobs[i] = {blobId: i, bytes}
      }
    }
    return assembleAutosaveContainer(shell, blobs)
  }

  async load(state: AppState, bytes: Uint8Array): Promise<void> {
    await loadSplitAutosave(state, bytes)
  }
}

/**
 * Load an autosave container: install a resolver mapping each placeholder blobId
 * to its SCULPT00 bytes, then load the shell through the normal file path (the
 * LiteMesh load path consults the resolver), and always clear it afterward.
 */
export async function loadSplitAutosave(state: AppState, bytes: Uint8Array): Promise<void> {
  const {shell, blobs} = parseAutosaveContainer(bytes)
  setDeferredBlobResolver((id) => blobs.get(id))
  try {
    // Copy the shell into its own ArrayBuffer (it's a subarray view of `bytes`).
    const shellBuf = shell.slice().buffer
    await state.loadFileAsync(shellBuf, {
      reset_toolstack: true,
      load_screen    : true,
      reset_context  : true,
    })
  } finally {
    setDeferredBlobResolver(null)
  }
}

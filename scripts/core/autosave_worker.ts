/**
 * Autosave compression worker (plan §5.4). A module Web Worker — works in both
 * the browser and the Electron renderer — that lz4-frames raw mesh payloads off
 * the main thread. It carries ONLY the dependency-free lz4 codec; it never loads
 * the sculptcore addon (which is main-thread-only) or touches the filesystem.
 *
 * Protocol: main posts {id, buffers: ArrayBuffer[]} (raw `Mesh_serializeRaw`
 * payloads, transferred); the worker posts back {id, results: ArrayBuffer[]} of
 * `SCULPT00` blobs (also transferred). Each result index matches its input.
 */

import {compressMeshBlob} from '../util/lz4'

interface CompressRequest {
  id: number
  buffers: ArrayBuffer[]
}

const ctx = self as unknown as {
  onmessage: ((e: {data: CompressRequest}) => void) | null
  postMessage(msg: unknown, transfer?: Transferable[]): void
}

ctx.onmessage = (e) => {
  const {id, buffers} = e.data
  const results: ArrayBuffer[] = []
  const transfer: Transferable[] = []
  for (const buf of buffers) {
    const blob = compressMeshBlob(new Uint8Array(buf))
    // compressMeshBlob returns a fresh full-buffer Uint8Array; transfer it.
    results.push(blob.buffer as ArrayBuffer)
    transfer.push(blob.buffer as ArrayBuffer)
  }
  ctx.postMessage({id, results}, transfer)
}

/**
 * Browser autosave storage backends (plan §7 / M4). Recovery-only: the browser
 * can't write the user's chosen file silently across sessions, so backups go to
 * a durable per-origin store and are offered back on the next load.
 *
 * Prefers OPFS (`navigator.storage.getDirectory`) — persistent, no gesture,
 * async writes — and falls back to IndexedDB where OPFS is absent. Registers
 * itself via registerBrowserAutosaveBackend so getAutosaveBackend() picks it up
 * when no NW.js fs backend is available. Side-effect import only.
 */

import {
  registerBrowserAutosaveBackend,
  type AutosaveBackend,
  type AutosaveLatest,
  type AutosaveWriteOpts,
} from './autosave_backend'

/** Per-store rotation manifest (mirrors the NW.js backend's). */
interface RotationManifest {
  newestSlot: number
  maxBackups: number
  slots: {slot: number; timestamp: number; bytes: number}[]
}

const LATEST_NAME = 'latest.json'

function baseName(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return i >= 0 ? p.slice(i + 1) : p
}

function backupPrefix(opts: {sourcePath: string | null}): string {
  return opts.sourcePath ? baseName(opts.sourcePath) : 'untitled'
}

function nextSlot(man: RotationManifest, maxBackups: number): number {
  return (man.newestSlot + 1) % Math.max(1, maxBackups)
}

function rotate(man: RotationManifest, slot: number, opts: AutosaveWriteOpts, byteLen: number): number {
  const timestamp = Date.now()
  man.newestSlot = slot
  man.maxBackups = opts.maxBackups
  man.slots = man.slots.filter((s) => s.slot !== slot)
  man.slots.push({slot, timestamp, bytes: byteLen})
  return timestamp
}

function emptyManifest(maxBackups: number): RotationManifest {
  return {newestSlot: -1, maxBackups, slots: []}
}

// ---- OPFS backend ----

type OpfsRoot = {
  getDirectoryHandle(name: string, opts?: {create?: boolean}): Promise<OpfsDir>
}
type OpfsDir = {
  getFileHandle(name: string, opts?: {create?: boolean}): Promise<OpfsFileHandle>
  removeEntry(name: string): Promise<void>
}
type OpfsFileHandle = {
  createWritable(): Promise<{write(data: Uint8Array | string): Promise<void>; close(): Promise<void>}>
  getFile(): Promise<{arrayBuffer(): Promise<ArrayBuffer>}>
}

function opfsAvailable(): boolean {
  const s = (navigator as {storage?: {getDirectory?: unknown}}).storage
  return !!s && typeof s.getDirectory === 'function'
}

class OpfsAutosaveBackend implements AutosaveBackend {
  readonly kind = 'opfs'

  private async dir(): Promise<OpfsDir> {
    const root = (await (
      navigator as unknown as {
        storage: {getDirectory(): Promise<OpfsRoot>}
      }
    ).storage.getDirectory()) as unknown as OpfsRoot
    return root.getDirectoryHandle('autosave', {create: true})
  }

  private async write(dir: OpfsDir, name: string, data: Uint8Array): Promise<void> {
    const fh = await dir.getFileHandle(name, {create: true})
    const w = await fh.createWritable()
    await w.write(data)
    await w.close()
  }

  private async read(dir: OpfsDir, name: string): Promise<Uint8Array | undefined> {
    try {
      const fh = await dir.getFileHandle(name)
      const f = await fh.getFile()
      return new Uint8Array(await f.arrayBuffer())
    } catch {
      return undefined
    }
  }

  private async exists(dir: OpfsDir, name: string): Promise<boolean> {
    try {
      await dir.getFileHandle(name)
      return true
    } catch {
      return false
    }
  }

  private async readJSON<T>(dir: OpfsDir, name: string): Promise<T | undefined> {
    const b = await this.read(dir, name)
    if (!b) return undefined
    try {
      return JSON.parse(new TextDecoder().decode(b)) as T
    } catch {
      return undefined
    }
  }

  private async writeJSON(dir: OpfsDir, name: string, obj: unknown): Promise<void> {
    await this.write(dir, name, new TextEncoder().encode(JSON.stringify(obj)))
  }

  async writeBackup(bytes: Uint8Array, opts: AutosaveWriteOpts): Promise<AutosaveLatest> {
    const dir = await this.dir()
    const prefix = backupPrefix(opts)
    const manName = `${prefix}.manifest.json`
    const man = (await this.readJSON<RotationManifest>(dir, manName)) ?? emptyManifest(opts.maxBackups)

    const slot = nextSlot(man, opts.maxBackups)
    const target = `${prefix}.autosave.${slot}`
    await this.write(dir, target, bytes)
    const timestamp = rotate(man, slot, opts, bytes.byteLength)
    await this.writeJSON(dir, manName, man)

    const latest: AutosaveLatest = {
      backupKey : target,
      sourcePath: opts.sourcePath,
      timestamp,
      appVersion: opts.appVersion,
      bytes     : bytes.byteLength,
    }
    await this.writeJSON(dir, LATEST_NAME, latest)
    return latest
  }

  async readLatest(): Promise<AutosaveLatest | undefined> {
    const dir = await this.dir()
    const latest = await this.readJSON<AutosaveLatest>(dir, LATEST_NAME)
    if (!latest) return undefined
    return (await this.exists(dir, latest.backupKey)) ? latest : undefined
  }

  async readBackup(key: string): Promise<Uint8Array | undefined> {
    return this.read(await this.dir(), key)
  }

  /** OPFS can't stat the user's chosen file; recovery offers whenever a backup
   * exists (browser autosave is recovery-only). */
  async sourceMtime(): Promise<number | undefined> {
    return undefined
  }

  async clearLatest(): Promise<void> {
    try {
      await (await this.dir()).removeEntry(LATEST_NAME)
    } catch {
      /* already gone */
    }
  }
}

// ---- IndexedDB backend (fallback) ----

const IDB_NAME = 'sculptcore-autosave'
const IDB_STORE = 'kv'

function idbAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function idbReq<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })
}

class IndexedDbAutosaveBackend implements AutosaveBackend {
  readonly kind = 'indexeddb'
  private db?: IDBDatabase

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    if (!this.db) this.db = await openDb()
    return this.db.transaction(IDB_STORE, mode).objectStore(IDB_STORE)
  }

  private async get<T>(key: string): Promise<T | undefined> {
    const v = await idbReq((await this.store('readonly')).get(key))
    return (v as T) ?? undefined
  }

  private async put(key: string, value: unknown): Promise<void> {
    await idbReq((await this.store('readwrite')).put(value, key))
  }

  private async del(key: string): Promise<void> {
    await idbReq((await this.store('readwrite')).delete(key))
  }

  async writeBackup(bytes: Uint8Array, opts: AutosaveWriteOpts): Promise<AutosaveLatest> {
    const prefix = backupPrefix(opts)
    const manKey = `man:${prefix}`
    const man = (await this.get<RotationManifest>(manKey)) ?? emptyManifest(opts.maxBackups)

    const slot = nextSlot(man, opts.maxBackups)
    const blobKey = `blob:${prefix}:${slot}`
    // Store a copy so a later transfer/detach of `bytes` can't corrupt the record.
    await this.put(blobKey, bytes.slice())
    const timestamp = rotate(man, slot, opts, bytes.byteLength)
    await this.put(manKey, man)

    const latest: AutosaveLatest = {
      backupKey : blobKey,
      sourcePath: opts.sourcePath,
      timestamp,
      appVersion: opts.appVersion,
      bytes     : bytes.byteLength,
    }
    await this.put('latest', latest)
    return latest
  }

  async readLatest(): Promise<AutosaveLatest | undefined> {
    const latest = await this.get<AutosaveLatest>('latest')
    if (!latest) return undefined
    const blob = await this.get<unknown>(latest.backupKey)
    return blob ? latest : undefined
  }

  async readBackup(key: string): Promise<Uint8Array | undefined> {
    const v = await this.get<Uint8Array | ArrayBuffer>(key)
    if (!v) return undefined
    return v instanceof Uint8Array ? v : new Uint8Array(v)
  }

  async sourceMtime(): Promise<number | undefined> {
    return undefined
  }

  async clearLatest(): Promise<void> {
    try {
      await this.del('latest')
    } catch {
      /* already gone */
    }
  }
}

registerBrowserAutosaveBackend((): AutosaveBackend | null => {
  if (typeof navigator !== 'undefined' && opfsAvailable()) {
    return new OpfsAutosaveBackend()
  }
  if (idbAvailable()) {
    return new IndexedDbAutosaveBackend()
  }
  return null
})

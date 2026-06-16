/**
 * Storage backends for autosave (plan §3.3 / §7).
 *
 * The manager produces the bytes; a backend rotates them onto durable storage
 * atomically and tracks a single global "latest" recovery pointer so the next
 * launch can offer to recover. Electron writes rotating files (next to the
 * project, or under `.sculptcore/autosave/`); browser builds write to OPFS /
 * IndexedDB (see autosave_backend_browser.ts, wired in by the factory).
 *
 * Writes are async on purpose: even M1's disk I/O runs off the UI thread (on
 * libuv's pool in Electron, via the async OPFS API in the browser).
 */

import * as cconst from './const'
import {getAppStorage} from './app_storage'

export interface AutosaveWriteOpts {
  /** Absolute path / handle name of the open project, or null when untitled. */
  sourcePath: string | null
  appVersion: number
  maxBackups: number
  /** Write backups next to the project file vs. into the autosave store dir. */
  toProjectDir: boolean
}

/** The single recovery pointer at the newest backup written. */
export interface AutosaveLatest {
  /** Backend-specific locator for readBackup (abs path / OPFS name / IDB key). */
  backupKey: string
  sourcePath: string | null
  /** Epoch ms the backup was written. */
  timestamp: number
  appVersion: number
  bytes: number
}

export interface AutosaveBackend {
  readonly kind: 'electron' | 'opfs' | 'indexeddb'
  /** Write @p bytes to the next rotating slot and update the latest pointer. */
  writeBackup(bytes: Uint8Array, opts: AutosaveWriteOpts): Promise<AutosaveLatest>
  /** The newest recovery pointer, or undefined if none exists. */
  readLatest(): Promise<AutosaveLatest | undefined>
  /** Read back a previously-written backup by its locator. */
  readBackup(key: string): Promise<Uint8Array | undefined>
  /** Modification time (epoch ms) of the source project, or undefined. */
  sourceMtime(sourcePath: string): Promise<number | undefined>
  /** Drop the latest pointer after an explicit successful save. */
  clearLatest(): Promise<void>
}

interface NodeFsPromises {
  writeFile(p: string, data: Uint8Array | string): Promise<void>
  readFile(p: string): Promise<Uint8Array>
  readFile(p: string, enc: string): Promise<string>
  rename(from: string, to: string): Promise<void>
  mkdir(p: string, opts: {recursive: boolean}): Promise<unknown>
  stat(p: string): Promise<{mtimeMs: number}>
  unlink(p: string): Promise<void>
}
interface NodePath {
  join(...parts: string[]): string
  dirname(p: string): string
  basename(p: string): string
}

/** Per-store rotation manifest (next to the rotating slot files). */
interface RotationManifest {
  newestSlot: number
  maxBackups: number
  slots: {slot: number; timestamp: number; bytes: number}[]
}

const LATEST_NAME = 'latest.json'

class ElectronAutosaveBackend implements AutosaveBackend {
  readonly kind = 'electron'
  private fsp: NodeFsPromises
  private path: NodePath
  private storeDir: string

  constructor(fsp: NodeFsPromises, path: NodePath, sculptcoreDir: string) {
    this.fsp = fsp
    this.path = path
    this.storeDir = path.join(sculptcoreDir, 'autosave')
  }

  /** Where slots + rotation manifest live for a given project/mode. */
  private slotDir(opts: AutosaveWriteOpts): string {
    if (opts.toProjectDir && opts.sourcePath) {
      return this.path.dirname(opts.sourcePath)
    }
    return this.storeDir
  }

  private prefix(opts: {sourcePath: string | null}): string {
    return opts.sourcePath ? this.path.basename(opts.sourcePath) : 'untitled.' + cconst.FILE_EXT
  }

  private slotFile(dir: string, prefix: string, slot: number): string {
    return this.path.join(dir, `${prefix}.autosave.${slot}`)
  }

  private manifestFile(dir: string, prefix: string): string {
    return this.path.join(dir, `${prefix}.autosave.manifest.json`)
  }

  private latestFile(): string {
    return this.path.join(this.storeDir, LATEST_NAME)
  }

  private async readJSON<T>(p: string): Promise<T | undefined> {
    try {
      const txt = await this.fsp.readFile(p, 'utf8')
      return JSON.parse(txt) as T
    } catch {
      return undefined
    }
  }

  /** Write JSON atomically (tmp + rename). */
  private async writeJSON(p: string, obj: unknown): Promise<void> {
    const tmp = p + '.tmp'
    await this.fsp.writeFile(tmp, JSON.stringify(obj))
    await this.fsp.rename(tmp, p)
  }

  async writeBackup(bytes: Uint8Array, opts: AutosaveWriteOpts): Promise<AutosaveLatest> {
    const dir = this.slotDir(opts)
    const prefix = this.prefix(opts)
    await this.fsp.mkdir(dir, {recursive: true})
    await this.fsp.mkdir(this.storeDir, {recursive: true})

    const manPath = this.manifestFile(dir, prefix)
    const man = (await this.readJSON<RotationManifest>(manPath)) ?? {
      newestSlot: -1,
      maxBackups: opts.maxBackups,
      slots: [],
    }

    const slot = (man.newestSlot + 1) % Math.max(1, opts.maxBackups)
    const target = this.slotFile(dir, prefix, slot)
    const tmp = target + '.tmp'

    // Atomic: full write to a temp path, then rename over the slot.
    await this.fsp.writeFile(tmp, bytes)
    await this.fsp.rename(tmp, target)

    const timestamp = Date.now()
    man.newestSlot = slot
    man.maxBackups = opts.maxBackups
    man.slots = man.slots.filter((s) => s.slot !== slot)
    man.slots.push({slot, timestamp, bytes: bytes.byteLength})
    await this.writeJSON(manPath, man)

    const latest: AutosaveLatest = {
      backupKey: target,
      sourcePath: opts.sourcePath,
      timestamp,
      appVersion: opts.appVersion,
      bytes: bytes.byteLength,
    }
    await this.writeJSON(this.latestFile(), latest)
    return latest
  }

  async readLatest(): Promise<AutosaveLatest | undefined> {
    const latest = await this.readJSON<AutosaveLatest>(this.latestFile())
    if (!latest) return undefined
    // Verify the backup file still exists before offering recovery.
    try {
      await this.fsp.stat(latest.backupKey)
    } catch {
      return undefined
    }
    return latest
  }

  async readBackup(key: string): Promise<Uint8Array | undefined> {
    try {
      return new Uint8Array(await this.fsp.readFile(key))
    } catch {
      return undefined
    }
  }

  async sourceMtime(sourcePath: string): Promise<number | undefined> {
    try {
      return (await this.fsp.stat(sourcePath)).mtimeMs
    } catch {
      return undefined
    }
  }

  async clearLatest(): Promise<void> {
    try {
      await this.fsp.unlink(this.latestFile())
    } catch {
      /* already gone */
    }
  }
}

let _backend: AutosaveBackend | null | undefined

/** The active autosave backend, or null when none is available. */
export function getAutosaveBackend(): AutosaveBackend | null {
  if (_backend !== undefined) {
    return _backend
  }

  const req = (globalThis as {require?: (m: string) => unknown}).require
  const haveElectron = (globalThis as {haveElectron?: boolean}).haveElectron
  const storage = getAppStorage()

  if (haveElectron && typeof req === 'function' && storage.isFileBacked && storage.baseDir) {
    try {
      const fsp = (req('fs') as {promises: NodeFsPromises}).promises
      const path = req('path') as NodePath
      _backend = new ElectronAutosaveBackend(fsp, path, storage.baseDir)
      return _backend
    } catch (err) {
      console.warn('autosave: Electron fs backend unavailable', err)
    }
  }

  // Browser backends (OPFS / IndexedDB) register here, see M4.
  _backend = makeBrowserAutosaveBackend()
  return _backend
}

// Filled in by autosave_backend_browser.ts via registerBrowserAutosaveBackend.
let _browserFactory: (() => AutosaveBackend | null) | undefined
export function registerBrowserAutosaveBackend(factory: () => AutosaveBackend | null): void {
  _browserFactory = factory
  _backend = undefined // allow re-resolution now that a browser backend exists
}
function makeBrowserAutosaveBackend(): AutosaveBackend | null {
  return _browserFactory ? _browserFactory() : null
}

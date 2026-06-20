/**
 * Persistence backend for the startup file and user settings.
 *
 * Browser builds keep using `localStorage` (blobs base64-encoded under their
 * existing keys, so web behavior is unchanged). The NW.js build instead writes
 * discrete files under a `.sculptcore` directory at `<cwd>/.sculptcore` (the
 * repo root when launched via `pnpm run nwjs` or the test harness). The
 * renderer computes this itself — NW.js merges the Node + browser contexts, so
 * `require('fs')`/`require('path')` and `process.cwd()` are available directly.
 *
 * The API is synchronous on purpose: `fs.*Sync` is available under NW.js,
 * letting the existing sync save/load call sites stay sync. NW.js starts fresh
 * from `.sculptcore`; it does not migrate old `localStorage` data.
 */

import * as util from '../util/util'

export interface AppStorage {
  /** Binary blob (e.g. the compressed startup file). */
  getBlob(key: string): Uint8Array | undefined
  setBlob(key: string, data: ArrayBuffer | Uint8Array): void
  /** UTF-8 text (e.g. settings JSON). */
  getText(key: string): string | undefined
  setText(key: string, data: string): void
  remove(key: string): void
  /** True when backed by `.sculptcore` files rather than localStorage. */
  readonly isFileBacked: boolean
  readonly baseDir?: string
}

function toU8(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data)
}

class BrowserAppStorage implements AppStorage {
  readonly isFileBacked = false

  getBlob(key: string): Uint8Array | undefined {
    const v = window.localStorage[key]
    return v === undefined ? undefined : util.atob(v)
  }

  setBlob(key: string, data: ArrayBuffer | Uint8Array): void {
    window.localStorage[key] = util.btoa(toU8(data))
  }

  getText(key: string): string | undefined {
    return window.localStorage[key]
  }

  setText(key: string, data: string): void {
    window.localStorage[key] = data
  }

  remove(key: string): void {
    delete window.localStorage[key]
  }
}

// localStorage key → on-disk filename. Unmapped keys fall back to a sanitized
// name; the two real consumers are listed explicitly.
const FILE_NAMES: Record<string, string> = {
  'webgl-app-framework'         : 'startup.bin',
  'webgl-app-framework-settings': 'settings.json',
  'feature-flags-app'           : 'feature-flags.json',
}

interface NodeFsSync {
  existsSync(p: string): boolean
  mkdirSync(p: string, opts: {recursive: boolean}): void
  readFileSync(p: string, enc?: string): Uint8Array | string
  writeFileSync(p: string, data: Uint8Array | string): void
  rmSync?(p: string, opts: {force: boolean}): void
  unlinkSync(p: string): void
}
interface NodePath {
  join(...parts: string[]): string
}

class NwjsAppStorage implements AppStorage {
  readonly isFileBacked = true
  readonly baseDir: string
  private fs: NodeFsSync
  private pathlib: NodePath

  constructor(baseDir: string, fs: NodeFsSync, pathlib: NodePath) {
    this.baseDir = baseDir
    this.fs = fs
    this.pathlib = pathlib
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, {recursive: true})
    }
  }

  private file(key: string): string {
    const name = FILE_NAMES[key] ?? key.replace(/[^\w.-]/g, '_') + '.dat'
    return this.pathlib.join(this.baseDir, name)
  }

  getBlob(key: string): Uint8Array | undefined {
    const p = this.file(key)
    if (!this.fs.existsSync(p)) return undefined
    return new Uint8Array(this.fs.readFileSync(p) as Uint8Array)
  }

  setBlob(key: string, data: ArrayBuffer | Uint8Array): void {
    this.fs.writeFileSync(this.file(key), toU8(data))
  }

  getText(key: string): string | undefined {
    const p = this.file(key)
    if (!this.fs.existsSync(p)) return undefined
    return this.fs.readFileSync(p, 'utf8') as string
  }

  setText(key: string, data: string): void {
    this.fs.writeFileSync(this.file(key), data)
  }

  remove(key: string): void {
    const p = this.file(key)
    if (this.fs.existsSync(p)) this.fs.unlinkSync(p)
  }
}

let _storage: AppStorage | undefined

function buildStorage(): AppStorage {
  const req = (globalThis as {require?: (m: string) => unknown}).require
  const haveNwjs = (globalThis as {haveNwjs?: boolean}).haveNwjs

  if (haveNwjs && typeof req === 'function') {
    try {
      const fs = req('fs') as NodeFsSync
      const pathlib = req('path') as NodePath
      const proc = (globalThis as {process?: {cwd(): string}}).process
      // <cwd>/.sculptcore — the repo root when launched via `pnpm run nwjs` or
      // the test harness (NW.js inherits the launcher's cwd, never chdir's).
      const baseDir = pathlib.join(proc!.cwd(), '.sculptcore')
      return new NwjsAppStorage(baseDir, fs, pathlib)
    } catch (err) {
      console.warn('app_storage: NW.js fs backend unavailable, using localStorage', err)
    }
  }

  return new BrowserAppStorage()
}

/** The active persistence backend (localStorage in the browser, files in NW.js). */
export function getAppStorage(): AppStorage {
  if (_storage === undefined) {
    _storage = buildStorage()
  }
  return _storage
}

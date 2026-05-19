/**
 * Storage backend interface for third-party addons.
 *
 * Each backend exposes the same shape so `installFromBlob` (and the loader's
 * "list installed addons" walk) work uniformly across the web (IndexedDB),
 * Electron (filesystem via IPC), and tests (in-memory). See plan §2 / §6 step 9.
 *
 * Path semantics: relative POSIX paths within the addon, e.g.
 *   "manifest.json", "build/main.js", "build/_chunks/chunk-AB12.js"
 * No leading slash, no "..", no absolute paths. The installer normalizes
 * entries from the zip before passing them through here.
 */

export interface AddonStorage {
  /** List ids of all installed addons (one entry per addon directory). */
  list(): Promise<string[]>

  /** Read a single file under an installed addon as raw bytes. */
  read(addonId: string, relPath: string): Promise<Uint8Array>

  /** Read a JSON file (convenience). Throws if missing or not JSON. */
  readJSON(addonId: string, relPath: string): Promise<unknown>

  /**
   * Write a new addon's full file set, replacing any previous install. The
   * map keys are POSIX relative paths (see file-header comment). Files not
   * in the map are removed.
   */
  write(addonId: string, files: Map<string, Uint8Array>): Promise<void>

  /** Remove an installed addon. No-op if it isn't present. */
  remove(addonId: string): Promise<void>

  /**
   * Returns a URL that can be passed to `import()` for an addon file.
   * Backends may return `blob:` URLs (web, in-memory) or `file:`/scheme
   * URLs (Electron). Repeated calls for the same path may return cached
   * URLs so import maps stay stable.
   */
  urlFor(addonId: string, relPath: string): Promise<string>
}

// ---------------------------------------------------------------------------
// InMemoryAddonStorage — used by tests and as the default for environments
// without a persistent backend yet.
// ---------------------------------------------------------------------------

export class InMemoryAddonStorage implements AddonStorage {
  /** addonId -> (relPath -> bytes). */
  private files = new Map<string, Map<string, Uint8Array>>()

  /** addonId|relPath -> object URL, so repeated urlFor() returns the same URL. */
  private urls = new Map<string, string>()

  async list(): Promise<string[]> {
    return Array.from(this.files.keys())
  }

  async read(addonId: string, relPath: string): Promise<Uint8Array> {
    const dir = this.files.get(addonId)
    if (!dir) throw new Error(`addon "${addonId}" not installed`)
    const bytes = dir.get(this.normalize(relPath))
    if (!bytes) throw new Error(`addon "${addonId}": file "${relPath}" not found`)
    return bytes
  }

  async readJSON(addonId: string, relPath: string): Promise<unknown> {
    const bytes = await this.read(addonId, relPath)
    return JSON.parse(new TextDecoder().decode(bytes))
  }

  async write(addonId: string, files: Map<string, Uint8Array>): Promise<void> {
    // Revoke any cached object URLs from a previous install.
    this.revokeAddonUrls(addonId)

    const normalized = new Map<string, Uint8Array>()
    for (const [p, bytes] of files) {
      normalized.set(this.normalize(p), bytes)
    }
    this.files.set(addonId, normalized)
  }

  async remove(addonId: string): Promise<void> {
    this.revokeAddonUrls(addonId)
    this.files.delete(addonId)
  }

  async urlFor(addonId: string, relPath: string): Promise<string> {
    const key = `${addonId}|${this.normalize(relPath)}`
    const existing = this.urls.get(key)
    if (existing) return existing

    const bytes = await this.read(addonId, relPath)
    const url = makeBlobUrl(bytes, mimeFor(relPath))
    this.urls.set(key, url)
    return url
  }

  private normalize(relPath: string): string {
    if (relPath.includes('..') || relPath.startsWith('/')) {
      throw new Error(`invalid addon relPath: ${relPath}`)
    }
    return relPath.replace(/\\/g, '/')
  }

  private revokeAddonUrls(addonId: string) {
    const prefix = `${addonId}|`
    for (const [key, url] of this.urls) {
      if (key.startsWith(prefix)) {
        revokeBlobUrl(url)
        this.urls.delete(key)
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers — kept here so the IndexedDB + Electron backends can share.
// ---------------------------------------------------------------------------

function makeBlobUrl(bytes: Uint8Array, mime: string): string {
  // Browsers and Electron renderers implement URL.createObjectURL; jsdom (test
  // environment) doesn't. Fall back to a data: URL there — same import()
  // semantics, just less compact.
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    const blob = new Blob([new Uint8Array(bytes)], {type: mime})
    return URL.createObjectURL(blob)
  }
  return makeDataUrl(bytes, mime)
}

function revokeBlobUrl(url: string): void {
  if (url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') {
    URL.revokeObjectURL(url)
  }
  // data: URLs don't need explicit revocation — they're inert strings.
}

/** Encode bytes as base64 without exceeding String.fromCharCode's spread limit. */
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunkSize)))
  }
  // btoa is universal in browser/jsdom; in pure Node we'd need Buffer.from.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const btoaFn = (globalThis as any).btoa as ((s: string) => string) | undefined
  if (btoaFn) return btoaFn(binary)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buf = (globalThis as any).Buffer
  if (buf?.from) return buf.from(binary, 'binary').toString('base64')
  throw new Error('no base64 encoder available')
}

function makeDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`
}

function mimeFor(relPath: string): string {
  if (relPath.endsWith('.js') || relPath.endsWith('.mjs')) return 'application/javascript'
  if (relPath.endsWith('.json')) return 'application/json'
  if (relPath.endsWith('.css')) return 'text/css'
  if (relPath.endsWith('.html') || relPath.endsWith('.htm')) return 'text/html'
  return 'application/octet-stream'
}

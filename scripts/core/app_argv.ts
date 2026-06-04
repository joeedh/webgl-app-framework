/**
 * Application argv access for the Electron shell.
 *
 * Electron does not forward the user args of `electron main.js <args...>` into
 * the renderer's `process.argv`, so `electron/main.js` re-injects them two
 * ways: as a base64 `--apptest-argv=<...>` token in `webPreferences.
 * additionalArguments` (primary, cross-platform, survives reload), and — for
 * the legacy `electron/run.sh` flow — into `arguments.txt`. This module reads
 * whichever is present and hands back a plain `string[]`.
 *
 * Browser builds (no `process`) get an empty arg list.
 */

const ARGV_TOKEN = '--apptest-argv='

let _cached: string[] | undefined

function fromAdditionalArguments(): string[] | undefined {
  // process.argv exists in the Electron renderer (nodeIntegration:true).
  const argv = (globalThis as {process?: {argv?: string[]}}).process?.argv
  if (!argv) return undefined

  for (const a of argv) {
    if (a.startsWith(ARGV_TOKEN)) {
      try {
        // atob + TextDecoder avoids a Buffer/@types/node dependency.
        const bytes = Uint8Array.from(atob(a.slice(ARGV_TOKEN.length)), (c) => c.charCodeAt(0))
        const parsed = JSON.parse(new TextDecoder().decode(bytes))
        if (Array.isArray(parsed)) return parsed.map(String)
      } catch (err) {
        console.warn('app_argv: failed to decode --apptest-argv token', err)
      }
    }
  }
  return undefined
}

function fromArgumentsTxt(): string[] | undefined {
  try {
    // require is only available under nodeIntegration; guard for the browser.
    const req = (globalThis as {require?: (m: string) => unknown}).require
    if (!req) return undefined
    const fs = req('fs') as {existsSync: (p: string) => boolean; readFileSync: (p: string, e: string) => string}
    if (!fs.existsSync('arguments.txt')) return undefined
    const buf = fs
      .readFileSync('arguments.txt', 'utf8')
      .replace(/[ \t]+/g, ' ')
      .trim()
    return buf.length ? buf.split(' ') : []
  } catch {
    return undefined
  }
}

/** Returns the forwarded application args (empty in the browser). Cached. */
export function getAppArgv(): string[] {
  if (_cached !== undefined) return _cached
  _cached = fromAdditionalArguments() ?? fromArgumentsTxt() ?? []
  return _cached
}

/**
 * Returns the value following `--name`, or the inline value of `--name=value`,
 * or `undefined` if the flag is absent. A bare trailing `--name` returns ''.
 */
export function getArg(name: string, argv: string[] = getAppArgv()): string | undefined {
  const flag = '--' + name
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === flag) return argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : ''
    if (a.startsWith(flag + '=')) return a.slice(flag.length + 1)
  }
  return undefined
}

/** True if `--name` (or `--name=...`) is present. */
export function hasArg(name: string, argv: string[] = getAppArgv()): boolean {
  return getArg(name, argv) !== undefined
}

/** All values for a repeatable `--name v` flag (e.g. `--scene-arg k=v`). */
export function getArgList(name: string, argv: string[] = getAppArgv()): string[] {
  const flag = '--' + name
  const out: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === flag && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
      out.push(argv[i + 1])
    } else if (a.startsWith(flag + '=')) {
      out.push(a.slice(flag.length + 1))
    }
  }
  return out
}

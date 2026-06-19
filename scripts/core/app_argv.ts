/**
 * Application argv access for the NW.js shell.
 *
 * NW.js merges the Node + browser contexts and exposes the app's user args
 * (the ones after the app path, minus chromium switches) directly to the
 * renderer as `nw.App.argv`. This module reads that and hands back a plain
 * `string[]`.
 *
 * Browser builds (no `nw`) get an empty arg list.
 */

let _cached: string[] | undefined

interface NwApp {
  App?: {argv?: string[]}
}

function fromNwAppArgv(): string[] | undefined {
  const nw = (globalThis as {nw?: NwApp}).nw
  const argv = nw?.App?.argv
  return Array.isArray(argv) ? argv.map(String) : undefined
}

/** Returns the NW.js application args (empty in the browser). Cached. */
export function getAppArgv(): string[] {
  if (_cached !== undefined) return _cached
  _cached = fromNwAppArgv() ?? []
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

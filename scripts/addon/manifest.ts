/**
 * Addon manifest schema + validator.
 *
 * Every addon (builtin or third-party) ships a `manifest.json` declaring its
 * id, version, dependencies, and entry point. The loader parses these, builds
 * a dependency graph, and topologically orders the loads. See plan §2.2 and §2.5.
 */

export interface IAddonManifest {
  /** Stable id matching the addon's directory name (kebab-case or snake_case). */
  id: string

  /** Human-readable name shown in the addon UI. */
  name: string

  /** Semantic version "MAJOR.MINOR.PATCH". */
  version: string

  /** Optional author string. */
  author?: string

  /** Entry file relative to the manifest. For builtin addons this is the .ts
   * source (e.g. "src/main.ts") that tools/build-addons.js compiles. For
   * third-party addons it's the prebuilt .js (e.g. "build/main.js"). */
  entry: string

  /** Ids of addons this addon depends on. Loaded before this one. */
  dependencies?: string[]

  /** Optional permission tags. Reserved for future use. */
  permissions?: string[]

  /** Optional description. */
  description?: string

  /** Optional icon path or pathux icon enum value. */
  icon?: string | number

  /** Build mode for third-party addons: prebuilt JS or TS source compiled at
   * install time. Builtin addons always use 'prebuilt' implicitly (built by
   * the project's build step). See plan §2.3. */
  buildMode?: 'prebuilt' | 'source'
}

export class ManifestValidationError extends Error {
  constructor(
    message: string,
    public readonly manifestPath: string | undefined
  ) {
    super(manifestPath ? `${manifestPath}: ${message}` : message)
    this.name = 'ManifestValidationError'
  }
}

const ID_RE = /^[a-z][a-z0-9_-]*$/
const VERSION_RE = /^\d+\.\d+\.\d+$/

/**
 * Parses + validates a manifest object. Returns the typed manifest on success;
 * throws `ManifestValidationError` on any schema problem. `manifestPath` is
 * used only for error messages.
 */
export function validateManifest(raw: unknown, manifestPath?: string): IAddonManifest {
  if (typeof raw !== 'object' || raw === null) {
    throw new ManifestValidationError('manifest must be a JSON object', manifestPath)
  }
  const m = raw as Record<string, unknown>

  if (typeof m.id !== 'string' || !ID_RE.test(m.id)) {
    throw new ManifestValidationError(
      `"id" must be a lowercase identifier matching ${ID_RE} (got ${JSON.stringify(m.id)})`,
      manifestPath
    )
  }
  if (typeof m.name !== 'string' || m.name.length === 0) {
    throw new ManifestValidationError('"name" must be a non-empty string', manifestPath)
  }
  if (typeof m.version !== 'string' || !VERSION_RE.test(m.version)) {
    throw new ManifestValidationError(
      `"version" must be semver MAJOR.MINOR.PATCH (got ${JSON.stringify(m.version)})`,
      manifestPath
    )
  }
  if (typeof m.entry !== 'string' || m.entry.length === 0) {
    throw new ManifestValidationError('"entry" must be a non-empty string', manifestPath)
  }
  if (m.entry.includes('..')) {
    throw new ManifestValidationError('"entry" must not contain ".."', manifestPath)
  }

  if (m.dependencies !== undefined) {
    if (!Array.isArray(m.dependencies) || m.dependencies.some((d) => typeof d !== 'string')) {
      throw new ManifestValidationError('"dependencies" must be an array of strings', manifestPath)
    }
    for (const d of m.dependencies as string[]) {
      if (!ID_RE.test(d)) {
        throw new ManifestValidationError(
          `dependency id ${JSON.stringify(d)} does not match ${ID_RE}`,
          manifestPath
        )
      }
    }
  }

  if (m.permissions !== undefined) {
    if (!Array.isArray(m.permissions) || m.permissions.some((p) => typeof p !== 'string')) {
      throw new ManifestValidationError('"permissions" must be an array of strings', manifestPath)
    }
  }

  if (m.buildMode !== undefined && m.buildMode !== 'prebuilt' && m.buildMode !== 'source') {
    throw new ManifestValidationError(
      `"buildMode" must be "prebuilt" or "source" (got ${JSON.stringify(m.buildMode)})`,
      manifestPath
    )
  }

  return {
    id          : m.id as string,
    name        : m.name as string,
    version     : m.version as string,
    author      : typeof m.author === 'string' ? m.author : undefined,
    entry       : m.entry as string,
    dependencies: (m.dependencies as string[] | undefined) ?? [],
    permissions : m.permissions as string[] | undefined,
    description : typeof m.description === 'string' ? m.description : undefined,
    icon        : (m.icon as string | number | undefined) ?? undefined,
    buildMode   : (m.buildMode as 'prebuilt' | 'source' | undefined) ?? 'prebuilt',
  }
}

/**
 * Topologically sorts a list of manifests so dependencies load before their
 * dependents. Throws on missing or cyclic dependencies.
 */
export function sortManifestsByDeps(manifests: IAddonManifest[]): IAddonManifest[] {
  const byId = new Map<string, IAddonManifest>()
  for (const m of manifests) {
    if (byId.has(m.id)) {
      throw new Error(`duplicate addon id "${m.id}"`)
    }
    byId.set(m.id, m)
  }

  const visited = new Map<string, 'in-progress' | 'done'>()
  const out: IAddonManifest[] = []

  const visit = (m: IAddonManifest, stack: string[]) => {
    const state = visited.get(m.id)
    if (state === 'done') return
    if (state === 'in-progress') {
      throw new Error(`addon dependency cycle: ${[...stack, m.id].join(' -> ')}`)
    }
    visited.set(m.id, 'in-progress')
    for (const depId of m.dependencies ?? []) {
      const dep = byId.get(depId)
      if (!dep) {
        throw new Error(`addon "${m.id}" depends on unknown addon "${depId}"`)
      }
      visit(dep, [...stack, m.id])
    }
    visited.set(m.id, 'done')
    out.push(m)
  }

  for (const m of manifests) visit(m, [])
  return out
}

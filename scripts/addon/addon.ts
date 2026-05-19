import {AddonAPI, IAddon} from './addon_base'
import * as util from '../util/util'
import {IAddonManifest, sortManifestsByDeps, validateManifest} from './manifest'
import type {AddonStorage} from './storage'

export function getAddonPrefix() {
  if (window.haveElectron) {
    return '../addons/'
  } else {
    return '../../addons/'
  }
}

export class AddonRecord<T extends IAddon> {
  addon: T
  addonAPI: AddonAPI<T>
  url: string
  _enabled: boolean
  forceEnabled: boolean
  key: string
  name: string

  /**
   * Parsed manifest if this record was loaded via the manifest-based pipeline
   * (see plan §2). Undefined for legacy `addons/list.json` entries.
   */
  manifest?: IAddonManifest

  /** True for first-party addons under `addons/builtin/`. See plan §2.4. */
  builtin: boolean = false

  constructor(url: string, addon: T, addonAPI: AddonAPI<T>) {
    this.addon = addon
    this.addonAPI = addonAPI
    this.url = url
    this._enabled = false
    this.forceEnabled = false //prevent disabling of addon once enabled

    let key = url.replace(/\.js/g, '').replace(/\./g, '')
    key = key.replace(/\//g, '').replace(/\\/g, '')
    key = key.replace(/-/g, '_').replace(/[ \n\r\t]/g, '')

    this.key = key

    if (addon.addonDefine) {
      if (typeof addon.addonDefine == 'function') {
        console.error(url + ': addonDefine should not be a function')
        this.name = this.key
      } else {
        this.name = addon.addonDefine.name
      }
    } else {
      this.name = this.key
    }
  }

  nstructjsRegister() {
    const enabled = this.enabled

    //register
    if (!this.enabled) {
      this.enabled = true
    }

    //deregister
    this.enabled = enabled
  }

  get enabled() {
    return this._enabled
  }

  set enabled(val) {
    if (!val && this.forceEnabled) {
      return
    }

    if (!!val === !!this._enabled) {
      return
    }

    if (!val) {
      this._enabled = false
      this.addonAPI.unregisterAll()
      this.addon.unregister()
    } else {
      this.addon.register(this.addonAPI)
      //if (this.addon.handleArgv) {
      //this.addon.handleArgv(this.addonAPI, _appstate.arguments);
      //}
      this._enabled = !!val
    }
  }
}

export class AddonManager {
  addons: AddonRecord<IAddon>[]
  urlmap: Map<string, AddonRecord<IAddon>>
  /** Lookup by manifest id (only populated for manifest-loaded addons). */
  idmap: Map<string, AddonRecord<IAddon>>

  /**
   * Storage backend for third-party addons. Set once at boot via setStorage().
   * Built-in addons don't go through storage — they ship in the main bundle
   * via registerInternalAddon. See plan §2.4 / §6 step 10.
   */
  storage: AddonStorage | undefined

  constructor() {
    this.addons = []
    this.urlmap = new Map()
    this.idmap = new Map()
  }

  /** Sets the storage backend for third-party addons. */
  setStorage(storage: AddonStorage): void {
    this.storage = storage
  }

  /**
   * Loads every third-party addon previously installed into storage. Reads
   * each manifest.json, topo-sorts, then dynamic-imports the entry through
   * `storage.urlFor()` (which returns a blob: URL the loader can `import()`).
   * No-op if no storage is set or storage is empty.
   */
  async loadInstalledAddons(register = true): Promise<void> {
    const storage = this.storage
    if (!storage) return

    const ids = await storage.list()
    if (ids.length === 0) return

    const manifests: IAddonManifest[] = []
    for (const id of ids) {
      try {
        const raw = await storage.readJSON(id, 'manifest.json')
        const m = validateManifest(raw, `${id}/manifest.json`)
        if (m.id !== id) {
          console.error(`storage entry "${id}" has manifest.id "${m.id}" — skipping`)
          continue
        }
        manifests.push(m)
      } catch (err) {
        console.error(`failed to read manifest for installed addon "${id}":`, err)
      }
    }

    const sorted = sortManifestsByDeps(manifests)
    for (const m of sorted) {
      if (this.idmap.has(m.id)) {
        console.warn(`installed addon "${m.id}" collides with already-loaded id; skipping`)
        continue
      }
      const entryJs = m.entry.replace(/\.ts$/, '.js')
      let url: string
      try {
        url = await storage.urlFor(m.id, entryJs)
      } catch (err) {
        console.error(`failed to make URL for installed addon "${m.id}":`, err)
        continue
      }
      try {
        const module = (await import(url)) as IAddon
        const api = new AddonAPI<IAddon>()
        api.addon = module
        api.addonId = m.id
        for (const depId of m.dependencies ?? []) {
          const depApi = this.getAddonAPI(depId)
          if (depApi) api.deps[depId] = depApi
        }
        const rec = new AddonRecord(url, module, api)
        rec.manifest = m
        rec.builtin = false
        if (register) {
          this._loadAddon(rec, (err) => console.error(`installed addon "${m.id}" register failed:`, err))
        }
        this.addons.push(rec)
        this.urlmap.set(url, rec)
        this.idmap.set(m.id, rec)
      } catch (err) {
        console.error(`failed to import installed addon "${m.id}" from ${url}:`, err)
      }
    }
  }

  /**
   * Removes an installed (third-party) addon from disk + from the in-process
   * registries. No-op for builtin addons (they can be disabled, not
   * uninstalled).
   */
  async uninstall(id: string): Promise<boolean> {
    const rec = this.idmap.get(id)
    if (rec?.builtin) {
      console.warn(`refusing to uninstall builtin addon "${id}"`)
      return false
    }
    if (rec) {
      try {
        rec.addonAPI.unregisterAll()
        rec.addon.unregister()
      } catch (err) {
        console.error(`addon "${id}" unregister threw:`, err)
      }
      this.addons = this.addons.filter((r) => r !== rec)
      this.urlmap.delete(rec.url)
      this.idmap.delete(id)
    }
    if (this.storage) {
      await this.storage.remove(id)
    }
    return true
  }

  /** Returns the AddonAPI for a loaded addon, keyed by manifest id. */
  getAddonAPI(id: string): AddonAPI<unknown> | undefined {
    return this.idmap.get(id)?.addonAPI as AddonAPI<unknown> | undefined
  }

  /**
   * Registers an "internal" addon whose code lives in the main bundle (not as
   * a separately-built `build/addons/<id>/` artifact). Used during the
   * mesh-into-addon transition: the mesh subsystem ships in the main bundle
   * but announces itself to the addon registry so other addons can declare
   * `dependencies: ['mesh']` and resolve its exports via
   * `_addons.getAddonAPI('mesh').exports['mesh']`. See plan §6 step 6.
   *
   * Internal addons are always considered "builtin" and "enabled" — they
   * cannot be unloaded.
   */
  registerInternalAddon(opts: {
    manifest: IAddonManifest
    exports: Record<string, Record<string, unknown>>
  }): AddonRecord<IAddon> {
    if (this.idmap.has(opts.manifest.id)) {
      throw new Error(`internal addon "${opts.manifest.id}" is already registered`)
    }

    const api = new AddonAPI<IAddon>()
    api.addonId = opts.manifest.id
    api.exports = opts.exports

    const stub: IAddon = {
      addonDefine: {
        name        : opts.manifest.name,
        version     : 0,
        author      : opts.manifest.author,
        description : opts.manifest.description,
      },
      register() {},
      unregister() {},
      handleArgv() {},
      validArgv() {},
    }

    const rec = new AddonRecord<IAddon>(`internal:${opts.manifest.id}`, stub, api)
    rec.manifest = opts.manifest
    rec.builtin = true
    rec._enabled = true
    rec.forceEnabled = true

    this.addons.push(rec)
    this.idmap.set(opts.manifest.id, rec)
    return rec
  }

  /**
   * Loads a set of addons in topological dependency order. Each manifest is
   * resolved against the given base URL: `<baseUrl>/<id>/<built-entry>`. The
   * built entry is the entry path with `.ts` mapped to `.js`, since the
   * runtime always loads JS.
   *
   * See plan §2.4. Used by `loadAddonIndex` for the project-wide load.
   */
  async loadFromManifests(
    manifests: IAddonManifest[],
    baseUrl: string,
    options: {builtin?: boolean; register?: boolean} = {}
  ): Promise<void> {
    const sorted = sortManifestsByDeps(manifests)
    const register = options.register ?? true

    for (const m of sorted) {
      const entryJs = m.entry.replace(/\.ts$/, '.js')
      const url = `${baseUrl.replace(/\/$/, '')}/${m.id}/${entryJs}`

      let module: IAddon
      try {
        module = (await import(url)) as IAddon
      } catch (err) {
        console.error(`failed to import addon "${m.id}" from ${url}:`, err)
        continue
      }

      const api = new AddonAPI<IAddon>()
      api.addon = module
      api.addonId = m.id

      // Wire up resolved deps before register() runs.
      for (const depId of m.dependencies ?? []) {
        const depApi = this.getAddonAPI(depId)
        if (depApi !== undefined) {
          api.deps[depId] = depApi
        } else {
          console.warn(`addon "${m.id}": dep "${depId}" loaded as undefined`)
        }
      }

      const rec = new AddonRecord(url, module, api)
      rec.manifest = m
      rec.builtin = options.builtin ?? false

      try {
        if (register) {
          this._loadAddon(rec, (err) => {
            console.error(`addon "${m.id}" register() failed:`, err)
          })
        }
      } catch (err) {
        console.error(`addon "${m.id}" load failed:`, err)
      }

      this.addons.push(rec)
      this.urlmap.set(url, rec)
      this.idmap.set(m.id, rec)
    }
  }

  /**
   * Fetches `build/addons/index.json` (the discovery index produced by
   * tools/build-addons.js) and loads everything listed there in dependency
   * order. Replaces the legacy `loadAddonList`-from-`addons/list.json` path
   * for the addon-manifest world (see plan §2.1).
   */
  async loadAddonIndex(register = false): Promise<void> {
    const indexUrl = window.haveElectron ? '../build/addons/index.json' : './build/addons/index.json'

    let json: unknown
    try {
      const res = await fetch(indexUrl)
      json = await res.json()
    } catch (err) {
      console.warn(`no addon index at ${indexUrl}:`, err)
      return
    }

    if (!Array.isArray(json)) {
      console.error(`addon index ${indexUrl} must be a JSON array`)
      return
    }

    const builtinManifests: IAddonManifest[] = []
    const thirdPartyManifests: IAddonManifest[] = []

    for (const raw of json) {
      try {
        const m = validateManifest((raw as {manifest?: unknown}).manifest ?? raw)
        if ((raw as {builtin?: boolean}).builtin) {
          builtinManifests.push(m)
        } else {
          thirdPartyManifests.push(m)
        }
      } catch (err) {
        console.error('invalid entry in addon index:', err)
      }
    }

    const builtinBase = window.haveElectron ? '../build/addons' : './build/addons'
    if (builtinManifests.length > 0) {
      await this.loadFromManifests(builtinManifests, builtinBase, {builtin: true, register})
    }
    if (thirdPartyManifests.length > 0) {
      await this.loadFromManifests(thirdPartyManifests, builtinBase, {builtin: false, register})
    }
  }

  unload(addon_or_url: string | IAddon) {
    let rec: AddonRecord<IAddon> | undefined

    if (typeof addon_or_url === 'string') {
      rec = this.urlmap.get(addon_or_url)
    } else {
      for (const rec2 of this.addons) {
        if (rec2.addon === addon_or_url) {
          rec = rec2
          break
        }
      }
    }

    if (!rec) {
      throw new Error('Unknown addon ' + rec)
    }

    rec.addonAPI.unregisterAll()
    try {
      rec.addon.unregister()
    } catch (error) {
      util.print_stack(error as Error)
      return false
    }

    return true
  }

  private _loadAddon(rec: AddonRecord<IAddon>, reject: (reason?: any) => void) {
    const module = rec.addon

    try {
      module.onAddonCreate?.(rec.addonAPI)
      module.register(rec.addonAPI)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      util.print_stack(error)
      console.log('error while loading addon ' + rec.url, rec.addon)
      rec.addonAPI.unregisterAll()

      reject('error loading addon: ' + error.message + ':\n' + error.stack)
      return false
    }

    rec._enabled = true
    return true
  }

  load(url: string, register = true) {
    if (this.urlmap.has(url)) {
      const rec = this.urlmap.get(url)
      if (!rec?._enabled && register) {
        if (rec === undefined) {
          throw new Error(`addon ${url} not found`)
        }

        return new Promise((accept, reject) => {
          if (this._loadAddon(rec, reject)) {
            accept(rec.addon)
          }
        })
      }

      throw new Error('addon is already loaded')
    }

    return new Promise((accept, reject) => {
      import(getAddonPrefix() + url).then((module) => {
        const api = new AddonAPI()

        api.addon = module

        const rec = new AddonRecord(url, module, api)

        this._loadAddon(rec, reject)

        //addon isn't enabled? unregister, but nstructjs stuff
        //will remain
        if (!register) {
          rec.enabled = false
        }

        this.addons.push(rec)
        accept(module)
      })
    })
  }

  loadAddonList(register = false) {
    let url = './addons/list.json'

    if (window.haveElectron) {
      url = '../addons/list.json'
    }

    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        console.warn('json', json)
        for (const url2 of json) {
          this.load(url2, register)
        }
      })
  }

  handleArgv(argv: string[]) {
    for (const addon of this.addons) {
      if (!addon.enabled && addon.addon.validArgv?.(addon.addonAPI, argv)) {
        addon.enabled = true
        addon.forceEnabled = true
      }

      if (addon.enabled && addon.addon.handleArgv) {
        addon.addon.handleArgv(addon.addonAPI, argv)
      }
    }
  }
}

const manager = new AddonManager()
export default manager

export function startAddons(autoRegister?: boolean) {
  // New manifest-based pipeline: fetches build/addons/index.json and topo-loads
  // anything tools/build-addons.js produced. Failure is non-fatal (e.g. when
  // the dev hasn't run a build yet) and we still fall through to the legacy
  // addons/list.json loader for now. The legacy path goes away in step 12 once
  // all toolmodes/builtins live under addons/builtin/.
  manager.loadAddonIndex(autoRegister).catch((err) => {
    console.warn('addon index load failed:', err)
  })

  // Pick a storage backend for third-party addons and load anything previously
  // installed. The backend can be overridden by the host (e.g. tests) by
  // calling manager.setStorage() before startAddons().
  initAddonStorage()
    .then((storage) => {
      if (!storage) return
      manager.setStorage(storage)
      return manager.loadInstalledAddons(autoRegister ?? true)
    })
    .catch((err) => {
      console.warn('installed-addon load failed:', err)
    })

  manager.loadAddonList(autoRegister)
}

/**
 * Picks a default storage backend: NodeFs (via Electron IPC) when running
 * inside Electron, IndexedDB when in a real browser, or undefined in any
 * environment that has neither. Hosts that need a different backend (e.g.
 * tests) should bypass this and call manager.setStorage() directly.
 */
async function initAddonStorage(): Promise<AddonStorage | undefined> {
  if (window.haveElectron) {
    try {
      const {createElectronAddonStorage} = await import('./storage_electron.js')
      return await createElectronAddonStorage()
    } catch (err) {
      console.warn('Electron addon storage init failed:', err)
      return undefined
    }
  }
  if (typeof indexedDB !== 'undefined') {
    const {IndexedDBAddonStorage} = await import('./storage.js')
    return new IndexedDBAddonStorage()
  }
  return undefined
}

declare global {
  interface Window {
    _addons: AddonManager
  }
}

window._addons = manager

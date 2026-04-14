import {AddonAPI, IAddon} from './addon_base'
import * as util from '../util/util'

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
      this._enabled = !!val
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

  constructor() {
    this.addons = []
    this.urlmap = new Map()
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

    module.register(rec.addonAPI)
    // XXX

    try {
      //module.register(rec.addonAPI)
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
  manager.loadAddonList(autoRegister)
}

declare global {
  interface Window {
    _addons: AddonManager
  }
}

window._addons = manager

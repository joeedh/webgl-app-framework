import {util, nstructjs} from '../path.ux/scripts/pathux.js'
import {BrushSets, setBrushSet} from '../brush/brush'
import type {StructReader} from '../path.ux/scripts/path-controller/types/util/nstructjs'
import addonManager from '../addon/addon.js'

import '../util/polyfill.d.ts'

declare var _appstate: any

export class SavedScreen {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
SavedScreen {
  data : array(byte);
}
`
  )

  name: string
  data: ArrayBuffer | string

  constructor(name: string, data: ArrayBuffer | string) {
    this.name = name
    this.data = data
  }

  static create(name = 'Screen'): SavedScreen {
    let file = _appstate.createFile({save_screen: true, save_library: false, save_settings: false})
    return new SavedScreen(name, file)
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this)

    this.data = new Uint8Array(this.data as any).buffer
  }
}

const SETTINGS_KEY = 'webgl-app-framework-settings'

export interface AddonSettingsJSON {
  name: string
  enabled: boolean
  settings: Record<string, any>
}

export class AddonSettings {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
AddonSettings {
  name     : string;
  enabled  : bool;
  settings : string | JSON.stringify(this.settings);
}
`
  )

  name: string
  enabled: boolean
  settings: Record<string, any> | string

  constructor(name = '') {
    this.name = name
    this.enabled = false
    this.settings = {} //json
  }

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this)

    try {
      this.settings = JSON.parse(this.settings as string)
    } catch (error) {
      console.error((error as Error).message, '\n' + (error as Error).stack)
      this.settings = {}
    }
  }

  toJSON(): AddonSettingsJSON {
    return {
      name    : this.name,
      enabled : this.enabled,
      settings: this.settings as Record<string, any>,
    }
  }

  loadJSON(json: AddonSettingsJSON): this {
    this.settings = json.settings
    this.name = json.name
    this.enabled = json.enabled

    return this
  }
}

export interface AppSettingsJSON {
  screens: SavedScreen[]
  limitUndoMem: boolean
  undoMemLimit: number
  brushSet: number
  addonSettings: Record<string, AddonSettingsJSON>
}

export class AppSettings {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
AppSettings {
  screens       : array(SavedScreen);
  limitUndoMem  : bool;
  undoMemLimit  : int;
  brushSet      : int;
  addonSettings : iterkeys(AddonSettings);
}
`
  )

  screens: SavedScreen[]
  addonSettings: Record<string, AddonSettings>
  limitUndoMem: boolean
  undoMemLimit: number
  brushSet: number

  constructor() {
    this.screens = []
    this.addonSettings = {}
    this.limitUndoMem = true
    this.undoMemLimit = 512 //in megabytes
    this.brushSet = BrushSets.MEDIUM_RES
  }

  static defineAPI(api: any): any {
    let st = api.mapStruct(this, true)

    let onchange = function (this: {dataref: AppSettings}) {
      if (this.dataref === _appstate.settings) {
        this.dataref.save()
      }
    }

    st.bool('limitUndoMem', 'limitUndoMem', 'Limit Undo Memory').on('change', onchange)
    st.int('undoMemLimit', 'undoMemLimit', 'Mem Limit', 'Memory Limit in megabytes (for undo)').on('change', onchange)
    st.enum('brushSet', 'brushSet', BrushSets)
      .on('change', function (this: {dataref: AppSettings}) {
        let settings = this.dataref

        setBrushSet(settings.brushSet)
      })
      .descriptions({
        MEDIUM_RES:
          'For 100k triangle meshes and less.\nBrushes will try to align geometry to curvature.\n (i.e. Rake and Curvature Factor are set to 1).',
      })

    let ast = api.mapStruct(AddonSettings, true)
    ast.bool('enabled', 'enabled', 'Enabled').on('change', function (this: {dataref: AddonSettings}, val: boolean) {
      for (let addon of addonManager.addons) {
        if (addon.key === this.dataref.name) {
          console.log('found addon', addon)
          addon.enabled = val
        }
      }

      if ((window as any)._appstate && _appstate.settings) {
        _appstate.settings.save()
      }
    })

    ast.string('name', 'name', 'Name').readOnly()

    st.list('addonSettings', 'addons', {
      getStruct(api: any, list: any, key: string) {
        return ast
      },

      get(api: any, list: Record<string, AddonSettings>, key: string) {
        return list[key]
      },

      getKey(api: any, list: any, obj: AddonSettings) {
        return obj.name
      },

      getIter(api: any, list: Record<string, AddonSettings>) {
        return (function* () {
          for (let k in list) {
            yield list[k]
          }
        })()
      },
    })
    return st
  }

  toJSON(): AppSettingsJSON {
    return {
      screens      : this.screens,
      limitUndoMem : this.limitUndoMem,
      undoMemLimit : this.undoMemLimit,
      brushSet     : this.brushSet,
      addonSettings: this.addonSettings as any,
    }
  }

  loadJSON(json: AppSettingsJSON): void {
    this.limitUndoMem = json.limitUndoMem
    this.undoMemLimit = json.undoMemLimit

    if (json.brushSet !== undefined) {
      this.brushSet = json.brushSet
    }

    this.addonSettings = (json.addonSettings as any) || {}

    for (let k in this.addonSettings) {
      let json2 = this.addonSettings[k] as any as AddonSettingsJSON
      this.addonSettings[k] = new AddonSettings().loadJSON(json2)
    }

    //this.screens = json.screens;
  }

  save(): void {
    console.log(util.termColor('Saving settings', 'green'))
    localStorage[SETTINGS_KEY] = JSON.stringify(this)
  }

  _loadAddons(): void {
    this.syncAddonList()

    for (let addon of addonManager.addons) {
      let addon2 = this.addonSettings[addon.key]

      if (!!addon2.enabled !== !!addon.enabled) {
        addon.enabled = addon2.enabled
      }
    }
  }

  load(): void {
    let json: AppSettingsJSON

    try {
      json = JSON.parse(localStorage[SETTINGS_KEY])
    } catch (error) {
      console.warn('Failed to load user settings from localStorage')
      return
    }

    this.loadJSON(json)

    try {
      setBrushSet(this.brushSet)
    } catch (error) {
      util.print_stack(error as Error)
    }

    //window.setTimeout(() => {
    this._loadAddons()
    //});
  }

  syncAddonList(): boolean {
    let ret = false

    for (let addon of addonManager.addons) {
      if (!(addon.key in this.addonSettings)) {
        this.addonSettings[addon.key] = new AddonSettings(addon.key)

        ret = true
      }
    }

    if (ret) {
      this.save()
    }

    return ret
  }

  destroy(): void {}

  loadSTRUCT(reader: StructReader<this>): void {
    reader(this)

    let addonSettings = this.addonSettings as any

    console.error('addonSettings', addonSettings)

    if (!(addonSettings instanceof Array)) {
      return
    }

    this.addonSettings = {}

    for (let addon of addonSettings as AddonSettings[]) {
      this.addonSettings[addon.name] = addon
    }
  }
}

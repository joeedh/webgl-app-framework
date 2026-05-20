import {Vector2, Vector3, Vector4, Quat, Matrix4} from '../../util/vectormath.js'
import * as math from '../../util/math.js'
import * as util from '../../util/util.js'
import {exportTheme, loadUIData, nstructjs, saveUIData, UIBase} from '../../path.ux/scripts/pathux.js'
import {Editor} from '../editor_base.ts'
import {Icons} from '../icon_enum.js'
import addonManager from '../../addon/addon.js'
import {pickAndInstallAddon} from '../../addon/install_ui.ts'

export class SettingsEditor extends Editor {
  static STRUCT = nstructjs.inlineRegister(
    this,
    `
SettingsEditor {
}
  `
  )

  constructor() {
    super()
  }

  init() {
    super.init()
    this.background = this.getDefault('DefaultPanelBG')

    let header = this.header
    let body = (this.body = this.container.col())

    this.rebuild()
  }

  rebuild() {
    let container = this.body

    let uidata = saveUIData(container, 'settings')

    container.clear()

    let tabs = (this.tabs = container.tabs('left'))
    let tab

    this.style['overflow'] = 'scroll'

    tab = tabs.tab('General')
    tab = tabs.tab('Theme')

    tab.button('Export Theme', () => {
      let theme = exportTheme()

      theme = theme.replace(/var theme/, 'export const theme')

      theme = 'import {CSSFont, setTheme} from "../path.ux/scripts/core/ui_base.js";\n\n' + theme
      theme =
        `
/*
 * WARNING: AUTO-GENERATED FILE
 * 
 * Copy to scripts/editors/theme.js
 */
      `.trim() +
        '\n\n' +
        theme
      theme += '\nsetTheme(theme);\n\n'

      console.log(theme)

      let blob = new Blob([theme], {mime: 'application/javascript'})
      let url = URL.createObjectURL(blob)

      console.log('url', url)
      window.open(url)
    })

    tab.add(UIBase.createElement('theme-editor-x'))

    tab = tabs.tab('Addons')

    // Install button at the top — opens a file picker, installs the .zip via
    // the configured storage backend, and reloads the addon list.
    if (addonManager.storage) {
      tab.button('Install Addon…', () => {
        pickAndInstallAddon()
          .then((result) => {
            if (result) {
              console.log(`installed addon "${result.manifest.id}"`)
              this.doOnce(this.rebuild)
            }
          })
          .catch((err) => {
            console.error('addon install failed:', err)
            window.alert?.(`Addon install failed: ${err.message}`)
          })
      })
    }

    for (let addon of addonManager.addons) {
      let k = addon.key
      let path = `settings.addons['${k}']`

      let row = tab.row()

      row.useIcons('false')
      row.prop(path + '.enabled')
      row.label(addon.name)

      // Third-party addons get an Uninstall button. Builtin addons stay
      // for the session — they can be disabled via the enabled checkbox.
      if (addon.manifest && !addon.builtin) {
        row.button('Uninstall', () => {
          if (!window.confirm?.(`Uninstall "${addon.manifest.name}"?`)) return
          addonManager
            .uninstall(addon.manifest.id)
            .then(() => this.doOnce(this.rebuild))
            .catch((err) => console.error('uninstall failed:', err))
        })
      }
    }

    loadUIData(container, uidata)

    this.flushUpdate()
  }

  setCSS() {
    super.setCSS()
  }

  update() {
    if (this.ctx && this.ctx.settings.syncAddonList()) {
      this.doOnce(this.rebuild)
    }

    return super.update()
  }

  static define() {
    return {
      uiname  : 'Settings',
      areaname: 'settings-editor',
      tagname : 'settings-editor-x',
      icon    : Icons.EDITOR_SETTINGS,
    }
  }
}

Editor.register(SettingsEditor)

import {exportTheme, loadUIData, nstructjs, saveUIData, TabContainer} from '../../path.ux/scripts/pathux'
import {UIBase} from '../../path.ux/scripts/core/ui_base'
import {Container} from '../../path.ux/scripts/core/ui'
import {Editor} from '../editor_base'
import {Icons} from '../icon_enum.js'
import addonManager from '../../addon/addon.js'
import {pickAndInstallAddon} from '../../addon/install_ui'
import {FeatureFlags, featureFlagApiName} from '../../core/feature-flag'
import type {ViewContext} from '../../core/context'

export class SettingsEditor extends Editor {
  body!: Container<ViewContext>
  tabs!: TabContainer<ViewContext>

  static STRUCT = nstructjs.inlineRegister(
    this,
    `
SettingsEditor {
}
  `
  )

  init(): void {
    super.init()
    this.background = this.getDefault('DefaultPanelBG')

    this.body = this.container.col()

    this.rebuild()
  }

  rebuild(): void {
    const container = this.body

    const uidata = saveUIData(container, 'settings')

    container.clear()

    const tabs = (this.tabs = container.tabs('left'))

    this.style['overflow'] = 'scroll'

    let tab = tabs.tab('General')
    tab.useIcons(false)
    tab.prop('settings.limitUndoMem')
    tab.prop('settings.undoMemLimit')

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

      const blob = new Blob([theme], {type: 'application/javascript'})
      const url = URL.createObjectURL(blob)

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

    for (const addon of addonManager.addons) {
      const k = addon.manifest?.id ?? addon.key
      const path = `settings.addons['${k}']`

      const row = tab.row()

      row.useIcons(false)
      row.prop(path + '.enabled')
      row.label(addon.name)

      // Third-party addons get an Uninstall button. Builtin addons stay
      // for the session — they can be disabled via the enabled checkbox.
      const manifest = addon.manifest
      if (manifest && !addon.builtin) {
        row.button('Uninstall', () => {
          if (!window.confirm?.(`Uninstall "${manifest.name}"?`)) return
          addonManager
            .uninstall(manifest.id)
            .then(() => this.doOnce(this.rebuild))
            .catch((err) => console.error('uninstall failed:', err))
        })
      }
    }

    tab = tabs.tab('Feature Flags')
    tab.useIcons(false)

    for (const flag of FeatureFlags.definitions) {
      tab.prop(`settings.featureFlags.${featureFlagApiName(flag.key)}`)
    }

    loadUIData(container, uidata)

    this.flushUpdate()
  }

  update(): void {
    if (this.ctx?.settings.syncAddonList()) {
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

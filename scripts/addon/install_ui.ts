/**
 * UI helpers for the addon install flow. Step 10 of the refactor
 * (plan §2.6, §6 step 10).
 *
 * `pickAndInstallAddon` opens a file picker, reads the selected .zip, and
 * runs the install pipeline against the AddonManager's configured storage.
 * Suitable to bind to a button in any pathux container — `SettingsEditor`
 * has an "Install Addon..." button that calls this.
 *
 * The picker is built from a transient `<input type="file">`; no special
 * pathux integration needed. Works in any browser-like environment (Chrome,
 * Electron renderer, jsdom-with-DOM-stubs).
 */

import addonManager from './addon.js'
import {AddonInstallError, installFromBlob} from './install.js'
import type {IAddonManifest} from './manifest.js'

export interface IPickResult {
  manifest: IAddonManifest
  reloaded: boolean
}

/**
 * Opens a file picker, awaits a `.zip` selection, installs it via the manager's
 * configured storage, and triggers loadInstalledAddons() so the new addon
 * shows up immediately.
 *
 * Returns the manifest on success, undefined if the user cancelled.
 * Throws AddonInstallError on validation/extraction failure.
 */
export async function pickAndInstallAddon(): Promise<IPickResult | undefined> {
  if (!addonManager.storage) {
    throw new AddonInstallError('no addon storage configured — install is disabled')
  }

  const file = await pickZipFile()
  if (!file) return undefined

  const buf = await file.arrayBuffer()
  const manifest = await installFromBlob(buf, addonManager.storage)

  // Load the just-installed addon. Rolling the whole list keeps us simple at
  // the cost of being a tiny bit chatty when many addons are installed.
  await addonManager.loadInstalledAddons()
  return {manifest, reloaded: true}
}

function pickZipFile(): Promise<File | undefined> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(undefined)
      return
    }
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.zip,application/zip'
    input.style.display = 'none'
    document.body.appendChild(input)

    let resolved = false
    const cleanup = () => {
      if (resolved) return
      resolved = true
      input.removeEventListener('change', onChange)
      window.removeEventListener('focus', onFocus, true)
      try {
        document.body.removeChild(input)
      } catch {
        // already removed
      }
    }

    const onChange = () => {
      const file = input.files?.[0]
      cleanup()
      resolve(file)
    }

    // Some browsers fire `change` only on success; if the user cancels the
    // dialog we never resolve. As a fallback, wait one tick after the window
    // regains focus and resolve with undefined if no file came in.
    let focusFired = false
    const onFocus = () => {
      if (focusFired) return
      focusFired = true
      setTimeout(() => {
        if (!resolved) {
          cleanup()
          resolve(undefined)
        }
      }, 200)
    }

    input.addEventListener('change', onChange)
    window.addEventListener('focus', onFocus, {capture: true})
    input.click()
  })
}

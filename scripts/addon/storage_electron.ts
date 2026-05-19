/**
 * Electron-side wiring for NodeFsAddonStorage. Step 9c of the refactor
 * (plan §5, §6 step 9).
 *
 * The Electron build uses `nodeIntegration: true` + `contextIsolation: false`
 * (see electron/main.js), which means the renderer has direct access to
 * `require('fs/promises')` and `require('path')`. We use that to back
 * NodeFsAddonStorage without needing IPC for individual file ops — only one
 * IPC call to look up `app.getPath('userData')` at init time.
 *
 * Usage in code that boots the addon system:
 *
 *     if (window.haveElectron) {
 *       const storage = await createElectronAddonStorage()
 *       addonManager.setStorage(storage)
 *     }
 *
 * The corresponding IPC handler lives in electron/main.js. See the SMOKE.md
 * checklist for end-to-end verification.
 */

import {NodeFsAddonStorage} from './storage.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RequireFn = (id: string) => any

declare global {
  interface Window {
    /** Set by electron/window.html when running under Electron. */
    haveElectron?: boolean
  }
}

/**
 * Builds a NodeFsAddonStorage rooted at `<userData>/addons` in the Electron
 * renderer. Throws if called outside Electron or if `require` isn't available.
 */
export async function createElectronAddonStorage(): Promise<NodeFsAddonStorage> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const req = (globalThis as any).require as RequireFn | undefined
  if (typeof req !== 'function') {
    throw new Error('createElectronAddonStorage: require() not available — is nodeIntegration on?')
  }

  const fsp = req('fs/promises') as import('fs/promises')
  const pathlib = req('path') as import('path')
  const {ipcRenderer} = req('electron') as typeof import('electron')

  // Main process owns app.getPath; ask once at init time.
  const userData = (await ipcRenderer.invoke('addon-storage:get-user-data')) as string
  const baseDir = pathlib.join(userData, 'addons')

  return new NodeFsAddonStorage({
    baseDir,
    fs     : fsp,
    pathlib,
  })
}

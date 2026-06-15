let win
const {app, BrowserWindow, dialog, nativeTheme} = require('electron')

const {ipcMain, Menu, MenuItem} = require('electron')
const path = require('path')

// The sculptcore wasm uses a shared-memory (SharedArrayBuffer) wasm.Memory that
// is transferred to web workers. Chromium gates that behind cross-origin
// isolation, which Electron won't grant a file:// page. Re-enable the
// SharedArrayBuffer feature so the transfer is allowed. Must run before ready.
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')
// --- application argv -------------------------------------------------------
// Electron does NOT forward the user args of `electron main.js <args...>` into
// the renderer's process.argv. We capture them here and re-inject them into the
// renderer via webPreferences.additionalArguments (see createWindow). The
// renderer parses them in scripts/core/app_argv.ts + test_harness.ts.
//
// process.defaultApp is true when launched as `electron <script>` (dev), where
// argv is [electron, main.js, ...userArgs]; packaged it's [exe, ...userArgs].
const APP_ARGV = process.argv.slice(process.defaultApp ? 2 : 1)

function findFlag(name) {
  const flag = '--' + name
  for (const a of APP_ARGV) {
    if (a === flag) return ''
    if (a.startsWith(flag + '=')) return a.slice(flag.length + 1)
  }
  return undefined
}

const HEADLESS = findFlag('headless') !== undefined
const NO_DEVTOOLS = findFlag('no-devtools') !== undefined

// --remote-debug[=PORT] exposes a Chrome DevTools Protocol endpoint so the
// chrome-devtools-mcp plugin can drive the live renderer. Connect it with
// `npx chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:<PORT>`.
// remote-allow-origins is required by modern Chromium to accept the CDP
// websocket from a non-matching origin. Both switches must precede app ready.
const remoteDebug = findFlag('remote-debug')
if (remoteDebug !== undefined) {
  const port = remoteDebug && /^\d+$/.test(remoteDebug) ? remoteDebug : '9222'
  app.commandLine.appendSwitch('remote-debugging-port', port)
  app.commandLine.appendSwitch('remote-allow-origins', '*')
  console.log(`[apptest] CDP remote debugging on http://127.0.0.1:${port}`)
}

app.commandLine.appendSwitch('js-flags', '--expose-gc')

// Lets the renderer test harness (--exit) shut the app down cleanly.
ipcMain.handle('apptest:quit', async () => {
  app.quit()
})

// Addon storage path lookup. The renderer (with nodeIntegration:true)
// performs the actual fs reads/writes via NodeFsAddonStorage; it just needs
// the userData root from the main process. See scripts/addon/storage_electron.ts.
ipcMain.handle('addon-storage:get-user-data', async () => {
  return app.getPath('userData')
})

ipcMain.handle('nativeTheme.setThemeSource', async (event, val) => {
  nativeTheme.themeSource = val
})

ipcMain.handle('nativeTheme', async (event) => {
  let obj = {}

  for (let k in nativeTheme) {
    let v = nativeTheme[k]

    if (typeof v !== 'object' && typeof v !== 'function') {
      obj[k] = v
    }
  }

  if (win) {
    win.webContents.send('nativeTheme', obj)
  }
})

function makeInvoker(
  event,
  callbackKey,
  getargs = (args) => {
    args
  }
) {
  return function () {
    let args = getargs(arguments)
    console.log('ARGS', args)

    win.webContents.send('invoke-menu-callback', callbackKey, args)
  }
}

function loadMenu(event, menudef) {
  console.log('MENU', menudef)

  let menu = new Menu()

  for (let item of menudef) {
    if (item.submenu) {
      item.submenu = loadMenu(event, item.submenu)
    }

    if (item.click) {
      item.click = makeInvoker(event, item.click, (args) => [args[0].id])
    }

    item = new MenuItem(item)

    menu.append(item)
  }

  return menu
}

let menus = {}
let menuBarId = undefined

// Main
ipcMain.handle('popup-menu', async (event, menu, x, y, callback) => {
  let id = menu._ipcId

  callback = makeInvoker(event, callback)
  menu = loadMenu(event, menu)

  menus[id] = menu
  menu.popup({x, y, callback})
})

ipcMain.handle('close-menu', async (event, menuid) => {
  menus[menuid].closePopup(win)
})

ipcMain.handle('set-menu-bar', async (event, menu) => {
  let id = menu._ipcId

  menu = loadMenu(event, menu)

  if (menuBarId !== undefined) {
    delete menus[menuBarId]
  }

  menus[id] = menu
  menuBarId = id

  Menu.setApplicationMenu(menu)
})

ipcMain.handle('show-open-dialog', async (event, args, then, catchf) => {
  let dialog = require('electron').dialog

  dialog
    .showOpenDialog(args)
    .then(
      makeInvoker(event, then, (args) => {
        let e = {
          filePaths: args[0].filePaths,
          cancelled: args[0].cancelled,
          canceled : args[0].canceled,
        }

        return [e]
      })
    )
    .catch(makeInvoker(event, catchf))
})

ipcMain.handle('show-save-dialog', async (event, args, then, catchf) => {
  let dialog = require('electron').dialog

  dialog
    .showSaveDialog(args)
    .then(
      makeInvoker(event, then, (args) => {
        let e = {
          filePath : args[0].filePath,
          cancelled: args[0].cancelled,
          canceled : args[0].canceled,
        }

        return [e]
      })
    )
    .catch(makeInvoker(event, catchf))
})

function sculptcoreDir() {
  // Where the renderer persists the startup file + user settings (see
  // scripts/core/app_storage.ts). From source we keep it self-contained in the
  // repo root (<repo>/.sculptcore); packaged builds use ~/.sculptcore.
  if (!app.isPackaged) {
    return path.join(__dirname, '..', '.sculptcore')
  }
  return path.join(require('os').homedir(), '.sculptcore')
}

function createWindow() {
  // Forward the application argv into the renderer's process.argv as a base64
  // token (decoded by scripts/core/app_argv.ts). base64 avoids quoting issues.
  const argvToken = '--apptest-argv=' + Buffer.from(JSON.stringify(APP_ARGV)).toString('base64')
  const storageDirToken = '--sculptcore-dir=' + sculptcoreDir()

  // Create the browser window.
  win = new BrowserWindow({
    width         : 1400,
    height        : 900,
    show          : !HEADLESS,
    webPreferences: {
      nodeIntegration            : true,
      nodeIntegrationInWorker    : true,
      sandbox                    : false,
      contextIsolation           : false,
      enableRemoteModule         : true,
      experimentalFeatures       : true,
      allowRunningInsecureContent: true,
      additionalArguments        : [argvToken, storageDirToken],
    },
  })

  // and load the index.html of the app.
  win.loadFile('window.html')

  if (!NO_DEVTOOLS && !HEADLESS) {
    win.webContents.openDevTools()
  }
}

app.whenReady().then(createWindow)

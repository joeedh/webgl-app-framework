let win;
const { app, BrowserWindow, dialog} = require('electron')

const {ipcMain, Menu, MenuItem} = require('electron')

function makeInvoker(event, callbackKey, getargs = (args) => {
  args
}) {
  return function () {
    let args = getargs(arguments);
    console.log("ARGS", args);

    win.webContents.send('invoke-menu-callback', callbackKey, args);
  }
}

function loadMenu(event, menudef) {
  console.log("MENU", menudef);

  let menu = new Menu();

  for (let item of menudef) {
    if (item.submenu) {
      item.submenu = loadMenu(event, item.submenu);
    }

    if (item.click) {
      item.click = makeInvoker(event, item.click, (args) => [args[0].id]);
    }

    item = new MenuItem(item);

    menu.append(item);
  }

  return menu;
}

let menus = {};
let menuBarId = undefined;

// Main
ipcMain.handle('popup-menu', async (event, menu, x, y, callback) => {
  let id = menu._ipcId;

  callback = makeInvoker(event, callback);
  menu = loadMenu(event, menu);

  menus[id] = menu;
  menu.popup({x, y, callback});
});

ipcMain.handle('close-menu', async (event, menuid) => {
  menus[menuid].closePopup(win);
});

ipcMain.handle('set-menu-bar', async (event, menu) => {
  let id = menu._ipcId;

  menu = loadMenu(event, menu);

  if (menuBarId !== undefined) {
    delete menus[menuBarId];
  }

  menus[id] = menu;
  menuBarId = id;

  Menu.setApplicationMenu(menu);
});

ipcMain.handle('show-open-dialog', async (event, args, then, catchf) => {
  let dialog = require('electron').dialog;

  dialog.showOpenDialog(args).then(makeInvoker(event, then, (args) => {
    let e = {
      filePaths: args[0].filePaths,
      cancelled: args[0].cancelled,
      canceled : args[0].canceled
    };

    return [e];
  })).catch(makeInvoker(event, catchf));
});

ipcMain.handle('show-save-dialog', async (event, args, then, catchf) => {
  let dialog = require('electron').dialog;

  dialog.showSaveDialog(args).then(makeInvoker(event, then, (args) => {
    let e = {
      filePath: args[0].filePath,
      cancelled: args[0].cancelled,
      canceled : args[0].canceled
    };

    return [e];
  })).catch(makeInvoker(event, catchf));
});

function createWindow () {
  // Create the browser window.
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      sandbox : false,
      enableRemoteModule : true,
      experimentalFeatures: true,
      allowRunningInsecureContent : true
    }
  })

  // and load the index.html of the app.
  win.loadFile('window.html');

  win.webContents.openDevTools();
}

app.whenReady().then(createWindow)


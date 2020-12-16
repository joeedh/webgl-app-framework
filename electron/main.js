const { app, BrowserWindow } = require('electron')

function createWindow () {
  // Create the browser window.
  let win = new BrowserWindow({
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


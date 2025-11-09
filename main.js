const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  // Create the browser window with appropriate security settings
  const mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      // Use the preload script for security
      preload: path.join(__dirname, 'preload.js'),
      // Important security settings:
      nodeIntegration: false, 
      contextIsolation: true,
      webSecurity: true 
    }
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Optionally open the DevTools for debugging (remove this line for production)
  // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    // Recreate the window on macOS if none are open
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  // Quit the application when all windows are closed (except on macOS)
  if (process.platform !== 'darwin') app.quit();
});
// --- Electron Main Process (Node.js Backend) ---

const { app, BrowserWindow } = require('electron');
const path = require('path');

// Global variable to keep a reference to the main window object
let mainWindow;

function createWindow() {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 1200, 
        height: 800,
        minWidth: 800,
        minHeight: 600,
        title: "Medical AI Application",
        icon: path.join(__dirname, 'icon.png'), // Placeholder for your app icon
        webPreferences: {
            // SECURITY NOTE: contextIsolation: false is used for quick development. 
            // Consider using a 'preload' script and contextIsolation: true for production.
            nodeIntegration: true, 
            contextIsolation: false, 
        }
    });

    // Load the index.html file of the app.
    mainWindow.loadFile('index.html');

    // Open the DevTools (optional, comment out for final release)
    // mainWindow.webContents.openDevTools();

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
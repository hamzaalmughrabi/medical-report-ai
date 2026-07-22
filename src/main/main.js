// ==================================================
// main.js — Unified + Cleaned + Fully Working
// ==================================================

const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const NotesHandler = require("./notes-handler");

let mainWindow;
let notesHandler;

// -----------------------------------------
// CREATE WINDOW
// -----------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // If it's not our internal app path, open externally
    if (url.startsWith("http") || url.startsWith("blob")) {
      require("electron").shell.openExternal(url);
    }
    return { action: "deny" };
  });
}

// -----------------------------------------
// ELECTRON LIFECYCLE
// -----------------------------------------
app.whenReady().then(() => {
  notesHandler = new NotesHandler();
  registerNotesHandlers();
  registerAppHandlers();
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// --------------------------------------------------
// REGISTER NOTES / CHECKLIST IPC
// --------------------------------------------------
function registerNotesHandlers() {
  ipcMain.handle("notes:load", () => notesHandler.loadData());
  ipcMain.handle("notes:saveNotes", (e, text) => notesHandler.updateNotes(text));
  ipcMain.handle("notes:addChecklistItem", (e, text) =>
    notesHandler.addChecklistItem(text)
  );
  ipcMain.handle("notes:toggleChecklistItem", (e, id) =>
    notesHandler.toggleChecklistItem(id)
  );
  ipcMain.handle("notes:deleteChecklistItem", (e, id) =>
    notesHandler.deleteChecklistItem(id)
  );
}

// --------------------------------------------------
// APP NAVIGATION + PYTHON EXECUTION + PHASES
// --------------------------------------------------
let backendProcess = null;

function registerAppHandlers() {
  // Issue #8: Auto-spawn backend on startup with correct CWD
  const pythonPath = path.join(__dirname, "../../.venv/Scripts/python.exe");
  const backendAppDir = path.join(__dirname, "../../backend/app");
  
  // Use explicit script name relative to CWD
  backendProcess = spawn(pythonPath, ["backend_api.py"], {
    cwd: backendAppDir,
    env: { ...process.env, PYTHONUNBUFFERED: "1" }
  });

  backendProcess.stdout.on("data", (data) => {
    console.log(`[Python Backend]: ${data.toString()}`);
  });

  backendProcess.stderr.on("data", (data) => {
    console.error(`[Python Backend Error]: ${data.toString()}`);
  });

  backendProcess.on("close", (code) => {
    console.log(`Backend process exited with code ${code}`);
  });

  // Ensure backend is killed when app exits
  app.on("will-quit", () => {
    if (backendProcess) {
      backendProcess.kill();
    }
  });

  // Issue #Mobile: Get local IP for mobile connection
  ipcMain.handle("app:local-ip", () => {
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          return iface.address;
        }
      }
    }
    return "127.0.0.1";
  });
}


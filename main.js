const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
global.sharedReportId = null;

// -----------------------------------------
// CREATE MAIN WINDOW
// -----------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 750,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  mainWindow.loadFile("index.html");
}

// -----------------------------------------
// ELECTRON APP LIFECYCLE
// -----------------------------------------
app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

// -----------------------------------------
// NAVIGATION: OPEN PHASE 1
// -----------------------------------------
ipcMain.on("open-phase1", () => {
  if (mainWindow) {
    mainWindow.loadFile("phase1.html");
  }
});

// -----------------------------------------
// NAVIGATION: OPEN PHASE 2
// -----------------------------------------
ipcMain.on("open-phase2", (event, reportId) => {
  global.sharedReportId = reportId;

  if (mainWindow) {
    mainWindow.loadFile("phase2.html");
  }
});

// -----------------------------------------
// PYTHON EXECUTION HANDLER
// -----------------------------------------
ipcMain.handle("run-python", async (event, args) => {
  return new Promise((resolve) => {
    const pythonProcess = spawn("python", args);

    let output = "";
    let errorOutput = "";

    pythonProcess.stdout.on("data", (data) => {
      output += data.toString();
    });

    pythonProcess.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    pythonProcess.on("close", () => {
      if (errorOutput) {
        console.error("Python Error:", errorOutput);
        resolve("ERROR: " + errorOutput);
      } else {
        resolve(output);
      }
    });
  });
});

// -----------------------------------------
// API: GET PHASE 2 REPORT ID
// -----------------------------------------
ipcMain.handle("get-shared-id", () => {
  return global.sharedReportId;
});

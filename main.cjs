const { app, BrowserWindow } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let serverProcess = null;
let mainWindow = null;

// Start the Express server
try {
  serverProcess = fork(path.join(__dirname, 'server.js'), [], {
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: 'inherit'
  });
  
  if (serverProcess) {
    serverProcess.on('error', (err) => {
      console.error("Express server process error:", err);
    });
    serverProcess.on('exit', (code, signal) => {
      console.error(`Express server process exited with code ${code} and signal ${signal}`);
    });
  }
} catch (e) {
  console.error("Failed to start Express server process:", e);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: "أجرة سيارات",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL('http://localhost:3001');

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Give Express a moment to start listening
  setTimeout(createWindow, 1500);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});

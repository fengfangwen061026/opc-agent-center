import path from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import { BridgeProcess } from './bridge-process'

const bridgeProcess = new BridgeProcess()

async function waitForBridge(baseUrl: string, timeoutMs = 15000): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return
    } catch {
      // Bridge is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  console.warn('[electron] Bridge 未在 15s 内就绪，继续启动窗口')
}

async function createWindow() {
  bridgeProcess.start()
  await waitForBridge(bridgeProcess.getUrl())

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#f8fbff',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (!app.isPackaged) {
    await win.loadURL('http://127.0.0.1:5174')
    win.webContents.openDevTools()
  } else {
    await win.loadFile(path.join(process.resourcesPath, 'web', 'index.html'))
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  void createWindow()
})

app.on('window-all-closed', () => {
  bridgeProcess.stop()
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow()
  }
})

app.on('before-quit', () => {
  bridgeProcess.stop()
})

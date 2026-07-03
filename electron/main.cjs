const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const fs = require('fs')
const path = require('path')

const isDev = !app.isPackaged
let saveQueue = Promise.resolve()

app.setName('CrewFlow')
app.setPath('userData', path.join(app.getPath('appData'), 'CrewFlow'))

function appDataPath() {
  return path.join(app.getPath('userData'), 'crewflow-data.json')
}

async function readAppData() {
  try {
    const data = await fs.promises.readFile(appDataPath(), 'utf8')
    return JSON.parse(data)
  } catch {
    return null
  }
}

async function writeAppData(data) {
  const filePath = appDataPath()
  const tempPath = `${filePath}.tmp`
  const currentData = (await readAppData()) || {}
  const nextData = {
    ...currentData,
    ...data,
    updatedAt: new Date().toISOString(),
  }
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(tempPath, JSON.stringify(nextData, null, 2), 'utf8')
  await fs.promises.rename(tempPath, filePath)
  return true
}

function queueWriteAppData(data) {
  saveQueue = saveQueue.then(() => writeAppData(data), () => writeAppData(data))
  return saveQueue
}

async function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 930,
    minWidth: 1180,
    minHeight: 760,
    title: 'CrewFlow',
    backgroundColor: '#080d18',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(() => {
  ipcMain.handle('project-folder:select', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择项目文件夹',
      properties: ['openDirectory', 'createDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) return null

    return result.filePaths[0]
  })

  ipcMain.handle('project-folder:open', async (_event, folderPath) => {
    if (!folderPath || typeof folderPath !== 'string') return false

    const error = await shell.openPath(folderPath)
    return error === ''
  })

  ipcMain.handle('project-file:select', async (_event, title = '选择文件') => {
    const result = await dialog.showOpenDialog({
      title,
      properties: ['openFile'],
      filters: [
        { name: '常用文件', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'numbers'] },
        { name: '所有文件', extensions: ['*'] },
      ],
    })

    if (result.canceled || result.filePaths.length === 0) return null

    return result.filePaths[0]
  })

  ipcMain.handle('project-file:open', async (_event, filePath) => {
    if (!filePath || typeof filePath !== 'string') return false

    const error = await shell.openPath(filePath)
    return error === ''
  })

  ipcMain.handle('app-data:load', async () => {
    return readAppData()
  })

  ipcMain.handle('app-data:save', async (_event, data) => {
    return queueWriteAppData(data)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

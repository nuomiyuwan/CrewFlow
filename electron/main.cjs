const { app, BrowserWindow, clipboard, dialog, ipcMain, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')

const isDev = !app.isPackaged
const isTeamServerMode = process.argv.includes('--team-server')
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

function serverModuleUrl(fileName) {
  return pathToFileURL(path.join(__dirname, '../server', fileName)).href
}

async function startTeamServerMode() {
  process.env.CREWFLOW_HOST = process.env.CREWFLOW_HOST || '0.0.0.0'
  const { startCrewFlowServer } = await import(serverModuleUrl('crewflow-server.mjs'))
  startCrewFlowServer()
}

async function fetchLocalTeamHealth() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1200)

  try {
    const response = await fetch(`http://127.0.0.1:${process.env.CREWFLOW_PORT || '8787'}/health`, {
      signal: controller.signal,
    })
    if (!response.ok) return null
    return response.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function getTeamServiceInfo(message = '') {
  const { defaultServerDataDir } = await import(serverModuleUrl('crewflow-server.mjs'))
  const { localTeamServerCandidates, readOrCreateAccessKey, serviceAccessKeyPath } = await import(serverModuleUrl('service-manager.mjs'))
  const accessKey = await readOrCreateAccessKey()
  const urlCandidates = localTeamServerCandidates()
  const urls = urlCandidates.map((candidate) => candidate.url)
  const health = await fetchLocalTeamHealth()
  const running = Boolean(health?.ok)
  const singleDataFile = appDataPath()
  const teamDataDirectory = defaultServerDataDir()
  const teamDataFile = health?.dataFile || path.join(teamDataDirectory, 'crewflow-team-data.json')
  const accessKeyFile = serviceAccessKeyPath()

  return {
    supported: process.platform === 'darwin' || process.platform === 'win32',
    platform: process.platform,
    running,
    localUrl: `http://127.0.0.1:${process.env.CREWFLOW_PORT || '8787'}`,
    connectionUrl: urls[0],
    urls,
    urlCandidates,
    accessKey,
    dataFile: health?.dataFile,
    singleDataFile,
    singleDataDirectory: path.dirname(singleDataFile),
    teamDataFile,
    teamDataDirectory: path.dirname(teamDataFile),
    accessKeyFile,
    accessKeyDirectory: path.dirname(accessKeyFile),
    updatedAt: health?.updatedAt,
    message: message || (running ? '团队服务正在运行' : '团队服务未运行'),
  }
}

async function manageTeamService(action) {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return getTeamServiceInfo('当前系统暂不支持一键安装团队服务')
  }

  const { manageCrewFlowService, readOrCreateAccessKey } = await import(serverModuleUrl('service-manager.mjs'))
  await manageCrewFlowService(action, {
    appExecutablePath: app.isPackaged ? process.execPath : undefined,
    accessKey: await readOrCreateAccessKey(),
  })
  return getTeamServiceInfo(action === 'stop' || action === 'uninstall' ? '团队服务已停止' : '团队服务已开启')
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

if (isTeamServerMode) {
  startTeamServerMode().catch((error) => {
    console.error(error)
    app.quit()
  })
} else {
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

    ipcMain.handle('team-service:info', async () => {
      return getTeamServiceInfo()
    })

    ipcMain.handle('team-service:install', async () => {
      return manageTeamService('install')
    })

    ipcMain.handle('team-service:restart', async () => {
      return manageTeamService('restart')
    })

    ipcMain.handle('team-service:stop', async () => {
      return manageTeamService('stop')
    })

    ipcMain.handle('clipboard:write-text', async (_event, value) => {
      if (typeof value !== 'string') return false
      clipboard.writeText(value)
      return true
    })

    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('window-all-closed', () => {
  if (!isTeamServerMode && process.platform !== 'darwin') {
    app.quit()
  }
})

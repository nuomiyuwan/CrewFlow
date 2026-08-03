const { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell } = require('electron')
const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const {
  DEFAULT_ASSISTANT_SETTINGS,
  normalizeAssistantSettings,
  requestAssistant,
  testAssistantProvider,
} = require('./assistant-service.cjs')

const isDev = !app.isPackaged
const isTeamServerMode = process.argv.includes('--team-server')
let saveQueue = Promise.resolve()

app.setName('CrewFlow')
app.setPath('userData', path.join(app.getPath('appData'), 'CrewFlow'))

function appDataPath() {
  return path.join(app.getPath('userData'), 'crewflow-data.json')
}

function assistantSettingsPath() {
  return path.join(app.getPath('userData'), 'assistant-settings.json')
}

function cleanAssistantProfileText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeStoredAssistantProfile(value) {
  if (!value || typeof value !== 'object') return null
  const id = cleanAssistantProfileText(value.id, 120)
  const onlineBaseUrl = cleanAssistantProfileText(value.onlineBaseUrl, 500)
  const onlineModel = cleanAssistantProfileText(value.onlineModel, 160)
  if (!id || !onlineBaseUrl || !onlineModel) return null
  return {
    id,
    onlineBaseUrl,
    onlineModel,
    encryptedApiKey: cleanAssistantProfileText(value.encryptedApiKey, 12000),
    updatedAt: cleanAssistantProfileText(value.updatedAt, 40),
  }
}

function normalizeStoredAssistantProfiles(value) {
  if (!Array.isArray(value)) return []
  const seenIds = new Set()
  return value
    .map(normalizeStoredAssistantProfile)
    .filter((profile) => {
      if (!profile || seenIds.has(profile.id)) return false
      seenIds.add(profile.id)
      return true
    })
    .slice(0, 20)
}

async function readAssistantSettingsFile() {
  try {
    const data = JSON.parse(await fs.promises.readFile(assistantSettingsPath(), 'utf8'))
    return {
      ...normalizeAssistantSettings(data),
      encryptedApiKey: typeof data.encryptedApiKey === 'string' ? data.encryptedApiKey : '',
      onlineProfiles: normalizeStoredAssistantProfiles(data.onlineProfiles),
    }
  } catch {
    return { ...DEFAULT_ASSISTANT_SETTINGS, encryptedApiKey: '', onlineProfiles: [] }
  }
}

function decryptAssistantApiKey(encryptedApiKey) {
  if (!encryptedApiKey || !safeStorage.isEncryptionAvailable()) return ''
  try {
    return safeStorage.decryptString(Buffer.from(encryptedApiKey, 'base64'))
  } catch {
    return ''
  }
}

function assistantApiKeyForSavedSettings(saved) {
  if (saved.activeOnlineProfileId) {
    const profile = saved.onlineProfiles.find((item) => item.id === saved.activeOnlineProfileId)
    if (profile) return decryptAssistantApiKey(profile.encryptedApiKey)
  }
  return decryptAssistantApiKey(saved.encryptedApiKey)
}

function publicAssistantOnlineProfile(profile) {
  return {
    id: profile.id,
    onlineBaseUrl: profile.onlineBaseUrl,
    onlineModel: profile.onlineModel,
    hasApiKey: Boolean(decryptAssistantApiKey(profile.encryptedApiKey)),
  }
}

async function loadAssistantSettings() {
  const saved = await readAssistantSettingsFile()
  const settings = normalizeAssistantSettings(saved)
  return {
    ...settings,
    onlineProfiles: saved.onlineProfiles.map(publicAssistantOnlineProfile),
    hasApiKey: Boolean(assistantApiKeyForSavedSettings(saved)),
    secureStorageAvailable: safeStorage.isEncryptionAvailable(),
  }
}

async function writeAssistantSettingsFile(settings, encryptedApiKey, onlineProfiles) {
  const filePath = assistantSettingsPath()
  const tempPath = `${filePath}.tmp`
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
  await fs.promises.writeFile(
    tempPath,
    JSON.stringify({ ...settings, encryptedApiKey, onlineProfiles }, null, 2),
    'utf8',
  )
  await fs.promises.rename(tempPath, filePath)
}

async function saveAssistantSettings(payload = {}) {
  const current = await readAssistantSettingsFile()
  let settings = normalizeAssistantSettings(payload.settings)
  let onlineProfiles = [...current.onlineProfiles]
  let selectedProfileIndex = onlineProfiles.findIndex((item) => item.id === settings.activeOnlineProfileId)
  let encryptedApiKey =
    selectedProfileIndex >= 0
      ? onlineProfiles[selectedProfileIndex].encryptedApiKey
      : onlineProfiles.length === 0
        ? current.encryptedApiKey
        : ''
  const apiKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''

  if (payload.clearApiKey === true) {
    encryptedApiKey = ''
  } else if (apiKey) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error('当前系统安全存储不可用，API Key 未保存')
    }
    encryptedApiKey = safeStorage.encryptString(apiKey).toString('base64')
  }

  if (selectedProfileIndex >= 0 && (payload.clearApiKey === true || apiKey)) {
    onlineProfiles[selectedProfileIndex] = {
      ...onlineProfiles[selectedProfileIndex],
      encryptedApiKey,
      updatedAt: new Date().toISOString(),
    }
  }

  if (payload.saveOnlineProfile === true) {
    if (settings.mode !== 'online' || !settings.onlineBaseUrl || !settings.onlineModel) {
      throw new Error('请先填写在线模型地址和模型名称')
    }
    if (!encryptedApiKey) throw new Error('请先填写并测试 API Key')

    if (selectedProfileIndex < 0) {
      selectedProfileIndex = onlineProfiles.findIndex(
        (item) => item.onlineBaseUrl === settings.onlineBaseUrl && item.onlineModel === settings.onlineModel,
      )
    }
    const profileId =
      selectedProfileIndex >= 0
        ? onlineProfiles[selectedProfileIndex].id
        : `online-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const profile = {
      id: profileId,
      onlineBaseUrl: settings.onlineBaseUrl,
      onlineModel: settings.onlineModel,
      encryptedApiKey,
      updatedAt: new Date().toISOString(),
    }
    if (selectedProfileIndex >= 0) onlineProfiles[selectedProfileIndex] = profile
    else onlineProfiles = [profile, ...onlineProfiles].slice(0, 20)
    settings = { ...settings, activeOnlineProfileId: profileId }
  }

  await writeAssistantSettingsFile(settings, encryptedApiKey, onlineProfiles)
  return loadAssistantSettings()
}

async function assistantApiKeyForPayload(payload = {}) {
  const temporaryKey = typeof payload.apiKey === 'string' ? payload.apiKey.trim() : ''
  if (temporaryKey) return temporaryKey
  const saved = await readAssistantSettingsFile()
  const requestedProfileId = normalizeAssistantSettings(payload.settings).activeOnlineProfileId
  if (requestedProfileId) {
    const profile = saved.onlineProfiles.find((item) => item.id === requestedProfileId)
    return profile ? decryptAssistantApiKey(profile.encryptedApiKey) : ''
  }
  if (saved.onlineProfiles.length > 0) return ''
  return assistantApiKeyForSavedSettings(saved)
}

async function deleteAssistantOnlineProfile(profileId) {
  const cleanProfileId = cleanAssistantProfileText(profileId, 120)
  const current = await readAssistantSettingsFile()
  const onlineProfiles = current.onlineProfiles.filter((item) => item.id !== cleanProfileId)
  let settings = normalizeAssistantSettings(current)
  let encryptedApiKey = current.encryptedApiKey
  if (settings.activeOnlineProfileId === cleanProfileId) {
    settings = { ...settings, activeOnlineProfileId: '' }
    encryptedApiKey = ''
  }
  await writeAssistantSettingsFile(settings, encryptedApiKey, onlineProfiles)
  return loadAssistantSettings()
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
  const teamDataFile = health?.dataFile || path.join(teamDataDirectory, 'crewflow-team.db')
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
    legacyDataFile: health?.legacyDataFile || path.join(teamDataDirectory, 'crewflow-team-data.json'),
    backupDirectory: health?.backupDirectory || path.join(teamDataDirectory, 'backups'),
    migrationBackup: health?.migrationBackup,
    storageEngine: health?.storageEngine,
    schemaVersion: health?.schemaVersion,
    incrementalSync: health?.incrementalSync,
    migrationError: health?.migrationError,
    accessKeyFile,
    accessKeyDirectory: path.dirname(accessKeyFile),
    updatedAt: health?.updatedAt,
    message: health?.migrationError
      ? `SQLite 迁移未完成，已继续使用原 JSON 数据：${health.migrationError}`
      : message || (running ? '团队服务正在运行' : '团队服务未运行'),
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

    ipcMain.handle('assistant-settings:load', async () => {
      return loadAssistantSettings()
    })

    ipcMain.handle('assistant-settings:save', async (_event, payload) => {
      return saveAssistantSettings(payload)
    })

    ipcMain.handle('assistant-profile:delete', async (_event, profileId) => {
      return deleteAssistantOnlineProfile(profileId)
    })

    ipcMain.handle('assistant-provider:test', async (_event, payload = {}) => {
      const settings = normalizeAssistantSettings(payload.settings)
      return testAssistantProvider({
        settings,
        apiKey: await assistantApiKeyForPayload(payload),
      })
    })

    ipcMain.handle('assistant:request', async (_event, payload = {}) => {
      const saved = await readAssistantSettingsFile()
      const settings = normalizeAssistantSettings(saved)
      return requestAssistant({
        settings,
        apiKey: assistantApiKeyForSavedSettings(saved),
        messages: Array.isArray(payload.messages) ? payload.messages : [],
        context: payload.context && typeof payload.context === 'object' ? payload.context : {},
        task:
          payload.task === 'assistant_route'
            ? 'assistant_route'
            : payload.task === 'calendar_extract'
              ? 'calendar_extract'
              : payload.task === 'operation_extract'
                ? 'operation_extract'
                : 'chat',
      })
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

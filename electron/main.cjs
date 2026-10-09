const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, safeStorage, shell, Tray } = require('electron')
const { autoUpdater } = require('electron-updater')
const { spawn } = require('child_process')
const { createHash } = require('crypto')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { pathToFileURL } = require('url')
const {
  DEFAULT_ASSISTANT_SETTINGS,
  normalizeAssistantSettings,
  requestAssistant,
  testAssistantProvider,
} = require('./assistant-service.cjs')
const {
  cleanupCompletedMacUpdateDownloads,
  cleanupCompletedWindowsUpdateDownloads,
  compareReleaseVersions,
  releaseVersionParts,
} = require('./update-cleanup.cjs')
const {
  fetchLatestCrewFlowRelease,
  releaseFeedUrl,
  validateCrewFlowReleaseAssetUrl,
} = require('./update-source.cjs')
const {
  clearLibraryNetworkMountCache,
  identifyLibraryNetworkPath,
  libraryNetworkLoginTarget,
  macPathExists,
  parseLibraryNetworkPath,
  parseUncPath,
  resolveLibraryNetworkPath,
  windowsNetworkPathExists,
} = require('./library-network-path.cjs')
const { createUtilityToolsService } = require('./utility-tools.cjs')
const { createProjectWorkbookBuffer } = require('./project-export.cjs')
const { createQuoteWorkbookBuffer } = require('./quote-export.cjs')
const { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, SPECIAL_AUDIO_EXTENSIONS } = require('./audio/formats.cjs')

const isDev = !app.isPackaged
const isTeamServerMode = process.argv.includes('--team-server')
const isWindowsBackgroundLaunch = process.platform === 'win32' && process.argv.includes('--background')
let saveQueue = Promise.resolve()
let mainWindow = null
let showMainWindowWhenReady = false
let windowsTray = null
let windowsHostedTeamServer = null
let windowsTeamServiceEnabled = false
let windowsTeamServiceOperation = Promise.resolve()
let appQuitRequested = false
let appQuitCleanupRunning = false
let windowsUpdaterConfigured = false
let windowsUpdateDownloaded = false
let windowsUpdaterSuppressErrors = false
let windowsUpdateSource = 'gitcode'
let downloadedMacUpdatePath = ''
let downloadedWindowsUpdatePath = ''
let appUpdateInstallPending = false
let localLibraryFileStorePromise = null
let utilityToolsService = null
const libraryPreviewWindows = new Map()
const libraryNetworkConnectionPromises = new Map()
const libraryPathProbePromises = new Map()
let appUpdateState = {
  status: 'idle',
  percent: 0,
  transferred: 0,
  total: 0,
  version: '',
  fileName: '',
  message: '',
  canAutoInstall: process.platform === 'win32',
}

app.setName('CrewFlow')
app.setPath('userData', path.join(app.getPath('appData'), 'CrewFlow'))

const hasPrimaryInstanceLock = isTeamServerMode || process.platform !== 'win32' || app.requestSingleInstanceLock()

function showPrimaryWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    showMainWindowWhenReady = true
    return
  }

  if (mainWindow.isMinimized()) mainWindow.restore()
  if (!mainWindow.isVisible()) mainWindow.show()
  mainWindow.focus()
}

function ensureWindowsTray() {
  if (process.platform !== 'win32' || windowsTray || !app.isReady()) return windowsTray
  const trayIcon = nativeImage.createFromPath(path.join(__dirname, '../dist/app-icon.png')).resize({ width: 20, height: 20 })
  windowsTray = new Tray(trayIcon)
  windowsTray.setToolTip('CrewFlow 团队服务')
  windowsTray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开 CrewFlow', click: showPrimaryWindow },
    { type: 'separator' },
    {
      label: '退出 CrewFlow',
      click: () => {
        appQuitRequested = true
        app.quit()
      },
    },
  ]))
  windowsTray.on('double-click', showPrimaryWindow)
  return windowsTray
}

function destroyWindowsTray() {
  if (!windowsTray) return
  windowsTray.destroy()
  windowsTray = null
}

function setWindowsTeamLoginItem(enabled) {
  if (process.platform !== 'win32' || !app.isPackaged) return
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: ['--background'],
    })
  } catch (error) {
    console.error('CrewFlow login item update failed:', error)
  }
}

if (hasPrimaryInstanceLock && process.platform === 'win32' && !isTeamServerMode) {
  app.on('second-instance', showPrimaryWindow)
}

function appDataPath() {
  return path.join(app.getPath('userData'), 'crewflow-data.json')
}

function assistantSettingsPath() {
  return path.join(app.getPath('userData'), 'assistant-settings.json')
}

function libraryFilesPath() {
  return path.join(app.getPath('userData'), 'library-files')
}

function libraryOpenCachePath() {
  return path.join(app.getPath('temp'), 'CrewFlow Library')
}

function getUtilityToolsService() {
  if (!utilityToolsService) {
    utilityToolsService = createUtilityToolsService({
      platform: process.platform,
      arch: process.arch,
      userDataPath: app.getPath('userData'),
      tempPath: app.getPath('temp'),
      resourcesPath: process.resourcesPath,
    })
  }
  return utilityToolsService
}

function escapeLibraryPreviewHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function updateRecoveryMarkerPath() {
  return path.join(app.getPath('userData'), 'update-team-service-recovery.json')
}

function updateDownloadCleanupMarkerPath() {
  return path.join(app.getPath('userData'), 'update-download-cleanup.json')
}

function macUpdateDownloadsDirectory() {
  return path.join(app.getPath('userData'), 'updates')
}

function windowsUpdaterPendingDirectory() {
  const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local')
  return path.join(localAppData, 'crewflow-updater', 'pending')
}

function publishAppUpdateState(patch = {}) {
  appUpdateState = { ...appUpdateState, ...patch }
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) window.webContents.send('app-update:state-changed', appUpdateState)
  })
  return appUpdateState
}

function cleanUpdateFileName(value) {
  return path.basename(typeof value === 'string' ? value : '').replace(/[^a-zA-Z0-9._-]/g, '-')
}

function updateSourceLabel(source) {
  return source === 'gitcode' ? 'GitCode 国内源' : 'GitHub 备用源'
}

function validateUpdateDownloadUrl(value, expectedFileName) {
  const validated = validateCrewFlowReleaseAssetUrl(value)
  let urlFileName = ''
  try {
    urlFileName = cleanUpdateFileName(decodeURIComponent(path.basename(new URL(validated.url).pathname)))
  } catch {
    throw new Error('更新文件地址无效')
  }
  if (!urlFileName || urlFileName !== expectedFileName) throw new Error('更新文件名称与地址不一致')
  return validated
}

function validateCrewFlowReleaseAsset(payload = {}, filePattern = /\.(?:dmg|exe)$/i) {
  const fileName = cleanUpdateFileName(payload.name)
  if (!fileName || !filePattern.test(fileName)) throw new Error('更新文件名称无效')
  const primary = validateUpdateDownloadUrl(payload.url, fileName)
  const fallback = payload.fallbackUrl ? validateUpdateDownloadUrl(payload.fallbackUrl, fileName) : null

  return {
    fileName,
    url: primary.url,
    source: primary.source,
    fallbackUrl: fallback && fallback.url !== primary.url ? fallback.url : '',
    fallbackSource: fallback?.source || '',
    version: typeof payload.version === 'string' ? payload.version.trim() : '',
    digest: typeof payload.digest === 'string' ? payload.digest.trim().toLowerCase() : '',
  }
}

async function fetchDownloadResponse(url, timeoutMs = 12000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { redirect: 'follow', signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function downloadWindowsUpdateDirect(asset, candidate) {
  const pendingDirectory = windowsUpdaterPendingDirectory()
  const targetPath = path.join(pendingDirectory, asset.fileName)
  const temporaryPath = `${targetPath}.${process.pid}.download`
  const expectedDigest = asset.digest.startsWith('sha256:') ? asset.digest.slice('sha256:'.length) : ''
  let fileHandle = null

  if (!expectedDigest) throw new Error('Windows 更新缺少校验信息')

  try {
    await fs.promises.mkdir(pendingDirectory, { recursive: true })
    await fs.promises.rm(temporaryPath, { force: true })
    publishAppUpdateState({
      status: 'downloading',
      percent: 0,
      transferred: 0,
      total: 0,
      version: asset.version,
      fileName: asset.fileName,
      message: `正在从${updateSourceLabel(candidate.source)}下载 Windows 更新`,
      canAutoInstall: true,
    })

    const response = await fetchDownloadResponse(candidate.url)
    if (!response.ok || !response.body) throw new Error(`更新下载失败：${response.status}`)

    const total = Number(response.headers.get('content-length')) || 0
    const hash = createHash('sha256')
    let transferred = 0
    fileHandle = await fs.promises.open(temporaryPath, 'w')

    for await (const value of response.body) {
      const chunk = Buffer.from(value)
      await fileHandle.write(chunk)
      hash.update(chunk)
      transferred += chunk.length
      publishAppUpdateState({
        status: 'downloading',
        percent: total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0,
        transferred,
        total,
      })
    }

    await fileHandle.close()
    fileHandle = null

    if (hash.digest('hex') !== expectedDigest) throw new Error('更新文件校验失败，请重新下载')

    await fs.promises.rm(targetPath, { force: true })
    await fs.promises.rename(temporaryPath, targetPath)
    downloadedWindowsUpdatePath = targetPath
    windowsUpdateDownloaded = true
    return publishAppUpdateState({
      status: 'downloaded',
      percent: 100,
      transferred,
      total: total || transferred,
      message: `更新已从${updateSourceLabel(candidate.source)}下载，可以安装并重启`,
      canAutoInstall: true,
    })
  } catch (error) {
    if (fileHandle) await fileHandle.close().catch(() => {})
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {})
    throw error
  }
}

async function downloadMacUpdate(payload = {}) {
  let asset = null
  let temporaryPath = ''
  let fileHandle = null

  try {
    asset = validateCrewFlowReleaseAsset(payload, /\.dmg$/i)
    const updatesDirectory = macUpdateDownloadsDirectory()
    const targetPath = path.join(updatesDirectory, asset.fileName)
    temporaryPath = `${targetPath}.${process.pid}.download`
    await fs.promises.mkdir(updatesDirectory, { recursive: true })
    const candidates = [
      { url: asset.url, source: asset.source },
      ...(asset.fallbackUrl ? [{ url: asset.fallbackUrl, source: asset.fallbackSource }] : []),
    ]
    let lastError = null

    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      try {
        publishAppUpdateState({
          status: 'downloading',
          percent: 0,
          transferred: 0,
          total: 0,
          version: asset.version,
          fileName: asset.fileName,
          message: `正在从${updateSourceLabel(candidate.source)}下载 macOS 安装包`,
          canAutoInstall: false,
        })

        await fs.promises.rm(temporaryPath, { force: true })
        const response = await fetchDownloadResponse(candidate.url)
        if (!response.ok || !response.body) throw new Error(`更新下载失败：${response.status}`)

        const total = Number(response.headers.get('content-length')) || 0
        const hash = createHash('sha256')
        let transferred = 0
        fileHandle = await fs.promises.open(temporaryPath, 'w')

        for await (const value of response.body) {
          const chunk = Buffer.from(value)
          await fileHandle.write(chunk)
          hash.update(chunk)
          transferred += chunk.length
          publishAppUpdateState({
            status: 'downloading',
            percent: total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0,
            transferred,
            total,
          })
        }

        await fileHandle.close()
        fileHandle = null

        const expectedDigest = asset.digest.startsWith('sha256:') ? asset.digest.slice('sha256:'.length) : ''
        const actualDigest = hash.digest('hex')
        if (expectedDigest && expectedDigest !== actualDigest) throw new Error('更新文件校验失败，请重新下载')

        await fs.promises.rm(targetPath, { force: true })
        await fs.promises.rename(temporaryPath, targetPath)
        downloadedMacUpdatePath = targetPath
        return publishAppUpdateState({
          status: 'downloaded',
          percent: 100,
          transferred,
          total: total || transferred,
          message: `安装包已从${updateSourceLabel(candidate.source)}下载，可以打开更新`,
          canAutoInstall: false,
        })
      } catch (error) {
        if (fileHandle) await fileHandle.close().catch(() => {})
        fileHandle = null
        await fs.promises.rm(temporaryPath, { force: true }).catch(() => {})
        lastError = error
        if (index < candidates.length - 1) {
          publishAppUpdateState({
            status: 'checking',
            percent: 0,
            transferred: 0,
            total: 0,
            message: '国内源暂时不可用，正在切换 GitHub 备用源',
            canAutoInstall: false,
          })
        }
      }
    }

    throw lastError || new Error('更新下载失败')
  } catch (error) {
    if (fileHandle) await fileHandle.close().catch(() => {})
    if (temporaryPath) await fs.promises.rm(temporaryPath, { force: true }).catch(() => {})
    return publishAppUpdateState({
      status: 'error',
      message: error instanceof Error ? error.message : '更新下载失败',
      canAutoInstall: false,
    })
  }
}

function configureWindowsUpdater() {
  if (windowsUpdaterConfigured || isDev || process.platform !== 'win32') return
  windowsUpdaterConfigured = true
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.allowPrerelease = false

  autoUpdater.on('checking-for-update', () => {
    publishAppUpdateState({
      status: 'checking',
      message: `正在连接${updateSourceLabel(windowsUpdateSource)}`,
      canAutoInstall: true,
    })
  })
  autoUpdater.on('update-available', (info) => {
    publishAppUpdateState({
      status: 'available',
      version: typeof info?.version === 'string' ? info.version : '',
      message: `${updateSourceLabel(windowsUpdateSource)}已找到新版本`,
      canAutoInstall: true,
    })
  })
  autoUpdater.on('update-not-available', () => {
    publishAppUpdateState({ status: 'up-to-date', message: '当前已经是最新版本', canAutoInstall: true })
  })
  autoUpdater.on('download-progress', (progress) => {
    publishAppUpdateState({
      status: 'downloading',
      percent: Math.max(0, Math.min(100, Math.round(progress.percent || 0))),
      transferred: progress.transferred || 0,
      total: progress.total || 0,
      message: `正在从${updateSourceLabel(windowsUpdateSource)}下载 Windows 更新`,
      canAutoInstall: true,
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    windowsUpdateDownloaded = true
    publishAppUpdateState({
      status: 'downloaded',
      percent: 100,
      version: typeof info?.version === 'string' ? info.version : appUpdateState.version,
      message: `更新已从${updateSourceLabel(windowsUpdateSource)}下载，可以安装并重启`,
      canAutoInstall: true,
    })
  })
  autoUpdater.on('error', (error) => {
    if (windowsUpdaterSuppressErrors) return
    publishAppUpdateState({
      status: 'error',
      message: error instanceof Error ? error.message : 'Windows 更新失败',
      canAutoInstall: true,
    })
  })
}

async function downloadWindowsUpdate(payload = {}) {
  configureWindowsUpdater()
  const asset = validateCrewFlowReleaseAsset(payload, /\.exe$/i)
  const expectedComparison = compareReleaseVersions(asset.version, app.getVersion())
  if (expectedComparison !== null && expectedComparison <= 0) {
    return publishAppUpdateState({ status: 'up-to-date', message: '当前已经是最新版本', canAutoInstall: true })
  }

  const candidates = [
    { url: asset.url, source: asset.source },
    ...(asset.fallbackUrl ? [{ url: asset.fallbackUrl, source: asset.fallbackSource }] : []),
  ]
  let lastError = null
  windowsUpdateDownloaded = false
  downloadedWindowsUpdatePath = ''
  windowsUpdaterSuppressErrors = true

  try {
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      windowsUpdateSource = candidate.source
      try {
        if (candidate.source === 'gitcode') {
          return await downloadWindowsUpdateDirect(asset, candidate)
        }

        autoUpdater.setFeedURL({ provider: 'generic', url: releaseFeedUrl(candidate.url) })
        const result = await autoUpdater.checkForUpdates()
        if (!result?.isUpdateAvailable) throw new Error(`${updateSourceLabel(candidate.source)}暂未提供该版本安装包`)
        await autoUpdater.downloadUpdate()
        return appUpdateState
      } catch (error) {
        lastError = error
        if (index < candidates.length - 1) {
          publishAppUpdateState({
            status: 'checking',
            percent: 0,
            transferred: 0,
            total: 0,
            message: '国内源暂时不可用，正在切换 GitHub 备用源',
            canAutoInstall: true,
          })
        }
      }
    }
  } finally {
    windowsUpdaterSuppressErrors = false
  }

  return publishAppUpdateState({
    status: 'error',
    message: lastError instanceof Error ? lastError.message : 'Windows 更新失败',
    canAutoInstall: true,
  })
}

async function downloadApplicationUpdate(payload = {}) {
  if (!app.isPackaged) {
    return publishAppUpdateState({ status: 'error', message: '开发模式不能安装正式更新' })
  }

  if (process.platform === 'darwin') return downloadMacUpdate(payload)
  if (process.platform !== 'win32') {
    return publishAppUpdateState({ status: 'error', message: '当前系统暂不支持应用内更新' })
  }

  try {
    return await downloadWindowsUpdate(payload)
  } catch (error) {
    return publishAppUpdateState({
      status: 'error',
      message: error instanceof Error ? error.message : 'Windows 更新失败',
      canAutoInstall: true,
    })
  }
}

async function checkApplicationUpdate() {
  return fetchLatestCrewFlowRelease({ platform: process.platform })
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

async function waitForPendingAppDataSaves() {
  while (true) {
    const pendingSave = saveQueue
    await pendingSave
    if (pendingSave === saveQueue) return
  }
}

function serverModuleUrl(fileName) {
  return pathToFileURL(path.join(__dirname, '../server', fileName)).href
}

async function localLibraryFileStore() {
  if (!localLibraryFileStorePromise) {
    localLibraryFileStorePromise = import(serverModuleUrl('library-file-store.mjs')).then(({ createLibraryFileStore }) =>
      createLibraryFileStore({ directory: libraryFilesPath() }),
    )
  }
  return localLibraryFileStorePromise
}

const libraryUploadExtensions = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt', 'md', 'rtf', 'json',
  'pages', 'numbers', 'key', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp',
])
const maxLibraryUploadBytes = 200 * 1024 * 1024
const libraryMimeTypes = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  rtf: 'application/rtf',
  json: 'application/json',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  m4v: 'video/x-m4v',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
}

function libraryFileExtension(filePath) {
  return path.extname(filePath).slice(1).toLowerCase()
}

function libraryMimeType(filePath) {
  return libraryMimeTypes[libraryFileExtension(filePath)] || 'application/octet-stream'
}

function cleanLibraryFileName(value) {
  return path.basename(typeof value === 'string' ? value.trim() : '').slice(0, 240)
}

function libraryTeamFileUrl(serverUrl, id) {
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(typeof id === 'string' ? id : '')) throw new Error('资料文件标识无效')
  const value = /^https?:\/\//i.test(serverUrl || '') ? serverUrl : `http://${serverUrl || ''}`
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('团队服务地址无效')
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/api/library-files/${id}`
  url.search = ''
  return url.toString()
}

function waitForLibraryNetwork(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay))
}

function openWindowsExplorer(targetPath, select = false) {
  return new Promise((resolve, reject) => {
    const child = spawn('explorer.exe', [select ? `/select,${targetPath}` : targetPath], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })
    child.once('error', reject)
    child.once('spawn', () => {
      child.unref()
      resolve(true)
    })
  })
}

async function libraryPathExists(filePath, timeout = 1_500) {
  if (!filePath || parseLibraryNetworkPath(filePath)) return false
  if (process.platform === 'darwin') return macPathExists(filePath, timeout)
  if (process.platform === 'win32' && parseUncPath(filePath)) return windowsNetworkPathExists(filePath, timeout)
  let access = libraryPathProbePromises.get(filePath)
  if (!access) {
    access = fs.promises.access(filePath).then(() => true, () => false).finally(() => {
      if (libraryPathProbePromises.get(filePath) === access) libraryPathProbePromises.delete(filePath)
    })
    libraryPathProbePromises.set(filePath, access)
  }
  let timer
  const expired = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), timeout)
  })
  return Promise.race([access, expired]).finally(() => clearTimeout(timer))
}

async function libraryNetworkPathFromPayload(payload = {}) {
  const stored = parseLibraryNetworkPath(payload.networkPath)
  if (stored) return stored.networkPath
  return identifyLibraryNetworkPath(typeof payload.path === 'string' ? payload.path : '')
}

async function resolvedLibrarySourcePath(payload = {}, connect = true) {
  const sourcePath = typeof payload.path === 'string' ? payload.path.trim() : ''
  const storedNetworkPath = parseLibraryNetworkPath(payload.networkPath)?.networkPath || ''
  if (!storedNetworkPath && await libraryPathExists(sourcePath)) return sourcePath

  const networkPath = storedNetworkPath || await libraryNetworkPathFromPayload(payload)
  if (!networkPath) return sourcePath

  let resolvedPath = await resolveLibraryNetworkPath(networkPath)
  if (await libraryPathExists(resolvedPath)) return resolvedPath
  if (!connect) return resolvedPath || sourcePath

  const loginTarget = libraryNetworkLoginTarget(networkPath)
  if (process.platform === 'darwin' && resolvedPath) {
    const relativeSegments = parseLibraryNetworkPath(networkPath)?.relativeSegments ?? []
    const mountRoot = relativeSegments.reduce((current) => path.dirname(current), resolvedPath)
    if (await libraryPathExists(mountRoot)) return resolvedPath
  }
  if (process.platform === 'win32' && await libraryPathExists(loginTarget)) return resolvedPath

  let connection = libraryNetworkConnectionPromises.get(networkPath)
  if (!connection) {
    connection = (async () => {
      libraryPathProbePromises.delete(resolvedPath)
      libraryPathProbePromises.delete(loginTarget)
      if (process.platform === 'darwin') await shell.openExternal(loginTarget)
      else if (process.platform === 'win32') {
        try {
          await openWindowsExplorer(loginTarget)
        } catch {
          const openError = await shell.openPath(loginTarget)
          if (openError) await shell.openExternal(pathToFileURL(loginTarget).href)
        }
      }

      const retryDelays = [350, 500, 750, 1_000, 1_500, 2_000, 3_000, 4_000, 5_000, 6_000, 8_000, 10_000]
      for (const delay of retryDelays) {
        await waitForLibraryNetwork(delay)
        clearLibraryNetworkMountCache()
        const currentPath = await resolveLibraryNetworkPath(networkPath, process.platform, true)
        if (await libraryPathExists(currentPath, 1_200)) return currentPath
      }
      throw new Error('当前电脑暂时无法连接这个 NAS，请在系统登录窗口完成认证后重试')
    })().finally(() => {
      libraryNetworkConnectionPromises.delete(networkPath)
    })
    libraryNetworkConnectionPromises.set(networkPath, connection)
  }
  return connection
}

async function selectedLibraryFile(purpose = 'reference') {
  const upload = purpose === 'upload'
  const folder = purpose === 'folder'
  const result = await dialog.showOpenDialog({
    title: upload ? '选择要上传的文稿' : folder ? '选择本地或共享文件夹' : '选择视频、本地或共享文件',
    properties: folder ? ['openDirectory'] : ['openFile'],
    filters: folder
      ? undefined
      : upload
      ? [
          { name: '文稿、表格和图片', extensions: [...libraryUploadExtensions] },
          { name: '所有文件', extensions: ['*'] },
        ]
      : [{ name: '所有文件', extensions: ['*'] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null

  const sourcePath = result.filePaths[0]
  const fileInfo = await fs.promises.stat(sourcePath)
  const networkPath = upload ? '' : await identifyLibraryNetworkPath(sourcePath)
  if (folder) {
    if (!fileInfo.isDirectory()) throw new Error('请选择一个文件夹')
    return {
      path: sourcePath,
      fileName: path.basename(sourcePath) || sourcePath,
      extension: '',
      mimeType: 'inode/directory',
      size: 0,
      uploadable: false,
      networkPath: networkPath || undefined,
    }
  }
  if (!fileInfo.isFile()) throw new Error('请选择一个文件')
  const extension = libraryFileExtension(sourcePath)
  return {
    path: sourcePath,
    fileName: path.basename(sourcePath),
    extension,
    mimeType: libraryMimeType(sourcePath),
    size: fileInfo.size,
    uploadable: libraryUploadExtensions.has(extension) && fileInfo.size <= maxLibraryUploadBytes,
    networkPath: networkPath || undefined,
  }
}

async function selectedUtilityFiles(options = {}) {
  const multiple = options.multiple === true
  const pdfOnly = options.pdfOnly === true
  const result = await dialog.showOpenDialog({
    title: typeof options.title === 'string' && options.title.trim() ? options.title.trim() : '选择要处理的文件',
    properties: multiple ? ['openFile', 'multiSelections'] : ['openFile'],
    filters: pdfOnly
      ? [{ name: 'PDF 文件', extensions: ['pdf'] }]
      : [
          { name: '支持的文件', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif', ...AUDIO_EXTENSIONS, ...SPECIAL_AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS] },
          { name: '视频', extensions: VIDEO_EXTENSIONS },
          { name: '音频与专属音乐', extensions: [...AUDIO_EXTENSIONS, ...SPECIAL_AUDIO_EXTENSIONS] },
          { name: '所有文件', extensions: ['*'] },
        ],
  })
  if (result.canceled || result.filePaths.length === 0) return []

  const files = []
  for (const filePath of result.filePaths) {
    const fileInfo = await fs.promises.stat(filePath)
    if (!fileInfo.isFile()) continue
    files.push({
      path: filePath,
      name: path.basename(filePath),
      extension: path.extname(filePath).slice(1).toLowerCase(),
      size: fileInfo.size,
    })
  }
  return files
}

async function readLibrarySource(payload = {}) {
  if (payload.sourceType === 'path') {
    const sourcePath = await resolvedLibrarySourcePath(payload)
    const fileInfo = await fs.promises.stat(sourcePath)
    if (!fileInfo.isFile()) throw new Error('资料路径不是文件')
    if (fileInfo.size > maxLibraryUploadBytes) throw new Error('这个文件超过 200MB，请使用系统应用打开')
    return {
      data: await fs.promises.readFile(sourcePath),
      metadata: {
        fileName: path.basename(sourcePath),
        mimeType: libraryMimeType(sourcePath),
        size: fileInfo.size,
      },
    }
  }

  if (payload.dataMode === 'team') {
    const response = await fetch(libraryTeamFileUrl(payload.serverUrl, payload.id), {
      headers: payload.accessKey ? { 'X-CrewFlow-Key': payload.accessKey } : {},
    })
    if (response.status === 404) throw new Error('资料文件不存在，或团队主机尚未更新资料库服务')
    if (!response.ok) throw new Error(`资料文件读取失败：${response.status}`)
    const data = Buffer.from(await response.arrayBuffer())
    if (data.byteLength > maxLibraryUploadBytes) throw new Error('资料文件超过 200MB，无法在软件内读取')
    return {
      data,
      metadata: {
        fileName: cleanLibraryFileName(payload.fileName) || '资料文件',
        mimeType: response.headers.get('content-type') || payload.mimeType || 'application/octet-stream',
        size: data.byteLength,
      },
    }
  }

  const store = await localLibraryFileStore()
  return store.read(payload.id)
}

async function importLibraryFile(payload = {}) {
  const sourcePath = typeof payload.sourcePath === 'string' ? payload.sourcePath : ''
  const fileInfo = await fs.promises.stat(sourcePath)
  if (!fileInfo.isFile()) throw new Error('请选择一个文件')
  const extension = libraryFileExtension(sourcePath)
  if (!libraryUploadExtensions.has(extension)) throw new Error('视频和大文件请使用“视频/共享路径”或“在线链接”')
  if (fileInfo.size > maxLibraryUploadBytes) throw new Error('上传文件不能超过 200MB')

  const fileName = cleanLibraryFileName(payload.fileName) || path.basename(sourcePath)
  const mimeType = typeof payload.mimeType === 'string' && payload.mimeType ? payload.mimeType : libraryMimeType(sourcePath)
  const data = await fs.promises.readFile(sourcePath)

  if (payload.dataMode === 'team') {
    const response = await fetch(libraryTeamFileUrl(payload.serverUrl, payload.id), {
      method: 'PUT',
      headers: {
        ...(payload.accessKey ? { 'X-CrewFlow-Key': payload.accessKey } : {}),
        'Content-Type': 'application/octet-stream',
        'X-CrewFlow-File-Name': encodeURIComponent(fileName),
        'X-CrewFlow-Mime-Type': encodeURIComponent(mimeType),
      },
      body: data,
    })
    if (response.status === 404) throw new Error('团队主机尚未支持资料上传，请更新并重启主机服务')
    if (!response.ok) {
      const error = await response.json().catch(() => null)
      throw new Error(error?.error || `资料上传失败：${response.status}`)
    }
    return response.json()
  }

  const store = await localLibraryFileStore()
  return store.write(payload.id, data, { fileName, mimeType })
}

async function deleteLibraryFile(payload = {}) {
  if (payload.dataMode === 'team') {
    const response = await fetch(libraryTeamFileUrl(payload.serverUrl, payload.id), {
      method: 'DELETE',
      headers: payload.accessKey ? { 'X-CrewFlow-Key': payload.accessKey } : {},
    })
    if (response.status !== 404 && !response.ok) throw new Error(`资料文件删除失败：${response.status}`)
    return true
  }
  const store = await localLibraryFileStore()
  return store.remove(payload.id)
}

async function cacheLibraryBytes(payload = {}) {
  const { data, metadata } = await readLibrarySource(payload)
  const id = /^[A-Za-z0-9_-]{1,120}$/.test(payload.id || '') ? payload.id : `item-${Date.now()}`
  const directory = path.join(libraryOpenCachePath(), id)
  const targetPath = path.join(directory, cleanLibraryFileName(payload.fileName) || metadata.fileName || '资料文件')
  await fs.promises.mkdir(directory, { recursive: true })
  await fs.promises.writeFile(targetPath, data)
  return targetPath
}

async function openLibraryBytes(payload = {}) {
  const targetPath = await cacheLibraryBytes(payload)
  const error = await shell.openPath(targetPath)
  if (error) throw new Error(error)
  return true
}

async function revealLibraryResource(payload = {}) {
  if (payload.sourceType === 'url') {
    const url = new URL(typeof payload.url === 'string' ? payload.url : '')
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只支持 http 或 https 链接')
    await shell.openExternal(url.toString())
    return true
  }

  const targetPath = payload.sourceType === 'path'
    ? await resolvedLibrarySourcePath(payload)
    : await cacheLibraryBytes(payload)
  await fs.promises.stat(targetPath)
  if (process.platform === 'win32' && parseUncPath(targetPath)) await openWindowsExplorer(targetPath, true)
  else shell.showItemInFolder(targetPath)
  return true
}

async function previewLibraryResource(payload = {}) {
  let targetUrl = ''
  let sourcePath = ''
  if (payload.sourceType === 'url') {
    const url = new URL(typeof payload.url === 'string' ? payload.url : '')
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('只支持 http 或 https 链接')
    targetUrl = url.toString()
  } else {
    sourcePath = await resolvedLibrarySourcePath(payload)
    let fileInfo
    try {
      fileInfo = await fs.promises.stat(sourcePath)
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'EACCES') {
        throw new Error(
          payload.dataMode === 'team'
            ? '当前电脑无法访问这个文件。团队模式只同步路径记录，请使用所有成员都能访问的 NAS 或共享盘路径。'
            : '当前电脑无法访问这个文件，请确认文件没有被移动或删除。',
        )
      }
      throw error
    }
    if (!fileInfo.isFile()) throw new Error('资料路径不是文件')
    targetUrl = pathToFileURL(sourcePath).href
  }

  const previewKey = `${payload.dataMode === 'team' ? 'team' : 'single'}:${
    typeof payload.id === 'string' && payload.id.trim() ? payload.id.trim() : targetUrl
  }`
  const existingWindow = libraryPreviewWindows.get(previewKey)
  if (existingWindow && !existingWindow.isDestroyed()) {
    if (existingWindow.isMinimized()) existingWindow.restore()
    if (!existingWindow.isVisible()) existingWindow.show()
    existingWindow.focus()
    return true
  }
  libraryPreviewWindows.delete(previewKey)

  const previewWindow = new BrowserWindow({
    width: 1080,
    height: 720,
    minWidth: 720,
    minHeight: 500,
    title: typeof payload.title === 'string' && payload.title ? payload.title : '资料预览',
    backgroundColor: '#111827',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  libraryPreviewWindows.set(previewKey, previewWindow)
  previewWindow.on('closed', () => {
    if (libraryPreviewWindows.get(previewKey) === previewWindow) libraryPreviewWindows.delete(previewKey)
  })
  previewWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (sourcePath && url === 'https://crewflow.local/open-system') {
      shell.openPath(sourcePath).catch(() => {})
      return { action: 'deny' }
    }
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (sourcePath && /^(video|audio)\//i.test(libraryMimeType(sourcePath))) {
    const mediaType = libraryMimeType(sourcePath).startsWith('audio/') ? 'audio' : 'video'
    const previewDirectory = path.join(libraryOpenCachePath(), 'media-preview')
    const previewPagePath = path.join(
      previewDirectory,
      `${createHash('sha1').update(sourcePath).digest('hex').slice(0, 20)}.html`,
    )
    const title = escapeLibraryPreviewHtml(payload.title || path.basename(sourcePath))
    const fileName = escapeLibraryPreviewHtml(path.basename(sourcePath))
    const mediaUrl = escapeLibraryPreviewHtml(targetUrl)
    const page = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; media-src file:">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; height: 100%; margin: 0; background: #080d18; color: #edf3fb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { display: grid; grid-template-rows: auto minmax(0, 1fr); }
    header { min-width: 0; padding: 16px 20px; border-bottom: 1px solid rgba(166, 191, 211, .2); background: #111927; }
    strong, small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    strong { font-size: 16px; }
    small { margin-top: 5px; color: rgba(210, 220, 233, .58); }
    main { min-height: 0; display: grid; place-items: center; padding: 18px; }
    .player { display: block; width: 100%; height: 100%; max-width: 100%; max-height: 100%; background: #000; outline: none; }
    audio.player { height: 56px; background: transparent; }
    .fallback { display: none; max-width: 520px; text-align: center; color: rgba(225, 234, 245, .72); }
    .fallback strong { color: #f4f7fb; }
    .fallback p { line-height: 1.7; }
    .fallback a { display: inline-flex; margin-top: 8px; padding: 10px 16px; border: 1px solid rgba(106, 220, 235, .45); border-radius: 7px; color: #7de2ee; text-decoration: none; }
    body.failed .player { display: none; }
    body.failed .fallback { display: block; }
  </style>
</head>
<body>
  <header><strong>${title}</strong><small>${fileName}</small></header>
  <main>
    <${mediaType} class="player" controls preload="metadata" src="${mediaUrl}" onerror="document.body.classList.add('failed')"></${mediaType}>
    <section class="fallback"><strong>软件内无法播放这个文件</strong><p>文件可能使用了当前播放器不支持的编码，可以改用系统播放器打开。</p><a href="https://crewflow.local/open-system" target="_blank">用系统播放器打开</a></section>
  </main>
</body>
</html>`
    await fs.promises.mkdir(previewDirectory, { recursive: true })
    await fs.promises.writeFile(previewPagePath, page, 'utf8')
    try {
      await previewWindow.loadFile(previewPagePath)
    } catch {
      if (!previewWindow.isDestroyed()) previewWindow.destroy()
      const error = await shell.openPath(sourcePath)
      if (error) throw new Error(`视频打开失败：${error}`)
    }
    return true
  }

  await previewWindow.loadURL(targetUrl)
  return true
}

async function startTeamServerMode() {
  process.env.CREWFLOW_HOST = process.env.CREWFLOW_HOST || '0.0.0.0'
  const { startCrewFlowServer } = await import(serverModuleUrl('crewflow-server.mjs'))
  startCrewFlowServer()
}

function queueWindowsTeamServiceOperation(operation) {
  const next = windowsTeamServiceOperation.then(operation, operation)
  windowsTeamServiceOperation = next.catch(() => {})
  return next
}

async function migrateLegacyWindowsTeamService(serviceManager, state) {
  if (state?.legacyCleanupComplete) return state
  await serviceManager.cleanupLegacyWindowsService()
  if (!(await waitForLocalTeamService(false, 4500))) {
    throw new Error('旧团队服务仍在运行，请重启电脑后再开启新版团队服务')
  }
  return serviceManager.writeServiceState({
    hostMode: 'app',
    legacyCleanupComplete: true,
  })
}

async function startWindowsHostedTeamService() {
  const serviceManager = await import(serverModuleUrl('service-manager.mjs'))
  const state = await serviceManager.readServiceState()
  await migrateLegacyWindowsTeamService(serviceManager, state)

  if (windowsHostedTeamServer?.server?.listening) {
    windowsTeamServiceEnabled = true
    await serviceManager.writeServiceState({ enabled: true, hostMode: 'app', legacyCleanupComplete: true })
    setWindowsTeamLoginItem(true)
    ensureWindowsTray()
    return true
  }

  const existingHealth = await fetchLocalTeamHealth()
  if (existingHealth?.ok) {
    throw new Error('本机已有独立团队服务仍在运行，请先停止后重试')
  }

  const [{ defaultServerDataDir, startCrewFlowServer }, accessKey] = await Promise.all([
    import(serverModuleUrl('crewflow-server.mjs')),
    serviceManager.readOrCreateAccessKey(),
  ])
  let instance = null

  try {
    await new Promise((resolve, reject) => {
      const handleStartupError = (error) => reject(error)
      instance = startCrewFlowServer({
        dataDir: defaultServerDataDir(),
        host: '0.0.0.0',
        port: Number(process.env.CREWFLOW_PORT || 8787),
        accessKey,
        handleProcessSignals: false,
        onReady: () => {
          instance.server.removeListener('error', handleStartupError)
          resolve()
        },
      })
      instance.server.once('error', handleStartupError)
    })
  } catch (error) {
    instance?.store?.close?.()
    throw error
  }

  windowsHostedTeamServer = instance
  instance.server.on('error', (error) => {
    console.error('CrewFlow hosted team service error:', error)
  })
  instance.server.once('close', () => {
    if (windowsHostedTeamServer !== instance) return
    windowsHostedTeamServer = null
    if (!windowsTeamServiceEnabled || appQuitRequested) return
    setTimeout(() => {
      if (!windowsTeamServiceEnabled || appQuitRequested) return
      queueWindowsTeamServiceOperation(() => startWindowsHostedTeamService()).catch((error) => {
        console.error('CrewFlow hosted team service restart failed:', error)
      })
    }, 1000)
  })

  try {
    await serviceManager.writeServiceRuntimeMetadata(
      {
        mode: 'app-hosted',
        executable: process.execPath,
      },
      { appVersion: app.getVersion(), platform: 'win32' },
    )
    await serviceManager.writeServiceState({ enabled: true, hostMode: 'app', legacyCleanupComplete: true })
    windowsTeamServiceEnabled = true
    setWindowsTeamLoginItem(true)
    ensureWindowsTray()
  } catch (error) {
    windowsHostedTeamServer = null
    windowsTeamServiceEnabled = false
    await closeWindowsHostedTeamServerInstance(instance)
    throw error
  }
  return true
}

async function closeWindowsHostedTeamServerInstance(instance) {
  if (!instance?.server) {
    instance?.store?.close?.()
    return
  }
  const server = instance.server
  await new Promise((resolve) => {
    let completed = false
    const finish = () => {
      if (completed) return
      completed = true
      clearTimeout(forceTimer)
      clearTimeout(finishTimer)
      resolve()
    }
    const forceTimer = setTimeout(() => server.closeAllConnections?.(), 5000)
    const finishTimer = setTimeout(finish, 6000)
    if (!server.listening) {
      finish()
      return
    }
    server.close(finish)
    server.closeIdleConnections?.()
  })
  instance.store?.close?.()
}

async function stopWindowsHostedTeamService({ preserveEnabled = false } = {}) {
  const serviceManager = await import(serverModuleUrl('service-manager.mjs'))
  const instance = windowsHostedTeamServer
  windowsHostedTeamServer = null

  if (instance?.server) {
    await closeWindowsHostedTeamServerInstance(instance)
  } else if (await fetchLocalTeamHealth()) {
    await serviceManager.cleanupLegacyWindowsService()
    if (!(await waitForLocalTeamService(false, 4500))) {
      throw new Error('旧团队服务仍在运行，请重启电脑后再开启新版团队服务')
    }
  }

  if (!preserveEnabled) {
    windowsTeamServiceEnabled = false
    await serviceManager.writeServiceState({ enabled: false, hostMode: 'app', legacyCleanupComplete: true })
    setWindowsTeamLoginItem(false)
    destroyWindowsTray()
  }
  return true
}

async function fetchLocalTeamHealth() {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1200)

  try {
    const response = await fetch(`http://127.0.0.1:${process.env.CREWFLOW_PORT || '8787'}/health`, {
      signal: controller.signal,
    })
    if (!response.ok) return null
    const health = await response.json()
    return health?.ok === true && health?.name === 'CrewFlow Server' ? health : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

async function getTeamServiceInfo(message = '') {
  const { defaultServerDataDir } = await import(serverModuleUrl('crewflow-server.mjs'))
  const { localTeamServerCandidates, localTeamStableUrl, readOrCreateAccessKey, readServiceRuntimeMetadata, serviceAccessKeyPath } = await import(
    serverModuleUrl('service-manager.mjs')
  )
  const accessKey = await readOrCreateAccessKey()
  const serviceRuntime = await readServiceRuntimeMetadata()
  const stableUrl = localTeamStableUrl()
  const stableCandidate = stableUrl
    ? {
        url: stableUrl,
        address: new URL(stableUrl).hostname,
        interfaceName: 'hostname',
        kind: '稳定电脑名称',
        priority: -1000,
      }
    : null
  const urlCandidates = [stableCandidate, ...localTeamServerCandidates()].filter(
    (candidate, index, candidates) => candidate && candidates.findIndex((item) => item?.url === candidate.url) === index,
  )
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
    deviceName: os.hostname(),
    running,
    localUrl: `http://127.0.0.1:${process.env.CREWFLOW_PORT || '8787'}`,
    stableUrl,
    connectionUrl: stableUrl || urls[0],
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
    serviceRuntime,
    updatedAt: health?.updatedAt,
    message: health?.migrationError
      ? `SQLite 迁移未完成，已继续使用原 JSON 数据：${health.migrationError}`
      : message || (running ? '团队服务正在运行' : '团队服务未运行'),
  }
}

async function manageTeamService(action, options = {}) {
  if (process.platform !== 'darwin' && process.platform !== 'win32') {
    return getTeamServiceInfo('当前系统暂不支持一键安装团队服务')
  }

  if (process.platform === 'win32') {
    return queueWindowsTeamServiceOperation(async () => {
      if (action === 'stop') {
        await stopWindowsHostedTeamService({ preserveEnabled: options.preserveEnabled === true })
      } else if (action === 'restart') {
        await stopWindowsHostedTeamService({ preserveEnabled: true })
        await startWindowsHostedTeamService()
      } else if (action === 'install') {
        if (windowsHostedTeamServer?.server?.listening) {
          await stopWindowsHostedTeamService({ preserveEnabled: true })
        }
        await startWindowsHostedTeamService()
      }
      return getTeamServiceInfo(action === 'stop' ? '团队服务已停止' : '团队服务已开启')
    })
  }

  const { manageCrewFlowService, readOrCreateAccessKey } = await import(serverModuleUrl('service-manager.mjs'))
  await manageCrewFlowService(action, {
    appExecutablePath: app.isPackaged ? process.execPath : undefined,
    appVersion: app.getVersion(),
    accessKey: await readOrCreateAccessKey(),
  })
  return getTeamServiceInfo(action === 'stop' || action === 'uninstall' ? '团队服务已停止' : '团队服务已开启')
}

async function writeTeamServiceRecoveryMarker(version = '') {
  const markerPath = updateRecoveryMarkerPath()
  await fs.promises.mkdir(path.dirname(markerPath), { recursive: true })
  await fs.promises.writeFile(
    markerPath,
    `${JSON.stringify({ restartTeamService: true, version, createdAt: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  )
}

async function readTeamServiceRecoveryMarker() {
  try {
    const value = JSON.parse(await fs.promises.readFile(updateRecoveryMarkerPath(), 'utf8'))
    return value?.restartTeamService === true ? value : null
  } catch {
    return null
  }
}

async function writeUpdateDownloadCleanupMarker({ version, platform, fileName = '' }) {
  if (!releaseVersionParts(version) || (platform !== 'darwin' && platform !== 'win32')) return false

  const markerPath = updateDownloadCleanupMarkerPath()
  const temporaryPath = `${markerPath}.${process.pid}.tmp`
  try {
    await fs.promises.mkdir(path.dirname(markerPath), { recursive: true })
    await fs.promises.writeFile(
      temporaryPath,
      `${JSON.stringify(
        {
          version,
          platform,
          fileName: cleanUpdateFileName(fileName),
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
      'utf8',
    )
    await fs.promises.rename(temporaryPath, markerPath)
    return true
  } catch (error) {
    await fs.promises.rm(temporaryPath, { force: true }).catch(() => {})
    console.error('CrewFlow update cleanup marker failed:', error)
    return false
  }
}

async function readUpdateDownloadCleanupMarker() {
  const markerPath = updateDownloadCleanupMarkerPath()
  try {
    const value = JSON.parse(await fs.promises.readFile(markerPath, 'utf8'))
    if (!releaseVersionParts(value?.version) || (value?.platform !== 'darwin' && value?.platform !== 'win32')) {
      await fs.promises.rm(markerPath, { force: true })
      return null
    }
    return {
      version: value.version,
      platform: value.platform,
      fileName: cleanUpdateFileName(value.fileName),
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') await fs.promises.rm(markerPath, { force: true }).catch(() => {})
    return null
  }
}

async function cleanupCompletedUpdateDownloads() {
  if (!app.isPackaged || (process.platform !== 'darwin' && process.platform !== 'win32')) return

  const currentVersion = app.getVersion()
  const marker = await readUpdateDownloadCleanupMarker()
  const markerComparison = marker ? compareReleaseVersions(currentVersion, marker.version) : null
  const markerCompleted = marker?.platform === process.platform && markerComparison !== null && markerComparison >= 0

  if (process.platform === 'darwin') {
    await cleanupCompletedMacUpdateDownloads({
      currentVersion,
      updatesDirectory: macUpdateDownloadsDirectory(),
      markerFileName: marker?.fileName,
      markerCompleted,
    })
  } else {
    await cleanupCompletedWindowsUpdateDownloads({
      currentVersion,
      pendingDirectory: windowsUpdaterPendingDirectory(),
      markerCompleted,
    })
  }

  if (markerCompleted) await fs.promises.rm(updateDownloadCleanupMarkerPath(), { force: true })
}

async function waitForLocalTeamService(expectedRunning, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const running = Boolean(await fetchLocalTeamHealth())
    if (running === expectedRunning) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

function sameExecutablePath(first, second) {
  if (!first || !second) return false
  const firstPath = path.resolve(first)
  const secondPath = path.resolve(second)
  return process.platform === 'win32' ? firstPath.toLowerCase() === secondPath.toLowerCase() : firstPath === secondPath
}

async function prepareLocalTeamServiceForUpdate() {
  const health = await fetchLocalTeamHealth()
  if (!health?.ok) return false

  await writeTeamServiceRecoveryMarker(appUpdateState.version)
  await manageTeamService('stop', { preserveEnabled: true })
  const stopped = await waitForLocalTeamService(false)
  if (!stopped) throw new Error('团队服务未能安全停止，请稍后重试')
  return true
}

async function confirmApplicationUpdate({ isTeamHost, platform }) {
  const isMac = platform === 'darwin'
  const options = {
    type: 'question',
    title: '准备更新 CrewFlow',
    message: isTeamHost ? '本机正在运行团队服务，是否继续更新？' : '是否继续更新 CrewFlow？',
    detail: isTeamHost
      ? isMac
        ? '继续后会先停止团队服务、打开安装包并退出 CrewFlow。其他电脑会暂时断开；安装新版并重新打开后，服务会自动恢复。'
        : '继续后会先停止团队服务并退出 CrewFlow，然后安装新版本。其他电脑会暂时断开；新版启动后，服务会自动恢复。'
      : isMac
        ? '继续后会打开安装包并退出 CrewFlow。请在安装窗口中把新版拖入“应用程序”并选择替换。'
        : '继续后 CrewFlow 会退出，并由安装程序完成替换和重启。',
    buttons: ['继续更新', '取消'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  }
  const result = mainWindow && !mainWindow.isDestroyed()
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options)
  return result.response === 0
}

async function shouldRunWindowsHostedTeamService() {
  const serviceManager = await import(serverModuleUrl('service-manager.mjs'))
  const [marker, state] = await Promise.all([
    readTeamServiceRecoveryMarker(),
    serviceManager.readServiceState(),
  ])
  return Boolean(marker || state?.enabled || (!state && serviceManager.hasLegacyWindowsService()))
}

async function restoreOrRepairLocalTeamService() {
  if (!app.isPackaged || (process.platform !== 'darwin' && process.platform !== 'win32')) return

  const marker = await readTeamServiceRecoveryMarker()

  if (process.platform === 'win32') {
    const serviceManager = await import(serverModuleUrl('service-manager.mjs'))
    windowsTeamServiceEnabled = await shouldRunWindowsHostedTeamService()

    if (!windowsTeamServiceEnabled) {
      setWindowsTeamLoginItem(false)
      if (isWindowsBackgroundLaunch) {
        appQuitRequested = true
        app.quit()
      }
      return
    }

    await serviceManager.writeServiceState({ enabled: true, hostMode: 'app' })
    try {
      await manageTeamService('install')
      const restored = await waitForLocalTeamService(true)
      if (!restored) throw new Error('团队服务启动超时')
      await fs.promises.rm(updateRecoveryMarkerPath(), { force: true })
    } catch (error) {
      setWindowsTeamLoginItem(true)
      ensureWindowsTray()
      console.error('CrewFlow team service recovery failed:', error)
    }
    return
  }

  const health = await fetchLocalTeamHealth()
  const { readServiceRuntimeMetadata } = await import(serverModuleUrl('service-manager.mjs'))
  const runtime = await readServiceRuntimeMetadata()
  const runtimeNeedsRepair =
    Boolean(health?.ok) &&
    (!sameExecutablePath(runtime?.executable, process.execPath) || (runtime?.appVersion && runtime.appVersion !== app.getVersion()))

  if (!marker && !runtimeNeedsRepair) return

  try {
    await manageTeamService('install')
    const restored = await waitForLocalTeamService(true)
    if (!restored) throw new Error('团队服务启动超时')
    await fs.promises.rm(updateRecoveryMarkerPath(), { force: true })
  } catch (error) {
    console.error('CrewFlow team service recovery failed:', error)
  }
}

async function installApplicationUpdate() {
  if (!app.isPackaged) return publishAppUpdateState({ status: 'error', message: '开发模式不能安装正式更新' })

  if (appUpdateInstallPending) return appUpdateState
  appUpdateInstallPending = true

  try {
    if (process.platform === 'darwin') {
      if (!downloadedMacUpdatePath) return publishAppUpdateState({ status: 'error', message: '请先下载安装包' })
      try {
        await fs.promises.access(downloadedMacUpdatePath, fs.constants.R_OK)
      } catch {
        downloadedMacUpdatePath = ''
        return publishAppUpdateState({ status: 'error', message: '安装包已被移动或删除，请重新下载', canAutoInstall: false })
      }

      const isTeamHost = Boolean(await fetchLocalTeamHealth())
      if (!(await confirmApplicationUpdate({ isTeamHost, platform: process.platform }))) {
        return publishAppUpdateState({
          status: 'downloaded',
          message: '已取消更新，安装包仍保留在本机',
          canAutoInstall: false,
        })
      }

      publishAppUpdateState({
        status: 'installing',
        message: isTeamHost ? '正在保存数据并停止团队服务' : '正在保存数据并准备退出',
        canAutoInstall: false,
      })
      await waitForPendingAppDataSaves()
      await writeUpdateDownloadCleanupMarker({
        version: appUpdateState.version,
        platform: 'darwin',
        fileName: path.basename(downloadedMacUpdatePath),
      })
      if (isTeamHost) await prepareLocalTeamServiceForUpdate()

      const openError = await shell.openPath(downloadedMacUpdatePath)
      if (openError) {
        if (isTeamHost) await restoreOrRepairLocalTeamService()
        return publishAppUpdateState({ status: 'error', message: openError, canAutoInstall: false })
      }

      const state = publishAppUpdateState({
        status: 'opened',
        message: isTeamHost ? '安装包已打开，团队服务已停止，CrewFlow 正在退出' : '安装包已打开，CrewFlow 正在退出',
        canAutoInstall: false,
      })
      setTimeout(() => app.quit(), 350)
      return state
    }

    if (process.platform !== 'win32' || !windowsUpdateDownloaded) {
      return publishAppUpdateState({ status: 'error', message: '请先下载完整更新' })
    }

    if (downloadedWindowsUpdatePath) {
      try {
        await fs.promises.access(downloadedWindowsUpdatePath, fs.constants.R_OK)
      } catch {
        downloadedWindowsUpdatePath = ''
        windowsUpdateDownloaded = false
        return publishAppUpdateState({ status: 'error', message: '安装程序已被移动或删除，请重新下载', canAutoInstall: true })
      }
    }

    const isTeamHost = Boolean(await fetchLocalTeamHealth())
    if (!(await confirmApplicationUpdate({ isTeamHost, platform: process.platform }))) {
      return publishAppUpdateState({
        status: 'downloaded',
        message: '已取消更新，安装程序仍保留在本机',
        canAutoInstall: true,
      })
    }

    publishAppUpdateState({
      status: 'installing',
      message: isTeamHost ? '正在保存数据并停止团队服务' : '正在保存数据并准备安装',
      canAutoInstall: true,
    })
    await waitForPendingAppDataSaves()
    await writeUpdateDownloadCleanupMarker({ version: appUpdateState.version, platform: 'win32' })
    if (isTeamHost) await prepareLocalTeamServiceForUpdate()

    if (downloadedWindowsUpdatePath) {
      const installer = spawn(downloadedWindowsUpdatePath, ['--updated', '--force-run'], {
        detached: true,
        stdio: 'ignore',
      })
      await new Promise((resolve, reject) => {
        installer.once('spawn', resolve)
        installer.once('error', reject)
      })
      installer.unref()
      const state = publishAppUpdateState({
        status: 'installing',
        message: isTeamHost ? '安装程序已启动，团队服务已停止，CrewFlow 正在退出' : '安装程序已启动，CrewFlow 正在退出',
        canAutoInstall: true,
      })
      setTimeout(() => app.quit(), 350)
      return state
    }

    setTimeout(() => autoUpdater.quitAndInstall(false, true), 150)
    return appUpdateState
  } catch (error) {
    if (await readTeamServiceRecoveryMarker()) await restoreOrRepairLocalTeamService()
    return publishAppUpdateState({
      status: 'error',
      message: error instanceof Error ? error.message : '更新安装准备失败',
      canAutoInstall: process.platform === 'win32',
    })
  } finally {
    appUpdateInstallPending = false
  }
}

async function createWindow() {
  const isWindows = process.platform === 'win32'
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 930,
    minWidth: 1180,
    minHeight: 760,
    show: !(isWindows && isWindowsBackgroundLaunch),
    title: 'CrewFlow',
    backgroundColor: '#080d18',
    autoHideMenuBar: true,
    ...(isWindows
      ? {
          titleBarStyle: 'hidden',
          titleBarOverlay: {
            color: '#080d18',
            symbolColor: '#dbe7f4',
            height: 32,
          },
        }
      : process.platform === 'darwin'
        ? { titleBarStyle: 'hiddenInset' }
        : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  if (isWindows) mainWindow.setMenuBarVisibility(false)

  if (isDev) {
    mainWindow.loadURL('http://127.0.0.1:5173')
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('close', (event) => {
    if (!isWindows || !windowsTeamServiceEnabled || appQuitRequested) return
    event.preventDefault()
    mainWindow.hide()
    libraryPreviewWindows.forEach((previewWindow) => {
      if (!previewWindow.isDestroyed()) previewWindow.close()
    })
    libraryPreviewWindows.clear()
    ensureWindowsTray()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    libraryPreviewWindows.forEach((previewWindow) => {
      if (!previewWindow.isDestroyed()) previewWindow.close()
    })
    libraryPreviewWindows.clear()
  })

  if (showMainWindowWhenReady) {
    showMainWindowWhenReady = false
    showPrimaryWindow()
  }
}

if (!hasPrimaryInstanceLock) {
  app.quit()
} else if (isTeamServerMode) {
  startTeamServerMode().catch((error) => {
    console.error(error)
    app.quit()
  })
} else {
  app.whenReady().then(async () => {
    configureWindowsUpdater()

    ipcMain.handle('window-control:minimize', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window || window.isDestroyed()) return false
      window.minimize()
      return true
    })

    ipcMain.handle('window-control:toggle-maximize', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window || window.isDestroyed()) return false
      if (window.isMaximized()) window.unmaximize()
      else window.maximize()
      return window.isMaximized()
    })

    ipcMain.handle('window-control:close', (event) => {
      const window = BrowserWindow.fromWebContents(event.sender)
      if (!window || window.isDestroyed()) return false
      window.close()
      return true
    })

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

    ipcMain.handle('projects:export', async (_event, payload = {}) => {
      const projects = Array.isArray(payload.projects) ? payload.projects : []
      if (projects.length === 0) throw new Error('请选择要导出的项目')
      const date = new Date()
      const dateText = [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((value, index) => String(value).padStart(index === 0 ? 4 : 2, '0')).join('-')
      const options = {
        title: '导出项目表格',
        defaultPath: path.join(app.getPath('documents'), `CrewFlow-项目数据-${dateText}.xlsx`),
        filters: [{ name: 'Excel 表格', extensions: ['xlsx'] }],
      }
      const result = mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showSaveDialog(mainWindow, options)
        : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return { canceled: true }
      const outputPath = result.filePath.toLowerCase().endsWith('.xlsx') ? result.filePath : `${result.filePath}.xlsx`
      await fs.promises.writeFile(outputPath, await createProjectWorkbookBuffer(payload))
      return { canceled: false, filePath: outputPath }
    })

    ipcMain.handle('quote:export', async (_event, payload = {}) => {
      const buffer = await createQuoteWorkbookBuffer(payload)
      const fileName = Array.from(String(payload.title || '项目报价单')).map((character) => character.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(character) ? '_' : character).join('').slice(0, 100)
      const options = { title: '导出报价单', defaultPath: path.join(app.getPath('documents'), `${fileName}.xlsx`), filters: [{ name: 'Excel 表格', extensions: ['xlsx'] }] }
      const result = mainWindow && !mainWindow.isDestroyed() ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options)
      if (result.canceled || !result.filePath) return { canceled: true }
      const outputPath = result.filePath.toLowerCase().endsWith('.xlsx') ? result.filePath : `${result.filePath}.xlsx`
      await fs.promises.writeFile(outputPath, buffer)
      return { canceled: false, filePath: outputPath }
    })

    ipcMain.handle('utility-tools:select-files', async (_event, options = {}) => {
      return selectedUtilityFiles(options)
    })

    ipcMain.handle('utility-tools:convert', async (event, payload = {}) => {
      return getUtilityToolsService().convertDocument(payload, (state) => {
        if (!event.sender.isDestroyed()) event.sender.send('utility-tools:progress', state)
      })
    })

    ipcMain.handle('utility-tools:pdf', async (event, payload = {}) => {
      return getUtilityToolsService().runPdfTool(payload, (state) => {
        if (!event.sender.isDestroyed()) event.sender.send('utility-tools:progress', state)
      })
    })

    ipcMain.handle('utility-tools:cancel', async (_event, jobId) => {
      return getUtilityToolsService().cancel(jobId)
    })

    ipcMain.handle('utility-tools:outputs-exist', async (_event, filePaths = []) => {
      if (!Array.isArray(filePaths)) return []
      return Promise.all(filePaths.slice(0, 50).map(async (filePath) => {
        if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) return false
        try {
          await fs.promises.stat(filePath)
          return true
        } catch (error) {
          return !['ENOENT', 'ENOTDIR'].includes(error?.code)
        }
      }))
    })

    ipcMain.handle('utility-tools:reveal', async (_event, filePath) => {
      if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) return false
      try {
        await fs.promises.stat(filePath)
      } catch (error) {
        if (['ENOENT', 'ENOTDIR'].includes(error?.code)) return false
        throw error
      }
      shell.showItemInFolder(filePath)
      return true
    })

    ipcMain.handle('library-file:select', async (_event, purpose) => {
      return selectedLibraryFile(purpose)
    })

    ipcMain.handle('library-path:identify', async (_event, filePath) => {
      return identifyLibraryNetworkPath(typeof filePath === 'string' ? filePath : '')
    })

    ipcMain.handle('library-file:import', async (_event, payload) => {
      return importLibraryFile(payload)
    })

    ipcMain.handle('library-file:read', async (_event, payload) => {
      const result = await readLibrarySource(payload)
      return {
        data: result.data,
        metadata: result.metadata,
      }
    })

    ipcMain.handle('library-file:delete', async (_event, payload) => {
      return deleteLibraryFile(payload)
    })

    ipcMain.handle('library-file:open', async (_event, payload) => {
      if (payload?.sourceType === 'path') {
        const sourcePath = await resolvedLibrarySourcePath(payload)
        const error = await shell.openPath(sourcePath)
        if (error) throw new Error(error)
        return true
      }
      if (payload?.sourceType === 'url') return previewLibraryResource(payload)
      return openLibraryBytes(payload)
    })

    ipcMain.handle('library-file:reveal', async (_event, payload) => {
      return revealLibraryResource(payload)
    })

    ipcMain.handle('library-resource:preview', async (_event, payload) => {
      return previewLibraryResource(payload)
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

    ipcMain.handle('team-service:discover', async () => {
      const { discoverLocalTeamServers } = await import(serverModuleUrl('service-manager.mjs'))
      return discoverLocalTeamServers()
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

    ipcMain.handle('app-update:state', async () => appUpdateState)

    ipcMain.handle('app-update:check', async () => {
      return checkApplicationUpdate()
    })

    ipcMain.handle('app-update:download', async (_event, payload = {}) => {
      return downloadApplicationUpdate(payload)
    })

    ipcMain.handle('app-update:install', async () => {
      return installApplicationUpdate()
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

    cleanupCompletedUpdateDownloads().catch((error) => {
      console.error('CrewFlow completed update cleanup failed:', error)
    })
    if (process.platform === 'win32' && app.isPackaged) {
      windowsTeamServiceEnabled = await shouldRunWindowsHostedTeamService()
      if (isWindowsBackgroundLaunch && !windowsTeamServiceEnabled) {
        appQuitRequested = true
        app.quit()
        return
      }
    }
    await createWindow()
    restoreOrRepairLocalTeamService().catch((error) => {
      console.error('CrewFlow team service startup repair failed:', error)
    })

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
      }
    })
  })
}

app.on('before-quit', (event) => {
  appQuitRequested = true
  if (process.platform !== 'win32' || !windowsHostedTeamServer || appQuitCleanupRunning) {
    destroyWindowsTray()
    return
  }

  event.preventDefault()
  appQuitCleanupRunning = true
  queueWindowsTeamServiceOperation(() => stopWindowsHostedTeamService({ preserveEnabled: true }))
    .catch((error) => console.error('CrewFlow hosted team service shutdown failed:', error))
    .finally(() => {
      destroyWindowsTray()
      app.quit()
    })
})

app.on('window-all-closed', () => {
  if (process.platform === 'win32' && windowsTeamServiceEnabled && !appQuitRequested) {
    ensureWindowsTray()
    return
  }
  if (!isTeamServerMode && process.platform !== 'darwin') {
    app.quit()
  }
})

const { app, BrowserWindow, clipboard, dialog, ipcMain, safeStorage, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const { createHash } = require('crypto')
const fs = require('fs')
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

const isDev = !app.isPackaged
const isTeamServerMode = process.argv.includes('--team-server')
let saveQueue = Promise.resolve()
let mainWindow = null
let windowsUpdaterConfigured = false
let windowsUpdateDownloaded = false
let windowsUpdaterSuppressErrors = false
let windowsUpdateSource = 'gitcode'
let downloadedMacUpdatePath = ''
let appUpdateInstallPending = false
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

function appDataPath() {
  return path.join(app.getPath('userData'), 'crewflow-data.json')
}

function assistantSettingsPath() {
  return path.join(app.getPath('userData'), 'assistant-settings.json')
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
  windowsUpdaterSuppressErrors = true

  try {
    for (let index = 0; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      windowsUpdateSource = candidate.source
      try {
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
  const { localTeamServerCandidates, readOrCreateAccessKey, readServiceRuntimeMetadata, serviceAccessKeyPath } = await import(
    serverModuleUrl('service-manager.mjs')
  )
  const accessKey = await readOrCreateAccessKey()
  const serviceRuntime = await readServiceRuntimeMetadata()
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
    serviceRuntime,
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
  await manageTeamService('stop')
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

async function restoreOrRepairLocalTeamService() {
  if (!app.isPackaged || (process.platform !== 'darwin' && process.platform !== 'win32')) return

  const marker = await readTeamServiceRecoveryMarker()
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
  mainWindow = new BrowserWindow({
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

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

if (isTeamServerMode) {
  startTeamServerMode().catch((error) => {
    console.error(error)
    app.quit()
  })
} else {
  app.whenReady().then(() => {
    configureWindowsUpdater()

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
    createWindow()
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

app.on('window-all-closed', () => {
  if (!isTeamServerMode && process.platform !== 'darwin') {
    app.quit()
  }
})

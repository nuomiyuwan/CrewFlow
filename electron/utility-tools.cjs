const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const { pathToFileURL } = require('url')
const { createConversionRuntime } = require('./conversion/runtime.cjs')
const { createAudioRuntime } = require('./audio/runtime.cjs')
const { audioTargets, VIDEO_EXTENSIONS, UNSUPPORTED_AUDIO_EXTENSIONS } = require('./audio/formats.cjs')

const LIBREOFFICE_VERSION = '26.8.0'
const PDFCPU_VERSION = '0.15.0'
const COMPONENT_DIRECTORY = 'utility-components'

const LIBREOFFICE_ASSETS = {
  darwin: {
    arm64: {
      name: 'LibreOffice_26.8.0_MacOS_aarch64.dmg',
      url: 'https://download.documentfoundation.org/libreoffice/stable/26.8.0/mac/aarch64/LibreOffice_26.8.0_MacOS_aarch64.dmg',
      sha256: '8858d8058da4f862f47559486814e65efc27294da67c5e4bb56b006b1ee59f89',
      size: 298773447,
      kind: 'dmg',
    },
    x64: {
      name: 'LibreOffice_26.8.0_MacOS_x86-64.dmg',
      url: 'https://download.documentfoundation.org/libreoffice/stable/26.8.0/mac/x86_64/LibreOffice_26.8.0_MacOS_x86-64.dmg',
      sha256: '2dcbce4894e01bc1ecd594658e2cbda70ff7bfcd0b310f35d38887797172d09e',
      size: 309257813,
      kind: 'dmg',
    },
  },
  win32: {
    x64: {
      name: 'LibreOffice_26.8.0_Win_x86-64.msi',
      url: 'https://download.documentfoundation.org/libreoffice/stable/26.8.0/win/x86_64/LibreOffice_26.8.0_Win_x86-64.msi',
      sha256: '4aa6c6e1895f4055104effcb556bd3362d20c6ad707c149543304f395ef9db95',
      size: 374906880,
      kind: 'msi',
    },
  },
}

const PDFCPU_ASSETS = {
  darwin: {
    arm64: {
      name: 'pdfcpu_0.15.0_Darwin_arm64.tar.xz',
      url: 'https://github.com/pdfcpu/pdfcpu/releases/download/v0.15.0/pdfcpu_0.15.0_Darwin_arm64.tar.xz',
      sha256: '2f49a15594dd46289d62219a1a2c7b26f0128ec0c658e655a2e62125db0c49ad',
      size: 4838192,
      kind: 'tar.xz',
    },
    x64: {
      name: 'pdfcpu_0.15.0_Darwin_x86_64.tar.xz',
      url: 'https://github.com/pdfcpu/pdfcpu/releases/download/v0.15.0/pdfcpu_0.15.0_Darwin_x86_64.tar.xz',
      sha256: '93fb1e782c8cad41b46f236812ff1570c6f026429564d5ede1295db427a3495c',
      size: 5635192,
      kind: 'tar.xz',
    },
  },
  win32: {
    x64: {
      name: 'pdfcpu_0.15.0_Windows_x86_64.zip',
      url: 'https://github.com/pdfcpu/pdfcpu/releases/download/v0.15.0/pdfcpu_0.15.0_Windows_x86_64.zip',
      sha256: '9809a70ee60ba78252628cc9738b284fbebf22bc2616ae903fb89b807e75a8a6',
      size: 6225025,
      kind: 'zip',
    },
  },
}

const PDFIUM_ASSET = {
  name: 'pdfium-2.1.13.tgz',
  url: 'https://registry.npmjs.org/@hyzyla/pdfium/-/pdfium-2.1.13.tgz',
  sha256: 'd758644310d11ce74f0b2039fe36782f09fcb95d36052fa1c5a9c5a80618341c',
  size: 4842382,
  kind: 'tgz',
}

class UtilityError extends Error {
  constructor(message, code = 'ERR_UTILITY') {
    super(message)
    this.name = 'UtilityError'
    this.code = code
  }
}

function normalizePlatform(value) {
  if (value === 'win' || value === 'windows') return 'win32'
  return value || process.platform
}

function normalizeArch(value) {
  if (value === 'x86_64' || value === 'amd64') return 'x64'
  if (value === 'aarch64') return 'arm64'
  return value || process.arch
}

function cleanExtension(filePath) {
  return path.extname(filePath).slice(1).toLowerCase()
}

function isOfficeExtension(extension) {
  return ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(extension)
}

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif']
const IMAGE_TARGETS = ['png', 'jpg', 'webp', 'bmp', 'tiff']

function conversionTargets(extension) {
  if (VIDEO_EXTENSIONS.includes(extension)) return ['mp4', ...audioTargets(extension)]
  const audio = audioTargets(extension)
  if (audio.length) return audio
  if (extension === 'pdf') return ['docx', 'xlsx', 'pptx', 'png', 'jpg', 'txt']
  if (['doc', 'docx'].includes(extension)) return ['pdf', 'xlsx']
  if (['xls', 'xlsx'].includes(extension)) return ['pdf', 'docx']
  if (['ppt', 'pptx'].includes(extension)) return ['pdf']
  if (IMAGE_EXTENSIONS.includes(extension)) {
    const normalized = extension === 'jpeg' ? 'jpg' : extension === 'tif' ? 'tiff' : extension
    return ['pdf', 'docx', 'xlsx', 'txt', ...IMAGE_TARGETS.filter((target) => target !== normalized)]
  }
  return []
}

function isPdfPath(filePath) {
  return cleanExtension(filePath) === 'pdf'
}

function emitProgress(emit, jobId, phase, message, percent, details = {}) {
  if (typeof emit !== 'function') return
  try {
    const state = { jobId, phase, message, percent: Math.max(0, Math.min(100, Math.round(percent))) }
    for (const key of ['indeterminate', 'firstUse', 'bytes']) {
      if (Object.prototype.hasOwnProperty.call(details, key)) state[key] = details[key]
    }
    emit(state)
  } catch {
  }
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '0 MB'
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`
  return `${(value / 1024 / 1024).toFixed(value >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

function throwIfCancelled(job) {
  if (job?.cancelled) throw new UtilityError('操作已取消', 'ERR_UTILITY_CANCELLED')
}

async function pathExists(filePath) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK)
    return true
  } catch {
    return false
  }
}

async function isUsableFile(filePath) {
  try {
    const stat = await fs.promises.stat(filePath)
    return stat.isFile() && stat.size > 0
  } catch {
    return false
  }
}

async function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    const input = fs.createReadStream(filePath)
    input.on('error', reject)
    input.on('data', (chunk) => hash.update(chunk))
    input.on('end', () => resolve(hash.digest('hex')))
  })
}

async function verifyFile(filePath, expected) {
  return (await sha256File(filePath)).toLowerCase() === expected.toLowerCase()
}

async function removePath(filePath) {
  if (!filePath) return
  try {
    await fs.promises.rm(filePath, { recursive: true, force: true })
  } catch {
  }
}

function commandName(command) {
  return path.basename(command).toLowerCase()
}

function killChildTree(child, platform) {
  if (!child?.pid) return
  if (platform === 'win32') {
    const killer = spawn('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
    killer.on('error', () => {
      try { child.kill() } catch {
      }
    })
    const timer = setTimeout(() => {
      try { child.kill() } catch {
      }
    }, 1500)
    timer.unref?.()
    return
  }
  try {
    process.kill(-child.pid, 'SIGTERM')
  } catch {
    try { child.kill('SIGTERM') } catch {
    }
  }
  const timer = setTimeout(() => {
    try { process.kill(-child.pid, 'SIGKILL') } catch {
      try { child.kill('SIGKILL') } catch {
      }
    }
  }, 1200)
  timer.unref?.()
}

function runCommand(command, args, { job, platform, cwd, env, emit, jobId, phase, message, percent, progressDetails, onLine, timeoutMs = 15 * 60 * 1000 } = {}) {
  return new Promise((resolve, reject) => {
    throwIfCancelled(job)
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      shell: false,
      windowsHide: true,
      detached: platform !== 'win32',
    })
    if (job) job.children.add(child)
    if (message) emitProgress(emit, jobId, phase, message, percent, progressDetails)
    let stdout = ''
    let stderr = ''
    let settled = false
    let timedOut = false
    let terminationTimeout
    const lineBuffers = { stdout: '', stderr: '' }
    function readLines(stream, chunk) {
      if (!onLine) return
      lineBuffers[stream] += chunk.toString()
      const lines = lineBuffers[stream].split(/\r?\n/)
      lineBuffers[stream] = lines.pop().slice(-65536)
      for (const line of lines) onLine(line)
    }
    const timeout = setTimeout(() => {
      timedOut = true
      killChildTree(child, platform)
      terminationTimeout = setTimeout(() => {
        finish(() => reject(new UtilityError('处理时间过长，已自动停止', 'ERR_UTILITY_TIMEOUT')))
      }, 3000)
      terminationTimeout.unref?.()
    }, timeoutMs)
    timeout.unref?.()
    const finish = (callback) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      clearTimeout(terminationTimeout)
      job?.children.delete(child)
      callback()
    }
    child.stdout?.on('data', (chunk) => {
      stdout = (stdout + chunk.toString()).slice(-1024 * 1024)
      readLines('stdout', chunk)
      if (message) emitProgress(emit, jobId, phase, message, percent, progressDetails)
    })
    child.stderr?.on('data', (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-1024 * 1024)
      readLines('stderr', chunk)
    })
    child.once('error', (error) => {
      finish(() => reject(new UtilityError(`${commandName(command)} 启动失败：${error.message}`, 'ERR_UTILITY_COMMAND')))
    })
    child.once('close', (code, signal) => {
      for (const line of Object.values(lineBuffers)) if (line && onLine) onLine(line)
      finish(() => {
        if (job?.cancelled) {
          reject(new UtilityError('操作已取消', 'ERR_UTILITY_CANCELLED'))
        } else if (timedOut) {
          reject(new UtilityError('处理时间过长，已自动停止', 'ERR_UTILITY_TIMEOUT'))
        } else if (code !== 0) {
          const detail = (stderr || stdout).trim().split(/\r?\n/).filter(Boolean).slice(-3).join('；')
          reject(Object.assign(new UtilityError(`${commandName(command)} 执行失败${detail ? `：${detail}` : ''}`, 'ERR_UTILITY_COMMAND'), { exitCode: code }))
        } else {
          resolve({ stdout, stderr, signal })
        }
      })
    })
  })
}

function pdfcpuCommand(args) {
  return ['-c', 'disable', '-o', ...args]
}

function createUtilityToolsService(options = {}) {
  const platform = normalizePlatform(options.platform)
  const arch = normalizeArch(options.arch)
  const userDataPath = path.resolve(options.userDataPath || path.join(os.tmpdir(), 'CrewFlow'))
  const componentPath = path.join(userDataPath, COMPONENT_DIRECTORY)
  const workPath = path.join(path.resolve(options.tempPath || os.tmpdir()), 'CrewFlow', 'utility-tools')
  const jobs = new Map()
  const reservedOutputs = new Set()
  let pdfiumLibraryPromise = null
  const conversionRuntime = createConversionRuntime({ componentPath, platform, arch, downloadAsset, runCommand, emitProgress, UtilityError, options })
  const audioRuntime = createAudioRuntime({ componentPath, platform, arch, options, downloadAsset, runCommand, emitProgress, UtilityError, throwIfCancelled })

  function getJob(jobId) {
    const id = String(jobId || `utility-${Date.now()}`)
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) throw new UtilityError('任务编号无效', 'ERR_UTILITY_INPUT')
    if (jobs.size) throw new UtilityError('已有文件正在处理，请等待完成后重试', 'ERR_UTILITY_BUSY')
    let job = jobs.get(id)
    if (!job) {
      job = { id, cancelled: false, controllers: new Set(), children: new Set(), tempPaths: new Set() }
      jobs.set(id, job)
    }
    return job
  }

  function finishJob(job) {
    for (const controller of job.controllers) controller.abort()
    jobs.delete(job.id)
  }

  async function createStageDirectory(prefix, job) {
    await fs.promises.mkdir(workPath, { recursive: true })
    const stageDirectory = await fs.promises.mkdtemp(path.join(workPath, `${prefix}-${job.id}-`))
    job.tempPaths.add(stageDirectory)
    return stageDirectory
  }

  async function existingBinary(candidates) {
    for (const candidate of candidates.filter(Boolean)) {
      if (await isUsableFile(candidate)) return candidate
    }
    return ''
  }

  async function locateSoffice() {
    const configured = options.sofficePath || process.env.CREWFLOW_SOFFICE_PATH
    const candidates = [configured]
    const managedRoot = path.join(componentPath, `libreoffice-${LIBREOFFICE_VERSION}-${arch}`)
    if (platform === 'darwin') {
      candidates.push(
        '/Applications/LibreOffice.app/Contents/MacOS/soffice',
        path.join(os.homedir(), 'Applications/LibreOffice.app/Contents/MacOS/soffice'),
        path.join(managedRoot, 'LibreOffice.app/Contents/MacOS/soffice'),
      )
    } else if (platform === 'win32') {
      const roots = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      for (const root of roots.filter(Boolean)) candidates.push(path.join(root, 'LibreOffice', 'program', 'soffice.exe'))
      candidates.push(path.join(managedRoot, 'program', 'soffice.exe'))
      candidates.push(path.join(managedRoot, 'msi-root', 'LibreOffice', 'program', 'soffice.exe'))
    }
    const direct = await existingBinary(candidates)
    if (direct || !(await pathExists(managedRoot))) return direct
    return findNamedFile(managedRoot, platform === 'win32' ? ['soffice.exe'] : ['soffice'])
  }

  async function downloadAsset(asset, job, emit, phase, details = {}) {
    const archive = path.join(componentPath, asset.name)
    await fs.promises.mkdir(componentPath, { recursive: true })
    if (await isUsableFile(archive) && await verifyFile(archive, asset.sha256)) return archive
    await removePath(archive)
    const temporary = `${archive}.${job.id}.${process.pid}.download`
    job.tempPaths.add(temporary)
    await removePath(temporary)
    const controller = new AbortController()
    job.controllers.add(controller)
    let lastProgress = 2
    let handle
    try {
      emitProgress(emit, job.id, phase, `正在下载组件 0 MB / ${formatBytes(asset.size)}`, 2, {
        firstUse: details.firstUse,
        indeterminate: !asset.size,
        bytes: { downloaded: 0, total: asset.size || 0 },
      })
      const response = await fetch(asset.url, { redirect: 'follow', signal: controller.signal })
      if (!response.ok || !response.body) throw new UtilityError(`组件下载失败：HTTP ${response.status}`, 'ERR_UTILITY_DOWNLOAD')
      const total = Number(response.headers.get('content-length')) || asset.size || 0
      let transferred = 0
      const hash = crypto.createHash('sha256')
      handle = await fs.promises.open(temporary, 'w')
      for await (const chunkValue of response.body) {
        throwIfCancelled(job)
        const chunk = Buffer.from(chunkValue)
        hash.update(chunk)
        transferred += chunk.length
        await handle.write(chunk)
        const nextProgress = Math.round(total ? 2 + (transferred / total) * 28 : 4)
        if (nextProgress !== lastProgress) {
          lastProgress = nextProgress
          emitProgress(emit, job.id, phase, `正在下载组件 ${formatBytes(transferred)} / ${formatBytes(total)}`, nextProgress, {
            firstUse: details.firstUse,
            indeterminate: !total,
            bytes: { downloaded: transferred, total },
          })
        }
      }
      await handle.close()
      handle = null
      if (hash.digest('hex').toLowerCase() !== asset.sha256.toLowerCase()) {
        throw new UtilityError('组件校验失败，已停止安装', 'ERR_UTILITY_CHECKSUM')
      }
      await fs.promises.rename(temporary, archive)
      job.tempPaths.delete(temporary)
      return archive
    } catch (error) {
      try { await handle?.close() } catch {
      }
      await removePath(temporary)
      job.tempPaths.delete(temporary)
      if (error.name === 'AbortError' || job.cancelled) throw new UtilityError('操作已取消', 'ERR_UTILITY_CANCELLED')
      throw error
    } finally {
      job.controllers.delete(controller)
    }
  }

  async function findNamedFile(root, names) {
    const wanted = new Set(names.map((name) => name.toLowerCase()))
    const pending = [root]
    while (pending.length) {
      const current = pending.pop()
      let entries
      try { entries = await fs.promises.readdir(current, { withFileTypes: true }) } catch { continue }
      for (const entry of entries) {
        const candidate = path.join(current, entry.name)
        if (entry.isDirectory()) pending.push(candidate)
        else if (wanted.has(entry.name.toLowerCase()) && await isUsableFile(candidate)) return candidate
      }
    }
    return ''
  }

  async function installLibreOffice(asset, archive, job, emit) {
    const installRoot = path.join(componentPath, `libreoffice-${LIBREOFFICE_VERSION}-${arch}`)
    const installed = await locateSoffice()
    if (installed) return installed
    const temporaryRoot = `${installRoot}.${job.id}.${process.pid}.extracting`
    await removePath(temporaryRoot)
    await fs.promises.mkdir(temporaryRoot, { recursive: true })
    job.tempPaths.add(temporaryRoot)
    try {
      if (asset.kind === 'dmg') {
        const mountPoint = path.join(temporaryRoot, 'mount')
        await fs.promises.mkdir(mountPoint, { recursive: true })
        let mounted = false
        try {
          emitProgress(emit, job.id, '安装组件', '正在准备 LibreOffice', 34)
          await runCommand('hdiutil', ['attach', '-nobrowse', '-readonly', '-mountpoint', mountPoint, archive], { job, platform, emit, jobId: job.id, phase: '安装组件', message: '正在挂载 LibreOffice', percent: 40 })
          mounted = true
          const appPath = path.join(mountPoint, 'LibreOffice.app')
          if (!(await pathExists(appPath))) throw new UtilityError('LibreOffice 安装包内容不完整', 'ERR_UTILITY_INSTALL')
          await runCommand('ditto', [appPath, path.join(temporaryRoot, 'LibreOffice.app')], { job, platform, emit, jobId: job.id, phase: '安装组件', message: '正在安装 LibreOffice', percent: 48 })
        } finally {
          if (mounted) await runCommand('hdiutil', ['detach', mountPoint, '-force'], { job: { ...job, cancelled: false }, platform }).catch(() => {})
        }
      } else {
        const target = path.join(temporaryRoot, 'msi-root')
        await fs.promises.mkdir(target, { recursive: true })
        const msiexec = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'msiexec.exe') : 'msiexec.exe'
        emitProgress(emit, job.id, '安装组件', '正在提取 LibreOffice', 40)
        await runCommand(msiexec, ['/a', archive, '/qn', `TARGETDIR=${target}`], { job, platform, emit, jobId: job.id, phase: '安装组件', message: '正在提取 LibreOffice', percent: 50 })
      }
      const binary = await findNamedFile(temporaryRoot, platform === 'win32' ? ['soffice.exe'] : ['soffice'])
      if (!binary) throw new UtilityError('LibreOffice 安装包中未找到转换程序', 'ERR_UTILITY_INSTALL')
      await removePath(installRoot)
      await fs.promises.rename(temporaryRoot, installRoot)
      job.tempPaths.delete(temporaryRoot)
      const result = await locateSoffice()
      if (!result) throw new UtilityError('LibreOffice 安装后无法启动', 'ERR_UTILITY_INSTALL')
      return result
    } finally {
      await removePath(temporaryRoot)
      job.tempPaths.delete(temporaryRoot)
    }
  }

  async function getSoffice(job, emit) {
    const system = await locateSoffice()
    if (system) return system
    const asset = LIBREOFFICE_ASSETS[platform]?.[arch]
    if (!asset) throw new UtilityError(`暂不支持 ${platform}/${arch} 的 LibreOffice 转换`, 'ERR_UTILITY_PLATFORM')
    const managedRoot = path.join(componentPath, `libreoffice-${LIBREOFFICE_VERSION}-${arch}`)
    const firstUse = !(await pathExists(managedRoot))
    emitProgress(emit, job.id, '安装组件', '正在准备本地转换组件', 4, { firstUse, indeterminate: true, bytes: { downloaded: 0, total: asset.size } })
    const archive = await downloadAsset(asset, job, emit, '下载组件', { firstUse })
    const binary = await installLibreOffice(asset, archive, job, emit)
    await removePath(archive)
    return binary
  }

  async function locatePdfcpu() {
    const configured = options.pdfcpuPath || process.env.CREWFLOW_PDFCPU_PATH
    const candidates = [configured]
    const managedRoot = path.join(componentPath, `pdfcpu-${PDFCPU_VERSION}-${arch}`)
    if (platform === 'darwin') {
      candidates.push(path.join(managedRoot, 'pdfcpu'))
      candidates.push(path.join(managedRoot, `pdfcpu_${PDFCPU_VERSION}_Darwin_${arch}`, 'pdfcpu'))
    }
    if (platform === 'win32') {
      candidates.push(path.join(managedRoot, 'pdfcpu.exe'))
      candidates.push(path.join(managedRoot, `pdfcpu_${PDFCPU_VERSION}_Windows_x86_64`, 'pdfcpu.exe'))
    }
    const direct = await existingBinary(candidates)
    if (direct || !(await pathExists(managedRoot))) return direct
    return findNamedFile(managedRoot, platform === 'win32' ? ['pdfcpu.exe'] : ['pdfcpu'])
  }

  async function installPdfcpu(asset, archive, job, emit) {
    const installRoot = path.join(componentPath, `pdfcpu-${PDFCPU_VERSION}-${arch}`)
    const installed = await locatePdfcpu()
    if (installed) return installed
    const temporaryRoot = `${installRoot}.${job.id}.${process.pid}.extracting`
    await removePath(temporaryRoot)
    await fs.promises.mkdir(temporaryRoot, { recursive: true })
    job.tempPaths.add(temporaryRoot)
    try {
      emitProgress(emit, job.id, '安装组件', '正在准备 PDF 工具', 38)
      const tar = platform === 'win32' ? (process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar.exe') : 'tar'
      const args = platform === 'darwin' ? ['-xJf', archive, '-C', temporaryRoot] : ['-xf', archive, '-C', temporaryRoot]
      await runCommand(tar, args, { job, platform, emit, jobId: job.id, phase: '安装组件', message: '正在解压 PDF 工具', percent: 50 })
      const binary = await findNamedFile(temporaryRoot, platform === 'win32' ? ['pdfcpu.exe'] : ['pdfcpu'])
      if (!binary) throw new UtilityError('PDF 工具安装包中未找到执行程序', 'ERR_UTILITY_INSTALL')
      await removePath(installRoot)
      await fs.promises.rename(temporaryRoot, installRoot)
      job.tempPaths.delete(temporaryRoot)
      const result = await locatePdfcpu()
      if (!result) throw new UtilityError('PDF 工具安装后无法启动', 'ERR_UTILITY_INSTALL')
      if (platform !== 'win32') await fs.promises.chmod(result, 0o755).catch(() => {})
      return result
    } finally {
      await removePath(temporaryRoot)
      job.tempPaths.delete(temporaryRoot)
    }
  }

  async function getPdfcpu(job, emit) {
    const system = await locatePdfcpu()
    if (system) return system
    const asset = PDFCPU_ASSETS[platform]?.[arch]
    if (!asset) throw new UtilityError(`暂不支持 ${platform}/${arch} 的 PDF 工具`, 'ERR_UTILITY_PLATFORM')
    const managedRoot = path.join(componentPath, `pdfcpu-${PDFCPU_VERSION}-${arch}`)
    const firstUse = !(await pathExists(managedRoot))
    emitProgress(emit, job.id, '安装组件', '正在准备 PDF 组件', 34, { firstUse, indeterminate: true, bytes: { downloaded: 0, total: asset.size } })
    const archive = await downloadAsset(asset, job, emit, '下载组件', { firstUse })
    const binary = await installPdfcpu(asset, archive, job, emit)
    await removePath(archive)
    return binary
  }

  async function locatePdfiumModule() {
    const managedRoot = path.join(componentPath, `pdfium-${PDFIUM_ASSET.name.replace(/\.tgz$/, '')}`)
    const direct = path.join(managedRoot, 'package', 'dist', 'index.cjs')
    if (await isUsableFile(direct)) return direct
    if (!(await pathExists(managedRoot))) return ''
    return findNamedFile(managedRoot, ['index.cjs'])
  }

  async function installPdfium(archive, job, emit, firstUse) {
    const installRoot = path.join(componentPath, `pdfium-${PDFIUM_ASSET.name.replace(/\.tgz$/, '')}`)
    const installed = await locatePdfiumModule()
    if (installed) return installed
    const temporaryRoot = `${installRoot}.${job.id}.${process.pid}.extracting`
    await removePath(temporaryRoot)
    await fs.promises.mkdir(temporaryRoot, { recursive: true })
    job.tempPaths.add(temporaryRoot)
    try {
      const tar = platform === 'win32' ? (process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar.exe') : 'tar'
      const details = { firstUse, indeterminate: true, bytes: { downloaded: PDFIUM_ASSET.size, total: PDFIUM_ASSET.size } }
      emitProgress(emit, job.id, '安装组件', '正在安装 PDF 转换组件', 48, details)
      await runCommand(tar, ['-xzf', archive, '-C', temporaryRoot], { job, platform, emit, jobId: job.id, phase: '安装组件', message: '正在解压 PDF 转换组件', percent: 58, progressDetails: details })
      const modulePath = path.join(temporaryRoot, 'package', 'dist', 'index.cjs')
      const found = (await isUsableFile(modulePath)) ? modulePath : await findNamedFile(temporaryRoot, ['index.cjs'])
      if (!found) throw new UtilityError('PDF 转换组件安装包中未找到运行模块', 'ERR_UTILITY_INSTALL')
      await removePath(installRoot)
      await fs.promises.rename(temporaryRoot, installRoot)
      job.tempPaths.delete(temporaryRoot)
      const result = await locatePdfiumModule()
      if (!result) throw new UtilityError('PDF 转换组件安装后无法启动', 'ERR_UTILITY_INSTALL')
      return result
    } finally {
      await removePath(temporaryRoot)
      job.tempPaths.delete(temporaryRoot)
    }
  }

  async function getPdfium(job, emit) {
    if (!pdfiumLibraryPromise) {
      pdfiumLibraryPromise = (async () => {
        let modulePath = await locatePdfiumModule()
        if (!modulePath) {
          const firstUse = !(await pathExists(path.join(componentPath, `pdfium-${PDFIUM_ASSET.name.replace(/\.tgz$/, '')}`)))
          emitProgress(emit, job.id, '安装组件', '正在准备 PDF 转换组件', 4, { firstUse, indeterminate: true, bytes: { downloaded: 0, total: PDFIUM_ASSET.size } })
          const archive = await downloadAsset(PDFIUM_ASSET, job, emit, '下载组件', { firstUse })
          modulePath = await installPdfium(archive, job, emit, firstUse)
          await removePath(archive)
        }
        try {
          const { PDFiumLibrary } = require(modulePath)
          return await PDFiumLibrary.init()
        } catch (error) {
          throw new UtilityError(`PDF 转换组件启动失败：${error.message}`, 'ERR_UTILITY_COMMAND')
        }
      })().catch((error) => {
        pdfiumLibraryPromise = null
        throw error
      })
    }
    return pdfiumLibraryPromise
  }

  function reserveSibling(sourcePath, extension, suffix = '') {
    const sourceDirectory = path.dirname(sourcePath)
    const stem = path.basename(sourcePath, path.extname(sourcePath))
    const normalizedSuffix = suffix ? `-${suffix}` : ''
    let index = 0
    while (true) {
      const counter = index ? ` (${index})` : ''
      const candidate = path.join(sourceDirectory, `${stem}${normalizedSuffix}${counter}.${extension}`)
      if (!reservedOutputs.has(candidate) && !fs.existsSync(candidate)) {
        reservedOutputs.add(candidate)
        return candidate
      }
      index += 1
    }
  }

  function reserveSiblingDirectory(sourcePath, suffix) {
    const sourceDirectory = path.dirname(sourcePath)
    const stem = path.basename(sourcePath, path.extname(sourcePath))
    let index = 0
    while (true) {
      const counter = index ? ` (${index})` : ''
      const candidate = path.join(sourceDirectory, `${stem}-${suffix}${counter}`)
      if (!reservedOutputs.has(candidate) && !fs.existsSync(candidate)) {
        reservedOutputs.add(candidate)
        return candidate
      }
      index += 1
    }
  }

  async function atomicCommit(stagePath, outputPath, job) {
    throwIfCancelled(job)
    if (!(await isUsableFile(stagePath))) throw new UtilityError('转换结果为空', 'ERR_UTILITY_OUTPUT')
    try {
      await fs.promises.copyFile(stagePath, outputPath, fs.constants.COPYFILE_EXCL)
      await fs.promises.unlink(stagePath)
    } catch (error) {
      throw new UtilityError(error.code === 'EEXIST' ? '目标文件已存在，请重试' : `保存结果失败：${error.message}`, 'ERR_UTILITY_OUTPUT')
    }
    reservedOutputs.delete(outputPath)
    job.tempPaths.delete(stagePath)
    return outputPath
  }

  async function atomicCommitDirectory(stagePath, outputPath, job) {
    throwIfCancelled(job)
    if (!(await pathExists(stagePath))) throw new UtilityError('拆分结果为空', 'ERR_UTILITY_OUTPUT')
    if (await pathExists(outputPath)) throw new UtilityError('目标文件夹已存在，请重试', 'ERR_UTILITY_OUTPUT')
    try {
      await fs.promises.rename(stagePath, outputPath)
    } catch (renameError) {
      try {
        await fs.promises.cp(stagePath, outputPath, { recursive: true, force: false, errorOnExist: true })
        await removePath(stagePath)
      } catch (copyError) {
        await removePath(outputPath)
        throw new UtilityError(`保存拆分结果失败：${copyError.message || renameError.message}`, 'ERR_UTILITY_OUTPUT')
      }
    }
    reservedOutputs.delete(outputPath)
    job.tempPaths.delete(stagePath)
    return outputPath
  }

  async function validatePdf(pdfcpu, filePath, job, emit, percent = 86) {
    if (!(await isUsableFile(filePath))) throw new UtilityError('输出 PDF 不存在或为空', 'ERR_UTILITY_OUTPUT')
    const header = Buffer.alloc(5)
    const handle = await fs.promises.open(filePath, 'r')
    try { await handle.read(header, 0, 5, 0) } finally { await handle.close() }
    if (header.toString('ascii') !== '%PDF-') throw new UtilityError('输出文件不是有效 PDF', 'ERR_UTILITY_OUTPUT')
    emitProgress(emit, job.id, '校验结果', '正在严格校验 PDF', percent)
    await runCommand(pdfcpu, pdfcpuCommand(['validate', '-m', 'strict', '--', filePath]), { job, platform })
  }

  async function validateDocx(filePath, job) {
    if (!(await isUsableFile(filePath))) throw new UtilityError('输出 DOCX 不存在或为空', 'ERR_UTILITY_OUTPUT')
    const handle = await fs.promises.open(filePath, 'r')
    const header = Buffer.alloc(4)
    try { await handle.read(header, 0, 4, 0) } finally { await handle.close() }
    if (header.readUInt32LE(0) !== 0x04034b50) throw new UtilityError('输出文件不是有效 DOCX', 'ERR_UTILITY_OUTPUT')
    if (platform === 'win32') {
      const tar = process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar.exe'
      const result = await runCommand(tar, ['-tf', filePath], { job, platform })
      if (!/\[Content_Types\]\.xml/i.test(result.stdout) || !/word[\\/]document\.xml/i.test(result.stdout)) throw new UtilityError('DOCX 内容结构不完整', 'ERR_UTILITY_OUTPUT')
    } else if (options.unzipPath || platform === 'darwin') {
      const unzip = options.unzipPath || 'unzip'
      const result = await runCommand(unzip, ['-t', filePath], { job, platform })
      if (!/\[Content_Types\]\.xml/i.test(result.stdout) || !/word[\\/]document\.xml/i.test(result.stdout)) throw new UtilityError('DOCX 内容结构不完整', 'ERR_UTILITY_OUTPUT')
    }
  }

  async function validatePptx(filePath, job) {
    if (!(await isUsableFile(filePath))) throw new UtilityError('输出 PPTX 不存在或为空', 'ERR_UTILITY_OUTPUT')
    const handle = await fs.promises.open(filePath, 'r')
    const header = Buffer.alloc(4)
    try { await handle.read(header, 0, 4, 0) } finally { await handle.close() }
    if (header.readUInt32LE(0) !== 0x04034b50) throw new UtilityError('输出文件不是有效 PPTX', 'ERR_UTILITY_OUTPUT')
    const tar = platform === 'win32' ? (process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32', 'tar.exe') : 'tar.exe') : 'unzip'
    const args = platform === 'win32' ? ['-tf', filePath] : ['-t', filePath]
    const result = await runCommand(tar, args, { job, platform })
    if (!/\[Content_Types\]\.xml/i.test(result.stdout) || !/ppt[\\/]presentation\.xml/i.test(result.stdout)) throw new UtilityError('PPTX 内容结构不完整', 'ERR_UTILITY_OUTPUT')
  }

  async function renderPdfPages(pdfium, sourcePath, outputDirectory, job, emit) {
    const { PNG } = require('pngjs')
    const source = await fs.promises.readFile(sourcePath)
    const document = await pdfium.loadDocument(source)
    const pages = []
    try {
      const count = document.getPageCount()
      if (!count) throw new UtilityError('PDF 没有可处理的页面', 'ERR_UTILITY_INPUT')
      await fs.promises.mkdir(outputDirectory, { recursive: true })
      for (let index = 0; index < count; index += 1) {
        throwIfCancelled(job)
        const page = document.getPage(index)
        const size = page.getOriginalSize()
        const text = page.getText()
        const render = await page.render({ scale: 2, colorSpace: 'BGRA', transparent: false })
        const pngData = PNG.sync.write({ width: render.width, height: render.height, data: Buffer.from(render.data) })
        const imagePath = path.join(outputDirectory, `page-${String(index + 1).padStart(4, '0')}.png`)
        await fs.promises.writeFile(imagePath, pngData)
        pages.push({ imagePath, text, width: size.originalWidth, height: size.originalHeight })
        emitProgress(emit, job.id, '转换文件', `正在处理第 ${index + 1} / ${count} 页`, 55 + ((index + 1) / count) * 30, { bytes: { downloaded: index + 1, total: count } })
      }
    } finally {
      document.destroy()
    }
    return pages
  }

  async function createPdfPptx(pages, outputPath) {
    const pptxgen = require('pptxgenjs')
    const pptx = new pptxgen()
    const first = pages[0]
    const layoutName = 'CREWFLOW_PDF_PAGE'
    pptx.defineLayout({ name: layoutName, width: first.width / 72, height: first.height / 72 })
    pptx.layout = layoutName
    pptx.author = 'CrewFlow'
    pptx.subject = 'PDF conversion'
    for (const page of pages) {
      const slide = pptx.addSlide()
      const data = (await fs.promises.readFile(page.imagePath)).toString('base64')
      const scale = Math.min(first.width / page.width, first.height / page.height)
      const width = page.width * scale / 72
      const height = page.height * scale / 72
      slide.background = { color: 'FFFFFF' }
      slide.addImage({ data: `data:image/png;base64,${data}`, x: (first.width / 72 - width) / 2, y: (first.height / 72 - height) / 2, w: width, h: height })
    }
    await pptx.writeFile({ fileName: outputPath })
  }

  async function convertWithLibreOffice(soffice, sourcePath, targetFormat, stageDirectory, job, emit) {
    const profile = path.join(stageDirectory, 'profile')
    await fs.promises.mkdir(profile, { recursive: true })
    const outputDirectory = path.join(stageDirectory, 'output')
    await fs.promises.mkdir(outputDirectory, { recursive: true })
    const args = [
      '--headless', '--norestore', '--nodefault', '--nolockcheck', '--nofirststartwizard',
      `-env:UserInstallation=${pathToFileURL(profile).href}`,
    ]
    args.push('--convert-to', targetFormat, '--outdir', outputDirectory, sourcePath)
    emitProgress(emit, job.id, '转换文件', `正在转换为 ${targetFormat.toUpperCase()}`, 58)
    await runCommand(soffice, args, { job, platform, emit, jobId: job.id, phase: '转换文件', message: 'LibreOffice 正在处理文件', percent: 68 })
    const expected = path.join(outputDirectory, `${path.basename(sourcePath, path.extname(sourcePath))}.${targetFormat}`)
    if (await isUsableFile(expected)) return expected
    const candidates = (await fs.promises.readdir(outputDirectory)).filter((name) => cleanExtension(name) === targetFormat)
    if (candidates.length === 1) return path.join(outputDirectory, candidates[0])
    throw new UtilityError('LibreOffice 未生成预期格式的文件', 'ERR_UTILITY_OUTPUT')
  }

  async function convertDocument(payload = {}, emit) {
    const sourcePath = path.resolve(String(payload.sourcePath || ''))
    const targetFormat = String(payload.targetFormat || '').replace(/^\./, '').toLowerCase()
    const sourcePaths = Array.isArray(payload.sourcePaths) && payload.sourcePaths.length
      ? [...new Set(payload.sourcePaths.map((value) => path.resolve(String(value))))]
      : [sourcePath]
    const job = getJob(payload.jobId)
    let outputPath = ''
    let outputDirectoryPath = ''
    let outputPaths = []
    try {
      if (sourcePaths[0] !== sourcePath || sourcePaths.length > 200) throw new UtilityError('选择的文件列表无效', 'ERR_UTILITY_INPUT')
      if (!(await isUsableFile(sourcePath))) throw new UtilityError('源文件不存在或为空', 'ERR_UTILITY_INPUT')
      const sourceExtension = cleanExtension(sourcePath)
      if (UNSUPPORTED_AUDIO_EXTENSIONS.includes(sourceExtension)) throw new UtilityError('此专属音频格式暂不支持，请先在原软件中导出常用音频格式', 'ERR_AUDIO_FORMAT')
      if (!conversionTargets(sourceExtension).includes(targetFormat)) throw new UtilityError('不支持的转换格式', 'ERR_UTILITY_FORMAT')
      if (sourcePaths.length > 1 && (targetFormat !== 'pdf' || !sourcePaths.every((file) => IMAGE_EXTENSIONS.includes(cleanExtension(file))))) {
        throw new UtilityError('多个文件仅支持图片合成 PDF，文档和音视频请一次选择一个', 'ERR_UTILITY_INPUT')
      }
      for (const file of sourcePaths) if (!(await isUsableFile(file))) throw new UtilityError('部分源文件不存在或为空', 'ERR_UTILITY_INPUT')
      const officeToPdf = isOfficeExtension(sourceExtension) && targetFormat === 'pdf'
      const stageDirectory = await createStageDirectory('convert', job)
      emitProgress(emit, job.id, '准备转换', '正在准备转换环境', 4)
      let stageOutput
      let isDirectory = false
      let warning = ''
      let outputExtension = targetFormat
      if (VIDEO_EXTENSIONS.includes(sourceExtension) && targetFormat === 'mp4') {
        const result = await audioRuntime.convertVideo(sourcePath, stageDirectory, job, emit)
        stageOutput = result.outputPath
        warning = result.warning
      } else if (audioTargets(sourceExtension).length) {
        const result = await audioRuntime.convert(sourcePath, targetFormat, stageDirectory, job, emit)
        stageOutput = result.outputPath
        outputExtension = result.outputFormat
        warning = result.warning
      } else if (officeToPdf) {
        const soffice = await getSoffice(job, emit)
        const stagePdfcpu = await getPdfcpu(job, emit)
        stageOutput = await convertWithLibreOffice(soffice, sourcePath, targetFormat, stageDirectory, job, emit)
        await validatePdf(stagePdfcpu, stageOutput, job, emit)
      } else if (sourceExtension === 'pdf' && targetFormat === 'pptx') {
        const pdfium = await getPdfium(job, emit)
        const pages = await renderPdfPages(pdfium, sourcePath, path.join(stageDirectory, 'pages'), job, emit)
        stageOutput = path.join(stageDirectory, 'output.pptx')
        await createPdfPptx(pages, stageOutput)
        warning = '已逐页转换为图片版 PPT，页面内的文字不可直接编辑'
      } else {
        let workerSource = sourcePath
        if (['doc', 'xls', 'xlsx'].includes(sourceExtension)) {
          const soffice = await getSoffice(job, emit)
          workerSource = await convertWithLibreOffice(soffice, sourcePath, sourceExtension === 'doc' ? 'docx' : 'xlsx', stageDirectory, job, emit)
        }
        const result = await conversionRuntime.convert({
          sourcePath: workerSource,
          originalSourcePath: sourceExtension === 'xlsx' ? sourcePath : undefined,
          sourcePaths: workerSource === sourcePath ? sourcePaths : [workerSource],
          targetFormat,
          outputPath: path.join(stageDirectory, `output.${targetFormat}`),
        }, stageDirectory, job, emit)
        stageOutput = result.outputPath
        isDirectory = Boolean(result.isDirectory)
        warning = result.warning || ''
        const relative = path.relative(stageDirectory, path.resolve(stageOutput))
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new UtilityError('转换输出路径无效', 'ERR_UTILITY_OUTPUT')
      }
      if (isDirectory) {
        outputDirectoryPath = reserveSiblingDirectory(sourcePath, '图片')
        outputPaths = [await atomicCommitDirectory(stageOutput, outputDirectoryPath, job)]
      } else {
        if (targetFormat === 'docx') await validateDocx(stageOutput, job)
        if (targetFormat === 'pptx') await validatePptx(stageOutput, job)
        outputPath = reserveSibling(sourcePath, outputExtension, sourcePaths.length > 1 ? '合并' : '')
        outputPaths = [await atomicCommit(stageOutput, outputPath, job)]
      }
      emitProgress(emit, job.id, '完成', '转换完成', 100)
      return { jobId: job.id, sourcePath, targetFormat, outputPath: outputPaths[0] || outputDirectoryPath, outputPaths, warning }
    } catch (error) {
      if (outputPath) reservedOutputs.delete(outputPath)
      if (outputDirectoryPath) reservedOutputs.delete(outputDirectoryPath)
      for (const output of outputPaths) reservedOutputs.delete(output)
      emitProgress(emit, job.id, error.code === 'ERR_UTILITY_CANCELLED' ? '已取消' : '失败', error.message, 100)
      throw error
    } finally {
      for (const temporary of job.tempPaths) await removePath(temporary)
      finishJob(job)
    }
  }

  async function runPdfTool(payload = {}, emit) {
    const requestedOperation = String(payload.operation || '').toLowerCase()
    const operation = requestedOperation === 'compress' ? 'optimize' : requestedOperation
    const sourcePaths = Array.isArray(payload.sourcePaths) ? payload.sourcePaths.map((value) => path.resolve(String(value))) : []
    const job = getJob(payload.jobId)
    let outputPaths = []
    let outputPath = ''
    let outputDirectoryPath = ''
    try {
      if (!['validate', 'merge', 'split', 'optimize'].includes(operation)) throw new UtilityError('不支持的 PDF 操作', 'ERR_UTILITY_FORMAT')
      if (!sourcePaths.length || !(await Promise.all(sourcePaths.map(isUsableFile))).every(Boolean)) throw new UtilityError('源 PDF 不存在或为空', 'ERR_UTILITY_INPUT')
      if (!sourcePaths.every(isPdfPath)) throw new UtilityError('PDF 工具只接受 PDF 文件', 'ERR_UTILITY_FORMAT')
      const pdfcpu = await getPdfcpu(job, emit)
      if (operation === 'validate') {
        emitProgress(emit, job.id, '校验 PDF', '正在严格校验 PDF', 50)
        for (const sourcePath of sourcePaths) await validatePdf(pdfcpu, sourcePath, job, emit, 70)
        emitProgress(emit, job.id, '完成', 'PDF 校验通过', 100)
        return { jobId: job.id, operation: requestedOperation, sourcePaths, outputPaths: [] }
      }
      const sourcePath = sourcePaths[0]
      const stageDirectory = await createStageDirectory('pdf', job)
      if (operation === 'merge') {
        if (sourcePaths.length < 2) throw new UtilityError('合并至少需要两个 PDF', 'ERR_UTILITY_INPUT')
        outputPath = reserveSibling(sourcePath, 'pdf', 'merged')
        const stageOutput = path.join(stageDirectory, 'merged.pdf')
        emitProgress(emit, job.id, '合并 PDF', '正在合并 PDF', 55)
        await runCommand(pdfcpu, pdfcpuCommand(['merge', '--bookmark-mode', 'preserve', stageOutput, ...sourcePaths]), { job, platform })
        await validatePdf(pdfcpu, stageOutput, job, emit, 84)
        outputPaths = [await atomicCommit(stageOutput, outputPath, job)]
      } else if (operation === 'optimize') {
        outputPath = reserveSibling(sourcePath, 'pdf', 'optimized')
        const stageOutput = path.join(stageDirectory, 'optimized.pdf')
        emitProgress(emit, job.id, '优化 PDF', '正在优化 PDF', 55)
        await runCommand(pdfcpu, pdfcpuCommand(['optimize', sourcePath, stageOutput]), { job, platform })
        await validatePdf(pdfcpu, stageOutput, job, emit, 84)
        const [sourceStat, optimizedStat] = await Promise.all([fs.promises.stat(sourcePath), fs.promises.stat(stageOutput)])
        if (optimizedStat.size >= sourceStat.size) throw new UtilityError('优化后文件没有变小，已取消保存', 'ERR_UTILITY_OUTPUT_NOT_SMALLER')
        outputPaths = [await atomicCommit(stageOutput, outputPath, job)]
      } else {
        const splitDirectory = path.join(stageDirectory, 'split')
        await fs.promises.mkdir(splitDirectory, { recursive: true })
        const splitArgs = ['split', sourcePath, splitDirectory]
        const mode = payload.mode === 'bookmark' || payload.mode === 'page' ? payload.mode : 'span'
        if (mode !== 'span') splitArgs.splice(1, 0, '-m', mode)
        if (payload.pageSelection) splitArgs.push(...String(payload.pageSelection).split(/[,\s]+/).filter(Boolean))
        else if (payload.span) splitArgs.push(String(payload.span))
        emitProgress(emit, job.id, '拆分 PDF', '正在拆分 PDF', 55)
        await runCommand(pdfcpu, pdfcpuCommand(splitArgs), { job, platform })
        const generated = []
        const pending = [splitDirectory]
        while (pending.length) {
          const current = pending.pop()
          for (const entry of await fs.promises.readdir(current, { withFileTypes: true })) {
            const candidate = path.join(current, entry.name)
            if (entry.isDirectory()) pending.push(candidate)
            else if (isPdfPath(candidate)) generated.push(candidate)
          }
        }
        generated.sort((left, right) => path.basename(left).localeCompare(path.basename(right), undefined, { numeric: true }))
        if (!generated.length) throw new UtilityError('拆分没有生成 PDF', 'ERR_UTILITY_OUTPUT')
        outputDirectoryPath = reserveSiblingDirectory(sourcePath, '拆分')
        for (let index = 0; index < generated.length; index += 1) {
          const generatedPath = generated[index]
          await validatePdf(pdfcpu, generatedPath, job, emit, 72 + (index / generated.length) * 14)
        }
        await atomicCommitDirectory(splitDirectory, outputDirectoryPath, job)
        outputPaths = generated.map((generatedPath) => path.join(outputDirectoryPath, path.relative(splitDirectory, generatedPath)))
      }
      emitProgress(emit, job.id, '完成', 'PDF 操作完成', 100)
      return { jobId: job.id, operation: requestedOperation, sourcePaths, outputPath: outputPaths[0] || '', outputPaths }
    } catch (error) {
      if (outputPath) reservedOutputs.delete(outputPath)
      if (outputDirectoryPath) reservedOutputs.delete(outputDirectoryPath)
      for (const output of outputPaths) reservedOutputs.delete(output)
      emitProgress(emit, job.id, error.code === 'ERR_UTILITY_CANCELLED' ? '已取消' : '失败', error.message, 100)
      throw error
    } finally {
      for (const temporary of job.tempPaths) await removePath(temporary)
      finishJob(job)
    }
  }

  function cancel(jobId) {
    const job = jobs.get(String(jobId))
    if (!job) return false
    job.cancelled = true
    for (const controller of job.controllers) controller.abort()
    for (const child of job.children) killChildTree(child, platform)
    return true
  }

  return { convertDocument, runPdfTool, cancel }
}

module.exports = {
  createUtilityToolsService,
  LIBREOFFICE_ASSETS,
  PDFCPU_ASSETS,
  PDFIUM_ASSET,
  conversionTargets,
}

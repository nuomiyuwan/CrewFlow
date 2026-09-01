const { execFile } = require('child_process')
const path = require('path')

const mountCacheTtlMs = 2_000
let mountCache = { platform: '', expiresAt: 0, mounts: [] }
let mountLoadPromise = null

function runCommand(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: 5_000,
      windowsHide: true,
    }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

function safelyDecode(value) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function decodeMountValue(value) {
  const unescaped = value
    .replace(/\\040/g, ' ')
    .replace(/\\011/g, '\t')
    .replace(/\\012/g, '\n')
    .replace(/\\134/g, '\\')
  return safelyDecode(unescaped)
}

function hasControlCharacter(value) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)
    return codePoint < 32 || codePoint === 127
  })
}

function cleanHost(value) {
  const host = String(value || '').trim().replace(/^\[|\]$/g, '').toLowerCase()
  if (!host || hasControlCharacter(host) || /[\s/@\\]/.test(host)) return ''
  try {
    const authority = host.includes(':') ? `[${host}]` : host
    return new URL(`smb://${authority}`).hostname.replace(/^\[|\]$/g, '').toLowerCase()
  } catch {
    return ''
  }
}

function cleanPathSegment(value) {
  const segment = String(value || '').trim()
  if (!segment || segment === '.' || segment === '..' || hasControlCharacter(segment) || /[/\\]/.test(segment)) return ''
  return segment
}

function cleanRelativeSegments(value) {
  const source = Array.isArray(value) ? value : String(value || '').split(/[\\/]+/)
  const segments = []
  for (const rawSegment of source) {
    if (!rawSegment || rawSegment === '.') continue
    const segment = cleanPathSegment(rawSegment)
    if (!segment) return null
    segments.push(segment)
  }
  return segments
}

function buildLibraryNetworkPath(hostValue, shareValue, relativeValue = '') {
  const host = cleanHost(hostValue)
  const share = cleanPathSegment(shareValue)
  const relativeSegments = cleanRelativeSegments(relativeValue)
  if (!host || !share || !relativeSegments) return ''
  const authority = host.includes(':') ? `[${host}]` : host
  const pathname = [share, ...relativeSegments].map((segment) => encodeURIComponent(segment)).join('/')
  return `smb://${authority}/${pathname}`
}

function parseLibraryNetworkPath(value) {
  const source = typeof value === 'string' ? value.trim() : ''
  const match = source.match(/^smb:\/\/([^/?#]+)(\/[^?#]*)?$/i)
  if (!match || match[1].includes('@')) return null
  const rawSegments = (match[2] || '').split('/').filter(Boolean).map(safelyDecode)
  if (rawSegments.length === 0 || cleanRelativeSegments(rawSegments) === null) return null
  const host = cleanHost(match[1])
  const share = cleanPathSegment(rawSegments[0])
  const relativeSegments = cleanRelativeSegments(rawSegments.slice(1))
  if (!host || !share || !relativeSegments) return null
  return {
    host,
    share,
    relativeSegments,
    networkPath: buildLibraryNetworkPath(host, share, relativeSegments),
  }
}

function parseUncPath(value) {
  let source = typeof value === 'string' ? value.trim() : ''
  if (/^\\\\\?\\UNC\\/i.test(source)) source = `\\\\${source.slice(8)}`
  source = source.replace(/\//g, '\\')
  if (!source.startsWith('\\\\')) return null
  const parts = source.slice(2).split('\\').filter(Boolean)
  if (parts.length < 2) return null
  const host = cleanHost(parts[0])
  const share = cleanPathSegment(parts[1])
  const relativeSegments = cleanRelativeSegments(parts.slice(2))
  if (!host || !share || !relativeSegments) return null
  return {
    host,
    share,
    relativeSegments,
    networkPath: buildLibraryNetworkPath(host, share, relativeSegments),
  }
}

function parseMacSmbMountLine(value) {
  const line = String(value || '')
  const optionsStart = line.lastIndexOf(' (')
  if (!line.startsWith('//') || optionsStart < 0 || !line.endsWith(')')) return null
  const options = line.slice(optionsStart + 2, -1).split(',').map((entry) => entry.trim())
  if (!options.includes('smbfs')) return null
  const body = line.slice(2, optionsStart)
  const mountSeparator = body.indexOf(' on /')
  if (mountSeparator < 0) return null
  const source = body.slice(0, mountSeparator)
  const separatorIndex = source.indexOf('/')
  if (separatorIndex < 1) return null
  const authority = source.slice(0, separatorIndex)
  const host = cleanHost(authority.slice(authority.lastIndexOf('@') + 1))
  const share = cleanPathSegment(decodeMountValue(source.slice(separatorIndex + 1)))
  const mountPath = decodeMountValue(body.slice(mountSeparator + 4))
  if (!host || !share || !mountPath.startsWith('/')) return null
  return { host, share, mountPath }
}

function parseWindowsMappings(value) {
  try {
    const parsed = JSON.parse(String(value || '').replace(/^\uFEFF/, '').trim() || '[]')
    const entries = Array.isArray(parsed) ? parsed : [parsed]
    return entries.flatMap((entry) => {
      const drive = typeof entry?.DeviceID === 'string' ? entry.DeviceID.trim().toUpperCase() : ''
      const unc = parseUncPath(entry?.ProviderName)
      if (!/^[A-Z]:$/.test(drive) || !unc) return []
      return [{ host: unc.host, share: unc.share, mountPath: `${drive}\\` }]
    })
  } catch {
    return []
  }
}

async function loadMacSmbMounts() {
  try {
    const output = await runCommand('/sbin/mount', ['-t', 'smbfs'])
    return output.split(/\r?\n/).map(parseMacSmbMountLine).filter(Boolean)
  } catch {
    return []
  }
}

async function loadWindowsSmbMounts() {
  const script = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType = 4' | Select-Object DeviceID,ProviderName) | ConvertTo-Json -Compress"
  try {
    return parseWindowsMappings(await runCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]))
  } catch {
    return []
  }
}

function windowsNetworkPathExists(filePath, timeout = 1_500) {
  if (!parseUncPath(filePath)) return Promise.resolve(false)
  const script = 'if (Test-Path -LiteralPath $env:CREWFLOW_LIBRARY_NETWORK_PATH) { exit 0 } else { exit 1 }'
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      env: { ...process.env, CREWFLOW_LIBRARY_NETWORK_PATH: filePath },
      maxBuffer: 64 * 1024,
      timeout,
      windowsHide: true,
    }, (error) => resolve(!error))
  })
}

function macPathExists(filePath, timeout = 1_500) {
  if (typeof filePath !== 'string' || !filePath.startsWith('/')) return Promise.resolve(false)
  return new Promise((resolve) => {
    execFile('/bin/test', ['-e', filePath], {
      timeout,
      windowsHide: true,
    }, (error) => resolve(!error))
  })
}

function clearLibraryNetworkMountCache() {
  mountCache = { platform: '', expiresAt: 0, mounts: [] }
}

async function currentSmbMounts(platform = process.platform, refresh = false) {
  const now = Date.now()
  if (!refresh && mountCache.platform === platform && mountCache.expiresAt > now) return mountCache.mounts
  if (!refresh && mountLoadPromise) return mountLoadPromise
  mountLoadPromise = (platform === 'darwin'
    ? loadMacSmbMounts()
    : platform === 'win32'
      ? loadWindowsSmbMounts()
      : Promise.resolve([])
  ).then((mounts) => {
    mountCache = { platform, expiresAt: Date.now() + mountCacheTtlMs, mounts }
    return mounts
  }).finally(() => {
    mountLoadPromise = null
  })
  return mountLoadPromise
}

function relativePathWithinMount(sourcePath, mountPath, platform) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix
  const relativePath = pathApi.relative(pathApi.resolve(mountPath), pathApi.resolve(sourcePath))
  if (relativePath === '') return []
  if (relativePath === '..' || relativePath.startsWith(`..${pathApi.sep}`) || pathApi.isAbsolute(relativePath)) return null
  return cleanRelativeSegments(relativePath)
}

async function identifyLibraryNetworkPath(sourcePath, platform = process.platform) {
  const directNetworkPath = parseLibraryNetworkPath(sourcePath)
  if (directNetworkPath) return directNetworkPath.networkPath

  const unc = parseUncPath(sourcePath)
  if (unc) return unc.networkPath

  if (typeof sourcePath !== 'string' || !sourcePath.trim()) return ''
  const mounts = await currentSmbMounts(platform)
  const matches = mounts.flatMap((mount) => {
    const relativeSegments = relativePathWithinMount(sourcePath, mount.mountPath, platform)
    if (!relativeSegments) return []
    return [{ mount, relativeSegments }]
  }).sort((left, right) => right.mount.mountPath.length - left.mount.mountPath.length)
  const match = matches[0]
  return match ? buildLibraryNetworkPath(match.mount.host, match.mount.share, match.relativeSegments) : ''
}

async function resolveLibraryNetworkPath(networkPath, platform = process.platform, refresh = false) {
  const parsed = parseLibraryNetworkPath(networkPath)
  if (!parsed) return ''
  if (platform === 'win32') {
    return `\\\\${parsed.host}\\${parsed.share}${parsed.relativeSegments.length ? `\\${parsed.relativeSegments.join('\\')}` : ''}`
  }
  if (platform !== 'darwin') return ''
  const mounts = await currentSmbMounts(platform, refresh)
  const mount = mounts.find((entry) => entry.host === parsed.host && entry.share.toLowerCase() === parsed.share.toLowerCase())
  if (!mount) return ''
  return path.join(mount.mountPath, ...parsed.relativeSegments)
}

function libraryNetworkLoginTarget(networkPath, platform = process.platform) {
  const parsed = parseLibraryNetworkPath(networkPath)
  if (!parsed) return ''
  if (platform === 'win32') return `\\\\${parsed.host}\\${parsed.share}`
  if (platform === 'darwin') return buildLibraryNetworkPath(parsed.host, parsed.share)
  return ''
}

module.exports = {
  buildLibraryNetworkPath,
  clearLibraryNetworkMountCache,
  identifyLibraryNetworkPath,
  libraryNetworkLoginTarget,
  macPathExists,
  parseLibraryNetworkPath,
  parseMacSmbMountLine,
  parseUncPath,
  parseWindowsMappings,
  resolveLibraryNetworkPath,
  windowsNetworkPathExists,
}

const CREWFLOW_OWNER = 'nuomiyuwan'
const CREWFLOW_REPO = 'CrewFlow'
const GITCODE_LATEST_RELEASE_URL = `https://api.gitcode.com/api/v5/repos/${CREWFLOW_OWNER}/${CREWFLOW_REPO}/releases/latest`
const GITHUB_LATEST_RELEASE_URL = `https://api.github.com/repos/${CREWFLOW_OWNER}/${CREWFLOW_REPO}/releases/latest`

function cleanReleaseVersion(value) {
  const version = typeof value === 'string' ? value.trim().replace(/^v/i, '') : ''
  return /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version) ? version : ''
}

function releaseTag(version) {
  const cleanVersion = cleanReleaseVersion(version)
  if (!cleanVersion) throw new Error('版本信息无效')
  return `v${cleanVersion}`
}

function cleanAssetName(value) {
  const name = typeof value === 'string' ? value.trim() : ''
  if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\\')) return ''
  return name
}

function gitCodeReleaseAssetUrl(version, name) {
  const assetName = cleanAssetName(name)
  if (!assetName) throw new Error('更新文件名称无效')
  return `https://gitcode.com/${CREWFLOW_OWNER}/${CREWFLOW_REPO}/releases/download/${releaseTag(version)}/${encodeURIComponent(assetName)}`
}

function gitHubReleaseAssetUrl(version, name) {
  const assetName = cleanAssetName(name)
  if (!assetName) throw new Error('更新文件名称无效')
  return `https://github.com/${CREWFLOW_OWNER}/${CREWFLOW_REPO}/releases/download/${releaseTag(version)}/${encodeURIComponent(assetName)}`
}

function gitCodeReleasePageUrl(version) {
  return `https://gitcode.com/${CREWFLOW_OWNER}/${CREWFLOW_REPO}/releases/${releaseTag(version)}`
}

function parseSha256Manifest(value) {
  const digests = new Map()
  if (typeof value !== 'string') return digests

  for (const line of value.split(/\r?\n/)) {
    const match = line.trim().match(/^([a-f\d]{64})\s+\*?(.+)$/i)
    if (!match) continue
    const name = cleanAssetName(match[2].trim().replace(/^.*[\\/]/, ''))
    if (name) digests.set(name, `sha256:${match[1].toLowerCase()}`)
  }

  return digests
}

function normalizeReleaseNotes(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function parseGitCodeRelease(payload, checksumText = '') {
  if (!payload || typeof payload !== 'object') throw new Error('GitCode 版本信息无效')
  const version = cleanReleaseVersion(payload.tag_name)
  if (!version) throw new Error('GitCode 未找到正式版本号')
  const digests = parseSha256Manifest(checksumText)
  const rawAssets = Array.isArray(payload.assets) ? payload.assets : []
  const assets = rawAssets
    .filter((asset) => asset?.type === 'attach')
    .map((asset) => {
      const name = cleanAssetName(asset?.name)
      if (!name) return null
      return {
        name,
        url: gitCodeReleaseAssetUrl(version, name),
        fallbackUrl: gitHubReleaseAssetUrl(version, name),
        digest: digests.get(name),
      }
    })
    .filter(Boolean)

  return {
    version,
    url: gitCodeReleasePageUrl(version),
    notes: normalizeReleaseNotes(payload.body),
    source: 'gitcode',
    assets,
  }
}

function parseGitHubRelease(payload) {
  if (!payload || typeof payload !== 'object') throw new Error('GitHub 版本信息无效')
  const version = cleanReleaseVersion(payload.tag_name)
  if (!version) throw new Error('GitHub 未找到正式版本号')
  const rawAssets = Array.isArray(payload.assets) ? payload.assets : []
  const assets = rawAssets
    .map((asset) => {
      const name = cleanAssetName(asset?.name)
      if (!name) return null
      return {
        name,
        url: gitHubReleaseAssetUrl(version, name),
        digest: typeof asset?.digest === 'string' && /^sha256:[a-f\d]{64}$/i.test(asset.digest.trim())
          ? asset.digest.trim().toLowerCase()
          : undefined,
      }
    })
    .filter(Boolean)

  return {
    version,
    url: `https://github.com/${CREWFLOW_OWNER}/${CREWFLOW_REPO}/releases/tag/${releaseTag(version)}`,
    notes: normalizeReleaseNotes(payload.body),
    source: 'github',
    assets,
  }
}

function hasPlatformAssets(release, platform) {
  const names = release.assets.map((asset) => asset.name)
  if (platform === 'darwin') return names.some((name) => /macOS-(?:universal|arm64|x64)\.dmg$/i.test(name))
  if (platform === 'win32') {
    return names.some((name) => /Windows-x64-Setup\.exe$/i.test(name)) && names.some((name) => name === 'latest.yml')
  }
  return names.some((name) => /\.(?:dmg|exe)$/i.test(name))
}

function assertReleaseComplete(release, platform) {
  if (!release?.version || !release?.url || !Array.isArray(release.assets) || !hasPlatformAssets(release, platform)) {
    throw new Error(`${release?.source === 'gitcode' ? 'GitCode' : 'GitHub'} 安装包尚未上传完整`)
  }
  return release
}

async function fetchWithTimeout(fetchImpl, url, options = {}, timeoutMs = 6500) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function fetchJson(fetchImpl, url, options, timeoutMs) {
  const response = await fetchWithTimeout(fetchImpl, url, options, timeoutMs)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json()
}

async function fetchText(fetchImpl, url, options, timeoutMs) {
  const response = await fetchWithTimeout(fetchImpl, url, options, timeoutMs)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

async function fetchGitCodeLatestRelease({ fetchImpl = fetch, platform = process.platform, timeoutMs = 6500 } = {}) {
  const payload = await fetchJson(fetchImpl, GITCODE_LATEST_RELEASE_URL, { headers: { Accept: 'application/json' } }, timeoutMs)
  const preliminaryRelease = parseGitCodeRelease(payload)
  const checksumAsset = preliminaryRelease.assets.find((asset) => /SHA256SUMS\.txt$/i.test(asset.name))
  if (!checksumAsset) throw new Error('GitCode 安装包缺少校验文件')
  const checksumText = await fetchText(fetchImpl, checksumAsset.url, {}, timeoutMs)
  return assertReleaseComplete(parseGitCodeRelease(payload, checksumText), platform)
}

async function fetchGitHubLatestRelease({ fetchImpl = fetch, platform = process.platform, timeoutMs = 8000 } = {}) {
  const payload = await fetchJson(
    fetchImpl,
    GITHUB_LATEST_RELEASE_URL,
    { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'CrewFlow-Updater' } },
    timeoutMs,
  )
  return assertReleaseComplete(parseGitHubRelease(payload), platform)
}

async function fetchLatestCrewFlowRelease(options = {}) {
  try {
    return await fetchGitCodeLatestRelease(options)
  } catch (gitCodeError) {
    try {
      return await fetchGitHubLatestRelease(options)
    } catch (gitHubError) {
      const primaryMessage = gitCodeError instanceof Error ? gitCodeError.message : 'GitCode 不可用'
      const fallbackMessage = gitHubError instanceof Error ? gitHubError.message : 'GitHub 不可用'
      throw new Error(`版本检查失败：${primaryMessage}；备用源：${fallbackMessage}`)
    }
  }
}

function validateCrewFlowReleaseAssetUrl(value) {
  const assetUrl = new URL(typeof value === 'string' ? value : '')
  const expectedPrefix = `/${CREWFLOW_OWNER}/${CREWFLOW_REPO}/releases/download/`.toLowerCase()
  const host = assetUrl.hostname.toLowerCase()
  const source = host === 'gitcode.com' ? 'gitcode' : host === 'github.com' ? 'github' : ''
  if (
    assetUrl.protocol !== 'https:' ||
    !source ||
    assetUrl.username ||
    assetUrl.password ||
    assetUrl.search ||
    assetUrl.hash ||
    !assetUrl.pathname.toLowerCase().startsWith(expectedPrefix)
  ) {
    throw new Error('更新文件地址无效')
  }
  return { url: assetUrl.toString(), source }
}

function releaseFeedUrl(assetUrl) {
  const validated = validateCrewFlowReleaseAssetUrl(assetUrl)
  return new URL('./', validated.url).toString()
}

module.exports = {
  GITCODE_LATEST_RELEASE_URL,
  GITHUB_LATEST_RELEASE_URL,
  assertReleaseComplete,
  fetchGitCodeLatestRelease,
  fetchGitHubLatestRelease,
  fetchLatestCrewFlowRelease,
  gitCodeReleaseAssetUrl,
  gitCodeReleasePageUrl,
  gitHubReleaseAssetUrl,
  parseGitCodeRelease,
  parseGitHubRelease,
  parseSha256Manifest,
  releaseFeedUrl,
  validateCrewFlowReleaseAssetUrl,
}

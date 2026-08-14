import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  GITCODE_LATEST_RELEASE_URL,
  GITHUB_LATEST_RELEASE_URL,
  fetchLatestCrewFlowRelease,
  parseGitCodeRelease,
  parseSha256Manifest,
  releaseFeedUrl,
  validateCrewFlowReleaseAssetUrl,
} = require('../electron/update-source.cjs')

const gitCodePayload = {
  tag_name: 'v1.4.6',
  body: '国内镜像版本说明',
  assets: [
    { name: 'v1.4.6.zip', type: 'source', browser_download_url: 'https://test.gitcode.net/source.zip' },
    { name: 'CrewFlow-v1.4.6-SHA256SUMS.txt', type: 'attach' },
    { name: 'CrewFlow-v1.4.6-macOS-universal.dmg', type: 'attach' },
    { name: 'CrewFlow-v1.4.6-Windows-x64-Setup.exe', type: 'attach' },
    { name: 'latest.yml', type: 'attach' },
  ],
}

const checksumText = [
  `${'a'.repeat(64)}  release/CrewFlow-v1.4.6-macOS-universal.dmg`,
  `${'b'.repeat(64)}  release/CrewFlow-v1.4.6-Windows-x64-Setup.exe`,
].join('\n')

test('GitCode release assets use formal URLs and ignore generated source archives', () => {
  const release = parseGitCodeRelease(gitCodePayload, checksumText)
  assert.equal(release.source, 'gitcode')
  assert.equal(release.url, 'https://gitcode.com/nuomiyuwan/CrewFlow/releases/v1.4.6')
  assert.equal(release.assets.some((asset) => asset.name === 'v1.4.6.zip'), false)

  const dmg = release.assets.find((asset) => asset.name.endsWith('.dmg'))
  assert.equal(dmg.url, 'https://gitcode.com/nuomiyuwan/CrewFlow/releases/download/v1.4.6/CrewFlow-v1.4.6-macOS-universal.dmg')
  assert.equal(dmg.fallbackUrl, 'https://github.com/nuomiyuwan/CrewFlow/releases/download/v1.4.6/CrewFlow-v1.4.6-macOS-universal.dmg')
  assert.equal(dmg.digest, `sha256:${'a'.repeat(64)}`)
})

test('SHA256 parser accepts release-directory paths and ignores invalid lines', () => {
  const digests = parseSha256Manifest(`${checksumText}\nnot-a-checksum  file.exe`)
  assert.equal(digests.get('CrewFlow-v1.4.6-Windows-x64-Setup.exe'), `sha256:${'b'.repeat(64)}`)
  assert.equal(digests.has('file.exe'), false)
})

test('release asset validation only accepts official CrewFlow release URLs', () => {
  const valid = validateCrewFlowReleaseAssetUrl(
    'https://gitcode.com/nuomiyuwan/CrewFlow/releases/download/v1.4.6/CrewFlow-v1.4.6-Windows-x64-Setup.exe',
  )
  assert.equal(valid.source, 'gitcode')
  assert.equal(
    releaseFeedUrl(valid.url),
    'https://gitcode.com/nuomiyuwan/CrewFlow/releases/download/v1.4.6/',
  )
  assert.throws(() => validateCrewFlowReleaseAssetUrl('https://example.com/CrewFlow.exe'), /地址无效/)
  assert.throws(
    () => validateCrewFlowReleaseAssetUrl('https://gitcode.com/another/repo/releases/download/v1.4.6/CrewFlow.exe'),
    /地址无效/,
  )
})

test('latest release check prefers GitCode and falls back to GitHub', async () => {
  const requests = []
  const fetchImpl = async (url) => {
    requests.push(url)
    if (url === GITCODE_LATEST_RELEASE_URL) return new Response(JSON.stringify(gitCodePayload), { status: 200 })
    if (url.endsWith('SHA256SUMS.txt')) return new Response(checksumText, { status: 200 })
    throw new Error(`unexpected request: ${url}`)
  }
  const release = await fetchLatestCrewFlowRelease({ fetchImpl, platform: 'darwin' })
  assert.equal(release.source, 'gitcode')
  assert.equal(requests.includes(GITHUB_LATEST_RELEASE_URL), false)

  const fallbackFetch = async (url) => {
    if (url === GITCODE_LATEST_RELEASE_URL) return new Response('', { status: 503 })
    if (url === GITHUB_LATEST_RELEASE_URL) {
      return new Response(
        JSON.stringify({
          tag_name: 'v1.4.7',
          body: '备用源版本说明',
          assets: [{ name: 'CrewFlow-v1.4.7-macOS-universal.dmg', digest: `sha256:${'c'.repeat(64)}` }],
        }),
        { status: 200 },
      )
    }
    throw new Error(`unexpected request: ${url}`)
  }
  const fallback = await fetchLatestCrewFlowRelease({ fetchImpl: fallbackFetch, platform: 'darwin' })
  assert.equal(fallback.source, 'github')
  assert.equal(fallback.version, '1.4.7')
})

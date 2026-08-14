import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const {
  cleanupCompletedMacUpdateDownloads,
  cleanupCompletedWindowsUpdateDownloads,
  compareReleaseVersions,
  releaseVersionFromArtifactName,
} = require('../electron/update-cleanup.cjs')

async function temporaryDirectory(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'crewflow-update-cleanup-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  return directory
}

test('update cleanup recognizes current and legacy CrewFlow installer names', () => {
  assert.equal(releaseVersionFromArtifactName('CrewFlow-v1.4.5-macOS-universal.dmg'), '1.4.5')
  assert.equal(releaseVersionFromArtifactName('CrewFlow Setup 1.4.3.exe'), '1.4.3')
  assert.equal(releaseVersionFromArtifactName('another-app-v1.4.5.dmg'), '')
  assert.equal(compareReleaseVersions('1.4.5', '1.4.4'), 1)
  assert.equal(compareReleaseVersions('1.4.5', '1.4.6'), -1)
})

test('macOS cleanup removes completed legacy installers but preserves future and unrelated files', async (t) => {
  const updatesDirectory = await temporaryDirectory(t)
  const removedFiles = [
    'CrewFlow-v1.4.4-macOS-universal.dmg',
    'CrewFlow Setup 1.4.5.dmg',
    'CrewFlow-v1.4.3-macOS-universal.dmg.123.download',
  ]
  const retainedFiles = ['CrewFlow-v1.4.6-macOS-universal.dmg', 'another-app-v1.4.5.dmg', 'notes.txt']

  await Promise.all([...removedFiles, ...retainedFiles].map((fileName) => writeFile(path.join(updatesDirectory, fileName), fileName)))
  await cleanupCompletedMacUpdateDownloads({ currentVersion: '1.4.5', updatesDirectory })

  for (const fileName of removedFiles) {
    await assert.rejects(readFile(path.join(updatesDirectory, fileName)), { code: 'ENOENT' })
  }
  for (const fileName of retainedFiles) {
    assert.equal(await readFile(path.join(updatesDirectory, fileName), 'utf8'), fileName)
  }
})

test('Windows cleanup removes a completed pending update directory', async (t) => {
  const directory = await temporaryDirectory(t)
  const pendingDirectory = path.join(directory, 'pending')
  await mkdir(pendingDirectory)
  await writeFile(path.join(pendingDirectory, 'CrewFlow-v1.4.5-Windows-x64-Setup.exe'), 'installer')
  await writeFile(path.join(pendingDirectory, 'update-info.json'), '{}')

  await cleanupCompletedWindowsUpdateDownloads({ currentVersion: '1.4.5', pendingDirectory })
  await assert.rejects(readFile(path.join(pendingDirectory, 'update-info.json')), { code: 'ENOENT' })
})

test('Windows cleanup preserves a pending installer newer than the running app', async (t) => {
  const directory = await temporaryDirectory(t)
  const pendingDirectory = path.join(directory, 'pending')
  const installerPath = path.join(pendingDirectory, 'CrewFlow-v1.4.6-Windows-x64-Setup.exe')
  await mkdir(pendingDirectory)
  await writeFile(installerPath, 'installer')

  await cleanupCompletedWindowsUpdateDownloads({
    currentVersion: '1.4.5',
    pendingDirectory,
    markerCompleted: true,
  })
  assert.equal(await readFile(installerPath, 'utf8'), 'installer')
})

const fs = require('fs')
const path = require('path')

function releaseVersionParts(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(typeof value === 'string' ? value.trim() : '')
  return match ? match.slice(1).map(Number) : null
}

function compareReleaseVersions(first, second) {
  const firstParts = releaseVersionParts(first)
  const secondParts = releaseVersionParts(second)
  if (!firstParts || !secondParts) return null

  for (let index = 0; index < firstParts.length; index += 1) {
    if (firstParts[index] !== secondParts[index]) return firstParts[index] > secondParts[index] ? 1 : -1
  }
  return 0
}

function releaseVersionFromArtifactName(fileName) {
  const match = /^CrewFlow[^0-9]*(\d+\.\d+\.\d+)(?:[^0-9]|$)/i.exec(typeof fileName === 'string' ? fileName : '')
  return match ? match[1] : ''
}

function isCrewFlowInstaller(fileName, extension) {
  return Boolean(releaseVersionFromArtifactName(fileName)) && fileName.toLowerCase().includes(extension)
}

async function removeDirectoryIfEmpty(directory) {
  try {
    await fs.promises.rmdir(directory)
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'ENOTEMPTY') throw error
  }
}

async function cleanupCompletedMacUpdateDownloads({
  currentVersion,
  updatesDirectory,
  markerFileName = '',
  markerCompleted = false,
}) {
  if (markerCompleted && markerFileName.toLowerCase().endsWith('.dmg')) {
    await fs.promises.rm(path.join(updatesDirectory, path.basename(markerFileName)), { force: true })
  }

  let entries = []
  try {
    entries = await fs.promises.readdir(updatesDirectory, { withFileTypes: true })
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    return
  }

  await Promise.all(
    entries.map(async (entry) => {
      if (!entry.isFile() || !isCrewFlowInstaller(entry.name, '.dmg')) return
      const comparison = compareReleaseVersions(currentVersion, releaseVersionFromArtifactName(entry.name))
      if (comparison !== null && comparison >= 0) {
        await fs.promises.rm(path.join(updatesDirectory, entry.name), { force: true })
      }
    }),
  )
  await removeDirectoryIfEmpty(updatesDirectory)
}

async function cleanupCompletedWindowsUpdateDownloads({ currentVersion, pendingDirectory, markerCompleted = false }) {
  let entries = []
  try {
    entries = await fs.promises.readdir(pendingDirectory, { withFileTypes: true })
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
    return
  }

  const installerVersions = entries
    .filter((entry) => entry.isFile() && isCrewFlowInstaller(entry.name, '.exe'))
    .map((entry) => releaseVersionFromArtifactName(entry.name))
  const hasFutureInstaller = installerVersions.some((version) => compareReleaseVersions(currentVersion, version) === -1)
  const hasCompletedInstaller = installerVersions.some((version) => {
    const comparison = compareReleaseVersions(currentVersion, version)
    return comparison !== null && comparison >= 0
  })

  if ((markerCompleted || hasCompletedInstaller) && !hasFutureInstaller) {
    await fs.promises.rm(pendingDirectory, { recursive: true, force: true })
  }
}

module.exports = {
  cleanupCompletedMacUpdateDownloads,
  cleanupCompletedWindowsUpdateDownloads,
  compareReleaseVersions,
  releaseVersionFromArtifactName,
  releaseVersionParts,
}

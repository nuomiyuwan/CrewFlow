import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

export const maxLibraryFileBytes = 200 * 1024 * 1024

export class LibraryFileTooLargeError extends Error {
  constructor() {
    super('Library file exceeds the 200 MB limit')
    this.name = 'LibraryFileTooLargeError'
  }
}

function cleanLibraryFileId(value) {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error('Invalid library file id')
  return id
}

function cleanMetadata(metadata = {}) {
  const fileName = typeof metadata.fileName === 'string' ? path.basename(metadata.fileName.trim()).slice(0, 240) : ''
  if (!fileName) throw new Error('Library file name is required')
  return {
    fileName,
    mimeType: typeof metadata.mimeType === 'string' ? metadata.mimeType.trim().slice(0, 160) : 'application/octet-stream',
    size: Number.isFinite(metadata.size) ? Number(metadata.size) : 0,
    updatedAt: new Date().toISOString(),
  }
}

export function createLibraryFileStore({ directory, maxBytes = maxLibraryFileBytes } = {}) {
  if (!directory || typeof directory !== 'string') throw new Error('Library file directory is required')

  const pathsFor = (value) => {
    const id = cleanLibraryFileId(value)
    return {
      data: path.join(directory, `${id}.bin`),
      metadata: path.join(directory, `${id}.json`),
    }
  }

  async function write(id, bytes, metadata = {}) {
    const data = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
    if (data.byteLength > maxBytes) throw new LibraryFileTooLargeError()

    const paths = pathsFor(id)
    const clean = cleanMetadata({ ...metadata, size: data.byteLength })
    const dataTemp = `${paths.data}.${process.pid}.tmp`
    const metadataTemp = `${paths.metadata}.${process.pid}.tmp`

    await mkdir(directory, { recursive: true })
    try {
      await writeFile(dataTemp, data)
      await writeFile(metadataTemp, JSON.stringify(clean, null, 2), 'utf8')
      await rm(paths.data, { force: true })
      await rm(paths.metadata, { force: true })
      await rename(dataTemp, paths.data)
      await rename(metadataTemp, paths.metadata)
      return clean
    } catch (error) {
      await Promise.all([
        rm(dataTemp, { force: true }).catch(() => undefined),
        rm(metadataTemp, { force: true }).catch(() => undefined),
      ])
      throw error
    }
  }

  async function read(id) {
    const paths = pathsFor(id)
    const [data, rawMetadata] = await Promise.all([
      readFile(paths.data),
      readFile(paths.metadata, 'utf8'),
    ])
    if (data.byteLength > maxBytes) throw new LibraryFileTooLargeError()
    return {
      data,
      metadata: cleanMetadata({ ...JSON.parse(rawMetadata), size: data.byteLength }),
    }
  }

  async function info(id) {
    const paths = pathsFor(id)
    const [fileInfo, rawMetadata] = await Promise.all([
      stat(paths.data),
      readFile(paths.metadata, 'utf8'),
    ])
    return cleanMetadata({ ...JSON.parse(rawMetadata), size: fileInfo.size })
  }

  async function remove(id) {
    const paths = pathsFor(id)
    await Promise.all([
      rm(paths.data, { force: true }),
      rm(paths.metadata, { force: true }),
    ])
    return true
  }

  return { directory, info, read, remove, write }
}

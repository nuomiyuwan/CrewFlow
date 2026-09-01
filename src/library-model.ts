export type LibraryCollection = {
  id: string
  name: string
  order: number
  createdAt: string
  createdByAccountId: string
}

export type LibraryItemSourceType = 'uploaded' | 'path' | 'url'

export type LibraryItem = {
  id: string
  collectionId: string
  title: string
  sourceType: LibraryItemSourceType
  fileName?: string
  mimeType?: string
  extension?: string
  size?: number
  path?: string
  networkPath?: string
  url?: string
  note?: string
  createdAt: string
  updatedAt: string
  createdByAccountId: string
  createdByName: string
}

export type LibraryFileSelection = {
  path: string
  networkPath?: string
  fileName: string
  extension: string
  mimeType: string
  size: number
  uploadable: boolean
}

function createLibraryId(prefix: string) {
  if (typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function cleanLibraryText(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function cleanLibraryNetworkPath(value: unknown) {
  const networkPath = cleanLibraryText(value, 2_000)
  return /^smb:\/\/[^/?#@]+\/[^?#]+$/i.test(networkPath) ? networkPath : ''
}

export function normalizeLibraryCollection(value: unknown, index = 0): LibraryCollection {
  const source = value && typeof value === 'object' ? (value as Partial<LibraryCollection>) : {}
  const createdAt = cleanLibraryText(source.createdAt, 40) || new Date().toISOString()
  return {
    id: cleanLibraryText(source.id, 120) || createLibraryId('library-collection'),
    name: cleanLibraryText(source.name, 80) || `资料集 ${index + 1}`,
    order: Number.isFinite(source.order) ? Number(source.order) : index,
    createdAt,
    createdByAccountId: cleanLibraryText(source.createdByAccountId, 120),
  }
}

export function normalizeLibraryItem(value: unknown): LibraryItem {
  const source = value && typeof value === 'object' ? (value as Partial<LibraryItem>) : {}
  const sourceType: LibraryItemSourceType =
    source.sourceType === 'path' || source.sourceType === 'url' ? source.sourceType : 'uploaded'
  const createdAt = cleanLibraryText(source.createdAt, 40) || new Date().toISOString()
  return {
    id: cleanLibraryText(source.id, 120) || createLibraryId('library-item'),
    collectionId: cleanLibraryText(source.collectionId, 120),
    title: cleanLibraryText(source.title, 160) || cleanLibraryText(source.fileName, 240) || '未命名资料',
    sourceType,
    fileName: cleanLibraryText(source.fileName, 240) || undefined,
    mimeType: cleanLibraryText(source.mimeType, 160) || undefined,
    extension: cleanLibraryText(source.extension, 24).toLowerCase() || undefined,
    size: Number.isFinite(source.size) ? Math.max(0, Number(source.size)) : undefined,
    path: cleanLibraryText(source.path, 2_000) || undefined,
    networkPath: cleanLibraryNetworkPath(source.networkPath) || undefined,
    url: cleanLibraryText(source.url, 2_000) || undefined,
    note: cleanLibraryText(source.note, 1_000) || undefined,
    createdAt,
    updatedAt: cleanLibraryText(source.updatedAt, 40) || createdAt,
    createdByAccountId: cleanLibraryText(source.createdByAccountId, 120),
    createdByName: cleanLibraryText(source.createdByName, 80),
  }
}

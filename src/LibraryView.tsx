import { Component, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  File,
  FileSpreadsheet,
  FileText,
  Image as ImageIcon,
  Link,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react'
import type { CSSProperties, ErrorInfo, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import type { Border, Cell, Color, Fill, Workbook, Worksheet } from 'exceljs'
import type { LibraryCollection, LibraryFileSelection, LibraryItem, LibraryItemSourceType } from './library-model'

type DataMode = 'single' | 'team'
type LibraryRole = 'controller' | 'admin' | 'manager' | 'member' | 'finance'

type LibraryItemDraft = {
  collectionId: string
  title: string
  sourceType: LibraryItemSourceType
  note: string
  url: string
  selection: LibraryFileSelection | null
}

type LibraryPreview =
  | { kind: 'loading'; title: string }
  | { kind: 'error'; title: string; message: string }
  | { kind: 'text'; title: string; text: string; truncated: boolean }
  | { kind: 'docx'; title: string; data: ArrayBuffer }
  | { kind: 'image' | 'pdf'; title: string; objectUrl: string }
  | { kind: 'table'; title: string; sheets: LibraryTableSheet[] }

type LibraryTableMerge = {
  startRow: number
  endRow: number
  startColumn: number
  endColumn: number
}

type LibraryTableImage = {
  id: string
  row: number
  column: number
  rowSpan: number
  columnSpan: number
  objectUrl: string
}

type LibraryTableSheet = {
  name: string
  worksheet: Worksheet
  rowCount: number
  columnCount: number
  merges: LibraryTableMerge[]
  columnWidths: number[]
  images: LibraryTableImage[]
}

type LibraryViewProps = {
  collections: LibraryCollection[]
  items: LibraryItem[]
  role: LibraryRole
  currentAccountId: string
  currentAccountName: string
  dataMode: DataMode
  teamServerUrl: string
  teamAccessKey: string
  searchQuery: string
  onCollectionsChange: (collections: LibraryCollection[]) => void
  onItemsChange: (items: LibraryItem[]) => void
}

const maxPreviewTextLength = 500_000
const maxDocumentPreviewBytes = 80 * 1024 * 1024
const maxSpreadsheetPreviewBytes = 80 * 1024 * 1024
const tablePageSize = 80

class LibraryPreviewErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Library preview rendering failed', error, info)
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="libraryPreviewBody">
          <div className="libraryPreviewState error">这个文件含有暂不兼容的格式，请点击右上角“系统打开”。</div>
        </div>
      )
    }
    return this.props.children
  }
}

function createId(prefix: string) {
  if (typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function columnIndexFromLetters(value: string) {
  return value.toUpperCase().split('').reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0)
}

function columnLettersFromIndex(value: number) {
  let current = value
  let result = ''
  while (current > 0) {
    current -= 1
    result = String.fromCharCode(65 + current % 26) + result
    current = Math.floor(current / 26)
  }
  return result
}

function parseCellAddress(value: string) {
  const match = value.replace(/\$/g, '').match(/^([A-Z]+)(\d+)$/i)
  if (!match) return null
  return { column: columnIndexFromLetters(match[1]), row: Number(match[2]) }
}

function parseMergeRange(value: string): LibraryTableMerge | null {
  const [startValue, endValue = startValue] = value.split(':')
  const start = parseCellAddress(startValue)
  const end = parseCellAddress(endValue)
  if (!start || !end) return null
  return {
    startRow: Math.min(start.row, end.row),
    endRow: Math.max(start.row, end.row),
    startColumn: Math.min(start.column, end.column),
    endColumn: Math.max(start.column, end.column),
  }
}

const excelThemeColors = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72']

function applyExcelTint(hex: string, tint = 0) {
  if (!tint) return hex
  const channels = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16))
  return channels
    .map((channel) => {
      const adjusted = tint < 0 ? channel * (1 + tint) : channel + (255 - channel) * tint
      return Math.max(0, Math.min(255, Math.round(adjusted))).toString(16).padStart(2, '0')
    })
    .join('')
}

function excelColor(value?: Partial<Color>) {
  const themeValue = value as Partial<Color> & { tint?: number }
  const themeIndex = value?.theme
  if (!value?.argb && Number.isInteger(themeIndex)) {
    const themeColor = excelThemeColors[themeIndex as number]
    if (themeColor) return `#${applyExcelTint(themeColor, themeValue.tint)}`
  }
  const argb = value?.argb?.replace(/^#/, '')
  if (!argb) return undefined
  if (argb.length === 6) return `#${argb}`
  if (argb.length !== 8) return undefined
  const alpha = Number.parseInt(argb.slice(0, 2), 16) / 255
  const red = Number.parseInt(argb.slice(2, 4), 16)
  const green = Number.parseInt(argb.slice(4, 6), 16)
  const blue = Number.parseInt(argb.slice(6, 8), 16)
  return alpha >= 0.995 ? `#${argb.slice(2)}` : `rgba(${red}, ${green}, ${blue}, ${alpha.toFixed(3)})`
}

function fillBackground(fill?: Fill) {
  if (!fill) return undefined
  if (fill.type === 'pattern') {
    const foreground = excelColor(fill.fgColor)
    const background = excelColor(fill.bgColor)
    if (fill.pattern === 'none') return background
    return foreground ?? background
  }
  if (fill.type !== 'gradient' || !Array.isArray(fill.stops)) return undefined
  const stops = [...fill.stops].sort((left, right) => left.position - right.position)
  const colors = stops.map((stop) => excelColor(stop.color)).filter(Boolean)
  if (colors.length === 0) return undefined
  if (colors.length === 1) return colors[0]
  return `linear-gradient(${fill.gradient === 'angle' ? `${fill.degree}deg` : '135deg'}, ${colors.join(', ')})`
}

function borderCss(border?: Partial<Border>) {
  if (!border?.style) return undefined
  const width = border.style === 'medium' || border.style.startsWith('medium') ? 2 : border.style === 'thick' ? 3 : 1
  const style = border.style === 'dotted' || border.style === 'hair' ? 'dotted' : border.style.includes('dash') || border.style === 'dashed' ? 'dashed' : border.style === 'double' ? 'double' : 'solid'
  return `${width}px ${style} ${excelColor(border.color) ?? 'rgba(166, 191, 211, 0.34)'}`
}

function luminanceFromColor(value?: Partial<Color>) {
  const cssColor = excelColor(value)
  const rgb = cssColor?.match(/^#([\dA-F]{6})$/i)?.[1]
  if (!rgb) return null
  const channels = [0, 2, 4].map((index) => {
    const channel = Number.parseInt(rgb.slice(index, index + 2), 16) / 255
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels.reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0)
}

function readableTextColor(backgroundLuminance: number, fontColor?: Partial<Color>) {
  const explicitColor = excelColor(fontColor)
  const explicitLuminance = luminanceFromColor(fontColor)
  const contrast = explicitLuminance === null
    ? 0
    : (Math.max(backgroundLuminance, explicitLuminance) + 0.05) / (Math.min(backgroundLuminance, explicitLuminance) + 0.05)
  if (explicitColor && contrast >= 3) return explicitColor
  const whiteContrast = 1.05 / (backgroundLuminance + 0.05)
  const darkContrast = (backgroundLuminance + 0.05) / 0.05
  return whiteContrast >= darkContrast ? '#f5f9ff' : '#182333'
}

function tableCellStyle(cell: Cell, width: number, rowHeight?: number): CSSProperties {
  const fill = cell.fill
  const font = cell.font
  const alignment = cell.alignment
  const fillColor = fill?.type === 'pattern' ? fill.fgColor ?? fill.bgColor : undefined
  const fillLuminance = luminanceFromColor(fillColor)
  const textDecorations = [font?.underline && font.underline !== 'none' ? 'underline' : '', font?.strike ? 'line-through' : ''].filter(Boolean)
  const textAlign = alignment?.horizontal === 'centerContinuous'
    ? 'center'
    : alignment?.horizontal === 'distributed' || alignment?.horizontal === 'fill'
      ? 'justify'
      : alignment?.horizontal
  return {
    width,
    minWidth: width,
    maxWidth: width,
    height: rowHeight,
    minHeight: rowHeight,
    color: readableTextColor(fillLuminance ?? 0.98, font?.color),
    background: fillBackground(fill),
    fontFamily: font?.name || undefined,
    fontSize: font?.size ? `${Math.max(8, Math.min(32, font.size))}px` : undefined,
    fontWeight: font?.bold ? 700 : undefined,
    fontStyle: font?.italic ? 'italic' : undefined,
    textDecoration: textDecorations.length > 0 ? textDecorations.join(' ') : undefined,
    textAlign,
    verticalAlign: alignment?.vertical === 'middle' ? 'middle' : alignment?.vertical,
    whiteSpace: alignment?.wrapText ? 'pre-wrap' : 'nowrap',
    wordBreak: alignment?.wrapText ? 'break-word' : undefined,
    borderTop: borderCss(cell.border?.top),
    borderRight: borderCss(cell.border?.right),
    borderBottom: borderCss(cell.border?.bottom),
    borderLeft: borderCss(cell.border?.left),
  }
}

function imageMimeType(extension?: string) {
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg'
  if (extension === 'gif') return 'image/gif'
  return 'image/png'
}

function worksheetImages(workbook: Workbook, worksheet: Worksheet, imageUrls: Map<number, string>): LibraryTableImage[] {
  return worksheet.getImages().flatMap((placement, index) => {
    try {
      const imageId = Number(placement.imageId)
      const source = workbook.getImage(imageId)
      if (!source) return []
      let objectUrl = imageUrls.get(imageId) ?? ''
      if (!objectUrl) {
        if (source.base64) {
          objectUrl = source.base64.startsWith('data:')
            ? source.base64
            : `data:${imageMimeType(source.extension)};base64,${source.base64}`
        } else if (source.buffer) {
          const bytes = Uint8Array.from(source.buffer as unknown as ArrayLike<number>)
          objectUrl = URL.createObjectURL(new Blob([bytes], { type: imageMimeType(source.extension) }))
        }
        if (!objectUrl) return []
        imageUrls.set(imageId, objectUrl)
      }
      const startRow = Math.max(0, Math.floor(placement.range.tl.row))
      const startColumn = Math.max(0, Math.floor(placement.range.tl.col))
      const endRow = Math.max(startRow + 1, Math.ceil(placement.range.br.row))
      const endColumn = Math.max(startColumn + 1, Math.ceil(placement.range.br.col))
      return [{
        id: `${imageId}-${index}`,
        row: startRow + 1,
        column: startColumn + 1,
        rowSpan: endRow - startRow,
        columnSpan: endColumn - startColumn,
        objectUrl,
      }]
    } catch (error) {
      console.warn('Skipped an unsupported spreadsheet image', error)
      return []
    }
  })
}

function worksheetPreview(workbook: Workbook, worksheet: Worksheet, imageUrls: Map<number, string>): LibraryTableSheet {
  const merges = (worksheet.model.merges ?? []).map(parseMergeRange).filter((merge): merge is LibraryTableMerge => Boolean(merge))
  const images = worksheetImages(workbook, worksheet, imageUrls)
  const mergeRowCount = merges.reduce((maximum, merge) => Math.max(maximum, merge.endRow), 0)
  const mergeColumnCount = merges.reduce((maximum, merge) => Math.max(maximum, merge.endColumn), 0)
  const imageRowCount = images.reduce((maximum, image) => Math.max(maximum, image.row + image.rowSpan - 1), 0)
  const imageColumnCount = images.reduce((maximum, image) => Math.max(maximum, image.column + image.columnSpan - 1), 0)
  const rowCount = Math.max(worksheet.actualRowCount, mergeRowCount, imageRowCount, 1)
  const columnCount = Math.max(worksheet.actualColumnCount, mergeColumnCount, imageColumnCount, 1)
  return {
    name: worksheet.name,
    worksheet,
    rowCount,
    columnCount,
    merges,
    images,
    columnWidths: Array.from({ length: columnCount }, (_, index) => {
      const column = worksheet.getColumn(index + 1)
      if (column.hidden) return 48
      return Math.max(64, Math.min(360, Math.round((column.width ?? 12) * 7.2 + 18)))
    }),
  }
}

function mergeAt(sheet: LibraryTableSheet, row: number, column: number) {
  return sheet.merges.find((merge) => row >= merge.startRow && row <= merge.endRow && column >= merge.startColumn && column <= merge.endColumn)
}

function imagesAt(sheet: LibraryTableSheet, row: number, column: number) {
  return sheet.images.filter((image) => image.row === row && image.column === column)
}

function TableCellContents({ cell, images }: { cell: Cell; images: LibraryTableImage[] }) {
  return (
    <div className="libraryTableCellContent">
      {cell.text && <span className="libraryTableCellText">{cell.text}</span>}
      {images.length > 0 && (
        <span className="libraryTableCellImages">
          {images.map((image) => (
            <img
              key={image.id}
              className="libraryTableCellImage"
              src={image.objectUrl}
              alt="表格内嵌图片"
              loading="lazy"
              decoding="async"
              style={{ maxWidth: Math.min(280, Math.max(96, image.columnSpan * 120)) }}
            />
          ))}
        </span>
      )}
    </div>
  )
}

function DocxPreview({ data }: { data: ArrayBuffer }) {
  const renderContainerRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback' | 'error'>('loading')
  const [fallbackText, setFallbackText] = useState('')

  useEffect(() => {
    let active = true
    const container = renderContainerRef.current
    if (!container) return undefined

    container.replaceChildren()
    setStatus('loading')
    setFallbackText('')

    void (async () => {
      try {
        const { renderAsync } = await import('docx-preview')
        if (!active) return
        const staging = document.createElement('div')
        await renderAsync(data.slice(0), staging, staging, {
          className: 'crewflow-docx',
          inWrapper: true,
          breakPages: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          renderHeaders: true,
          renderFooters: true,
          renderFootnotes: true,
          renderEndnotes: true,
          useBase64URL: true,
          renderAltChunks: false,
          experimental: true,
        })
        if (!active) return
        if (!staging.querySelector('section.crewflow-docx')) throw new Error('文稿没有可显示的页面')
        container.replaceChildren(...Array.from(staging.childNodes))
        setStatus('ready')
      } catch (error) {
        if (!active) return
        console.warn('Word document layout preview failed, falling back to text', error)
        container.replaceChildren()
        try {
          const mammoth = await import('mammoth')
          const result = await mammoth.extractRawText({ arrayBuffer: data.slice(0) })
          if (!active) return
          setFallbackText(result.value.slice(0, maxPreviewTextLength))
          setStatus('fallback')
        } catch (fallbackError) {
          console.error('Word document fallback preview failed', fallbackError)
          if (active) setStatus('error')
        }
      }
    })()

    return () => {
      active = false
      container.replaceChildren()
    }
  }, [data])

  return (
    <div className="libraryDocxPreview">
      <div ref={renderContainerRef} className="libraryDocxRender" />
      {status === 'loading' && <div className="libraryDocumentStatus">正在排版 Word 文稿...</div>}
      {status === 'fallback' && (
        <div className="libraryDocumentFallback">
          <pre>{fallbackText}</pre>
          <span>该文稿含有暂不兼容的排版，当前显示正文；完整格式请使用“系统打开”。</span>
        </div>
      )}
      {status === 'error' && <div className="libraryDocumentStatus error">这个 Word 文稿无法预览，请使用“系统打开”。</div>}
    </div>
  )
}

function revokePreviewObjectUrls(value: LibraryPreview | null) {
  if (!value) return
  if (value.kind === 'image' || value.kind === 'pdf') {
    URL.revokeObjectURL(value.objectUrl)
    return
  }
  if (value.kind !== 'table') return
  const objectUrls = new Set(value.sheets.flatMap((sheet) => sheet.images.map((image) => image.objectUrl)))
  objectUrls.forEach((objectUrl) => {
    if (objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl)
  })
}


function formatSize(size?: number) {
  if (!size) return ''
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

function formatLibraryDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', year: 'numeric' }).format(date)
}

function friendlyLibraryError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback
  return message
    .replace(/^Error invoking remote method '[^']+':\s*Error:\s*/i, '')
    .replace(/^Error:\s*/i, '')
}

function sourceLabel(item: LibraryItem, dataMode: DataMode) {
  if (item.sourceType === 'url') return '在线链接'
  if (item.sourceType === 'path') return /^(mp4|mov|m4v|webm)$/i.test(item.extension ?? '') ? '视频路径' : '路径引用'
  return dataMode === 'team' ? '团队文件' : '本机文件'
}

function itemIcon(item: LibraryItem) {
  if (item.sourceType === 'url') return Link
  if (item.mimeType?.startsWith('image/')) return ImageIcon
  if (item.mimeType?.startsWith('video/') || /^(mp4|mov|m4v|webm)$/i.test(item.extension ?? '')) return Video
  if (item.extension === 'xlsx' || item.extension === 'xls' || item.extension === 'csv') return FileSpreadsheet
  if (item.extension === 'pdf' || item.extension === 'doc' || item.extension === 'docx' || item.extension === 'txt' || item.extension === 'md') return FileText
  return File
}

function libraryStoragePayload(
  item: LibraryItem,
  dataMode: DataMode,
  teamServerUrl: string,
  teamAccessKey: string,
) {
  return {
    id: item.id,
    sourceType: item.sourceType,
    dataMode,
    serverUrl: teamServerUrl,
    accessKey: teamAccessKey,
    path: item.path,
    url: item.url,
    fileName: item.fileName,
    mimeType: item.mimeType,
    title: item.title,
  }
}

function emptyDraft(collectionId: string): LibraryItemDraft {
  return {
    collectionId,
    title: '',
    sourceType: 'uploaded',
    note: '',
    url: '',
    selection: null,
  }
}

function dataToArrayBuffer(value: unknown): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value.slice(0)
  if (ArrayBuffer.isView(value)) {
    const view = value as ArrayBufferView
    return Uint8Array.from(new Uint8Array(view.buffer, view.byteOffset, view.byteLength)).buffer
  }
  if (value && typeof value === 'object' && Array.isArray((value as { data?: unknown }).data)) {
    return Uint8Array.from((value as { data: number[] }).data).buffer
  }
  throw new Error('资料文件内容无法读取')
}

export default function LibraryView({
  collections,
  items,
  role,
  currentAccountId,
  currentAccountName,
  dataMode,
  teamServerUrl,
  teamAccessKey,
  searchQuery,
  onCollectionsChange,
  onItemsChange,
}: LibraryViewProps) {
  const sortedCollections = useMemo(
    () => [...collections].sort((left, right) => left.order - right.order || left.createdAt.localeCompare(right.createdAt)),
    [collections],
  )
  const [selectedCollectionId, setSelectedCollectionId] = useState(() => sortedCollections[0]?.id ?? '')
  const [collectionEditor, setCollectionEditor] = useState<{ id: string; name: string } | null>(null)
  const [collectionMenu, setCollectionMenu] = useState<{ collectionId: string; top: number; left: number } | null>(null)
  const [itemEditor, setItemEditor] = useState<{ itemId: string; draft: LibraryItemDraft } | null>(null)
  const [preview, setPreview] = useState<LibraryPreview | null>(null)
  const [previewSourceItem, setPreviewSourceItem] = useState<LibraryItem | null>(null)
  const [tableSheetIndex, setTableSheetIndex] = useState(0)
  const [tablePage, setTablePage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const canManageCollections = role === 'controller' || role === 'admin'
  const selectedCollection = sortedCollections.find((collection) => collection.id === selectedCollectionId) ?? sortedCollections[0] ?? null

  useEffect(() => {
    if (selectedCollection && selectedCollection.id !== selectedCollectionId) setSelectedCollectionId(selectedCollection.id)
    if (!selectedCollection && selectedCollectionId) setSelectedCollectionId('')
  }, [selectedCollection, selectedCollectionId])

  useEffect(() => {
    return () => {
      revokePreviewObjectUrls(preview)
    }
  }, [preview])

  useEffect(() => {
    setTableSheetIndex(0)
    setTablePage(0)
  }, [preview])

  const collectionCounts = useMemo(() => {
    const counts = new Map<string, number>()
    items.forEach((item) => counts.set(item.collectionId, (counts.get(item.collectionId) ?? 0) + 1))
    return counts
  }, [items])

  const visibleItems = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return items
      .filter((item) => item.collectionId === selectedCollection?.id)
      .filter((item) => {
        if (!query) return true
        return [item.title, item.fileName, item.note, item.url, item.path, item.createdByName]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(query)
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
  }, [items, searchQuery, selectedCollection?.id])

  const activeTableSheet = preview?.kind === 'table' ? preview.sheets[tableSheetIndex] ?? preview.sheets[0] : null
  const tablePageCount = activeTableSheet ? Math.max(1, Math.ceil(activeTableSheet.rowCount / tablePageSize)) : 1
  const tableStartRow = activeTableSheet ? tablePage * tablePageSize + 1 : 1
  const tableEndRow = activeTableSheet ? Math.min(activeTableSheet.rowCount, tableStartRow + tablePageSize - 1) : 1

  function canEditItem(item: LibraryItem) {
    return canManageCollections || item.createdByAccountId === currentAccountId
  }

  function openNewCollection() {
    setMessage('')
    setCollectionEditor({ id: '', name: '' })
  }

  function openCollectionMenu(event: ReactMouseEvent<HTMLButtonElement>, collectionId: string) {
    const rect = event.currentTarget.getBoundingClientRect()
    const menuWidth = 176
    const left = Math.max(12, Math.min(window.innerWidth - menuWidth - 12, rect.right - menuWidth))
    const top = Math.min(window.innerHeight - 188, rect.bottom + 6)
    setCollectionMenu({ collectionId, top, left })
  }

  function closePreview() {
    setPreview(null)
    setPreviewSourceItem(null)
  }

  function openCollectionRename(collection: LibraryCollection) {
    setMessage('')
    setCollectionEditor({ id: collection.id, name: collection.name })
  }

  function saveCollection() {
    if (!collectionEditor) return
    const name = collectionEditor.name.trim().slice(0, 80)
    if (!name) {
      setMessage('请填写资料集名称')
      return
    }
    if (collections.some((collection) => collection.id !== collectionEditor.id && collection.name === name)) {
      setMessage('已经有同名资料集')
      return
    }

    if (collectionEditor.id) {
      onCollectionsChange(collections.map((collection) => (collection.id === collectionEditor.id ? { ...collection, name } : collection)))
    } else {
      const collection: LibraryCollection = {
        id: createId('library-collection'),
        name,
        order: sortedCollections.length,
        createdAt: new Date().toISOString(),
        createdByAccountId: currentAccountId,
      }
      onCollectionsChange([...collections, collection])
      setSelectedCollectionId(collection.id)
    }
    setCollectionEditor(null)
    setMessage('')
  }

  function moveCollection(collectionId: string, direction: -1 | 1) {
    const ordered = [...sortedCollections]
    const index = ordered.findIndex((collection) => collection.id === collectionId)
    const nextIndex = index + direction
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return
    ;[ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]]
    onCollectionsChange(ordered.map((collection, order) => ({ ...collection, order })))
  }

  function deleteCollection(collection: LibraryCollection) {
    if ((collectionCounts.get(collection.id) ?? 0) > 0) {
      setMessage('这个资料集仍有资料，请先移动或删除其中的资料')
      return
    }
    if (!window.confirm(`确定删除资料集“${collection.name}”吗？`)) return
    onCollectionsChange(collections.filter((entry) => entry.id !== collection.id))
    setMessage('')
  }

  function openNewItem() {
    if (!selectedCollection) return
    setMessage('')
    setItemEditor({ itemId: '', draft: emptyDraft(selectedCollection.id) })
  }

  function openItemEdit(item: LibraryItem) {
    setMessage('')
    setItemEditor({
      itemId: item.id,
      draft: {
        collectionId: item.collectionId,
        title: item.title,
        sourceType: item.sourceType,
        note: item.note ?? '',
        url: item.url ?? '',
        selection: item.path
          ? {
              path: item.path,
              fileName: item.fileName ?? item.path.split(/[\\/]/).at(-1) ?? '资料文件',
              extension: item.extension ?? '',
              mimeType: item.mimeType ?? 'application/octet-stream',
              size: item.size ?? 0,
              uploadable: false,
            }
          : null,
      },
    })
  }

  async function chooseFile() {
    if (!itemEditor || !window.desktopBridge?.selectLibraryFile) return
    try {
      setBusy(true)
      setMessage('')
      const selection = await window.desktopBridge.selectLibraryFile(itemEditor.draft.sourceType === 'uploaded' ? 'upload' : 'reference')
      if (!selection) return
      setItemEditor((current) => current ? {
        ...current,
        draft: {
          ...current.draft,
          title: current.draft.title || selection.fileName.replace(/\.[^.]+$/, ''),
          selection,
        },
      } : current)
    } catch (error) {
      setMessage(friendlyLibraryError(error, '文件选择失败'))
    } finally {
      setBusy(false)
    }
  }

  async function saveItem() {
    if (!itemEditor) return
    const draft = itemEditor.draft
    const title = draft.title.trim().slice(0, 160)
    if (!title) {
      setMessage('请填写资料名称')
      return
    }
    if (!draft.collectionId) {
      setMessage('请选择资料集')
      return
    }
    if (!itemEditor.itemId && draft.sourceType !== 'url' && !draft.selection) {
      setMessage(draft.sourceType === 'uploaded' ? '请选择要上传的文稿' : '请选择视频、本地或共享文件')
      return
    }

    let url = draft.url.trim()
    if (draft.sourceType === 'url') {
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error()
        url = parsed.toString()
      } catch {
        setMessage('请填写有效的 http 或 https 链接')
        return
      }
    }

    setBusy(true)
    setMessage('')
    try {
      const now = new Date().toISOString()
      if (itemEditor.itemId) {
        onItemsChange(items.map((item) => item.id === itemEditor.itemId ? {
          ...item,
          collectionId: draft.collectionId,
          title,
          note: draft.note.trim().slice(0, 1_000) || undefined,
          url: item.sourceType === 'url' ? url : item.url,
          updatedAt: now,
        } : item))
      } else {
        const itemId = createId('library-item')
        if (draft.sourceType === 'uploaded') {
          if (!draft.selection?.uploadable) throw new Error('这个文件不适合上传，请改用路径引用')
          if (!window.desktopBridge?.importLibraryFile) throw new Error('请在 CrewFlow 桌面 App 中上传文件')
          await window.desktopBridge.importLibraryFile({
            id: itemId,
            sourcePath: draft.selection.path,
            fileName: draft.selection.fileName,
            mimeType: draft.selection.mimeType,
            dataMode,
            serverUrl: teamServerUrl,
            accessKey: teamAccessKey,
          })
        }
        const item: LibraryItem = {
          id: itemId,
          collectionId: draft.collectionId,
          title,
          sourceType: draft.sourceType,
          fileName: draft.selection?.fileName,
          mimeType: draft.selection?.mimeType,
          extension: draft.selection?.extension,
          size: draft.selection?.size,
          path: draft.sourceType === 'path' ? draft.selection?.path : undefined,
          url: draft.sourceType === 'url' ? url : undefined,
          note: draft.note.trim().slice(0, 1_000) || undefined,
          createdAt: now,
          updatedAt: now,
          createdByAccountId: currentAccountId,
          createdByName: currentAccountName,
        }
        onItemsChange([...items, item])
      }
      setItemEditor(null)
    } catch (error) {
      setMessage(friendlyLibraryError(error, '资料保存失败'))
    } finally {
      setBusy(false)
    }
  }

  async function deleteItem(item: LibraryItem) {
    if (!window.confirm(`确定删除“${item.title}”吗？`)) return
    setBusy(true)
    setMessage('')
    try {
      if (item.sourceType === 'uploaded') {
        if (!window.desktopBridge?.deleteLibraryFile) throw new Error('请在 CrewFlow 桌面 App 中删除上传文件')
        await window.desktopBridge.deleteLibraryFile(libraryStoragePayload(item, dataMode, teamServerUrl, teamAccessKey))
      }
      onItemsChange(items.filter((entry) => entry.id !== item.id))
    } catch (error) {
      setMessage(friendlyLibraryError(error, '资料删除失败'))
    } finally {
      setBusy(false)
    }
  }

  async function openItem(item: LibraryItem) {
    try {
      setBusy(true)
      setMessage('')
      const payload = libraryStoragePayload(item, dataMode, teamServerUrl, teamAccessKey)
      if (item.sourceType === 'url' || item.sourceType === 'path' && /^(mp4|mov|m4v|webm|mp3|wav|m4a)$/i.test(item.extension ?? '')) {
        await window.desktopBridge?.previewLibraryResource?.(payload)
      } else {
        await window.desktopBridge?.openLibraryFile?.(payload)
      }
    } catch (error) {
      setMessage(friendlyLibraryError(error, '资料打开失败'))
    } finally {
      setBusy(false)
    }
  }

  async function previewItem(item: LibraryItem) {
    const extension = (item.extension ?? item.fileName?.split('.').at(-1) ?? '').toLowerCase()
    if (item.sourceType === 'url' || /^(mp4|mov|m4v|webm|mp3|wav|m4a)$/i.test(extension)) {
      await openItem(item)
      return
    }
    if (!/^(pdf|png|jpg|jpeg|gif|webp|bmp|txt|md|json|csv|docx|xlsx)$/i.test(extension)) {
      await openItem(item)
      return
    }

    setPreviewSourceItem(item)
    setPreview({ kind: 'loading', title: item.title })
    try {
      if (!window.desktopBridge?.readLibraryFile) throw new Error('请在 CrewFlow 桌面 App 中预览资料')
      const result = await window.desktopBridge.readLibraryFile(libraryStoragePayload(item, dataMode, teamServerUrl, teamAccessKey))
      const arrayBuffer = dataToArrayBuffer(result.data)
      const mimeType = result.metadata?.mimeType || item.mimeType || 'application/octet-stream'

      if (extension === 'pdf') {
        setPreview({ kind: 'pdf', title: item.title, objectUrl: URL.createObjectURL(new Blob([arrayBuffer], { type: 'application/pdf' })) })
        return
      }
      if (/^(png|jpg|jpeg|gif|webp|bmp)$/.test(extension)) {
        setPreview({ kind: 'image', title: item.title, objectUrl: URL.createObjectURL(new Blob([arrayBuffer], { type: mimeType })) })
        return
      }
      if (extension === 'docx') {
        if (arrayBuffer.byteLength > maxDocumentPreviewBytes) {
          throw new Error('这个 Word 文稿较大，为避免软件卡顿，请使用右上角“系统打开”查看')
        }
        setPreview({ kind: 'docx', title: item.title, data: arrayBuffer })
        return
      }
      if (extension === 'xlsx') {
        if (arrayBuffer.byteLength > maxSpreadsheetPreviewBytes) {
          throw new Error('这个表格较大，为避免软件卡顿，请使用右上角“系统打开”查看')
        }
        const { Workbook } = await import('exceljs')
        const workbook = new Workbook()
        await workbook.xlsx.load(arrayBuffer as never)
        const imageUrls = new Map<number, string>()
        let sheets: LibraryTableSheet[]
        try {
          sheets = workbook.worksheets.map((worksheet) => worksheetPreview(workbook, worksheet, imageUrls))
        } catch (error) {
          imageUrls.forEach((objectUrl) => {
            if (objectUrl.startsWith('blob:')) URL.revokeObjectURL(objectUrl)
          })
          throw error
        }
        if (sheets.length === 0) throw new Error('这个表格没有可预览的工作表')
        setPreview({
          kind: 'table',
          title: item.title,
          sheets,
        })
        return
      }
      const decoded = new TextDecoder('utf-8').decode(arrayBuffer)
      const truncated = decoded.length > maxPreviewTextLength
      setPreview({ kind: 'text', title: item.title, text: decoded.slice(0, maxPreviewTextLength), truncated })
    } catch (error) {
      setPreview({ kind: 'error', title: item.title, message: friendlyLibraryError(error, '资料预览失败') })
    }
  }

  return (
    <section className="libraryPage">
      <aside className="libraryCollectionsPanel">
        <div className="libraryPanelHeading">
          <div>
            <strong>资料集</strong>
            <span>{collections.length} 个分类</span>
          </div>
          {canManageCollections && (
            <button type="button" title="新建资料集" onClick={openNewCollection}>
              <Plus size={18} />
            </button>
          )}
        </div>
        <div className="libraryCollectionList">
          {sortedCollections.map((collection) => (
            <div className={collection.id === selectedCollection?.id ? 'libraryCollectionRow active' : 'libraryCollectionRow'} key={collection.id}>
              <button className="libraryCollectionSelect" type="button" onClick={() => setSelectedCollectionId(collection.id)}>
                <span>{collection.name}</span>
                <small>{collectionCounts.get(collection.id) ?? 0}</small>
              </button>
              {canManageCollections && (
                <button
                  className="libraryCollectionMenuTrigger"
                  type="button"
                  title="资料集操作"
                  aria-label={`${collection.name}操作`}
                  aria-expanded={collectionMenu?.collectionId === collection.id}
                  onClick={(event) => openCollectionMenu(event, collection.id)}
                >
                  <MoreHorizontal size={17} />
                </button>
              )}
            </div>
          ))}
          {sortedCollections.length === 0 && (
            <div className="libraryCollectionEmpty">
              <FileText size={24} />
              <span>{canManageCollections ? '先新建一个资料集' : '等待管理员创建资料集'}</span>
            </div>
          )}
        </div>
      </aside>

      <div className="libraryResourcesPanel">
        <header className="libraryResourcesHeader">
          <div>
            <span className="libraryEyebrow">当前资料集</span>
            <h2>{selectedCollection?.name ?? '资料库'}</h2>
            <p>{selectedCollection ? `${visibleItems.length} 项资料` : '创建资料集后即可添加内容'}</p>
          </div>
          {selectedCollection && (
            <button className="libraryAddButton" type="button" onClick={openNewItem}>
              <Plus size={18} />
              添加资料
            </button>
          )}
        </header>

        {message && <div className="libraryNotice">{message}</div>}
        {searchQuery.trim() && (
          <div className="librarySearchState"><Search size={15} />正在当前资料集内搜索“{searchQuery.trim()}”</div>
        )}

        <div className="libraryResourceList">
          {visibleItems.map((item) => {
            const Icon = itemIcon(item)
            return (
              <article className="libraryResourceRow" key={item.id}>
                <button className="libraryResourceMain" type="button" onClick={() => void previewItem(item)}>
                  <span className="libraryResourceIcon"><Icon size={21} /></span>
                  <span className="libraryResourceText">
                    <strong>{item.title}</strong>
                    <span>{[item.note, item.fileName || item.url || item.path].filter(Boolean).join(' · ') || '无补充说明'}</span>
                  </span>
                </button>
                <div className="libraryResourceMeta">
                  <span>{sourceLabel(item, dataMode)}</span>
                  <small>{[formatSize(item.size), item.createdByName, formatLibraryDate(item.updatedAt)].filter(Boolean).join(' · ')}</small>
                </div>
                <div className="libraryResourceActions">
                  <button type="button" title="预览" disabled={busy} onClick={() => void previewItem(item)}><ExternalLink size={17} /></button>
                  {canEditItem(item) && <button type="button" title="编辑" disabled={busy} onClick={() => openItemEdit(item)}><Pencil size={17} /></button>}
                  {canEditItem(item) && <button className="danger" type="button" title="删除" disabled={busy} onClick={() => void deleteItem(item)}><Trash2 size={17} /></button>}
                </div>
              </article>
            )
          })}
          {selectedCollection && visibleItems.length === 0 && (
            <div className="libraryResourcesEmpty">
              <FileText size={32} />
              <strong>{searchQuery.trim() ? '没有匹配的资料' : '这个资料集还是空的'}</strong>
              {!searchQuery.trim() && <span>可添加文稿本体、文件路径或在线链接</span>}
            </div>
          )}
        </div>
      </div>

      {collectionMenu && createPortal(
        <div className="libraryCollectionMenuLayer" role="presentation" onMouseDown={() => setCollectionMenu(null)}>
          {(() => {
            const collection = sortedCollections.find((entry) => entry.id === collectionMenu.collectionId)
            const index = sortedCollections.findIndex((entry) => entry.id === collectionMenu.collectionId)
            if (!collection) return null
            return (
              <div
                className="libraryCollectionMenu"
                role="menu"
                style={{ top: collectionMenu.top, left: collectionMenu.left }}
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button type="button" role="menuitem" disabled={index === 0} onClick={() => { moveCollection(collection.id, -1); setCollectionMenu(null) }}><ArrowUp size={15} />上移</button>
                <button type="button" role="menuitem" disabled={index === sortedCollections.length - 1} onClick={() => { moveCollection(collection.id, 1); setCollectionMenu(null) }}><ArrowDown size={15} />下移</button>
                <button type="button" role="menuitem" onClick={() => { openCollectionRename(collection); setCollectionMenu(null) }}><Pencil size={15} />重命名</button>
                <button className="danger" type="button" role="menuitem" onClick={() => { deleteCollection(collection); setCollectionMenu(null) }}><Trash2 size={15} />删除</button>
              </div>
            )
          })()}
        </div>,
        document.body,
      )}

      {collectionEditor && createPortal(
        <div className="libraryModalBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setCollectionEditor(null)}>
          <section className="libraryModal libraryCollectionModal" role="dialog" aria-modal="true" aria-label="资料集设置">
            <header>
              <div><span>资料集</span><h2>{collectionEditor.id ? '重命名资料集' : '新建资料集'}</h2></div>
              <button type="button" title="关闭" onClick={() => setCollectionEditor(null)}><X size={20} /></button>
            </header>
            <label className="libraryField">
              <span>名称</span>
              <input autoFocus value={collectionEditor.name} maxLength={80} placeholder="例如：培训资料" onChange={(event) => setCollectionEditor({ ...collectionEditor, name: event.target.value })} onKeyDown={(event) => event.key === 'Enter' && saveCollection()} />
            </label>
            {message && <div className="libraryNotice">{message}</div>}
            <footer>
              <button type="button" onClick={() => setCollectionEditor(null)}>取消</button>
              <button className="primary" type="button" onClick={saveCollection}>保存</button>
            </footer>
          </section>
        </div>,
        document.body,
      )}

      {itemEditor && createPortal(
        <div className="libraryModalBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !busy && setItemEditor(null)}>
          <section className="libraryModal libraryItemModal" role="dialog" aria-modal="true" aria-label="资料设置">
            <header>
              <div><span>资料库</span><h2>{itemEditor.itemId ? '编辑资料' : '添加资料'}</h2></div>
              <button type="button" title="关闭" disabled={busy} onClick={() => setItemEditor(null)}><X size={20} /></button>
            </header>
            {!itemEditor.itemId && (
              <div className="librarySourceTabs">
                <button className={itemEditor.draft.sourceType === 'uploaded' ? 'active' : ''} type="button" onClick={() => setItemEditor({ ...itemEditor, draft: { ...emptyDraft(itemEditor.draft.collectionId), sourceType: 'uploaded' } })}><Upload size={17} />上传文稿</button>
                <button className={itemEditor.draft.sourceType === 'path' ? 'active' : ''} type="button" onClick={() => setItemEditor({ ...itemEditor, draft: { ...emptyDraft(itemEditor.draft.collectionId), sourceType: 'path' } })}><Video size={17} />视频/共享文件</button>
                <button className={itemEditor.draft.sourceType === 'url' ? 'active' : ''} type="button" onClick={() => setItemEditor({ ...itemEditor, draft: { ...emptyDraft(itemEditor.draft.collectionId), sourceType: 'url' } })}><Link size={17} />在线链接</button>
              </div>
            )}
            <div className="libraryFormGrid">
              <label className="libraryField">
                <span>资料名称</span>
                <input autoFocus value={itemEditor.draft.title} maxLength={160} placeholder="填写便于查找的名称" onChange={(event) => setItemEditor({ ...itemEditor, draft: { ...itemEditor.draft, title: event.target.value } })} />
              </label>
              <label className="libraryField">
                <span>所属资料集</span>
                <select value={itemEditor.draft.collectionId} onChange={(event) => setItemEditor({ ...itemEditor, draft: { ...itemEditor.draft, collectionId: event.target.value } })}>
                  {sortedCollections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
                </select>
              </label>
            </div>
            {!itemEditor.itemId && itemEditor.draft.sourceType !== 'url' && (
              <button className="libraryFilePicker" type="button" disabled={busy} onClick={() => void chooseFile()}>
                {itemEditor.draft.sourceType === 'uploaded' ? <Upload size={20} /> : <Video size={20} />}
                <span>
                  <strong>{itemEditor.draft.selection?.fileName ?? (itemEditor.draft.sourceType === 'uploaded' ? '选择要上传的文稿' : '选择视频、本地或共享文件')}</strong>
                  <small>{itemEditor.draft.selection ? [itemEditor.draft.selection.path, formatSize(itemEditor.draft.selection.size)].filter(Boolean).join(' · ') : itemEditor.draft.sourceType === 'uploaded' ? '支持文稿、表格、PDF 和图片，最大 200MB' : dataMode === 'team' ? '只同步路径，不复制文件；建议选择所有成员可访问的 NAS 或共享盘' : '支持视频和大型文件；只保存路径，不复制文件本体'}</small>
                </span>
              </button>
            )}
            {itemEditor.draft.sourceType === 'url' && (
              <label className="libraryField">
                <span>在线地址</span>
                <input value={itemEditor.draft.url} placeholder="https://" onChange={(event) => setItemEditor({ ...itemEditor, draft: { ...itemEditor.draft, url: event.target.value } })} />
              </label>
            )}
            <label className="libraryField">
              <span>备注（选填）</span>
              <textarea rows={3} maxLength={1_000} value={itemEditor.draft.note} placeholder="填写用途、版本或使用说明" onChange={(event) => setItemEditor({ ...itemEditor, draft: { ...itemEditor.draft, note: event.target.value } })} />
            </label>
            {message && <div className="libraryNotice">{message}</div>}
            <footer>
              <button type="button" disabled={busy} onClick={() => setItemEditor(null)}>取消</button>
              <button className="primary" type="button" disabled={busy} onClick={() => void saveItem()}>{busy ? '正在保存' : '保存资料'}</button>
            </footer>
          </section>
        </div>,
        document.body,
      )}

      {preview && createPortal(
        <div className="libraryModalBackdrop libraryPreviewBackdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closePreview()}>
          <section className="libraryPreviewModal" role="dialog" aria-modal="true" aria-label="资料预览">
            <header>
              <strong>{preview.title}</strong>
              <div className="libraryPreviewHeaderActions">
                {previewSourceItem && (
                  <button className="libraryPreviewSystemOpen" type="button" title="用系统应用打开完整文件" onClick={() => void openItem(previewSourceItem)}>
                    <ExternalLink size={16} />
                    系统打开
                  </button>
                )}
                <button type="button" title="关闭" onClick={closePreview}><X size={20} /></button>
              </div>
            </header>
            <LibraryPreviewErrorBoundary key={`${preview.kind}-${preview.title}-${tableSheetIndex}-${tablePage}`}>
              <div className={`libraryPreviewBody${preview.kind === 'table' ? ' table' : preview.kind === 'docx' ? ' document' : preview.kind === 'text' ? ' paper' : ''}`}>
                {preview.kind === 'loading' && <div className="libraryPreviewState">正在读取资料...</div>}
                {preview.kind === 'error' && <div className="libraryPreviewState error">{preview.message}</div>}
                {preview.kind === 'image' && <img src={preview.objectUrl} alt={preview.title} />}
                {preview.kind === 'pdf' && <iframe src={preview.objectUrl} title={preview.title} />}
                {preview.kind === 'text' && <pre>{preview.text}</pre>}
                {preview.kind === 'docx' && <DocxPreview data={preview.data} />}
                {preview.kind === 'table' && activeTableSheet && (
                  <div className="librarySpreadsheetPreview">
                    <div className="librarySpreadsheetToolbar">
                      <label>
                        <span>工作表</span>
                        <select value={tableSheetIndex} onChange={(event) => { setTableSheetIndex(Number(event.target.value)); setTablePage(0) }}>
                          {preview.sheets.map((sheet, index) => <option key={`${sheet.name}-${index}`} value={index}>{sheet.name}</option>)}
                        </select>
                      </label>
                      <span className="librarySpreadsheetRange">
                        第 {tableStartRow}-{tableEndRow} 行，共 {activeTableSheet.rowCount} 行
                        {activeTableSheet.images.length > 0 && ` · ${activeTableSheet.images.length} 张图片`}
                      </span>
                      <div className="librarySpreadsheetPager">
                        <button type="button" title="上一页" disabled={tablePage === 0} onClick={() => setTablePage((current) => Math.max(0, current - 1))}><ChevronLeft size={17} /></button>
                        <span>{tablePage + 1} / {tablePageCount}</span>
                        <button type="button" title="下一页" disabled={tablePage >= tablePageCount - 1} onClick={() => setTablePage((current) => Math.min(tablePageCount - 1, current + 1))}><ChevronRight size={17} /></button>
                      </div>
                    </div>
                    <div className="libraryTableViewport">
                      <table className="libraryTablePreview">
                      <colgroup>
                        <col className="libraryTableRowNumberColumn" />
                        {activeTableSheet.columnWidths.map((width, index) => <col key={index} style={{ width }} />)}
                      </colgroup>
                      <thead>
                        <tr>
                          <th className="libraryTableCorner" />
                          {Array.from({ length: activeTableSheet.columnCount }, (_, index) => <th key={index}>{columnLettersFromIndex(index + 1)}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: tableEndRow - tableStartRow + 1 }, (_, rowOffset) => {
                          const rowNumber = tableStartRow + rowOffset
                          const row = activeTableSheet.worksheet.getRow(rowNumber)
                          const rowHeight = row.height ? Math.max(26, Math.min(180, Math.round(row.height * 1.333))) : undefined
                          return (
                            <tr key={rowNumber} style={rowHeight ? { height: rowHeight } : undefined}>
                              <th>{rowNumber}</th>
                              {Array.from({ length: activeTableSheet.columnCount }, (_, columnOffset) => {
                                const columnNumber = columnOffset + 1
                                const merge = mergeAt(activeTableSheet, rowNumber, columnNumber)
                                if (merge) {
                                  const visibleAnchorRow = Math.max(tableStartRow, merge.startRow)
                                  if (rowNumber !== visibleAnchorRow || columnNumber !== merge.startColumn) return null
                                  const masterCell = activeTableSheet.worksheet.getCell(merge.startRow, merge.startColumn)
                                  const width = activeTableSheet.columnWidths
                                    .slice(merge.startColumn - 1, merge.endColumn)
                                    .reduce((total, current) => total + current, 0)
                                  const cellImages = imagesAt(activeTableSheet, merge.startRow, merge.startColumn)
                                  return (
                                    <td
                                      key={columnNumber}
                                      colSpan={merge.endColumn - merge.startColumn + 1}
                                      rowSpan={Math.min(tableEndRow, merge.endRow) - visibleAnchorRow + 1}
                                      className={cellImages.length > 0 ? 'hasImages' : undefined}
                                      style={tableCellStyle(masterCell, width, rowHeight)}
                                      title={masterCell.text}
                                    >
                                      <TableCellContents cell={masterCell} images={cellImages} />
                                    </td>
                                  )
                                }
                                const cell = activeTableSheet.worksheet.getCell(rowNumber, columnNumber)
                                const cellImages = imagesAt(activeTableSheet, rowNumber, columnNumber)
                                return (
                                  <td
                                    key={columnNumber}
                                    className={cellImages.length > 0 ? 'hasImages' : undefined}
                                    style={tableCellStyle(cell, activeTableSheet.columnWidths[columnOffset], rowHeight)}
                                    title={cell.text}
                                  >
                                    <TableCellContents cell={cell} images={cellImages} />
                                  </td>
                                )
                              })}
                            </tr>
                          )
                        })}
                      </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </LibraryPreviewErrorBoundary>
            {'truncated' in preview && preview.truncated && <footer>内容较多，预览仅显示前一部分；可用系统应用打开完整文件。</footer>}
          </section>
        </div>,
        document.body,
      )}
    </section>
  )
}

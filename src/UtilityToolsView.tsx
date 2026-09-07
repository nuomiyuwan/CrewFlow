import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Combine,
  FileText,
  FolderOpen,
  Minimize2,
  Scissors,
  Upload,
  X,
  type LucideIcon,
} from 'lucide-react'

type ToolFormat = 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'png' | 'jpg' | 'webp' | 'bmp' | 'tiff' | 'txt' | 'mp4' | 'mp3' | 'wav' | 'flac' | 'm4a' | 'opus' | 'original'
type PdfOperation = 'merge' | 'split' | 'compress'

type ToolFile = {
  name: string
  extension: string
  size: number
  path?: string
  file?: File
}

type FormatDefinition = {
  id: ToolFormat
  label: string
  shortLabel: string
  icon: LucideIcon
}

type UtilityProgress = {
  jobId: string
  phase: string
  message: string
  percent?: number
  indeterminate?: boolean
  firstUse?: boolean
  transferredBytes?: number
  totalBytes?: number
}

type UtilityResult = {
  outputPaths?: string[]
  outputPath?: string
  message?: string
  warning?: string
}

type UtilityBridge = {
  selectUtilityFiles?: (options: {
    multiple?: boolean
    extensions?: string[]
    operation?: PdfOperation | 'convert'
    pdfOnly?: boolean
  }) => Promise<ToolFile[] | null>
  getPathForFile?: (file: File) => Promise<string> | string
  convertUtilityDocument?: (payload: {
    jobId: string
    sourcePath: string
    sourcePaths?: string[]
    targetFormat: ToolFormat
  }) => Promise<UtilityResult>
  runUtilityPdfTool?: (payload: {
    jobId: string
    operation: PdfOperation
    sourcePaths: string[]
  }) => Promise<UtilityResult>
  cancelUtilityTask?: (jobId: string) => Promise<unknown> | unknown
  utilityOutputPathsExist?: (paths: string[]) => Promise<boolean[]>
  revealUtilityOutput?: (path: string) => Promise<unknown> | unknown
  onUtilityProgress?: (listener: (progress: UtilityProgress) => void) => () => void
}

type RecentConversion = {
  id: string
  sourceName: string
  outputPath: string
  operation: string
  createdAt: number
  warning?: string
}

const formatDefinitions: FormatDefinition[] = [
  { id: 'pdf', label: 'PDF', shortLabel: 'PDF', icon: FileText },
  { id: 'docx', label: 'DOCX', shortLabel: 'W', icon: FileText },
  { id: 'xlsx', label: 'XLSX', shortLabel: 'X', icon: FileText },
  { id: 'pptx', label: 'PPTX', shortLabel: 'P', icon: FileText },
  { id: 'png', label: '图片', shortLabel: 'IMG', icon: FileText },
  { id: 'txt', label: 'TXT', shortLabel: 'TXT', icon: FileText },
  { id: 'mp4', label: 'MP4', shortLabel: '', icon: FileText },
  { id: 'original', label: '保留原音质', shortLabel: '', icon: FileText },
  ...(['mp3', 'wav', 'flac', 'm4a', 'opus'] as const).map((id) => ({ id, label: id.toUpperCase(), shortLabel: '', icon: FileText })),
]

const sourceTargets: Record<string, ToolFormat[]> = {
  pdf: ['docx', 'xlsx', 'pptx', 'png', 'jpg', 'txt'],
  doc: ['pdf', 'xlsx'],
  docx: ['pdf', 'xlsx'],
  xls: ['pdf', 'docx'],
  xlsx: ['pdf', 'docx'],
  ppt: ['pdf'],
  pptx: ['pdf'],
}

const imageExtensions = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'tif', 'tiff', 'heic', 'heif']
const imageFormats: ToolFormat[] = ['png', 'jpg', 'webp', 'bmp', 'tiff']
const audioExtensions = ['mp3', 'wav', 'flac', 'm4a', 'm4b', 'aac', 'ogg', 'opus', 'aiff', 'aif', 'wma', 'ape', 'amr', 'ac3', 'wv', 'tta']
const videoExtensions = ['mp4', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'mts', 'm2ts', 'mpg', 'mpeg', '3gp', 'mxf']
const specialAudioExtensions = ['ncm', 'uc', 'qmc0', 'qmc2', 'qmc3', 'qmcflac', 'qmcogg', 'kwm']
const unsupportedAudioExtensions = ['kgm', 'kgma', 'vpr', 'mflac', 'mflac0', 'mgg', 'mgg0', 'mgg1', 'mggl', 'mmp4', 'qmc4', 'qmc6', 'qmc8', 'm4p']
const audioFormats: ToolFormat[] = ['mp3', 'wav', 'flac', 'm4a', 'opus']
for (const extension of videoExtensions) sourceTargets[extension] = ['mp4', ...audioFormats]
for (const extension of audioExtensions) sourceTargets[extension] = audioFormats.filter((target) => target !== extension)
for (const extension of specialAudioExtensions) sourceTargets[extension] = ['original', ...audioFormats]
for (const extension of imageExtensions) {
  const normalized = extension === 'jpeg' ? 'jpg' : extension === 'tif' ? 'tiff' : extension
  sourceTargets[extension] = ['pdf', 'docx', 'xlsx', 'txt', ...imageFormats.filter((format) => format !== normalized)]
}

const supportedExtensions = new Set(Object.keys(sourceTargets))
const recentStorageKey = 'crewflow.utility.recent.v1'

function cleanExtension(value: string) {
  return value.trim().replace(/^\./, '').toLowerCase()
}

function extensionForName(fileName: string) {
  const extension = fileName.split('.').pop() ?? ''
  return fileName.includes('.') ? cleanExtension(extension) : ''
}

function fileNameForPath(filePath: string) {
  return filePath.replace(/\\/g, '/').split('/').pop() || filePath
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`
  return `${(size / 1024 / 1024).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

function definitionForExtension(extension: string) {
  if (videoExtensions.includes(extension)) return formatDefinitions.find((item) => item.id === 'mp4')
  if (specialAudioExtensions.includes(extension)) return formatDefinitions.find((item) => item.id === 'original')
  if (audioExtensions.includes(extension)) return formatDefinitions.find((item) => item.id === extension) || formatDefinitions.find((item) => item.id === 'mp3')
  if (imageExtensions.includes(extension)) return formatDefinitions.find((item) => item.id === 'png')
  if (extension === 'doc') return formatDefinitions.find((item) => item.id === 'docx')
  if (extension === 'xls') return formatDefinitions.find((item) => item.id === 'xlsx')
  if (extension === 'ppt') return formatDefinitions.find((item) => item.id === 'pptx')
  return formatDefinitions.find((item) => item.id === extension)
}

function normalizeToolFile(value: Partial<ToolFile> & { fileName?: string; filePath?: string }) {
  const name = value.name || value.fileName || fileNameForPath(value.filePath || '')
  return {
    name,
    extension: cleanExtension(value.extension || extensionForName(name)),
    size: Number(value.size) || 0,
    path: value.path || value.filePath,
    file: value.file,
  }
}

function outputPathsForResult(result: UtilityResult) {
  if (Array.isArray(result.outputPaths) && result.outputPaths.length) return result.outputPaths.filter(Boolean)
  return result.outputPath ? [result.outputPath] : []
}

function newJobId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `utility-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function FormatBadge({ format, extension }: { format?: ToolFormat; extension?: string }) {
  const definition = format
    ? formatDefinitions.find((item) => item.id === format)
    : definitionForExtension(extension ?? '')
  const Icon = definition?.icon ?? FileText
  const tone = definition?.id ?? 'generic'
  const label = definition?.shortLabel ?? (extension || 'FILE').slice(0, 4).toUpperCase()
  if (tone === 'mp4') {
    return <span className="utilityFormatBadge video" aria-hidden="true"><svg viewBox="0 0 64 64"><rect x="4" y="10" width="56" height="46" rx="7" fill="#397fd4" /><path d="M11 10h42a7 7 0 0 1 7 7v6H4v-6a7 7 0 0 1 7-7Z" fill="#285da5" /><path d="M14 10h8v13h-8Zm17 0h8v13h-8Zm17 0h8v13h-8Z" fill="#8cbeff" /><path d="M27 31a2 2 0 0 1 3-1l13 8a2 2 0 0 1 0 3l-13 8a2 2 0 0 1-3-1Z" fill="#e6f2ff" /></svg></span>
  }
  if (tone === 'original' || audioFormats.includes(tone as ToolFormat)) {
    return <span className={`utilityFormatBadge audio ${tone}`} aria-hidden="true"><svg viewBox="0 0 64 64"><path d="M29 9 53 4v34c0 7-6 12-13 12-6 0-10-4-10-9s5-10 11-10h4V17l-16 4v26c0 7-6 12-13 12C9 59 5 55 5 50s5-10 12-10h4V19c0-5 3-8 8-10Z" fill="var(--utility-format-color)" /><path d="m29 9 24-5v9l-24 6c-4 1-8 3-8 7v-7c0-5 3-8 8-10Z" fill="var(--utility-format-fold)" /><ellipse cx="14" cy="48" rx="5" ry="3" fill="var(--utility-format-fold)" /><ellipse cx="39" cy="39" rx="5" ry="3" fill="var(--utility-format-fold)" /></svg></span>
  }

  return (
    <span className={`utilityFormatBadge ${tone}`} aria-hidden="true">
      <Icon size={28} strokeWidth={1.8} />
      <b>{label}</b>
    </span>
  )
}

function phaseLabel(phase: string) {
  const value = phase.toLowerCase()
  if (value.includes('download') || value.includes('下载')) return '下载组件'
  if (value.includes('install') || value.includes('安装') || value.includes('提取组件')) return '安装组件'
  if (value.includes('convert') || value.includes('转换')) return '转换文件'
  if (value.includes('valid') || value.includes('校验') || value.includes('检查') || value.includes('verify')) return '校验结果'
  if (value.includes('合并') || value.includes('拆分') || value.includes('优化') || value.includes('处理')) return '处理 PDF'
  if (value.includes('complete') || value.includes('完成')) return '已完成'
  return '准备组件'
}

function isTerminalPhase(phase: string) {
  const value = phase.toLowerCase()
  return value.includes('complete') || value.includes('完成') || value.includes('失败') || value.includes('取消') || value.includes('cancel') || value.includes('fail')
}

function progressPercent(progress: UtilityProgress) {
  if (typeof progress.percent === 'number' && Number.isFinite(progress.percent)) {
    return Math.max(0, Math.min(100, progress.percent))
  }
  const label = phaseLabel(progress.phase)
  if (label === '下载组件') return 28
  if (label === '转换文件' || label === '处理 PDF') return 62
  if (label === '校验结果') return 88
  if (label === '已完成') return 100
  return 8
}

export default function UtilityToolsView() {
  const inputRef = useRef<HTMLInputElement>(null)
  const pendingPickerRef = useRef<{ operation?: PdfOperation } | null>(null)
  const [sourceFile, setSourceFile] = useState<ToolFile | null>(null)
  const [additionalFiles, setAdditionalFiles] = useState<ToolFile[]>([])
  const [imageTarget, setImageTarget] = useState<ToolFormat>('png')
  const [dragActive, setDragActive] = useState(false)
  const [selectedTarget, setSelectedTarget] = useState<ToolFormat | null>(null)
  const [message, setMessage] = useState('')
  const [task, setTask] = useState<UtilityProgress | null>(null)
  const [pdfOperation, setPdfOperation] = useState<PdfOperation | null>(null)
  const [recent, setRecent] = useState<RecentConversion[]>(() => {
    try {
      const value = JSON.parse(localStorage.getItem(recentStorageKey) || '[]')
      return Array.isArray(value) ? value.slice(0, 12) : []
    } catch {
      return []
    }
  })
  const recentRef = useRef(recent)

  const bridge = window.desktopBridge as unknown as UtilityBridge | undefined
  const availableTargets = additionalFiles.length ? ['pdf'] : sourceFile ? sourceTargets[sourceFile.extension] ?? [] : []
  const availableImageFormats = imageFormats.filter((format) => availableTargets.includes(format))
  const displayedFormats = sourceFile
    ? formatDefinitions.filter((item) => item.id === 'png' ? availableImageFormats.length : availableTargets.includes(item.id))
    : formatDefinitions.filter((item) => ['pdf', 'docx', 'xlsx', 'pptx'].includes(item.id))
  const busy = Boolean(task)

  useEffect(() => {
    const unsubscribe = bridge?.onUtilityProgress?.((progress) => {
      setTask((current) => (current?.jobId === progress.jobId ? progress : current))
    })
    return () => unsubscribe?.()
  }, [bridge])

  useEffect(() => {
    recentRef.current = recent
    try {
      localStorage.setItem(recentStorageKey, JSON.stringify(recent))
    } catch {
      setMessage('转换已完成，但无法保存最近记录')
    }
  }, [recent])

  useEffect(() => {
    const checkPaths = bridge?.utilityOutputPathsExist
    if (!checkPaths) return
    const checkExistingPaths: (paths: string[]) => Promise<boolean[]> = checkPaths
    let disposed = false
    let requestId = 0

    async function refreshRecent() {
      const snapshot = recentRef.current
      if (!snapshot.length) return
      const currentRequest = ++requestId
      try {
        const existing = await checkExistingPaths(snapshot.map((item) => item.outputPath))
        if (disposed || currentRequest !== requestId || !Array.isArray(existing)) return
        const missingIds = new Set(snapshot.filter((_, index) => existing[index] === false).map((item) => item.id))
        if (!missingIds.size) return
        setRecent((current) => {
          const next = current.filter((item) => !missingIds.has(item.id))
          recentRef.current = next
          return next
        })
      } catch {
      }
    }

    const handleFocus = () => void refreshRecent()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshRecent()
    }
    void refreshRecent()
    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      disposed = true
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [bridge])

  function saveRecent(items: RecentConversion[]) {
    const next = items.slice(0, 12)
    recentRef.current = next
    setRecent(next)
  }

  function addRecent(sourceName: string, operation: string, result: UtilityResult) {
    const records = outputPathsForResult(result).map((outputPath, index) => ({
      id: `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
      sourceName,
      outputPath,
      operation,
      createdAt: Date.now(),
      warning: result.warning,
    }))
    if (records.length) saveRecent([...records, ...recentRef.current])
  }

  async function revealRecent(item: RecentConversion) {
    if (!bridge?.revealUtilityOutput) {
      showBrowserNotice()
      return
    }
    try {
      const existing = await bridge.utilityOutputPathsExist?.([item.outputPath])
      if (existing?.[0] === false) {
        saveRecent(recentRef.current.filter((record) => record.id !== item.id))
        setMessage('文件已不存在，已从最近转换中移除')
        return
      }
      const opened = await bridge.revealUtilityOutput(item.outputPath)
      if (opened === false) {
        saveRecent(recentRef.current.filter((record) => record.id !== item.id))
        setMessage('文件已不存在，已从最近转换中移除')
      }
    } catch (error) {
      setMessage(error instanceof Error ? `无法打开文件夹：${error.message}` : '无法打开文件所在文件夹')
    }
  }

  function selectFiles(files: ToolFile[]) {
    if (!files.length) return
    const file = files[0]
    if (files.some((item) => !supportedExtensions.has(item.extension))) {
      setMessage(files.some((item) => unsupportedAudioExtensions.includes(item.extension)) ? '此专属音频格式暂不支持，请先在原软件中导出常用音频格式' : '请选择支持的文档、图片、音频或视频文件')
      setSourceFile(null)
      setAdditionalFiles([])
      setSelectedTarget(null)
      return
    }
    if (files.length > 1 && files.some((item) => !imageExtensions.includes(item.extension))) {
      setMessage('文档和音视频请一次选择一个文件；多张图片可以合成 PDF')
      return
    }
    if (files.length > 200) { setMessage('一次最多选择 200 张图片'); return }
    setMessage('')
    setSourceFile(file)
    setAdditionalFiles(files.slice(1))
    setImageTarget(sourceTargets[file.extension].find((format) => imageFormats.includes(format)) || 'png')
    setSelectedTarget(null)
  }

  function selectBrowserFiles(files: File[]) {
    selectFiles(files.map((file) => normalizeToolFile({
      name: file.name,
      extension: extensionForName(file.name),
      size: file.size,
      path: (file as File & { path?: string }).path,
      file,
    })))
  }

  function showBrowserNotice() {
    setMessage('当前是浏览器预览，请在本机 CrewFlow App 中使用转换功能')
  }

  async function resolvePath(file: ToolFile) {
    if (file.file && bridge?.getPathForFile) return await bridge.getPathForFile(file.file)
    if (file.path) return file.path
    throw new Error('无法读取文件路径，请在本机 CrewFlow App 中重试')
  }

  async function executeConversion(file: ToolFile, targetFormat: ToolFormat) {
    if (!bridge?.convertUtilityDocument) {
      showBrowserNotice()
      return
    }
    const jobId = newJobId()
    setTask({ jobId, phase: 'preparing', message: '正在检查本地转换组件', percent: 2 })
    setMessage('')
    try {
      const sourcePath = await resolvePath(file)
      const sourcePaths = [sourcePath, ...await Promise.all(additionalFiles.map(resolvePath))]
      const result = await bridge.convertUtilityDocument({ jobId, sourcePath, sourcePaths, targetFormat })
      if (!outputPathsForResult(result).length) throw new Error(result?.message || '没有生成有效的输出文件')
      addRecent(file.name, targetFormat === 'original' ? '保留原音质' : `转换为 ${targetFormat.toUpperCase()}`, result)
      setTask({ jobId, phase: 'complete', message: result.warning || result.message || '转换完成', percent: 100 })
      setMessage(result.warning || '转换完成，文件已保存到原文件旁边')
      window.setTimeout(() => setTask((current) => (current?.jobId === jobId ? null : current)), 1400)
    } catch (error) {
      setTask(null)
      const detail = error instanceof Error ? error.message : ''
      setMessage(detail.includes('已取消') ? '已取消当前任务' : detail ? `转换失败：${detail}` : '转换失败，请检查文件后重试')
    }
  }

  async function executePdf(operation: PdfOperation, files: ToolFile[]) {
    if (!bridge?.runUtilityPdfTool) {
      showBrowserNotice()
      return
    }
    if (!files.length || (operation === 'merge' ? files.length < 2 : files.length !== 1)) {
      setMessage(operation === 'merge' ? '合并 PDF 至少需要选择两个文件' : '请选择一个 PDF 文件')
      return
    }
    const invalid = files.find((file) => file.extension !== 'pdf')
    if (invalid) {
      setMessage('PDF 工具只支持 PDF 文件')
      return
    }
    const jobId = newJobId()
    setPdfOperation(operation)
    setTask({ jobId, phase: 'preparing', message: '正在准备 PDF 组件', percent: 4 })
    setMessage('')
    try {
      const sourcePaths = await Promise.all(files.map(resolvePath))
      const result = await bridge.runUtilityPdfTool({ jobId, operation, sourcePaths })
      if (!outputPathsForResult(result).length) throw new Error(result?.message || '没有生成有效的输出文件')
      const labels: Record<PdfOperation, string> = { merge: '合并 PDF', split: '拆分 PDF', compress: '压缩 PDF' }
      addRecent(files.map((file) => file.name).join('、'), labels[operation], result)
      setTask({ jobId, phase: 'complete', message: result.warning || result.message || '处理完成', percent: 100 })
      setMessage(result.warning || '处理完成，文件已保存到原文件旁边')
      window.setTimeout(() => {
        setTask((current) => (current?.jobId === jobId ? null : current))
        setPdfOperation((current) => (current === operation ? null : current))
      }, 1400)
    } catch (error) {
      setTask(null)
      setPdfOperation(null)
      const detail = error instanceof Error ? error.message : ''
      setMessage(detail.includes('已取消') ? '已取消当前任务' : detail.includes('没有变小') ? '文件已经是较优状态，未生成更大副本' : detail ? `处理失败：${detail}` : '处理失败，请检查文件后重试')
    }
  }

  async function openFilePicker(operation?: PdfOperation) {
    if (busy) return
    const multiple = !operation || operation === 'merge'
    if (bridge?.selectUtilityFiles) {
      try {
        const result = await bridge.selectUtilityFiles({
          multiple,
          extensions: operation ? ['pdf'] : Array.from(supportedExtensions),
          operation: operation || 'convert',
          pdfOnly: Boolean(operation),
        })
        const files = (result || []).map((file) => normalizeToolFile(file as ToolFile))
        if (!files.length) return
        if (operation) await executePdf(operation, files)
        else selectFiles(files)
      } catch (error) {
        setMessage(error instanceof Error ? `选择文件失败：${error.message}` : '选择文件失败，请重试')
      }
      return
    }
    pendingPickerRef.current = operation ? { operation } : null
    if (inputRef.current) {
      inputRef.current.multiple = multiple
      inputRef.current.accept = operation ? '.pdf' : Array.from(supportedExtensions, (extension) => `.${extension}`).join(',')
      inputRef.current.click()
    }
  }

  async function cancelTask() {
    if (!task) return
    const jobId = task.jobId
    setTask((current) => current ? { ...current, phase: 'cancelling', message: '正在停止处理', indeterminate: true } : null)
    await bridge?.cancelUtilityTask?.(jobId)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setDragActive(false)
    if (busy) return
    selectBrowserFiles(Array.from(event.dataTransfer.files))
  }

  function handleDropKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    void openFilePicker()
  }

  const pdfAction = (operation: PdfOperation) => {
    setMessage('')
    void openFilePicker(operation)
  }

  return (
    <section className="utilityToolsPage">
      <section className="utilityWorkbench panel">
        <div className="utilitySectionHeading utilityWorkbenchHeading">
          <div><span>格式转换</span><small>{sourceFile ? '已识别当前文件可用的格式' : '拖入文件后选择目标格式'}</small></div>
        </div>

        {task && (
          <section className="utilityTaskProgress utilityTaskProgressInline" aria-live="polite">
            <div className="utilityTaskProgressTop">
              <div>
                <strong>{task.firstUse ? '首次使用，正在准备转换组件' : pdfOperation ? ({ merge: '合并 PDF', split: '拆分 PDF', compress: '压缩 PDF' }[pdfOperation]) : '格式转换'}</strong>
                <span>{phaseLabel(task.phase)} · {task.message}</span>
              </div>
              {!isTerminalPhase(task.phase) && <button type="button" onClick={() => void cancelTask()} aria-label="取消任务"><X size={16} />取消</button>}
            </div>
            <div className={`utilityProgressTrack${task.indeterminate ? ' indeterminate' : ''}`}>
              <span style={task.indeterminate ? undefined : { width: `${progressPercent(task)}%` }} />
            </div>
            <small>{task.indeterminate ? '正在处理' : `${progressPercent(task)}%`}</small>
          </section>
        )}

        <div
          className={`utilityDropZone${dragActive ? ' dragActive' : ''}${sourceFile ? ' hasFile' : ''}`}
          role="button" tabIndex={0} aria-label="选择要转换的文件"
          onClick={() => void openFilePicker()}
          onKeyDown={handleDropKeyDown}
          onDragEnter={(event) => { event.preventDefault(); setDragActive(true) }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragActive(false) }}
          onDrop={handleDrop}
        >
          <input
            ref={inputRef} type="file" accept={Array.from(supportedExtensions, (extension) => `.${extension}`).join(',')} multiple hidden
            onChange={(event) => {
              const files = Array.from(event.target.files || []).map((file) => normalizeToolFile({
                name: file.name, extension: extensionForName(file.name), size: file.size,
                path: (file as File & { path?: string }).path,
                file,
              }))
              const pending = pendingPickerRef.current
              pendingPickerRef.current = null
              event.target.value = ''
              if (pending?.operation) void executePdf(pending.operation, files)
              else selectFiles(files)
            }}
          />
          {sourceFile ? (
            <>
              <div className="utilitySelectedFile"><FormatBadge extension={sourceFile.extension} /><div><strong>{sourceFile.name}</strong><span>{[sourceFile.extension.toUpperCase(), formatFileSize(sourceFile.size)].filter(Boolean).join(' · ')}</span></div></div>
              {additionalFiles.length > 0 && <div className="utilityImageList"><strong>{additionalFiles.length + 1} 张图片 · 按下列顺序合成 PDF</strong>{[sourceFile, ...additionalFiles].map((file, index) => <span key={`${file.name}-${index}`}>{index + 1}. {file.name}</span>)}</div>}
              <span className="utilityReplaceFile"><Upload size={15} />更换文件</span>
            </>
          ) : (
            <><span className="utilityDropIcon"><FolderOpen size={38} /></span><strong>把文件拖到这里</strong><span>支持文档、图片、视频、音频及 NCM 等专属音乐</span><small>也可以点击选择文件</small></>
          )}
          {message && <span className="utilityFileMessage">{message}</span>}
        </div>

        <div className="utilityFlowIcon" aria-hidden="true"><ArrowRight size={24} /></div>

        <div className="utilityTargetSection">
          {availableImageFormats.length > 0 && <label className="utilityImageFormat">图片格式<select value={imageTarget} disabled={busy} onChange={(event) => setImageTarget(event.target.value as ToolFormat)}>{availableImageFormats.map((format) => <option key={format} value={format}>{format.toUpperCase()}</option>)}</select></label>}
          <div className={`utilityTargetGrid${displayedFormats.length > 4 ? ' expanded' : ''}`}>
            {displayedFormats.map((format) => {
              const target = format.id === 'png' ? imageTarget : format.id
              const enabled = availableTargets.includes(target)
              const selected = selectedTarget === target
              const layoutFirst = sourceFile?.extension === 'pdf' && format.id === 'pptx'
              const editable = ['docx', 'xlsx'].includes(format.id) && sourceFile
              return (
                <button
                  key={format.id} className={`utilityTargetButton ${format.id}${enabled ? ' available' : ''}${selected ? ' selected' : ''}`}
                  type="button" aria-disabled={!enabled} aria-pressed={selected} tabIndex={enabled ? 0 : -1} disabled={!enabled || busy}
                  onClick={() => { if (enabled && sourceFile) { setSelectedTarget(target); void executeConversion(sourceFile, target) } }}
                >
                  <FormatBadge format={format.id} /><strong>{format.id === 'png' ? target.toUpperCase() : format.label}</strong>{format.id === 'original' && <small>不重新编码</small>}{layoutFirst && <small>图片版</small>}{editable && <small>{format.id === 'xlsx' ? '提取表格' : '可编辑'}</small>}{selected && <CheckCircle2 className="utilityTargetCheck" size={17} />}
                </button>
              )
            })}
          </div>
        </div>

        <div className="utilitySaveHint"><span /><p>{selectedTarget ? `${selectedTarget === 'original' ? '保留原音质' : `目标格式：${selectedTarget.toUpperCase()}`} · ` : ''}{additionalFiles.length ? '合成后保存在第一张图片旁边' : '转换后保存在原文件旁边'}</p><span /></div>
      </section>

      <div className="utilityLowerGrid">
        <section className="utilityPdfTools panel">
          <div className="utilityPanelHeading"><div><h2>PDF 工具</h2></div></div>
          <div className="utilityPdfActions">
            <button type="button" disabled={busy} onClick={() => pdfAction('merge')}><span className="utilityPdfActionIcon merge"><Combine size={23} /></span><strong>合并 PDF</strong><ChevronRight size={17} /></button>
            <button type="button" disabled={busy} onClick={() => pdfAction('split')}><span className="utilityPdfActionIcon split"><Scissors size={23} /></span><strong>拆分 PDF</strong><ChevronRight size={17} /></button>
            <button type="button" disabled={busy} onClick={() => pdfAction('compress')}><span className="utilityPdfActionIcon compress"><Minimize2 size={23} /></span><strong>压缩 PDF</strong><ChevronRight size={17} /></button>
          </div>
        </section>

        <section className="utilityRecent panel">
          <div className="utilityPanelHeading"><div><h2>最近转换</h2><p>最近生成的文件</p></div></div>
          {recent.length ? (
            <div className="utilityRecentList">
              {recent.map((item) => (
                <button key={item.id} type="button" className="utilityRecentItem" onClick={() => void revealRecent(item)}>
                  <FormatBadge extension={extensionForName(item.outputPath)} /><span><strong>{fileNameForPath(item.outputPath)}</strong><small>{item.operation} · {item.sourceName}</small></span><FolderOpen size={16} />
                </button>
              ))}
            </div>
          ) : (
            <div className="utilityRecentEmpty"><Clock3 size={28} /><div><strong>暂无转换记录</strong><span>完成转换后可从这里快速定位文件</span></div></div>
          )}
        </section>
      </div>
    </section>
  )
}

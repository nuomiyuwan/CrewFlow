const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const UV_VERSION = '0.11.28'
const PYTHON_VERSION = '3.11.15'
const TABLE_MODEL = {
  name: 'slanet-plus.onnx',
  url: 'https://www.modelscope.cn/models/RapidAI/RapidTable/resolve/master/slanet-plus.onnx',
  sha256: 'd57a942af6a2f57d6a4a0372573c696a2379bf5857c45e2ac69993f3b334514b',
  size: 7758305,
}
const UV_ASSETS = {
  'darwin-arm64': ['aarch64-apple-darwin.tar.gz', '33540eb7c883ab857eff79bd5ac2aa31fe27b595abecb4a9c003a2c998447232', 22568053],
  'darwin-x64': ['x86_64-apple-darwin.tar.gz', '2ad79983127ffca7d77b77ce6a24278d7e4f7b817a1acf72fea5f8124b4aac5e', 24355900],
  'win32-x64': ['x86_64-pc-windows-msvc.zip', '0a23463216d09c6a72ff80ef5dc5a795f07dc1575cb84d24596c2f124a441b7b', 25568726],
}

function createConversionRuntime({ componentPath, platform, arch, downloadAsset, runCommand, emitProgress, UtilityError, options }) {
  const runtimeRoot = path.join(componentPath, `document-runtime-${PYTHON_VERSION}-${arch}`)
  const environment = {
    UV_PYTHON_INSTALL_DIR: path.join(componentPath, 'python'),
    UV_CACHE_DIR: path.join(componentPath, 'python-cache'),
    UV_PYTHON_NO_REGISTRY: '1',
    UV_NO_CONFIG: '1',
    UV_PYTHON_DOWNLOADS: 'automatic',
    PYTHONPATH: '',
    PYTHONHOME: '',
    PYTHONUTF8: '1',
  }
  const python = path.join(runtimeRoot, platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')

  async function getUv(job, emit) {
    if (options.uvPath) return options.uvPath
    const assetInfo = UV_ASSETS[`${platform}-${arch}`]
    if (!assetInfo) throw new UtilityError('当前平台暂不支持文档识别组件', 'ERR_UTILITY_PLATFORM')
    const root = path.join(componentPath, `uv-${UV_VERSION}-${arch}`)
    const name = `uv-${assetInfo[0]}`
    const binary = platform === 'win32' ? path.join(root, 'uv.exe') : path.join(root, name.replace(/\.tar\.gz$/, ''), 'uv')
    if (fs.existsSync(binary)) return binary
    const archive = await downloadAsset({ name, url: `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${name}`, sha256: assetInfo[1], size: assetInfo[2] }, job, emit, '下载组件', { firstUse: true })
    const stage = `${root}.${job.id}.extracting`
    await fs.promises.mkdir(stage, { recursive: true })
    job.tempPaths.add(stage)
    const tar = platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'
    await runCommand(tar, ['-xf', archive, '-C', stage], { job, platform })
    await fs.promises.rm(root, { recursive: true, force: true })
    await fs.promises.rename(stage, root)
    job.tempPaths.delete(stage)
    if (!fs.existsSync(binary)) throw new UtilityError('文档运行组件不完整', 'ERR_UTILITY_INSTALL')
    return binary
  }

  async function prepare(kind, stageDirectory, job, emit) {
    if (options.conversionPythonPath) return options.conversionPythonPath
    const requirements = await fs.promises.readFile(path.join(__dirname, `requirements-${kind}.txt`))
    const fingerprint = crypto.createHash('sha256').update(requirements).digest('hex')
    const marker = path.join(runtimeRoot, `${kind}-${fingerprint}.ready`)
    if (fs.existsSync(python) && fs.existsSync(marker)) return python
    emitProgress(emit, job.id, '安装组件', kind === 'ocr' ? '首次使用文字识别，正在准备识别组件' : '首次使用，正在准备文档与图片组件', 5, { firstUse: true, indeterminate: true })
    const uv = await getUv(job, emit)
    const commandOptions = { job, platform, env: environment, timeoutMs: 30 * 60 * 1000 }
    if (!fs.existsSync(python)) {
      await runCommand(uv, ['venv', '--managed-python', '--python', PYTHON_VERSION, runtimeRoot], {
        ...commandOptions,
        emit, jobId: job.id, phase: '安装组件', message: '正在下载并安装独立运行环境', percent: 15,
        progressDetails: { firstUse: true, indeterminate: true },
      })
    }
    const requirementsPath = path.join(stageDirectory, `requirements-${kind}.txt`)
    await fs.promises.writeFile(requirementsPath, requirements)
    await runCommand(uv, ['pip', 'install', '--python', python, '--require-hashes', '--index-url', 'https://pypi.org/simple', '-r', requirementsPath], {
      ...commandOptions,
      emit, jobId: job.id, phase: '安装组件', message: kind === 'ocr' ? '正在下载并安装文字、表格识别组件' : '正在下载并安装文档、图片处理组件', percent: 30,
      progressDetails: { firstUse: true, indeterminate: true },
      onLine: (line) => {
        const match = line.match(/(?:Downloading|Building|Prepared|Installed)\s+(.+)/)
        if (match) emitProgress(emit, job.id, '安装组件', `正在准备组件：${match[1].slice(0, 100)}`, 30, { firstUse: true, indeterminate: true })
      },
    })
    await fs.promises.writeFile(marker, fingerprint)
    return python
  }

  async function convert(request, stageDirectory, job, emit) {
    const workerPath = path.join(stageDirectory, 'conversion-worker.py')
    const requestPath = path.join(stageDirectory, 'conversion-request.json')
    await fs.promises.copyFile(path.join(__dirname, 'worker.py'), workerPath)
    let result = null
    let workerError = null
    async function execute(kind) {
      const executable = await prepare(kind, stageDirectory, job, emit)
      const tableModelPath = options.tableModelPath || path.join(componentPath, TABLE_MODEL.name)
      if (kind === 'ocr' && !options.tableModelPath) await downloadAsset(TABLE_MODEL, job, emit, '下载识别模型', { firstUse: !fs.existsSync(tableModelPath) })
      await fs.promises.writeFile(requestPath, JSON.stringify({ ...request, tableModelPath }))
      emitProgress(emit, job.id, '转换文件', '正在读取文档内容', 45, { indeterminate: true })
      await runCommand(executable, ['-I', '-X', 'utf8', '-u', workerPath, requestPath], {
        job, platform, env: environment, timeoutMs: 30 * 60 * 1000,
        onLine: (line) => {
          if (!line.startsWith('CREWFLOW_JSON:')) return
          try {
            const value = JSON.parse(line.slice('CREWFLOW_JSON:'.length))
            if (value.type === 'progress') emitProgress(emit, job.id, value.phase || '转换文件', value.message, value.percent || 55, { indeterminate: value.indeterminate })
            if (value.type === 'result') result = value
            if (value.type === 'error') workerError = value
          } catch {
          }
        },
      })
    }
    try {
      await execute('base')
    } catch (error) {
      if (error.exitCode === 78 && !job.cancelled) {
        workerError = null
        try { await execute('ocr') } catch (retryError) {
          if (job.cancelled) throw retryError
          throw workerError ? new UtilityError(workerError.message, workerError.code) : retryError
        }
      } else {
        if (job.cancelled) throw error
        throw workerError ? new UtilityError(workerError.message, workerError.code) : error
      }
    }
    if (!result) throw new UtilityError('转换组件未返回有效结果', 'ERR_UTILITY_OUTPUT')
    return result
  }

  return { convert }
}

module.exports = { createConversionRuntime, UV_ASSETS }

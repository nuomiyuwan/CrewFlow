const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const os = require('os')
const { AUDIO_COMPONENT_VERSION, AUDIO_ASSETS } = require('./assets.cjs')
const { SPECIAL_AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, MEDIA_INPUT_OPTIONS: INPUT_OPTIONS, mediaDuration } = require('./formats.cjs')
const { unpackAudio } = require('./unpack.cjs')
const { createVideoConverter } = require('./video.cjs')

function createAudioRuntime({ componentPath, platform, arch, options, downloadAsset, runCommand, emitProgress, UtilityError, throwIfCancelled }) {
  async function hashFile(filePath) {
    const hash = crypto.createHash('sha256')
    for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk)
    return hash.digest('hex')
  }

  async function getTools(job, emit) {
    if (options.ffmpegPath && options.ffprobePath) return { ffmpeg: options.ffmpegPath, ffprobe: options.ffprobePath }
    if (platform === 'darwin' && Number(os.release().split('.')[0]) < 24) throw new UtilityError('当前音视频组件需要 macOS 15 或更新版本', 'ERR_AUDIO_PLATFORM')
    const target = `${platform}-${arch}`
    const selected = AUDIO_ASSETS[target]
    if (!selected) throw new UtilityError('当前平台暂不支持音视频转换组件', 'ERR_UTILITY_PLATFORM')
    const root = path.join(componentPath, `audio-${AUDIO_COMPONENT_VERSION}-${target}`)
    const binaries = Object.fromEntries(selected.map((asset) => [asset.name.split('-')[0], path.join(root, asset.name)]))
    try {
      const marker = JSON.parse(await fs.promises.readFile(path.join(root, 'ready.json'), 'utf8'))
      if (Object.values(binaries).every((binary) => marker[path.relative(root, binary)]) &&
          (await Promise.all(Object.entries(marker).map(async ([relative, hash]) => await hashFile(path.join(root, relative)) === hash))).every(Boolean)) return binaries
    } catch {
    }
    const stage = `${root}.${job.id}.extracting`
    await fs.promises.mkdir(stage, { recursive: true })
    job.tempPaths.add(stage)
    emitProgress(emit, job.id, '安装组件', '首次使用，正在准备音视频组件', 4, { firstUse: true, indeterminate: true })
    const marker = {}
    for (const asset of selected) {
      const archive = await downloadAsset({ ...asset, name: `audio-${AUDIO_COMPONENT_VERSION}-${asset.name}` }, job, emit, '下载组件', { firstUse: true })
      throwIfCancelled(job)
      const name = asset.name.split('-')[0]
      emitProgress(emit, job.id, '安装组件', '正在安装音视频组件', 32, { firstUse: true, indeterminate: true })
      const binary = path.join(stage, asset.name)
      await fs.promises.copyFile(archive, binary, fs.constants.COPYFILE_EXCL)
      if (platform !== 'win32') await fs.promises.chmod(binary, 0o755)
      const { stdout: version } = await runCommand(binary, ['-version'], { job, platform, timeoutMs: 30000 })
      if (!version.startsWith(`${name} version `) || version.includes('--enable-nonfree')) throw new UtilityError('音频组件版本不符合要求', 'ERR_AUDIO_COMPONENT')
      const { stdout: license } = await runCommand(binary, ['-L'], { job, platform, timeoutMs: 30000 })
      await fs.promises.writeFile(path.join(stage, `${name}-LICENSE.txt`), license)
      marker[path.relative(stage, binary)] = await hashFile(binary)
    }
    await fs.promises.copyFile(path.join(__dirname, 'NOTICE.txt'), path.join(stage, 'NOTICE.txt'))
    await fs.promises.copyFile(path.join(__dirname, 'COPYING.GPLv3'), path.join(stage, 'COPYING.GPLv3'))
    throwIfCancelled(job)
    await fs.promises.writeFile(path.join(stage, 'ready.json'), JSON.stringify(marker))
    await fs.promises.rm(root, { recursive: true, force: true })
    await fs.promises.rename(stage, root)
    job.tempPaths.delete(stage)
    return binaries
  }

  async function probe(binary, filePath, job) {
    const { stdout } = await runCommand(binary, ['-v', 'error', ...INPUT_OPTIONS, '-show_streams', '-show_format', '-of', 'json', filePath], { job, platform, timeoutMs: 120000 })
    let metadata
    try { metadata = JSON.parse(stdout) } catch { throw new UtilityError('无法读取音频信息', 'ERR_AUDIO_INPUT') }
    const stream = metadata.streams?.find((stream) => stream.codec_type === 'audio')
    if (!stream || !stream.channels || !stream.sample_rate) throw new UtilityError('文件中没有可转换的音轨', 'ERR_AUDIO_INPUT')
    if (stream.channels > 8) throw new UtilityError('暂不支持超过 8 声道的音频', 'ERR_AUDIO_INPUT')
    const duration = mediaDuration(stream, metadata.format)
    if (!Number.isFinite(duration) || duration <= 0) throw new UtilityError('音频时长无效，文件可能不完整', 'ERR_AUDIO_INPUT')
    return { stream, duration, cover: metadata.streams.some((stream) => stream.codec_type === 'video' && stream.disposition?.attached_pic) }
  }

  async function convert(sourcePath, targetFormat, directory, job, emit) {
    const extension = path.extname(sourcePath).slice(1).toLowerCase()
    const special = SPECIAL_AUDIO_EXTENSIONS.includes(extension)
    const video = VIDEO_EXTENSIONS.includes(extension)
    let restored = { sourcePath, metadata: {} }
    if (special) restored = await unpackAudio(sourcePath, directory, { job, emitProgress, emit, UtilityError, throwIfCancelled })
    const tools = await getTools(job, emit)
    throwIfCancelled(job)
    emitProgress(emit, job.id, '转换文件', '正在读取音频信息', 45, { indeterminate: true })
    let info
    try { info = await probe(tools.ffprobe, restored.sourcePath, job) } catch (error) {
      if (job.cancelled) throw error
      if (video && error.code === 'ERR_AUDIO_INPUT') throw error
      throw new UtilityError(special ? '未能读取完整音频，文件可能损坏或使用了暂不支持的加密版本' : '无法读取此音频，文件可能损坏、受保护或使用了不支持的编码', 'ERR_AUDIO_INPUT')
    }
    const codec = info.stream.codec_name
    const nativeFormat = ({ mp3: 'mp3', flac: 'flac', opus: 'opus', vorbis: 'ogg', aac: 'm4a', alac: 'm4a', ape: 'ape' })[codec] || (codec.startsWith('pcm_') ? 'wav' : '')
    const outputFormat = targetFormat === 'original' ? nativeFormat : targetFormat
    if (!outputFormat) throw new UtilityError('暂不能无损还原这种编码，请选择 MP3 或 WAV', 'ERR_AUDIO_FORMAT')
    const outputPath = path.join(directory, `output.${outputFormat}`)
    const copy = targetFormat === 'original' || ({ mp3: 'mp3', flac: 'flac', opus: 'opus', ogg: 'vorbis', m4a: 'aac' })[outputFormat] === codec
    const warnings = restored.warning ? [restored.warning] : []
    if (outputFormat === 'ape') {
      await fs.promises.copyFile(restored.sourcePath, outputPath, fs.constants.COPYFILE_EXCL)
    } else {
      const args = ['-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-err_detect', 'explode', ...INPUT_OPTIONS, '-i', restored.sourcePath]
      const allowCover = !video && ['mp3', 'flac', 'm4a'].includes(outputFormat)
      if (restored.coverPath && allowCover) args.push('-protocol_whitelist', 'file,pipe', '-i', restored.coverPath)
      args.push('-map', '0:a:0', '-map_metadata', '0', '-map_chapters', '-1')
      if (allowCover && (restored.coverPath || info.cover)) {
        args.push('-map', restored.coverPath ? '1:v:0' : '0:v:0?', '-c:v', 'copy', '-disposition:v:0', 'attached_pic')
      } else { args.push('-vn') }
      if (copy) {
        args.push('-c:a', 'copy')
      } else {
        const bits = Number(info.stream.bits_per_raw_sample || info.stream.bits_per_sample) || (/32|flt/.test(info.stream.sample_fmt) ? 24 : 16)
        const wavCodec = /flt|dbl/.test(info.stream.sample_fmt) ? 'pcm_f32le' : bits > 24 ? 'pcm_s32le' : bits > 16 ? 'pcm_s24le' : 'pcm_s16le'
        const encoders = {
          mp3: ['-c:a', 'libmp3lame', '-b:a', '320k'],
          wav: ['-c:a', wavCodec],
          flac: ['-c:a', 'flac', '-compression_level', '8', '-sample_fmt', bits > 16 ? 's32' : 's16'],
          m4a: ['-c:a', 'aac', '-b:a', '256k'],
          opus: ['-c:a', 'libopus', '-b:a', '192k'],
        }
        args.push(...encoders[outputFormat])
        if (outputFormat === 'mp3' && info.stream.channels > 2) {
          args.push('-ac', '2')
          warnings.push('MP3 已转为双声道')
        }
        if (['mp3', 'm4a', 'ogg', 'opus'].includes(outputFormat)) warnings.push('已进行有损编码，原文件保持不变')
        else if (!['flac', 'alac', 'ape'].includes(codec) && !codec.startsWith('pcm_')) warnings.push('转为无损格式不会提升原有音质')
      }
      for (const [key, value] of Object.entries(restored.metadata)) args.push('-metadata', `${key}=${value}`)
      if (outputFormat === 'mp3') args.push('-id3v2_version', '3')
      if (outputFormat === 'm4a') args.push('-movflags', '+faststart')
      args.push('-progress', 'pipe:1', '-nostats', '-n', outputPath)
      emitProgress(emit, job.id, '转换文件', copy ? '正在保存原始音质' : `正在转换为 ${outputFormat.toUpperCase()}`, 48)
      let lastPercent = -1
      await runCommand(tools.ffmpeg, args, {
        job, platform, timeoutMs: 60 * 60 * 1000,
        onLine: (line) => {
          if (!line.startsWith('out_time_us=')) return
          const seconds = Number(line.slice(12)) / 1000000
          if (!Number.isFinite(seconds)) return
          const percent = Math.min(84, Math.round(48 + 36 * seconds / info.duration))
          if (percent !== lastPercent) emitProgress(emit, job.id, '转换文件', copy ? '正在保存原始音质' : `正在转换为 ${outputFormat.toUpperCase()}`, percent)
          lastPercent = percent
        },
      })
    }
    emitProgress(emit, job.id, '校验结果', '正在检查音频完整性', 86, { indeterminate: true })
    const result = await probe(tools.ffprobe, outputPath, job)
    const expectedCodecs = { mp3: ['mp3'], wav: ['pcm_s16le', 'pcm_s24le', 'pcm_s32le', 'pcm_f32le', 'pcm_f64le', 'pcm_u8'], flac: ['flac'], m4a: targetFormat === 'original' ? ['aac', 'alac'] : ['aac'], ogg: ['vorbis'], opus: ['opus'], ape: ['ape'] }
    const channels = outputFormat === 'mp3' ? Math.min(info.stream.channels, 2) : info.stream.channels
    if (!expectedCodecs[outputFormat].includes(result.stream.codec_name) || channels !== result.stream.channels || Math.abs(result.duration - info.duration) > Math.max(0.3, info.duration * 0.002)) {
      throw new UtilityError('转换后的编码、声道或时长异常，未保存结果', 'ERR_AUDIO_OUTPUT')
    }
    await runCommand(tools.ffmpeg, ['-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-err_detect', 'explode', ...INPUT_OPTIONS, '-i', outputPath, '-map', '0:a:0', '-f', 'null', '-'], { job, platform, timeoutMs: 60 * 60 * 1000 })
    throwIfCancelled(job)
    return { outputPath, outputFormat, warning: warnings.join('；') }
  }

  return { convert, convertVideo: createVideoConverter({ getTools, platform, runCommand, emitProgress, UtilityError, throwIfCancelled }) }
}

module.exports = { createAudioRuntime }

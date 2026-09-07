const path = require('path')
const { MEDIA_INPUT_OPTIONS, mediaDuration } = require('./formats.cjs')

function createVideoConverter({ getTools, platform, runCommand, emitProgress, UtilityError, throwIfCancelled }) {
  async function probe(binary, filePath, job) {
    const { stdout } = await runCommand(binary, ['-v', 'error', ...MEDIA_INPUT_OPTIONS, '-show_streams', '-show_format', '-of', 'json', filePath], { job, platform, timeoutMs: 120000 })
    const metadata = JSON.parse(stdout)
    const streams = metadata.streams || []
    const video = streams.find((stream) => stream.codec_type === 'video' && !stream.disposition?.attached_pic)
    if (!video?.width || !video.height) throw new UtilityError('文件中没有可转换的视频画面', 'ERR_VIDEO_INPUT')
    const duration = mediaDuration(video, metadata.format)
    if (!Number.isFinite(duration) || duration <= 0) throw new UtilityError('视频时长无效，文件可能不完整', 'ERR_VIDEO_INPUT')
    const rotation = Number(video.side_data_list?.find((data) => data.rotation !== undefined)?.rotation || video.tags?.rotate || 0)
    return { video, audio: streams.find((stream) => stream.codec_type === 'audio'), streams, duration, rotation }
  }

  return async function convertVideo(sourcePath, directory, job, emit) {
    const tools = await getTools(job, emit)
    throwIfCancelled(job)
    emitProgress(emit, job.id, '转换文件', '正在读取视频信息', 40, { indeterminate: true })
    let info
    try { info = await probe(tools.ffprobe, sourcePath, job) } catch (error) {
      if (job.cancelled || error.code === 'ERR_VIDEO_INPUT') throw error
      throw new UtilityError('无法读取此视频，文件可能损坏、受保护或使用了不支持的编码', 'ERR_VIDEO_INPUT')
    }
    if (['smpte2084', 'arib-std-b67'].includes(info.video.color_transfer) || info.video.side_data_list?.some((data) => /dovi/i.test(data.side_data_type))) {
      throw new UtilityError('HDR 和杜比视界视频暂不支持转为 MP4，可先提取音频', 'ERR_VIDEO_HDR')
    }
    if (info.audio?.channels > 8) throw new UtilityError('暂不支持超过 8 声道的视频音轨', 'ERR_VIDEO_INPUT')
    const copyVideo = info.video.codec_name === 'h264' && info.video.pix_fmt === 'yuv420p' && !info.rotation && ['progressive', 'unknown', undefined].includes(info.video.field_order)
    const outputPath = path.join(directory, 'output.mp4')
    const args = ['-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-err_detect', 'explode', ...MEDIA_INPUT_OPTIONS, '-i', sourcePath,
      '-map', `0:${info.video.index}`, '-map', '0:a:0?', '-map_metadata', '0', '-map_chapters', '-1']
    if (copyVideo) {
      args.push('-c:v', 'copy')
    } else {
      args.push('-vf', 'bwdif=mode=send_frame:parity=auto:deint=interlaced,pad=ceil(iw/2)*2:ceil(ih/2)*2',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p', '-threads', '4', '-fps_mode', 'vfr', '-metadata:s:v:0', 'rotate=0')
    }
    if (info.audio) {
      if (info.audio.codec_name === 'aac') args.push('-c:a', 'copy')
      else args.push('-c:a', 'aac', '-b:a', info.audio.channels > 2 ? '512k' : '256k')
    }
    args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '-n', outputPath)

    function onProgress(phase, message, start, end) {
      let lastPercent = -1
      return (line) => {
        if (!line.startsWith('out_time_us=')) return
        const seconds = Number(line.slice(12)) / 1000000
        if (!Number.isFinite(seconds)) return
        const percent = Math.max(start, Math.min(end, Math.round(start + (end - start) * seconds / info.duration)))
        if (percent !== lastPercent) emitProgress(emit, job.id, phase, message, percent)
        lastPercent = percent
      }
    }

    emitProgress(emit, job.id, '转换文件', '正在转换为 MP4', 45)
    await runCommand(tools.ffmpeg, args, {
      job, platform, timeoutMs: 12 * 60 * 60 * 1000,
      onLine: onProgress('转换文件', '正在转换为 MP4', 45, 84),
    })
    emitProgress(emit, job.id, '校验结果', '正在检查视频和声音', 85)
    const result = await probe(tools.ffprobe, outputPath, job)
    const rotated = !copyVideo && Math.abs(info.rotation) % 180 === 90
    const width = rotated ? info.video.height : info.video.width
    const height = rotated ? info.video.width : info.video.height
    const expectedWidth = copyVideo ? width : Math.ceil(width / 2) * 2
    const expectedHeight = copyVideo ? height : Math.ceil(height / 2) * 2
    const inputOffset = Number(info.audio?.start_time) - Number(info.video.start_time)
    const outputOffset = Number(result.audio?.start_time) - Number(result.video.start_time)
    if (result.video.codec_name !== 'h264' || result.video.width !== expectedWidth || result.video.height !== expectedHeight || result.rotation ||
        Math.abs(result.duration - info.duration) > Math.max(0.3, info.duration * 0.002) ||
        (info.audio && (result.audio?.codec_name !== 'aac' || result.audio.channels !== info.audio.channels)) ||
        (Number.isFinite(inputOffset) && Number.isFinite(outputOffset) && Math.abs(inputOffset - outputOffset) > 0.15)) {
      throw new UtilityError('转换后的视频尺寸、时长或音轨异常，未保存结果', 'ERR_VIDEO_OUTPUT')
    }
    await runCommand(tools.ffmpeg, ['-hide_banner', '-nostdin', '-v', 'error', '-xerror', '-err_detect', 'explode', ...MEDIA_INPUT_OPTIONS,
      '-i', outputPath, '-map', '0:v:0', '-map', '0:a:0?', '-progress', 'pipe:1', '-nostats', '-f', 'null', '-'], {
      job, platform, timeoutMs: 12 * 60 * 60 * 1000,
      onLine: onProgress('校验结果', '正在检查视频和声音', 85, 99),
    })
    throwIfCancelled(job)
    const warnings = []
    if (info.streams.filter((stream) => stream.codec_type === 'audio').length > 1) warnings.push('已保留第一个音轨')
    if (info.streams.some((stream) => stream.codec_type === 'subtitle')) warnings.push('独立字幕未导出')
    return { outputPath, outputFormat: 'mp4', warning: warnings.join('；') }
  }
}

module.exports = { createVideoConverter }

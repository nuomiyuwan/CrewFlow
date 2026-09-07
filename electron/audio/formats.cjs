const AUDIO_TARGETS = ['mp3', 'wav', 'flac', 'm4a', 'opus']
const VIDEO_EXTENSIONS = ['mp4', 'mov', 'mkv', 'avi', 'wmv', 'flv', 'webm', 'm4v', 'ts', 'mts', 'm2ts', 'mpg', 'mpeg', '3gp', 'mxf']
const MEDIA_INPUT_OPTIONS = ['-protocol_whitelist', 'file,pipe', '-format_whitelist', 'aac,ac3,aiff,amr,ape,asf,flac,mp3,mov,ogg,wav,wv,tta,avi,flv,live_flv,matroska,webm,mpegts,mpeg,m4v,mxf']
const AUDIO_EXTENSIONS = ['mp3', 'wav', 'flac', 'm4a', 'm4b', 'aac', 'ogg', 'opus', 'aiff', 'aif', 'wma', 'ape', 'amr', 'ac3', 'wv', 'tta']
const SPECIAL_AUDIO_EXTENSIONS = ['ncm', 'uc', 'qmc0', 'qmc2', 'qmc3', 'qmcflac', 'qmcogg', 'kwm']
const UNSUPPORTED_AUDIO_EXTENSIONS = ['kgm', 'kgma', 'vpr', 'mflac', 'mflac0', 'mgg', 'mgg0', 'mgg1', 'mggl', 'mmp4', 'qmc4', 'qmc6', 'qmc8', 'm4p']

function audioTargets(extension) {
  if (VIDEO_EXTENSIONS.includes(extension)) return AUDIO_TARGETS
  if (SPECIAL_AUDIO_EXTENSIONS.includes(extension)) return ['original', ...AUDIO_TARGETS]
  if (AUDIO_EXTENSIONS.includes(extension)) return AUDIO_TARGETS.filter((target) => target !== extension)
  return []
}

function mediaDuration(stream, format) {
  const duration = Number(stream.duration)
  if (Number.isFinite(duration) && duration > 0) return duration
  const tag = String(stream.tags?.DURATION || '').match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/)
  if (tag) return Number(tag[1]) * 3600 + Number(tag[2]) * 60 + Number(tag[3])
  return Number(format?.duration)
}

module.exports = { AUDIO_TARGETS, AUDIO_EXTENSIONS, VIDEO_EXTENSIONS, MEDIA_INPUT_OPTIONS, SPECIAL_AUDIO_EXTENSIONS, UNSUPPORTED_AUDIO_EXTENSIONS, audioTargets, mediaDuration }

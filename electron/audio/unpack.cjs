const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const QMC_BOX = Buffer.from(
  '77483273def2c0c895ec30b251c3e1a09ee69dcffa7f14d1ceb8dcc34a6793d6' +
  '28c29170ca8da2a4f00861907e6fa2e0ebae3eb667c792f491b5f66c5e8440f7' +
  'f31b027fd5ab418928f425cc5211ad4368a6418b84b5ff2c924a26d8476a7c95' +
  '61cce6cbbb3f47588975c375a1d9afcc087317dcaa9aa21641d8a206c68bfc66' +
  '349fcf1823a00a74e72b277092e9af37e68ca7bc62659cc208c988b3f343ac74' +
  '2c0fd4afa1c30164954e489ff43578957a39d66aa06d40e84fa8ef111df31b3f' +
  '3f07dd6f5b193019fbef0e37f00ecd1649fe5347131abda4f14019600eed6809' +
  '065f4dcf3d1afe2077e4d9daf9a42b761c71db00bcfd0c6ca547f7f600794a11', 'hex',
)

function audioSignature(data) {
  if (data.subarray(0, 3).toString() === 'ID3') return 'mp3'
  if (data.subarray(0, 4).toString() === 'fLaC') return 'flac'
  if (data.subarray(0, 4).toString() === 'OggS') return 'ogg'
  if (data.subarray(0, 4).toString() === 'RIFF' && data.subarray(8, 12).toString() === 'WAVE') return 'wav'
  if (data.subarray(4, 8).toString() === 'ftyp') return 'm4a'
  if (data.subarray(0, 4).toString() === 'MAC ') return 'ape'
  if (data[0] === 0xff && (data[1] & 0xf6) === 0xf0) return 'aac'
  if (data[0] === 0xff && (data[1] & 0xe0) === 0xe0 && (data[1] & 6) !== 0) return 'mp3'
  return ''
}

function aesDecrypt(data, hexKey) {
  const decipher = crypto.createDecipheriv('aes-128-ecb', Buffer.from(hexKey, 'hex'), null)
  return Buffer.concat([decipher.update(data), decipher.final()])
}

async function unpackAudio(sourcePath, directory, { job, emitProgress, emit, UtilityError, throwIfCancelled }) {
  const extension = path.extname(sourcePath).slice(1).toLowerCase()
  const handle = await fs.promises.open(sourcePath, 'r')
  let output
  const invalid = () => new UtilityError(extension.startsWith('qmc') ? '此 QMC 不是支持的旧版格式，或文件已损坏；新版加密暂不支持' : '音频文件损坏或属于暂不支持的专属格式版本', 'ERR_AUDIO_FORMAT')
  try {
    const size = (await handle.stat()).size
    async function read(offset, length) {
      if (length < 0 || length > 20 * 1024 * 1024 || offset < 0 || offset + length > size) throw invalid()
      const buffer = Buffer.alloc(length)
      let used = 0
      while (used < length) {
        const result = await handle.read(buffer, used, length - used, offset + used)
        if (!result.bytesRead) throw invalid()
        used += result.bytesRead
      }
      return buffer
    }
    const header = await read(0, Math.min(size, 32))
    if (audioSignature(header)) return { sourcePath, metadata: {} }
    let start = 0
    let mask
    let metadata = {}
    let coverPath = ''
    let warning = ''
    if (extension === 'ncm') {
      if (header.subarray(0, 8).toString() !== 'CTENFDAM') throw invalid()
      let offset = 10
      async function block(limit) {
        const length = (await read(offset, 4)).readUInt32LE()
        if (length > limit) throw invalid()
        offset += 4
        const value = await read(offset, length)
        offset += length
        return value
      }
      const encryptedKey = await block(4096)
      let key
      try {
        const plain = aesDecrypt(encryptedKey.map((byte) => byte ^ 0x64), '687a4852416d736f356b496e62617857')
        if (plain.subarray(0, 17).toString() !== 'neteasecloudmusic') throw invalid()
        key = plain.subarray(17)
      } catch { throw invalid() }
      if (!key.length) throw invalid()
      const box = Uint8Array.from({ length: 256 }, (_, i) => i)
      let j = 0
      for (let i = 0; i < 256; i += 1) {
        j = (j + box[i] + key[i % key.length]) & 255
        ;[box[i], box[j]] = [box[j], box[i]]
      }
      const stream = box.map((_, index) => {
        const i = (index + 1) & 255
        return box[(box[i] + box[(i + box[i]) & 255]) & 255]
      })
      mask = (index) => stream[index & 255]
      const encryptedMeta = await block(4 * 1024 * 1024)
      if (encryptedMeta.length) {
        try {
          const base64 = encryptedMeta.map((byte) => byte ^ 0x63).subarray(22).toString()
          const text = aesDecrypt(Buffer.from(base64, 'base64'), '2331346c6a6b5f215c5d2630553c2728').toString()
          const value = JSON.parse(text.slice(text.indexOf(':') + 1))
          const info = value.mainMusic || value
          const artists = Array.isArray(info.artist) ? info.artist.map((artist) => Array.isArray(artist) ? artist[0] : artist).filter((artist) => typeof artist === 'string').join(' / ') : info.artist
          for (const [name, value] of Object.entries({ title: info.musicName, artist: artists, album: info.album })) {
            if (typeof value === 'string') metadata[name] = value.split('\0').join('').slice(0, 2000)
          }
        } catch { warning = '歌曲信息未能完整读取，音频内容已保留' }
      }
      const imageHeader = await read(offset, 13)
      const coverSpace = imageHeader.readUInt32LE(5)
      const coverLength = imageHeader.readUInt32LE(9)
      start = offset + 13 + coverSpace
      if (coverLength > coverSpace || start >= size) throw invalid()
      if (coverLength && coverLength <= 20 * 1024 * 1024) {
        const cover = await read(offset + 13, coverLength)
        const suffix = cover.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) ? 'png' : cover[0] === 255 && cover[1] === 216 ? 'jpg' : ''
        if (suffix) {
          coverPath = path.join(directory, `cover.${suffix}`)
          await fs.promises.writeFile(coverPath, cover, { flag: 'wx' })
        }
      }
    } else if (extension === 'uc') {
      mask = () => 0xa3
    } else if (extension === 'kwm') {
      if (!['yeelion-kuwo-tme', 'yeelion-kuwo\0\0\0\0'].includes(header.subarray(0, 16).toString())) throw invalid()
      const seed = header.readBigUInt64LE(24).toString()
      const repeated = seed.repeat(Math.ceil(32 / seed.length)).slice(0, 32)
      const key = Buffer.from('MoOtOiTvINGwd2E6n0E1i7L5t2IoOoNk').map((byte, index) => byte ^ repeated.charCodeAt(index))
      start = 1024
      mask = (index) => key[index % 32]
    } else if (extension.startsWith('qmc')) {
      const tail = await read(Math.max(0, size - 4), Math.min(4, size))
      if (['QTag', 'STag'].includes(tail.toString())) throw invalid()
      mask = (index) => {
        const position = index > 0x7fff ? index % 0x7fff : index
        return QMC_BOX[(position * position + 27) & 255]
      }
    } else { throw invalid() }
    if (start >= size) throw invalid()
    const first = await read(start, Math.min(64, size - start))
    for (let i = 0; i < first.length; i += 1) first[i] ^= mask(i)
    const format = audioSignature(first)
    if (!format) throw invalid()
    const outputPath = path.join(directory, `restored.${format}`)
    output = await fs.promises.open(outputPath, 'wx')
    let offset = start
    let lastPercent = -1
    while (offset < size) {
      throwIfCancelled(job)
      const data = await read(offset, Math.min(1024 * 1024, size - offset))
      for (let i = 0; i < data.length; i += 1) data[i] ^= mask(offset - start + i)
      let written = 0
      while (written < data.length) written += (await output.write(data, written, data.length - written)).bytesWritten
      offset += data.length
      const percent = Math.round(35 + 10 * (offset - start) / (size - start))
      if (percent !== lastPercent) emitProgress(emit, job.id, '转换文件', '正在还原专属音频', percent)
      lastPercent = percent
    }
    return { sourcePath: outputPath, metadata, coverPath, warning }
  } finally {
    await handle.close()
    await output?.close()
  }
}

module.exports = { unpackAudio, audioSignature }

/** Inspect actual file signatures; provider labels never establish the format. */
export function artifactFormat(data: Uint8Array): { mediaType: string; duration?: number } {
  const bytes = Buffer.from(data)
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.toString('ascii',12,16) === 'IHDR') return { mediaType: 'image/png' }
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return { mediaType: 'image/jpeg' }
  if (bytes.length >= 12 && bytes.toString('ascii',0,4) === 'RIFF') {
    if (bytes.toString('ascii',8,12) === 'WEBP') return { mediaType: 'image/webp' }
    if (bytes.toString('ascii',8,12) === 'WAVE') {
      let byteRate = 0, size = 0
      for (let p = 12; p + 8 <= bytes.length;) {
        const n = bytes.readUInt32LE(p + 4), end = p + 8 + n
        if (end > bytes.length) throw new Error('MEDIA_TRUNCATED_ARTIFACT')
        if (bytes.toString('ascii',p,p+4) === 'fmt ' && n >= 16) byteRate = bytes.readUInt32LE(p+16)
        if (bytes.toString('ascii',p,p+4) === 'data') size = n
        p = end + n % 2
      }
      if (!byteRate || !size) throw new Error('MEDIA_INVALID_WAV')
      return { mediaType: 'audio/wav', duration: size / byteRate }
    }
  }
  if (bytes.length >= 12 && bytes.toString('ascii',4,8) === 'ftyp') {
    let audio = false, video = false, duration: number | undefined
    const boxes = (start: number, end: number, depth: number): void => {
      for (let p = start; p < end;) {
        if (p + 8 > end) throw new Error('MEDIA_TRUNCATED_ARTIFACT')
        let size = bytes.readUInt32BE(p), header = 8
        if (size === 1) {
          if (p + 16 > end) throw new Error('MEDIA_TRUNCATED_ARTIFACT')
          const extended = bytes.readBigUInt64BE(p + 8)
          if (extended > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('MEDIA_INVALID_MP4')
          size = Number(extended); header = 16
        } else if (size === 0) size = end - p
        if (size < header || size > end - p) throw new Error('MEDIA_TRUNCATED_ARTIFACT')
        const type = bytes.toString('ascii', p + 4, p + 8), body = p + header
        if (['moov', 'trak', 'mdia'].includes(type) && depth < 3) boxes(body, p + size, depth + 1)
        if (type === 'hdlr' && depth === 3 && size >= header + 12) {
          const handler = bytes.toString('ascii', body + 8, body + 12)
          audio ||= handler === 'soun'; video ||= handler === 'vide'
        }
        if (type === 'mvhd' && depth === 1) {
          const version = bytes[body], scaleOffset = version === 0 ? 12 : 20, durationOffset = version === 0 ? 16 : 24
          if ((version === 0 || version === 1) && size >= header + durationOffset + (version === 0 ? 4 : 8)) {
            const scale = bytes.readUInt32BE(body + scaleOffset)
            const ticks = version === 0 ? bytes.readUInt32BE(body + durationOffset) : Number(bytes.readBigUInt64BE(body + durationOffset))
            if (scale && Number.isSafeInteger(ticks) && ticks > 0) duration = ticks / scale
          }
        }
        p += size
      }
    }
    boxes(0, bytes.length, 0)
    if (!audio && !video) throw new Error('MEDIA_INVALID_MP4')
    return { mediaType: video ? 'video/mp4' : 'audio/mp4', ...(duration !== undefined ? { duration } : {}) }
  }
  // ADTS AAC also starts with 0xff; inspect its layer bits before MPEG audio.
  if (bytes.length >= 7 && bytes[0] === 255 && (bytes[1]! & 0xf6) === 0xf0) return { mediaType: 'audio/aac' }
  if (bytes.length >= 4 && bytes.toString('ascii',0,4) === 'fLaC') return { mediaType: 'audio/flac' }
  if (bytes.length >= 3 && (bytes.toString('ascii',0,3) === 'ID3' || (bytes[0] === 255 && (bytes[1]! & 0xe0) === 0xe0))) return { mediaType: 'audio/mpeg' }
  if (bytes.length >= 4 && bytes.toString('ascii',0,4) === 'OggS') return { mediaType: 'audio/ogg' }
  throw new Error('MEDIA_UNRECOGNIZED_ARTIFACT_FORMAT')
}

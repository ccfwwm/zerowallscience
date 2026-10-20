import type { MediaReference } from '../shared/media.js'
import { artifactFormat } from './artifact-format.js'

export const MAX_REFERENCE_BYTES = 50 * 1024 * 1024
export const MAX_MEDIA_REQUEST_BYTES = 256 * 1024 * 1024

/** Keep URLs as references. DNS/redirect/content validation remains gateway-owned. */
export function publicReferenceURL(raw: string): string {
  let url: URL
  try { url = new URL(raw) } catch { throw new Error('MEDIA_PUBLIC_URL_REQUIRED: 请提供可直接访问的 HTTPS 素材链接。') }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || url.hostname.endsWith('.') || !url.hostname.includes('.') || /^[\d.]+$/.test(url.hostname) || url.hostname.includes(':') || /(^|\.)(localhost|local|internal|test|invalid)$/.test(url.hostname)) throw new Error('MEDIA_PUBLIC_URL_REQUIRED: 请提供公网 HTTPS 素材直链。')
  return raw
}

export function referenceValue(ref: MediaReference): string {
  return ref.url !== undefined ? publicReferenceURL(ref.url) : `data:${ref.mediaType};base64,${ref.base64}`
}

export function referenceBytes(ref: MediaReference): Uint8Array | undefined {
  if (!/^(image\/(png|jpeg|webp)|video\/(mp4|quicktime|webm)|audio\/(mp4|aac|wav|mpeg|ogg|flac))$/.test(ref.mediaType) || (ref.url !== undefined) === (ref.base64 !== undefined)) throw new Error('MEDIA_REFERENCE_INVALID')
  if (ref.role && !['reference', 'reference_image', 'first_frame', 'last_frame'].includes(ref.role)) throw new Error('MEDIA_REFERENCE_ROLE_UNSUPPORTED')
  if (ref.role && !['reference', 'reference_image'].includes(ref.role) && !ref.mediaType.startsWith('image/')) throw new Error('MEDIA_REFERENCE_ROLE_UNSUPPORTED')
  if (ref.url !== undefined) { publicReferenceURL(ref.url); return undefined }
  const encoded = ref.base64!
  if (!encoded.length || encoded.length > Math.ceil(MAX_REFERENCE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('MEDIA_REFERENCE_INVALID')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length > MAX_REFERENCE_BYTES || bytes.toString('base64') !== encoded) throw new Error('MEDIA_REFERENCE_INVALID')
  const actual = artifactFormat(bytes)
  if (actual.mediaType !== ref.mediaType && !(actual.mediaType === 'video/mp4' && ref.mediaType === 'video/quicktime')) throw new Error('MEDIA_REFERENCE_INVALID')
  return bytes
}

export function validateFrameReferences(refs: MediaReference[]): void {
  const images = refs.filter(ref => ref.mediaType.startsWith('image/'))
  const frames = images.filter(ref => ref.role === 'first_frame' || ref.role === 'last_frame')
  if (frames.length && (frames.length !== images.length || new Set(frames.map(ref => ref.role)).size !== frames.length)) throw new Error('MEDIA_FRAME_REFERENCE_CONFLICT: 首尾帧不能与普通图片参考混用，每个角色最多一张。')
}

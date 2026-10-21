import type { MediaReference, MediaRequest } from '../shared/media.js'
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
  if ((ref.role === 'first_frame' || ref.role === 'last_frame') && !ref.mediaType.startsWith('image/')) throw new Error('MEDIA_REFERENCE_ROLE_UNSUPPORTED')
  if (ref.url !== undefined) { publicReferenceURL(ref.url); return undefined }
  const encoded = ref.base64!
  if (!encoded.length || encoded.length > Math.ceil(MAX_REFERENCE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('MEDIA_REFERENCE_INVALID')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length > MAX_REFERENCE_BYTES || bytes.toString('base64') !== encoded) throw new Error('MEDIA_REFERENCE_INVALID')
  const actual = artifactFormat(bytes)
  if (actual.mediaType !== ref.mediaType && !(actual.mediaType === 'video/mp4' && ref.mediaType === 'video/quicktime')) throw new Error('MEDIA_REFERENCE_INVALID')
  return bytes
}

function decodeBase64Reference(encoded: string): { mediaType: string; base64: string } {
  if (!encoded.length || encoded.length > Math.ceil(MAX_REFERENCE_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('MEDIA_REFERENCE_INVALID')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length > MAX_REFERENCE_BYTES || bytes.toString('base64') !== encoded) throw new Error('MEDIA_REFERENCE_INVALID')
  try {
    return { mediaType: artifactFormat(bytes).mediaType, base64: encoded }
  } catch {
    throw new Error('MEDIA_REFERENCE_INVALID')
  }
}

export function validateFrameReferences(refs: MediaReference[]): void {
  const images = refs.filter(ref => ref.mediaType.startsWith('image/'))
  const frames = images.filter(ref => ref.role === 'first_frame' || ref.role === 'last_frame')
  if (frames.length && (frames.length !== images.length || new Set(frames.map(ref => ref.role)).size !== frames.length)) throw new Error('MEDIA_FRAME_REFERENCE_CONFLICT: 首尾帧不能与普通图片参考混用，每个角色最多一张。')
}

/** Consume all documented reference aliases once; never let a later spread replace them. */
export function normalizeMediaReferences<T extends { parameters?: MediaRequest['parameters']; references?: MediaReference[] | undefined }>(input: T): T {
  const parameters = structuredClone(input.parameters ?? {}), references = structuredClone(input.references ?? [])
  for (const kind of ['image', 'video', 'audio']) {
    let selected: MediaReference[] | undefined
    for (const field of [kind + 's', 'reference_' + kind + 's', 'reference_' + kind + '_urls']) {
      if (parameters[field] === undefined) continue
      const list = parameters[field]
      if (!Array.isArray(list)) throw new Error('MEDIA_REFERENCES_INVALID: ' + field)
      const refs = list.map(value => {
        const object = typeof value === 'string' ? { url: value } : value
        if (!object || typeof object !== 'object' || Array.isArray(object)) throw new Error('MEDIA_REFERENCE_INVALID')
        const { url, b64_json, media_type, ...properties } = object as Record<string, unknown>
        if ((url !== undefined) === (b64_json !== undefined)) throw new Error('MEDIA_REFERENCE_ONE_SOURCE_REQUIRED')
        const source = url ?? b64_json
        if (typeof source !== 'string') throw new Error('MEDIA_REFERENCE_INVALID')
        const encoded = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,([A-Za-z0-9+/]+={0,2})$/i.exec(source)
        const declaredType = typeof media_type === 'string' ? media_type.toLowerCase() : encoded?.[1]?.toLowerCase()
        let normalized: { mediaType: string; base64?: string; url?: string }
        if (encoded || b64_json !== undefined || /^[A-Za-z0-9+/]+={0,2}$/.test(source)) {
          const decoded = decodeBase64Reference(encoded?.[2] ?? source)
          if (declaredType && declaredType !== decoded.mediaType && !(decoded.mediaType === 'video/mp4' && declaredType === 'video/quicktime')) throw new Error('MEDIA_REFERENCE_INVALID')
          normalized = { mediaType: declaredType ?? decoded.mediaType, base64: decoded.base64 }
        } else {
          if (declaredType && !declaredType.startsWith(kind + '/')) throw new Error('MEDIA_REFERENCE_MIME_MISMATCH')
          normalized = { mediaType: declaredType ?? (kind === 'image' ? 'image/png' : kind === 'video' ? 'video/mp4' : 'audio/mpeg'), url: publicReferenceURL(source) }
        }
        const mediaType = normalized.mediaType
        if (!mediaType.startsWith(kind + '/')) throw new Error('MEDIA_REFERENCE_MIME_MISMATCH')
        const ref: MediaReference = { mediaType, properties, ...(typeof properties.role === 'string' ? { role: properties.role } : {}), ...(normalized.base64 !== undefined ? { base64: normalized.base64 } : { url: normalized.url! }) }
        referenceBytes(ref)
        return ref
      })
      if (selected && referenceSignature(selected) !== referenceSignature(refs)) throw new Error('MEDIA_REFERENCE_INPUT_CONFLICT: ' + kind)
      selected = refs
      delete parameters[field]
    }
    if (selected) {
      const explicit = references.filter(ref => ref.mediaType.startsWith(kind + '/'))
      if (explicit.length && referenceSignature(explicit) !== referenceSignature(selected)) throw new Error('MEDIA_REFERENCE_INPUT_CONFLICT: ' + kind)
      if (!explicit.length) references.push(...selected)
    }
  }
  return { ...input, parameters, ...(input.references !== undefined || references.length ? { references } : {}) }
}

export function referenceSignature(refs: MediaReference[]): string {
  const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value
  return JSON.stringify(refs.map(ref => canonical({ source: referenceValue(ref), properties: referenceProperties(ref) })))
}

export function referenceProperties(ref: MediaReference): Record<string, unknown> {
  const props: Record<string, unknown> = { ...ref.properties, ...(ref.role ? { role: ref.role } : {}), ...(ref.duration !== undefined ? { duration_seconds: ref.duration } : {}) }
  delete props.url; delete props.b64_json
  return props
}

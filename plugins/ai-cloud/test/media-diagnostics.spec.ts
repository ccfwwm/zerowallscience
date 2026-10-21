import { expect, it } from 'vitest'
import { normalizeMediaReferences } from '../src/host/media-reference.js'
import { safeMediaValue, safeMediaResponse } from '../src/host/media-diagnostics.js'
import { referenceValue } from '../src/host/media-reference.js'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const imageBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
it('redacts credential, path, query and encoded extensions while preserving safe supplier fields', () => {
  const input={future:{enabled:true,api_key:'secret',source:'https://user:pass@media.example.com/a.mp4?token=secret#signature',local:'C:\\private\\file.mp4'},prompt:'Bearer fixture-key sk-hidden',audio:'data:audio/mpeg;base64,AAAA',content_url:'/v1/tasks/mt_a/artifacts/a/content'}
  const clean=safeMediaResponse(input,['fixture-key'])
  expect(clean.future.enabled).toBe(true)
  expect(clean.future.source).toBe('https://media.example.com/a.mp4')
  expect(JSON.stringify(clean)).not.toMatch(/user:pass|secret|fixture-key|sk-hidden|private|content_url|AAAA/)
  expect(safeMediaValue('file:///tmp/internal')).toBe('[internal path omitted]')
})

it('does not let supplier source metadata conceal an alias URL conflict',()=>{
 expect(()=>normalizeMediaReferences({references:[{mediaType:'image/png',url:'https://media.example.com/original.png',properties:{source:'custom'}}],parameters:{images:[{url:'https://media.example.com/changed.png',source:'custom'}]}})).toThrow('MEDIA_REFERENCE_INPUT_CONFLICT')
})

it.each([
 ['string-data-url', (value: string) => value.replace('image/png;base64,', 'image/png;base64,')],
 ['url-data-url', (value: string) => ({ url: value })],
 ['b64_json-data-url', (value: string) => ({ b64_json: value })],
 ['string-base64', (value: string) => value.split(',')[1]!],
 ['url-base64', (value: string) => ({ url: value.split(',')[1]! })],
 ['b64_json-base64', (value: string) => ({ b64_json: value.split(',')[1]! })],
])('normalizes %s and preserves role metadata', (_shape, wrap) => {
 const dataUrl = `data:image/png;base64,${imageBytes.toString('base64')}`
 const normalized = normalizeMediaReferences({ parameters: { images: [{ ...((typeof wrap(dataUrl) === 'object') ? wrap(dataUrl) as object : { url: wrap(dataUrl) }), role: 'first_frame', provider_option: 7 }] } })
 const ref = normalized.references![0]!
 expect(ref.mediaType).toBe('image/png')
 expect(referenceValue(ref)).toBe(dataUrl)
 expect(ref.role).toBe('first_frame')
 expect(ref.properties).toMatchObject({ role: 'first_frame', provider_option: 7 })
 expect(createHash('sha256').update(Buffer.from(ref.base64!, 'base64')).digest('hex')).toBe(createHash('sha256').update(imageBytes).digest('hex'))
})

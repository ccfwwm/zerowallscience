import { expect, it } from 'vitest'
import { normalizeMediaReferences } from '../src/host/media-reference.js'
import { safeMediaValue, safeMediaResponse } from '../src/host/media-diagnostics.js'
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

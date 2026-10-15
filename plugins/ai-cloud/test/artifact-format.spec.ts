import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { artifactFormat } from '../src/host/artifact-format.js'

it('distinguishes AAC ADTS and FLAC from MP3',()=>{
 expect(artifactFormat(Buffer.from([255,241,80,128,0,31,252]))).toEqual({mediaType:'audio/aac'})
 expect(artifactFormat(Buffer.from('fLaCfixture'))).toEqual({mediaType:'audio/flac'})
 expect(artifactFormat(Buffer.from([255,251,144,0]))).toEqual({mediaType:'audio/mpeg'})
})

it('identifies real AAC audio and video MP4 tracks without trusting provider MIME labels', async () => {
  const audio = await readFile(new URL('./fixtures/audio.m4a', import.meta.url))
  const video = await readFile(new URL('./fixtures/video.mp4', import.meta.url))
  expect(artifactFormat(audio)).toMatchObject({ mediaType: 'audio/mp4' })
  expect(artifactFormat(audio).duration).toBeGreaterThan(0)
  expect(artifactFormat(video)).toMatchObject({ mediaType: 'video/mp4' })
  expect(() => artifactFormat(audio.subarray(0, audio.length - 1))).toThrow('MEDIA_TRUNCATED_ARTIFACT')
  const falseLabel = Buffer.from(audio)
  const handler = falseLabel.indexOf('soun')
  expect(handler).toBeGreaterThan(0)
  falseLabel.write('fake', handler)
  expect(() => artifactFormat(falseLabel)).toThrow('MEDIA_INVALID_MP4')
})

import { expect, it } from 'vitest'
import sharp from 'sharp'
import { preserveMaskedPixels } from '../src/host/generator.js'
import { readReviewedReconstructionPlan } from '../src/host/presentation-reconstruction.js'

it('keeps every protected source channel even when the provider changes the entire picture', async () => {
  const original = Buffer.from([1,2,3,255, 4,5,6,255, 7,8,9,255])
  const source = await sharp(original,{raw:{width:3,height:1,channels:4}}).png().toBuffer()
  const mask = await sharp(Buffer.from([0,0,0,255, 0,0,0,0, 0,0,0,128]),{raw:{width:3,height:1,channels:4}}).png().toBuffer()
  const generated = await sharp({create:{width:3,height:1,channels:4,background:{r:200,g:100,b:50,alpha:1}}}).png().toBuffer()
  const result = await preserveMaskedPixels(source,mask,generated)
  const raw = await sharp(result.bytes).ensureAlpha().raw().toBuffer()
  expect(raw.subarray(0,4)).toEqual(original.subarray(0,4))
  expect([...raw.subarray(4,8)]).toEqual([200,100,50,255])
  expect(raw[8]).toBe(Math.round((7*128+200*127)/255))
  expect(result.evidence).toMatchObject({protectedPixels:1,editablePixels:2})
  const resized = await sharp(generated).resize(6,2).toBuffer()
  await expect(preserveMaskedPixels(source,mask,resized)).rejects.toThrow('SIZE_MISMATCH')
})

it('binds a reviewed plan to its source and rejects paths or execution fields inside analysis data', () => {
  const document:any={schemaVersion:1,sourceSha256:'source',pages:{1:{regions:[{kind:'card',sourceBounds:[0,0,100,50]}]}}}
  const encode=()=>Buffer.from(JSON.stringify(document))
  expect(readReviewedReconstructionPlan(encode(),'source',1)).toEqual(document.pages[1])
  expect(()=>readReviewedReconstructionPlan(encode(),'changed-source',1)).toThrow('different source')
  document.pages[1].outputDir='../other-project'
  expect(()=>readReviewedReconstructionPlan(encode(),'source',1)).toThrow('Unsupported')
})

import { it, expect } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { reconstructionProgress } from '../plugin/host/live-state.mjs'

it('invalidates quality when an image changes at the same path without a page revision',async()=>{
  const root=await mkdtemp(path.join(tmpdir(),'ppt-quality-'))
  try {
    await mkdir(path.join(root,'media'));await mkdir(path.join(root,'pages'));await mkdir(path.join(root,'.reconstruction'))
    const settings={size:[960,540]},page={elements:[{elementId:'picture',elementType:'image',src:'media/image.png',bounds:[0,0,100,100]}]}
    const raw=JSON.stringify(page),sha=(data:string)=>createHash('sha256').update(data).digest('hex')
    await writeFile(path.join(root,'pages/01.page'),raw);await writeFile(path.join(root,'media/image.png'),'old')
    const fingerprint=sha(JSON.stringify(settings)+raw+JSON.stringify([['media/image.png',sha('old')]]))
    await writeFile(path.join(root,'.reconstruction/jobs.json'),JSON.stringify({jobs:{1:{status:'complete',phase:'verified',qualityStatus:'passed',evidenceFingerprint:fingerprint,quality:{nativeTexts:2,rasterTexts:0}}}}))
    const loaded={dir:root,deck:{...settings,pages:['pages/01.page']},pages:new Map([['pages/01.page',page]])}
    expect((await reconstructionProgress(loaded))[1]).toMatchObject({qualityStatus:'passed',staleEvidence:false})
    await writeFile(path.join(root,'media/image.png'),'new')
    expect((await reconstructionProgress(loaded))[1]).toMatchObject({qualityStatus:'review',staleEvidence:true})
    expect(await readFile(path.join(root,'pages/01.page'),'utf8')).toBe(raw)
  } finally {await rm(root,{recursive:true,force:true})}
})

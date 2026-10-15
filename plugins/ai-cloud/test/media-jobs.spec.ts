import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, readFile, writeFile, mkdir, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { MediaJobLedger } from '../src/host/media-jobs.js'
const roots:string[]=[]
afterEach(async()=>{await Promise.all(roots.splice(0).map(p=>rm(p,{recursive:true,force:true})))})
async function fixture(){
 const cwd=await mkdtemp(join(tmpdir(),'media-ledger-'));roots.push(cwd)
 let owner='account-a';const png=Buffer.from('image fixture'),sha256=createHash('sha256').update(png).digest('hex')
 const media={catalog:vi.fn(),estimate:vi.fn(async()=>({currency:'USD',total:'0.01'})),submit:vi.fn(async(r:any)=>({requestId:r.requestId,status:'completed',artifacts:[{key:'0',mediaType:'image/png'}]})),query:vi.fn(async(id:string)=>({requestId:id,status:'completed',artifacts:[{key:'0',mediaType:'image/png'}]})),wait:vi.fn(),list:vi.fn(),download:vi.fn(async()=>({bytes:png,mediaType:'image/png',sha256}))}
 const root=join(cwd,'host-ledger'),scope={cwd,sessionId:'session-a',projectId:'promo'},draft={kind:'image' as const,prompt:'poster',selection:{groupId:'99',modelId:'chosen',profileId:'profile',operation:'image'},parameters:{quality:'medium'}}
 const ledger=new MediaJobLedger(media as any,async()=>owner,root)
 return {cwd,root,scope,draft,ledger,media,owner:(v:string)=>owner=v}
}
const authorize=async(f:any,j:any)=>({id:j.id,revision:j.revision,authorization:await f.ledger.authorize(f.scope,j.id,j.revision)})
const settle=()=>new Promise(r=>setTimeout(r,20))
describe('authenticated media review ledger',()=>{
 it('direct generation is idempotent, preserves parameters and keeps costs in Host',async()=>{
  const f=await fixture(),job=await f.ledger.prepare(f.scope,f.draft)
  await Promise.all([f.ledger.submitRequested(f.scope,job.id,job.revision),f.ledger.submitRequested(f.scope,job.id,job.revision)])
  await settle();expect(f.media.submit).toHaveBeenCalledTimes(1)
  expect(f.media.submit.mock.calls[0]?.[0].parameters).toEqual({quality:'medium'})
  await f.ledger.refresh(f.scope,job.id);expect(f.media.submit).toHaveBeenCalledTimes(1)
 })
 it('direct generation rejects stale, cross-session, account switches and bad estimates without posting',async()=>{
  const f=await fixture(),job=await f.ledger.prepare(f.scope,f.draft)
  await expect(f.ledger.submitRequested({...f.scope,sessionId:'other'},job.id,job.revision)).rejects.toThrow('OWNER_MISMATCH')
  await expect(f.ledger.submitRequested(f.scope,job.id,job.revision+1)).rejects.toThrow('STALE')
  f.media.estimate.mockResolvedValueOnce({currency:'USD',total:'invalid'})
  await expect(f.ledger.submitRequested(f.scope,job.id,job.revision)).rejects.toThrow('ESTIMATE_UNAVAILABLE')
  f.media.estimate.mockImplementationOnce(async()=>{f.owner('account-b');return {currency:'USD',total:'0.01'}})
  await expect(f.ledger.submitRequested(f.scope,job.id,job.revision)).rejects.toThrow('OWNER_MISMATCH')
  expect(f.media.submit).not.toHaveBeenCalled()
 })
 it('rejects forged authorization and invalidates a capability when parameters or references change',async()=>{
  const f=await fixture(),job=await f.ledger.prepare(f.scope,f.draft)
  await expect(f.ledger.submitReviewed(f.scope,[{id:job.id,revision:job.revision,authorization:'forged'}])).rejects.toThrow('AUTHORIZATION_REQUIRED')
  const granted=await authorize(f,job)
  const next=await f.ledger.prepare(f.scope,{...f.draft,parameters:{quality:'high'}},job.id)
  await expect(f.ledger.submitReviewed(f.scope,[{...granted,revision:next.revision}])).rejects.toThrow('AUTHORIZATION_REQUIRED')
  expect(f.media.submit).not.toHaveBeenCalled()
 })
 it('does not charge preparation and rejects stale confirmation after a draft edit',async()=>{
  const f=await fixture(),first=await f.ledger.prepare(f.scope,f.draft)
  expect(f.media.submit).not.toHaveBeenCalled();expect(first.estimate?.total).toBe('0.01')
  const oldReview=await authorize(f,first)
  const second=await f.ledger.prepare(f.scope,{...f.draft,prompt:'edited'},first.id)
  expect(second.requestId).not.toBe(first.requestId)
  await expect(f.ledger.submitReviewed(f.scope,[oldReview])).rejects.toThrow('REVIEW_STALE')
  expect(f.media.submit).not.toHaveBeenCalled()
 })
 it('repeated clicks submit once; restart collects same request and preserves output',async()=>{
  const f=await fixture(),job=await f.ledger.prepare(f.scope,f.draft),reviews=[await authorize(f,job)]
  await Promise.all([f.ledger.submitReviewed(f.scope,reviews),f.ledger.submitReviewed(f.scope,reviews)])
  await settle();expect(f.media.submit).toHaveBeenCalledTimes(1)
  const recovered=new MediaJobLedger(f.media as any,async()=> 'account-a',f.root)
  const result=await recovered.refresh(f.scope,job.id)
  expect(result.assets[0]?.path).toMatch(/media-projects\/promo\/assets\//)
  await recovered.refresh(f.scope,job.id);expect(f.media.submit).toHaveBeenCalledTimes(1);expect(f.media.download).toHaveBeenCalledTimes(1)
  expect(await readFile(join(f.cwd,result.assets[0]!.path),'utf8')).toBe('image fixture')
 })
 it('rejects account and cross-session confirmations, failed estimates, malformed and duplicate batches',async()=>{
  const f=await fixture(),job=await f.ledger.prepare(f.scope,f.draft),review=await authorize(f,job)
  await expect(f.ledger.submitReviewed({...f.scope,sessionId:'other'},[review])).rejects.toThrow('OWNER_MISMATCH')
  f.owner('account-b');expect(await f.ledger.list(f.scope)).toEqual([])
  await expect(f.ledger.submitReviewed(f.scope,[review])).rejects.toThrow('OWNER_MISMATCH')
  f.owner('account-a');await expect(f.ledger.submitReviewed(f.scope,[review,review])).rejects.toThrow('REVIEW_INVALID')
  f.media.estimate.mockRejectedValueOnce(new Error('estimate down'))
  await expect(f.ledger.prepare(f.scope,f.draft)).rejects.toThrow('estimate down');expect(f.media.submit).not.toHaveBeenCalled()
 })
 it('rechecks changed cost without charging any item in the batch',async()=>{
  const f=await fixture(),a=await f.ledger.prepare(f.scope,f.draft),b=await f.ledger.prepare(f.scope,f.draft)
  f.media.estimate.mockResolvedValueOnce({currency:'USD',total:'0.02'})
  await expect(f.ledger.submitReviewed(f.scope,await Promise.all([a,b].map(j=>authorize(f,j))))).rejects.toThrow('COST_CHANGED')
  expect(f.media.submit).not.toHaveBeenCalled();expect((await f.ledger.list(f.scope))[0]!.revision).toBe(2)
 })
 it('retains uncertain submissions without replaying POST and prevents overwrite',async()=>{
  const f=await fixture(),job=await f.ledger.prepare(f.scope,f.draft);const review=await authorize(f,job);f.media.submit.mockRejectedValueOnce(new Error('network'))
  await f.ledger.submitReviewed(f.scope,[review]);await settle()
  await f.ledger.submitReviewed(f.scope,[review]);expect(f.media.submit).toHaveBeenCalledTimes(1)
  const path=join(f.cwd,`media-projects/promo/assets/${job.id}-0.png`);await mkdir(join(f.cwd,'media-projects/promo/assets'),{recursive:true});await writeFile(path,'user file')
  await expect(f.ledger.refresh(f.scope,job.id)).rejects.toThrow();expect(await readFile(path,'utf8')).toBe('user file')
 })
 it('saves audio MP4 as m4a and rejects symlink destinations before cost',async()=>{
  const f=await fixture(),outside=await mkdtemp(join(tmpdir(),'media-outside-'));roots.push(outside)
  await symlink(outside,join(f.cwd,'media-projects'),process.platform==='win32'?'junction':'dir')
  await expect(f.ledger.prepare(f.scope,f.draft)).rejects.toThrow('SYMLINK');expect(f.media.estimate).not.toHaveBeenCalled()
  const g=await fixture(),job=await g.ledger.prepare(g.scope,{...g.draft,kind:'music',selection:{...g.draft.selection,operation:'chat_music'}})
  g.media.query.mockResolvedValueOnce({requestId:job.requestId,status:'completed',artifacts:[{key:'0',mediaType:'audio/mp4'}]});g.media.download.mockResolvedValueOnce({bytes:Buffer.from('aac'),mediaType:'audio/mp4',sha256:createHash('sha256').update('aac').digest('hex')})
  await g.ledger.submitReviewed(g.scope,[await authorize(g,job)]);await settle()
  expect((await g.ledger.refresh(g.scope,job.id)).assets[0]!.path).toMatch(/\.m4a$/)
 })
})

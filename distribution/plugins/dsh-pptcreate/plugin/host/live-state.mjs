import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'

const digest = value => createHash('sha256').update(value).digest('hex')
// Revision is a history cursor, not a content version. Keep this cache separate.
const files = new Map()
function mediaRefs(value, found = new Set()) {
  if (typeof value === 'string' && /^media[\\/]/u.test(value)) found.add(value.replaceAll('\\', '/'))
  else if (Array.isArray(value)) value.forEach(item => mediaRefs(item, found))
  else if (value && typeof value === 'object') Object.values(value).forEach(item => mediaRefs(item, found))
  return found
}
async function fileVersion(root, relative) {
  const target = path.resolve(root, relative)
  if (!target.startsWith(root + path.sep)) return 'outside-project'
  try {
    const actual = await realpath(target)
    if (!actual.startsWith(root + path.sep)) return 'outside-project'
    const info = await stat(actual, { bigint: true })
    const signature = `${info.ino}:${info.size}:${info.mtimeNs}:${info.ctimeNs}`
    const cached = files.get(actual)
    if (cached?.signature === signature) return cached.hash
    const hash = digest(await readFile(actual))
    if (files.size > 4096) files.clear()
    files.set(actual, { signature, hash })
    return hash
  } catch { return 'missing' }
}
export async function projectContent(loaded) {
  const root = await realpath(loaded.dir)
  const mediaVersions = {}
  const refs = mediaRefs(loaded.deck)
  for (const page of loaded.pages.values()) mediaRefs(page, refs)
  await Promise.all([...refs].map(async ref => { mediaVersions[ref] = await fileVersion(root, ref) }))
  const pageVersions = {}
  const { pages, ...settings } = loaded.deck
  for (const [id, page] of loaded.pages) {
    const dependencies = [...mediaRefs(page), ...mediaRefs(settings)].sort().map(ref => [ref, mediaVersions[ref]])
    pageVersions[id] = digest(JSON.stringify([settings, page, dependencies]))
  }
  return { contentVersion: digest(JSON.stringify([loaded.deck, pageVersions])), pageVersions, mediaVersions }
}

export async function reconstructionProgress(loaded) {
  const root=await realpath(loaded.dir),relative='.reconstruction/jobs.json'
  const version=await fileVersion(root,relative)
  if(version==='missing'||version==='outside-project')return {}
  try {
    const value=JSON.parse(await readFile(path.join(root,relative),'utf8'))
    const {pages,...settings}=loaded.deck,result={}
    for(const [key,job] of Object.entries(value.jobs??{})) {
      if(!/^\d+$/u.test(key))continue
      const pageId=loaded.deck.pages[Number(key)-1]
      if(pageId&&await fileVersion(root,pageId)==='outside-project')continue
      const raw=pageId?await readFile(path.join(root,pageId),'utf8').catch(()=>null):null
      const page=loaded.pages.get(pageId)
      const dependencies=await Promise.all([...mediaRefs([settings,page])].sort().map(async ref=>[ref,await fileVersion(root,ref)]))
      const current=raw!==null?digest(JSON.stringify(settings)+raw+JSON.stringify(dependencies)):null
      const stale=Boolean(job.evidenceFingerprint&&job.evidenceFingerprint!==current)
      result[key]={status:job.status,phase:stale?'review':job.phase,qualityStatus:stale?'review':job.qualityStatus,
        staleEvidence:stale,nativeTexts:job.quality?.nativeTexts,rasterTexts:job.quality?.rasterTexts,concurrency:job.concurrency??value.concurrency??2}
    }
    return result
  } catch {return {}}
}

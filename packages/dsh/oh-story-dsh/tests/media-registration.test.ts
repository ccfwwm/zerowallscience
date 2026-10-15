import { readFile } from 'node:fs/promises'
import { expect,it } from 'vitest'
it('registers only media tools and knowledge; build includes no retired domains',async()=>{
 const entry=await readFile(new URL('../src/index.ts',import.meta.url),'utf8'),build=await readFile(new URL('../scripts/build.ts',import.meta.url),'utf8')
 for(const retired of ['createOhStorySkillProvider','createNovelToGameSkillProvider','createDramaSkillProvider','registerOhStoryHooks','registerOhStoryRoleTool'])expect(entry).not.toContain(retired)
 expect(entry).toContain("name:'media_job'");expect(entry).not.toContain("enum:['prepare','confirm'")
 for(const directory of ['knowledge/oh-story','knowledge/drama','knowledge/novel-to-game','knowledge/video-recap'])expect(build).not.toContain(directory)
 expect(build).toContain('knowledge/media-create')
})

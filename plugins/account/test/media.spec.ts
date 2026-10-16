import { expect, it, vi } from 'vitest'
import { AiCloudClient } from '../src/host/index.js'
import { imageQualityChoices } from '../src/shared/types.js'

it('scopes missing quality compatibility to the confirmed reverse GPT image group', () => {
  expect(imageQualityChoices('gpt-image-2.5', [], '生图分组-gpt逆向')).toEqual(['auto', 'low', 'medium', 'high', 'xhigh', 'max'])
  expect(imageQualityChoices('gpt-image-2.5', ['high'], '生图分组-gpt逆向')).toEqual(['high'])
  expect(imageQualityChoices('gpt-image-2.5-4k', [], '图片音频视频分组')).toEqual([])
  expect(imageQualityChoices('gpt-image-2.5', [], '生图分组-AZ-非常稳定')).toEqual([])
  expect(imageQualityChoices('gemini-image', [], '生图分组-gpt逆向')).toEqual([])
  expect(imageQualityChoices('gpt-image-2', [], '生图分组-gpt逆向')).toEqual([])
})

const json = (value: unknown, status = 200) => new Response(JSON.stringify({data:value}), {status})
const capability = {profile_id:'mp_opaque',version:'1',model:'gemini-image',media_type:'image',operations:['gemini_image'],sizes:[],resolutions:['1K'],qualities:[],aspect_ratios:['1:1'],duration:{},materials:{},api_key:'SERVER_PRIVATE',account_ids:[123],cost_template:'SERVER_PRIVATE'}
function fixture() {
  const values = new Map([['zerowall.ai-cloud.session', JSON.stringify({baseUrl:'https://hkcode.aicodeme.xyz',email:'test@example.test',accessToken:'JWT_PRIVATE',models:[{providerId:'old',groupId:'99',groupName:'图片音频视频分组',modelId:'old-media-as-chat'}],groupIds:['99']})]])
  const secrets = {get:async(k:string)=>values.get(k),set:async(k:string,v:string)=>{values.set(k,v)},delete:async(k:string)=>{values.delete(k)}}
  return {values,secrets}
}

it('discovers a dynamic media group, reuses its key and migrates old chat routes without exposing private fields', async () => {
  const {values,secrets}=fixture()
  const fetcher=vi.fn<typeof fetch>(async (url,init)=>{
    if(String(url).includes('/groups/available'))return json([{id:99,name:'图片音频视频分组',platform:'imagevideo',enabled:true}])
    if(String(url).includes('/keys?'))return json({items:[{group_id:99,key:'GROUP_PRIVATE'}]})
    expect(String(url)).toContain('/media/capabilities?group_id=99')
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer JWT_PRIVATE')
    return json({group_id:99,platform:'imagevideo',models:[capability]})
  })
  const client=new AiCloudClient({secrets,fetch:fetcher})
  const state=await client.discoverModels()
  expect(state.models).toEqual([]);expect(state.mediaModels).toHaveLength(1)
  expect(state.mediaModels![0]).toMatchObject({groupId:'99',profileId:'mp_opaque',operations:['gemini_image']})
  expect(state.mediaSync?.status).toBe('succeeded')
  expect(fetcher.mock.calls.every(([,init])=>init?.method!=='POST')).toBe(true)
  expect(values.get('zerowall.ai-cloud.group.99')).toBe('GROUP_PRIVATE')
  for(const secret of ['JWT_PRIVATE','GROUP_PRIVATE','SERVER_PRIVATE','account_ids','cost_template'])expect(JSON.stringify(state)).not.toContain(secret)
})

it('retains stale media after directory failure and reuses a newly created group key on refresh', async()=>{
  const {secrets,values}=fixture();let created=false,fail=false
  const fetcher=vi.fn<typeof fetch>(async(url,init)=>{
    if(String(url).includes('/groups/available'))return json([{id:99,name:'图片音频视频分组',platform:'imagevideo',enabled:true}])
    if(String(url).includes('/keys?'))return json({items:created?[{group_id:99,key:'GROUP_PRIVATE'}]:[]})
    if(String(url).endsWith('/keys')){created=true;return json({key:'GROUP_PRIVATE'})}
    return fail?json({},503):json({group_id:99,platform:'imagevideo',models:[capability]})
  })
  const client=new AiCloudClient({secrets,fetch:fetcher});await client.discoverModels();fail=true
  const state=await client.discoverModels()
  expect(state.mediaSync?.status).toBe('failed');expect(state.mediaModels?.[0]?.stale).toBe(true)
  expect(fetcher.mock.calls.filter(([,init])=>init?.method==='POST')).toHaveLength(1)
  expect(values.has('zerowall.ai-cloud.group.99')).toBe(true)
})

it('logout waits for a pending secure write and removes late media keys instead of restoring credentials',async()=>{
  const {secrets,values}=fixture();let pending:(()=>void)|undefined
  const original=secrets.set
  secrets.set=async(k,v)=>{if(k==='zerowall.ai-cloud.group.99')await new Promise<void>(resolve=>{pending=resolve});await original(k,v)}
  const fetcher=vi.fn<typeof fetch>(async(url)=>String(url).includes('/groups/available')?json([{id:99,name:'图片音频视频分组',platform:'imagevideo',enabled:true}]):String(url).includes('/keys?')?json({items:[{group_id:99,key:'GROUP_PRIVATE'}]}):json({group_id:99,platform:'imagevideo',models:[capability]}))
  const client=new AiCloudClient({secrets,fetch:fetcher});const sync=client.discoverModels();const failed=expect(sync).rejects.toThrow('ACCOUNT_STATE_CHANGED')
  await expect.poll(()=>!!pending).toBe(true);const logout=client.logout();pending!();await logout;await failed
  expect(values.has('zerowall.ai-cloud.group.99')).toBe(false);expect(values.has('zerowall.ai-cloud.session')).toBe(false)
})

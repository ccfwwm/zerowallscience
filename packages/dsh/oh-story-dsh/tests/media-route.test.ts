import { describe,it,expect,vi } from 'vitest'
import { Readable } from 'node:stream'
import { registerMediaRoute,parseByteRange } from '../src/media-route.js'
describe('authenticated media route',()=>{
 it('requires signed browser authentication and same-origin JSON before issuing UI authorization',async()=>{
  let handler:any;const authorizeReview=vi.fn(async()=>[{id:'job',revision:1,authorization:'one-use'}])
  const ctx={connection:{authorizeIndex:vi.fn(()=>true)},webServer:{register:vi.fn((route:any)=>{handler=route.handler;return()=>{}})},effect:(f:any)=>f()}
  registerMediaRoute(ctx as any,{authorizeReview} as any,[])
  const request=(headers:any)=>Object.assign(Readable.from([Buffer.from(JSON.stringify({sessionId:'session',reviews:[{id:'job',revision:1,projectId:'default'}]}))]),{url:'/oh-story/authorize',method:'POST',headers})
  const response=()=>({headersSent:false,writeHead:vi.fn(function(this:any){return this}),end:vi.fn(),destroy:vi.fn()})
  const good={host:'127.0.0.1:9999',origin:'http://127.0.0.1:9999','content-type':'application/json'}
  await handler(request({...good,origin:'http://evil.test'}),response());expect(authorizeReview).not.toHaveBeenCalled()
  ctx.connection.authorizeIndex.mockReturnValueOnce(false);await handler(request(good),response());expect(authorizeReview).not.toHaveBeenCalled()
  const ok=response();await handler(request(good),ok);expect(authorizeReview).toHaveBeenCalledOnce();expect(ok.writeHead).toHaveBeenCalledWith(200,expect.anything())
 })
 it('implements bounded and suffix byte ranges for browser playback',()=>{
  expect(parseByteRange('bytes=10-20',100)).toEqual({start:10,end:20})
  expect(parseByteRange('bytes=-10',100)).toEqual({start:90,end:99})
  expect(parseByteRange('bytes=100-',100)).toBeNull()
  expect(parseByteRange('bytes=0-1,5-6',100)).toBeUndefined()
 })
})

import { expect, it, vi } from 'vitest'
import { downloadMediaBytes } from '../src/host/media-download.js'

it('assembles bounded concurrent ranges, retries one transient failure and checks every range',async()=>{
 const expected=Buffer.alloc(3*1024*1024+17,7);let active=0,max=0,failed=false
 const read=vi.fn(async(headers:Record<string,string>)=>{
  const [,a,b]=/^bytes=(\d+)-(\d+)$/.exec(headers.range!)!,start=Number(a),end=Math.min(Number(b),expected.length-1)
  active++;max=Math.max(max,active);await Promise.resolve();active--
  if(start===1024*1024&&!failed){failed=true;throw new TypeError('transient network failure')}
  return new Response(expected.subarray(start,end+1),{status:206,headers:{'content-range':`bytes ${start}-${end}/${expected.length}`}})
 })
 const result=await downloadMediaBytes(read,new AbortController().signal,true)
 expect(Buffer.compare(Buffer.from(result),expected)).toBe(0)
 expect(max).toBeLessThanOrEqual(4);expect(read).toHaveBeenCalledTimes(5)
})

it('falls back when the server ignores Range and rejects corrupt range boundaries',async()=>{
 expect(await downloadMediaBytes(async()=>new Response('full video'),new AbortController().signal,true)).toEqual(Buffer.from('full video'))
 await expect(downloadMediaBytes(async()=>new Response('bad',{status:206,headers:{'content-range':'bytes 2-4/5'}}),new AbortController().signal,true)).rejects.toThrow('MEDIA_INVALID_CONTENT_RANGE')
})

it.each(['headers','body'])('immediately aborts a provider that never returns %s and ignores its signal',async phase=>{
 const control=new AbortController(),stream=new ReadableStream<Uint8Array>({pull:()=>new Promise(()=>{}),cancel:()=>new Promise(()=>{})})
 const operation=downloadMediaBytes(async()=>phase==='headers'?new Promise<Response>(()=>{}):new Response(stream),control.signal,false)
 await Promise.resolve();control.abort()
 await expect(operation).rejects.toMatchObject({name:'AbortError'})
})

it.each(['headers','body'])('applies the deadline to never-returning %s even if the provider ignores abort',async phase=>{
 const stream=new ReadableStream<Uint8Array>({pull:()=>new Promise(()=>{}),cancel:()=>new Promise(()=>{})})
 await expect(downloadMediaBytes(async()=>phase==='headers'?new Promise<Response>(()=>{}):new Response(stream),AbortSignal.timeout(25),false)).rejects.toMatchObject({name:'TimeoutError'})
})

it('aborts every sibling range after one invalid chunk and permits a fresh retry',async()=>{
 const total=3*1024*1024,signals:AbortSignal[]=[]
 const read=async(headers:Record<string,string>,signal:AbortSignal)=>{
  signals.push(signal)
  if(headers.range==='bytes=0-1048575')return new Response(Buffer.alloc(1024*1024),{status:206,headers:{'content-range':`bytes 0-1048575/${total}`}})
  if(headers.range==='bytes=1048576-2097151')return new Response('invalid',{status:206,headers:{'content-range':`bytes 1-7/${total}`}})
  return new Promise<Response>(()=>{})
 }
 await expect(downloadMediaBytes(read,new AbortController().signal,true)).rejects.toThrow('MEDIA_INVALID_CONTENT_RANGE')
 expect(signals.length).toBe(3);expect(signals.every(signal=>signal.aborted)).toBe(true)
 expect(Buffer.from(await downloadMediaBytes(async()=>new Response('retry'),new AbortController().signal,true)).toString()).toBe('retry')
})

it.each([404,429,503])('preserves HTTP %s and Retry-After for a later range instead of reporting a corrupt range',async status=>{
 const total=2*1024*1024
 const read=async(headers:Record<string,string>)=>headers.range==='bytes=0-1048575'
  ?new Response(Buffer.alloc(1024*1024),{status:206,headers:{'content-range':`bytes 0-1048575/${total}`}})
  :new Response(null,{status,headers:{'retry-after':'3'}})
 await expect(downloadMediaBytes(read,new AbortController().signal,true)).rejects.toMatchObject({message:`MEDIA_DOWNLOAD_HTTP_${status}`,retryAfterMs:3000})
})

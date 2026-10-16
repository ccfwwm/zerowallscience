import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import type { Context } from '@deepseek-ai/cordis'
import { mediaTarget } from '@zerowallscience/plugin-ai-cloud'
import type { MediaStudioService } from './media-studio.js'
import { mediaMime } from './media-studio.js'
import { isTrustedWorkspaceRequest } from './workspace-request-trust.js'
export function parseByteRange(value:string|undefined,size:number):{start:number;end:number}|undefined|null{
  const match=value===undefined?null:/^bytes=(\d*)-(\d*)$/.exec(value.trim());if(!match)return undefined
  const left=match[1]??'',right=match[2]??''
  if(!left){const suffix=Number(right);if(!right||!Number.isSafeInteger(suffix))return undefined;return suffix===0||size<=0?null:{start:Math.max(0,size-suffix),end:size-1}}
  const start=Number(left),end=right?Number(right):Number.MAX_SAFE_INTEGER
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<start)return undefined
  return start>=size?null:{start,end:Math.min(end,size-1)}
}
export function registerMediaRoute(ctx:Context,studio:MediaStudioService,trustedHosts:readonly string[]){
  ctx.effect(()=>ctx.webServer.register({kind:'prefix',path:'/oh-story',async handler(request,response){
    try{
      if(!isTrustedWorkspaceRequest(request,trustedHosts))throw new Error('MEDIA_UNTRUSTED_ORIGIN')
      if(!ctx.connection.authorizeIndex(request,response))return
      const url=new URL(request.url??'','http://localhost')
      if(url.pathname==='/oh-story/authorize'&&request.method==='POST'){
        if(request.headers['content-type']!=='application/json'||typeof request.headers.origin!=='string'||new URL(request.headers.origin).host!==request.headers.host)throw new Error('MEDIA_REVIEW_ORIGIN_REQUIRED')
        let bytes=0;const chunks:Buffer[]=[]
        for await(const chunk of request){bytes+=chunk.length;if(bytes>32768)throw new Error('MEDIA_REVIEW_TOO_LARGE');chunks.push(Buffer.from(chunk))}
        const input=JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const reviews=await studio.authorizeReview(input.sessionId,input.reviews)
        response.writeHead(200,{'content-type':'application/json','cache-control':'no-store'}).end(JSON.stringify({reviews}));return
      }
      // Asset delivery and UI-only authorization share the DSH browser cookie.
      if(url.pathname!=='/oh-story/media'||!['GET','HEAD'].includes(request.method??'')){response.writeHead(404).end();return}
      const path=url.searchParams.get('path')??'',scope=await studio.scope(url.searchParams.get('sessionId')??'')
      if(!/^media-projects\/[A-Za-z0-9_-]{1,80}\/(assets|outputs)\/[A-Za-z0-9_.-]+$/.test(path))throw new Error('MEDIA_PATH_INVALID')
      const type=mediaMime(path);if(!type)throw new Error('MEDIA_FORMAT_INVALID')
      const target=await studio.authorizeAsset(scope.sessionId,path),info=await stat(target)
      if(!info.isFile()||info.size>256*1024*1024)throw new Error('MEDIA_FILE_INVALID')
      const range=parseByteRange(typeof request.headers.range==='string'?request.headers.range:undefined,info.size)
      if(range===null){response.writeHead(416,{'content-range':`bytes */${info.size}`}).end();return}
      response.writeHead(range?206:200,{'content-type':type,'content-length':range?range.end-range.start+1:info.size,'cache-control':'private, no-store','accept-ranges':'bytes','x-content-type-options':'nosniff',...(range?{'content-range':`bytes ${range.start}-${range.end}/${info.size}`}:{})})
      if(request.method==='HEAD'){response.end();return}
      const stream=createReadStream(target,range??{});stream.on('error',()=>response.destroy());stream.pipe(response)
    }catch{if(!response.headersSent)response.writeHead(403,{'content-type':'application/json'}).end(JSON.stringify({error:'媒体不可用或未授权'}));else response.destroy()}
  }}),'media: read-only project asset delivery')
}

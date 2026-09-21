import { useEffect, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { ImageAnnotations, RunRecord, ArtifactRecord } from '@zerowallscience/research-store/types'
import type { FijiWorkflowRequest } from '../shared/types.js'
import type { WesternBlotPlan, WesternBlotResult } from '../shared/western-blot.js'
import { validateWesternBlotPlan } from '../shared/western-blot.js'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.js'
import type {} from '../../lib/typert.remote-client.js'

export function WesternBlotPanel({remote,sessionId,viewerId,viewerVersion,revisionId,annotation,disabled}:{remote:TypertRemoteNamespaceMap['zerowallResearch'];sessionId:string;viewerId:string;viewerVersion:number;revisionId:string|undefined;annotation:ImageAnnotations;disabled:boolean}):JSX.Element {
  const [plan,setPlan]=useState<WesternBlotPlan>({polarity:'dark',saturation:{lower:0,upper:255,source:''},normalization:'housekeeping',controlGroup:null,lanes:[]})
  const [runs,setRuns]=useState<RunRecord[]>([]); const [result,setResult]=useState<WesternBlotResult>();const [artifacts,setArtifacts]=useState<ArtifactRecord[]>([])
  const [message,setMessage]=useState('');const [busy,setBusy]=useState(false)
  const generation=useRef(0);const lock=useRef(false);const request=useRef<{signature:string;id:string}>()
  const call=async(input:Omit<FijiWorkflowRequest,'sessionId'>)=>unwrapRemoteResult('fijiWorkflow',await remote.fijiWorkflow({...input,sessionId}))
  useEffect(()=>{const token=++generation.current;setRuns([]);setResult(undefined);setArtifacts([]);setMessage('');lock.current=false;setBusy(false);request.current=undefined
    void call({action:'list'}).then(value=>{if(token===generation.current)setRuns(value.runs??[])}).catch(error=>{if(token===generation.current)setMessage(String(error))})
    return()=>{generation.current++}
  },[remote,sessionId,viewerId])
  const execute=async(input:Omit<FijiWorkflowRequest,'sessionId'>)=>{
    if(lock.current)return
    const token=generation.current;lock.current=true;setBusy(true);setMessage('')
    try{
      const value=await call(input)
      if(token!==generation.current)return
      setResult(value.result);setArtifacts(value.artifacts??[])
      if(value.run)setMessage(`${value.run.name} · ${value.run.status}${value.run.error?'\n'+value.run.error:''}`)
      const listing=await call({action:'list'});if(token===generation.current)setRuns(listing.runs??[])
    }catch(error){if(token===generation.current)setMessage(String(error))}
    finally{if(token===generation.current){lock.current=false;setBusy(false)}}
  }
  const submit=()=>{
    try{
      const validated=validateWesternBlotPlan(plan,annotation)
      if(!revisionId)throw new Error('请先保存 ROI 修订。')
      const signature=JSON.stringify({viewerId,revisionId,plan:validated})
      if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()}
      void execute({action:'submit',requestId:request.current.id,viewerId,expectedVersion:viewerVersion,annotationRevisionId:revisionId,plan:validated})
    }catch(error){setMessage(String(error))}
  }
  const regionOptions=annotation.rois.filter(item=>item.kind!=='point')
  const laneChange=(index:number,key:keyof WesternBlotPlan['lanes'][number],value:string)=>setPlan(old=>({...old,lanes:old.lanes.map((lane,i)=>i===index?{...lane,[key]:value}:lane)}))
  return <details><summary>Western blot 原始像素定量（Fiji）</summary>
    <p>先保存条带、背景、内参或总蛋白 ROI，再填写样本对应关系。仅接受灰度 PNG/TIFF；饱和阈值必须来自采集设置。输出为描述性定量，不把技术重复当生物学重复。</p>
    <fieldset disabled={busy||disabled} style={{border:0,padding:0}}>
      <label>条带方向 <select aria-label="条带方向" value={plan.polarity} onChange={event=>setPlan({...plan,polarity:event.target.value as WesternBlotPlan['polarity']})}><option value="dark">暗条带</option><option value="bright">亮条带</option></select></label>
      <label>归一化 <select aria-label="WB 归一化" value={plan.normalization} onChange={event=>setPlan({...plan,normalization:event.target.value as WesternBlotPlan['normalization'],lanes:plan.lanes.map(lane=>({sampleId:lane.sampleId,biologicalReplicate:lane.biologicalReplicate,group:lane.group,bandRoiId:lane.bandRoiId,backgroundRoiId:lane.backgroundRoiId}))})}><option value="housekeeping">内参</option><option value="total-protein">总蛋白</option><option value="none">仅背景扣除</option></select></label>
      {(['lower','upper'] as const).map(key=><label key={key}>{key==='lower'?'饱和下界':'饱和上界'} <input aria-label={key==='lower'?'饱和下界':'饱和上界'} type="number" value={plan.saturation[key]} onChange={event=>setPlan({...plan,saturation:{...plan.saturation,[key]:Number(event.target.value)}})} /></label>)}
      <label>阈值来源 <input aria-label="饱和阈值来源" value={plan.saturation.source} onChange={event=>setPlan({...plan,saturation:{...plan.saturation,source:event.target.value}})} /></label>
      <label>对照组（空为不缩放） <input aria-label="WB 对照组" value={plan.controlGroup??''} onChange={event=>setPlan({...plan,controlGroup:event.target.value||null})} /></label>
      {plan.lanes.map((lane,index)=><fieldset key={index}><legend>泳道 {index+1}</legend>
        {([['sampleId','样本ID'],['biologicalReplicate','生物学重复ID'],['group','组别']] as const).map(([key,label])=><label key={key}>{label} <input aria-label={`${label} ${index+1}`} value={lane[key]} onChange={event=>laneChange(index,key,event.target.value)} /></label>)}
        {([['bandRoiId','条带'],['backgroundRoiId','背景'],...(plan.normalization==='none'?[]:[['loadingRoiId','内参/总蛋白'],['loadingBackgroundRoiId','归一化背景']])] as Array<[keyof typeof lane,string]>).map(([key,label])=><label key={key}>{label} <select aria-label={`${label} ROI ${index+1}`} value={lane[key]??''} onChange={event=>laneChange(index,key,event.target.value)}><option value="">选择已保存 ROI</option>{regionOptions.map(roi=><option key={roi.id} value={roi.id}>{roi.name} · 页 {roi.page}</option>)}</select></label>)}
        <button type="button" onClick={()=>setPlan({...plan,lanes:plan.lanes.filter((_,i)=>i!==index)})}>移除泳道 {index+1}</button>
      </fieldset>)}
      <button type="button" onClick={()=>setPlan({...plan,lanes:[...plan.lanes,{sampleId:'',biologicalReplicate:'',group:'',bandRoiId:'',backgroundRoiId:''}]})}>添加泳道</button>
      <button type="button" disabled={!revisionId||!plan.lanes.length} onClick={submit}>运行 Fiji 定量</button>
    </fieldset>
    <ul aria-label="Fiji 定量任务">{runs.map(run=><li key={run.id}>{run.name} · {run.status} <button type="button" disabled={busy} onClick={()=>void execute({action:'status',runId:run.id})}>检查结果 {run.id.slice(0,8)}</button>{['submitted','running'].includes(run.status)&&<button type="button" disabled={busy} onClick={()=>void execute({action:'cancel',runId:run.id})}>取消 {run.id.slice(0,8)}</button>}</li>)}</ul>
    {message&&<pre role="status" style={{whiteSpace:'pre-wrap'}}>{message}</pre>}
    {result&&<><table><caption>泳道定量及质控</caption><thead><tr><th>样本</th><th>生物学重复</th><th>扣背景强度</th><th>归一化</th><th>相对对照</th><th>质控</th></tr></thead><tbody>{result.rows.map(row=><tr key={row.sampleId}><td>{row.sampleId}</td><td>{row.biologicalReplicate}</td><td>{row.correctedIntensity}</td><td>{row.normalized??'未通过'}</td><td>{row.relativeToControl??'未计算'}</td><td>{row.flags.join(', ')||'通过数值质控；待科研复核'}</td></tr>)}</tbody></table><ul>{result.notes.map(note=><li key={note}>{note}</li>)}</ul></>}
    <ul>{artifacts.map(item=><li key={item.id}>{item.name} · {item.metadata.needsReview?'需重新复核':'已登记'}<code style={{display:'block',overflowWrap:'anywhere'}}>{item.uri}</code></li>)}</ul>
  </details>
}

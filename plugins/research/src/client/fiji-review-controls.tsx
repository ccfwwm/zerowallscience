import { useEffect, useRef, useState } from 'react'
import type { AnnotationRevisionRecord, RunRecord } from '@zerowallscience/research-store/types'
import type { FijiImageConfig } from '../shared/fiji-experiments.js'
import type { FijiExperimentRequest, FijiExperimentResponse } from '../shared/types.js'

export function FijiReviewControls({sessionId,assetId,text,setText,call}:{sessionId:string;assetId:string;text:string;setText:(text:string)=>void;call:(request:FijiExperimentRequest)=>Promise<FijiExperimentResponse>}):JSX.Element {
 const [annotations,setAnnotations]=useState<AnnotationRevisionRecord[]>([]);const [runs,setRuns]=useState<RunRecord[]>([]);const [error,setError]=useState('')
 const scope=useRef(0)
 let config:FijiImageConfig|undefined
 try { const value=JSON.parse(text)
  if(!value||Array.isArray(value)||typeof value!=='object'||!value.roi||!['x','y','width','height'].every(key=>typeof value.roi[key]==='number'))throw new Error('Incomplete config')
  if(value.review&&(!Array.isArray(value.review.excludedRoiIds)||(value.review.foregroundRoiIds!==undefined&&!Array.isArray(value.review.foregroundRoiIds))))throw new Error('Incomplete review')
  if(value.timeline&&(!value.timeline.pixelSpacing||!Array.isArray(value.timeline.expectedHours)))throw new Error('Incomplete timeline')
  config=value as FijiImageConfig
 }catch{}
 const refresh=async()=>{const current=scope.current;const result=await call({sessionId,action:'list',sourceAssetId:assetId});if(current!==scope.current)return;setAnnotations((result.annotations??[]).filter(item=>item.status==='accepted'));setRuns(result.runs??[])}
 useEffect(()=>{scope.current++;let alive=true;setAnnotations([]);setRuns([]);void call({sessionId,action:'list',sourceAssetId:assetId}).then(value=>{if(alive){setAnnotations((value.annotations??[]).filter(item=>item.status==='accepted'));setRuns(value.runs??[])}}).catch(reason=>{if(alive)setError(String(reason))});return()=>{alive=false;scope.current++}},[sessionId,assetId])
 const change=(patch:Partial<FijiImageConfig>)=>{if(config)setText(JSON.stringify({...config,...patch},null,2))}
 const revision=annotations.find(item=>item.id===config?.review?.annotationRevisionId)
 const selectRoi=(id:string,kind:'foregroundRoiIds'|'excludedRoiIds',checked:boolean)=>{if(!config?.review)return;const ids=config.review[kind]??[];change({review:{...config.review,[kind]:checked?[...ids,id]:ids.filter(value=>value!==id)}})}
 return <fieldset><legend>标注修订与样本关联</legend>
  {config&&<div><label>阈值<input aria-label="Fiji threshold" type="number" min="0" max="255" value={config.threshold} onChange={event=>change({threshold:Number(event.target.value)})}/></label><label>前景<select aria-label="Fiji polarity" value={config.polarity} onChange={event=>change({polarity:event.target.value as 'bright'|'dark'})}><option value="bright">亮</option><option value="dark">暗</option></select></label>
   {(['x','y','width','height'] as const).map(key=><label key={key}>ROI {key}<input aria-label={'Fiji ROI '+key} type="number" value={config!.roi[key]} onChange={event=>change({roi:{...config!.roi,[key]:Number(event.target.value)}})}/></label>)}
   {('minArea' in config)&&(['minArea','maxArea'] as const).map(key=><label key={key}>{key}<input aria-label={'Fiji '+key} type="number" value={(config as {minArea:number;maxArea:number})[key]} onChange={event=>change({[key]:Number(event.target.value)})}/></label>)}
   {'sampleId' in config&&<label>样本<input aria-label="Fiji sampleId" value={config.sampleId} onChange={event=>change({sampleId:event.target.value})}/></label>}
   {config.kind==='colony-formation'&&<><label>板位<input aria-label="Fiji plateId" value={config.plateId??''} onChange={event=>change({plateId:event.target.value})}/></label><label>孔位<input aria-label="Fiji wellId" value={config.wellId} onChange={event=>change({wellId:event.target.value})}/></label></>}
   {config.kind==='bacterial-cfu'&&<label>平板<input aria-label="Fiji plateId" value={config.plateId} onChange={event=>change({plateId:event.target.value})}/></label>}
  </div>}
  <p>在图像查看器或 Fiji/napari 保存接受的区域修订，然后刷新。前景区域并集可作为人工修订掩膜；排除区用于反光和边缘。原自动掩膜及各次结果均保留。</p>
  <button type="button" onClick={()=>void refresh().catch(reason=>setError(String(reason)))}>刷新接受修订</button>
  <label>接受修订 <select aria-label="Fiji 接受修订" value={config?.review?.annotationRevisionId??''} onChange={event=>{if(!config)return;if(!event.target.value){const next={...config};delete next.review;setText(JSON.stringify(next,null,2))}else change({review:{annotationRevisionId:event.target.value,excludedRoiIds:[],reason:'用户复核分割区域'}})}}><option value="">使用自动阈值</option>{annotations.map(item=><option key={item.id} value={item.id}>v{item.revision} · {item.origin} · {item.id.slice(0,8)}</option>)}</select></label>
  {config?.review&&<><label>修订原因 <input aria-label="Fiji 修订原因" value={config.review.reason} onChange={event=>change({review:{...config!.review!,reason:event.target.value}})}/></label>
   <label><input aria-label="使用人工前景掩膜" type="checkbox" checked={config.review.foregroundRoiIds!==undefined} onChange={event=>{const review={...config!.review!};if(event.target.checked)review.foregroundRoiIds=[];else delete review.foregroundRoiIds;change({review})}}/>使用所选区域替代自动前景（不选任何区域表示空掩膜）</label>
   {revision?.payload.rois.filter(roi=>roi.kind!=='point'&&roi.page===0).map(roi=><div key={roi.id}>{roi.name} <label><input type="checkbox" aria-label={'排除 '+roi.name} checked={config!.review!.excludedRoiIds.includes(roi.id)} onChange={event=>selectRoi(roi.id,'excludedRoiIds',event.target.checked)}/>排除</label>{config!.review!.foregroundRoiIds!==undefined&&<label><input type="checkbox" aria-label={'前景 '+roi.name} checked={config!.review!.foregroundRoiIds!.includes(roi.id)} onChange={event=>selectRoi(roi.id,'foregroundRoiIds',event.target.checked)}/>前景</label>}</div>)}
  </>}
  {config?.kind==='bacterial-cfu'&&<div><p>稀释填倒数：1:1000 填 1000。留空时只保留菌落计数，CFU/mL 为未知。</p>{(['dilutionFactor','platedVolumeMl'] as const).map(key=><label key={key}>{key==='dilutionFactor'?'稀释倒数':'涂板体积 mL'}<input aria-label={'Fiji '+key} type="number" value={config[key]??''} onChange={event=>change({[key]:event.target.value===''?null:Number(event.target.value)})}/></label>)}</div>}
  {config?.kind==='colony-formation'&&<label>接种细胞数（可空）<input aria-label="Fiji seededCells" type="number" value={config.seededCells??''} onChange={event=>change({seededCells:event.target.value===''?null:Number(event.target.value)})}/></label>}
  {config?.kind==='scratch-wound'&&<div><label><input aria-label="关联划痕时间序列" type="checkbox" checked={!!config.timeline} onChange={event=>{const next={...config!} as typeof config;if(event.target.checked)next.timeline={fieldId:'',timeHours:0,expectedHours:[0,24,48],pixelSpacing:{x:0,y:0,unit:'um',source:''}};else delete next.timeline;setText(JSON.stringify(next,null,2))}}/>关联已测量基线（需要真实像素标定）</label>
   {config.timeline&&<><label>视野<input aria-label="Fiji fieldId" value={config.timeline.fieldId} onChange={event=>change({timeline:{...config!.timeline!,fieldId:event.target.value}})}/></label><label>时间 h<input aria-label="Fiji timeHours" type="number" value={config.timeline.timeHours} onChange={event=>change({timeline:{...config!.timeline!,timeHours:Number(event.target.value)}})}/></label>
   <label>成功基线<select aria-label="Fiji baselineRunId" value={config.timeline.baselineRunId??''} onChange={event=>{const timeline={...config!.timeline!};if(event.target.value)timeline.baselineRunId=event.target.value;else delete timeline.baselineRunId;change({timeline})}}><option value="">当前图像是 0h 基线</option>{runs.filter(run=>run.status==='succeeded'&&run.command.includes('scratch')).map(run=><option key={run.id} value={run.id}>{run.name} · {run.id}</option>)}</select></label>
   {(['x','y'] as const).map(key=><label key={key}>像素间距 {key}<input aria-label={'Fiji spacing '+key} type="number" value={config!.timeline!.pixelSpacing[key]} onChange={event=>change({timeline:{...config!.timeline!,pixelSpacing:{...config!.timeline!.pixelSpacing,[key]:Number(event.target.value)}}})}/></label>)}<label>标定来源<input aria-label="Fiji spacing source" value={config.timeline.pixelSpacing.source} onChange={event=>change({timeline:{...config!.timeline!,pixelSpacing:{...config!.timeline!.pixelSpacing,source:event.target.value}}})}/></label><p>间距单位默认 µm；计划时间点和单位在参数中明确保存。缺失时间点不插值。</p></>}
  </div>}
  {error&&<p role="alert">{error}</p>}
 </fieldset>
}

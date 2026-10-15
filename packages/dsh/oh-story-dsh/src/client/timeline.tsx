import type { MediaAsset } from '@zerowallscience/plugin-ai-cloud/types'
import type { MediaProject } from '../media-types.js'

/** Small, explicit shot editor; the project JSON remains available for details. */
export function Timeline({project,assets,onChange}:{project:MediaProject;assets:MediaAsset[];onChange:(project:MediaProject)=>void}){
 const change=(patch:Partial<MediaProject>)=>onChange({...project,...patch})
 const visuals=assets.filter(a=>a.mediaType.startsWith('image/')||a.mediaType.startsWith('video/'))
 const audio=assets.filter(a=>a.mediaType.startsWith('audio/'))
 const patchShot=(index:number,patch:Partial<MediaProject['shots'][number]>)=>change({shots:project.shots.map((s,i)=>i===index?{...s,...patch}:s)})
 const move=(index:number,step:number)=>{const next=[...project.shots],target=index+step;if(target<0||target>=next.length)return;[next[index],next[target]]=[next[target]!,next[index]!];change({shots:next})}
 return <section className="media-timeline-editor"><label>项目名称<input value={project.title} onChange={e=>change({title:e.target.value})}/></label><label>画面比例<select value={project.aspectRatio} onChange={e=>change({aspectRatio:e.target.value as MediaProject['aspectRatio']})}>{['16:9','9:16','1:1'].map(v=><option key={v}>{v}</option>)}</select></label>
 <label>需求方案<textarea value={project.brief} onChange={e=>change({brief:e.target.value})}/></label><h4>分镜与时间线</h4>
 {project.shots.map((shot,index)=><fieldset key={shot.id}><legend>镜头 {index+1}</legend><label>镜头素材<select value={shot.asset} onChange={e=>patchShot(index,{asset:e.target.value})}><option value="">请选择素材</option>{visuals.map(a=><option key={a.path} value={a.path}>{a.path.split('/').at(-1)}{a.duration?' · '+a.duration.toFixed(2)+' 秒':''}</option>)}</select></label>
 <label>镜头时长（秒）<input type="number" min="0.1" max="600" step="0.1" value={shot.duration} onChange={e=>patchShot(index,{duration:Number(e.target.value)})}/></label><label>视频起点（秒）<input type="number" min="0" step="0.1" value={shot.trimStart??0} onChange={e=>patchShot(index,{trimStart:Number(e.target.value)})}/></label>
 <label>图片运动<select value={shot.motion??'none'} onChange={e=>patchShot(index,{motion:e.target.value as any})}><option value="none">静止</option><option value="zoom-in">缓慢推进</option><option value="zoom-out">缓慢拉远</option></select></label><label>镜头字幕<textarea value={shot.caption??''} onChange={e=>patchShot(index,{caption:e.target.value})}/></label>
 <button disabled={index===0} onClick={()=>move(index,-1)}>上移</button><button disabled={index===project.shots.length-1} onClick={()=>move(index,1)}>下移</button><button onClick={()=>change({shots:project.shots.filter((_,i)=>i!==index)})}>移除镜头</button></fieldset>)}
 <button onClick={()=>change({shots:[...project.shots,{id:crypto.randomUUID(),asset:visuals[0]?.path??'',duration:3,motion:'none',caption:''}]})}>添加镜头</button>
 <label>背景音乐<select value={project.music?.path??''} onChange={e=>{const next={...project};if(e.target.value)next.music={path:e.target.value,volume:.25,fadeIn:0,fadeOut:0};else delete next.music;onChange(next)}}><option value="">无</option>{audio.map(a=><option key={a.path} value={a.path}>{a.path.split('/').at(-1)}</option>)}</select></label>
 {project.music&&(['volume','fadeIn','fadeOut'] as const).map((field,index)=><label key={field}>{['音乐音量','淡入秒数','淡出秒数'][index]}<input type="number" min="0" max={field==='volume'?4:600} step="0.1" value={project.music![field]} onChange={e=>change({music:{...project.music!,[field]:Number(e.target.value)}})}/></label>)}
 <label>导入旁白<select value={project.voiceover?.path??''} onChange={e=>{const next={...project};if(e.target.value)next.voiceover={path:e.target.value,volume:1};else delete next.voiceover;onChange(next)}}><option value="">无</option>{audio.map(a=><option key={a.path} value={a.path}>{a.path.split('/').at(-1)}</option>)}</select></label>
 {project.voiceover&&<label>旁白音量<input type="number" min="0" max="4" step="0.1" value={project.voiceover.volume} onChange={e=>change({voiceover:{...project.voiceover!,volume:Number(e.target.value)}})}/></label>}
 </section>
}

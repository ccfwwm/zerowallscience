import {useState} from 'react'
import type {TypertRemoteNamespaceMap} from '@deepseek-ai/dsh-typert-protocol'
import type {ArtifactRecord} from '@zerowallscience/research-store/types'
import {unwrapRemoteResult} from '../../../base/src/shared/client-helpers.ts'
import type {BrainTransformContract} from '../shared/brain-transform.js'

export function BrainTransformPanel({remote,sessionId,projectId,onMapped}:{remote:TypertRemoteNamespaceMap['zerowallResearch'];sessionId:string;projectId?:string;onMapped:(points:Array<[number,number,number]>)=>void}):JSX.Element{
 const [artifacts,setArtifacts]=useState<ArtifactRecord[]>([])
 const [selected,setSelected]=useState('')
 const [coordinates,setCoordinates]=useState('[[0, 0, 0]]')
 const [contract,setContract]=useState<BrainTransformContract>()
 const [message,setMessage]=useState('')
 const [busy,setBusy]=useState(false)
 const load=async():Promise<void>=>{if(!projectId)return;setBusy(true);try{const rows=unwrapRemoteResult('listArtifacts',await remote.listArtifacts(projectId));setArtifacts(rows.filter(row=>row.name==='BrainGlobe brainreg registration'));setMessage('配准产物列表已刷新。')}catch(e){setMessage(String(e))}finally{setBusy(false)}}
 const run=async(action:'inspect'|'map'):Promise<void>=>{
  setBusy(true);setMessage('')
  try{
   const points=action==='map'?JSON.parse(coordinates) as unknown:undefined
   if(action==='map'&&(!Array.isArray(points)||points.some(p=>!Array.isArray(p)||p.length!==3||p.some(v=>typeof v!=='number'||!Number.isFinite(v)))))throw new Error('请输入有限数值三元组 JSON。')
   const value=unwrapRemoteResult('brainTransform',await remote.brainTransform({sessionId,action,registrationArtifactId:selected,...(action==='map'?{coordinates:points as Array<[number,number,number]>,coordinateSpace:'brainreg-downsampled-asr-voxel' as const}:{})})) as unknown as {contract:BrainTransformContract;result?:{mapped:number;outsideSourceGrid:number;outsideAtlas:number;rows:Array<{atlasMicron:[number,number,number]|null;status:string}>};artifact?:ArtifactRecord}
   setContract(value.contract)
   if(value.result){onMapped(value.result.rows.filter(row=>row.status==='mapped'&&row.atlasMicron!==null).map(row=>row.atlasMicron!));setMessage(`已变换 ${value.result.mapped} 点；样本网格外 ${value.result.outsideSourceGrid} 点；图谱外 ${value.result.outsideAtlas} 点。已映射点载入图谱坐标框（µm）。产物：${value.artifact?.name??'—'}。解剖配准质量仍待复核。`)}else setMessage('变形场、几何契约及文件 SHA-256 已核验。')
  }catch(e){setMessage(e instanceof Error?e.message:String(e))}finally{setBusy(false)}
 }
 return <fieldset disabled={busy}><legend>配准坐标变换</legend><p>从指定配准产物的 downsampled.tiff 网格读取坐标：零起点、ASR 数组轴序。采用已核验的 brainreg 变形场；原始样本或 cellfinder XYZ 需要另行验证的重采样转换，不能直接填入。</p><button type="button" disabled={!projectId} onClick={()=>void load()}>刷新配准产物</button><select aria-label="配准变换产物" value={selected} onChange={e=>{setSelected(e.target.value);setContract(undefined)}}><option value="">选择配准产物</option>{artifacts.map(a=><option key={a.id} value={a.id}>{a.name} · {a.id.slice(0,8)}</option>)}</select><button type="button" disabled={!selected} onClick={()=>void run('inspect')}>核验变换契约</button>{contract&&<p>样本网格 {contract.sourceShape.join(' × ')} · atlas {contract.atlasVersion} · {contract.direction} · 三线性插值</p>}<textarea aria-label="配准样本网格坐标" rows={3} value={coordinates} onChange={e=>setCoordinates(e.target.value)} style={{width:'100%',boxSizing:'border-box'}}/><button type="button" disabled={!selected} onClick={()=>void run('map')}>变换并登记坐标产物</button>{message&&<p role="status">{message}</p>}</fieldset>
}

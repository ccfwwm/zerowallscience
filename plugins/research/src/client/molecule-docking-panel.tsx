import { useEffect, useRef, useState } from 'react'
import type { DataAssetRecord, RunRecord } from '@zerowallscience/research-store/types'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.js'
import type { MoleculeDockingRequest } from '../shared/molecule-docking.js'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'

type DockRemote = { moleculeDocking(input: MoleculeDockingRequest): Promise<RemoteResult<any>> }
export function MoleculeDockingPanel({ remote, sessionId, onPose }: { remote: DockRemote; sessionId: string; onPose: (assetId: string) => void }): JSX.Element {
  const [assets,setAssets]=useState<DataAssetRecord[]>([]);const [runs,setRuns]=useState<RunRecord[]>([])
  const [receptor,setReceptor]=useState('');const [ligands,setLigands]=useState('');const [source,setSource]=useState('')
  const [center,setCenter]=useState('0, 0, 0');const [size,setSize]=useState('20, 20, 20');const [threads,setThreads]=useState(1)
  const [requestId,setRequestId]=useState('');const [runId,setRunId]=useState('');const [result,setResult]=useState<any>();const [message,setMessage]=useState('');const [busy,setBusy]=useState(false)
  const generation=useRef(0)
  const call=async (input:Omit<MoleculeDockingRequest,'sessionId'>)=>unwrapRemoteResult('moleculeDocking',await remote.moleculeDocking({...input,sessionId})) as any
  const refresh=async()=>{const current=generation.current;const next=await call({action:'list'});if(current!==generation.current)return;setAssets(next.assets??[]);setRuns(next.runs??[])}
  useEffect(()=>{const current=++generation.current;setAssets([]);setRuns([]);setResult(undefined);setRunId('');setRequestId('');setReceptor('');setLigands('');setSource('');setMessage('');setBusy(false);void refresh().catch(e=>{if(current===generation.current)setMessage(String(e))});return()=>{generation.current++}},[remote,sessionId])
  const execute=async(action:'submit'|'status'|'cancel')=>{
    if(busy)return;setBusy(true);setMessage('');const current=generation.current
    try{
      const selectedReceptor=assets.find(a=>a.id===receptor);const selectedLigands=assets.find(a=>a.id===ligands)
      if(action==='submit'&&(!selectedReceptor||!selectedLigands))throw new Error('请重新选择当前项目内的受体与配体资产。')
      const vector=(text:string):[number,number,number]=>{const parts=text.split(',');const values=parts.map(v=>Number(v.trim()));if(values.length!==3||parts.some(v=>!v.trim())||values.some(v=>!Number.isFinite(v)))throw new Error('搜索盒需填写三个逗号分隔的有限数值。');return values as [number,number,number]}
      const key=requestId||'vina-'+crypto.randomUUID();if(action==='submit')setRequestId(key)
      const next=await call(action==='submit'?{action,requestId:key,receptorAssetId:receptor,ligandAssetId:ligands,expectedReceptorVersion:selectedReceptor!.version,expectedLigandVersion:selectedLigands!.version,preparationSource:source,box:{center:vector(center),size:vector(size)},threads}:{action,runId})
      if(current!==generation.current)return
      setResult(next);if(next.run)setRunId(next.run.id)
      if(next.artifactError||next.error)setMessage(next.artifactError||next.error)
      await refresh()
    }catch(error){if(current===generation.current)setMessage(String(error))}finally{if(current===generation.current)setBusy(false)}
  }
  const pending=runId&&runs.some(r=>r.id===runId&&!['succeeded','failed','cancelled','timed_out'].includes(r.status))
  return <details style={{marginTop:16,borderTop:'1px solid var(--dsw-alias-border-l1)',paddingTop:12}}>
    <summary>Vina 分子对接 · 远程 CPU</summary>
    <p>选择当前项目内已准备的刚性受体 PDBQT 和配体 JSON。配体格式为 <code>{'[{"id":"ethanol","smiles":"CCO","source":"来源"}]'}</code>，最多 32 项；服务器使用 ETKDG/Meeko 准备配体。</p>
    <fieldset disabled={busy} style={{border:0,padding:0}}>
      <label>受体 <select aria-label="对接受体" value={receptor} onChange={e=>setReceptor(e.target.value)}><option value="">选择 PDBQT</option>{assets.filter(a=>a.location==='local'&&/\.pdbqt$/iu.test(a.uri)).map(a=><option key={a.id} value={a.id}>{a.name} · v{a.version}</option>)}</select></label>
      <label>配体 <select aria-label="对接配体列表" value={ligands} onChange={e=>setLigands(e.target.value)}><option value="">选择 JSON</option>{assets.filter(a=>a.location==='local'&&/\.json$/iu.test(a.uri)).map(a=><option key={a.id} value={a.id}>{a.name} · v{a.version}</option>)}</select></label>
      <button onClick={()=>void refresh().catch(e=>setMessage(String(e)))}>刷新对接资产</button>
      <p><label>受体准备记录 <textarea aria-label="受体准备来源" placeholder="来源结构、准备软件/版本、pH/质子化、保留的水/离子/辅因子" value={source} onChange={e=>setSource(e.target.value)} style={{display:'block',width:'100%',minHeight:70}} /></label></p>
      <label>盒中心 Å <input aria-label="对接盒中心" value={center} onChange={e=>setCenter(e.target.value)} /></label>
      <label>盒尺寸 Å <input aria-label="对接盒尺寸" value={size} onChange={e=>setSize(e.target.value)} /></label>
      <label>线程 <input aria-label="对接线程" type="number" min={1} max={8} value={threads} onChange={e=>setThreads(Number(e.target.value))} /></label>
      <p>固定 seed 42、exhaustiveness 8、最多 9 个构象、30 分钟超时。提交会通过现有文件链路上传受体快照，并向 rdatalinux 发送配体及搜索参数。</p>
      <button disabled={!receptor||!ligands||!source.trim()||!!pending} onClick={()=>void execute('submit')}>上传受体并提交 Vina</button>
      <button onClick={()=>{setRequestId('');setRunId('');setResult(undefined)}}>开始新的对接配置</button>
      {requestId&&<p>请求 ID：<code>{requestId}</code>；重复提交保留同一 ID，输入变化后请开始新配置。</p>}
      <label>历史任务 <select aria-label="对接历史任务" value={runId} onChange={e=>{setRunId(e.target.value);setResult(undefined)}}><option value="">选择已有任务</option>{runs.map(r=><option key={r.id} value={r.id}>{r.name} · {r.status} · {r.id.slice(0,8)}</option>)}</select></label>
      <button disabled={!runId} onClick={()=>void execute('status')}>刷新对接任务与取回产物</button>
      <button disabled={!pending} onClick={()=>void execute('cancel')}>取消此对接任务</button>
    </fieldset>
    {busy&&<p role="status">正在核验或同步远程任务…</p>}{message&&<pre role="status" style={{whiteSpace:'pre-wrap'}}>{message}</pre>}
    {result?.run&&<p>任务：{result.run.status} · {result.analysisComplete?'产物哈希与来源检查通过，等待科学复核':'尚未完成产物核验'}</p>}
    {result?.inputSnapshot&&<details><summary>此任务实际执行参数与输入快照</summary><p>盒中心：{result.inputSnapshot.box.center.join(', ')} Å；盒尺寸：{result.inputSnapshot.box.size.join(', ')} Å；线程：{result.inputSnapshot.threads}；seed：{result.inputSnapshot.seed}</p><p style={{whiteSpace:'pre-wrap'}}>准备记录：{result.inputSnapshot.preparationSource}</p><p>受体 SHA-256：<code>{result.inputSnapshot.receptorSha256}</code></p><p>配体列表 SHA-256：<code>{result.inputSnapshot.ligandSha256}</code></p><p>以上为历史执行快照；上方表单用于新任务配置。</p></details>}
    {result?.inputsCurrent===false&&<p role="status">当前输入已变化或无法读取；此结果保留的是原始快照，关联结论需要重新检查。变化：{result.staleInputs.join('、')}</p>}
    {result?.poses?.length>0&&<table><thead><tr><th>配体</th><th>Vina score（kcal/mol）</th><th>复核</th></tr></thead><tbody>{result.poses.map((pose:any)=><tr key={pose.ligandId}><td>{pose.ligandId}</td><td>{pose.affinityKcalMol}</td><td><button onClick={()=>onPose(pose.assetId)}>查看首个构象</button></td></tr>)}</tbody></table>}
    <p><small>分数仅用于既定准备与搜索条件下的计算比较，不是实测亲和力、人体机制或临床疗效。首个构象可在本地 Mol* 复核；完整 PDBQT 构象与日志保留在产物记录。</small></p>
  </details>
}

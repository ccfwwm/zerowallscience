import { useEffect, useRef, useState } from 'react'
import type { TypertRemoteNamespaceMap } from '@deepseek-ai/dsh-typert-protocol'
import type { DataAssetRecord, ViewerSessionRecord } from '@zerowallscience/research-store/types'
import { unwrapRemoteResult } from '../../../base/src/shared/client-helpers.ts'
import type { MoleculeRequest, MoleculeResponse } from '../shared/types.js'
import { INITIAL_MOLECULE_STATE, type MoleculeMeasurement, type MoleculeRuntime, type MoleculeSummary, type MoleculeViewState } from '../shared/molecule.js'
import { MoleculeDockingPanel } from './molecule-docking-panel.js'
import type { MoleculeController, MoleculeRuntimeApi } from './molecule-runtime.js'
import { useWorkbenchSelection } from './workbench-selection.js'

type Remote=TypertRemoteNamespaceMap['zerowallResearch']
let runtimePromise:Promise<MoleculeRuntimeApi>|undefined
async function loadRuntime(get:()=>Promise<MoleculeRuntime>):Promise<MoleculeRuntimeApi>{
  if(window.__ZeroWallMoleculeRuntime)return window.__ZeroWallMoleculeRuntime
  return runtimePromise??=get().then(async runtime=>{
    const bytes=new TextEncoder().encode(runtime.source)
    if(bytes.length!==runtime.bytes||bytes.length>8*1024**2||runtime.version!=='5.11.0')throw new Error('Invalid local Molstar runtime.')
    const digest=await crypto.subtle.digest('SHA-256',bytes)
    if([...new Uint8Array(digest)].map(n=>n.toString(16).padStart(2,'0')).join('')!==runtime.sha256)throw new Error('Molstar runtime integrity check failed.')
    const url=URL.createObjectURL(new Blob([bytes],{ type:'text/javascript' }))
    try { await new Promise<void>((yes,no)=>{ const script=document.createElement('script');script.src=url;script.onload=()=>{script.remove();yes()};script.onerror=()=>{script.remove();no(new Error('本地 Molstar 脚本加载失败。'))};document.head.appendChild(script) }) }
    finally{URL.revokeObjectURL(url)}
    if(window.__ZeroWallMoleculeRuntime?.version!=='5.11.0')throw new Error('Molstar did not initialize.')
    return window.__ZeroWallMoleculeRuntime
  }).catch(error=>{runtimePromise=undefined;throw error})
}

export function MoleculeViewer({remote,sessionId,viewOnly=false,onPickFile}:{remote:Remote;sessionId:string;viewOnly?:boolean;onPickFile?:()=>void}):JSX.Element{
  const [assets,setAssets]=useState<DataAssetRecord[]>([]);const [viewers,setViewers]=useState<ViewerSessionRecord[]>([])
  const [assetId,setAssetId]=useState('');const [viewer,setViewer]=useState<ViewerSessionRecord>();const [summary,setSummary]=useState<MoleculeSummary>()
  const [state,setState]=useState<MoleculeViewState>(INITIAL_MOLECULE_STATE);const [measurement,setMeasurement]=useState<MoleculeMeasurement>()
  const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [ready,setReady]=useState(false)
  const container=useRef<HTMLDivElement>(null);const controller=useRef<MoleculeController>();const generation=useRef(0)
  const selection=useWorkbenchSelection();const handled=useRef('')
  const call=async(action:MoleculeRequest['action'],data:Partial<MoleculeRequest>={}):Promise<MoleculeResponse>=>{
    const response=unwrapRemoteResult('scienceViewer',await remote.scienceViewer({sessionId,action:('molecule_'+action) as 'molecule_open',molecule:{...data,sessionId,action}}))
    return (response as unknown as {molecule:MoleculeResponse}).molecule
  }
  const refresh=async():Promise<void>=>{
    const current=generation.current;const response=unwrapRemoteResult('scienceViewer',await remote.scienceViewer({sessionId,action:'list'})) as unknown as {assets:DataAssetRecord[];viewers:ViewerSessionRecord[]}
    if(current!==generation.current)return
    setAssets(response.assets.filter(asset=>/\.(pdb|cif|mmcif|sdf)$/iu.test(asset.uri)));setViewers(response.viewers.filter(view=>view.tool==='molecule'))
  }
  useEffect(()=>{generation.current++;controller.current?.dispose();controller.current=undefined;setViewer(undefined);setSummary(undefined);setReady(false);setMessage('');void refresh().catch(error=>setMessage(String(error)));return()=>{generation.current++;controller.current?.dispose();controller.current=undefined}},[remote,sessionId])
  const run=async(action:MoleculeRequest['action'],data:Partial<MoleculeRequest>={}):Promise<void>=>{
    if(busy)return;const current=generation.current;setBusy(true);setMessage('')
    try{
      const next={...state,camera:controller.current?.camera()??state.camera}
      const png=action==='export'?await controller.current?.png():undefined
      const response=await call(action,{...(viewer?{viewerId:viewer.id,expectedVersion:viewer.version}:{}),...(['save','export','measure'].includes(action)?{state:next}:{}),...(png===undefined?{}:{pngBase64:png}),...data})
      if(current!==generation.current)return
      if(response.viewer){setViewer(response.viewer);setAssetId(response.viewer.assetId)}
      if(response.summary)setSummary(response.summary)
      if(response.state)setState(response.state)
      setMeasurement(response.measurement)
      if(response.source!==undefined&&response.summary&&response.state){
        setReady(false);controller.current?.dispose();controller.current=undefined
        const runtime=await loadRuntime(async()=>{const value=await call('runtime');if(!value.runtime)throw new Error('No molecular runtime');return value.runtime})
        if(current!==generation.current)return
        const created=await runtime.create(container.current!,response.source,response.summary.format,response.state)
        if(current!==generation.current){created.dispose();return}
        controller.current=created;setReady(true)
      }
      if(response.artifact)setMessage('已登记分子产物：'+response.artifact.uri)
      else if(action==='save')setMessage('视角与选择已保存。')
      await refresh()
    }catch(error){if(current===generation.current)setMessage(error instanceof Error?error.message:String(error))}
    finally{if(current===generation.current)setBusy(false)}
  }
  // Mirror the workbench sidebar pick into the local dropdown, so the panel shows
  // the file the user selected. An empty selection leaves the dropdown untouched,
  // because then the user is choosing inside the viewer.
  useEffect(()=>{if(selection.assetId)setAssetId(selection.assetId)},[selection.assetId])
  useEffect(()=>{
    if(!selection.assetId||selection.revision==null)return
    // Keyed by revision: selecting the same asset again is a second request, but a
    // re-render of the same selection must not reissue the remote open call.
    const key=`${selection.assetId}:${selection.revision}`
    if(handled.current===key)return
    handled.current=key
    // Fired from the effect, so it runs before any user interaction can flip run()'s
    // busy guard and swallow the requested open.
    void run('open',{assetId:selection.assetId})
  },[selection.assetId,selection.revision])
  const change=async(next:MoleculeViewState):Promise<void>=>{
    if(busy)return;setBusy(true)
    try{await controller.current?.apply({...next,camera:controller.current.camera()});setState(next);setMeasurement(undefined)}catch(error){setMessage(String(error))}finally{setBusy(false)}
  }
  const residues=summary?.residues.filter(residue=>state.chain===null||residue.chain===state.chain)??[]
  const atoms=summary?.atoms.filter(atom=>(state.chain===null||atom.chain===state.chain)&&(state.residueId===null||atom.residueId===state.residueId))??[]
  const listedAtoms=atoms.slice(0,5000)
  for(const index of [state.atomA,state.atomB])if(index!==null&&summary?.atoms[index]&&!listedAtoms.some(atom=>atom.index===index))listedAtoms.push(summary.atoms[index]!)
  if(viewOnly)return <section data-empty={!summary} aria-label="分子结构查看器"><div><button type="button" data-choose-file="true" onClick={onPickFile}>选择文件</button><select aria-label="分子资产" value={assetId} onChange={event=>setAssetId(event.target.value)}><option value="">选择结构文件</option>{assets.map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select><button type="button" disabled={!assetId||busy} onClick={()=>void run('open',{assetId})}>打开</button></div><p role="status">{busy?'正在加载':message?`打开失败：${message}`:summary?'已加载':'未选择文件'}</p>{summary&&<><p>{summary.title||'分子结构'} · {summary.atomCount} 原子 · {summary.chains.length} 链</p><label>链 <select aria-label="分子链" value={state.chain===null?'__all__':state.chain} onChange={event=>void change({...state,chain:event.target.value==='__all__'?null:event.target.value,residueId:null})}><option value="__all__">全部链</option>{summary.chains.map(chain=><option key={chain.id} value={chain.id}>{chain.id||'(空链标识)'}</option>)}</select></label><label>显示 <select aria-label="分子表示" value={state.representation} onChange={event=>void change({...state,representation:event.target.value as MoleculeViewState['representation']})}><option value="ball-and-stick">球棍</option><option value="cartoon" disabled={summary.format==='sdf'}>卡通</option><option value="molecular-surface">分子表面</option></select></label><button type="button" disabled={!ready} onClick={()=>controller.current?.reset()}>适配视野</button></>}<div ref={container} data-testid="molecule-canvas" data-ready={ready?'true':'false'} style={{height:440,width:'100%',position:'relative',display:summary?'block':'none'}} /></section>
  return <section aria-label="分子结构工作台" style={{border:'1px solid var(--dsw-alias-border-l1)',borderRadius:10,padding:16,marginTop:16}}>
    <h3>分子结构 · Mol*</h3><p>PDB / mmCIF / SDF · 第一模型或单分子 · Å · 本地三维查看与测距</p>
    <fieldset disabled={busy} style={{border:0,padding:0}}>
      <label>分子资产 <select aria-label="分子资产" value={assetId} onChange={event=>setAssetId(event.target.value)}><option value="">选择已登记结构</option>{assets.map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}</select></label>
      <button disabled={!assetId} onClick={()=>void run('open',{assetId})}>打开结构</button><button onClick={()=>void refresh()}>刷新分子资产</button>
      <div role="tablist" aria-label="已保存分子视图">{viewers.map(view=><button role="tab" aria-selected={viewer?.id===view.id} key={view.id} onClick={()=>void run('read',{viewerId:view.id})}>{assets.find(asset=>asset.id===view.assetId)?.name??'分子视图'} · v{view.version}</button>)}</div>
      {summary&&<><p>{summary.title||'未命名结构'} · {summary.atomCount} 原子 · {summary.chains.length} 链 · 模型 {summary.model}/{summary.modelCount}</p>
        <label>链 <select aria-label="分子链" value={state.chain===null?'__all__':state.chain} onChange={event=>void change({...state,chain:event.target.value==='__all__'?null:event.target.value,residueId:null})}><option value="__all__">全部链</option>{summary.chains.map(chain=><option key={chain.id} value={chain.id}>{chain.id||'(空链标识)'} · {chain.atoms} 原子</option>)}</select></label>
        <label>残基/配体 <select aria-label="分子残基" value={state.residueId??''} onChange={event=>void change({...state,residueId:event.target.value||null})}><option value="">全部残基</option>{residues.map(residue=><option key={residue.id} value={residue.id}>{residue.chain}:{residue.name} {residue.number}{residue.insertionCode}{residue.hetero?' (HET)':''}</option>)}</select></label>
        <label>显示 <select aria-label="分子表示" value={state.representation} onChange={event=>void change({...state,representation:event.target.value as MoleculeViewState['representation']})}><option value="ball-and-stick">球棍</option><option value="cartoon" disabled={summary.format==='sdf'}>卡通（聚合物）</option><option value="molecular-surface">分子表面</option></select></label>
        <button disabled={!ready} onClick={()=>controller.current?.reset()}>适配视野</button>
        <p>拖动旋转，滚轮缩放；选择链或残基可单独查看。卡通表示仅适用于具有主链信息的聚合物。</p>
      </>}
    </fieldset>
    <div ref={container} data-testid="molecule-canvas" data-ready={ready?'true':'false'} style={{height:440,width:'100%',position:'relative',background:'#f7f9fc',display:summary?'block':'none'}} />
    {summary&&<fieldset disabled={busy||!ready} style={{border:0,padding:0}}>
      {(['atomA','atomB'] as const).map((key,index)=><label key={key}>原子 {index+1} <select aria-label={'测距原子 '+(index+1)} value={state[key]??''} onChange={event=>{setState({...state,[key]:event.target.value===''?null:Number(event.target.value)});setMeasurement(undefined)}}><option value="">选择原子</option>{listedAtoms.map(atom=><option key={atom.index} value={atom.index}>{atom.chain}:{atom.residueName}{atom.residueNumber}{atom.insertionCode}/{atom.name} #{atom.serial}{atom.altLoc?' alt '+atom.altLoc:''}</option>)}</select></label>)}
      {atoms.length>5000&&<p>列表仅展示当前选择的前 5000 个原子；请先选择链或残基缩小范围。</p>}
      <button disabled={state.atomA===null||state.atomB===null} onClick={()=>void run('measure',{atomA:state.atomA!,atomB:state.atomB!})}>计算原子距离</button>
      {measurement&&<p aria-label="原子距离">距离：{measurement.distanceAngstrom.toFixed(4)} Å（原始坐标）</p>}
      <button onClick={()=>void run('save')}>保存视角与选择</button><button onClick={()=>void run('export')}>导出图像与结构并登记</button>
      {summary.format==='sdf'&&<p>SDF {summary.sdfEncoding} · {summary.bonds?.length} 条键；仅展示单分子已有坐标，不生成三维构象或调整质子化。V3000 限中性无附加属性子集。</p>}<p>结构视图用于查看与几何测量；已准备的受体可在下方 Vina 面板提交远程对接，计算结果需单独科学复核。</p>
    </fieldset>}
    {busy&&<p role="status">正在处理分子结构…</p>}{message&&<pre role="status" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{message}</pre>}
    {typeof remote.moleculeDocking==='function'&&<MoleculeDockingPanel remote={remote as unknown as Parameters<typeof MoleculeDockingPanel>[0]['remote']} sessionId={sessionId} onPose={id=>void run('open',{assetId:id})} />}
  </section>
}

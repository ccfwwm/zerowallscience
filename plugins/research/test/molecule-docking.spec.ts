import { afterEach, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ResearchStore } from '../../../store/src/index.js'
import { MoleculeDockingService, type DockingWorkflow } from '../src/host/molecule-docking.js'
import { DOCKING_TOOL, validateDockingLigands, validateDockingSettings, type MoleculeDockingRequest } from '../src/shared/molecule-docking.js'
import { moleculeSdf } from './molecule-sdf-fixture.js'
const hash=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex')
const cleanup:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
const preparation='Public synthetic receptor; rigid fixture, not biochemical validation.'

async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'vina-host-'));const store=new ResearchStore(join(root,'db.sqlite'));cleanup.push(async()=>{store.close();await rm(root,{recursive:true,force:true})})
  const project=store.createProject({name:'dock',rootPath:root});const other=store.createProject({name:'other',rootPath:root})
  const receptorBytes=Buffer.from('ATOM      1  C   REC A   1       1.000   2.000   3.000  1.00  0.00     0.000 C\n')
  const receptorPath=join(root,'receptor.pdbqt');const ligandsPath=join(root,'ligands.json')
  await writeFile(receptorPath,receptorBytes);await writeFile(ligandsPath,JSON.stringify([{id:'ethanol',smiles:'CCO',source:'Synthetic reference'}]))
  const receptor=store.createDataAsset({projectId:project.id,name:'receptor',uri:pathToFileURL(receptorPath).href,location:'local',mediaType:'chemical/x-pdbqt'})
  const ligands=store.createDataAsset({projectId:project.id,name:'ligands',uri:pathToFileURL(ligandsPath).href,location:'local',mediaType:'application/json'})
  const input:MoleculeDockingRequest={sessionId:'s',action:'submit',requestId:'dock-test-1',receptorAssetId:receptor.id,ligandAssetId:ligands.id,expectedReceptorVersion:1,expectedLigandVersion:1,preparationSource:preparation,box:{center:[1,2,3],size:[20,20,20]},threads:1}
  const files:Record<string,Buffer>={};let submits=0;let uploads=0;let cancels=0;let id='';let status='running';let corrupt='';let manifestCorrupt=false
  const view=()=>({run_id:id,workflow_id:'biomni',remote_id:'remote-job-1',status})
  const workflow:DockingWorkflow={
    async run(workflowId,parameters){submits++;expect(workflowId).toBe('biomni');expect(parameters.operation).toBe('biomni.call.tool');const args=parameters.arguments as any;expect(args.tool_name).toBe(DOCKING_TOOL)
      const run=store.createRun({projectId:project.id,name:'Vina fixture',command:'research_workflow',workingDirectory:root,status:'running',leaseOwner:'research-workflow',inputs:[{name:'request_id',uri:String(parameters.request_id)}]});id=run.id
      files['worker-request.json']=Buffer.from(JSON.stringify({tool_name:DOCKING_TOOL,arguments:args.arguments}))
      files['tool-result.json']=Buffer.from(JSON.stringify({tool_name:DOCKING_TOOL,result:{engine:'AutoDock Vina',seed:42,receptor_sha256:hash(receptorBytes),box_center:[1,2,3],box_size:[20,20,20],versions:{vina:'1.2.7'},results:[{index:0,smiles:'CCO',affinity_kcal_mol:-1.2}]}}))
      files['vina/receptor-source.pdbqt']=receptorBytes;files['vina/ligand-0-pose-0.sdf']=Buffer.from(moleculeSdf);files['vina/ligand-0-poses.pdbqt']=Buffer.from('MODEL 1\nREMARK VINA RESULT: -1.2 0 0\nATOM      1  C   LIG A   1       0.000   0.000   0.000  1.00  0.00     0.000 C\nATOM      2  C   LIG A   1       1.500   0.000   0.000  1.00  0.00     0.000 C\nATOM      3  O   LIG A   1       2.250   1.250   0.000  1.00  0.00     0.000 OA\nENDMDL\n')
      return view()
    },async status(){return view()},async query(_id,parameters){return parameters.operation==='biomni.search.tools'?{items:[{id:DOCKING_TOOL,available:true,input_schema:{properties:{expected_receptor_sha256:{type:'string'}}}}]}:{outputs:Object.entries(files).map(([path,bytes])=>({path,bytes:bytes.length,sha256:manifestCorrupt?'0'.repeat(64):hash(bytes)}))}},async cancel(){cancels++;status='cancelled';store.updateRun(id,{status:'cancelled'});return view()},
  }
  const transfer=async(args:any)=>{if(args.action==='upload_workspace'){uploads++;expect(await readFile(join(root,args.localPath))).toEqual(receptorBytes);return {}}
    const name=args.remotePath.split('/').slice(2).join('/');const target=join(root,args.localPath);await mkdir(dirname(target),{recursive:true});await writeFile(target,corrupt===name?Buffer.alloc(files[name]!.length):files[name]!);return {}}
  const service=()=>new MoleculeDockingService(store,()=>workflow,transfer)
  return {root,store,project,other,input,files,service,workflow,counts:()=>({submits,uploads,cancels}),complete:()=>{status='succeeded';store.updateRun(id,{status:'succeeded'})},corrupt:(name:string)=>{corrupt=name},badManifest:()=>{manifestCorrupt=true}}
}

it('validates explicit preparation, bounded box/thread budget and ligand identity/source',()=>{
  expect(()=>validateDockingSettings({sessionId:'s',action:'submit',preparationSource:preparation,box:{center:[0,0,0],size:[60,60,60]}})).toThrow('bounded')
  expect(()=>validateDockingSettings({sessionId:'s',action:'submit',preparationSource:preparation,box:{center:[0,0,0],size:[20,20,20]},threads:9})).toThrow('threads')
  expect(()=>validateDockingLigands([{id:'a',smiles:'CCO',source:''}])).toThrow('source')
  expect(()=>validateDockingLigands([{id:'a',smiles:'CCO',source:'x'},{id:'a',smiles:'O',source:'x'}])).toThrow('unique')
})

it('submits once, restores persisted Run, validates downloaded provenance and registers reviewable SDF poses',async()=>{
  const f=await fixture();const service=f.service();const exec={} as any
  const submitted=await service.execute(f.project,f.input,exec);expect(submitted.analysisComplete).toBe(false)
  await service.execute(f.project,f.input,exec);expect(f.counts()).toEqual({submits:1,uploads:1,cancels:0})
  await expect(service.execute(f.project,{...f.input,box:{center:[2,2,3],size:[20,20,20]}},exec)).rejects.toThrow('IDEMPOTENCY_CONFLICT')
  f.complete();const result=await f.service().execute(f.project,{sessionId:'s',action:'status',runId:(submitted.run as any).id},exec)
  expect(result.analysisComplete).toBe(true);expect((result.poses as any[])[0]).toMatchObject({ligandId:'ethanol',affinityKcalMol:-1.2,atomCount:3})
  expect(f.store.listArtifacts(f.project.id)).toHaveLength(5);expect(f.store.listDataAssets(f.project.id)).toHaveLength(3)
  await f.service().execute(f.project,{sessionId:'s',action:'status',runId:(submitted.run as any).id},exec);expect(f.store.listArtifacts(f.project.id)).toHaveLength(5)
  await expect(service.execute(f.other,{sessionId:'s',action:'cancel',runId:(submitted.run as any).id},exec)).rejects.toThrow('outside')
  expect(f.counts().cancels).toBe(0)
})

it('keeps remote computation success separate from artifact acceptance and rejects tampered bytes',async()=>{
  const f=await fixture();const submitted=await f.service().execute(f.project,f.input,{} as any);f.complete();f.corrupt('vina/ligand-0-pose-0.sdf')
  const result=await f.service().execute(f.project,{sessionId:'s',action:'status',runId:(submitted.run as any).id},{} as any)
  expect(result.analysisComplete).toBe(false);expect(result.artifactError).toContain('hash mismatch');expect(f.store.listArtifacts(f.project.id)).toHaveLength(0);expect(f.store.listDataAssets(f.project.id)).toHaveLength(2)
  expect((result.run as any).status).toBe('succeeded')
})

it('rejects changed executed parameters even with a self-consistent remote manifest',async()=>{
  const f=await fixture();const submitted=await f.service().execute(f.project,f.input,{} as any);f.complete()
  const request=JSON.parse(f.files['worker-request.json']!.toString());request.arguments.box_center=[100,100,100];f.files['worker-request.json']=Buffer.from(JSON.stringify(request))
  const result=await f.service().execute(f.project,{sessionId:'s',action:'status',runId:(submitted.run as any).id},{} as any)
  expect(result.analysisComplete).toBe(false);expect(result.artifactError).toContain('invocation differs');expect(f.store.listArtifacts(f.project.id)).toHaveLength(0)
})

it('cancels only the persisted project docking Run using the workflow lifecycle',async()=>{
  const f=await fixture();const submitted=await f.service().execute(f.project,f.input,{} as any)
  const result=await f.service().execute(f.project,{sessionId:'s',action:'cancel',runId:(submitted.run as any).id},{} as any)
  expect((result.run as any).status).toBe('cancelled');expect(f.counts().cancels).toBe(1);expect(f.store.listArtifacts(f.project.id)).toHaveLength(0)
})

it('rejects a different PDBQT pose or score even when both file hashes are valid',async()=>{
  const f=await fixture();const submitted=await f.service().execute(f.project,f.input,{} as any);f.complete()
  f.files['vina/ligand-0-poses.pdbqt']=Buffer.from(f.files['vina/ligand-0-poses.pdbqt']!.toString().replace('0.000   0.000   0.000','9.000   9.000   9.000'))
  const result=await f.service().execute(f.project,{sessionId:'s',action:'status',runId:(submitted.run as any).id},{} as any)
  expect(result.artifactError).toContain('coordinates do not match');expect(result.analysisComplete).toBe(false)
  expect(f.store.listDataAssets(f.project.id)).toHaveLength(2)
})


it('retains snapshot outputs but marks conclusions stale when source bytes change',async()=>{
  const f=await fixture();const submitted=await f.service().execute(f.project,f.input,{} as any);f.complete()
  await writeFile(join(f.root,'ligands.json'),JSON.stringify([{id:'water',smiles:'O',source:'changed'}]))
  const result=await f.service().execute(f.project,{sessionId:'s',action:'status',runId:(submitted.run as any).id},{} as any)
  expect(result.analysisComplete).toBe(true);expect(result.inputsCurrent).toBe(false);expect(result.staleInputs).toEqual(['ligand'])
})

it('blocks a second request after a durable Run exists but its submission acknowledgement was lost',async()=>{
  const f=await fixture();const original=f.workflow.run
  f.workflow.run=async(...args)=>{await original(...args);throw new Error('connection lost after remote submission')}
  await expect(f.service().execute(f.project,f.input,{} as any)).rejects.toThrow('connection lost')
  await expect(f.service().execute(f.project,{...f.input,requestId:'second-request'},{} as any)).rejects.toThrow('already active')
  expect(f.counts().submits).toBe(1)
  const recovered=await f.service().execute(f.project,f.input,{} as any)
  expect((recovered.run as any).status).toBe('running');expect(f.counts().submits).toBe(1)
})

it('accepts the R gateway singleton catalog without weakening the exact capability check',async()=>{
  const f=await fixture();const query=f.workflow.query
  f.workflow.query=async(...args)=>{const response=await query(...args);return Array.isArray(response.items)?{...response,items:response.items[0]}:response}
  const result=await f.service().execute(f.project,f.input,{} as any)
  expect((result.run as any).status).toBe('running');expect(f.counts().submits).toBe(1)
})

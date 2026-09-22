import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { JsonObject, ProjectRecord } from '@zerowallscience/research-store/types'
import type { ToolRunContext } from '@deepseek-ai/dsh-tools'
import { containedFile } from './science-viewer.js'
import { readProjectAsset } from './image-viewer.js'
import type { GeneticWorkflow } from './genetic-runner.js'
import { parseMolecule } from './molecule.js'
import { DOCKING_RUNNER, DOCKING_TOOL, validateDockingLigands, validateDockingSettings, type MoleculeDockingRequest } from '../shared/molecule-docking.js'

export type DockingTransfer = (input: { action: 'upload_workspace' | 'download_workspace'; projectId: string; remotePath: string; localPath: string }, exec: ToolRunContext) => Promise<JsonObject>
export interface DockingWorkflow extends GeneticWorkflow { cancel(id: string, confirm: boolean, exec: ToolRunContext): Promise<JsonObject> }
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])) : value
const fingerprint = (value: unknown) => hash(JSON.stringify(canonical(value)))
const object = (value: unknown): JsonObject => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {}
const json = (value: unknown): JsonObject => JSON.parse(JSON.stringify(value)) as JsonObject
const terminal = new Set(['succeeded', 'failed', 'cancelled', 'timed_out'])

export function validateDockingPoses(text:string,score:number,sdf:Awaited<ReturnType<typeof parseMolecule>>):{models:number;firstPoseAtoms:number}{
  let model=0;let atoms=0;let open=false;let firstScore:number|undefined;const firstAtoms:Array<{element:string;x:number;y:number;z:number}>=[]
  const types:Record<string,string>={A:'C',C:'C',N:'N',NA:'N',NS:'N',O:'O',OA:'O',OS:'O',S:'S',SA:'S',P:'P',H:'H',HD:'H',HS:'H',F:'F',Cl:'Cl',Br:'Br',I:'I',Mg:'Mg',Mn:'Mn',Zn:'Zn',Ca:'Ca',Fe:'Fe'}
  for(const line of text.split(/\r?\n/u)){
    if(line.startsWith('MODEL')){if(open||++model>9||Number(line.slice(5).trim())!==model)throw new Error('Invalid docking PDBQT model sequence.');open=true;atoms=0}
    else if(line.startsWith('REMARK VINA RESULT:')){const values=line.slice(19).trim().split(/\s+/u).map(Number);if(!open||values.length!==3||values.some(v=>!Number.isFinite(v)))throw new Error('Invalid docking PDBQT score.');if(model===1)firstScore=values[0]}
    else if(/^(ATOM  |HETATM)/u.test(line)){
      const xyz=[line.slice(30,38),line.slice(38,46),line.slice(46,54)].map(value=>value.trim()?Number(value):NaN);const atomType=line.trim().split(/\s+/u).at(-1)??'';const element=types[atomType]
      if(!open||line.length<54||xyz.some(v=>!Number.isFinite(v))||!element||++atoms>100000)throw new Error('Invalid docking PDBQT atom.')
      if(model===1)firstAtoms.push({element,x:xyz[0]!,y:xyz[1]!,z:xyz[2]!})
    }else if(line.startsWith('ENDMDL')){if(!open||!atoms)throw new Error('Empty docking PDBQT model.');open=false}
  }
  if(open||!model||firstScore===undefined||Math.abs(firstScore-score)>0.0011)throw new Error('Docking score and completed PDBQT pose do not agree.')
  const spatial=new Map<string,typeof sdf.atoms>()
  for(const atom of sdf.atoms){const key=[atom.element,...[atom.x,atom.y,atom.z].map(v=>Math.floor(v/0.002))].join(':');const bucket=spatial.get(key)??[];bucket.push(atom);spatial.set(key,bucket)}
  const heavyAtoms=firstAtoms.filter(a=>a.element!=='H');const matched=new Set<number>()
  if(heavyAtoms.length!==sdf.atoms.filter(a=>a.element!=='H').length)throw new Error('SDF and PDBQT heavy-atom counts differ.')
  for(const atom of heavyAtoms){
    const [x,y,z]=[atom.x,atom.y,atom.z].map(v=>Math.floor(v/0.002));let found=false
    for(let dx=-1;dx<=1&&!found;dx++)for(let dy=-1;dy<=1&&!found;dy++)for(let dz=-1;dz<=1&&!found;dz++){const match=(spatial.get([atom.element,x!+dx,y!+dy,z!+dz].join(':'))??[]).find(b=>!matched.has(b.index)&&Math.hypot(atom.x-b.x,atom.y-b.y,atom.z-b.z)<0.002);if(match){matched.add(match.index);found=true}}
    if(!found)throw new Error('SDF coordinates do not match the first PDBQT pose.')
  }
  return{models:model,firstPoseAtoms:firstAtoms.length}
}

/** A bounded application adapter over existing durable research_workflow/r_files. */
export class MoleculeDockingService {
  private readonly pending = new Map<string, Promise<JsonObject>>()
  constructor(private readonly store: ResearchStore, private readonly workflow: () => GeneticWorkflow | undefined, private readonly transfer: DockingTransfer) {}
  private async locked(key: string, work: () => Promise<JsonObject>): Promise<JsonObject> {
    const previous = this.pending.get(key);if (previous) { await previous;return this.locked(key, work) }
    const task = work();this.pending.set(key, task);try { return await task } finally { this.pending.delete(key) }
  }
  async execute(project: ProjectRecord, input: MoleculeDockingRequest, exec: ToolRunContext): Promise<JsonObject> {
    if (input.action === 'list') {
      const requests = new Set(this.store.listAuditEvents(project.id).filter(e => e.action === 'molecule-docking.requested').map(e => e.details.requestId))
      return json({ assets: this.store.listDataAssets(project.id), runs: this.store.listRuns(project.id).filter(run => run.leaseOwner==='research-workflow' && run.inputs.some(i=>i.name==='request_id'&&requests.has(i.uri))), runner: DOCKING_RUNNER })
    }
    if (input.action === 'submit') return this.locked(`${project.id}:submit`, () => this.submit(project, input, exec))
    if (!['status', 'cancel'].includes(input.action)) throw new Error('Unsupported docking action.')
    return this.locked(`${project.id}:run:${input.runId}`, async () => {
      const run = this.store.getRun(input.runId ?? '')
      if (!run || run.projectId !== project.id || run.leaseOwner !== 'research-workflow') throw new Error('Docking Run is outside the active project.')
      const requestId = run.inputs.find(item => item.name === 'request_id')?.uri
      const event = this.store.listAuditEvents(project.id).find(e => e.action === 'molecule-docking.requested' && e.details.requestId === requestId)
      if (!event || typeof requestId !== 'string') throw new Error('No persisted docking request is bound to this Run.')
      const snapshot = await this.readSnapshot(project, requestId, String(event.details.fingerprint))
      const workflow = this.workflow();if (!workflow) throw new Error('Connect rdatalinux research_workflow first.')
      const remote = input.action === 'cancel' ? await (workflow as DockingWorkflow).cancel(run.id, true, exec) : await workflow.status(run.id, exec)
      return this.collect(project, snapshot, remote, exec)
    })
  }
  private async directory(project: ProjectRecord, requestId: string): Promise<string> {
    let directory = await realpath(project.rootPath)
    for (const part of ['.zerowall', 'molecule-docking', hash(requestId)]) { directory = join(directory, part);await mkdir(directory, { recursive: true });await containedFile(project.rootPath, directory) }
    return directory
  }
  private async readSnapshot(project: ProjectRecord, requestId: string, expected: string): Promise<JsonObject> {
    const directory = await this.directory(project, requestId)
    const bytes = await readProjectAsset(project, { uri: pathToFileURL(join(directory, 'request.json')).href }, 2 * 1024 ** 2)
    const snapshot = object(JSON.parse(bytes.toString('utf8')))
    if (fingerprint(snapshot) !== expected || snapshot.requestId !== requestId || snapshot.runner !== DOCKING_RUNNER) throw new Error('Saved docking request fingerprint mismatch.')
    return snapshot
  }
  private async submit(project: ProjectRecord, input: MoleculeDockingRequest, exec: ToolRunContext): Promise<JsonObject> {
    if (!input.requestId || !/^[A-Za-z0-9_.:-]{1,128}$/u.test(input.requestId)) throw new Error('Docking requires a stable request ID.')
    const settings = validateDockingSettings(input)
    const assets = this.store.listDataAssets(project.id)
    const receptor = assets.find(a => a.id === input.receptorAssetId);const ligandsAsset = assets.find(a => a.id === input.ligandAssetId)
    if (!receptor || !ligandsAsset || receptor.location !== 'local' || ligandsAsset.location !== 'local' || !receptor.uri.startsWith('file:') || !ligandsAsset.uri.startsWith('file:')) throw new Error('Choose registered local prepared receptor and ligand JSON assets in this project.')
    if (receptor.version !== input.expectedReceptorVersion || ligandsAsset.version !== input.expectedLigandVersion) throw new Error('Docking asset revision changed; reload the prepared inputs.')
    if (!/\.pdbqt$/iu.test(receptor.uri) || !/\.json$/iu.test(ligandsAsset.uri)) throw new Error('Docking requires a prepared .pdbqt receptor and a ligand .json asset.')
    const receptorBytes = await readProjectAsset(project, receptor, 16 * 1024 ** 2);const ligandBytes = await readProjectAsset(project, ligandsAsset, 1024 ** 2)
    if (!/^(ATOM  |HETATM)/mu.test(receptorBytes.toString('utf8')) || /^(ROOT|BRANCH|MODEL)/mu.test(receptorBytes.toString('utf8'))) throw new Error('Receptor must be a rigid prepared PDBQT with atoms, not ligand torsion trees or multiple models.')
    const ligands = validateDockingLigands(JSON.parse(ligandBytes.toString('utf8')))
    const receptorSha256 = hash(receptorBytes);const remoteProject = `zw-${hash(project.rootPath).slice(0, 24)}`
    const snapshot = json({ runner: DOCKING_RUNNER, requestId: input.requestId, remoteProject, receptorAssetId: receptor.id, receptorVersion: receptor.version, receptorSha256, ligandAssetId: ligandsAsset.id, ligandVersion: ligandsAsset.version, ligandSha256: hash(ligandBytes), ligands, ...settings, seed: 42, exhaustiveness: 8, poses: 9, timeoutMs: 1800000, operation: DOCKING_TOOL })
    const expected = fingerprint(snapshot)
    const prior = this.store.listAuditEvents(project.id).find(e => e.action === 'molecule-docking.requested' && e.details.requestId === input.requestId)
    if (prior && prior.details.fingerprint !== expected) throw new Error('IDEMPOTENCY_CONFLICT: docking inputs differ for this request ID.')
    const existing = this.store.listRuns(project.id).find(r => r.leaseOwner === 'research-workflow' && r.inputs.some(i => i.name === 'request_id' && i.uri === input.requestId))
    if(existing&&!prior)throw new Error('IDEMPOTENCY_CONFLICT: request ID already belongs to another workflow.')
    const workflow = this.workflow();if (!workflow) throw new Error('Connect rdatalinux research_workflow first.')
    const directory = await this.directory(project, input.requestId);const requestPath = join(directory, 'request.json')
    const text = JSON.stringify(snapshot, null, 2)
    try { await writeFile(requestPath, text, { flag: 'wx' }) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await readFile(requestPath, 'utf8') !== text) throw new Error('IDEMPOTENCY_CONFLICT: saved docking request changed.') }
    if (!prior) this.store.recordAuditEvent(project.id, 'molecule-docking.requested', { requestId: input.requestId, fingerprint: expected })
    if (existing) return this.collect(project, snapshot, await workflow.status(existing.id, exec), exec)
    const catalog=await workflow.query('biomni',{operation:'biomni.search.tools',arguments:{q:'docking_autodock_vina',limit:10}},exec)
    // The R gateway may simplify a singleton JSON array to its only object.
    const capability=(Array.isArray(catalog.items)?catalog.items.map(object):[object(catalog.items)]).find(item=>item.id===DOCKING_TOOL)
    if(!capability||capability.available!==true||!object(object(capability.input_schema).properties).expected_receptor_sha256)throw new Error('The connected Vina catalog is missing the verified receptor-hash contract or runtime dependencies. No docking was submitted.')
    const requestedIds=new Set(this.store.listAuditEvents(project.id).filter(e=>e.action==='molecule-docking.requested').map(e=>e.details.requestId))
    const pendingRuns = this.store.listRuns(project.id).filter(r=>r.leaseOwner==='research-workflow'&&!terminal.has(r.status)&&r.inputs.some(i=>i.name==='request_id'&&requestedIds.has(i.uri)))
    if (pendingRuns.length) throw new Error('One docking run is already active in this project; inspect its status before submitting another.')
    const receptorCopy = join(directory, 'receptor-source.pdbqt')
    try { await writeFile(receptorCopy, receptorBytes, { flag: 'wx' }) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || hash(await readFile(receptorCopy)) !== receptorSha256) throw new Error('Prepared receptor snapshot changed.') }
    const remotePath = `zerowall-docking-inputs/${receptorSha256}.pdbqt`
    await this.transfer({ action: 'upload_workspace', projectId: remoteProject, remotePath, localPath: relative(project.rootPath, receptorCopy).replaceAll('\\', '/') }, exec)
    const remote = await workflow.run('biomni', { operation: 'biomni.call.tool', request_id: input.requestId, arguments: { project_id: remoteProject, tool_name: DOCKING_TOOL, arguments: { smiles_list: ligands.map(l => l.smiles), receptor_pdb_file: '../../' + remotePath, box_center: settings.box.center, box_size: settings.box.size, ncpu: settings.threads, expected_receptor_sha256: receptorSha256 }, timeout_ms: 1800000, confirm: true } }, exec)
    const run = this.store.getRun(String(remote.run_id))
    if (!run || run.projectId !== project.id || run.leaseOwner !== 'research-workflow' || !run.inputs.some(i => i.name === 'request_id' && i.uri === input.requestId)) throw new Error('Docking backend did not return the expected persisted Run.')
    this.store.recordAuditEvent(project.id, 'molecule-docking.submitted', { requestId: input.requestId, fingerprint: expected, runId: run.id, remoteId: remote.remote_id ?? null })
    return this.collect(project, snapshot, remote, exec)
  }
  private async collect(project: ProjectRecord, snapshot: JsonObject, remote: JsonObject, exec: ToolRunContext): Promise<JsonObject> {
    const run = this.store.getRun(String(remote.run_id))
    if (!run || run.projectId !== project.id || remote.workflow_id !== 'biomni') throw new Error('Unexpected docking workflow Run.')
    const assets=this.store.listDataAssets(project.id);const staleInputs:string[]=[]
    for(const [kind,maxBytes] of [['receptor',16*1024**2],['ligand',1024**2]] as const){
      const asset=assets.find(a=>a.id===snapshot[kind+'AssetId'])
      try{if(!asset||asset.version!==snapshot[kind+'Version']||hash(await readProjectAsset(project,asset,maxBytes))!==snapshot[kind+'Sha256'])staleInputs.push(kind)}catch{staleInputs.push(kind)}
    }
    const base = json({ run, runner: DOCKING_RUNNER, remoteId: remote.remote_id ?? null, inputSnapshot:snapshot,analysisComplete: false, needsReview: true, inputsCurrent:staleInputs.length===0,staleInputs,error: remote.error ?? null })
    if (!terminal.has(run.status) || run.status !== 'succeeded') return base
    if (typeof remote.remote_id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/u.test(remote.remote_id)) return { ...base, artifactError: 'No valid Biomni job ID; reconcile before retrying.' }
    try {
      const envelope = await this.workflow()!.query('biomni', { operation: 'biomni.get.job.manifest', arguments: { job_id: remote.remote_id } }, exec)
      const outer = object(envelope.manifest ?? envelope)
      const files = (Array.isArray(outer.outputs) ? outer.outputs : []).map(object)
      const directory = await this.directory(project, String(snapshot.requestId))
      const fetch = async (name: string, maxBytes: number) => {
        const entries = files.filter(f => f.path === name);const entry = entries[0]
        if (entries.length !== 1 || !entry || typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || Number(entry.bytes) < 1 || Number(entry.bytes) > maxBytes) throw new Error('Missing or invalid docking manifest entry: ' + name)
        const local = `${run.id}-${entry.sha256}-${name.replaceAll('/', '-')}`;const path = join(directory, local)
        await this.transfer({ action: 'download_workspace', projectId: String(snapshot.remoteProject), remotePath: `biomni/${remote.remote_id}/${name}`, localPath: relative(project.rootPath, path).replaceAll('\\', '/') }, exec)
        const contained = await containedFile(project.rootPath, path);if ((await stat(contained)).size !== entry.bytes) throw new Error('Docking artifact size mismatch: ' + name)
        const bytes = await readFile(contained);if (hash(bytes) !== entry.sha256) throw new Error('Docking artifact hash mismatch: ' + name)
        return { name, path: contained, sha256: entry.sha256, bytes }
      }
      const resultFile = await fetch('tool-result.json', 2 * 1024 ** 2)
      const invocationFile=await fetch('worker-request.json',2*1024**2)
      const invocation=object(JSON.parse(invocationFile.bytes.toString('utf8')));const actualArgs=object(invocation.arguments)
      if(invocation.tool_name!==DOCKING_TOOL||actualArgs.expected_receptor_sha256!==snapshot.receptorSha256||actualArgs.receptor_pdb_file!==`../../zerowall-docking-inputs/${snapshot.receptorSha256}.pdbqt`||fingerprint(actualArgs.smiles_list)!==fingerprint((snapshot.ligands as JsonObject[]).map(l=>l.smiles))||fingerprint(actualArgs.box_center)!==fingerprint(object(snapshot.box).center)||fingerprint(actualArgs.box_size)!==fingerprint(object(snapshot.box).size)||actualArgs.ncpu!==snapshot.threads)throw new Error('Executed Biomni invocation differs from the saved docking request.')
      const wrapper = object(JSON.parse(resultFile.bytes.toString('utf8')));const result = object(wrapper.result)
      if (wrapper.tool_name !== DOCKING_TOOL || result.engine !== 'AutoDock Vina' || result.seed !== snapshot.seed || result.receptor_sha256 !== snapshot.receptorSha256 || fingerprint(result.box_center) !== fingerprint(object(snapshot.box).center) || fingerprint(result.box_size) !== fingerprint(object(snapshot.box).size)) throw new Error('Docking result does not match the submitted tool, receptor, seed or box.')
      const ligands = Array.isArray(snapshot.ligands) ? snapshot.ligands.map(object) : []
      const rows = Array.isArray(result.results) ? result.results.map(object) : []
      if (rows.length !== ligands.length) throw new Error('Docking result count differs from submitted ligands.')
      const downloaded = [resultFile,invocationFile,await fetch('vina/receptor-source.pdbqt', 16 * 1024 ** 2)]
      if (downloaded[2]!.sha256 !== snapshot.receptorSha256) throw new Error('Executed receptor snapshot hash differs from source.')
      const poses: JsonObject[] = []
      const validatedPoses:Array<{index:number;file:Awaited<ReturnType<typeof fetch>>;atomCount:number}>=[]
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]!
        if (row.index !== i || row.smiles !== ligands[i]!.smiles || typeof row.affinity_kcal_mol !== 'number' || !Number.isFinite(row.affinity_kcal_mol)) throw new Error('Invalid docking ligand index, SMILES or score.')
        const poseFile = await fetch(`vina/ligand-${i}-pose-0.sdf`, 16 * 1024 ** 2)
        const summary = await parseMolecule(poseFile.bytes.toString('utf8'), 'sdf', poseFile.sha256)
        const pdbqt=await fetch(`vina/ligand-${i}-poses.pdbqt`, 16 * 1024 ** 2)
        validateDockingPoses(pdbqt.bytes.toString('utf8'),row.affinity_kcal_mol,summary)
        downloaded.push(poseFile,pdbqt)
        validatedPoses.push({index:i,file:poseFile,atomCount:summary.atomCount})
      }
      for(const {index:i,file:poseFile,atomCount} of validatedPoses){const existing=this.store.listDataAssets(project.id).find(a=>a.uri===pathToFileURL(poseFile.path).href&&a.checksum===poseFile.sha256);const asset=existing??this.store.createDataAsset({projectId:project.id,name:String(ligands[i]!.id)+' · Vina pose 1',uri:pathToFileURL(poseFile.path).href,location:'local',mediaType:'chemical/x-mdl-sdfile',checksum:poseFile.sha256,checksumAlgorithm:'sha256'});poses.push({ligandId:ligands[i]!.id!,affinityKcalMol:rows[i]!.affinity_kcal_mol!,atomCount,assetId:asset.id})}
      const artifacts = downloaded.map(file => this.store.listArtifacts(project.id).find(a => a.runId === run.id && a.checksum === file.sha256 && a.name === file.name) ?? this.store.createArtifact({ projectId: project.id, runId: run.id, name: file.name, uri: pathToFileURL(file.path).href, mediaType: file.name.endsWith('.sdf') ? 'chemical/x-mdl-sdfile' : file.name.endsWith('.json') ? 'application/json' : 'chemical/x-pdbqt', checksum: file.sha256, metadata: { runner: DOCKING_RUNNER, requestId: snapshot.requestId!, needsReview: true, receptorSourceSha256: snapshot.receptorSha256!, ligandSourceSha256: snapshot.ligandSha256! } }))
      this.store.recordAuditEvent(project.id, 'molecule-docking.collected', { runId: run.id, requestId: snapshot.requestId!, artifactIds: artifacts.map(a => a.id) })
      return json({ ...base, analysisComplete: true, poses, artifacts, runtime: result.versions ?? {}, allowedClaim: 'Computational docking poses and model scores under the submitted preparation/box only; not measured affinity, mechanism or clinical benefit.' })
    } catch (error) {
      this.store.recordAuditEvent(project.id, 'molecule-docking.artifact-rejected', { runId: run.id, requestId: snapshot.requestId!, error: String(error) })
      return { ...base, artifactError: String(error) }
    }
  }
}

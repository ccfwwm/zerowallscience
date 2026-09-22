import { createHash, randomUUID } from 'node:crypto'
import { open, mkdir, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import sharp from 'sharp'
import { parseCifText } from 'molstar/lib/commonjs/mol-io/reader/cif/text/parser.js'
import { parseSdf } from 'molstar/lib/commonjs/mol-io/reader/sdf/parser.js'
import { formalChargeMapper } from 'molstar/lib/commonjs/mol-io/reader/mol/parser.js'
import type { ResearchStore } from '@zerowallscience/research-store'
import type { DataAssetRecord, ProjectRecord, ViewerSessionRecord, JsonObject } from '@zerowallscience/research-store/types'
import { containedFile } from './science-viewer.js'
import type { MoleculeRequest, MoleculeResponse } from '../shared/types.js'
import { INITIAL_MOLECULE_STATE, type MoleculeAtom, type MoleculeCamera, type MoleculeMeasurement, type MoleculeRuntime, type MoleculeSummary, type MoleculeViewState } from '../shared/molecule.js'

const RUNNER = 'zerowall-molecule/7.0.0-1'
const MAX_BYTES = 16 * 1024 ** 2
const MAX_ATOMS = 100_000
const clean = (value: string | undefined): string => value === '.' || value === '?' || value == null ? '' : value.trim()
const residueKey = (chain: string, number: string, insertion: string, name: string): string => JSON.stringify([chain,number,insertion,name])
const hash = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex')

export async function parseMolecule(text: string, format: MoleculeSummary['format'], sourceSha256 = hash(text)): Promise<MoleculeSummary> {
  const atoms: MoleculeAtom[] = []; const models = new Set<string>(); let firstModel = ''; let title = ''
  let sdfEncoding: MoleculeSummary['sdfEncoding']; let bonds: MoleculeSummary['bonds']
  const add = (model: string, atom: Omit<MoleculeAtom,'index'|'residueId'>): void => {
    models.add(model); firstModel ||= model
    if (model !== firstModel) return
    if (atoms.length >= MAX_ATOMS) throw new Error('Interactive structures are limited to 100,000 atoms in the first model.')
    if (![atom.x,atom.y,atom.z].every(value => Number.isFinite(value) && Math.abs(value) < 1e7)) throw new Error('Structure has invalid Cartesian atom coordinates.')
    if (!atom.name || !atom.residueName || !atom.residueNumber || !atom.serial) throw new Error('Structure atom identifiers are incomplete.')
    atoms.push({ ...atom,index:atoms.length,residueId:residueKey(atom.chain,atom.residueNumber,atom.insertionCode,atom.residueName) })
  }
  if (format === 'pdb') {
    let model = '1'
    for (const line of text.split(/\r?\n/u)) {
      if (line.startsWith('TITLE ')) title += clean(line.slice(10)) + ' '
      if (line.startsWith('MODEL ')) model = clean(line.slice(10,14)) || String(models.size+1)
      if (!/^(?:ATOM  |HETATM)/u.test(line)) continue
      if (line.length < 54 || [line.slice(30,38),line.slice(38,46),line.slice(46,54)].some(value => !value.trim())) throw new Error('PDB atom coordinate columns are missing.')
      add(model,{ serial:clean(line.slice(6,11)),name:clean(line.slice(12,16)),altLoc:clean(line.slice(16,17)),residueName:clean(line.slice(17,20)),chain:clean(line.slice(21,22)),residueNumber:clean(line.slice(22,26)),insertionCode:clean(line.slice(26,27)),element:clean(line.slice(76,78)),hetero:line.startsWith('HETATM'),x:Number(line.slice(30,38)),y:Number(line.slice(38,46)),z:Number(line.slice(46,54)) })
    }
  } else if (format === 'sdf') {
    const expected=validateSdfEnvelope(text);sdfEncoding=expected.encoding
    const parsed=await parseSdf(text).run()
    if(parsed.isError)throw new Error('SDF parse failed: '+parsed.message)
    if(parsed.result.compounds.length!==1)throw new Error('Provide one SDF molecule per registered asset; multi-record SDF selection is not yet supported.')
    const mol=parsed.result.compounds[0]!.molFile;title=mol.title
    if(mol.atoms.count!==expected.atoms||mol.bonds.count!==expected.bonds)throw new Error('SDF parsed counts do not match the declared molecule.')
    const charges:number[]=Array.from({length:mol.atoms.count},(_,i)=>mol.formalCharges.atomIdx.rowCount?0:formalChargeMapper(mol.atoms.formal_charge.value(i)))
    for(let i=0;i<(sdfEncoding==='V2000'?mol.formalCharges.atomIdx.rowCount:0);i++){
      const index=mol.formalCharges.atomIdx.value(i)-1;const charge=mol.formalCharges.charge.value(i)
      if(!Number.isInteger(index)||index<0||index>=charges.length||!Number.isInteger(charge)||Math.abs(charge)>15)throw new Error('Invalid SDF formal charge.')
      charges[index]=charge
    }
    for(let i=0;i<mol.atoms.count;i++)add('1',{serial:String(i+1),name:mol.atoms.type_symbol.value(i),element:mol.atoms.type_symbol.value(i),chain:'A',residueName:'MOL',residueNumber:'1',insertionCode:'',altLoc:'',hetero:true,x:mol.atoms.x.value(i),y:mol.atoms.y.value(i),z:mol.atoms.z.value(i),formalCharge:charges[i]!})
    bonds=[];const seen=new Set<string>()
    for(let i=0;i<mol.bonds.count;i++){
      const a=mol.bonds.atomIdxA.value(i)-1;const b=mol.bonds.atomIdxB.value(i)-1;const order=mol.bonds.order.value(i)
      if(!Number.isInteger(a)||!Number.isInteger(b)||a<0||b<0||a>=atoms.length||b>=atoms.length||a===b||![1,2,3,4].includes(order))throw new Error('Invalid or unsupported SDF bond.')
      const key=[Math.min(a,b),Math.max(a,b)].join(':');if(seen.has(key))throw new Error('Duplicate SDF bond.');seen.add(key);bonds.push({atomA:a,atomB:b,order})
    }
  } else {
    const parsed = await parseCifText(text).run()
    if (parsed.isError) throw new Error('mmCIF parse failed: '+parsed.message)
    const blocks = parsed.result.blocks.filter(block => block.categories.atom_site?.rowCount)
    if (blocks.length !== 1) throw new Error('Provide one mmCIF data block with an atom_site table.')
    const block = blocks[0]!; const category = block.categories.atom_site!
    const field = (name: string, row: number, fallback?: string): string => clean(category.getField(name)?.str(row)) || (fallback ? clean(category.getField(fallback)?.str(row)) : '')
    title = clean(block.categories.struct?.getField('title')?.str(0)) || block.header
    for (let i=0;i<category.rowCount;i++) {
      const x = field('Cartn_x',i); const y = field('Cartn_y',i); const z = field('Cartn_z',i)
      if (!x || !y || !z) throw new Error('mmCIF atom coordinates are missing.')
      add(field('pdbx_PDB_model_num',i)||'1',{ serial:field('id',i),name:field('auth_atom_id',i,'label_atom_id'),element:field('type_symbol',i),chain:field('auth_asym_id',i,'label_asym_id'),residueName:field('auth_comp_id',i,'label_comp_id'),residueNumber:field('auth_seq_id',i,'label_seq_id'),insertionCode:field('pdbx_PDB_ins_code',i),altLoc:field('label_alt_id',i),hetero:field('group_PDB',i)==='HETATM',x:Number(x),y:Number(y),z:Number(z) })
    }
  }
  if (!atoms.length) throw new Error('No coordinate atoms were found in this structure.')
  const residues = new Map<string,MoleculeSummary['residues'][number]>()
  for (const atom of atoms) {
    const residue = residues.get(atom.residueId) ?? { id:atom.residueId,chain:atom.chain,name:atom.residueName,number:atom.residueNumber,insertionCode:atom.insertionCode,hetero:atom.hetero,atoms:0 }
    residue.atoms++; residues.set(atom.residueId,residue)
  }
  const chainMap=new Map<string,MoleculeSummary['chains'][number]>()
  for(const atom of atoms) { const chain=chainMap.get(atom.chain)??{ id:atom.chain,atoms:0,residues:0 };chain.atoms++;chainMap.set(atom.chain,chain) }
  for(const residue of residues.values()) chainMap.get(residue.chain)!.residues++
  const chains=[...chainMap.values()]
  return { format,sourceSha256,title:title.trim().slice(0,500),atomCount:atoms.length,model:firstModel,modelCount:models.size,atoms,residues:[...residues.values()],chains,...(sdfEncoding?{sdfEncoding,bonds:bonds!}:{}),notes:['Coordinates are in ångströms; measurements use source atom coordinates without alignment or periodic boundaries.',...(format==='sdf'?['One SDF record is shown with deposited bonds. A 2D drawing is not a prepared 3D conformer; hydrogens, stereochemistry, protonation and docking suitability are not inferred.','SDF properties and stereochemical/isotope annotations remain in the original exported source; this viewer is not a chemical structure preparation engine.']:['The first deposited model and asymmetric unit are shown; biological assembly and other models are not inferred.','Alternative locations are retained with explicit identifiers. Surface and inferred bonds are visualization, not docking or mechanism evidence.']),...(models.size>1 ? [`Only model ${firstModel} is measured; ${models.size} models are present in the source.`] : [])] }
}

function validateSdfEnvelope(text:string):{encoding:'V2000'|'V3000';atoms:number;bonds:number}{
  const lines=text.replace(/\r\n/gu,'\n').split('\n');const delimiters=lines.flatMap((line,i)=>line.trim()==='$$$$'?[i]:[])
  if(delimiters.length!==1||lines.slice(delimiters[0]!+1).some(line=>line.trim()))throw new Error('Provide one terminated SDF molecule per asset; multi-record SDF is unsupported.')
  const end=lines.indexOf('M  END');if(end<4||end>=delimiters[0]!)throw new Error('SDF requires a complete M  END molecule block.')
  const counts=lines[3]??'';const number=(v:string):number=>{if(!/^\s*\d+\s*$/u.test(v))throw new Error('Invalid SDF count or index.');return Number(v)}
  if(counts.trim().endsWith('V2000')){
    const atoms=number(counts.slice(0,3));const bonds=number(counts.slice(3,6))
    if(atoms<1||atoms>999||bonds>999||end<4+atoms+bonds)throw new Error('Incomplete SDF V2000 atom or bond block.')
    for(const line of lines.slice(4,4+atoms)){
      if(line.length<34||![line.slice(0,10),line.slice(10,20),line.slice(20,30)].every(v=>v.trim()&&Number.isFinite(Number(v)))||!/^\s*[A-Z][a-z]?\s*$/u.test(line.slice(31,34)))throw new Error('Invalid SDF V2000 atom coordinates or element.')
    }
    for(const line of lines.slice(4+atoms,4+atoms+bonds)){number(line.slice(0,3));number(line.slice(3,6));number(line.slice(6,9))}
    return{encoding:'V2000',atoms,bonds}
  }
  if(counts.trim().endsWith('V3000')){
    // Mol* 5.11 does not parse V3000 charges/properties. Accept its verified
    // neutral, sequential-index subset and reject unsupported fields explicitly.
    if(lines[4]!=='M  V30 BEGIN CTAB'||!/^M  V30 COUNTS \d+ \d+ 0 0 0$/u.test(lines[5]??''))throw new Error('Unsupported SDF V3000 CTAB/counts layout.')
    const parts=lines[5]!.split(' ');const atoms=Number(parts[4]);const bonds=Number(parts[5])
    if(atoms<1||atoms>MAX_ATOMS||bonds>4*MAX_ATOMS||lines[6]!=='M  V30 BEGIN ATOM'||lines[7+atoms]!=='M  V30 END ATOM'||lines[8+atoms]!=='M  V30 BEGIN BOND'||lines[9+atoms+bonds]!=='M  V30 END BOND'||lines[10+atoms+bonds]!=='M  V30 END CTAB'||end!==11+atoms+bonds)throw new Error('Incomplete SDF V3000 atom or bond block.')
    for(let i=0;i<atoms;i++){
      const match=/^M  V30 (\d+) ([A-Z][a-z]?) (\S+) (\S+) (\S+) 0$/u.exec(lines[7+i]??'')
      if(!match||Number(match[1])!==i+1||!match.slice(3,6).every(v=>Number.isFinite(Number(v))))throw new Error('V3000 requires sequential atoms and neutral coordinates without optional properties; convert charged/annotated molecules to V2000 first.')
    }
    for(let i=0;i<bonds;i++)if(!new RegExp('^M  V30 '+(i+1)+' [1-4] \\d+ \\d+$','u').test(lines[9+atoms+i]??''))throw new Error('Unsupported SDF V3000 bond or optional property.')
    return{encoding:'V3000',atoms,bonds}
  }
  throw new Error('SDF counts line must declare V2000 or V3000.')
}

export function validateMoleculeState(input: unknown, summary: MoleculeSummary): MoleculeViewState {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Molecule view state is required.')
  const value = input as Record<string,unknown>
  if (value.chain !== null && (typeof value.chain !== 'string' || !summary.chains.some(chain => chain.id===value.chain))) throw new Error('Selected chain is not in the first model.')
  if (value.residueId !== null && (typeof value.residueId !== 'string' || !summary.residues.some(residue => residue.id===value.residueId && (value.chain===null || residue.chain===value.chain)))) throw new Error('Selected residue is not in the selected chain.')
  if (!['ball-and-stick','cartoon','molecular-surface'].includes(String(value.representation))) throw new Error('Unsupported molecule representation.')
  if(summary.format==='sdf'&&value.representation==='cartoon')throw new Error('Small-molecule SDF does not have a polymer backbone for cartoon representation.')
  for (const key of ['atomA','atomB']) if (value[key]!==null && (!Number.isSafeInteger(value[key]) || Number(value[key])<0 || Number(value[key])>=summary.atoms.length)) throw new Error('Measurement atom is outside the first model.')
  let camera: MoleculeCamera | null = null
  if (value.camera!==null) {
    const c = value.camera as Record<string,unknown>
    if (!c || !['perspective','orthographic'].includes(String(c.mode)) || typeof c.clipFar!=='boolean') throw new Error('Invalid molecular camera.')
    for (const key of ['position','target','up']) if (!Array.isArray(c[key]) || c[key].length!==3 || !c[key].every((n:unknown) => typeof n==='number' && Number.isFinite(n) && Math.abs(n)<1e8)) throw new Error('Invalid molecular camera vector.')
    for (const key of ['radius','radiusMax','fov','fog','minNear','minFar']) if (typeof c[key]!=='number' || !Number.isFinite(c[key]) || Number(c[key])<0 || Number(c[key])>1e8) throw new Error('Invalid molecular camera scalar.')
    if (Number(c.radius)<=0 || Number(c.radiusMax)<=0 || Number(c.fov)<=0 || Number(c.fov)>=Math.PI || Math.hypot(...c.up as [number,number,number])<1e-8) throw new Error('Degenerate molecular camera.')
    camera = Object.fromEntries(['mode','position','target','up','radius','radiusMax','fov','fog','clipFar','minNear','minFar'].map(key => [key,c[key]])) as unknown as MoleculeCamera
  }
  return { chain:value.chain as string|null,residueId:value.residueId as string|null,representation:value.representation as MoleculeViewState['representation'],camera,atomA:value.atomA as number|null,atomB:value.atomB as number|null }
}

export function measureMolecule(summary: MoleculeSummary, a: unknown, b: unknown): MoleculeMeasurement {
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || Number(a)<0 || Number(b)<0 || Number(a)>=summary.atoms.length || Number(b)>=summary.atoms.length) throw new Error('Choose two atoms in the first model.')
  const atomA=summary.atoms[Number(a)]!; const atomB=summary.atoms[Number(b)]!
  return { atomA,atomB,distanceAngstrom:Math.hypot(atomA.x-atomB.x,atomA.y-atomB.y,atomA.z-atomB.z),convention:'Euclidean distance in source Cartesian coordinates; first model only',sourceSha256:summary.sourceSha256 }
}

export class MoleculeService {
  private runtimePromise: Promise<MoleculeRuntime> | undefined
  constructor(private readonly store: ResearchStore) {}
  async execute(project: ProjectRecord, request: MoleculeRequest): Promise<MoleculeResponse> {
    if (request.action==='runtime') return { runtime:await this.runtime() }
    if (!['open','read','save','measure','export'].includes(request.action)) throw new Error('Unsupported molecule action.')
    let viewer: ViewerSessionRecord | undefined
    if (request.action!=='open') {
      viewer=this.store.listViewerSessions(project.id).find(item => item.id===request.viewerId && item.tool==='molecule')
      if (!viewer) throw new Error('Molecule viewer is not in the active project.')
      if (request.action!=='read' && request.expectedVersion!==viewer.version) throw new Error('Molecule viewer revision conflict: current '+viewer.version+'.')
    }
    const asset=this.store.listDataAssets(project.id).find(item => item.id===(viewer?.assetId??request.assetId))
    if (!asset) throw new Error('Molecule asset is not in the active project.')
    const input=await this.read(project,asset)
    if (viewer && viewer.state.sourceSha256!==input.summary.sourceSha256) throw new Error('Molecule source changed; reopen to preserve the old view and measurements.')
    const loadedViewer=viewer
    if (loadedViewer && this.store.listViewerSessions(project.id).find(item=>item.id===loadedViewer.id)?.version!==loadedViewer.version) throw new Error('Molecule viewer revision changed while reading; reload the view.')
    if (!viewer) viewer=this.store.createViewerSession({ projectId:project.id,assetId:asset.id,tool:'molecule',state:JSON.parse(JSON.stringify({ ...INITIAL_MOLECULE_STATE,sourceSha256:input.summary.sourceSha256 })) as JsonObject })
    const state=validateMoleculeState(request.state??viewer.state,input.summary)
    if (request.action==='save' || request.action==='export') viewer=this.store.updateViewerSession(project.id,viewer.id,{ expectedVersion:viewer.version,state:JSON.parse(JSON.stringify({ ...state,sourceSha256:input.summary.sourceSha256 })) as JsonObject })
    const measurement=request.action==='measure' || state.atomA!==null && state.atomB!==null ? measureMolecule(input.summary,request.atomA??state.atomA,request.atomB??state.atomB) : undefined
    const response: MoleculeResponse={ viewer,summary:input.summary,state,...(measurement?{ measurement }:{}),...(request.action==='open'||request.action==='read'?{ source:input.text }:{}) }
    if (request.action!=='export') return response
    let png:Buffer|undefined
    if (request.pngBase64!==undefined) {
      if (typeof request.pngBase64!=='string' || request.pngBase64.length>12*1024**2 || !/^[A-Za-z0-9+/]*={0,2}$/u.test(request.pngBase64)) throw new Error('Invalid molecule PNG export.')
      const supplied=Buffer.from(request.pngBase64,'base64'); const meta=await sharp(supplied,{ limitInputPixels:4_194_304 }).metadata()
      if (meta.format!=='png') throw new Error('Molecule screenshot must be PNG.')
      png=await sharp(supplied,{ limitInputPixels:4_194_304 }).png().toBuffer()
    }
    const root=await realpath(project.rootPath); let base=root
    for (const part of ['.zerowall','science-exports']) { const path=join(base,part); await mkdir(path,{ recursive:true });base=await containedFile(root,path) }
    const directory=join(base,randomUUID());await mkdir(directory)
    try {
      const sourceFile=input.summary.format==='pdb'?'source.pdb':input.summary.format==='sdf'?'source.sdf':'source.cif'
      await writeFile(join(directory,sourceFile),input.bytes,{ flag:'wx' })
      if (png) await writeFile(join(directory,'view.png'),png,{ flag:'wx' })
      const result={ format:'zerowall-molecular-view/v1',runner:RUNNER,sourceAssetId:asset.id,sourceSha256:input.summary.sourceSha256,sourceFile,viewerId:viewer.id,viewerVersion:viewer.version,state,measurement:measurement??null,summary:{ ...input.summary,atoms:undefined },screenshot:png?{ file:'view.png',sha256:hash(png),origin:'client Molstar rendering; Host validates PNG but cannot independently attest the rendered content' }:null,notes:input.summary.notes }
      const text=JSON.stringify(result,null,2)+'\n';const resultPath=join(directory,'result.json');await writeFile(resultPath,text,{ flag:'wx' })
      const artifact=this.store.createArtifact({ projectId:project.id,name:'Molecular structure view and distance',uri:pathToFileURL(resultPath).href,mediaType:'application/json',checksum:hash(text),metadata:{ runner:RUNNER,sourceAssetId:asset.id,sourceSha256:input.summary.sourceSha256,viewerId:viewer.id,viewerVersion:viewer.version,structureUri:pathToFileURL(join(directory,sourceFile)).href,...(png?{ imageUri:pathToFileURL(join(directory,'view.png')).href }:{}),needsReview:true } })
      return { ...response,artifact }
    } catch(error) { await rm(directory,{ recursive:true,force:true });throw error }
  }
  private async read(project:ProjectRecord,asset:DataAssetRecord):Promise<{ text:string;bytes:Buffer;summary:MoleculeSummary }> {
    if (asset.location!=='local'||!asset.uri.startsWith('file:')) throw new Error('Materialize remote structures through r_files before viewing.')
    const path=await containedFile(project.rootPath,fileURLToPath(asset.uri))
    if (!/\.(pdb|cif|mmcif|sdf)$/iu.test(path)) throw new Error('Molecule viewer accepts PDB, mmCIF and single-record SDF coordinate files.')
    const handle=await open(path,'r')
    try {
      const info=await handle.stat();if (!info.isFile()||info.size<1||info.size>MAX_BYTES) throw new Error('Molecule input must be a regular file up to 16 MiB.')
      const buffer=Buffer.alloc(info.size+1);let length=0
      while(length<buffer.length) { const read=await handle.read(buffer,length,buffer.length-length,length);if(!read.bytesRead)break;length+=read.bytesRead }
      const after=await handle.stat();if(length!==info.size||after.size!==info.size||after.mtimeMs!==info.mtimeMs||after.ctimeMs!==info.ctimeMs)throw new Error('Molecule source changed during reading.')
      const bytes=buffer.subarray(0,length);const sha256=hash(bytes)
      if(asset.checksum && (!asset.checksumAlgorithm||createHash(asset.checksumAlgorithm).update(bytes).digest('hex')!==asset.checksum.toLowerCase()))throw new Error('Molecule source checksum differs from the registered asset.')
      const text=new TextDecoder('utf-8',{ fatal:true }).decode(bytes)
      return { text,bytes,summary:await parseMolecule(text,/\.pdb$/iu.test(path)?'pdb':/\.sdf$/iu.test(path)?'sdf':'mmcif',sha256) }
    } finally { await handle.close() }
  }
  private runtime():Promise<MoleculeRuntime> {
    return this.runtimePromise??=this.readRuntime().catch(error=>{ this.runtimePromise=undefined;throw error })
  }
  private async readRuntime():Promise<MoleculeRuntime> {
    const candidates=[new URL('./molecule-runtime.js',import.meta.url),new URL('../../lib/molecule-runtime.js',import.meta.url)]
    for(const candidate of candidates) {
      const info=await stat(candidate).catch(()=>undefined);if(!info)continue
      if(!info.isFile()||info.size>8*1024**2)throw new Error('Molecule local runtime exceeds the 8 MiB bound.')
      const source=await readFile(candidate,'utf8');const manifest=JSON.parse(await readFile(new URL('./molecule-runtime.manifest.json',candidate),'utf8')) as {version:string;size:number;sha256:string}
      if(manifest.version!=='5.11.0'||manifest.size!==Buffer.byteLength(source)||manifest.sha256!==hash(source))throw new Error('Local Molstar runtime does not match its build manifest.')
      return { version:'5.11.0',source,bytes:Buffer.byteLength(source),sha256:hash(source) }
    }
    throw new Error('Local Molstar runtime is missing; rebuild the research plugin.')
  }
}

import { afterEach, expect, it } from 'vitest'
import { mkdtemp,readFile,rm,writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath,pathToFileURL } from 'node:url'
import { ResearchStore } from '../../../store/src/index.js'
import { MoleculeService,parseMolecule,measureMolecule,validateMoleculeState } from '../src/host/molecule.js'
import { INITIAL_MOLECULE_STATE } from '../src/shared/molecule.js'
import { moleculeCif,moleculePdb } from './molecule-fixture.js'
import { moleculeSdf,moleculeSdfV3000 } from './molecule-sdf-fixture.js'
const cleanup:Array<()=>Promise<void>>=[]
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close()})
it('parses real PDB columns and Molstar mmCIF multiline/quoted tokens with matching coordinates',async()=>{
  const pdb=await parseMolecule(moleculePdb,'pdb');const cif=await parseMolecule(moleculeCif.replace(' LIG B C1 1',' LIG B "C1" 1'),'mmcif')
  expect(cif.title).toContain('No biological interpretation');expect(pdb.atomCount).toBe(10);expect(cif.atomCount).toBe(10)
  expect(cif.atoms.map(({x,y,z,name,chain})=>({x,y,z,name,chain}))).toEqual(pdb.atoms.map(({x,y,z,name,chain})=>({x,y,z,name,chain})))
  expect(measureMolecule(cif,0,8).distanceAngstrom).toBe(5)
  expect(cif.chains).toEqual([{id:'A',atoms:8,residues:2},{id:'B',atoms:2,residues:1}])
})
it('rejects malformed coordinates, multiple CIF blocks, invalid selections and atom indices',async()=>{
  await expect(parseMolecule(moleculeCif.replace('0 4 3','? 4 3'),'mmcif')).rejects.toThrow('coordinates')
  await expect(parseMolecule(moleculeCif+moleculeCif.replace('data_zerowall_reference','data_second'),'mmcif')).rejects.toThrow('one mmCIF')
  const summary=await parseMolecule(moleculePdb,'pdb')
  expect(()=>measureMolecule(summary,-1,3)).toThrow('two atoms')
  expect(()=>validateMoleculeState({...INITIAL_MOLECULE_STATE,chain:'Z'},summary)).toThrow('chain')
})
it('preserves first-model coordinates and flags other deposited models',async()=>{
  const atoms=moleculePdb.split('\n').filter(line=>/^(ATOM|HETATM)/u.test(line)).join('\n')
  const summary=await parseMolecule('MODEL        1\n'+atoms+'\nENDMDL\nMODEL        2\n'+atoms+'\nENDMDL','pdb')
  expect(summary.atomCount).toBe(10);expect(summary.modelCount).toBe(2);expect(summary.notes.join(' ')).toContain('Only model 1')
})
it('restores selected chains and exports original structure, distance and provenance with revision isolation',async()=>{
  const root=await mkdtemp(join(tmpdir(),'molecule-'));const store=new ResearchStore(join(root,'store.sqlite'));cleanup.push(async()=>{store.close();await rm(root,{recursive:true,force:true})})
  const project=store.createProject({name:'molecule',rootPath:root});const path=join(root,'reference.cif');await writeFile(path,moleculeCif)
  const asset=store.createDataAsset({projectId:project.id,name:'reference.cif',uri:pathToFileURL(path).href,location:'local',mediaType:'chemical/x-mmcif'})
  const service=new MoleculeService(store);const opened=await service.execute(project,{sessionId:'s',action:'open',assetId:asset.id})
  const state={...INITIAL_MOLECULE_STATE,chain:'B',atomA:0,atomB:8}
  const saved=await service.execute(project,{sessionId:'s',action:'save',viewerId:opened.viewer!.id,expectedVersion:1,state})
  const restored=await new MoleculeService(store).execute(project,{sessionId:'s',action:'read',viewerId:saved.viewer!.id})
  expect(restored.state?.chain).toBe('B');expect(restored.measurement?.distanceAngstrom).toBe(5)
  await expect(service.execute(project,{sessionId:'s',action:'save',viewerId:saved.viewer!.id,expectedVersion:1,state})).rejects.toThrow('revision conflict')
  const exported=await service.execute(project,{sessionId:'s',action:'export',viewerId:saved.viewer!.id,expectedVersion:2,state})
  const result=JSON.parse(await readFile(fileURLToPath(exported.artifact!.uri),'utf8'));expect(result.measurement.distanceAngstrom).toBe(5);expect(result.sourceSha256).toBe(opened.summary!.sourceSha256)
  expect(await readFile(fileURLToPath(String(exported.artifact!.metadata.structureUri)),'utf8')).toBe(moleculeCif)
  const other=store.createProject({name:'other',rootPath:root});await expect(service.execute(other,{sessionId:'s',action:'read',viewerId:saved.viewer!.id})).rejects.toThrow('active project')
  await writeFile(path,moleculeCif+'# changed\n');await expect(service.execute(project,{sessionId:'s',action:'read',viewerId:saved.viewer!.id})).rejects.toThrow('source changed')
})

it('parses one SDF V2000 or neutral V3000 record with deposited bonds and identical coordinates',async()=>{
  const v2=await parseMolecule(moleculeSdf,'sdf');const v3=await parseMolecule(moleculeSdfV3000,'sdf')
  expect(v2).toMatchObject({format:'sdf',sdfEncoding:'V2000',atomCount:3,modelCount:1,bonds:[{atomA:0,atomB:1,order:1},{atomA:1,atomB:2,order:1}]})
  expect(v3.atoms).toEqual(v2.atoms);expect(v3.bonds).toEqual(v2.bonds)
  expect(measureMolecule(v2,0,1).distanceAngstrom).toBe(1.5)
  expect(()=>validateMoleculeState({...INITIAL_MOLECULE_STATE,representation:'cartoon'},v2)).toThrow('polymer backbone')
  const charged=await parseMolecule(moleculeSdf.replace('M  END','M  CHG  1   3  -1\nM  END'),'sdf')
  expect(charged.atoms.map(atom=>atom.formalCharge)).toEqual([0,0,-1])
})

it('rejects multiple SDF records, missing termination, bad coordinates/bonds and unsupported V3000 properties',async()=>{
  for(const source of [moleculeSdf+moleculeSdf,moleculeSdf.replace('$$$$',''),moleculeSdf.replace('M  END','M  E'),moleculeSdf.replace('    0.0000','       NaN'),moleculeSdf.replace('  1  2  1','  1  4  1'),moleculeSdfV3000.replace('3 O 2.2500 1.2500 0.0000 0','3 O 2.2500 1.2500 0.0000 0 CHG=-1')])await expect(parseMolecule(source,'sdf')).rejects.toThrow()
})

it('registers SDF source, persists selection and exports byte-identical original chemistry',async()=>{
  const root=await mkdtemp(join(tmpdir(),'molecule-sdf-'));const store=new ResearchStore(join(root,'store.sqlite'));cleanup.push(async()=>{store.close();await rm(root,{recursive:true,force:true})})
  const project=store.createProject({name:'sdf',rootPath:root});const path=join(root,'reference.sdf');await writeFile(path,moleculeSdf)
  const asset=store.createDataAsset({projectId:project.id,name:'reference.sdf',uri:pathToFileURL(path).href,location:'local',mediaType:'chemical/x-mdl-sdfile'})
  const service=new MoleculeService(store);const opened=await service.execute(project,{sessionId:'s',action:'open',assetId:asset.id})
  const state={...INITIAL_MOLECULE_STATE,chain:'A',atomA:0,atomB:1}
  const exported=await service.execute(project,{sessionId:'s',action:'export',viewerId:opened.viewer!.id,expectedVersion:1,state})
  const result=JSON.parse(await readFile(fileURLToPath(exported.artifact!.uri),'utf8'));expect(result.sourceFile).toBe('source.sdf');expect(result.measurement.distanceAngstrom).toBe(1.5)
  expect(await readFile(fileURLToPath(String(exported.artifact!.metadata.structureUri)),'utf8')).toBe(moleculeSdf)
  const restored=await new MoleculeService(store).execute(project,{sessionId:'s',action:'read',viewerId:opened.viewer!.id});expect(restored.state?.chain).toBe('A')
})

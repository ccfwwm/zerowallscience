// Built independently as a local IIFE; the research client loads it only on use.
import { PluginContext } from 'molstar/lib/mol-plugin/context.js'
import { MolScriptBuilder as MS } from 'molstar/lib/mol-script/language/builder.js'
import { Color } from 'molstar/lib/mol-util/color/index.js'
import type { MoleculeViewState, MoleculeCamera } from '../shared/molecule.js'
import type { StateObjectSelector } from 'molstar/lib/mol-state/index.js'

export interface MoleculeController { apply(state: MoleculeViewState): Promise<void>; camera(): MoleculeCamera; png(): Promise<string>; reset(): void; dispose(): void }
export interface MoleculeRuntimeApi { version: '5.11.0'; create(container: HTMLDivElement, source: string, format: 'pdb'|'mmcif'|'sdf', state: MoleculeViewState): Promise<MoleculeController> }
declare global { interface Window { __ZeroWallMoleculeRuntime?: MoleculeRuntimeApi } }

async function create(container: HTMLDivElement, source: string, format: 'pdb'|'mmcif'|'sdf', state: MoleculeViewState): Promise<MoleculeController> {
  const plugin=new PluginContext({ behaviors:[],canvas3d:{ renderer:{ backgroundColor:Color(0xf7f9fc) },camera:{ helper:{ axes:{ name:'off',params:{} } } } } })
  let component:StateObjectSelector|undefined;let disposed=false
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-label','Molstar 分子三维视图');canvas.style.cssText='display:block;width:100%;height:100%;touch-action:none'
  container.appendChild(canvas)
  const resize=new ResizeObserver(()=>plugin.canvas3d?.requestResize())
  try {
    await plugin.init()
    if (!await plugin.initViewerAsync(canvas,container)) throw new Error('WebGL 初始化失败；当前设备不能显示 Molstar 三维结构。')
    resize.observe(container)
    const data=await plugin.builders.data.rawData({ data:source,label:'Registered local structure' })
    const trajectory=await plugin.builders.structure.parseTrajectory(data,format)
    const model=await plugin.builders.structure.createModel(trajectory,{ modelIndex:0 })
    const structure=await plugin.builders.structure.createStructure(model,{ name:'model',params:{} })
    const apply=async (next:MoleculeViewState):Promise<void>=>{
      if(disposed)return
      const camera=plugin.canvas3d?.camera.getSnapshot()
      if(component)await plugin.state.data.build().delete(component.ref).commit()
      const tests:Record<string,unknown>={}
      if(next.chain!==null)tests['chain-test']=MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(),next.chain])
      if(next.residueId!==null){
        const [chain,number,insertion,name]=JSON.parse(next.residueId) as string[]
        tests['residue-test']=MS.core.logic.and([
          MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_asym_id(),chain!]),
          MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_seq_id(),Number(number)]),
          MS.core.rel.eq([MS.struct.atomProperty.macromolecular.pdbx_PDB_ins_code(),insertion!]),
          MS.core.rel.eq([MS.struct.atomProperty.macromolecular.auth_comp_id(),name!]),
        ])
      }
      component=await plugin.builders.structure.tryCreateComponentFromExpression(structure,MS.struct.generator.atomGroups(tests),'zerowall-selection')
      if(!component)throw new Error('当前链或残基无法映射到 Molstar 结构。')
      await plugin.builders.structure.representation.addRepresentation(component,{ type:next.representation,color:'element-symbol',typeParams:{ quality:'medium' } })
      plugin.canvas3d?.commit(true)
      if(next.camera)plugin.canvas3d?.camera.setState(next.camera as any,0)
      else if(camera)plugin.canvas3d?.camera.setState(camera,0)
      plugin.canvas3d?.requestDraw()
    }
    await apply(state)
    if(state.camera)plugin.canvas3d?.camera.setState(state.camera as any,0)
    else plugin.managers.camera.reset(undefined,0)
    return {
      apply,
      camera:()=>JSON.parse(JSON.stringify(plugin.canvas3d!.camera.getSnapshot())) as MoleculeCamera,
      png:async()=>{
        const helper=plugin.helpers.viewportScreenshot
        if(!helper)throw new Error('Molstar image export is unavailable.')
        helper.behaviors.values.next({ ...helper.behaviors.values.value,resolution:{ name:'custom',params:{ width:1200,height:800 } },format:{ name:'png',params:{} } })
        return (await helper.getImageDataUri()).split(',')[1]!
      },
      reset:()=>plugin.managers.camera.reset(undefined,0),
      dispose:()=>{disposed=true;resize.disconnect();plugin.dispose();canvas.remove()},
    }
  } catch(error){resize.disconnect();plugin.dispose();canvas.remove();throw error}
}
window.__ZeroWallMoleculeRuntime={ version:'5.11.0',create }

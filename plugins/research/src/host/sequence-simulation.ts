import type { SequenceSimulationOptions, SequenceSimulationResult } from '../shared/sequence.js'
import type { NucleotideRecord } from './sequence.js'

const rc=(sequence:string)=>Array.from(sequence).reverse().map(base=>({A:'T',C:'G',G:'C',T:'A'}[base]!)).join('')
const dna=(value:unknown,label:string,max=100000):string=>{if(typeof value!=='string'||!value.length||value.length>max||!/^[ACGT]+$/u.test(value))throw new Error(`${label} requires unambiguous A/C/G/T DNA, at most ${max} bases.`);return value}
const positions=(sequence:string,query:string):number[]=>{const result:number[]=[];for(let pos=sequence.indexOf(query);pos>=0;pos=sequence.indexOf(query,pos+1)){result.push(pos);if(result.length>100)throw new Error('More than 100 matching sites; repetitive sequence is not a unique simulation input.')}return result}
const integer=(value:number|undefined,fallback:number,min:number,max:number,label:string)=>{const result=value??fallback;if(!Number.isSafeInteger(result)||result<min||result>max)throw new Error(`${label} must be an integer in ${min}–${max}.`);return result}
type Result={sequence:string;simulation:SequenceSimulationResult;notes:string[]}

export function simulatePcr(template:string,recordIndex:number,selectionStart:number,options:SequenceSimulationOptions):Result{
  dna(template,'PCR template')
  const forward=dna(options.forwardPrimer?.toUpperCase(),'Forward primer',120);const reverse=dna(options.reversePrimer?.toUpperCase(),'Reverse primer',120)
  const forwardLength=integer(options.forwardAnnealLength,forward.length,12,forward.length,'Forward annealing length')
  const reverseLength=integer(options.reverseAnnealLength,reverse.length,12,reverse.length,'Reverse annealing length')
  const maxProduct=integer(options.maxProductLength,100000,24,100000,'Maximum PCR product length')
  const topology=options.templateTopology??'linear';if(!['linear','circular'].includes(topology))throw new Error('Invalid template topology.')
  if(forwardLength>template.length||reverseLength>template.length)throw new Error('Primer annealing region is longer than the template.')
  const sequence=topology==='circular'?template+template:template
  const forwardHits=positions(sequence,forward.slice(-forwardLength)).filter(pos=>pos<template.length)
  const reverseHits=positions(sequence,rc(reverse.slice(-reverseLength))).filter(pos=>pos<template.length)
  if(forwardHits.length!==1||reverseHits.length!==1)throw new Error(`PCR requires unique oriented primer sites; forward=${forwardHits.length}, reverse=${reverseHits.length}. No single product was chosen.`)
  const start=forwardHits[0]!;let reverseStart=reverseHits[0]!
  if(topology==='circular'&&reverseStart<start)reverseStart+=template.length
  const end=reverseStart+reverseLength
  if(reverseStart<start+forwardLength||end-start>template.length)throw new Error('Primer sites do not define a nonoverlapping inward product within one template traversal.')
  const forwardTail=forward.slice(0,-forwardLength)||'';const reverseTail=reverse.slice(0,-reverseLength)||''
  const product=forwardTail+sequence.slice(start,end)+rc(reverseTail)
  if(product.length>maxProduct)throw new Error('PCR product exceeds the configured size limit.')
  return{sequence:product,simulation:{algorithm:'zerowall-exact-pcr/7.0.0-1',parameters:{...options,forwardPrimer:forward,reversePrimer:reverse,forwardAnnealLength:forwardLength,reverseAnnealLength:reverseLength,templateTopology:topology,maxProductLength:maxProduct},topology:'linear',sourceRecordIndices:[recordIndex],productLength:product.length,junctions:[],primerSites:[{primer:'forward',start:start+selectionStart,end:(start+forwardLength-1)%template.length+selectionStart,strand:1,annealLength:forwardLength,tail:forwardTail},{primer:'reverse',start:reverseHits[0]!+selectionStart,end:(reverseHits[0]!+reverseLength-1)%template.length+selectionStart,strand:-1,annealLength:reverseLength,tail:reverseTail}]},notes:['精确匹配的定向双引物模拟，要求各自退火位点唯一；输入引物均按 5′→3′ 提供，退火长度之外的 5′ 尾序列进入产物。','不预测错配扩增、退火温度、引物二聚体或实际产率；唯一的定向位点不等于全基因组特异性。环状模板最多遍历一圈，跨原点坐标末端可小于起点。']}
}

function inputFragments(records:NucleotideRecord[],options:SequenceSimulationOptions){
  if(!Array.isArray(options.fragments)||options.fragments.length<2||options.fragments.length>12)throw new Error('Assembly requires an explicit ordered list of 2–12 records and their orientations.')
  const seen=new Set<number>();let total=0
  return options.fragments.map(fragment=>{
    const record=records[fragment.recordIndex]
    if(!Number.isSafeInteger(fragment.recordIndex)||!record||seen.has(fragment.recordIndex)||typeof fragment.reverseComplement!=='boolean')throw new Error('Assembly record indices must be valid and unique with explicit orientations.')
    if('circular'in record&&record.circular===true)throw new Error('Assembly inputs must be linear fragments; digest or linearize circular records explicitly.')
    seen.add(fragment.recordIndex);const sequence=dna(record.sequence,record.name);total+=sequence.length;if(total>500000)throw new Error('Assembly inputs exceed 500,000 total bases.')
    return{...fragment,sequence:fragment.reverseComplement?rc(sequence):sequence,sourceLength:sequence.length}
  })
}
function overlaps(a:string,b:string,min:number):number[]{const matches:number[]=[];for(let n=min;n<=Math.min(1000,a.length-1,b.length-1);n++)if(a.endsWith(b.slice(0,n)))matches.push(n);return matches}

export function simulateGibson(records:NucleotideRecord[],options:SequenceSimulationOptions):Result{
  const fragments=inputFragments(records,options);const minimum=integer(options.minimumOverlap,20,12,80,'Minimum Gibson overlap')
  const topology=options.productTopology??'circular';if(!['linear','circular'].includes(topology))throw new Error('Invalid product topology.')
  const junctions:SequenceSimulationResult['junctions']=[];const lengths:number[]=[]
  for(let i=0;i<fragments.length;i++){
    const expected=i+1<fragments.length?i+1:topology==='circular'?0:-1
    if(expected<0)continue
    const candidates=fragments.flatMap((b,j)=>i===j?[]:overlaps(fragments[i]!.sequence,b.sequence,minimum).map(length=>({j,length})))
    if(candidates.length!==1||candidates[0]!.j!==expected)throw new Error(`Gibson junction after record ${fragments[i]!.recordIndex+1} is missing, ambiguous or contradicts the selected order.`)
    const length=candidates[0]!.length;lengths.push(length);junctions.push({fromRecord:fragments[i]!.recordIndex,toRecord:fragments[expected]!.recordIndex,overlap:fragments[expected]!.sequence.slice(0,length),length})
  }
  for(let i=0;i<fragments.length;i++){const incoming=i?lengths[i-1]!:topology==='circular'?lengths.at(-1)!:0;const outgoing=lengths[i]??0;if(incoming+outgoing>=fragments[i]!.sequence.length)throw new Error('Overlaps consume an entire fragment; a unique assembly cannot be assigned.')}
  let product=fragments[0]!.sequence
  for(let i=1;i<fragments.length;i++)product+=fragments[i]!.sequence.slice(lengths[i-1])
  if(topology==='circular')product=product.slice(0,-lengths.at(-1)!)
  return{sequence:product,simulation:{algorithm:'zerowall-exact-gibson/7.0.0-1',parameters:{...options,minimumOverlap:minimum,productTopology:topology},topology,sourceRecordIndices:fragments.map(f=>f.recordIndex),productLength:product.length,junctions,fragments:fragments.map(({sequence,...fragment})=>({...fragment,retainedStart:1,retainedEnd:sequence.length}))},notes:['使用显式顺序和方向，仅在所选片段之间检查唯一的末端精确同源；重叠长度范围为最小值至 1,000 bp，拒绝缺失或多解接头。','不自动反转、重排或修补序列，不预测体外组装效率、错配容忍或未提供片段的竞争组装。圆形产物以第一个定向片段起点定坐标，接头重叠仅保留一次。']}
}

export function simulateGoldenGate(records:NucleotideRecord[],options:SequenceSimulationOptions):Result{
  const fragments=inputFragments(records,options);const enzyme=options.enzyme??'BsaI';const motif=({BsaI:'GGTCTC',BsmBI:'CGTCTC'} as const)[enzyme]
  if(!motif)throw new Error('Golden Gate currently supports BsaI and BsmBI only.')
  if(options.productTopology!==undefined&&options.productTopology!=='circular')throw new Error('Golden Gate currently requires a closed circular assembly.')
  const prepared=fragments.map(fragment=>{
    const forward=positions(fragment.sequence,motif);const reverse=positions(fragment.sequence,rc(motif))
    if(forward.length!==1||reverse.length!==1||forward[0]!>=reverse[0]!)throw new Error(`Record ${fragment.recordIndex+1} requires exactly two inward-facing ${enzyme} sites without internal sites.`)
    const start=forward[0]!+7;const end=reverse[0]!-5
    if(end<=start+4||end+4>fragment.sequence.length)throw new Error('Type IIS cut sites do not enclose a valid insert.')
    return{...fragment,start,end,body:fragment.sequence.slice(start,end),left:fragment.sequence.slice(start,start+4),right:fragment.sequence.slice(end,end+4)}
  })
  const overhangs=prepared.map(f=>f.left)
  if(new Set(overhangs).size!==overhangs.length||overhangs.some((s,i)=>s===rc(s)||overhangs.some((b,j)=>i!==j&&s===rc(b))))throw new Error('Golden Gate overhangs must be distinct, nonpalindromic and without reverse-complement alternatives.')
  const junctions=prepared.map((f,i)=>{const next=prepared[(i+1)%prepared.length]!;if(f.right!==next.left)throw new Error(`Incompatible Golden Gate overhang after record ${f.recordIndex+1}.`);return{fromRecord:f.recordIndex,toRecord:next.recordIndex,overlap:f.right,length:4}})
  const product=prepared.map(f=>f.body).join('');const circular=product+product.slice(0,5)
  if(positions(circular,motif).some(p=>p<product.length)||positions(circular,rc(motif)).some(p=>p<product.length))throw new Error('Assembled product recreates an enzyme recognition site, including a circular junction.')
  return{sequence:product,simulation:{algorithm:'zerowall-type-iis/7.0.0-1',parameters:{...options,enzyme,productTopology:'circular'},topology:'circular',sourceRecordIndices:prepared.map(f=>f.recordIndex),productLength:product.length,junctions,fragments:prepared.map(f=>({recordIndex:f.recordIndex,reverseComplement:f.reverseComplement,sourceLength:f.sourceLength,retainedStart:f.start+1,retainedEnd:f.end,leftOverhang:f.left,rightOverhang:f.right}))},notes:['限定 BsaI/BsmBI、向内双位点及 4 nt 的 5′ 黏性末端；所选片段的顺序和方向必须形成唯一兼容圆形产物。保留区间坐标针对定向后的片段。','末端字符串均按产物正链方向表示；下游片段提供接头的正链四碱基，不重复拼入。拒绝内部/重建识别位点、自互补或可交叉配对的末端。','不模拟酶活性、甲基化、连接效率或非理想错配连接；此计算结果不证明实际构建成功。']}
}

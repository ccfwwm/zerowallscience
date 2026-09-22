import {expect,it} from 'vitest'
import {analyzeSequence} from '../src/host/sequence.js'
import {simulatePcr,simulateGibson,simulateGoldenGate} from '../src/host/sequence-simulation.js'
import {pcrTemplate,pcrForward,pcrReverse,pcrExpected,gibsonSequences,gibsonExpected,goldenSequences,goldenExpected,makeRecords,fixtureReverseComplement as rc} from './sequence-simulation-fixture.js'
const pcr={forwardPrimer:pcrForward,reversePrimer:pcrReverse,forwardAnnealLength:20,reverseAnnealLength:20}
const fragments=[{recordIndex:0,reverseComplement:false},{recordIndex:1,reverseComplement:false},{recordIndex:2,reverseComplement:false}]

it('produces exact PCR DNA including both specified 5-prime tails and source coordinates',()=>{
  const result=simulatePcr(pcrTemplate,0,101,pcr)
  expect(result.sequence).toBe(pcrExpected);expect(result.simulation.productLength).toBe(192)
  expect(result.simulation.primerSites).toMatchObject([{start:111,end:130,strand:1,tail:'GGGAAA'},{start:271,end:290,strand:-1,tail:'TTTCCC'}])
})
it('supports a circular origin-spanning PCR product while keeping it linear',()=>{
  const options={forwardPrimer:pcrTemplate.slice(170,190),reversePrimer:rc(pcrTemplate.slice(10,30)),templateTopology:'circular' as const}
  const result=simulatePcr(pcrTemplate,0,1,options)
  expect(result.sequence).toBe(pcrTemplate.slice(170)+pcrTemplate.slice(0,30));expect(result.simulation.topology).toBe('linear')
  expect(()=>simulatePcr(pcrTemplate,0,1,{...options,templateTopology:'linear'})).toThrow('inward')
})
it('rejects repetitive/absent/ambiguous binding, RNA, short annealing and excess PCR size',()=>{
  expect(()=>simulatePcr(pcrTemplate+pcrTemplate,0,1,pcr)).toThrow('unique')
  expect(()=>simulatePcr(pcrTemplate+'N',0,1,pcr)).toThrow('unambiguous')
  expect(()=>simulatePcr(pcrTemplate,0,1,{...pcr,forwardAnnealLength:6})).toThrow('annealing')
  expect(()=>simulatePcr(pcrTemplate,0,1,{...pcr,maxProductLength:100})).toThrow('size limit')
  expect(()=>analyzeSequence(makeRecords([pcrTemplate]),'pcr',0,2,220,undefined,3,{...pcr,templateTopology:'circular'})).toThrow('entire source')
})
it('builds unique oriented Gibson circle and linear products without duplicating overlaps',()=>{
  const circular=simulateGibson(makeRecords(gibsonSequences),{fragments,minimumOverlap:20})
  expect(circular.sequence).toBe(gibsonExpected);expect(circular.simulation.junctions.map(j=>j.length)).toEqual([24,24,24])
  const linear=simulateGibson(makeRecords(gibsonSequences.slice(0,2)),{fragments:fragments.slice(0,2),minimumOverlap:20,productTopology:'linear'})
  expect(linear.sequence).toBe(gibsonSequences[0]!+gibsonSequences[1]!.slice(24))
  const reversed=[gibsonSequences[0]!,rc(gibsonSequences[1]!),gibsonSequences[2]!]
  expect(simulateGibson(makeRecords(reversed),{fragments:fragments.map((f,i)=>({...f,reverseComplement:i===1}))}).sequence).toBe(gibsonExpected)
})
it('rejects Gibson reordered/duplicate/repetitive or circular source fragments',()=>{
  expect(()=>simulateGibson(makeRecords(gibsonSequences),{fragments:[fragments[0]!,fragments[2]!,fragments[1]!]})).toThrow('contradicts')
  expect(()=>simulateGibson(makeRecords(gibsonSequences),{fragments:[fragments[0]!,fragments[0]!]})).toThrow('unique')
  expect(()=>simulateGibson(makeRecords(['A'.repeat(80),'A'.repeat(80)]),{fragments:fragments.slice(0,2)})).toThrow('ambiguous')
  expect(()=>simulateGibson([{...makeRecords(gibsonSequences)[0]!,circular:true},...makeRecords(gibsonSequences).slice(1)],{fragments})).toThrow('linear fragments')
})
it('simulates BsaI and BsmBI digestion and unique overhang ligation into a circular product',()=>{
  const input={fragments:fragments.slice(0,2)}
  const result=simulateGoldenGate(makeRecords(goldenSequences),input)
  expect(result.sequence).toBe(goldenExpected);expect(result.simulation.junctions.map(j=>j.overlap)).toEqual(['GCTT','AATG'])
  expect(result.simulation.fragments?.[0]).toMatchObject({retainedStart:8,retainedEnd:55,leftOverhang:'AATG',rightOverhang:'GCTT'})
  expect(simulateGoldenGate(makeRecords(goldenSequences.map(s=>s.replaceAll('GGTCTC','CGTCTC').replaceAll('GAGACC','GAGACG'))),{...input,enzyme:'BsmBI'}).sequence).toBe(goldenExpected)
})
it('rejects incompatible, self-complementary and internal Type IIS sites',()=>{
  const input={fragments:fragments.slice(0,2)}
  expect(()=>simulateGoldenGate(makeRecords([goldenSequences[0]!.replace('GCTTA','CTTAA'),goldenSequences[1]!]),input)).toThrow('Incompatible')
  expect(()=>simulateGoldenGate(makeRecords(goldenSequences.map(s=>s.replaceAll('AATG','ATAT'))),input)).toThrow('nonpalindromic')
  expect(()=>simulateGoldenGate(makeRecords([goldenSequences[0]!.replace('AATG','AATGGGTCTC'),goldenSequences[1]!]),input)).toThrow('exactly two')
})

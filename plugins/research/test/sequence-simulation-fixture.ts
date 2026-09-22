const rc=(s:string)=>Array.from(s).reverse().map(x=>({A:'T',C:'G',G:'C',T:'A'}[x])).join('')
function sequence(seed:number,length:number){let value=seed;let result='';for(let i=0;i<length;i++){value=(Math.imul(value,1664525)+1013904223)>>>0;result+='ACGT'[(value>>>24)%4]}return result}
export const pcrTemplate=sequence(913,220)
export const pcrForward='GGGAAA'+pcrTemplate.slice(10,30)
export const pcrReverse='TTTCCC'+rc(pcrTemplate.slice(170,190))
export const pcrExpected='GGGAAA'+pcrTemplate.slice(10,190)+rc('TTTCCC')
export const overlaps=[sequence(441,24),sequence(789,24),sequence(325,24)]
export const cores=[sequence(967,50),sequence(537,60),sequence(235,70)]
export const gibsonSequences=[overlaps[2]!+cores[0]!+overlaps[0]!,overlaps[0]!+cores[1]!+overlaps[1]!,overlaps[1]!+cores[2]!+overlaps[2]!]
export const gibsonExpected=overlaps[2]!+cores[0]!+overlaps[0]!+cores[1]!+overlaps[1]!+cores[2]!
export const goldenCoreA=sequence(874,44);export const goldenCoreB=sequence(928,48)
export const goldenSequences=['GGTCTC'+'A'+'AATG'+goldenCoreA+'GCTT'+'A'+'GAGACC','GGTCTC'+'A'+'GCTT'+goldenCoreB+'AATG'+'A'+'GAGACC']
export const goldenExpected='AATG'+goldenCoreA+'GCTT'+goldenCoreB
export const makeRecords=(sequences:string[])=>sequences.map((sequence,index)=>({name:'fragment-'+(index+1),description:'Synthetic deterministic validation fixture',sequence}))
export const fixtureReverseComplement=rc

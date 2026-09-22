import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { analyzeFlow, gatingMlSubset, type FlowDataset } from '../../plugins/research/src/shared/flow.js'
import { importGatingMl } from '../../plugins/research/src/host/gating-ml.js'

if (!process.argv.includes('--run')) throw new Error('Pass --run for independent FlowKit GatingML validation.')
const root = resolve('.build/gating-ml-reference', new Date().toISOString().replaceAll(':', '-')); await mkdir(root, { recursive: true })
const fixture = await readFile('plugins/research/test/fixtures/gating-ml-standard.xml', 'utf8')
const dataset: FlowDataset = { format: 'fcs', version: '3.0', datatype: 'F', byteOrder: 'little', eventCount: 9, channels: ['X', 'Y'].map((name, index) => ({ index, name, shortName: name, range: 100, bits: 32 })), events: [[0, 0], [1, 1], [5, 5], [9, 1], [10, 0], [-1, 1], [14, 21], [38, 43], [50, 50]], keywords: {}, sourceSha256: 'synthetic', notes: [] }
const parsed = importGatingMl(fixture, dataset)
const compensation = { channels: ['X', 'Y'], matrix: [[1, .1], [.2, 1]], source: 'synthetic' }
const cases = []
for (const name of ['raw', 'compensated-arcsinh']) {
  const parameters = { ...parsed, transform: name === 'raw' ? 'none' as const : 'arcsinh' as const, cofactor: 5, applyCompensation: name !== 'raw' }
  const data = { ...dataset, compensation }; const analysis = analyzeFlow(data, parameters)
  const xml = gatingMlSubset(analysis, parameters.gates, name === 'raw' ? undefined : compensation); const path = join(root, `${name}.xml`); await writeFile(path, xml)
  const reimported = importGatingMl(xml, dataset); const roundtrip = analyzeFlow({ ...dataset, compensation: reimported.compensation }, reimported)
  assert.deepEqual(roundtrip.gates, analysis.gates)
  cases.push({ name, path, expected: analysis.gates.map(gate => ({ id: gate.id, count: gate.count })) })
}
await writeFile(join(root, 'input.json'), JSON.stringify({ events: dataset.events, cases }))
const python = resolve('.build/flow-reference-venv/Scripts/python.exe')
const result = await promisify(execFile)(python, ['-c', `import flowkit as fk,numpy as np,json,sys,importlib.metadata
from pathlib import Path
root=Path(sys.argv[1]); data=json.loads((root/'input.json').read_text()); output=[]
for case in data['cases']:
 strategy=fk.parse_gating_xml(case['path'])
 sample=fk.Sample(np.array(data['events'],dtype=float),sample_id=case['name'],channel_labels=['X','Y'])
 result=strategy.gate_sample(sample)
 actual=[{'id':g['id'],'count':int(result.get_gate_count(g['id']))} for g in case['expected']]
 assert actual==case['expected'], (actual,case['expected'])
 target=root/(case['name']+'-flowkit.xml')
 with target.open('wb') as stream: fk.export_gatingml(strategy,stream)
 output.append({'name':case['name'],'counts':actual,'reexported':str(target),'xsdValidated':True})
print(json.dumps({'versions':{k:importlib.metadata.version(k) for k in ['flowkit','flowutils','numpy','lxml']},'cases':output}))`, root], { maxBuffer: 1024 * 1024 })
const independent = JSON.parse(result.stdout)
for (const item of independent.cases) {
  const imported = importGatingMl(await readFile(item.reexported, 'utf8'), dataset)
  const result = analyzeFlow({ ...dataset, compensation: imported.compensation }, imported)
  assert.deepEqual(result.gates.map(gate => ({ id: gate.id, count: gate.count })), item.counts)
}
const report = { status: 'passed', scope: 'Synthetic actual FlowKit XSD validation, independent rectangle/polygon/parent counts, fasinh and square compensation, bidirectional export/import; not FlowJo compatibility', independent, cases }
await writeFile(join(root, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify({ status: 'passed', root, independent }))

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { zipSync, strToU8, strFromU8, unzipSync } from 'fflate'
import { buildScienceResearch } from './build-science-research.mjs'

function fixture() {
  const files = {}
  const prefix = 'science-skills-fixture/'
  for (let index = 0; index < 40; index++) {
    const name = index === 0 ? 'uv' : index === 1 ? 'predictingthepast' : `example-${index}`
    files[prefix + `skills/${name}/SKILL.md`] = strToU8(`---\nname: ${name}\ndescription: Example\nmetadata:\n  publisher: google\n---\nRead the \`uv\` skill.\nuv run scripts/query.py\n`)
    files[prefix + `skills/${name}/scripts/query.py`] = strToU8('# /// script\n# requires-python = ">=3.10"\n# dependencies = ["polite-http"]\n# ///\noutput = "/tmp/result.json"\n')
  }
  for (const name of ['LICENSE', 'README.md', 'SKILL_LICENSES.md']) files[prefix + name] = strToU8('Copyright 2026 Google LLC\n')
  const bytes = zipSync(files)
  return { bytes, source: { commit: 'fixture', sha256: createHash('sha256').update(bytes).digest('hex'), version: '1.0.0', python312: '3.12.14', python314: '3.14.0' } }
}

test('builds deterministic, namespaced skills with portable output and managed dependencies', () => {
  const { bytes, source } = fixture()
  const first = buildScienceResearch(bytes, source)
  assert.deepEqual(first.archive, buildScienceResearch(bytes, source).archive)
  const files = unzipSync(first.archive)
  const instruction = strFromU8(files['science-example-2/SKILL.md'])
  assert.match(instruction, /name: science-example-2/)
  assert.match(instruction, /`science-uv`/)
  assert.match(instruction, /<CAPABILITY_PYTHON> scripts\/query.py/)
  assert.doesNotMatch(instruction, /Google|publisher: google|\buv run/)
  assert.match(strFromU8(files['licenses/LICENSE']), /Google LLC/)
  assert.match(strFromU8(files['science-example-2/scripts/query.py']), /"\.\/result.json"/)
  assert.equal(first.revisions.length, 40)
  assert.deepEqual(first.capabilities.capabilities[0].requirements, ['polite-http'])
})

test('rejects a changed source archive before producing artifacts', () => {
  const { bytes, source } = fixture()
  assert.throws(() => buildScienceResearch(bytes, { ...source, sha256: '0'.repeat(64) }), /checksum/)
})

test('keeps compatible skill requirements confined to Python capability constraints', () => {
  const files = {
    'science-skills-fixture/skills/alphagenome_variant_impact_score/SKILL.md': strToU8('---\nname: alphagenome-variant-impact-score\ndescription: AlphaGenome\n---\nuv run scripts/score.py\n'),
    'science-skills-fixture/skills/alphagenome_variant_impact_score/pyproject.toml': strToU8('[project]\nname = "avi"\nversion = "0.1.0"\nrequires-python = ">=3.14"\ndependencies = ["pysam; sys_platform != \'win32\'", "alphagenome"]\n'),
    'science-skills-fixture/skills/credentials/SKILL.md': strToU8('---\nname: credentials\ndescription: Credentials\n---\nUse credentials.\n'),
    'science-skills-fixture/skills/uv/SKILL.md': strToU8('---\nname: uv\ndescription: Runtime\n---\nuv run scripts/score.py\n'),
    'science-skills-fixture/LICENSE': strToU8('Apache-2.0'),
    'science-skills-fixture/README.md': strToU8('Science'),
    'science-skills-fixture/SKILL_LICENSES.md': strToU8('Service terms'),
  }
  for (let index = 0; index < 37; index++) files[`science-skills-fixture/skills/example-${index}/SKILL.md`] = strToU8(`---\nname: example-${index}\ndescription: Example\n---\nStudy evidence.\n`)
  const bytes = zipSync(files)
  const result = buildScienceResearch(bytes, { commit: 'fixture', sha256: createHash('sha256').update(bytes).digest('hex'), version: '1.0.0', python312: '3.12.14', python314: '3.14.0' })
  const avi = result.capabilities.capabilities.find(row => row.id === 'skill-science-alphagenome-variant-impact-score')
  assert.equal(avi.pythonVersion, '3.14.0')
  assert.ok(avi.requirements.includes("pysam;sys_platform!='win32'"))
  assert.match(strFromU8(unzipSync(result.archive)['science-uv/SKILL.md']), /Managed science runtime/)
  assert.doesNotMatch(strFromU8(unzipSync(result.archive)['science-credentials/SKILL.md']), /google/i)
})

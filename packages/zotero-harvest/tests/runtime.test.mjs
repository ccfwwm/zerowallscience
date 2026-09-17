import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Context } from '../../../deepseek-harness/vendor/cordis/lib/index.js'
import SystemPrompt from '../../../deepseek-harness/packages/core/system-prompt/lib/index.js'
import ToolRuntime, { validateJsonSchemaValue } from '../../../deepseek-harness/packages/core/tools/lib/index.js'
import * as Harvest from '../lib/index.js'
test('all six tools mount on pinned DSH and return schema-valid output', async () => {
 const ctx = new Context()
 try {
  ctx.provide('sessions', {})
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(Harvest)
  assert.equal(ctx.tools.schemas().filter(t=>t.name.startsWith('lit_')).length,6)
  const definitions=[]; Harvest.apply({tools:{register:d=>definitions.push(d)}})
  const tool=definitions.find(t=>t.name==='lit_sufficiency_check')
  const output=await tool.execute({topic:'single cell',collected:[]},{})
  assert.equal(output.sufficient,false)
  assert.deepEqual(validateJsonSchemaValue(tool.output.schema,output,'value'),[])
 } finally { await ctx.fiber.dispose() }
})

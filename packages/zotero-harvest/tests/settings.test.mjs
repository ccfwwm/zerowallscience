import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Harvest from '../lib/index.js'
import { validateJsonSchemaValue } from '../../../deepseek-harness/packages/core/tools/lib/index.js'

test('tool uses live DSH Zotero configuration and validates real save output', async () => {
 const root = await mkdtemp(join(tmpdir(),'harvest-tool-'))
 const prior = process.env.LIT_INBOX_DIR
 process.env.LIT_INBOX_DIR = root
 const definitions=[]
 let baseUrl='https://remote.example/api'
 Harvest.apply({tools:{register:tool=>definitions.push(tool)},get:name=>name==='zotero'?{config:{baseUrl}}:undefined})
 const tool=definitions.find(row=>row.name==='lit_save')
 try {
  await assert.rejects(tool.execute({mode:'inbox',papers:[{source:'crossref',id:'test',title:'Test',authors:[]}]},{}),/loopback/)
  baseUrl='http://127.0.0.1:23119/api/'
  const value=await tool.execute({mode:'inbox',papers:[{source:'crossref',id:'test',title:'Test',authors:[]}]},{})
  assert.equal(value.saved,0); assert.equal(value.requiresImport,true)
  assert.deepEqual(validateJsonSchemaValue(tool.output.schema,value,'value'),[])
 } finally {
  if(prior===undefined)delete process.env.LIT_INBOX_DIR;else process.env.LIT_INBOX_DIR=prior
  await rm(root,{recursive:true,force:true})
 }
})

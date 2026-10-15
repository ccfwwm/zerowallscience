import test from 'node:test'
import assert from 'node:assert/strict'
import { renameProfile } from '../../tools/commands/profile-rename.mjs'

test('profile activation retries transient Windows handles without replacing an occupied destination', async () => {
  let calls=0
  const waits=[]
  await renameProfile('candidate','web',{
    move:async(source,destination)=>{assert.equal(source,'candidate');assert.equal(destination,'web');if(++calls<3)throw Object.assign(new Error('busy'),{code:'EPERM'})},
    exists:async path=>path==='candidate',wait:async ms=>waits.push(ms),
  })
  assert.equal(calls,3)
  assert.deepEqual(waits,[100,200])
  calls=0
  await assert.rejects(renameProfile('candidate','web',{
    move:async()=>{calls++;throw Object.assign(new Error('busy'),{code:'EPERM'})},
    exists:async()=>true,wait:async()=>assert.fail('occupied destination must not be retried'),
  }),/busy/)
  assert.equal(calls,1)
})

test('permanent denial stays bounded and non-transient or missing source failures propagate immediately',async()=>{
  let calls=0
  await assert.rejects(renameProfile('candidate','web',{
    attempts:3,move:async()=>{calls++;throw Object.assign(new Error('denied'),{code:'EACCES'})},
    exists:async path=>path==='candidate',wait:async()=>{},
  }),/denied/)
  assert.equal(calls,3)
  for(const code of ['EINVAL','ENOENT'])await assert.rejects(renameProfile('candidate','web',{
    move:async()=>{throw Object.assign(new Error(code),{code})},exists:async()=>false,
    wait:async()=>assert.fail('not a temporary handle'),
  }),new RegExp(code))
})

import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, writeFile, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve, basename } from 'node:path'
import { _electron as electron } from 'playwright'
import { locatePackagedApp } from './packaged-app.mjs'

const packaged = await locatePackagedApp(resolve(import.meta.dirname, '..'))
const root = await mkdtemp(resolve(tmpdir(), 'zerowall-auth-delete-'))
const userData = resolve(root, 'user-data')
let serverId = 'test-local-instance'; let authRequests = 0; let deny = true
const secret = 'fixture-grant-' + randomUUID()
const fixture = createServer(async (req, res) => {
  res.setHeader('Zotero-Server-ID', serverId)
  res.setHeader('Zotero-API-Version', '3')
  res.setHeader('Content-Type', 'application/json')
  if (req.url === '/api/local/authorize' && req.method === 'POST') {
    let body = ''; for await (const chunk of req) body += chunk
    assert.match(JSON.parse(body).appName, /ZeroWall/)
    authRequests++
    res.statusCode = deny ? 403 : 200
    res.end(JSON.stringify(deny ? {} : { key: secret, remember: true })); return
  }
  res.end(JSON.stringify(req.url.startsWith('/api/users/') ? [] : {}))
})
await new Promise(done => fixture.listen(0, '127.0.0.1', done))
const base = 'http://127.0.0.1:' + fixture.address().port
while (!/^\d/.test(createHash('sha256').update(base + '|' + serverId).digest('hex'))) serverId += 'x'
for (const dir of ['appdata', 'localappdata', 'user-data/harness']) await mkdir(resolve(root, dir), { recursive: true })
await writeFile(resolve(userData, 'harness/settings.yaml'), `zotero:\n  baseUrl: ${base}/api\n`)
const source = (await readFile('C:/Users/ccf/Downloads/session.v3.jsonl', 'utf8')).trim().split(/\r?\n/).map(JSON.parse)
source[0].cwd = root
const selectedId = source[0].id
const otherId = 'session-' + randomUUID()
const project = `--${root.replace(/[:\\/]+/gu, '-')}--`
for (const id of [selectedId, otherId]) {
 const directory = resolve(userData, 'harness/sessions', project, id)
 await mkdir(directory, { recursive: true })
 const rows = structuredClone(source); rows[0].id = id
 await writeFile(resolve(directory, 'session.v3.jsonl'), rows.map(JSON.stringify).join('\n') + '\n')
}
const otherPath = resolve(userData, 'harness/sessions', project, otherId, 'session.v3.jsonl')
const otherBytes = await readFile(otherPath)
const selectedPath = resolve(userData, 'harness/sessions', project, selectedId)
const application = await electron.launch({ executablePath: packaged.executablePath, cwd: packaged.root,
 env: {...process.env, APPDATA:resolve(root,'appdata'),LOCALAPPDATA:resolve(root,'localappdata'),USERPROFILE:root,ZEROWALL_USER_DATA_DIR:userData}, timeout:120000 })
let page
async function ready() {
 const deadline=Date.now()+180000
 while(Date.now()<deadline){
  const state=await page.evaluate(()=>window.zerowallDesktop?.getStartupStatus()).catch(()=>null)
  if(state?.phase==='ready'&&page.url().startsWith('http:'))return
  if(state?.phase==='failed')throw new Error(state.message)
  await page.waitForTimeout(200)
 }
 throw new Error('Workbench did not become ready')
}
async function rpc(method,args) {
 return page.evaluate(async ({method,args}) => {
  const response=await fetch('/api/'+method,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:crypto.randomUUID(),method,payload:{args}})})
  return response.json()
 },{method,args})
}
try {
 page=await application.firstWindow();await ready()
 const notice=page.getByRole('dialog',{name:'内测声明'})
 await notice.waitFor({timeout:30000});await notice.getByRole('button',{name:'继续'}).click()
 const credential=page.getByRole('dialog',{name:'添加一个 API Key 开始使用'})
 if(await credential.waitFor({timeout:5000}).then(()=>true,()=>false))await credential.getByRole('button',{name:'稍后配置'}).click()
 await page.getByRole('button',{name:'设置',exact:true}).click()
 const settings=page.getByRole('dialog',{name:'设置',exact:true})
 await settings.getByRole('button',{name:'Zotero',exact:true}).click()
 const auth=settings.locator('[data-zotero-authorization]')
 await auth.getByRole('button',{name:'自动获取本机授权',exact:true}).click()
 await auth.getByRole('alert').filter({hasText:/403/}).waitFor()
 assert.equal(authRequests,1,'credential validation must not block the native auth endpoint')
 deny=false
 await auth.getByRole('button',{name:'自动获取本机授权',exact:true}).click()
 await auth.getByRole('status').filter({hasText:'已保存本机授权'}).waitFor({timeout:30000})
 assert.equal(authRequests,2)
 assert.equal((await auth.innerText()).includes(secret),false)
 const status=await rpc('zotero/localAuthorization',{request:{action:'status'}})
 assert.deepEqual(JSON.parse(status.result.value),{authorized:true,remember:true})
 assert.equal(JSON.stringify(status).includes(secret),false)
 await page.screenshot({path:resolve(root,'zotero-authorization.png')})
 await page.keyboard.press('Escape')
 await settings.waitFor({state:'hidden'})
 // Verify that the visible menu reaches the desktop bridge, with the selected id.
 await page.getByText(basename(root),{exact:true}).first().click()
 const action=page.locator('button[aria-label^="会话"][aria-label$="的操作"]').first()
 await action.waitFor({state:'attached',timeout:30000})
 await action.locator('xpath=ancestor::*[@role="treeitem"][1]').hover()
 await action.waitFor({state:'visible',timeout:30000});await action.click()
 await page.getByRole('menuitem',{name:'删除会话',exact:true}).waitFor()
 await application.evaluate(({dialog})=>{
  globalThis.__deleteDialogs=[];globalThis.__deleteResponse=0
  dialog.showMessageBox=async (_window,opts)=>{globalThis.__deleteDialogs.push(opts);return {response:globalThis.__deleteResponse,checkboxChecked:false}}
 })
 await page.getByRole('menuitem',{name:'删除会话',exact:true}).click()
 for(let n=0;n<100;n++){
  if(await application.evaluate(()=>globalThis.__deleteDialogs.length>0))break
  await page.waitForTimeout(100)
 }
 const dialogs=await application.evaluate(()=>globalThis.__deleteDialogs)
 assert.ok(dialogs.some(d=>d.title==='删除会话'&&d.buttons[0]==='取消'&&d.defaultId===0),JSON.stringify(dialogs))
 await access(selectedPath);await access(otherPath)
 // Confirm deletion of a known fixture id through the same IPC after proving menu wiring/cancel.
 await application.evaluate(()=>{globalThis.__deleteResponse=1})
 await page.evaluate(id=>{void window.zerowallDesktop.deleteSession({sessionId:id,title:'删除回归测试',language:'zh'})},selectedId)
 await page.waitForURL(/file:/,{timeout:30000})
 await page.waitForURL(/http:\/\/127\.0\.0\.1/,{timeout:180000})
 await ready()
 await assert.rejects(access(selectedPath))
 assert.ok((await readFile(otherPath)).equals(otherBytes),'unrelated session bytes changed')
 const list=await rpc('session/list',{_request:{}})
 assert.ok(list.result.ok)
 assert.equal(list.result.value.items.some(row=>row.sessionId===selectedId),false)
 assert.equal(list.result.value.items.some(row=>row.sessionId===otherId),true)
 const resumed=await rpc('zotero/localAuthorization',{request:{action:'status'}})
 assert.deepEqual(JSON.parse(resumed.result.value),{authorized:true,remember:true})
 assert.equal(authRequests,2,'saved authorization must survive actual Host restart')
 await page.screenshot({path:resolve(root,'session-deleted.png')})
 console.log('Packaged native authorization, denial/retry, credential persistence after restart, session menu, cancel and confirmed deletion passed.')
} catch(error) {
 await page?.screenshot({path:resolve(root,'failure.png')}).catch(()=>{})
 await writeFile(resolve(root,'failure.txt'),await page?.locator('body').innerText().catch(()=>'')??'')
 throw error
} finally { console.log('Evidence:',root);await application.close();await new Promise(done=>fixture.close(done)) }

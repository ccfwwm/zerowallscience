import { chromium } from 'playwright'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
const root = process.argv[2]
const endpoint = (await readFile(join(root,'endpoint.txt'),'utf8')).trim()
const browser = await chromium.launch({headless:true})
const page = await browser.newPage()
const requests = new Map(); const errors=[]
page.on('request',r=>{const url=new URL(r.url()); const key=url.pathname;requests.set(key,(requests.get(key)??0)+1)})
page.on('pageerror',e=>errors.push(e.message.slice(0,500)))
await page.goto(endpoint)
await page.waitForTimeout(15000)
await writeFile(join(root,'page.txt'),await page.locator('body').innerText())
await page.getByRole('button',{name:'设置',exact:true}).click({timeout:30000})
const settings = page.getByRole('dialog',{name:'设置'})
await settings.getByRole('button',{name:'能力管理',exact:true}).click()
await page.waitForTimeout(10000)
await writeFile(join(root,'capability.txt'),await settings.innerText())
await page.screenshot({path:join(root,'capability.png')})
await settings.getByRole('button',{name:'插件',exact:true}).click()
await page.waitForTimeout(10000)
await writeFile(join(root,'skills.txt'),await settings.innerText())
await page.screenshot({path:join(root,'skills.png')})
await settings.getByRole('tab',{name:'MCP',exact:true}).click()
for(let i=0;i<20;i++) {
 await page.waitForTimeout(30000)
 await writeFile(join(root,'requests.json'),JSON.stringify({at:Date.now(),requests:[...requests],errors}))
 if(i%4===0) console.log(JSON.stringify({iteration:i,requests:[...requests].filter(([k])=>/zerowallMcp|classifyAll|listSkills|events/.test(k)),errors}))
}
await writeFile(join(root,'mcp.txt'),await settings.innerText())
await browser.close()

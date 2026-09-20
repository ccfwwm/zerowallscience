import React from 'react'
import { createRoot } from 'react-dom/client'
import { Editor } from 'ketcher-react'
import { StandaloneStructServiceProvider } from 'ketcher-standalone/dist/binaryWasm'
import 'ketcher-react/dist/index.css'

const [artifact, token] = location.hash.slice(1).split(':')
const api = `/api/${artifact}`
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
async function get() { const result = await fetch(api, { headers }); if (!result.ok) throw new Error('Editor authorization failed'); return result.json() }
async function post(value) { const result = await fetch(api, { method: 'POST', headers, body: JSON.stringify(value) }); if (!result.ok) throw new Error('Editor bridge failed') }
const service = new StandaloneStructServiceProvider()
let stopped = false
const completed = new Set()
async function initialize(ketcher) {
  window.ketcher = ketcher
  try {
    const initial = await get()
    if (initial.seed) await ketcher.setMolecule(initial.seed)
    await post({ ready: true, ket: await ketcher.getKet() })
    let saving
    ketcher.editor.subscribe('change', () => { clearTimeout(saving); saving = setTimeout(() => { void ketcher.getKet().then(ket => post({ ket })).catch(console.error) }, 400) })
    const exportStructure = async format => {
      switch (format) {
        case 'ket': return ketcher.getKet()
        case 'mol': return ketcher.getMolfile('v3000')
        case 'smiles': return ketcher.getSmiles()
        case 'cml': return ketcher.getCml()
        case 'rxn': return ketcher.getRxn('v3000')
        case 'svg': { const blob = await ketcher.generateImage(await ketcher.getKet(), { outputFormat: 'svg' }); return blob.text() }
        default: throw new Error('Unsupported export format')
      }
    }
    const poll = async () => {
      if (stopped) return
      try {
        const next = await get()
        if (next.closed) { stopped = true; document.body.innerHTML = '<p>编辑器已关闭。使用 open_sketcher 重新打开。</p>'; return }
        for (const cmd of next.commands) {
          if (completed.has(cmd.id)) continue
          completed.add(cmd.id)
          try {
            let result = true
            if (cmd.action === 'set') await ketcher.setMolecule(cmd.args.structure)
            else if (cmd.action === 'get') result = await exportStructure(cmd.args.format)
            else if (cmd.action === 'highlight') ketcher.editor.highlights.create({ atoms: cmd.args.atoms, bonds: [], rgroupAttachmentPoints: [], color: cmd.args.color })
            else if (cmd.action === 'close') stopped = true
            await post({ id: cmd.id, result, ket: await ketcher.getKet(), ...(stopped ? { closed: true } : {}) })
            if (stopped) document.body.innerHTML = '<p>结构已保存，编辑器已关闭。</p>'
          } catch (error) { await post({ id: cmd.id, error: String(error.message) }) }
        }
      } catch (error) { console.error(error) }
      if (!stopped) setTimeout(poll, 350)
    }
    void poll()
  } catch (error) { document.getElementById('status').textContent = String(error.message) }
}
window.addEventListener('pagehide', () => { stopped = true; void fetch(api, { method: 'POST', headers, body: JSON.stringify({ closed: true }), keepalive: true }) })
createRoot(document.getElementById('root')).render(<Editor staticResourcesUrl="/" structServiceProvider={service} onInit={initialize} errorHandler={message => { document.getElementById('status').textContent = message }} />)

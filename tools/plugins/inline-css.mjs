import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
for (const entry of await readdir(resolve(root, 'plugins'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  const lib = resolve(root, 'plugins', entry.name, 'lib')
  const clientPath = resolve(lib, 'client.js')
  const cssPath = resolve(lib, 'style.css')
  try {
    const [client, css] = await Promise.all([
      readFile(clientPath, 'utf8'),
      readFile(cssPath, 'utf8'),
    ])
    if (css.trim().length === 0) throw new Error(`@zerowallscience/plugin-${entry.name}: generated style.css is empty`)
    const marker = `data-zerowall-plugin-css`
    const pluginId = `@zerowallscience/plugin-${entry.name}`
    // tsdown's inline-css plugin emits a setAttribute call while this
    // fallback script emits a literal attribute. Accept both forms, but make
    // sure the bundle is tagged with its own plugin id before continuing.
    const hasMarker = client.includes(marker) && client.includes(pluginId)
    if (!hasMarker) {
      const injected = `(function(){var s=document.createElement('style');s.setAttribute('data-zerowall-plugin-css',${JSON.stringify(pluginId)});s.textContent=${JSON.stringify(css)};document.head.appendChild(s);})();\n`
      await writeFile(clientPath, injected + client)
    }
    const finalClient = await readFile(clientPath, 'utf8')
    if (!(finalClient.includes(marker) && finalClient.includes(pluginId))) throw new Error(`${pluginId}: CSS marker missing from client bundle`)
  } catch (error) {
    if (error?.code === 'ENOENT') {
      // Host-only plugins legitimately have no client/style artifact. A
      // style-less client still gets a marker so the packaged audit can
      // distinguish it from a failed client build. Source CSS may belong to
      // an exported type-only component and therefore be absent from the
      // actual client bundle.
      if (await exists(clientPath)) {
        const pluginId = `@zerowallscience/plugin-${entry.name}`
        const client = await readFile(clientPath, 'utf8')
        const hasMarker = client.includes('data-zerowall-plugin-css') && client.includes(pluginId)
        if (!hasMarker) {
          const injected = `(function(){var s=document.createElement('style');s.setAttribute('data-zerowall-plugin-css',${JSON.stringify(pluginId)});document.head.appendChild(s);})();\n`
          await writeFile(clientPath, injected + client)
        }
      }
      continue
    }
    throw error
  }
}

async function exists(path) {
  try { await readFile(path); return true } catch { return false }
}

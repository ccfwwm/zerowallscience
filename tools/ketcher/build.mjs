import { build } from 'esbuild'
import { cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const output = resolve(import.meta.dirname, '../../resources/mcp/ketcher-chemistry')
// This directory contains generated assets only; remove stale hashed chunks.
await rm(resolve(output, 'widget'), { recursive: true, force: true })
await mkdir(resolve(output, 'widget'), { recursive: true })
await build({ entryPoints: [resolve(import.meta.dirname, 'editor.jsx')], bundle: true, splitting: true, format: 'esm', minify: true, outdir: resolve(output, 'widget'), loader: { '.png': 'file', '.svg': 'file', '.wasm': 'file', '.woff': 'file', '.woff2': 'file', '.ttf': 'file' }, define: { 'process.env.NODE_ENV': '"production"', 'process.env': '{}', global: 'globalThis' } })
await build({ entryPoints: [resolve(import.meta.dirname, 'server.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: resolve(output, 'server.js'), banner: { js: 'import { createRequire as __createRequire } from "node:module"; const require = __createRequire(import.meta.url);' } })
await writeFile(resolve(output, 'widget/index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Ketcher Chemistry</title><link rel="stylesheet" href="/editor.css"><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}#status{position:fixed;bottom:0;color:#b21;z-index:999}</style><div id="root"></div><div id="status"></div><script type="module" src="/editor.js"></script></html>')
for (const pkg of ['ketcher-react', 'ketcher-core', 'ketcher-standalone']) {
  const path = resolve(import.meta.dirname, 'node_modules', pkg)
  await cp(resolve(import.meta.dirname, 'LICENSE-upstream'), resolve(output, `LICENSE-${pkg}`))
}
const binary = resolve(import.meta.dirname, 'node_modules/ketcher-standalone/dist/binaryWasm')
for (const file of await readdir(binary)) {
  if (file.endsWith('.wasm')) await cp(resolve(binary, file), resolve(output, 'widget', file))
  if (/^indigoWorker-[^.]+\.js$/u.test(file)) await build({ entryPoints: [resolve(binary, file)], bundle: true, format: 'esm', minify: true, outfile: resolve(output, 'widget', file), define: { 'process.env': '{}' } })
}
await writeFile(resolve(output, 'UPSTREAM.json'), JSON.stringify({ repository: 'https://github.com/epam/ketcher', version: '3.18.0', packages: ['ketcher-react', 'ketcher-core', 'ketcher-standalone'], license: 'Apache-2.0', build: 'npm ci --prefix tools/ketcher --ignore-scripts && npm run build --prefix tools/ketcher' }, null, 2))
console.log('Built Ketcher 3.18.0 with separate local assets and compact MCP resource')

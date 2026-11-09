import { build } from 'esbuild'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
await mkdir('lib', { recursive: true })
execFileSync(process.execPath, [createRequire(import.meta.url).resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'], { stdio: 'inherit' })
await build({ entryPoints: ['src/host/index.ts'], outfile: 'lib/index.js', bundle: true, platform: 'node', target: 'node24', format: 'esm', packages: 'external', tsconfig: 'tsconfig.json' })
const result = await build({ entryPoints: ['src/client/index.tsx'], outfile: 'lib/client.js', bundle: true, platform: 'browser', target: 'es2022', format: 'cjs', external: pkg.dsh.client.external, loader: { '.png': 'dataurl' }, define: { 'process.env.NODE_ENV': '"production"' }, tsconfig: 'tsconfig.json', write: false })
let js = result.outputFiles.find(f => f.path.endsWith('.js')).text
const css = result.outputFiles.find(f => f.path.endsWith('.css'))?.text
const styles = css ? `ctx.effect(() => { const style = document.createElement('style'); style.dataset.zerowallPlugin = ${JSON.stringify(pkg.name)}; style.textContent = ${JSON.stringify(css)}; document.head.append(style); return () => style.remove(); });` : ''
// DSH owns shared React modules and calls the factory through its module table.
await writeFile('lib/client.js', `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory(require) { const module = { exports: {} }; const exports = module.exports; ${js}
const plugin = module.exports; return { ...plugin, apply(ctx, config) { ${styles} return plugin.apply(ctx, config); } }; } });
`)

/** Build the Host and browser entries shipped by an owned npm plugin. */
import { build } from 'esbuild'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { generateRemote } from './generate-remote.mjs'

const root = resolve(process.cwd())
const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'))
await mkdir(resolve(root, 'lib'), { recursive: true })
if (pkg.exports['./remote']) await generateRemote(root)
const require = createRequire(resolve(root, 'package.json'))
execFileSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.build.json'], { cwd: root, stdio: 'inherit' })

const host = pkg.zerowall.build.host
await build({ absWorkingDir: root, entryPoints: [host], outfile: 'lib/index.js', bundle: true,
  platform: 'node', format: 'esm', target: 'node24', packages: 'external' })
for (const [subpath, source] of Object.entries(pkg.zerowall.build.shared ?? {})) {
  await build({ absWorkingDir: root, entryPoints: [source], outfile: `lib/${subpath}.js`, bundle: true,
    platform: 'neutral', format: 'esm', packages: 'external' })
}
if (pkg.zerowall.build.client) {
  const feature = `./${pkg.zerowall.build.client}`
  const stdin = pkg.exports['./remote'] ? {
    contents: `import * as feature from ${JSON.stringify(feature)};
import contribution from './lib/typert.remote-client.js';
export const inject = ['remote'];
export async function apply(ctx, config) {
  const dispose = await ctx.remote.$mount(contribution);
  ctx.effect(() => dispose);
  await ctx.plugin(feature, config).await();
}`,
    resolveDir: root, sourcefile: 'client-entry.js', loader: 'js',
  } : undefined
  const result = await build({ absWorkingDir: root, ...(stdin ? { stdin } : { entryPoints: [feature] }),
    outfile: 'lib/client.js', bundle: true, platform: 'browser', format: 'cjs', target: 'es2022',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
    plugins: [{ name: 'dsh-platform', setup(builder) {
      builder.onResolve({ filter: /^@deepseek-ai\// }, args => {
        if (args.path === '@deepseek-ai/dsh-typert-protocol/remote-info') return undefined
        return { path: args.path, external: true }
      })
      builder.onResolve({ filter: /\.css\?inline$/ }, args => ({ path: resolve(args.resolveDir, args.path.slice(0, -7)), namespace: 'inline-css' }))
      builder.onLoad({ filter: /.*/, namespace: 'inline-css' }, async args => ({ contents: await readFile(args.path, 'utf8'), loader: 'text' }))
    } }],
    loader: { '.png': 'dataurl', '.svg': 'dataurl' },
    define: { 'process.env.NODE_ENV': '"production"' }, write: false })
  const js = result.outputFiles.find(file => file.path.endsWith('.js')).text
  const css = result.outputFiles.find(file => file.path.endsWith('.css'))?.text
  const styles = css ? `ctx.effect(() => { const style = document.createElement('style'); style.textContent = ${JSON.stringify(css)}; document.head.append(style); return () => style.remove(); });` : ''
  await writeFile(resolve(root, 'lib/client.js'), `window.__ModuleLoader__.load({id:${JSON.stringify(pkg.name)},factory(require){const module={exports:{}};const exports=module.exports;
${js}
const plugin=module.exports;return {...plugin,apply(ctx,config){${styles}return plugin.apply(ctx,config)}};}});
`)
}
for (const [source, destination] of Object.entries(pkg.zerowall.build.assets ?? {})) {
  await cp(resolve(root, source), resolve(root, destination), { recursive: true })
}
if (pkg.zerowall.build.worker) {
  await build({ absWorkingDir: root, entryPoints: [pkg.zerowall.build.worker], outfile: 'lib/python-updater-worker.mjs',
    bundle: true, platform: 'node', format: 'esm', target: 'node24', packages: 'external' })
}

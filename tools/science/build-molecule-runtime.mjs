import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..')
const plugin=join(root,'plugins/research')
const require=createRequire(join(plugin,'package.json'))
const viteRequire=createRequire(require.resolve('vitest/package.json'))
const esbuild=viteRequire('esbuild')
const outfile=join(plugin,'lib/molecule-runtime.js')
await mkdir(dirname(outfile),{ recursive:true })
await esbuild.build({ entryPoints:[join(plugin,'src/client/molecule-runtime.ts')],outfile,bundle:true,format:'iife',platform:'browser',target:'es2022',minify:true,legalComments:'eof',define:{ 'process.env.NODE_ENV':'"production"' },logLevel:'warning' })
const bytes=await readFile(outfile)
if(bytes.length>8*1024**2)throw new Error('Molecular runtime exceeds 8 MiB transport limit.')
const license=await readFile(require.resolve('molstar/LICENSE'),'utf8')
await writeFile(join(plugin,'lib/molecule-runtime.LICENSE.txt'),license)
await writeFile(join(plugin,'lib/molecule-runtime.manifest.json'),JSON.stringify({ version:'5.11.0',source:'https://www.npmjs.com/package/molstar/v/5.11.0',license:'MIT',size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex') },null,2)+'\n')
console.log(JSON.stringify({ outfile,bytes:(await stat(outfile)).size,version:'5.11.0' }))

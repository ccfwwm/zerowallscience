import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { copyRuntimeSnapshot, normalizeRuntimeCandidate, readRuntimeLayout, verifySharedPackages } from '../../desktop/src/main/shared-python-runtime.js'
import { verifyMcpEnvironmentHealth } from '../../desktop/src/main/mcp-environment.js'

const sourceRoot = join(process.env.APPDATA!, 'zerowall-science', 'zerowall-python')
const current = JSON.parse(await readFile(join(sourceRoot, 'current.json'), 'utf8'))
const source = current.root as string
const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'))
const resume = process.argv.find(value => value.startsWith('--resume='))?.slice('--resume='.length)
const output = resume ? resolve(resume) : resolve('.build', 'shared-python-migration', `run-${Date.now()}`)
await mkdir(output, { recursive: true })
const target = join(output, 'snapshot')
if (!resume || process.argv.includes('--finish-copy')) {
  console.log('Copying installed environment to isolated candidate', target)
  await copyRuntimeSnapshot(source, target)
}
const overlay = current.overlayPath ?? join(sourceRoot, 'python-overlay', `python-${manifest.python.version.split('.').slice(0, 2).join('.')}`)
const result: Record<string, unknown> = { source, target, startedAt: new Date().toISOString(), sourceUntouched: true }
try {
  const existing = await readRuntimeLayout(target, manifest)
  const moved = await stat(join(target, 'Python', 'python.exe')).then(() => true, () => false)
  const resumable = moved && !await stat(join(target, manifest.python.relativeExecutable)).then(() => true, () => false)
    ? { ...manifest, python: { ...manifest.python, relativeExecutable: 'Python/python.exe', relativeSitePackages: join('Python', relative(dirname(manifest.python.relativeExecutable), manifest.python.relativeSitePackages)) } } : manifest
  const effective = existing.python.relativeExecutable === 'Python/python.exe' ? existing : await normalizeRuntimeCandidate(target, resumable, overlay)
  await verifySharedPackages(target)
  await verifyMcpEnvironmentHealth(target, effective)
  const output = await new Promise<string>((accept, reject) => {
    const child = spawn(join(target, effective.python.relativeExecutable), ['-I', '-B', '-c', 'import sys,importlib.metadata as m,json;print(json.dumps({"python":sys.version,"executable":sys.executable,"packages":len(list(m.distributions())),"site":next(iter(m.distributions())).locate_file("").as_posix()}))'], { windowsHide: true })
    let stdout = ''; let stderr = ''
    child.stdout.on('data', data => { stdout += data }); child.stderr.on('data', data => { stderr += data })
    child.once('error', reject); child.once('exit', code => code === 0 ? accept(stdout) : reject(new Error(stderr)))
  })
  result.ok = true; result.runtime = JSON.parse(output)
} catch (error) { result.ok = false; result.error = String(error); process.exitCode = 1 }
await writeFile(join(output, 'receipt.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))

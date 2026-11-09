/** Build target-specific uv and hash locks; optional wheels are build-cache artifacts without changing the bundled interpreter. */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { chmod, cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import extractZip from 'extract-zip'

const root = fileURLToPath(new URL('../../', import.meta.url))
const { values } = parseArgs({ options: { python: { type: 'string' }, target: { type: 'string', default: 'win-x64' }, output: { type: 'string' }, 'download-wheels': { type: 'boolean', default: false }, 'refresh-lock': { type: 'boolean', default: false } } })
const python = values.python ?? process.env.DSH_PYTHON_EXECUTABLE
if (!python) throw new Error('Supply --python with the target DSH interpreter; system Python is not selected automatically.')
const targets = { 'win-x64': { platform: 'win32', arch: 'x64', tag: 'win_amd64' }, 'mac-arm64': { platform: 'darwin', arch: 'arm64', tag: 'macosx_11_0_arm64' }, 'mac-x64': { platform: 'darwin', arch: 'x64', tag: 'macosx_10_12_x86_64' } }
const target = targets[values.target]
if (!target) throw new Error('Unsupported Python resource target.')
const output = resolve(values.output ?? join(root, 'distribution/plugins/dsh-plugin-python/resources/runtime'))
const cache = join(root, '.artifacts/python-downloads')
await mkdir(output, { recursive: true }); await mkdir(cache, { recursive: true })
const run = (executable, args) => execFileSync(executable, args, { encoding: 'utf8', maxBuffer: 30_000_000, env: { ...process.env, UV_PYTHON_DOWNLOADS: 'never', UV_NO_PROGRESS: '1', UV_CACHE_DIR: join(cache, 'uv-cache') } })
const version = run(python, ['-I', '-B', '-c', 'import platform;print(platform.python_version())']).trim()
const metadata = await fetch('https://pypi.org/pypi/uv/0.13.7/json').then(response => { if (!response.ok) throw new Error('uv metadata download failed'); return response.json() })
const artifact = metadata.urls.find(row => row.filename.endsWith(`-${target.tag}.whl`))
if (!artifact) throw new Error('Locked uv release does not support this target.')
const archive = join(cache, artifact.filename)
let bytes = await readFile(archive).catch(error => { if (error.code === 'ENOENT') return undefined; throw error })
if (!bytes || createHash('sha256').update(bytes).digest('hex') !== artifact.digests.sha256) {
  const response = await fetch(artifact.url)
  if (!response.ok) throw new Error('uv wheel download failed')
  bytes = Buffer.from(await response.arrayBuffer())
  if (createHash('sha256').update(bytes).digest('hex') !== artifact.digests.sha256) throw new Error('uv checksum mismatch')
  await writeFile(archive, bytes)
}
const extracted = join(cache, `uv-${values.target}`)
await mkdir(extracted, { recursive: true }); await extractZip(archive, { dir: extracted })
const uvEntry = (await readdir(extracted, { recursive: true })).find(path => path.endsWith(target.platform === 'win32' ? '/uv.exe' : '/uv') || path.endsWith(target.platform === 'win32' ? '\\uv.exe' : '\\uv'))
if (!uvEntry) throw new Error('uv executable missing from wheel')
const uv = join(output, target.platform === 'win32' ? 'uv.exe' : 'uv')
await cp(join(extracted, uvEntry), uv)
if (target.platform !== 'win32') await chmod(uv, 0o755)
await cp(join(extracted, 'uv-0.13.7.dist-info/licenses'), join(output, 'licenses/uv'), { recursive: true })
const base = JSON.parse(run(python, ['-I', '-B', '-c', 'import importlib.metadata as m,json;print(json.dumps({d.metadata["Name"]:d.version for d in m.distributions()}))']))
await writeFile(join(output, 'base-constraints.txt'), Object.entries(base).filter(([name]) => name.toLowerCase() !== 'pip').map(([name, value]) => `${name}==${value}`).sort().join('\n') + '\n')
const requested = ['rapidocr-onnxruntime==1.4.4', 'rapidocr==3.10.0', 'mcp<2', 'httpx', 'requests', 'beautifulsoup4', 'xmltodict', 'biopython', 'pypdf', 'pymupdf', 'matplotlib', 'scipy', 'statsmodels', 'pingouin', 'seaborn', 'pint', 'uncertainties', 'pydoe3', 'pyyaml', 'tabulate']
await writeFile(join(output, 'core.in'), requested.join('\n') + '\n')
const requirements = join(output, 'core.lock')
if (values['refresh-lock']) run(uv, ['pip', 'compile', '--python', python, '--no-python-downloads', '--generate-hashes', '--no-annotate', '--no-header', '--constraint', join(output, 'base-constraints.txt'), '--output-file', requirements, join(output, 'core.in')])
const wheels = values['download-wheels'] ? join(cache, `wheels-${values.target}`) : undefined
if (wheels) await mkdir(wheels, { recursive: true })
if (wheels) run(python, ['-I', '-B', '-m', 'pip', '--isolated', 'download', '--index-url', 'https://pypi.org/simple', '--no-cache-dir', '--disable-pip-version-check', '--only-binary=:all:', '--no-deps', '--require-hashes', '--dest', wheels, '-r', requirements])
const lock = await readFile(requirements)
const pins = new Map([...lock.toString('utf8').matchAll(/^([A-Za-z0-9_.-]+)==([^\s;\\]+)/gm)].map(match => [match[1].toLowerCase().replace(/[-_.]+/g, '_'), match[2]]))
const files = []
for (const filename of (wheels ? await readdir(wheels) : []).sort()) {
  const [name, version] = filename.split('-')
  if (pins.get(name.toLowerCase()) !== version) { await rm(join(wheels, filename)); continue }
  const body = await readFile(join(wheels, filename)); files.push({ filename, sha256: createHash('sha256').update(body).digest('hex'), bytes: body.length })
}
await writeFile(join(output, 'runtime.json'), JSON.stringify({ schema: 1, platform: target.platform, arch: target.arch, pythonVersion: version, uv: target.platform === 'win32' ? 'uv.exe' : 'uv', uvVersion: '0.13.7', uvSha256: createHash('sha256').update(await readFile(uv)).digest('hex'), requirements: 'core.lock', packageCount: pins.size, wheels: 'wheels', revision: createHash('sha256').update(lock).digest('hex'), imports: ['mcp.server.fastmcp', 'requests', 'numpy', 'pandas', 'scipy', 'matplotlib', 'statsmodels', 'pingouin', 'pint', 'uncertainties', 'pypdf', 'fitz', 'rapidocr_onnxruntime', 'rapidocr', 'cv2'], files }, null, 2) + '\n')
console.log(`Prepared Python ${version}, uv 0.13.7 and ${files.length} locked wheels at ${output}`)

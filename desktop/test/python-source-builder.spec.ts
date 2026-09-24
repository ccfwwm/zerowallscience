import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, expect, it, vi } from 'vitest'
import { buildPythonSourceWheel } from '../src/main/python-source-builder.js'

const exec = promisify(execFile)
const roots: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true, maxRetries: 3 })
})
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')

it('refuses a changed source before starting any interpreter or creating build output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'source-hash-test-')); roots.push(root)
  const archivePath = join(root, 'demo-1.0.zip'); await writeFile(archivePath, 'altered')
  const outputDirectory = join(root, 'output')
  await expect(buildPythonSourceWheel({ executable: 'must-not-run.exe', sitePackages: root, archivePath, archiveSha256: 'a'.repeat(64), outputDirectory, mirror: { indexUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple' } })).rejects.toThrow(/SHA-256/)
  expect(await readdir(root)).toEqual(['demo-1.0.zip'])
})

it.skipIf(!process.env.ZEROWALL_TEST_SOURCE_PYTHON)('builds with a real isolated backend and nested socket/TLS subprocess despite poisoned inherited paths', async () => {
  const executable = process.env.ZEROWALL_TEST_SOURCE_PYTHON!
  const sitePackages = join(dirname(executable), 'Lib', 'site-packages')
  const root = await mkdtemp(join(tmpdir(), 'source-backend-test-')); roots.push(root)
  const poison = join(root, 'poison'); await mkdir(poison)
  await writeFile(join(poison, 'injected_marker.py'), 'raise RuntimeError("host PYTHONPATH leaked")')
  const before = await readFile(join(dirname(executable), 'python312._pth'))
  const backend = `import sys,os,ssl,socket,subprocess,zipfile,importlib.util
assert importlib.util.find_spec('injected_marker') is None
assert os.environ.get('PYTHONHOME') is None
assert os.environ.get('PIP_NO_BUILD_ISOLATION') is None
assert os.environ.get('PIP_EXTRA_INDEX_URL') is None
subprocess.run([sys.executable,'-c','import ssl,socket; assert ssl.OPENSSL_VERSION; socket.gethostname()'],check=True)
def get_requires_for_build_wheel(config_settings=None): return []
def build_wheel(wheel_directory,config_settings=None,metadata_directory=None):
 name='isolated_probe-1.0-py3-none-any.whl'
 with zipfile.ZipFile(os.path.join(wheel_directory,name),'w') as z:
  z.writestr('isolated_probe.py','VALUE=7\\n')
  z.writestr('isolated_probe-1.0.dist-info/METADATA','Metadata-Version: 2.1\\nName: isolated-probe\\nVersion: 1.0\\n')
  z.writestr('isolated_probe-1.0.dist-info/WHEEL','Wheel-Version: 1.0\\nGenerator: test\\nRoot-Is-Purelib: true\\nTag: py3-none-any\\n')
  z.writestr('isolated_probe-1.0.dist-info/RECORD','')
 return name
`
  const archivePath = join(root, 'isolated-probe-1.0.zip')
  const pyproject = '[build-system]\nrequires=[]\nbuild-backend="backend"\nbackend-path=["."]\n'
  await exec(executable, ['-I', '-c', 'import zipfile,sys,json\nwith zipfile.ZipFile(sys.argv[1],"w") as z:\n for name,body in json.loads(sys.argv[2]).items(): z.writestr("isolated-probe-1.0/"+name,body)', archivePath, JSON.stringify({ 'pyproject.toml': pyproject, 'backend.py': backend })], { windowsHide: true })
  vi.stubEnv('PYTHONPATH', poison); vi.stubEnv('PYTHONHOME', poison)
  vi.stubEnv('PIP_NO_BUILD_ISOLATION', '1'); vi.stubEnv('PIP_EXTRA_INDEX_URL', 'https://invalid.example/simple')
  vi.stubEnv('REQUESTS_CA_BUNDLE', join(root, 'missing-ca.pem'))
  const outputDirectory = join(root, 'out')
  const result = await buildPythonSourceWheel({ executable, sitePackages, archivePath, archiveSha256: digest(await readFile(archivePath)), outputDirectory, mirror: { indexUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple' } })
  expect(result.wheelPath).toBe(join(outputDirectory, 'isolated_probe-1.0-py3-none-any.whl'))
  expect(await readFile(join(dirname(executable), 'python312._pth'))).toEqual(before)
  expect((await readdir(outputDirectory)).some(name => name.startsWith('.build-work'))).toBe(false)
  expect(await readFile(join(outputDirectory, 'build.log'), 'utf8')).toContain('Successfully built')
}, 180_000)

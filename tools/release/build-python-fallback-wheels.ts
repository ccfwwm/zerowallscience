import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createHash } from 'node:crypto'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareSourceWheel } from '../../desktop/src/main/python-source-packages.js'
import { sanitizePythonTlsEnvironment } from '../../desktop/src/main/python-mirror.js'

const execute = promisify(execFile)
const root = resolve(import.meta.dirname, '../..')
const bootstrap = process.env.ZEROWALL_WHEEL_BUILD_PYTHON_ROOT
if (!bootstrap) throw new Error('Set ZEROWALL_WHEEL_BUILD_PYTHON_ROOT to a verified clean CPython 3.12.10 bootstrap.')
const output = resolve(root, 'artifacts/release/8.1.3/python-wheels')
const executable = join(bootstrap, 'python.exe')
const environment = sanitizePythonTlsEnvironment()
const probe = await execute(executable, ['-I', '-B', '-c', "import sys,struct,importlib.metadata as m; assert sys.version_info[:3]==(3,12,10) and struct.calcsize('P')==8; assert {d.metadata['Name'].lower() for d in m.distributions()}=={'pip'}"], { env: environment, windowsHide: true })
await mkdir(output, { recursive: true })
const packages = JSON.parse(await readFile(join(root, 'resources/extensions/python/source-distributions.json'), 'utf8'))
const wheels = []
for (const pkg of packages) {
  const built = await prepareSourceWheel(output, { executable, sitePackages: join(bootstrap, 'Lib/site-packages') }, pkg, { indexUrl: 'https://pypi.org/simple' })
  const filename = basename(fileURLToPath(built.url)); const bytes = await readFile(new URL(built.url))
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  await cp(fileURLToPath(built.url), join(output, filename))
  const validation = join(output, 'validation', pkg.name)
  await cp(bootstrap, validation, { recursive: true })
  const python = join(validation, 'python.exe')
  await execute(python, ['-I', '-B', '-m', 'pip', 'install', '--no-index', '--no-deps', '--disable-pip-version-check', join(output, filename)], { env: environment, windowsHide: true, timeout: 120_000 })
  const code = `import sys,zipfile,email.parser,json,importlib.metadata as m
from pip._vendor.packaging.tags import sys_tags,parse_tag
d=m.distribution(sys.argv[2]); assert d.version==sys.argv[3]
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 w=email.parser.Parser().parsestr(z.read(next(n for n in z.namelist() if n.endswith('.dist-info/WHEEL'))).decode())
 tags=w.get_all('Tag'); assert set(t for tag in tags for t in parse_tag(tag)).intersection(sys_tags()); print(json.dumps(tags))`
  const checked = await execute(python, ['-I', '-B', '-c', code, join(output, filename), pkg.name, pkg.version], { env: environment, windowsHide: true, timeout: 30_000 })
  wheels.push({ name: pkg.name, version: pkg.version, filename, size: bytes.length, sha256, tags: JSON.parse(checked.stdout.trim()), sourceArchiveSha256: pkg.sha256, url: `https://zerowall.chengxunkeji.cn/stable/python/wheels/3.12.10-r18/${filename}` })
  await writeFile(join(output, 'build-receipt.json'), JSON.stringify({ complete: wheels.length === packages.length, pythonVersion: '3.12.10', wheels }, null, 2))
  process.stdout.write(`Built and installed ${pkg.name} ${pkg.version}\n`)
}
await writeFile(join(root, 'resources/extensions/python/fallback-wheels.json'), JSON.stringify(wheels, null, 2) + '\n')

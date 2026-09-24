import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, join, resolve } from 'node:path'
import { preparePackagePlan, applyPackagePlanFiles } from '../../desktop/src/main/python-packages.js'
import type { McpEnvironmentManifest } from '../../desktop/src/main/mcp-environment.js'

const exec = promisify(execFile)
const executable = process.env.ZEROWALL_TEST_SOURCE_PYTHON
if (!executable) throw new Error('ZEROWALL_TEST_SOURCE_PYTHON must point to an isolated, minimal Python fixture')
const pythonRoot = dirname(resolve(executable)); const snapshot = dirname(pythonRoot)
if (!snapshot.includes('zerowall-source-install-')) throw new Error('Refusing to use a non-fixture runtime')
const root = join(resolve(import.meta.dirname, '../..'), '.build', `source-install-smoke-${Date.now()}`)
await mkdir(root, { recursive: true })
const site = join(pythonRoot, 'Lib', 'site-packages')
const manifest = { python: { version: '3.12.10', relativeExecutable: 'Python/python.exe', relativeSitePackages: 'Python/Lib/site-packages' } } as McpEnvironmentManifest
const context = { root: snapshot, executable, sitePackages: site, overlayPath: site, manifest, mirror: { indexUrl: 'https://pypi.tuna.tsinghua.edu.cn/simple' } }
console.log('Resolving source dependency', { executable, root })
const plan = await preparePackagePlan(root, context, ['docopt>=0.6.1,<0.7'], { ready: true, packages: [] })
await writeFile(join(root, 'plan.json'), JSON.stringify(plan, null, 2))
if (plan.error) throw new Error(plan.error)
console.log('Built source and resolved plan', plan.wheels)
const target = join(root, 'candidate'); await cp(snapshot, target, { recursive: true })
console.log('Applying to isolated candidate')
await applyPackagePlanFiles(root, context, target, plan)
const result = await exec(join(target, 'Python/python.exe'), ['-I', '-c', "import docopt; print(docopt.docopt('Usage: demo [--ok]',argv=['--ok']))"], { windowsHide: true })
const sourceCheck = await exec(executable, ['-I', '-c', "import importlib.util; assert importlib.util.find_spec('docopt') is None"], { windowsHide: true })
await writeFile(join(root, 'receipt.json'), JSON.stringify({ ok: true, output: result.stdout, sourceUnchanged: sourceCheck.stderr === '', planId: plan.planId, wheels: plan.wheels }, null, 2))
console.log('PASS', result.stdout, root)

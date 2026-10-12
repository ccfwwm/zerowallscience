import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const root = resolve('artifacts/verification/8.1.2/presentation-regression')
const pluginRequire = createRequire(resolve('plugins/images/package.json'))
const { Context } = await import(pathToFileURL(pluginRequire.resolve('@deepseek-ai/cordis')).href)
const { GatewayUniverService, resolveConfig } = await import(pathToFileURL(createRequire(resolve('package.json')).resolve('dsh-univer-office')).href)
await mkdir(root, { recursive: true })
const ctx = new Context()
const service = new GatewayUniverService(ctx, resolveConfig({ telemetry: false, gatewayPort: 19087, gatewayStartupTimeoutMs: 60000, browserExecutablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' }))
try {
  const file = resolve(root, `probe-${Date.now()}.univer`), workspace = root
  const created = await service.newFile({ workspace, file })
  const worktree = await service.worktree({ action: 'create', workspace, file, name: 'presentation regression' })
  console.log(JSON.stringify({ created, worktree }))
  const worktreeId = (worktree.result as any).worktreeId
  const unit = await service.unit({ action: 'create', workspace, file, worktreeId, kind: 'slide', name: 'Pilot' })
  console.log(JSON.stringify(unit))
  const unitId = (unit.result as any).unitId
  const scope = { workspace, file, worktreeId, unitId }
  console.log('execute', JSON.stringify(await service.executeUnitContent({ ...scope, code: 'return presentation.getSlides().map((s,i)=>({page:i+1,id:s.getId(),data:s.getData()}));' })))
  console.log('inspect', JSON.stringify(await service.inspectUnitContent(scope)))
  console.log('lint', JSON.stringify(await service.lintUnitLayout(scope)))
  await writeFile(resolve(root, 'probe-scope.json'), JSON.stringify(scope))
} finally { await service.dispose() }

/** Real pinned Univer service + actual Images tool definitions/middleware.
 * Lightweight dispatcher permits local deterministic regression without sending
 * a long authoring conversation. Visual observations arrive only after PNG review.
 */
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { installPresentationWorkflow } from '../../plugins/images/src/host/presentation-workflow.ts'
const req = createRequire(resolve('plugins/images/package.json'))
const { Context } = await import(pathToFileURL(req.resolve('@deepseek-ai/cordis')).href)
const { GatewayUniverService, resolveConfig } = await import(pathToFileURL(createRequire(resolve('desktop/package.json')).resolve('dsh-univer-office')).href)
const root = resolve('artifacts/verification/8.1.2/presentation-regression')
const mode = process.argv[2] ?? 'pilot', action = process.argv[3] ?? 'build'
const reportPath = resolve(root, `${mode}-run.json`)
await mkdir(root, { recursive: true })
const service = new GatewayUniverService(new Context(), resolveConfig({ telemetry: false, gatewayPort: 19089, gatewayStartupTimeoutMs: 60000, browserExecutablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', screenshotMaxPages: 20 }))
const registered = new Map<string, any>(), hooks: Record<string, any> = {}, events: any[] = [], counters: Record<string, number> = {}
const topLevelCalls: Record<string, number> = {}, serviceCalls: Record<string, number> = {}, serviceMs: Record<string, number> = {}
const agent = { session: { id: `regression-${mode}`, header: { cwd: root }, snapshotEvents: () => events, append: (type: string, data: unknown) => events.push({ type, data: structuredClone(data) }) } }
const signal = AbortSignal.timeout(600000)
const scopeRequest = (args: any) => ({ ...args, workspace: root, file: resolve(root, args.file) })
const implementations: Record<string, (args: any) => Promise<any>> = {
  univer_compile_svg: args => service.compileSvg({ ...scopeRequest(args), sourceWorkspace: root, source: resolve(root, args.source) }, signal),
  univer_execute: args => service.executeUnitContent(scopeRequest(args), signal),
  univer_inspect: args => service.inspectUnitContent(scopeRequest(args), signal),
  univer_lint: args => service.lintUnitLayout(scopeRequest(args), signal),
  univer_screenshot: async args => {
    const value = await service.screenshotUnit({ ...scopeRequest(args), outputWorkspace: root, output: resolve(root, args.output), target: { kind: 'paged-unit', pages: args.pages, ...(args.contactSheet ? { contactSheet: {} } : {}) } }, signal)
    for (const image of value.result.images) delete image.data
    return value
  },
  univer_export: args => service.exportUnitContent({ ...scopeRequest(args), outputWorkspace: root, output: resolve(root, args.output) }, signal),
}
for (const [name, implementation] of Object.entries(implementations)) implementations[name] = async args => {
  serviceCalls[name] = (serviceCalls[name] ?? 0) + 1
  const start = performance.now()
  try { return await implementation(args) } finally { serviceMs[name] = (serviceMs[name] ?? 0) + performance.now() - start }
}
const ctx: any = { effect: () => {}, on: (name: string, hook: any) => { hooks[name] = hook }, llm: { resolveModelInfo: async () => ({ inputModalities: ['text', 'image'] }) }, tools: { register: (tool: any) => registered.set(tool.name, tool), execute: async (exec: any) => {
  counters[exec.name] = (counters[exec.name] ?? 0) + 1
  const execution = { ...exec, agent, signal, token: exec.parent ?? 'test-token', rootCallId: exec.rootCallId ?? exec.callId, deferContext: () => {} }
  const next = async () => { const value = registered.has(exec.name) ? await registered.get(exec.name).execute(exec.arguments, execution) : await implementations[exec.name]!(exec.arguments); return { isError: false, value, content: [{ type: 'text', text: JSON.stringify(value) }] } }
  return hooks['tools/execute'] ? hooks['tools/execute'](execution, next) : next()
} } }
installPresentationWorkflow(ctx)
async function call(name: string, args: any) { topLevelCalls[name] = (topLevelCalls[name] ?? 0) + 1; const result = await ctx.tools.execute({ callId: randomUUID(), name, arguments: args }); if (result.isError) throw new Error(result.error?.message); return typeof result.value === 'string' ? JSON.parse(result.value.startsWith('{') || result.value.startsWith('[') ? result.value : JSON.stringify(result.value)) : result.value }
function nativeCode(pages: number[]): string {
      const baseline = [['指标','DII Q1','DII Q4'],['BMI，kg/m²','28.51','30.10'],['规律运动，%','48.7','29.4'],['大学及以上，%','64.1','39.9'],['补充剂使用，%','60.1','41.1']]
      const healthy = [['结局','DASH','aMED','HEI-2015'],['HD','0.85 (0.73–0.97)','0.88 (0.74–1.04)','0.84 (0.74–0.96)'],['AL','0.64 (0.54–0.75)','0.61 (0.52–0.72)','0.70 (0.59–0.82)'],['KDM','0.68 (0.54–0.85)','0.62 (0.50–0.76)','0.71 (0.58–0.87)'],['PA','0.50 (0.42–0.59)','0.64 (0.54–0.76)','0.51 (0.44–0.58)']]
      return `const nativePages=${JSON.stringify(pages)};for(const entry of [{page:7,values:${JSON.stringify(baseline)},x:60,y:216,w:720,h:300},{page:9,values:${JSON.stringify(healthy)},x:60,y:200,w:1160,h:330}].filter(e=>nativePages.includes(e.page+1))){const slide=presentation.getSlideByIndex(entry.page);const info=slide.newTable().setValues(entry.values).setRows(5).setColumns(entry.values[0].length).setRowHeight(entry.h/5).setColumnWidth(entry.w/entry.values[0].length).setAbsolutePosition(entry.x,entry.y).setSize(entry.w,entry.h).build();for(let r=0;r<info.table.rows.length;r++)for(const cell of info.table.rows[r].cells){const body=cell.textData.body;body.textRuns=[{st:0,ed:body.dataStream.length-2,ts:{ff:'Microsoft YaHei',fs:24,cl:{rgb:'#173F46'},bl:r===0?1:0}}];cell.textData.documentStyle.marginLeft=12;cell.textData.documentStyle.marginTop=8;}const inserted=slide.insertTable(info);if(!inserted)throw new Error('Native table insert failed');if(entry.page===7){inserted.setColumnWidth(0,320);inserted.setColumnWidth(1,200);inserted.setColumnWidth(2,200);}inserted.setTableBorder({color:'#C8DEDD',width:1,lineStrokeType:1});} if(nativePages.includes(9)){const chartSlide=presentation.getSlideByIndex(8);const chartInfo=chartSlide.newChart(univerAPI.Enum.ChartTypeString.Column).setTitle({text:'DII Q4 vs Q1：调整后 OR',fontSize:24}).setPalette(['#17777E']).setSource([['HD',1.25],['AL',1.29],['KDM',1.34],['PA',1.61]]).setCategoryField(0).setValueFields([1]).setXAxis({label:{fontSize:18,family:'Microsoft YaHei'}}).setYAxis({min:0,max:1.8,label:{fontSize:18,family:'Microsoft YaHei'}}).setLegend(false).setAbsolutePosition(55,155).setSize(720,365).build();const insertedChart=await chartSlide.insertChart(chartInfo);if(!insertedChart)throw new Error('Native chart insert failed');const chartData=insertedChart.getChartData();const axisOk=await univerAPI.executeCommand('slide.command.update-slide-chart-snapshot',{unitId:presentation.getId(),subUnitId:chartSlide.getId(),chartId:insertedChart.getId(),patch:{style:{...chartData.chart.style,yAxis:{...chartData.chart.style.yAxis,majorUnit:0.3}}}});if(!axisOk)throw new Error('Chart axis did not persist');}`
}
let report: any = {}, started = performance.now()
try {
  // The reviewing agent is the selected current chat model; this runner only
  // models the route metadata. It never fabricates screenshot observations.
  for await (const _ of hooks['llm/stream']({ sessionId: agent.session.id, provider: 'current-chat', model: 'selected' }, async function* () {})) { /* route metadata */ }
  const specName = mode === 'pilot' ? 'pilot-spec.json' : mode === 'benchmark' ? 'benchmark-spec.json' : 'presentation-spec.json'
  const stem = mode === 'pilot' ? 'NHANES-两页验证' : mode === 'benchmark' ? 'NHANES-8页流程基准' : 'NHANES-14页丰富版'
  if (mode === 'benchmark' && action === 'build') {
    const full = JSON.parse(await readFile(resolve(root, 'presentation-spec.json'), 'utf8'))
    await writeFile(resolve(root, specName), JSON.stringify({ ...full, slides: full.slides.slice(0, 8) }, null, 2))
  }
  const spec = JSON.parse(await readFile(resolve(root, specName), 'utf8'))
  if (action === 'build') {
    const file = resolve(root, `${stem}.univer`)
    await service.newFile({ workspace: root, file }, signal)
    const worktree = await service.worktree({ workspace: root, file, action: 'create', name: `NHANES ${mode}` }, signal)
    const worktreeId = worktree.result.worktreeId
    const unit = await service.unit({ workspace: root, file, action: 'create', worktreeId, kind: 'slide', name: `NHANES ${mode}` }, signal)
    const scope = { file, worktreeId, unitId: unit.result.unitId }
    const assets = JSON.parse(await readFile(resolve(root, 'asset-inputs.json'), 'utf8'))
    await call('presentation_record_assets', { manifest_path: 'visual-assets.json', assets })
    const state = await call('presentation_prepare', { spec_path: specName, manifest_path: 'visual-assets.json', mode: 'new', ...scope })
    // Asset review observations are stored separately after viewing actual media.
    const reviews = JSON.parse(await readFile(resolve(root, 'asset-reviews.json'), 'utf8'))
    await call('presentation_record_reviews', { reviews })
    await call('univer_execute', { ...scope, code: 'presentation.setPageSize({width:1280,height:720}); return presentation.getPageSize();' })
    await call('presentation_compile_pages', { pages: spec.slides.map((slide: any, i: number) => ({ page: i + 1, source: slide.svg })) })
    const notes = spec.slides.map((slide: any) => slide.notes)
    let extra = ''
    if (mode !== 'pilot') {
      extra = nativeCode(spec.slides.map((_: any,i: number)=>i+1))
    }
    await call('univer_execute', { ...scope, code: `${extra}const notes=${JSON.stringify(notes)};for(let i=0;i<notes.length;i++)presentation.getSlideByIndex(i).setSpeakerNotes(notes[i]);return presentation.getSlides().map(s=>({id:s.getId(),notes:s.getSpeakerNotes(),images:s.getImages().length,charts:s.getCharts().length,tables:s.getTables().length}));` })
    const checks = await call('presentation_check_pages', { pages: spec.slides.map((_: any, i: number) => i + 1), output: `${mode}-screenshots` })
    report = { mode, scope, specName, stateJournal: state.journal, checks, counters, topLevelCalls, serviceCalls, serviceMs, buildMs: performance.now() - started, excludes: ['LLM authoring', 'source extraction', 'image generation'] }
    await writeFile(reportPath, JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ mode, scope, buildMs: report.buildMs, counters, screenshots: checks.screenshot, findings: checks.presentationFindings }))
  } else {
    try { report = JSON.parse(await readFile(reportPath, 'utf8')) } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      const directory = resolve(root, '.zerowall/presentation-state')
      for (const name of await readdir(directory)) { const path = resolve(directory, name), state = JSON.parse(await readFile(path, 'utf8')); if (state.spec === resolve(root, specName)) report = { mode, scope: state.scope, specName, stateJournal: path, recovered: true } }
      if (!report.scope) throw new Error('No completed scope journal to recover.')
    }
    const state = JSON.parse(await readFile(report.stateJournal, 'utf8')); agent.session.append('zerowall/presentation-workflow', state)
    if (action === 'resume') {
      report.resumed = await service.worktree({workspace:root,...report.scope,action:'reopen'},signal)
    } else if (action === 'api') {
      const code = mode === 'pilot' ? "return presentation.getPageSize();" : "const s=presentation.getSlideByIndex(7),t=s.getTables()[0],c=presentation.getSlideByIndex(8).newChart(univerAPI.Enum.ChartTypeString.Column);let p=t,methods=[];while(p){methods.push(...Object.getOwnPropertyNames(p));p=Object.getPrototypeOf(p);}return JSON.stringify({table:t.getTableData(),border:t.setTableBorder.toString(),fill:t.setCellFill.toString(),methods,axis:c.setSource([['HD',1.25],['PA',1.61]]).setCategoryField(0).setValueFields([1]).setXAxis({label:{fontSize:18,family:'Microsoft YaHei'}}).setYAxis({min:0,max:1.8,label:{fontSize:18,family:'Microsoft YaHei'}}).build(),size:presentation.getPageSize()});"
      console.log(JSON.stringify(await service.executeUnitContent({workspace:root,...report.scope, code},signal)))
    } else if (action === 'chartapi') {
      const code = "return presentation.getSlides().map((s,i)=>({page:i+1,charts:s.getCharts().map(c=>{let p=c,methods=[];while(p){methods.push(...Object.getOwnPropertyNames(p));p=Object.getPrototypeOf(p);}return {info:c.getInfo(),data:c.getChartData(),methods};})})).filter(s=>s.charts.length);"
      console.log(JSON.stringify(await service.executeUnitContent({workspace:root,...report.scope,code},signal)))
    } else if (action === 'axisrepair') {
      await call('univer_execute', {...report.scope,code:"const c=presentation.getSlideByIndex(8).getCharts()[0];await c.update(c.toBuilder().setXAxis({label:{fontSize:18,family:'Microsoft YaHei'}}).setYAxis({min:0,max:1.8,label:{fontSize:18,family:'Microsoft YaHei'}}).build());return c.getInfo().config.axes;"})
      const captured = await service.executeUnitContent({workspace:root,...report.scope,code:'return presentation.getSlideByIndex(8).getCharts()[0].getId();'},signal)
      report.chartAxis = await call('presentation_set_chart_ticks', {page:9,chart_id:captured.result.value,axis:'y',mode:'fixed',major_unit:0.3})
      report.checks = await call('presentation_check_pages', {pages:[9],output:'full-screenshots'})
    } else if (action === 'check') {
      report.checks = await call('presentation_check_pages', { pages: spec.slides.map((_: any, i: number) => i + 1), output: `${mode}-screenshots` })
    } else if (action === 'repair') {
      await call('presentation_record_assets', { manifest_path: 'visual-assets.json', assets: JSON.parse(await readFile(resolve(root, 'asset-inputs.json'), 'utf8')) })
      await call('presentation_record_reviews', { reviews: JSON.parse(await readFile(resolve(root, 'asset-reviews.json'), 'utf8')) })
      const pages: number[] = JSON.parse(await readFile(resolve(root, `${mode}-repair-pages.json`), 'utf8'))
      await call('presentation_compile_pages', { pages: pages.map(page => ({page, source: spec.slides[page-1].svg})) })
      await call('univer_execute', { ...report.scope, code: `${mode==='pilot'?'':nativeCode(pages)}const entries=${JSON.stringify(pages.map(page => ({page,notes:spec.slides[page-1].notes})))};for(const entry of entries)presentation.getSlideByIndex(entry.page-1).setSpeakerNotes(entry.notes);return entries.map(e=>e.page);` })
      report.checks = await call('presentation_check_pages', { pages, output: `${mode}-screenshots` })
    } else if (action === 'export') {
      const reviews = JSON.parse(await readFile(resolve(root, `${mode}-page-reviews.json`), 'utf8'))
      await call('presentation_record_reviews', { reviews })
      const statusBefore = await call('presentation_status', {})
      // A real read-only call must preserve all checks and reviews.
      await call('univer_execute', { ...report.scope, code: 'return presentation.getSlides().map(s=>({id:s.getId(),notes:s.getSpeakerNotes()}));' })
      const statusAfter = await call('presentation_status', {})
      if (statusBefore.blockedPages.length || statusAfter.blockedPages.length) throw new Error('Read-only execution invalidated reviews or export remains blocked.')
      report.export = await call('univer_export', { ...report.scope, output: `${stem}.pptx` })
      report.exportMs = performance.now() - started
    } else if (action === 'reopen') {
      report.readback = await service.inspectUnitContent({ workspace: root, ...report.scope }, signal)
    } else if (action === 'trunk') {
      report.trunkReadback = await service.inspectUnitContent({workspace:root,file:report.scope.file,unitId:report.scope.unitId},signal)
      if (report.trunkReadback.result.slides.length !== spec.slides.length) throw new Error('Fresh standalone trunk page coverage mismatch.')
    } else if (action === 'finalize') {
      const ready = await service.worktree({workspace:root,...report.scope,action:'ready'},signal)
      const status = await service.status({workspace:root,...report.scope},signal)
      const merged = await service.worktree({workspace:root,...report.scope,action:'merge'},signal)
      const trunk = await service.inspectUnitContent({workspace:root,file:report.scope.file,unitId:report.scope.unitId},signal)
      if (trunk.result.slides.length !== spec.slides.length) throw new Error('Standalone trunk page coverage mismatch.')
      report.finalized = {ready,status,merged,trunk,at:new Date().toISOString()}
    } else throw new Error('Unsupported action')
    report.countersAfter = counters; report.lastTopLevelCalls=topLevelCalls; report.lastServiceCalls=serviceCalls; report.lastServiceMs=serviceMs; await writeFile(reportPath, JSON.stringify(report, null, 2)); console.log(JSON.stringify({ mode, action, counters, export: report.export, finalized: report.finalized, readback: report.readback, checks: ['repair','check'].includes(action) ? report.checks : undefined }))
  }
} finally { await service.dispose() }

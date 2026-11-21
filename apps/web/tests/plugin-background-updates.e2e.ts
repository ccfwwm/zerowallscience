/** Real Loader, Remote and browser flow with a controlled external pnpm process and native restart carrier. */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { launchWebScaffold, watchConsole } from './scaffold.ts'
import { openSettings } from './support.ts'

it('updates all plugins while navigation remains usable and requests restart only when chosen', async () => {
  const root = await mkdtemp(join(tmpdir(), 'plugin-background-update-'))
  const names = ['dsh-update-fixture-a', 'dsh-update-fixture-b']
  try {
    const packages = []
    for (const name of names) {
      const dir = join(root, name)
      await mkdir(dir)
      await writeFile(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', type: 'module', dsh: { bundle: { patch: './cordis.patch.yml' } } }) + '\n')
      await writeFile(join(dir, 'cordis.patch.yml'), '[]\n')
      packages.push({ dir })
    }
    const scaffold = await launchWebScaffold({
      extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)),
      profile: { hmr: false, packages, packageManager: { command: process.execPath,
        args: [fileURLToPath(new URL('./fixtures/plugin-update-pnpm.mjs', import.meta.url))], env: { PLUGIN_UPDATE_FIXTURE_ROOT: root } } },
    })
    try {
      const path = join(scaffold.harnessHome, 'profiles/scaffold/package.json')
      const manifest = JSON.parse(await readFile(path, 'utf8')) as { dependencies: Record<string, string> }
      for (const name of names) manifest.dependencies[name] = '1.0.0'
      await writeFile(path, JSON.stringify(manifest) + '\n')
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: 'zh-CN' })
        await page.addInitScript(() => {
          let state = { phase: 'idle', installedVersion: '9.1.10', configured: true,
            hostRuntime: { phase: 'available', activeVersion: '9.1.12', candidateVersion: '9.1.13', percent: 0, downloadedBytes: 0, totalBytes: 4194304 } }
          const listeners = new Set<(value: typeof state) => void>()
          let finishRuntime: (() => void) | undefined
          Object.assign(window, { advanceRuntime: (phase: string) => {
            state = { ...state, hostRuntime: { ...state.hostRuntime, phase } }
            for (const listener of listeners) listener(state)
            if (phase === 'staged') finishRuntime?.()
          }, featureRestarts: 0, runtimePreparations: 0, dshDesktop: { protocolVersion: 1,
            updates: { status: async () => state,
              subscribe: (listener: (value: typeof state) => void) => { listeners.add(listener); return () => listeners.delete(listener) },
              check: async () => {}, open: async () => {}, hostRuntimeCheck: async () => {}, hostRuntimeRestart: async () => {},
              hostRuntimeStage: async () => {
                const target = window as typeof window & { runtimePreparations: number }
                target.runtimePreparations++
                state = { ...state, hostRuntime: { ...state.hostRuntime, phase: 'downloading', percent: 25, downloadedBytes: 1048576 } }
                for (const listener of listeners) listener(state)
                await new Promise<void>((accept) => { finishRuntime = accept })
              } },
            features: { restart: async () => {
              const target = window as typeof window & { featureRestarts: number }
              target.featureRestarts++
            } } } })
        })
        const tripwire = watchConsole(page)
        await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
        const invitation = page.getByRole('dialog', { name: '有 3 项更新可用', exact: true })
        const updateAll = invitation.getByRole('button', { name: '一键更新', exact: true })
        try { await updateAll.waitFor({ timeout: 60_000 }) }
        catch (error) {
          console.log('Startup page:', await page.locator('body').innerText())
          console.log('Startup commands:', await readFile(join(root, 'commands.jsonl'), 'utf8').catch(() => 'none'))
          throw error
        }
        const bounds = await invitation.boundingBox()
        expect(Math.abs(bounds!.x + bounds!.width / 2 - 640)).toBeLessThan(4)
        const promptEvidence = fileURLToPath(new URL('../../../.artifacts/release-9.1.10/', import.meta.url))
        await mkdir(promptEvidence, { recursive: true })
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme })
          await page.screenshot({ path: join(promptEvidence, `centered-update-${scheme}.png`) })
        }
        await page.setViewportSize({ width: 390, height: 900 })
        const narrow = await invitation.boundingBox()
        expect(narrow!.x).toBeGreaterThanOrEqual(0)
        expect(narrow!.x + narrow!.width).toBeLessThanOrEqual(390)
        await page.screenshot({ path: join(promptEvidence, 'centered-update-narrow.png') })
        await page.setViewportSize({ width: 1280, height: 900 })
        await updateAll.click()
        await page.getByRole('button', { name: 'v9.1.10 · 有更新', exact: true }).waitFor()
        await page.getByRole('navigation', { name: '全局面板' }).getByRole('button', { name: '插件', exact: true }).click()
        const panel = page.locator('[data-plugin-panel]')
        await expect.poll(async () => (await readFile(join(root, 'started.jsonl'), 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).length).toBe(1)
        expect(await page.getByRole('dialog').count()).toBe(0)
        await panel.getByText('正在后台更新，您可以继续使用应用', { exact: true }).waitFor()
        await openSettings(page, 'zh')
        const settings = page.getByRole('dialog', { name: '设置', exact: true })
        await settings.getByRole('button', { name: '更新', exact: true }).click()
        await settings.getByText('正在后台更新，您可以继续使用应用', { exact: true }).waitFor()
        expect(await settings.getByRole('button', { name: '重启以应用功能更新', exact: true }).count()).toBe(0)
        await settings.getByRole('article', { name: 'Host Runtime', exact: true }).waitFor()
        expect(await settings.getByText('更新应用功能，重启后生效；启动异常会恢复上一版本', { exact: true }).count()).toBe(0)
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme })
          await page.screenshot({ path: join(promptEvidence, `unified-update-list-${scheme}.png`) })
        }
        await page.keyboard.press('Escape')
        await expect.poll(() => page.getByRole('dialog').count()).toBe(0)
        await writeFile(join(root, 'release'), '')
        // Runtime preparation follows both external package processes and their metadata refreshes.
        try {
          await expect.poll(() => page.evaluate(() =>
            (window as typeof window & { runtimePreparations: number }).runtimePreparations), { timeout: 90_000 }).toBe(1)
        } catch (error) {
          console.log('Update page:', await page.locator('body').innerText())
          for (const file of ['commands.jsonl', 'started.jsonl', 'completed.jsonl']) console.log(file, await readFile(join(root, file), 'utf8').catch(() => 'none'))
          throw error
        }
        await openSettings(page, 'zh')
        await settings.getByRole('button', { name: '更新', exact: true }).click()
        const runtimeRow = settings.getByRole('article', { name: 'Host Runtime', exact: true })
        await runtimeRow.getByRole('status').getByText('正在下载 25%（1.0 / 4.0 MB）', { exact: true }).waitFor()
        expect(await runtimeRow.getByRole('progressbar').getAttribute('value')).toBe('25')
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme })
          await page.screenshot({ path: join(promptEvidence, `runtime-progress-${scheme}.png`) })
        }
        for (const [phase, text] of [['extracting', '正在解压更新文件…'], ['verifying', '正在校验更新文件…']] as const) {
          await page.evaluate((value) => {
            (window as typeof window & { advanceRuntime: (phase: string) => void }).advanceRuntime(value)
          }, phase)
          await runtimeRow.getByRole('status').getByText(text, { exact: true }).waitFor()
          expect(await runtimeRow.getByRole('button').isDisabled()).toBe(true)
        }
        await page.evaluate(() => { (window as typeof window & { advanceRuntime: (phase: string) => void }).advanceRuntime('staged') })
        const prepared = page.getByRole('dialog', { name: '插件更新已准备好', exact: true })
        try { await prepared.getByRole('button', { name: '稍后重启', exact: true }).click({ timeout: 90_000 }) }
        catch (error) {
          console.log('Prepared invitation state:', await page.locator('body').innerText())
          for (const file of ['commands.jsonl', 'started.jsonl', 'completed.jsonl']) console.log(file, await readFile(join(root, file), 'utf8').catch(() => 'none'))
          throw error
        }
        await expect.poll(() => page.evaluate(() =>
          (window as typeof window & { runtimePreparations: number }).runtimePreparations)).toBe(1)
        await page.keyboard.press('Escape')
        const restart = panel.getByRole('button', { name: '重启以应用功能更新', exact: true })
        await restart.waitFor()
        // The first package can require restart while the second package's registry processes still run.
        try { await expect.poll(() => restart.isEnabled(), { timeout: 90_000 }).toBe(true) }
        catch (error) {
          console.log('Update state:', await panel.innerText())
          for (const file of ['commands.jsonl', 'started.jsonl', 'completed.jsonl']) console.log(file, await readFile(join(root, file), 'utf8').catch(() => 'none'))
          throw error
        }
        const completed = (await readFile(join(root, 'completed.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line) as { spec: string })
        expect(completed.map(item => item.spec).sort()).toEqual(names.map(name => name + '@2.0.0'))
        const restarts = () => page.evaluate(() => (window as typeof window & { featureRestarts: number }).featureRestarts)
        expect(await restarts()).toBe(0)
        const evidence = fileURLToPath(new URL('../../../.artifacts/plugin-background-updates/', import.meta.url))
        await mkdir(evidence, { recursive: true })
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme })
          await page.screenshot({ path: join(evidence, scheme + '.png') })
        }
        await page.setViewportSize({ width: 390, height: 900 })
        const drawer = page.getByRole('dialog', { name: '导航', exact: true })
        if (await drawer.isVisible()) await page.keyboard.press('Escape')
        await expect.poll(() => page.getByRole('dialog').count()).toBe(0)
        expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
        const restartBounds = await restart.boundingBox()
        expect(restartBounds!.x).toBeGreaterThanOrEqual(0)
        expect(restartBounds!.x + restartBounds!.width).toBeLessThanOrEqual(390)
        await page.screenshot({ path: join(evidence, 'narrow.png') })
        await page.setViewportSize({ width: 1280, height: 900 })
        await restart.click()
        await expect.poll(restarts).toBe(1)
        expect(tripwire.pageErrors).toEqual([])
        expect(tripwire.warnings).toEqual([])
      } finally { await browser.close() }
    } finally { await writeFile(join(root, 'release'), ''); await scaffold.close() }
  } finally { await rm(root, { recursive: true, force: true }) }
})

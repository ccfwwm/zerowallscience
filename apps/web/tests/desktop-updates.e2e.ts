/** Real built Web composition with a controlled native carrier; no installer or Electron is executed. */
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { describe, expect, it } from 'vitest'
import type { DesktopUpdatePresentation } from '../../desktop/src/ipc.ts'
import { launchWebScaffold, watchConsole } from './scaffold.ts'

interface CarrierFixture {
  publish(state: DesktopUpdatePresentation): void
  opens: number
  stages: number
  restarts: number
  listeners: Set<(state: DesktopUpdatePresentation) => void>
}
type FixtureWindow = Window & typeof globalThis & { updateFixture: CarrierFixture }

describe('web e2e: update center', () => {
  it.each(['zh-CN', 'en-US'])('navigates, prepares, and applies components in %s', async (locale) => {
    const scaffold = await launchWebScaffold({})
    try {
      const browser = await chromium.launch()
      try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, locale })
        await page.addInitScript(() => {
          let current: DesktopUpdatePresentation = { phase: 'idle', configured: true, checkedAt: '2026-11-14T00:00:00Z',
            hostRuntime: { phase: 'idle', activeVersion: '9.1.4' } }
          const listeners = new Set<(state: DesktopUpdatePresentation) => void>()
          const fixture: CarrierFixture = {
            opens: 0, stages: 0, restarts: 0, listeners,
            publish(state) { current = state; for (const listener of listeners) listener(state) },
          }
          Object.assign(window, { updateFixture: fixture, dshDesktop: { protocolVersion: 1, updates: {
            status: async () => current,
            open: async () => { fixture.opens += 1 },
            hostRuntimeCheck: async () => {},
            hostRuntimeStage: async () => {
              fixture.stages += 1
              fixture.publish({ ...current, hostRuntime: { phase: 'staged',
                activeVersion: '9.1.4', candidateVersion: '9.1.5' } })
            },
            hostRuntimeRestart: async () => { fixture.restarts += 1 },
            subscribe(listener: (state: DesktopUpdatePresentation) => void) {
              listeners.add(listener)
              return () => listeners.delete(listener)
            },
          } } })
        })
        const tripwire = watchConsole(page)
        const root = fileURLToPath(new URL('../../../.artifacts/update-center/browser/', import.meta.url))
        await mkdir(root, { recursive: true })
        const evidence = await mkdtemp(join(root, locale + '-'))
        try {
          await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
          await page.waitForSelector('[class*="frame"]')
          await expect.poll(() => page.evaluate(() => (window as FixtureWindow).updateFixture.listeners.size)).toBe(1)
          const zh = locale === 'zh-CN'
          const publish = (state: DesktopUpdatePresentation) => page.evaluate((value) => {
            (window as FixtureWindow).updateFixture.publish(value)
          }, state)
          await publish({ phase: 'idle', configured: true, checkedAt: '2026-11-14T00:00:00Z',
            hostRuntime: { phase: 'available', activeVersion: '9.1.4', candidateVersion: '9.1.5' } })
          const indicator = page.getByRole('button', { name: zh ? '有更新 · 1' : 'Updates · 1', exact: true })
          await indicator.waitFor()
          const geometry = await indicator.boundingBox()
          expect(geometry!.y).toBeGreaterThan(650)
          expect(geometry!.width).toBeGreaterThan(65)
          await page.screenshot({ path: join(evidence, 'sidebar.png') })
          await indicator.click()
          const overview = page.getByRole('region', { name: zh ? '更新概览' : 'Update overview' })
          await overview.waitFor()
          expect(await page.evaluate(() => (window as FixtureWindow).updateFixture.opens)).toBe(0)
          const prepare = overview.getByRole('button', { name: zh ? '一键更新' : 'Update all', exact: true })
          await prepare.waitFor()
          expect(await prepare.isEnabled()).toBe(true)
          for (const scheme of ['light', 'dark'] as const) {
            await page.emulateMedia({ colorScheme: scheme })
            await page.screenshot({ path: join(evidence, scheme + '.png') })
          }
          await page.setViewportSize({ width: 480, height: 800 })
          await page.screenshot({ path: join(evidence, 'narrow.png') })
          expect(await overview.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
          await page.setViewportSize({ width: 1280, height: 800 })
          await prepare.click()
          const restart = overview.getByRole('button', { name: zh ? '重启并应用' : 'Restart and apply', exact: true })
          await restart.waitFor()
          expect(await page.evaluate(() => (window as FixtureWindow).updateFixture.stages)).toBe(1)
          expect(await page.evaluate(() => (window as FixtureWindow).updateFixture.restarts)).toBe(0)
          await overview.getByRole('button', { name: zh ? '检查更新' : 'Check for updates', exact: true }).click()
          expect(await page.evaluate(() => (window as FixtureWindow).updateFixture.restarts)).toBe(0)
          await restart.click()
          await expect.poll(() => page.evaluate(() => (window as FixtureWindow).updateFixture.restarts)).toBe(1)
          await page.screenshot({ path: join(evidence, 'ready.png') })
          expect(tripwire.pageErrors).toEqual([])
          expect(tripwire.warnings).toEqual([])
          await writeFile(join(evidence, 'result.json'), JSON.stringify({ passed: true, locale, geometry,
            carrier: 'controlled fixture', host: 'real Web composition', installerExecuted: false }, null, 2) + '\n')
          console.log('Update center browser evidence: ' + evidence)
        } catch (error) {
          await page.screenshot({ path: join(evidence, 'failure.png') }).catch(() => undefined)
          throw error
        }
      } finally { await browser.close() }
    } finally { await scaffold.close() }
  })
})

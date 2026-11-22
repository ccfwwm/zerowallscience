/** The Desktop's published file-tree provider shares the ordinary composer reference gesture. */
import { mkdir, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, writeComposerDraft } from './support.ts'

const require = createRequire(new URL('../../desktop-host/package.json', import.meta.url))
const plugin = require.resolve('dsh-better-sidebar/package.json')
const mode = webSnapshotMode()

it.skipIf(mode === 'record')('drags files from the Desktop sidebar provider without uploading or moving their tabs', async () => {
  const scaffold = await launchWebScaffold({
    extraInstallAnchors: [plugin],
    extraOverlayPath: [
      fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)),
      fileURLToPath(new URL('./better-sidebar-reference-drag.overlay.yml', import.meta.url)),
    ],
  })
  const browser = await chromium.launch()
  try {
    await mkdir(join(scaffold.workspaceCwd, 'workspace'), { recursive: true })
    await writeFile(join(scaffold.workspaceCwd, 'workspace', 'reference.txt'), 'reference drag fixture\n')
    const page = await newEnglishPage(browser)
    const tripwire = watchConsole(page)
    const chunkUrl = new URL('/sidebar/bundle/locale.js', scaffold.baseUrl).href
    const unauthenticated = await page.request.head(chunkUrl)
    expect(unauthenticated.status()).toBe(401)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    const authenticated = await page.request.head(chunkUrl)
    expect(authenticated.status()).toBe(200)
    await connectFreshWorkspace(page, scaffold.workspaceCwd)
    const input = page.locator('[data-composer-input]').first()
    await writeComposerDraft(page, input, 'Review ')
    await page.keyboard.press('ControlOrMeta+Alt+p')
    const file = page.locator('[role="button"][draggable="true"]').filter({ hasText: 'reference.txt' })
    await file.waitFor({ timeout: 15_000 })
    await file.dragTo(input)
    await expect.poll(() => input.locator('[data-composer-chip]').allTextContents()).toEqual(['reference.txt'])
    expect(await page.getByRole('group', { name: 'Pending attachments', exact: true }).count()).toBe(0)
    await file.click()
    const tab = page.getByRole('tab', { name: /reference\.txt/ })
    await tab.waitFor()
    const source = await tab.boundingBox()
    const target = await input.boundingBox()
    if (source === null || target === null) throw new Error('Expected file tab and composer')
    await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
    await page.mouse.down()
    await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 15 })
    await page.locator('[data-reference-drop="ready"]').waitFor()
    await page.mouse.up()
    await expect.poll(() => input.locator('[data-composer-chip]').allTextContents()).toEqual(['reference.txt', 'reference.txt'])
    expect(await page.locator('[data-dockkit-host="float"]').count()).toBe(0)
    const expected = fileURLToPath(new URL('./expected/better-sidebar-reference-drag/composer.expected.md', import.meta.url))
    await mkdir(dirname(expected), { recursive: true })
    await compareOrRefreshGolden(expected, await captureStableAria(page, '[data-composer-card]', scaffold.workspaceCwd), mode)
    const evidence = fileURLToPath(new URL('../../../.playwright-mcp/reference-drag/desktop-files-added.png', import.meta.url))
    await mkdir(dirname(evidence), { recursive: true })
    await page.screenshot({ path: evidence })
    expect(tripwire.pageErrors).toEqual([])
  } finally {
    await browser.close()
    await scaffold.close()
  }
}, 120_000)

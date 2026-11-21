// @vitest-environment jsdom
import { Context } from '@deepseek-ai/cordis'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { join } from 'node:path'
import { z } from 'zod'
import { expect, it } from 'vitest'

it('loads the patched language plugin with native languages and disposes only its added languages', async () => {
  const ctx = new Context()
  try {
    const locale = new LocaleRuntime(ctx)
    for (const id of ['ja', 'es', 'fr', 'de', 'ru', 'pt']) locale.addLanguage({ id, label: id, fallback: 'en' })
    ctx.provide('locale', locale)
    const before = locale.getSnapshot().locales.map(row => row.id)
    let plugin!: { inject: string[]; apply: (ctx: Context) => void }
    const source = await readFile(join(process.cwd(), 'apps/desktop-host/node_modules/@huanlin/dsh-plugin-better-locale/lib/client.js'), 'utf8')
    const load = (definition: { factory: () => typeof plugin }) => { plugin = definition.factory() }
    runInNewContext(source, { window: { __ModuleLoader__: { load } } })
    const fork = ctx.plugin(plugin)
    await fork
    expect(locale.getSnapshot().locales.map(row => row.id)).toEqual(expect.arrayContaining([...before, 'ko', 'ar']))
    await fork.dispose()
    expect(locale.getSnapshot().locales.map(row => row.id)).toEqual(before)
    const metadataPath = join(process.cwd(), 'apps/desktop-host/node_modules/@huanlin/dsh-plugin-better-locale/package.json')
    const metadata = z.object({ peerDependencies: z.record(z.string(), z.string()) }).parse(JSON.parse(await readFile(metadataPath, 'utf8')))
    expect(metadata.peerDependencies['@deepseek-ai/dsh-client-locale']).toBe('>=0.2.2-rc.1 <0.3')
  } finally { await ctx.fiber.dispose() }
})

/** Connect the built-in market to the installed Skills manager without another plugin package. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-plugin-market'
import type { SkillsRequest, SkillsResponse } from '@zerowall/dsh-plugin-skills/types'

/**
 * Register the existing Skills manager with the built-in market.
 * @param ctx - Running Desktop application.
 */
export function installMarketSkills(ctx: Context): void {
  ctx.inject(['pluginMarket', 'zerowallSkills'], (scope) => {
    // The optional distribution service is supplied by the selected Skills bundle.
    const skills = scope.get('zerowallSkills') as { request(input: SkillsRequest): Promise<SkillsResponse> }
    scope.effect(() => {
      const dispose = scope.pluginMarket.registerSkillInstaller({
        installed: async () => (await skills.request({ action: 'list' })).entries?.filter(row => row.effective).map(row => row.name) ?? [],
        install: async (path, names) => {
          const entries = (await skills.request({ action: 'list' })).entries ?? []
          const before = new Map(entries.filter(row => row.effective).map(row => [row.name, row.enabled]))
          const preview = (await skills.request({ action: 'preview', source: path })).preview
          if (preview === undefined || preview.skills.length !== names.length
            || !names.every(name => preview.skills.some(row => row.name === name))) {
            throw new Error('The skill archive names differ from the selected catalog entry.')
          }
          await skills.request({ action: 'install', id: preview.id, replace: true, scope: 'global' })
          for (const name of names) await skills.request({ action: 'set-enabled', name, enabled: before.get(name) ?? true, scope: 'global' })
        },
      })
      return async () => { await dispose?.() }
    })
  })
}

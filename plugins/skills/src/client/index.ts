import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { SkillsSettingsTab } from './SkillsSettingsTab.tsx'
import { NS, unwrapRemoteResult } from '@zerowallscience/plugin-base/client-helpers'

export const inject = ['slots', 'locale', 'remote', 'remote.zerowallCapabilities']

export function apply(ctx: ClientContext): void {
  const capabilities = ctx.get('remote.zerowallCapabilities') as any
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab', id: 'zerowall-skills', order: -20,
    label: () => t('capabilities.skillsTab'), locale: NS,
    inject: () => ({
      listSkills: async () => unwrapRemoteResult('zerowall.capabilities.listSkills', await capabilities.listSkills()),
      getSkill: async (name: string) => unwrapRemoteResult('zerowall.capabilities.getSkill', await capabilities.getSkill(name)),
      listSkillSources: async () => unwrapRemoteResult('zerowall.capabilities.listSkillSources', await capabilities.listSkillSources()),
      createSkill: async (input: unknown) => unwrapRemoteResult('zerowall.capabilities.createSkill', await capabilities.createSkill(input)),
      importSkill: async (sourcePath: string) => unwrapRemoteResult('zerowall.capabilities.importSkill', await capabilities.importSkill({ sourcePath })),
      removeImportedSkill: async (name: string) => { unwrapRemoteResult('zerowall.capabilities.removeImportedSkill', await capabilities.removeImportedSkill(name)) },
      setSkillEnabled: async (name: string, enabled: boolean) => { unwrapRemoteResult('zerowall.capabilities.setSkillEnabled', await capabilities.setSkillEnabled(name, enabled)) },
    }),
  }, SkillsSettingsTab))
}

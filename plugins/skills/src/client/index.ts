import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import { SkillsSettingsTab } from './SkillsSettingsTab.tsx'
import { NS, unwrapRemoteResult } from '@zerowallscience/plugin-base/client-helpers'

export const inject = ['slots', 'locale', 'remote', 'remote.zerowallCapabilities']

export function apply(ctx: ClientContext): void {
  const remote = ctx.remote as any
  const t = ctx.locale.bind(NS)
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab', id: 'zerowall-skills', order: -20,
    label: () => t('capabilities.skillsTab'), locale: NS,
    inject: () => ({
      listSkills: async () => unwrapRemoteResult('zerowall.capabilities.listSkills', await remote.zerowallCapabilities.listSkills()),
      getSkill: async (name: string) => unwrapRemoteResult('zerowall.capabilities.getSkill', await remote.zerowallCapabilities.getSkill(name)),
      listSkillSources: async () => unwrapRemoteResult('zerowall.capabilities.listSkillSources', await remote.zerowallCapabilities.listSkillSources()),
      createSkill: async (input: unknown) => unwrapRemoteResult('zerowall.capabilities.createSkill', await remote.zerowallCapabilities.createSkill(input)),
      importSkill: async (sourcePath: string) => unwrapRemoteResult('zerowall.capabilities.importSkill', await remote.zerowallCapabilities.importSkill({ sourcePath })),
      removeImportedSkill: async (name: string) => { unwrapRemoteResult('zerowall.capabilities.removeImportedSkill', await remote.zerowallCapabilities.removeImportedSkill(name)) },
      setSkillEnabled: async (name: string, enabled: boolean) => { unwrapRemoteResult('zerowall.capabilities.setSkillEnabled', await remote.zerowallCapabilities.setSkillEnabled(name, enabled)) },
    }),
  }, SkillsSettingsTab))
}

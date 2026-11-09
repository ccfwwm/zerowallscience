/** Transient feedback survives navigation away from the configuration page. */
import { defineStore } from '@deepseek-ai/dsh-client-store'
import type { SkillsKey } from './locales.js'
/** Create one registration-owned feedback store. @returns the shared toast store. */
export function createSkillsViewStore() {
  return defineStore({
    init: (): { toast: { id: number; key: SkillsKey; success: boolean } | null; sequence: number } => ({ toast: null, sequence: 0 }),
    actions: {
      notify: (state, key: SkillsKey, success: boolean) => { state.toast = { id: ++state.sequence, key, success } },
      clear: state => { state.toast = null },
    },
  })
}

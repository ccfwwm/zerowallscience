export interface ZeroWallSkillSummary {
  name: string
  description: string
  whenToUse?: string
  source: string
  provider: string
  modelInvocable: boolean
  userInvocable: boolean
}

export interface ZeroWallSkillDetail extends ZeroWallSkillSummary {
  content: string
}

export interface SkillSourceSnapshot {
  enabled: string[]
  disabled: string[]
}

export interface CreateSkillInput {
  name: string
  description: string
  whenToUse?: string
  content: string
}

export interface ImportSkillInput { sourcePath: string }
export interface CopyBundledSkillInput { name: string }

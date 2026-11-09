import { anthropicProvider } from '@earendil-works/pi-ai/providers/anthropic'
import type { PiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai'

type ModelProfile = NonNullable<PiAiProviderProfile['models']>[number]

/**
 * Declare native Claude thinking controls for catalog models and gateway aliases.
 * @param modelId - Account model identifier, including optional provider prefix or alias suffix.
 * @returns Supported efforts and protocol flags, or no controls for an unrecognized model.
 */
export function claudeReasoning(modelId: string): Pick<ModelProfile, 'reasoningEfforts' | 'compat'> {
  const id = modelId.toLowerCase().replace(/^anthropic[/._-]+/u, '').replace(/(\d)\.(\d)/gu, '$1-$2')
  const catalog = anthropicProvider().getModels()
  const model = catalog.find(entry => entry.id === id)
    ?? catalog.filter(entry => id.startsWith(entry.id + '-') || id.startsWith(entry.id + ':'))
      .sort((left, right) => right.id.length - left.id.length)[0]
  const legacy = /^claude-(?:3-7-sonnet|(?:opus|sonnet)-4(?:-1)?)(?:$|-\d{8}$)/u.test(id)
  if (!model?.reasoning && !legacy) return {}
  const adaptive = model?.compat?.forceAdaptiveThinking === true
  return {
    reasoningEfforts: {
      off: null,
      minimal: null,
      low: 'low',
      medium: 'medium',
      high: 'high',
      xhigh: adaptive ? model.thinkingLevelMap?.xhigh ?? null : null,
      max: adaptive ? model.thinkingLevelMap?.max ?? null : null,
    },
    compat: { supportsStrictTools: false, forceAdaptiveThinking: adaptive },
  }
}

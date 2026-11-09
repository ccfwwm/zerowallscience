import { describe, expect, it } from 'vitest'
import { claudeSettingsEnvironment, effectiveClaudeSettings, modelCapabilities, validateAdvancedClaudeSettings } from '../src/host/claude-settings.js'

describe('Claude advanced settings', () => {
  it('recognizes native one-million models, provider spellings and explicit variants', () => {
    expect(modelCapabilities('claude-sonnet-4')).toMatchObject({ contextWindow: 200000, supports1m: false })
    expect(modelCapabilities('claude-sonnet-4[1m]')).toMatchObject({ contextWindow: 1000000, supports1m: true })
    expect(modelCapabilities('claude-sonnet-5-5')).toMatchObject({ contextWindow: 1000000, supports1m: true })
    expect(modelCapabilities('claude-opus-5-5-20261001')).toMatchObject({ contextWindow: 1000000, supports1m: true })
    for (const model of ['claude-sonnet-5', 'claude-opus-4-7', 'anthropic/claude-opus-4-8', 'us.anthropic.claude-opus-4-8-v1:0', 'claude-fable-5-1', 'claude-haiku-5-5']) {
      expect(modelCapabilities(model)).toMatchObject({ contextWindow: 1000000, supports1m: true })
    }
    expect(modelCapabilities('claude-opus-4-6')).toMatchObject({ contextWindow: 200000, supports1m: false })
    expect(modelCapabilities('gateway/model-x')).toMatchObject({ contextWindow: 0, source: 'default' })
    expect(effectiveClaudeSettings({ contextWindow: '1m' }, 'claude-sonnet-4').contextWindow).toMatchObject({ available: false, effective: 'auto', source: 'unsupported' })
    expect(effectiveClaudeSettings({ contextWindow: '1m' }, 'claude-opus-5-5', { CLAUDE_CODE_DISABLE_1M_CONTEXT: '1' }).contextWindow)
      .toMatchObject({ available: false, effective: 'auto', reason: expect.stringContaining('已关闭 1M') })
  })

  it('clamps automatic compaction to model capacity and preserves explicit cache TTLs', () => {
    const result = effectiveClaudeSettings({ autoCompactWindow: 500000, promptCacheTtl: '1h', subagentPromptCacheTtl: '5m' }, 'claude-sonnet-4')
    expect(result.autoCompactWindow).toMatchObject({ available: true, effective: '200000', source: 'clamped' })
    expect(result.promptCacheTtl).toMatchObject({ effective: '1h', source: 'explicit' })
    expect(result.subagentPromptCacheTtl).toMatchObject({ effective: '5m', source: 'explicit' })
  })

  it('accepts custom capacities for a provider model whose capacity is not in the model id', () => {
    const result = claudeSettingsEnvironment({ contextWindow: 600000, autoCompactWindow: 800000 }, 'gateway/model-x', {})
    expect(result.env).toMatchObject({ CLAUDE_CODE_MAX_CONTEXT_TOKENS: '600000', CLAUDE_CODE_AUTO_COMPACT_WINDOW: '600000' })
    expect(result.effective.contextWindow).toMatchObject({ requested: '600000', effective: '600000', source: 'explicit', available: true })
    expect(result.effective.autoCompactWindow).toMatchObject({ requested: '800000', effective: '600000', source: 'clamped' })
  })

  it('does not override externally managed values and never emits secrets', () => {
    const result = claudeSettingsEnvironment({ contextWindow: '200k', promptCacheTtl: '5m' }, 'claude-sonnet-4', { ANTHROPIC_API_KEY: 'redacted-test-key', CLAUDE_CODE_PROMPT_CACHE_TTL: '1h', FORCE_PROMPT_CACHING_5M: '1' })
    expect(result.env.ANTHROPIC_API_KEY).toBe('redacted-test-key')
    expect(result.env.CLAUDE_CODE_PROMPT_CACHE_TTL).toBe('1h')
    expect(result.warnings.join('\n')).toContain('外部环境覆盖')
    expect(result.warnings).not.toContain('redacted-test-key')
    expect(result.effective.promptCacheTtl).toMatchObject({ requested: '5m', effective: '5m', source: 'external' })
    expect(result.effective.subagentPromptCacheTtl).toMatchObject({ effective: '5m', source: 'external' })
  })

  it('leaves automatic context and compaction settings to Claude and reports external effective values', () => {
    const automatic = claudeSettingsEnvironment({}, 'claude-sonnet-4', {})
    expect(automatic.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBeUndefined()
    expect(automatic.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBeUndefined()
    expect(automatic.effective.contextWindow).toMatchObject({ requested: 'auto', effective: 'auto', source: 'auto' })

    const external = claudeSettingsEnvironment({}, 'gateway/model-x', {
      CLAUDE_CODE_MAX_CONTEXT_TOKENS: '180000', CLAUDE_CODE_AUTO_COMPACT_WINDOW: '160000',
      CLAUDE_CODE_PROMPT_CACHE_TTL: '1h',
    })
    expect(external.env).toMatchObject({ CLAUDE_CODE_MAX_CONTEXT_TOKENS: '180000', CLAUDE_CODE_AUTO_COMPACT_WINDOW: '160000', CLAUDE_CODE_PROMPT_CACHE_TTL: '1h' })
    expect(external.effective.contextWindow).toMatchObject({ effective: '180000', source: 'external' })
    expect(external.effective.autoCompactWindow).toMatchObject({ effective: '160000', source: 'external' })
    expect(external.effective.promptCacheTtl).toMatchObject({ effective: '1h', source: 'external' })
  })

  it('forces automatic compaction on even when configured environment requests disabling it', () => {
    const result = claudeSettingsEnvironment({ autoCompactWindow: 250000 }, 'claude-sonnet-4', { DISABLE_AUTO_COMPACT: '1', DISABLE_COMPACT: '1' })
    expect(result.env.DISABLE_AUTO_COMPACT).toBeUndefined()
    expect(result.env.DISABLE_COMPACT).toBeUndefined()
    expect(result.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('200000')
    expect(result.effective.autoCompactWindow.reason).toContain('自动压缩开启')
    expect(result.warnings.join('\n')).toContain('DISABLE_AUTO_COMPACT 已被移除')
  })

  it('never claims capacity overrides apply to recognized or bare Claude model IDs with compaction on', () => {
    for (const model of ['claude-sonnet-4', 'anthropic/claude-opus-4-8', 'claude-sonnet-4-5@20250929', 'claude-unknown-model', 'gateway/model-x[1m]']) {
      const result = claudeSettingsEnvironment({ contextWindow: 180000, autoCompactWindow: 200000 }, model, { CLAUDE_CODE_MAX_CONTEXT_TOKENS: '150000' })
      expect(result.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBeUndefined()
      expect(result.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('200000')
      expect(result.effective.contextWindow).toMatchObject({ requested: '180000', effective: 'auto', source: 'unsupported', available: false })
      expect(result.effective.contextWindow.reason).toContain('已忽略')
    }
  })

  it('allows unknown provider spellings and disabled one-million tags to declare a custom window', () => {
    for (const model of ['claude-custom-model@20261001', 'gateway/model-x[1m]']) {
      const result = claudeSettingsEnvironment({ contextWindow: 600000, autoCompactWindow: 800000 }, model, { CLAUDE_CODE_DISABLE_1M_CONTEXT: '1' })
      expect(result.env.CLAUDE_CODE_MAX_CONTEXT_TOKENS).toBe('600000')
      expect(result.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW).toBe('600000')
    }
  })

  it('resolves prompt-cache environment precedence without treating disabled flags as active', () => {
    const enabledCache = claudeSettingsEnvironment({}, 'claude-sonnet-4', { ENABLE_PROMPT_CACHING_1H: 'true' })
    expect(enabledCache.effective.promptCacheTtl).toMatchObject({ effective: '1h', source: 'external' })
    expect(enabledCache.effective.subagentPromptCacheTtl).toMatchObject({ effective: '1h', source: 'external' })

    const explicitBucket = claudeSettingsEnvironment({ promptCacheTtl: '5m', subagentPromptCacheTtl: '5m' }, 'claude-sonnet-4', { ENABLE_PROMPT_CACHING_1H: '1' })
    expect(explicitBucket.effective.promptCacheTtl).toMatchObject({ effective: '5m', source: 'explicit' })
    expect(explicitBucket.effective.subagentPromptCacheTtl).toMatchObject({ effective: '5m', source: 'explicit' })

    const forced = claudeSettingsEnvironment({ promptCacheTtl: '1h', subagentPromptCacheTtl: '1h' }, 'claude-sonnet-4', { ENABLE_PROMPT_CACHING_1H: '1', FORCE_PROMPT_CACHING_5M: '1' })
    expect(forced.effective.promptCacheTtl).toMatchObject({ effective: '5m', source: 'external' })
    expect(forced.effective.subagentPromptCacheTtl).toMatchObject({ effective: '5m', source: 'external' })

    const disabledFlags = claudeSettingsEnvironment({ promptCacheTtl: '1h' }, 'claude-sonnet-4', {
      ENABLE_PROMPT_CACHING_1H: '0', FORCE_PROMPT_CACHING_5M: 'false',
    })
    expect(disabledFlags.effective.promptCacheTtl).toMatchObject({ effective: '1h', source: 'explicit' })
  })

  it('validates persisted values', () => {
    expect(validateAdvancedClaudeSettings({ contextWindow: 'auto', autoCompactWindow: 100000, promptCacheTtl: '1h' })).toEqual({ contextWindow: 'auto', autoCompactWindow: 100000, promptCacheTtl: '1h' })
    expect(() => validateAdvancedClaudeSettings({ contextWindow: 'bogus' })).toThrow()
    expect(() => validateAdvancedClaudeSettings({ autoCompactWindow: 0 })).toThrow()
  })
})

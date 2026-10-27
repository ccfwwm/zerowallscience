import type { ClaudeAutoCompactWindow, ClaudeContextWindow, ClaudeEffectiveSetting, ClaudeModelCapabilities, ClaudeNativeSettings, ClaudePromptCacheTtl } from '../shared/types.js'

export const CLAUDE_CONTEXT_WINDOWS: readonly ClaudeContextWindow[] = ['auto', '200k', '1m']
export const CLAUDE_CACHE_TTLS: readonly ClaudePromptCacheTtl[] = ['auto', '5m', '1h']

export const CLAUDE_AUTO_COMPACT_MIN = 100_000
export const CLAUDE_AUTO_COMPACT_MAX = 1_000_000

function enabled(value: string | undefined): boolean {
  return value !== undefined && /^(?:1|true|yes|on)$/iu.test(value.trim())
}

export function modelCapabilities(model: string, environment: NodeJS.ProcessEnv = {}): ClaudeModelCapabilities {
  const normalized = model.trim().toLowerCase()
  const hasOneMillionVariant = /\[1m\]/u.test(normalized)
  const family = /(?:^|[^a-z0-9])claude[-.](fable|sonnet|opus|haiku)[-.](\d+)(?:[-.](\d{1,2})(?!\d))?(?=$|[^a-z0-9])/u.exec(normalized)
  const major = Number(family?.[2])
  const minor = Number(family?.[3] ?? 0)
  const hasOneMillionDefault = Boolean(family && (family[1] === 'fable'
    || family[1] === 'sonnet' && major >= 5
    || family[1] === 'opus' && (major > 4 || major === 4 && minor >= 7)
    || family[1] === 'haiku' && (major > 5 || major === 5 && minor >= 5)))
  const supports1m = !enabled(environment.CLAUDE_CODE_DISABLE_1M_CONTEXT) && (hasOneMillionVariant || hasOneMillionDefault)
  // Provider spellings can contain a recognized Claude model too. Keep an
  // unknown gateway ID unknown rather than treating every "claude" substring
  // as a model whose capacity we know.
  const isClaude = Boolean(family) || /^(?:sonnet|opus|haiku|fable|best)(?:\[1m\])?$/u.test(normalized)
    || /claude[-.]\d+(?:[-.]\d+)?[-.](?:sonnet|opus|haiku)/u.test(normalized)
  return { model, contextWindow: supports1m ? 1_000_000 : isClaude ? 200_000 : 0, supports1m, supportsAutoCompact: true, source: supports1m || isClaude ? 'model-id' : 'default' }
}

function contextOverrideAllowed(model: string, environment: NodeJS.ProcessEnv): boolean {
  const normalized = model.trim().toLowerCase()
  const untagged = normalized.replaceAll('[1m]', '')
  // Official model IDs require DISABLE_COMPACT for this override. ZeroWall
  // keeps compaction enabled, so only unrecognized custom/provider IDs apply.
  return modelCapabilities(untagged, environment).source === 'default'
    && normalized !== 'claude'
    && (!untagged.startsWith('claude-') || /@\d{8}$/u.test(untagged))
    && (!normalized.includes('[1m]') || enabled(environment.CLAUDE_CODE_DISABLE_1M_CONTEXT))
}

function requestedNumber(value: ClaudeAutoCompactWindow): number | undefined {
  return value === 'auto' ? undefined : value
}

function contextNumber(value: ClaudeContextWindow): number | undefined {
  if (value === 'auto') return undefined
  if (value === '200k') return 200_000
  if (value === '1m') return 1_000_000
  return value
}

export function effectiveClaudeSettings(settings: ClaudeNativeSettings, model: string, environment: NodeJS.ProcessEnv = {}): {
  capabilities: ClaudeModelCapabilities
  contextWindow: ClaudeEffectiveSetting
  autoCompactWindow: ClaudeEffectiveSetting
  promptCacheTtl: ClaudeEffectiveSetting
  subagentPromptCacheTtl: ClaudeEffectiveSetting
} {
  const capabilities = modelCapabilities(model, environment)
  const requestedContext = settings.contextWindow ?? 'auto'
  const requestedContextNumber = contextNumber(requestedContext)
  const knownContextLimit = capabilities.contextWindow > 0 ? capabilities.contextWindow : undefined
  const canOverrideContext = contextOverrideAllowed(model, environment)
  const contextAvailable = requestedContext === 'auto' || (requestedContextNumber !== undefined && requestedContextNumber <= 10_000_000
    && canOverrideContext)
  const effectiveContext = !contextAvailable ? 'auto' : requestedContextNumber === undefined ? 'auto' : String(requestedContextNumber)
  const contextWindow: ClaudeEffectiveSetting = {
    requested: String(requestedContext), effective: effectiveContext, available: contextAvailable,
    source: contextAvailable ? requestedContext === 'auto' ? 'auto' : 'explicit' : 'unsupported',
    ...(contextAvailable
      ? requestedContext === 'auto'
        ? knownContextLimit ? { reason: `当前模型容量约 ${knownContextLimit.toLocaleString()} tokens；auto 不覆盖模型默认值。` } : { reason: '模型容量未知；auto 保留 Claude Code 和 provider 的默认值。' }
        : { reason: '自定义值会覆盖未识别模型的容量估计；请确认它不超过 provider 的真实上下文容量。' }
      : { reason: !canOverrideContext
        ? model === 'claude' ? '尚无活动 Claude 模型；请求值已保存，下次启动时按所选模型判断是否适用。'
          : enabled(environment.CLAUDE_CODE_DISABLE_1M_CONTEXT) && capabilities.source === 'model-id'
          ? 'CLAUDE_CODE_DISABLE_1M_CONTEXT 已关闭 1M 上下文；已识别模型保持官方容量，自定义值未生效，请使用自动压缩窗口设置边界。'
          : '当前模型由 Claude Code 识别或使用 [1m] 容量；开启自动压缩时不接受自定义容量覆盖，请使用自动压缩窗口设置边界。'
        : '上下文容量必须在 1 到 10,000,000 tokens 之间。' }), effect: 'new-session',
  }
  const requestedCompact = settings.autoCompactWindow ?? 'auto'
  const compactNumber = requestedNumber(requestedCompact)
  const requestedContextCeiling = requestedContextNumber && contextAvailable ? requestedContextNumber : knownContextLimit
  const max = Math.min(requestedContextCeiling ?? CLAUDE_AUTO_COMPACT_MAX, CLAUDE_AUTO_COMPACT_MAX)
  const compactSupported = max >= CLAUDE_AUTO_COMPACT_MIN
  const compactAvailable = requestedCompact === 'auto' || (capabilities.supportsAutoCompact && compactSupported && compactNumber !== undefined && compactNumber >= CLAUDE_AUTO_COMPACT_MIN && compactNumber <= CLAUDE_AUTO_COMPACT_MAX)
  const wasClamped = compactNumber !== undefined && compactSupported && compactNumber > max
  const clamped = requestedCompact === 'auto' ? 'auto' : String(wasClamped ? max : compactNumber)
  const autoCompactWindow: ClaudeEffectiveSetting = {
    requested: String(requestedCompact), effective: compactAvailable ? clamped : 'auto', available: compactAvailable,
    source: !compactAvailable ? 'unsupported' : wasClamped ? 'clamped' : requestedCompact === 'auto' ? 'auto' : 'explicit',
    ...(!compactAvailable ? { reason: compactNumber !== undefined && !compactSupported
      ? `自动压缩窗口最小为 ${CLAUDE_AUTO_COMPACT_MIN.toLocaleString()} tokens，当前有效上下文容量不足。`
      : compactNumber !== undefined && (compactNumber < CLAUDE_AUTO_COMPACT_MIN || compactNumber > CLAUDE_AUTO_COMPACT_MAX)
        ? `自动压缩窗口必须在 ${CLAUDE_AUTO_COMPACT_MIN.toLocaleString()} 到 ${CLAUDE_AUTO_COMPACT_MAX.toLocaleString()} tokens 之间。`
        : '当前模型不提供自动压缩控制。' } : wasClamped ? { reason: `请求窗口超过当前上下文容量，已限制为 ${max.toLocaleString()} tokens。` } : requestedCompact === 'auto'
      ? { reason: 'Claude Code 自动压缩保持开启；auto 使用 SDK 默认触发窗口。' } : {}), effect: 'new-session',
  }
  const ttl = (value: ClaudePromptCacheTtl | undefined): ClaudeEffectiveSetting => ({
    requested: value ?? 'auto', effective: value ?? 'auto', source: value === undefined || value === 'auto' ? 'auto' : 'explicit', available: true,
    ...(value === '1h' ? { reason: '1 小时缓存的写入成本高于 5 分钟缓存。' } : {}), effect: 'new-session',
  })
  return { capabilities, contextWindow, autoCompactWindow, promptCacheTtl: ttl(settings.promptCacheTtl), subagentPromptCacheTtl: ttl(settings.subagentPromptCacheTtl) }
}

export function claudeSettingsEnvironment(settings: ClaudeNativeSettings, model: string, inherited: NodeJS.ProcessEnv): {
  env: NodeJS.ProcessEnv
  effective: ReturnType<typeof effectiveClaudeSettings>
  warnings: string[]
} {
  const effective = effectiveClaudeSettings(settings, model, inherited)
  const capabilities = effective.capabilities
  const knownContextLimit = capabilities.contextWindow > 0 ? capabilities.contextWindow : undefined
  const parsedInteger = (value: string): number | undefined => {
    if (!/^(?:\d[\d_]*(?:\.\d[\d_]*)?|\.\d[\d_]*)(?:e[+-]?\d[\d_]*)?$/iu.test(value)) return undefined
    const parsed = Number(value.replaceAll('_', ''))
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined
  }
  const externalContext = inherited.CLAUDE_CODE_MAX_CONTEXT_TOKENS === undefined ? undefined : parsedInteger(inherited.CLAUDE_CODE_MAX_CONTEXT_TOKENS)
  const externalContextValid = externalContext !== undefined && externalContext <= 10_000_000
    && contextOverrideAllowed(model, inherited)
  const savedContext = contextNumber(settings.contextWindow ?? 'auto')
  const contextCeiling = externalContextValid ? externalContext : savedContext !== undefined && effective.contextWindow.available ? savedContext : knownContextLimit
  const compactMax = Math.min(contextCeiling ?? CLAUDE_AUTO_COMPACT_MAX, CLAUDE_AUTO_COMPACT_MAX)
  const compactSupported = compactMax >= CLAUDE_AUTO_COMPACT_MIN
  const env: NodeJS.ProcessEnv = { ...inherited }
  const warnings: string[] = []
  for (const key of ['DISABLE_AUTO_COMPACT', 'DISABLE_COMPACT']) {
    if (!enabled(inherited[key])) continue
    delete env[key]
    effective.autoCompactWindow.reason = [effective.autoCompactWindow.reason, `${key} 已被移除；ZeroWall 始终保持自动压缩开启。`].filter(Boolean).join(' ')
    warnings.push(`${key} 已被移除；自动压缩保持开启。`)
  }
  const override = (key: string, value: string | undefined, supported: boolean): void => {
    if (!value || !supported) return
    if (inherited[key] !== undefined) {
      warnings.push(`${key} 已由外部环境覆盖。`)
      return
    }
    env[key] = value
  }
  override('CLAUDE_CODE_MAX_CONTEXT_TOKENS', effective.contextWindow.effective === 'auto' ? undefined : effective.contextWindow.effective.replaceAll(',', '').replace(/ tokens$/u, ''), effective.contextWindow.available && effective.contextWindow.requested !== 'auto')
  override('CLAUDE_CODE_AUTO_COMPACT_WINDOW', effective.autoCompactWindow.effective === 'auto' ? undefined : effective.autoCompactWindow.effective, effective.autoCompactWindow.available && effective.autoCompactWindow.requested !== 'auto')
  override('CLAUDE_CODE_PROMPT_CACHE_TTL', effective.promptCacheTtl.effective === 'auto' ? undefined : effective.promptCacheTtl.effective, true)
  override('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL', effective.subagentPromptCacheTtl.effective === 'auto' ? undefined : effective.subagentPromptCacheTtl.effective, true)
  const applyExternal = (key: keyof typeof inherited, setting: ClaudeEffectiveSetting, normalize: (value: string) => string | undefined): void => {
    const value = inherited[key]
    if (value === undefined) return
    const configured = { ...setting }
    const normalized = normalize(value)
    if (normalized) {
      setting.effective = normalized
      setting.source = 'external'
      env[key] = normalized.replace(/ tokens$/u, '').replaceAll(',', '')
    } else {
      setting.effective = configured.effective
      setting.source = configured.source
      setting.available = configured.available
      setting.reason = [configured.reason, `${String(key)} 外部覆盖格式无效或超出模型范围，已忽略。`].filter(Boolean).join(' ')
      const fallback = configured.available && configured.effective !== 'auto'
        ? configured.effective.replace(/ tokens$/u, '').replaceAll(',', '') : undefined
      if (fallback) env[key] = fallback
      else delete env[key]
    }
    warnings.push(`${String(key)} 已由外部环境覆盖。`)
  }
  applyExternal('CLAUDE_CODE_MAX_CONTEXT_TOKENS', effective.contextWindow, value => {
    const parsed = parsedInteger(value)
    if (parsed === undefined || parsed > 10_000_000 || !contextOverrideAllowed(model, inherited)) return undefined
    return String(parsed)
  })
  applyExternal('CLAUDE_CODE_AUTO_COMPACT_WINDOW', effective.autoCompactWindow, value => {
    const parsed = parsedInteger(value)
    if (parsed === undefined || parsed < CLAUDE_AUTO_COMPACT_MIN || parsed > CLAUDE_AUTO_COMPACT_MAX || !compactSupported) return undefined
    return String(Math.min(parsed, compactMax))
  })
  applyExternal('CLAUDE_CODE_PROMPT_CACHE_TTL', effective.promptCacheTtl, value => value === '5m' || value === '1h' ? value : undefined)
  applyExternal('CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL', effective.subagentPromptCacheTtl, value => value === '5m' || value === '1h' ? value : undefined)
  if (inherited.CLAUDE_CODE_DISABLE_1M_CONTEXT !== undefined && enabled(inherited.CLAUDE_CODE_DISABLE_1M_CONTEXT)) {
    warnings.push('CLAUDE_CODE_DISABLE_1M_CONTEXT 已由外部环境启用。')
  }
  if (enabled(inherited.ENABLE_PROMPT_CACHING_1H)) {
    if ((settings.promptCacheTtl ?? 'auto') === 'auto' && inherited.CLAUDE_CODE_PROMPT_CACHE_TTL === undefined) {
      effective.promptCacheTtl.effective = '1h'
      effective.promptCacheTtl.source = 'external'
      effective.promptCacheTtl.reason = 'ENABLE_PROMPT_CACHING_1H 已启用 1 小时缓存。'
    }
    if ((settings.subagentPromptCacheTtl ?? 'auto') === 'auto' && inherited.CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL === undefined) {
      effective.subagentPromptCacheTtl.effective = '1h'
      effective.subagentPromptCacheTtl.source = 'external'
      effective.subagentPromptCacheTtl.reason = 'ENABLE_PROMPT_CACHING_1H 已启用 1 小时缓存。'
    }
    warnings.push('ENABLE_PROMPT_CACHING_1H 已由外部环境启用。')
  }
  if (enabled(inherited.FORCE_PROMPT_CACHING_5M)) {
    for (const setting of [effective.promptCacheTtl, effective.subagentPromptCacheTtl]) {
      setting.effective = '5m'
      setting.source = 'external'
      setting.reason = 'FORCE_PROMPT_CACHING_5M 强制使用 5m 缓存。'
    }
    warnings.push('FORCE_PROMPT_CACHING_5M 外部覆盖了主对话和子代理缓存设置。')
  }
  return { env, effective, warnings }
}

export function validateAdvancedClaudeSettings(input: Record<string, unknown>): Partial<ClaudeNativeSettings> {
  const result: Partial<ClaudeNativeSettings> = {}
  if (input.contextWindow !== undefined) {
    const value = input.contextWindow
    if (value !== 'auto' && value !== '200k' && value !== '1m' && !(typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 10_000_000)) throw new Error('Claude 上下文窗口设置无效。')
    result.contextWindow = value as ClaudeContextWindow
  }
  if (input.autoCompactWindow !== undefined) {
    const value = input.autoCompactWindow
    if (value !== 'auto' && !(typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= 10_000_000)) throw new Error('Claude 自动压缩窗口设置无效。')
    result.autoCompactWindow = value as ClaudeAutoCompactWindow
  }
  for (const key of ['promptCacheTtl', 'subagentPromptCacheTtl'] as const) {
    if (input[key] !== undefined) {
      if (!CLAUDE_CACHE_TTLS.includes(input[key] as ClaudePromptCacheTtl)) throw new Error(`Claude ${key} 设置无效。`)
      result[key] = input[key] as ClaudePromptCacheTtl
    }
  }
  return result
}

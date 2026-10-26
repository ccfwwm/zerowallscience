import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '../../lib/typert.remote-client.js'
import type { RemoteResult, TypertRemoteNamespace } from '@deepseek-ai/dsh-typert-protocol'
import type { ClaudeCodeSettingsApi, ClaudeGlobalSettingsView, ClaudeNativeSettings } from '../shared/types.js'
import { NS } from '@zerowallscience/plugin-base/client-helpers'
import { ClaudeCodeAction, type ClaudeCodeActionInjected } from './ClaudeCodeAction.js'
import { ClaudeCodeSettingsSection } from './ClaudeCodeSettingsSection.js'
import { ClaudeTranscriptNode, claudeTranscriptDefinition } from './ClaudeTranscript.js'
import { applyClaudeMarkdownTheme } from './upstream/markdown-theme.js'
import { CLAUDE_NS, en, zh } from './locales.js'
import { ClaudePermissionSelect } from './ClaudePermissionSelect.js'
import type { ClaudePermissionView } from '../shared/types.js'

export const inject = ['slots', 'locale', 'uiConversation', 'remote.zerowallClaudeCode']

type ClaudeCodeRemote = TypertRemoteNamespace<'zerowallClaudeCode'>

export function bindClaudeCodeRemote(remote: ClaudeCodeRemote, sessionId: SessionId): ClaudeCodeActionInjected {
  const value = async <T,>(operation: Promise<RemoteResult<T>>): Promise<T> => {
    const result = await operation
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  return {
    getStatus: () => value(remote.status(sessionId)),
    read: () => value(remote.read(sessionId)),
    stop: () => value(remote.stop(sessionId)),
    install: () => value(remote.installCli(sessionId)),
    rollback: () => value(remote.rollback(sessionId)),
    uninstall: () => value(remote.uninstall(sessionId)),
    clear: () => value(remote.clear(sessionId)),
  }
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(CLAUDE_NS, { zh, en }), 'claude-code: dictionaries')
  const remote = ctx.get('remote.zerowallClaudeCode') as ClaudeCodeRemote & ClaudeCodeSettingsRemote & {
    readTranscript(sessionId: SessionId, turn: number, step: number): Promise<RemoteResult<import('../shared/types.js').ClaudeTranscript | null>>
    permissionView(sessionId: SessionId): Promise<RemoteResult<ClaudePermissionView>>
    permissionSet(sessionId: SessionId, value: string): Promise<RemoteResult<ClaudePermissionView>>
  }
  ctx.slots.inject('conversation.input.permission', () => ctx.slots.register({
    name: 'conversation.input.permission', priority: -20, locale: CLAUDE_NS,
    inject: (sessionId: SessionId) => ({
      loadPermission: () => unwrap(remote.permissionView(sessionId)),
      selectPermission: (value: string) => unwrap(remote.permissionSet(sessionId, value)),
    }),
  }, ClaudePermissionSelect))
  const uiConversation = ctx.get('uiConversation') as { events: { register(definition: typeof claudeTranscriptDefinition): () => void } } | undefined
  if (uiConversation) ctx.effect(() => uiConversation.events.register(claudeTranscriptDefinition), 'claude-code: transcript node')
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({ name: 'conversation.chat.node', key: 'zerowall-claude-transcript',
    inject: (sessionId: SessionId) => ({ readTranscript: (turn: number, step: number) => unwrap(remote.readTranscript(sessionId, turn, step)) }),
  }, ClaudeTranscriptNode))
  void unwrap(remote.settingsGet()).then(settings => applyClaudeMarkdownTheme(settings.prose ?? 'plain')).catch(() => undefined)
  const settingsApi: ClaudeCodeSettingsApi = {
    status: async () => unwrap(remote.settingsStatus()),
    install: async () => unwrap(remote.settingsInstall()),
    rollback: async () => unwrap(remote.settingsRollback()),
    uninstall: async () => unwrap(remote.settingsUninstall()),
    settings: async () => unwrap(remote.settingsGet()),
    updateSettings: async input => unwrap(remote.settingsUpdate(input)),
    globalSettings: async () => unwrap(remote.settingsGlobalGet()),
    updateGlobalSettings: async changes => {
      const next = await unwrap(remote.settingsGlobalUpdate(changes))
      const prose = next.settings.find(setting => setting.key === 'prose')?.value
      if (prose === 'plain' || prose === 'enhanced') applyClaudeMarkdownTheme(prose)
      return next
    },
  }
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'zerowall-claude-code-run',
    order: 40,
    locale: NS,
    inject: (sessionId: SessionId) => bindClaudeCodeRemote(remote, sessionId),
  }, ClaudeCodeAction))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section', id: 'zerowall-claude-code', order: 35, locale: CLAUDE_NS,
    label: () => ctx.locale.bind(CLAUDE_NS)('nav'),
    inject: () => settingsApi,
  }, ClaudeCodeSettingsSection))
}

type ClaudeCodeSettingsRemote = {
  settingsStatus: () => Promise<RemoteResult<Awaited<ReturnType<ClaudeCodeSettingsApi['status']>>>>
  settingsInstall: () => Promise<RemoteResult<Awaited<ReturnType<ClaudeCodeSettingsApi['install']>>>>
  settingsRollback: () => Promise<RemoteResult<Awaited<ReturnType<ClaudeCodeSettingsApi['rollback']>>>>
  settingsUninstall: () => Promise<RemoteResult<Awaited<ReturnType<ClaudeCodeSettingsApi['uninstall']>>>>
  settingsGet: () => Promise<RemoteResult<ClaudeNativeSettings>>
  settingsUpdate: (input: Parameters<ClaudeCodeSettingsApi['updateSettings']>[0]) => Promise<RemoteResult<ClaudeNativeSettings>>
  settingsGlobalGet: () => Promise<RemoteResult<ClaudeGlobalSettingsView>>
  settingsGlobalUpdate: (changes: Record<string, string>) => Promise<RemoteResult<ClaudeGlobalSettingsView>>
}

const unwrap = async <T,>(operation: Promise<RemoteResult<T>>): Promise<T> => {
  const result = await operation
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '../../lib/typert.remote-client.js'
import type { RemoteResult, TypertRemoteNamespace } from '@deepseek-ai/dsh-typert-protocol'
import type { ClaudeCodeSettingsApi } from '../shared/types.js'
import { NS } from '@zerowallscience/plugin-base/client-helpers'
import { ClaudeCodeAction, type ClaudeCodeActionInjected } from './ClaudeCodeAction.js'
import { ClaudeCodeSettingsSection } from './ClaudeCodeSettingsSection.js'
import { CLAUDE_NS, en, zh } from './locales.js'

export const inject = ['slots', 'locale', 'remote.zerowallClaudeCode']

type ClaudeCodeRemote = TypertRemoteNamespace<'zerowallClaudeCode'>

export function bindClaudeCodeRemote(remote: ClaudeCodeRemote, sessionId: SessionId): ClaudeCodeActionInjected {
  const value = async <T,>(operation: Promise<RemoteResult<T>>): Promise<T> => {
    const result = await operation
    if (!result.ok) throw new Error(result.error.message)
    return result.value
  }
  return {
    getStatus: () => value(remote.status(sessionId)),
    start: prompt => value(remote.start(sessionId, prompt)),
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
  const remote = ctx.get('remote.zerowallClaudeCode') as ClaudeCodeRemote & ClaudeCodeSettingsRemote
  const settingsApi: ClaudeCodeSettingsApi = {
    status: async () => unwrap(remote.settingsStatus()),
    install: async () => unwrap(remote.settingsInstall()),
    rollback: async () => unwrap(remote.settingsRollback()),
    uninstall: async () => unwrap(remote.settingsUninstall()),
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
}

const unwrap = async <T,>(operation: Promise<RemoteResult<T>>): Promise<T> => {
  const result = await operation
  if (!result.ok) throw new Error(result.error.message)
  return result.value
}

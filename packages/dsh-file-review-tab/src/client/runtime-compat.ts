import type { Context } from '@deepseek-ai/cordis'
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
export type ClientContext = Omit<Context, 'sessions' | 'slots' | 'conversationEvents'> & { sessions: ISessions; slots: SlotRegistry }
export type { ISessions }
export type { SessionId } from '@deepseek-ai/dsh-session'
export type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
export type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
export type { ConversationNodeDefinition, ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client'

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@zerowallscience/plugin-account/remote'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { AiCloudAccountSnapshot, AiCloudSavedLogin } from '../shared/types.js'
import type { RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { GroupCatalogStore } from './group-catalog.js'
import { GroupedModelSelect } from './GroupedModelSelect.js'
import { MODEL_NS, zh, en } from './model-locales.js'
import { AccountSection } from './account-surface.js'
import { AiCloudAccountButton, type Actions } from './AiCloudAccountButton.tsx'
import { ManagedProviderCard } from './ManagedProviderCard.js'
import { NS, unwrapRemoteResult } from '@zerowallscience/plugin-base/client-helpers'

export const inject = ['slots', 'locale', 'remote', 'connection', 'remote.zerowallAccount', 'remote.session']

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(MODEL_NS, { zh, en }), 'account: model dictionaries')
  const t = ctx.locale.bind(NS)
  const modelText = ctx.locale.bind(MODEL_NS)
  const catalog = new GroupCatalogStore()
  ctx.effect(() => () => catalog.dispose())
  let identityRevision = 0
  // Resolve dotted remotes through the reflection API while this plugin fiber
  // owns the declared dependency. Reading the proxy property directly can
  // escape the fiber during model-sync callbacks and throw Cordis's
  // `without inject` error.
  const accountRemote = ctx.get('remote.zerowallAccount')
  const requireAccountRemote = () => {
    if (accountRemote === undefined) throw new Error('AI 云账户服务尚未连接，请稍后重试。')
    return accountRemote
  }
  const sessionRemote = ctx.get('remote.session')
  const accountResult = async (operation: () => Promise<RemoteResult<AiCloudAccountSnapshot>>, changesIdentity = false): Promise<AiCloudAccountSnapshot> => {
    if (changesIdentity) ++identityRevision
    const revision = identityRevision
    const result = unwrapRemoteResult('zerowall.account', await operation()) as AiCloudAccountSnapshot
    if (revision === identityRevision) catalog.update(result)
    return result
  }
  const refreshGroups = () => {
    if (accountRemote?.discoverModels === undefined) return
    void accountResult(() => accountRemote.discoverModels()).catch(() => undefined)
  }
  refreshGroups()
  ctx.on('connection/reset', () => { ++identityRevision; catalog.clear(); refreshGroups() })
  ctx.inject(['modelDirectories', 'sessions'], scope => {
    const models = scope.modelDirectories
    const sessions = scope.sessions
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model', priority: -20, locale: MODEL_NS,
      inject: sessionId => {
        const directory = models.directoryFor(sessionId)
        const available = sessions.subagentAddress(sessionId) === undefined
        return { catalog, available, directory: directory.store,
          load: () => { if (available) void directory.load().catch(() => {}) },
          select: selection => available ? directory.select(selection) : Promise.resolve(undefined),
        }
      },
    }, GroupedModelSelect))
  })
  ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({ name: 'settings.models.provider-card', key: 'zerowall-ai-cloud', locale: NS, inject: () => ({ getAccount: () => accountResult(() => requireAccountRemote().current()) }) }, ManagedProviderCard))
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'zerowall-ai-cloud', order: -20, locale: NS,
    inject: (): Actions => ({
      getAccount: () => accountResult(() => requireAccountRemote().current()),
      catalog,
      modelText,
      forgetLogin: async () => { unwrapRemoteResult('zerowall.account.forgetLogin', await requireAccountRemote().forgetLogin()) },
      savedLogin: async () => unwrapRemoteResult<AiCloudSavedLogin | undefined>('zerowall.account.savedLogin', await requireAccountRemote().savedLogin()),
      relogin: () => accountResult(() => requireAccountRemote().relogin(), true),
      getPublicConfig: async (gatewayBaseUrl?: string) => unwrapRemoteResult('zerowall.account.publicConfig', await requireAccountRemote().publicConfig(gatewayBaseUrl)),
      gateways: async () => unwrapRemoteResult('zerowall.account.gateways', await requireAccountRemote().gateways()),
      selectGateway: (baseUrl: string) => accountResult(() => requireAccountRemote().selectGateway(baseUrl), true),
      login: (email: string, password: string, rememberPassword: boolean) => accountResult(() => requireAccountRemote().login({ email, password, rememberPassword }), true),
      register: (email: string, password: string, verificationCode: string, rememberPassword: boolean, gatewayBaseUrl?: string) => accountResult(() => requireAccountRemote().register({ email, password, verificationCode, rememberPassword, ...(gatewayBaseUrl === undefined ? {} : { gatewayBaseUrl }) }), true),
      sendCode: async (email: string, gatewayBaseUrl?: string) => unwrapRemoteResult('zerowall.account.sendCode', await requireAccountRemote().sendCode({ email, ...(gatewayBaseUrl === undefined ? {} : { gatewayBaseUrl }) })),
      forgotPassword: async (email: string, gatewayBaseUrl?: string) => { unwrapRemoteResult('zerowall.account.forgotPassword', await requireAccountRemote().forgotPassword({ email, ...(gatewayBaseUrl === undefined ? {} : { gatewayBaseUrl }) })) },
      logout: async () => { ++identityRevision; catalog.clear(); unwrapRemoteResult('zerowall.account.logout', await requireAccountRemote().logout()) },
      discoverModels: () => accountResult(() => requireAccountRemote().discoverModels()),
      refreshModelCatalog: async () => {
        if (sessionRemote?.modelCatalog === undefined) return
        unwrapRemoteResult('zerowall.account.modelCatalog', await sessionRemote.modelCatalog())
      },
      checkoutInfo: async () => unwrapRemoteResult('zerowall.account.checkoutInfo', await requireAccountRemote().checkoutInfo()),
      listOrders: async () => unwrapRemoteResult('zerowall.account.listOrders', await requireAccountRemote().listOrders()),
      createOrder: async (amount: number, paymentType: string) => unwrapRemoteResult('zerowall.account.createOrder', await requireAccountRemote().createOrder({ amount, paymentType })),
      getOrder: async (orderId: number) => unwrapRemoteResult('zerowall.account.getOrder', await requireAccountRemote().getOrder({ orderId })),
      verifyOrder: async (outTradeNo: string) => unwrapRemoteResult('zerowall.account.verifyOrder', await requireAccountRemote().verifyOrder({ outTradeNo })),
    }),
  }, AiCloudAccountButton))
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'zerowall-account', order: 20, locale: NS, label: () => t('account.settingsNav') }, AccountSection))
}

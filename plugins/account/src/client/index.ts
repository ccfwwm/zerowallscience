import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@zerowallscience/plugin-account/remote'
import { AccountSection } from './account-surface.js'
import { AiCloudAccountButton } from './AiCloudAccountButton.tsx'
import { NS, unwrapRemoteResult } from '@zerowallscience/plugin-base/client-helpers'

export const inject = ['slots', 'locale', 'remote', 'connection', 'remote.zerowallAccount', 'remote.session']

export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
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
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'zerowall-ai-cloud', order: -20, locale: NS,
    inject: () => ({
      getAccount: async () => unwrapRemoteResult('zerowall.account.current', await requireAccountRemote().current()),
      forgetLogin: async () => { unwrapRemoteResult('zerowall.account.forgetLogin', await requireAccountRemote().forgetLogin()) },
      savedLogin: async () => unwrapRemoteResult('zerowall.account.savedLogin', await requireAccountRemote().savedLogin()),
      getPublicConfig: async (gatewayBaseUrl?: string) => unwrapRemoteResult('zerowall.account.publicConfig', await requireAccountRemote().publicConfig(gatewayBaseUrl)),
      gateways: async () => unwrapRemoteResult('zerowall.account.gateways', await requireAccountRemote().gateways()),
      selectGateway: async (baseUrl: string) => unwrapRemoteResult('zerowall.account.selectGateway', await requireAccountRemote().selectGateway(baseUrl)),
      login: async (email: string, password: string, rememberPassword: boolean) => unwrapRemoteResult('zerowall.account.login', await requireAccountRemote().login({ email, password, rememberPassword })),
      register: async (email: string, password: string, verificationCode: string, rememberPassword: boolean, gatewayBaseUrl?: string) => unwrapRemoteResult('zerowall.account.register', await requireAccountRemote().register({ email, password, verificationCode, rememberPassword, ...(gatewayBaseUrl === undefined ? {} : { gatewayBaseUrl }) })),
      sendCode: async (email: string, gatewayBaseUrl?: string) => unwrapRemoteResult('zerowall.account.sendCode', await requireAccountRemote().sendCode({ email, ...(gatewayBaseUrl === undefined ? {} : { gatewayBaseUrl }) })),
      forgotPassword: async (email: string, gatewayBaseUrl?: string) => { unwrapRemoteResult('zerowall.account.forgotPassword', await requireAccountRemote().forgotPassword({ email, ...(gatewayBaseUrl === undefined ? {} : { gatewayBaseUrl }) })) },
      logout: async () => { unwrapRemoteResult('zerowall.account.logout', await requireAccountRemote().logout()) },
      discoverModels: async () => unwrapRemoteResult('zerowall.account.discoverModels', await requireAccountRemote().discoverModels()),
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

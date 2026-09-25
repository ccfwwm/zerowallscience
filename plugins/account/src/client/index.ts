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
  const remote = ctx.remote
  const sessionRemote = ctx.get('remote.session') ?? remote?.session
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'zerowall-ai-cloud', order: -20, locale: NS,
    inject: () => ({
      getAccount: async () => unwrapRemoteResult('zerowall.account.current', await remote.zerowallAccount.current()),
      forgetLogin: async () => { unwrapRemoteResult('zerowall.account.forgetLogin', await remote.zerowallAccount.forgetLogin()) },
      savedLogin: async () => unwrapRemoteResult('zerowall.account.savedLogin', await remote.zerowallAccount.savedLogin()),
      getPublicConfig: async (gatewayBaseUrl?: string) => unwrapRemoteResult('zerowall.account.publicConfig', await remote.zerowallAccount.publicConfig(gatewayBaseUrl)),
      gateways: async () => unwrapRemoteResult('zerowall.account.gateways', await remote.zerowallAccount.gateways()),
      selectGateway: async (baseUrl: string) => unwrapRemoteResult('zerowall.account.selectGateway', await remote.zerowallAccount.selectGateway(baseUrl)),
      login: async (email: string, password: string, rememberPassword: boolean) => unwrapRemoteResult('zerowall.account.login', await remote.zerowallAccount.login({ email, password, rememberPassword })),
      register: async (email: string, password: string, verificationCode: string, rememberPassword: boolean, gatewayBaseUrl?: string) => unwrapRemoteResult('zerowall.account.register', await remote.zerowallAccount.register({ email, password, verificationCode, rememberPassword, ...(gatewayBaseUrl === undefined ? {} : { gatewayBaseUrl }) })),
      sendCode: async (email: string, gatewayBaseUrl?: string) => unwrapRemoteResult('zerowall.account.sendCode', await remote.zerowallAccount.sendCode({ email, ...(gatewayBaseUrl === undefined ? {} : { gatewayBaseUrl }) })),
      forgotPassword: async (email: string, gatewayBaseUrl?: string) => { unwrapRemoteResult('zerowall.account.forgotPassword', await remote.zerowallAccount.forgotPassword({ email, ...(gatewayBaseUrl === undefined ? {} : { gatewayBaseUrl }) })) },
      logout: async () => { unwrapRemoteResult('zerowall.account.logout', await remote.zerowallAccount.logout()) },
      discoverModels: async () => unwrapRemoteResult('zerowall.account.discoverModels', await remote.zerowallAccount.discoverModels()),
      refreshModelCatalog: async () => {
        if (sessionRemote?.modelCatalog === undefined) return
        unwrapRemoteResult('zerowall.account.modelCatalog', await sessionRemote.modelCatalog({ refresh: true }))
      },
      checkoutInfo: async () => unwrapRemoteResult('zerowall.account.checkoutInfo', await remote.zerowallAccount.checkoutInfo()),
      listOrders: async () => unwrapRemoteResult('zerowall.account.listOrders', await remote.zerowallAccount.listOrders()),
      createOrder: async (amount: number, paymentType: string) => unwrapRemoteResult('zerowall.account.createOrder', await remote.zerowallAccount.createOrder({ amount, paymentType })),
      getOrder: async (orderId: number) => unwrapRemoteResult('zerowall.account.getOrder', await remote.zerowallAccount.getOrder({ orderId })),
      verifyOrder: async (outTradeNo: string) => unwrapRemoteResult('zerowall.account.verifyOrder', await remote.zerowallAccount.verifyOrder({ outTradeNo })),
    }),
  }, AiCloudAccountButton))
  ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id: 'zerowall-account', order: 20, locale: NS, label: () => t('account.settingsNav') }, AccountSection))
}

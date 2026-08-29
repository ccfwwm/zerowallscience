import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import { AiCloudAccountButton } from './AiCloudAccountButton.tsx'
import { NS, unwrapRemoteResult } from '@zerowallscience/plugin-base/client-helpers'

export const inject = ['slots', 'remote', 'connection', 'remote.zerowallAccount']

export function apply(ctx: ClientContext): void {
  const api = (ctx.get('connection') as ConnectionHandle).api
  const remote = ctx.remote as any
  ctx.slots.inject('sidebar.footer.action', () => ctx.slots.register({
    name: 'sidebar.footer.action', id: 'zerowall-ai-cloud', order: -20, locale: NS,
    inject: () => ({
      getAccount: async () => unwrapRemoteResult('zerowall.account.current', await remote.zerowallAccount.current()),
      getPublicConfig: async () => unwrapRemoteResult('zerowall.account.publicConfig', await remote.zerowallAccount.publicConfig()),
      gateways: async () => unwrapRemoteResult('zerowall.account.gateways', await remote.zerowallAccount.gateways()),
      selectGateway: async (baseUrl: string) => unwrapRemoteResult('zerowall.account.selectGateway', await remote.zerowallAccount.selectGateway(baseUrl)),
      login: async (email: string, password: string) => unwrapRemoteResult('zerowall.account.login', await remote.zerowallAccount.login({ email, password })),
      register: async (email: string, password: string, verificationCode: string) => unwrapRemoteResult('zerowall.account.register', await remote.zerowallAccount.register({ email, password, verificationCode })),
      sendCode: async (email: string) => { unwrapRemoteResult('zerowall.account.sendCode', await remote.zerowallAccount.sendCode({ email })) },
      logout: async () => { unwrapRemoteResult('zerowall.account.logout', await remote.zerowallAccount.logout()) },
      discoverModels: async () => unwrapRemoteResult('zerowall.account.discoverModels', await remote.zerowallAccount.discoverModels()),
      checkoutInfo: async () => unwrapRemoteResult('zerowall.account.checkoutInfo', await remote.zerowallAccount.checkoutInfo()),
      listOrders: async () => unwrapRemoteResult('zerowall.account.listOrders', await remote.zerowallAccount.listOrders()),
      createOrder: async (amount: number, paymentType: string) => unwrapRemoteResult('zerowall.account.createOrder', await remote.zerowallAccount.createOrder({ amount, paymentType })),
      getOrder: async (orderId: number) => unwrapRemoteResult('zerowall.account.getOrder', await remote.zerowallAccount.getOrder({ orderId })),
      verifyOrder: async (outTradeNo: string) => unwrapRemoteResult('zerowall.account.verifyOrder', await remote.zerowallAccount.verifyOrder({ outTradeNo })),
      api,
    }),
  }, AiCloudAccountButton))
}

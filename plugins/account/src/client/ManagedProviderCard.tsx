import { useEffect, useState } from 'react'
import { accountSurface } from './account-surface.js'
import type { AiCloudAccountView } from './AiCloudAccountButton.js'

export function ManagedProviderCard({ getAccount }: { getAccount: () => Promise<AiCloudAccountView> }) {
  const [account, setAccount] = useState<AiCloudAccountView>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let active = true
    const refresh = () => { void getAccount().then(value => { if (active) { setAccount(value); setError(undefined) } }, () => { if (active) setError('账户状态暂不可用') }) }
    refresh(); const timer = setInterval(refresh, 15_000)
    return () => { active = false; clearInterval(timer) }
  }, [getAccount])
  return <div><p>{error ?? (account?.status === 'signedIn' ? `${account.email} · ${account.gatewayBaseUrl} · ${account.models.length} 个模型` : account ? '未登录' : '正在读取账户状态…')}</p><button type="button" onClick={() => accountSurface.open()}>{account?.status === 'signedIn' ? '管理账户与模型' : '登录 ZeroWall AI 云平台'}</button></div>
}

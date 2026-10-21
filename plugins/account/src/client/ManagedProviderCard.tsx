import { useEffect, useState } from 'react'
import { ExternalLink, Settings2 } from 'lucide-react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from '@zerowallscience/plugin-base/client-helpers'
import { accountSurface } from './account-surface.js'
import type { AiCloudAccountView } from './AiCloudAccountButton.js'
import { accountConnection, gatewayPlatformUrl, openPlatform } from './platform.js'
import css from './AiCloudAccountButton.module.css'

export function ManagedProviderCard({ getAccount, t }: { getAccount: () => Promise<AiCloudAccountView> } & PropsLocale<typeof NS>) {
  const [account, setAccount] = useState<AiCloudAccountView>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    let active = true
    const refresh = () => { void getAccount().then(value => { if (active) { setAccount(value); setError(undefined) } }, () => { if (active) setError('账户状态暂不可用') }) }
    refresh(); const timer = setInterval(refresh, 15_000)
    return () => { active = false; clearInterval(timer) }
  }, [getAccount])
  const connection = accountConnection(account, error !== undefined)
  const platformUrl = gatewayPlatformUrl(account?.gatewayBaseUrl)
  const signedIn = account?.status === 'signedIn'
  return <div className={css.managedProvider}>
    <div className={css.providerMeta}><span className={css.connectionBadge} data-connection={connection} role="status"><i aria-hidden="true" />{t(`account.connection.${connection}`)}</span>{signedIn && <span>{t('account.modelCount', { count: account.models.length })}</span>}</div>
    <p className={css.providerIdentity}>{signedIn ? account.email : t('account.providerDescription')}</p>
    {platformUrl && <span className={css.providerGateway}>{new URL(platformUrl).hostname}</span>}
    <div className={css.providerActions}><button className={css.secondary} type="button" onClick={() => accountSurface.open()}><Settings2 size={16} aria-hidden="true" />{t(signedIn ? 'account.manage' : 'account.providerLogin')}</button>{platformUrl && <button className={css.externalButton} type="button" onClick={() => openPlatform(platformUrl)}><ExternalLink size={16} aria-hidden="true" />{t('account.openPlatform')}</button>}</div>
  </div>
}

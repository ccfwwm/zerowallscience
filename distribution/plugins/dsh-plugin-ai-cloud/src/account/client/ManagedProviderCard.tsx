import { useEffect, useState } from 'react'
import { ExternalLink, Settings2 } from 'lucide-react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from '../../base-client-helpers.js'
import type { AiCloudAccountView } from './AiCloudAccountButton.js'
import { accountConnection, gatewayPlatformUrl, openPlatform } from './platform.js'
import css from './AiCloudAccountButton.module.css'

export function ManagedProviderCard({ getAccount, openAccount, t }: { openAccount: () => void; getAccount: () => Promise<AiCloudAccountView> } & PropsLocale<typeof NS>) {
  const [account, setAccount] = useState<AiCloudAccountView>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    const refresh = () => { void getAccount().then(value => { if (active) { setAccount(value); setFailed(false) } }, () => { if (active) setFailed(true) }) }
    refresh(); const timer = setInterval(refresh, 15_000)
    return () => { active = false; clearInterval(timer) }
  }, [getAccount])
  const connection = accountConnection(account, failed)
  const platformUrl = gatewayPlatformUrl(account?.gatewayBaseUrl)
  const signedIn = account?.status === 'signedIn'
  return <div className={css.managedProvider}>
    <div className={css.providerMeta}><span className={css.connectionBadge} data-connection={connection} role="status"><i aria-hidden="true" />{t(`account.connection.${connection}`)}</span>{signedIn && <span>{t('account.modelCount', { count: account.models.length })}</span>}</div>
    <p className={css.providerIdentity}>{signedIn ? account.email : t('account.providerDescription')}</p>
    {platformUrl && <span className={css.providerGateway}>{new URL(platformUrl).hostname}</span>}
    <div className={css.providerActions}><button className={css.secondary} type="button" onClick={() => openAccount()}><Settings2 size={16} aria-hidden="true" />{t(signedIn ? 'account.manage' : 'account.providerLogin')}</button>{platformUrl && <button className={css.externalButton} type="button" onClick={() => openPlatform(platformUrl)}><ExternalLink size={16} aria-hidden="true" />{t('account.openPlatform')}</button>}</div>
  </div>
}

import type { AiCloudAccountView } from './AiCloudAccountButton.js'

export function gatewayPlatformUrl(baseUrl = 'https://hkcode.aicodeme.xyz'): string | undefined {
  try {
    const url = new URL(baseUrl)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !['hkcode.aicodeme.xyz', 'code.aicodeme.xyz', 'code.aicodeme.cn'].includes(url.hostname)) return undefined
    return url.origin
  } catch { return undefined }
}

export function accountConnection(account?: AiCloudAccountView, unavailable = false): 'loading' | 'online' | 'offline' | 'expired' | 'unavailable' {
  if (unavailable || account?.status === 'signedIn' && account.balanceFreshness === 'stale') return 'unavailable'
  if (account === undefined) return 'loading'
  if (account.status === 'authExpired') return 'expired'
  return account.status === 'signedIn' ? 'online' : 'offline'
}

export function openPlatform(url: string): void { window.open(url, '_blank', 'noopener,noreferrer') }

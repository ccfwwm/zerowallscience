export type ReleaseChannel = 'preview' | 'stable'

export interface DesktopIdentity {
  channel: ReleaseChannel
  appId: string
  productName: string
  userDataDirectory: string
}

export function resolveDesktopIdentity(channel: unknown): DesktopIdentity {
  if (channel === 'stable') {
    return {
      channel: 'stable',
      appId: 'com.zerowall.science',
      productName: 'ZeroWall Science',
      userDataDirectory: 'zerowall-science',
    }
  }
  return {
    channel: 'preview',
    appId: 'com.zerowall.science.preview',
    productName: 'ZeroWall Science',
    userDataDirectory: 'zerowall-science-preview',
  }
}

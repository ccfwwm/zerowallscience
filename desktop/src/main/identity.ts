export type ReleaseChannel = 'preview' | 'stable'

export interface DesktopIdentity {
  channel: ReleaseChannel
  productName: string
  userDataDirectory: string
}

export function resolveDesktopIdentity(channel: unknown): DesktopIdentity {
  if (channel === 'stable') {
    return {
      channel: 'stable',
      productName: 'ZeroWallScience',
      userDataDirectory: 'zerowall-science',
    }
  }
  return {
    channel: 'preview',
    productName: 'ZeroWallScience Preview',
    userDataDirectory: 'zerowall-science-preview',
  }
}

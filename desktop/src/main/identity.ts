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
      userDataDirectory: 'zerowall-science-3',
    }
  }
  return {
    channel: 'preview',
    productName: 'ZeroWallScience Preview',
    userDataDirectory: 'zerowall-science-3-preview',
  }
}

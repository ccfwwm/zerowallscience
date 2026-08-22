export type WechatGranularity = 'detailed' | 'standard' | 'summary'

export type WechatWorkspaceScope = 'all' | { workspaceIds: string[] }

export type WechatWorkspace = { id: string; title: string; path: string }

export type WechatQrState =
  | { kind: 'none' }
  | { kind: 'scan'; qrcode: string; status: number; png: string; verifyCode?: 'needed' | 'wrong' | 'blocked' }
  | { kind: 'logged-in'; userId: string; userName: string }

export type WechatQrPayload = {
  ok: boolean
  state: WechatQrState
  url?: string
  user?: { id: string; name: string }
  puppet: string
  settings: { granularity: WechatGranularity; workspaceScope: WechatWorkspaceScope }
  workspaces: WechatWorkspace[]
}

/**
 * dsh-weixin-clawbot 的浏览器半部分：侧边栏「微信机器人」入口 + 配对管理弹窗。
 *
 * 弹窗对齐 zcode Bot Channel 微信管理页：关联机器人（扫码/解绑）、
 * 回复颗粒度、工作区访问范围。轮询 GET /wechat/qrcode，
 * 设置写入 POST /wechat/settings，解绑 POST /wechat/logout。
 *
 * @module dsh-weixin-clawbot/client
 */

import { useCallback, useEffect, useRef, useState, type JSX } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// 引入 ui-sidebar 的 SlotMap 声明合并与 footer action owner props 类型。
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SidebarFooterActionOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import {
  IconCheckOutline14,
  IconChevronDownOutline14,
  IconCloseOutline16,
  IconCopyOutline16,
  IconRightUpOutline14,
  Menu,
  Modal,
  StateDot,
  Tooltip,
  writeClipboard,
} from '@deepseek-ai/dsh-client-ui-primitives'

import type { WechatQrPayload } from '../shared/types.js'
import cssText from './wechat.css?inline'

// 模块加载器在工厂执行后立即认领此时存在的无主 <style> 标签，
// 因此注入必须发生在模块顶层（工厂体内）而不是 apply() 里。
if (typeof document !== 'undefined') {
  const style = document.createElement('style')
  style.setAttribute('data-zerowall-plugin-css', '@zerowallscience/plugin-wechat')
  document.head.append(style)
  style.textContent = cssText
}

/** Services required by the client plugin. */
export const inject = ['slots']

/** 轮询载荷（与主机 WechatQrPayload 一致）。 */
type QrPayload = WechatQrPayload
type Granularity = QrPayload['settings']['granularity']

const GRANULARITY_ITEMS: ReadonlyArray<{ id: Granularity; label: string }> = [
  { id: 'detailed', label: '完整回复' },
  { id: 'standard', label: '标准回复' },
  { id: 'summary', label: '摘要回复' },
]

/** wechaty ScanStatus（0/1/2/3/4/5）→ 用户可读文案；不暴露状态码。 */
function scanHint(status: number): string {
  if (status === 3) return '已扫码，请在手机上确认'
  if (status === 4) return '已确认，正在登录…'
  if (status === 5 || status === 1) return '二维码已过期，正在获取新码…'
  return '等待手机扫码'
}

/** 整体状态：StateDot 语义 + 一行文案（状态行与入口 tooltip 共用）。 */
function statusOf(
  payload: QrPayload | null,
  error: string | null,
): { dot: 'done' | 'warning' | 'ongoing' | 'error'; text: string } {
  if (error !== null) return { dot: 'error', text: '连接中断，正在重试…' }
  if (payload === null) return { dot: 'ongoing', text: '微信后端启动中…' }
  switch (payload.state.kind) {
    case 'none':
      return { dot: 'ongoing', text: '微信后端启动中…' }
    case 'scan':
      return { dot: 'ongoing', text: scanHint(payload.state.status) }
    case 'logged-in':
      return {
        dot: 'done',
        text: `已连通：${payload.user?.name ?? payload.state.userName}`,
      }
    case 'failed':
      return { dot: 'error', text: payload.state.message }
  }
}

/** 仅在用户主动打开远程设置时轮询，避免首次启动产生微信网络请求。 */
function useQrPoll(open: boolean): {
  payload: QrPayload | null
  error: string | null
  refresh: () => void
} {
  const [payload, setPayload] = useState<QrPayload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const alive = useRef(true)

  useEffect(() => {
    if (!open) return
    alive.current = true
    const poll = async () => {
      try {
        const response = await fetch('/wechat/qrcode', { cache: 'no-store' })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = (await response.json()) as QrPayload
        if (alive.current) {
          setPayload(data)
          setError(null)
        }
      } catch (err) {
        if (alive.current) setError(String(err))
      }
    }
    void poll()
    const timer = setInterval(() => void poll(), 2000)
    return () => {
      alive.current = false
      clearInterval(timer)
    }
  }, [open, tick])

  const refresh = useCallback(() => setTick((value) => value + 1), [])
  return { payload, error, refresh }
}

async function postJson(path: string, body?: unknown): Promise<boolean> {
  try {
    const serialized = body === undefined ? undefined : JSON.stringify(body)
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      ...(serialized === undefined ? {} : { body: serialized }),
    })
    return response.ok
  } catch {
    return false
  }
}

/** 设置行：左侧标题/描述，右侧控件。 */
function SettingRow(props: { label: string; desc: string; children: JSX.Element }): JSX.Element {
  return (
    <div className="dsh-weixin-clawbot-row">
      <div className="dsh-weixin-clawbot-row-text">
        <div className="dsh-weixin-clawbot-row-label">{props.label}</div>
        <div className="dsh-weixin-clawbot-row-desc">{props.desc}</div>
      </div>
      {props.children}
    </div>
  )
}

/** 下拉选择（dsh Menu primitive，portal 防弹窗裁剪）。 */
function DropdownSelect(props: {
  label: string
  options: ReadonlyArray<{ id: string; label: string; desc?: string }>
  value: string
  onSelect: (id: string) => void
  disabled?: boolean
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const selected = props.options.find((option) => option.id === props.value)
  return (
    <Menu
      open={open}
      onClose={() => setOpen(false)}
      portal
      align="end"
      items={props.options.map((option) => ({
        id: option.id,
        label: option.desc !== undefined ? `${option.label}（${option.desc}）` : option.label,
      }))}
      selectedId={props.value}
      onSelect={(id) => {
        setOpen(false)
        if (id !== props.value) props.onSelect(id)
      }}
      anchor={
        <button
          type="button"
          className="dsh-weixin-clawbot-select"
          disabled={props.disabled}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="dsh-weixin-clawbot-select-label">{selected?.label ?? props.label}</span>
          <IconChevronDownOutline14 size={14} />
        </button>
      }
    />
  )
}

/** 工作区访问范围多选列表（zcode 同款 checkbox 行）。 */
function WorkspaceScopeList(props: {
  /** 展示用的 scope（乐观覆盖优先）。 */
  scope: 'all' | { workspaceIds: string[] }
  disabled: boolean
  workspaces: ReadonlyArray<{ id: string; title: string; path: string }>
  onAll: () => void
  onToggle: (workspaceId: string) => void
}): JSX.Element {
  const scope: 'all' | { workspaceIds: string[] } = props.scope
  const isAll = scope === 'all'
  const selected: string[] = isAll ? [] : scope.workspaceIds

  const row = (props2: {
    key: string
    checked: boolean
    title: string
    path?: string
    onToggle: () => void
  }): JSX.Element => (
    <button
      key={props2.key}
      type="button"
      className="dsh-weixin-clawbot-check-row"
      disabled={props.disabled}
      role="menuitemcheckbox"
      aria-checked={props2.checked}
      onClick={props2.onToggle}
    >
      <span className="dsh-weixin-clawbot-check-box" data-checked={props2.checked}>
        {props2.checked && <IconCheckOutline14 size={12} />}
      </span>
      <span className="dsh-weixin-clawbot-check-text">
        <span className="dsh-weixin-clawbot-check-title">{props2.title}</span>
        {props2.path !== undefined && <span className="dsh-weixin-clawbot-check-path">{props2.path}</span>}
      </span>
    </button>
  )

  return (
    <div className="dsh-weixin-clawbot-check-list" role="group" aria-label="工作区访问范围">
      {row({
        key: 'all',
        checked: isAll,
        title: '所有工作区',
        onToggle: () => {
          if (!isAll) props.onAll()
        },
      })}
      {props.workspaces.map((workspace) =>
        row({
          key: workspace.id,
          checked: selected.includes(workspace.id),
          title: workspace.title,
          path: workspace.path,
          onToggle: () => props.onToggle(workspace.id),
        }),
      )}
      {props.workspaces.length === 0 && (
        <div className="dsh-weixin-clawbot-check-empty">DSH 里还没有已注册的工作区。</div>
      )}
    </div>
  )
}

/** iLink 配对码输入行：手机微信显示数字，输入后 POST /wechat/verify。 */
function VerifyCodeRow(props: { state: 'needed' | 'wrong' | 'blocked' }): JSX.Element {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  if (props.state === 'blocked') {
    return (
      <div className="dsh-weixin-clawbot-note">
        <span aria-hidden="true">⛔</span>
        <span>配对码多次输入错误，请稍后等二维码自动刷新后重试。</span>
      </div>
    )
  }

  return (
    <div className="dsh-weixin-clawbot-verify">
      <span className="dsh-weixin-clawbot-verify-label">
        {props.state === 'wrong' ? '❌ 配对码不正确，请重新输入：' : '输入手机微信上显示的数字，完成配对：'}
      </span>
      <input
        className="dsh-weixin-clawbot-verify-input"
        value={code}
        inputMode="numeric"
        autoFocus
        placeholder="配对码"
        onChange={(event) => setCode(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && code.trim() !== '' && !busy) {
            setBusy(true)
            void postJson('/wechat/verify', { code: code.trim() }).finally(() => setBusy(false))
          }
        }}
      />
      <button
        type="button"
        className="dsh-weixin-clawbot-select"
        disabled={code.trim() === '' || busy}
        onClick={() => {
          setBusy(true)
          void postJson('/wechat/verify', { code: code.trim() }).finally(() => setBusy(false))
        }}
      >
        提交
      </button>
    </div>
  )
}

/** 配对管理弹窗主体（headless Modal：自绘 header/关闭钮，chrome 走 Modal）。 */
function WechatDialog(props: {
  open: boolean
  onClose: () => void
  payload: QrPayload | null
  error: string | null
  refresh: () => void
}): JSX.Element {
  const [copied, setCopied] = useState(false)
  // 乐观工作区范围：POST 成功后立即生效，等轮询追上（值一致）后清除，
  // 避免快速连点时基于旧列表计算下一次勾选。
  const [optimisticScope, setOptimisticScope] = useState<'all' | { workspaceIds: string[] } | null>(null)
  const status = statusOf(props.payload, props.error)
  const state = props.payload?.state
  const settings = props.payload?.settings
  const workspaces = props.payload?.workspaces ?? []
  const effectiveScope = optimisticScope ?? settings?.workspaceScope ?? 'all'

  useEffect(() => {
    if (
      optimisticScope !== null
      && JSON.stringify(settings?.workspaceScope) === JSON.stringify(optimisticScope)
    ) {
      setOptimisticScope(null)
    }
  }, [settings, optimisticScope])

  // 权威 scope 走 ref：同一渲染批次里的连点也能看到彼此的结果。
  const scopeRef = useRef<'all' | { workspaceIds: string[] }>(effectiveScope)
  scopeRef.current = effectiveScope
  const applyScope = (next: 'all' | { workspaceIds: string[] }) => {
    scopeRef.current = next
    setOptimisticScope(next)
    void postJson('/wechat/settings', { workspaceScope: next }).then((ok) => {
      if (ok) props.refresh()
      else setOptimisticScope(null)
    })
  }

  const copyLink = async () => {
    if (props.payload?.url === undefined) return
    if (await writeClipboard(props.payload.url)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const updateSettings = async (patch: Record<string, unknown>) => {
    if (await postJson('/wechat/settings', patch)) props.refresh()
  }

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title="微信机器人"
      closeLabel="关闭"
      className="dsh-weixin-clawbot-dialog"
      headless
    >
      <div className="dsh-weixin-clawbot-frame">
        <div className="dsh-weixin-clawbot-header">
          <span className="dsh-weixin-clawbot-logo" aria-hidden="true">
            <WechatGlyph />
          </span>
          <div className="dsh-weixin-clawbot-header-main">
            <h2 className="dsh-weixin-clawbot-title">微信机器人</h2>
            <p className="dsh-weixin-clawbot-subtitle">在微信里远程操控 DSH agent。</p>
          </div>
          <button type="button" className="dsh-weixin-clawbot-close" aria-label="关闭" onClick={props.onClose}>
            <IconCloseOutline16 size={14} />
          </button>
        </div>

        <div className="dsh-weixin-clawbot-statusline">
          <StateDot state={status.dot} />
          <span>{status.text}</span>
        </div>

        <div className="dsh-weixin-clawbot-section">
          <div className="dsh-weixin-clawbot-section-title">关联机器人</div>
          <div className="dsh-weixin-clawbot-section-desc">扫码后自动保存凭据。</div>

          {state?.kind === 'scan' && (
            <>
              <div className="dsh-weixin-clawbot-qr-card">
                {state.png ? (
                  <img className="dsh-weixin-clawbot-qr-img" src={state.png} alt="微信登录二维码" />
                ) : (
                  <div
                    className="dsh-weixin-clawbot-qr-img"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#888',
                      fontSize: 13,
                    }}
                  >
                    二维码生成中…
                  </div>
                )}
              </div>
              <div className="dsh-weixin-clawbot-qr-hint">{scanHint(state.status)}</div>
              {state.verifyCode !== undefined && <VerifyCodeRow state={state.verifyCode} />}
              {props.payload?.url !== undefined && state.verifyCode === undefined && (
                <div className="dsh-weixin-clawbot-linkrow">
                  <span>无法扫码？在手机浏览器打开链接</span>
                  <button type="button" className="dsh-weixin-clawbot-linkbtn" onClick={() => void copyLink()}>
                    {copied ? <IconCheckOutline14 size={14} /> : <IconCopyOutline16 size={14} />}
                    {copied ? '已复制' : '复制'}
                  </button>
                  <a
                    className="dsh-weixin-clawbot-linkbtn"
                    href={props.payload.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <IconRightUpOutline14 size={14} />
                  </a>
                </div>
              )}
            </>
          )}

          {state?.kind === 'logged-in' && (
            <>
              <div className="dsh-weixin-clawbot-connected">
                <StateDot state="done" />
                <div className="dsh-weixin-clawbot-connected-main">
                  <span className="dsh-weixin-clawbot-connected-name">
                    {props.payload?.user?.name ?? state.userName}
                  </span>
                  <span className="dsh-weixin-clawbot-connected-id">{state.userId}</span>
                </div>
                <button
                  type="button"
                  className="dsh-weixin-clawbot-select"
                  onClick={() => {
                    void postJson('/wechat/logout').then(props.refresh)
                  }}
                >
                  解绑
                </button>
              </div>
              <div className="dsh-weixin-clawbot-note">
                <span aria-hidden="true">ⓘ</span>
                <span>请在微信里向机器人发送任意消息；首次消息会收到欢迎和帮助。</span>
              </div>
            </>
          )}

          {(state === undefined || state.kind === 'none') && (
            <div className="dsh-weixin-clawbot-qr-hint">等待微信后端就绪后显示二维码…</div>
          )}
          {state?.kind === 'failed' && (
            <div className="dsh-weixin-clawbot-qr-hint">
              <span>{state.message}</span>
              <button type="button" className="dsh-weixin-clawbot-linkbtn" onClick={() => void postJson('/wechat/retry').then(props.refresh)}>重试</button>
            </div>
          )}
        </div>

        <div className="dsh-weixin-clawbot-section">
          <div className="dsh-weixin-clawbot-section-title">机器人回复颗粒度</div>
          <SettingRow label="消息详细程度" desc="控制机器人回复的详细程度。">
            <DropdownSelect
              label="标准回复"
              options={GRANULARITY_ITEMS}
              value={settings?.granularity ?? 'standard'}
              disabled={settings === undefined}
              onSelect={(id) => {
                void updateSettings({ granularity: id })
              }}
            />
          </SettingRow>
        </div>

        <div className="dsh-weixin-clawbot-section">
          <div className="dsh-weixin-clawbot-section-title">工作区访问范围</div>
          <div className="dsh-weixin-clawbot-section-desc">
            勾选机器人可以使用的工作区；在微信里发送 /ws 切换。
          </div>
          <WorkspaceScopeList
            scope={effectiveScope}
            disabled={settings === undefined}
            workspaces={workspaces}
            onAll={() => applyScope('all')}
            onToggle={(workspaceId) => {
              const current = scopeRef.current
              const selected: string[] =
                current === 'all' ? [] : current.workspaceIds
              const next = selected.includes(workspaceId)
                ? selected.filter((id) => id !== workspaceId)
                : [...selected, workspaceId]
              // 取消最后一个工作区 = 回到不限制
              applyScope(next.length === 0 ? 'all' : { workspaceIds: next })
            }}
          />
        </div>
      </div>
    </Modal>
  )
}

/** 微信 logo 描边图形（白色，放在品牌绿底上）。 */
function WechatGlyph(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M8.5 5.5c-3.6 0-6.5 2.4-6.5 5.4 0 1.7.9 3.2 2.4 4.2l-.6 2.1 2.4-1.2c.7.2 1.5.3 2.3.3h.4a5.5 5.5 0 0 1-.2-1.5c0-3 2.9-5.4 6.4-5.4h.5C15.9 7.2 12.5 5.5 8.5 5.5Z" />
      <path d="M15.9 9.5c-3.3 0-6 2.2-6 4.9s2.7 4.9 6 4.9c.7 0 1.3-.1 1.9-.3l2.1 1-.5-1.8c1.3-.9 2.5-2.2 2.5-3.8 0-2.7-2.7-4.9-6-4.9Z" />
    </svg>
  )
}

/** 手机图标（入口用，currentColor）。 */
function PhoneGlyph(): JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <line x1="11" y1="18" x2="13" y2="18" />
    </svg>
  )
}

/** 侧边栏 footer 的微信入口：rail 显示图标，wide 显示图标 + 文字。 */
function WechatFooterAction(props: SidebarFooterActionOwnerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const { payload, error, refresh } = useQrPoll(open)
  const status = statusOf(payload, error)
  const connected = payload?.state.kind === 'logged-in'
  // 入口角标：已连接=绿，连接失败（后端不可达/轮询错误）=红，等待态不显示
  const badgeTone = status.dot === 'done' ? 'ok' : status.dot === 'error' ? 'error' : null

  return (
    <>
      <Tooltip label={`微信机器人 · ${status.text}`} side="right" delayMs={300}>
        <button
          type="button"
          className={`dsh-weixin-clawbot-entry${props.wide ? ' dsh-weixin-clawbot-entry-wide' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <PhoneGlyph />
          {props.wide && <span>微信</span>}
          {badgeTone !== null && (
            <span
              className={`dsh-weixin-clawbot-badge${badgeTone === 'error' ? ' dsh-weixin-clawbot-badge-error' : ''}`}
              aria-hidden="true"
            />
          )}
        </button>
      </Tooltip>
      <WechatDialog
        open={open}
        onClose={() => setOpen(false)}
        payload={payload}
        error={error}
        refresh={refresh}
      />
    </>
  )
}

/** Registers the WeChat entry into the sidebar footer actions slot. */
export function apply(ctx: ClientContext): void {
  ctx.effect(
    () =>
      ctx.slots.inject('sidebar.footer.action', () =>
        ctx.slots.register({
          name: 'sidebar.footer.action',
          id: 'wechat',
          order: 50,
          inject: () => ({}),
        }, WechatFooterAction)),
    'dsh-weixin-clawbot: sidebar footer action',
  )
}

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ClaudeCodeStatus, ClaudeCodeTurn } from '../shared/types.js'
import css from './ClaudeCodeAction.module.css'

export interface ClaudeCodeActionInjected {
  getStatus: () => Promise<ClaudeCodeStatus>
  start: (prompt: string) => Promise<ClaudeCodeTurn>
  read: () => Promise<ClaudeCodeTurn | null>
  stop: () => Promise<void>
  install: () => Promise<ClaudeCodeStatus>
  rollback: () => Promise<ClaudeCodeStatus>
  uninstall: () => Promise<ClaudeCodeStatus>
  clear: () => Promise<void>
}

export type ClaudeCodeActionProps = PropsRuntime<'conversation.session.header.actions'> & InjectFace<ClaudeCodeActionInjected>

const SAFE_ERRORS = new Set([
  '请先停止 Claude Code，再管理安装。', '请先停止当前 Claude Code 任务。', '请先安装 Claude Code。',
  '请输入 1 到 64000 字的 Claude Code 指令。', '当前会话没有有效的项目目录。', '当前会话没有选择模型。',
  '当前模型路由没有可读取的协议配置。', '当前路由没有可用的 API endpoint。', '当前路由的 API endpoint 不受支持。',
  '当前模型路由没有可用凭据，请在平台对话设置中配置。',
  '当前选择的推理强度不受此 Claude Code 版本支持，请在当前对话调整。',
  'Claude Code 仅支持明确声明为 Anthropic Messages 的模型路由，请在当前对话切换模型。',
  'Claude Code 安装与运行仅适用于 ZeroWall Desktop。', 'Claude Code 正在运行，请等待或停止当前任务。',
  'Claude Code 安装管理未完成；现有有效安装会被保留，请重试。', 'Claude Code 任务已停止。',
  'Claude Code 无法准备当前会话，请检查模型配置与资源状态。',
])
const safeError = (reason: unknown): string => reason instanceof Error && SAFE_ERRORS.has(reason.message)
  ? reason.message : 'Claude Code 操作失败，请检查安装与模型配置后重试。'

export function ClaudeCodeAction(props: ClaudeCodeActionProps) {
  const { getStatus, read } = props
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<ClaudeCodeStatus>()
  const [turn, setTurn] = useState<ClaudeCodeTurn | null>(null)
  const [prompt, setPrompt] = useState('')
  const [pending, setPending] = useState(false)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    let active = true
    const refresh = async () => {
      try {
        const [nextStatus, nextTurn] = await Promise.all([getStatus(), read()])
        if (active) { setStatus(nextStatus); setTurn(nextTurn) }
      } catch { if (active) setError('无法读取 Claude Code 状态。') }
    }
    void refresh()
    const timer = setInterval(() => { void refresh() }, 1200)
    return () => { active = false; clearInterval(timer) }
  }, [open, getStatus, read])

  const run = async (operation: () => Promise<void>): Promise<void> => {
    if (pending) return
    setPending(true)
    setError('')
    try { await operation() } catch (reason) {
      setError(safeError(reason))
    } finally { setPending(false) }
  }

  const start = () => run(async () => {
    if (!prompt.trim()) { setError('请先描述要交给 Claude Code 的任务。'); return }
    setStarting(true)
    try {
      const next = await props.start(prompt.trim())
      setTurn(next)
      if (next.message) setError(next.message)
    } finally { setStarting(false) }
  })

  const stop = async (): Promise<void> => {
    if (stopping) return
    setStopping(true)
    try { await props.stop() } catch (reason) { setError(safeError(reason)) }
    finally { setStopping(false) }
  }

  const manage = (operation: 'install' | 'rollback' | 'uninstall') => run(async () => {
    if (operation === 'uninstall' && !window.confirm('卸载独立安装的 Claude Code 运行环境？')) return
    const next = await props[operation]()
    setStatus(next)
    if (operation === 'uninstall') { setTurn(null); setError('') }
  })

  return <>
    <button type="button" className={css.launch} aria-label="Claude Code" title="Claude Code" onClick={() => setOpen(true)}>Claude Code</button>
    {open && createPortal(
      <div className={css.backdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false) }}>
        <section className={css.panel} role="dialog" aria-modal="true" aria-labelledby="claude-code-title">
          <header className={css.header}>
            <div><h2 id="claude-code-title">Claude Code</h2><p>{status?.installed ? `CLI ${status.version ?? ''}` : status?.desktop === false ? '仅 ZeroWall Desktop 支持' : '尚未安装'}</p></div>
            <button type="button" className={css.iconButton} aria-label="关闭" onClick={() => setOpen(false)}>×</button>
          </header>
          <p className={css.hint}>使用当前对话选择的模型，允许编辑当前项目文件。</p>
          <div className={css.controls}>
            <button type="button" disabled={pending || status?.desktop === false} onClick={() => void manage('install')}>{status?.installed ? '更新 CLI' : '安装 CLI'}</button>
            {status?.rollbackAvailable && <button type="button" disabled={pending || status.running} onClick={() => void manage('rollback')}>回滚</button>}
            {status?.installed && <button type="button" disabled={pending || status.running} onClick={() => void manage('uninstall')}>卸载 CLI</button>}
            {(starting || status?.running || turn?.running) && <button type="button" disabled={stopping} onClick={() => void stop()}>停止</button>}
            {turn && !turn.running && <button type="button" disabled={pending} onClick={() => void run(async () => { await props.clear(); setTurn(null) })}>清空</button>}
          </div>
          {turn && <div className={css.route} aria-live="polite">{turn.provider} · {turn.model}{turn.running ? ' · 运行中' : turn.exitCode === 0 ? ' · 已完成' : ''}</div>}
          {(turn?.executablePath || status?.executablePath) && <details className={css.skipped}>
            <summary>运行诊断</summary>
            <p>应用独立 CLI 路径：<code>{turn?.executablePath || status?.executablePath}</code></p>
            <p>此路径来自应用内“安装 CLI”创建的独立运行时。</p>
          </details>}
          {turn?.skipped.length ? <details className={css.skipped}><summary>未同步资源（{turn.skipped.length}）</summary><ul>{turn.skipped.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></details> : null}
          <pre className={css.output} aria-live="polite">{turn?.output || (turn?.running ? '等待 Claude Code 输出…' : '运行结果会显示在这里。')}</pre>
          {error && <p className={css.error} role="alert">{error}</p>}
          <form className={css.form} onSubmit={event => { event.preventDefault(); void start() }}>
            <textarea aria-label="Claude Code 任务" value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={64000} placeholder="描述要在当前工作区完成的任务" disabled={pending || turn?.running === true} />
            <button type="submit" disabled={pending || status?.installed !== true || turn?.running === true || !prompt.trim()}>{pending ? '处理中…' : '运行'}</button>
          </form>
        </section>
      </div>, document.body)}
  </>
}

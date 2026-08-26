import { Github } from 'lucide-react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

export type GithubButtonProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'zerowall'>

export function GithubButton({ wide, t }: GithubButtonProps) {
  const label = t('github.project')
  return <a href="https://github.com/ccfwwm/zerowallscience" target="_blank" rel="noreferrer" title={label} aria-label={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 8, width: '100%', minHeight: 32, padding: '0 8px', boxSizing: 'border-box', color: 'var(--dsw-alias-label-primary, inherit)', textDecoration: 'none', borderRadius: 8, transition: 'background-color 120ms ease, color 120ms ease' }}>
    <Github size={18} aria-hidden="true" />{wide ? <span>{label}</span> : null}
  </a>
}

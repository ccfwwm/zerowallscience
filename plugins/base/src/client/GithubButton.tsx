import { Github } from 'lucide-react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SidebarFooterAction.module.css'

export type GithubButtonProps = PropsRuntime<'sidebar.footer.action'> & PropsLocale<'zerowall'>

export function GithubButton({ wide, t }: GithubButtonProps) {
  const label = t('github.project')
  return <a className={css.action} data-zerowall-footer-action href="https://github.com/ccfwwm/zerowallscience" target="_blank" rel="noreferrer" title={label} aria-label={label}>
    <span data-zerowall-footer-icon><Github size={18} aria-hidden="true" /></span>{wide ? <span>{label}</span> : null}
  </a>
}

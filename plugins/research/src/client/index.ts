export * from './view.js'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { FlaskConical } from 'lucide-react'
import { createElement } from 'react'
import { ScienceWorkbench } from './view.js'

export const inject = ['betterSidebar', 'remote', 'remote.zerowallResearch'] as const

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.betterSidebar.registerTab({
    id: 'zerowall:science-workbench',
    title: '科研工作台',
    description: '研究问题、数据契约、专业工具、证据与报告',
    icon: size => createElement(FlaskConical, { size }),
    single: true,
    order: 20,
    component: props => createElement(ScienceWorkbench, { ...props, remote: (ctx as any).remote.zerowallResearch }),
  }), 'zerowall: science workbench')
}

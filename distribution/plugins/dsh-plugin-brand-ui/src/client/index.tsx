import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ThemeTokenOverrides } from '@deepseek-ai/dsh-client-ui-theme/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import mark from './assets/zerowall-mark.png'

const PACKAGE_ID = '@zerowall/dsh-plugin-brand-ui'
const BRAND_TOKENS: ThemeTokenOverrides = {
  '--dsw-alias-brand-primary-new-colorprimary-new-color': { light: '#087f9c', dark: '#70d2e4' },
  '--dsw-alias-brand-primary': { light: '#12657e', dark: '#91dce9' },
  '--dsw-alias-brand-text': { light: '#123449', dark: '#e0eef5' },
  '--dsw-alias-bg-base': { light: '#fbfdff', dark: '#101b27' },
  '--dsw-alias-bg-layer-1': { light: '#ffffff', dark: '#152332' },
  '--dsw-alias-bg-layer-2': { light: '#f2f7fb', dark: '#1c2e40' },
  '--dsw-alias-bg-layer-3': { light: '#ffffff', dark: '#22364a' },
  '--dsw-alias-bg-module-platform': { light: '#f2f7fb', dark: '#152332' },
  '--dsw-alias-bg-overlay': { light: '#eaf2f8', dark: '#22364a' },
  '--dsw-alias-bg-mask-3': { light: 'rgba(15, 39, 60, 0.38)', dark: 'rgba(0, 8, 18, 0.66)' },
  '--dsw-alias-label-primary': { light: '#163248', dark: '#e3edf5' },
  '--dsw-alias-label-secondary': { light: '#4b6478', dark: '#b4c8d9' },
  '--dsw-alias-label-tertiary': { light: '#60778a', dark: '#99b1c6' },
  '--dsw-alias-border-l1': { light: '#e9f0f6', dark: '#24394c' },
  '--dsw-alias-border-l2': { light: '#dce7f0', dark: '#304a60' },
  '--dsw-alias-border-l3': { light: '#c9dae7', dark: '#47647c' },
  '--dsw-alias-button-primary-hover': { light: '#0d5269', dark: '#b4e8f0' },
  '--dsw-alias-button-info-fill': { light: '#087f9c', dark: '#70d2e4' },
  '--dsw-alias-button-info-hover': { light: '#086b84', dark: '#91dce9' },
  '--dsw-alias-link': { light: '#086c89', dark: '#80d8ea' },
  '--dsw-specific-sidebar-fill': { light: '#f0f5fa', dark: '#142332' },
  '--dsw-specific-sidebar-nav-item-active': { light: '#dfeef5', dark: '#234155' },
  '--dsw-specific-sidebar-nav-item-active-accent': { light: '#dfeef5', dark: '#234155' },
  '--dsw-specific-titlebar-fill': { light: '#f0f5fa', dark: '#142332' },
}

export const inject = ['slots', 'theme']

function BrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <img src={mark} width={size} height={size} alt="" aria-hidden="true" />
}

function BrandName() {
  return <span>ZeroWall Science</span>
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.theme.overrideTokens(PACKAGE_ID, BRAND_TOKENS), 'ZeroWall brand theme')
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark', priority: -100 }, BrandMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name', priority: -100 }, BrandName)
    }))
  ctx.slots.inject('conversation.hero.brand.mark', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.mark', priority: -100 }, BrandMark))
  ctx.slots.inject('conversation.hero.brand.title', () =>
    ctx.slots.register({ name: 'conversation.hero.brand.title', priority: -100 }, BrandName))
}

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './Brand.module.css'

type BrandMarkProps = HeroBrandMarkOwnerProps & SidebarBrandMarkOwnerProps

function BrandMark({ size, className }: BrandMarkProps) {
  return (
    <img
      className={`${css.mark}${className === undefined ? '' : ` ${className}`}`}
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.48)) }}
      src="/zerowall-icon.png"
      alt="ZeroWall Science"
      aria-label="ZeroWall Science"
    />
  )
}

function BrandName() {
  return <span className={css.name}>ZeroWall Science</span>
}

function ProductVersion() {
  return (
    <span className={css.version} aria-label="ZeroWall Science">
      <span>ZeroWall Science</span>
    </span>
  )
}

export function registerZeroWallBrand(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', () =>
      ctx.slots.inject('conversation.hero.brand.mark', () =>
        ctx.slots.inject('conversation.session.header.utilities', function* () {
          yield ctx.slots.register({ name: 'sidebar.brand.mark' }, BrandMark)
          yield ctx.slots.register({ name: 'sidebar.brand.name' }, BrandName)
          yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, BrandMark)
          yield ctx.slots.register({
            name: 'conversation.session.header.utilities',
            id: 'zerowall-product-version',
            order: -100,
          }, ProductVersion)
        }))))
}

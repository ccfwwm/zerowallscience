import type { Notification as NativeNotification, NotificationConstructorOptions } from 'electron'

export interface SessionNotification {
  title: string
  body: string
  tag: string
  sessionId?: string
}

export function parseSessionNotification(input: unknown): SessionNotification | undefined {
  if (!input || typeof input !== 'object') return undefined
  const value = input as Record<string, unknown>
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 256
    || typeof value.body !== 'string' || value.body.length > 4096
    || typeof value.tag !== 'string' || value.tag.length > 512
    || (value.sessionId !== undefined && (typeof value.sessionId !== 'string'
      || !value.sessionId || value.sessionId.length > 256 || /[\x00-\x1f]/u.test(value.sessionId)))) return undefined
  return value as unknown as SessionNotification
}

/** Keep native objects alive, replace only the same session/kind, and route
 * activation through the trusted renderer rather than accepting a URL. */
export class DesktopNotifications {
  private readonly active = new Map<string, NativeNotification>()

  constructor(private readonly ports: {
    supported: () => boolean
    create: (options: NotificationConstructorOptions) => NativeNotification
    activate: (sessionId?: string) => void
    icon: string
    failed: (message: string) => void
  }) {}

  show(input: unknown): boolean {
    const value = parseSessionNotification(input)
    if (!value || !this.ports.supported()) return false
    const key = `${value.sessionId ?? ''}:${value.tag}`
    this.active.get(key)?.close()
    // Bound retained native handles when many background tasks finish.
    if (this.active.size >= 64) {
      const oldest = this.active.keys().next().value
      if (oldest !== undefined) { this.active.get(oldest)?.close(); this.active.delete(oldest) }
    }
    try {
      const notification = this.ports.create({
        title: value.title, body: value.body, icon: this.ports.icon,
        // The existing per-event sound/volume controls own audio. Avoid a
        // second Windows chime (and respect the user's mute preference).
        silent: true,
      })
      this.active.set(key, notification)
      const release = () => { if (this.active.get(key) === notification) this.active.delete(key) }
      notification.on('click', () => { this.ports.activate(value.sessionId); notification.close(); release() })
      notification.on('close', release)
      notification.on('failed', (_event, error) => { release(); this.ports.failed(error) })
      notification.show()
      return true
    } catch (error) {
      this.active.delete(key)
      this.ports.failed(error instanceof Error ? error.message : String(error))
      return false
    }
  }
}

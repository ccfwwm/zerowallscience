import { accountGroupCatalog, type AiCloudAccountSnapshot, type AiCloudGroupCatalog, type AiCloudGroup } from '../shared/types.js'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'

const emptyCatalog = (): AiCloudGroupCatalog => ({ groups: [], routes: [] })

/** One plugin-lifetime cache; late responses lose access after account/gateway changes. */
export class GroupCatalogStore {
  private value = emptyCatalog()
  private revision = 0
  private disposed = false
  private listeners = new Set<() => void>()
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  getSnapshot = () => this.value
  private set(value: AiCloudGroupCatalog) {
    if (this.disposed || JSON.stringify(this.value) === JSON.stringify(value)) return
    this.value = value
    for (const listener of this.listeners) listener()
  }
  clear() { ++this.revision; this.set(emptyCatalog()) }
  update(account: AiCloudAccountSnapshot) { ++this.revision; this.set(accountGroupCatalog(account)) }
  async refresh(read: () => Promise<AiCloudGroupCatalog>) {
    const revision = ++this.revision
    try {
      const value = await read()
      if (!this.disposed && revision === this.revision) this.set(value)
    } catch { /* Metadata is advisory; model selection remains usable. */ }
  }
  dispose() { this.disposed = true; ++this.revision; this.listeners.clear() }
}

export interface GroupModel {
  providerId: string
  model: ModelDirectoryState['groups'][number]['models'][number]
}
export interface DisplayGroup {
  key: string
  name: string
  cloud: boolean
  metadata?: AiCloudGroup
  models: GroupModel[]
}

/** Join by exact route identity, never by display name or a guessed provider suffix. */
export function displayGroups(providers: ModelDirectoryState['groups'], catalog: AiCloudGroupCatalog): DisplayGroup[] {
  const metadata = new Map(catalog.groups.map(group => [group.groupId, group]))
  const routes = new Map(catalog.routes.map(route => [JSON.stringify([route.providerId, route.modelId]), route.groupId]))
  const groups = new Map<string, DisplayGroup>()
  const rank = (id: string) => id === 'deepseek-account' ? 0 : id === 'deepseek-official' ? 1 : 2
  for (const provider of [...providers].sort((a, b) => rank(a.id) - rank(b.id))) {
    for (const model of provider.models) {
      const groupId = routes.get(JSON.stringify([provider.id, model.id]))
      const group = groupId === undefined ? undefined : metadata.get(groupId)
      const key = groupId === undefined ? JSON.stringify(['provider', provider.id]) : JSON.stringify(['cloud', catalog.gatewayBaseUrl, groupId])
      let entry = groups.get(key)
      if (!entry) {
        entry = { key, name: group?.groupName ?? provider.name, cloud: groupId !== undefined, ...(group ? { metadata: group } : {}), models: [] }
        groups.set(key, entry)
      }
      entry.models.push({ providerId: provider.id, model })
    }
  }
  return [...groups.values()]
}

export function groupRate(group?: AiCloudGroup): string | undefined {
  const rate = group?.rateMultiplier
  return typeof rate === 'number' && Number.isFinite(rate) && rate >= 0 ? `${rate}×` : undefined
}

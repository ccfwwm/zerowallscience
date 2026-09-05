import Settings from '@deepseek-ai/dsh-settings'

export class MemorySettings extends Settings {
  readonly writable = true
  protected async load() { return {} }
  protected async persist() {}
}

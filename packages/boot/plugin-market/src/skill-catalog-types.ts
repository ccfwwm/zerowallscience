/** Online skill listings and the application's existing skill importer. */
export interface MarketSkill {
  readonly id: string
  readonly version: string
  readonly title: Record<string, string>
  readonly description: Record<string, string>
  readonly url: string
  readonly bytes: number
  readonly sha256: string
  readonly names: string[]
}

/** Catalog state retains successful listings when a refresh fails. */
export interface MarketSkillCatalog {
  readonly available: boolean
  readonly fetchedAt: string
  readonly entries: readonly (MarketSkill & { readonly status: 'available' | 'installed' | 'update'; readonly installedVersion?: string })[]
  readonly error?: { readonly code: 'catalog' | 'integrity' | 'changed' | 'install' | 'partial' | 'unavailable'; readonly diagnostic: string }
}

/** The application's skill manager owns imports and enablement. */
export interface MarketSkillInstaller {
  /** @returns Names currently supplied by the skill manager. */
  installed(): Promise<readonly string[]>
  /**
   * Import verified bytes through the existing skill manager and retain prior enablement.
   * @param path - Temporary verified ZIP file, valid until the promise settles.
   * @param names - Exact skill names the manifest declares.
   * @returns Completion after import and enablement are committed.
   * @throws If import or enablement fails; imported files may then require inspection.
   */
  install(path: string, names: readonly string[]): Promise<void>
}

import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-app-boot'
import type { BundleInfo, ChangeResult, InstallBundleOptions, PluginInstallRequestId, UpdateBundleOptions } from '@deepseek-ai/dsh-plugin-manager/types'

type MigrationContext = {
  profileContext: Pick<Context['profileContext'], 'dir' | 'home' | 'patchPath' | 'installAnchor'>
  pluginManager: {
    listBundles(): Promise<Pick<BundleInfo, 'name' | 'enabled' | 'installed' | 'availability' | 'version'>[]>
    installBundle(spec: string, options?: InstallBundleOptions): Promise<{
      application: ChangeResult['application']
      error?: { diagnostic?: string }
    }>
    updateBundle(name: string, version: string, options?: UpdateBundleOptions): Promise<{ result: ChangeResult }>
  }
}

export function migrateWindowsComputerUse(ctx: MigrationContext, requestId: PluginInstallRequestId, signal: AbortSignal): Promise<boolean>

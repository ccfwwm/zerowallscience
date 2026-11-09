/** One credential-free local object and its public checksum evidence. */
export interface QiniuAsset { path: string; key: string }
export interface QiniuReceipt { key: string; url: string; bytes: number; sha256: string; verifiedAt: string }
export interface QiniuReleaseStore {
  base: string
  exists(key: string): Promise<boolean>
  listPrefix(prefix: string, timeoutMs: number): Promise<string[]>
  upload(asset: QiniuAsset, mutable?: boolean): Promise<unknown>
  verify(asset: QiniuAsset): Promise<QiniuReceipt>
  refresh(keys: string[]): Promise<unknown>
}
/** Open the SDK without printing or persisting its credentials. */
export function openQiniuStore(env: NodeJS.ProcessEnv): Promise<QiniuReleaseStore>

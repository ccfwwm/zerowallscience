import type { StartupStatus } from '../shared/contracts.js'
import { redactResourceDiagnostic } from './resource-diagnostics.js'

/** Serialize verification failures without leaking filenames or credentials. */
export function startupFailure(error: unknown): Pick<StartupStatus, 'phase' | 'message' | 'diagnostics'> {
  const candidate = error !== null && typeof error === 'object' ? error as Record<string, unknown> : undefined
  const raw = candidate?.diagnostics !== null && typeof candidate?.diagnostics === 'object'
    ? candidate.diagnostics as Record<string, unknown> : undefined
  const count = (value: unknown): number => Array.isArray(value) ? value.length : 0
  const logical = raw?.logicalArchiveMismatch !== null && typeof raw?.logicalArchiveMismatch === 'object'
    ? raw.logicalArchiveMismatch as Record<string, unknown> : undefined
  const diagnostics: StartupStatus['diagnostics'] = raw === undefined ? undefined : {
    code: typeof candidate?.code === 'string' ? candidate.code : undefined,
    applicationVersion: typeof raw.applicationVersion === 'string' ? raw.applicationVersion : undefined,
    buildId: typeof raw.buildId === 'string' ? raw.buildId : undefined,
    contentDigest: typeof raw.contentDigest === 'string' ? raw.contentDigest : undefined,
    extraFiles: count(raw.extraFiles), missingFiles: count(raw.missingFiles),
    sizeMismatches: count(raw.sizeMismatches), hashMismatches: count(raw.hashMismatches),
    ...(logical ? { logicalArchiveMismatch: {
      extraFiles: count(logical.extraFiles), missingFiles: count(logical.missingFiles),
      sizeMismatches: count(logical.sizeMismatches), hashMismatches: count(logical.hashMismatches),
    } } : {}),
  }
  let message = error instanceof Error ? error.message : String(error)
  if (candidate?.code === 'OFFLINE_PROFILE_MISMATCH' && diagnostics) {
    message = [
      '离线运行时文件集合与签名清单不一致，桌面暂未启动。',
      `多余 ${diagnostics.extraFiles}、缺失 ${diagnostics.missingFiles}、大小不符 ${diagnostics.sizeMismatches}、哈希不符 ${diagnostics.hashMismatches}。`,
      logical ? `归档逻辑集合：多余 ${count(logical.extraFiles)}、缺失 ${count(logical.missingFiles)}、大小不符 ${count(logical.sizeMismatches)}、哈希不符 ${count(logical.hashMismatches)}。` : '',
      diagnostics.applicationVersion ? `离线资源版本 ${diagnostics.applicationVersion}${diagnostics.buildId ? `，构建 ${diagnostics.buildId}` : ''}。` : '',
      '请完全退出旧版本进程后重新覆盖安装 8.1.1；安装器会清理其拥有的旧运行时文件。',
    ].filter(Boolean).join('\n')
  }
  return { phase: 'failed', message: redactResourceDiagnostic(message).slice(0, 1800), ...(diagnostics ? { diagnostics } : {}) }
}

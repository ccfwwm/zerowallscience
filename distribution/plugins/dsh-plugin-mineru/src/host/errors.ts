/** Failures retain a stable code and recovery identifier without exposing credentials or signed URLs. */
export class MineruError extends Error {
  constructor(readonly code: string, message: string, readonly taskId?: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'MineruError'
  }
}

/** Sanitize a failure for tool results. @param error - Rejected operation. @returns Safe recovery information. */
export function failure(error: unknown): { code: string; message: string; taskId?: string } {
  if (error instanceof MineruError) return { code: error.code, message: error.message, ...(error.taskId ? { taskId: error.taskId } : {}) }
  return { code: 'MINERU_OPERATION_FAILED', message: 'MinerU 操作未完成；保留任务编号并检查网络或文件权限。' }
}

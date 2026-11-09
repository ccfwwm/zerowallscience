/** Localized preparation status shared by the PPT resource panel. */
export const en = { title: 'OCR resources', pending: 'Preparing OCR resources…', ready: 'OCR is ready', failed: 'OCR preparation failed. Check the network and retry.', retry: 'Retry OCR preparation' } as const
export type OcrCopy = (key: keyof typeof en) => string
export const zh: Record<keyof typeof en, string> = { title: 'OCR 资源', pending: '正在准备 OCR 资源…', ready: 'OCR 已就绪', failed: 'OCR 准备失败，请检查网络后重试', retry: '重试 OCR 准备' }

export interface ClipboardCapability { available: boolean; win32Error?: number; probeFailed?: boolean; platform?: string }
export function clipboardCapability(): ClipboardCapability

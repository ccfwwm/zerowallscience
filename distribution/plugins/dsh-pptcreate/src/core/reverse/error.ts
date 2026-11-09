/** Shared lightweight error identity, also available before the engine loads. */
export class ReverseImportError extends Error {
  readonly code: 'SourceNotFound' | 'SourceOutsideCwd' | 'ParseFailed'
  readonly detail?: unknown

  constructor(code: ReverseImportError['code'], message: string, detail?: unknown) {
    super(message)
    this.name = 'ReverseImportError'
    this.code = code
    this.detail = detail
  }
}

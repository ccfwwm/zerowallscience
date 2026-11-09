/** In-memory fixture accepts only the credential namespaces used by migrated plugins. */
export function assertCredentialKey(key: string): void {
  if (!/^zerowall\.(?:ai-cloud|environment)\./.test(key)) throw new Error('Credential key is outside the ZeroWall namespace.')
}

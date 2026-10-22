/** Composition declarations are runtime inputs, not customer-managed resources. */
export function isVisibleResource(kind: string, id?: string): boolean {
  return kind !== 'plugin' || (id !== '@zerowallscience/dsh-bundle-core' && id !== '@zerowallscience/dsh-bundle-science')
}

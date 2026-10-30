/** Reserved product connections share the same edit/delete policy on both sides. */
export function isBuiltInMcpConnection(serverName: string): boolean {
  return ['gpsadb', 'rmcp', 'zerowall-rmcp', 'huagongshe', 'zerowall_managed_scimaster', 'zerowall_managed_bio_tools', 'zerowall_managed_ketcher'].includes(serverName)
}

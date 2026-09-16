// Zotero 0.8.4 was compiled against a newer commands API under the same rc.2
// version. The pinned Harness registers commands by name and has no
// CommandDefinitionId brand. Preserve the command and omit that newer field.
export function adaptZoteroCommand(source) {
  const importLine = "import { CommandDefinitionId } from '@deepseek-ai/dsh-commands/brand';"
  const field = "            definitionId: CommandDefinitionId('dsh-zotero/status'),"
  if (!source.includes('CommandDefinitionId')) return source
  if (!source.includes(importLine) || !source.includes(field)) {
    throw new Error('Unrecognized Zotero command registration; review the pinned DSH adapter.')
  }
  return source.replace(importLine, '').replace(field, '')
}

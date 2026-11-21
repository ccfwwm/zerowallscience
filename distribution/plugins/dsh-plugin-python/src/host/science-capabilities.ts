/** Published science dependency declarations; imported instructions cannot supply arbitrary requirements. */
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'

const capability = z.object({
  id: z.string().regex(/^skill-science-[a-z0-9]+(?:-[a-z0-9]+)*$/u),
  pythonVersion: z.string().regex(/^3\.(?:12|14)\.\d+$/u),
  revision: z.string().regex(/^[a-f0-9]{64}$/u),
  requirements: z.array(z.string().min(1)).min(1),
  imports: z.array(z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/u)),
})
const catalog = z.object({ schemaVersion: z.literal(1), suiteVersion: z.string(), capabilities: z.array(capability) })

/** A plugin-owned capability revision and its exact interpreter requirement. */
export type ScienceCapability = z.infer<typeof capability>

function revisionOf(spec: ScienceCapability): string {
  const { revision: _revision, ...payload } = spec
  return createHash('sha256').update(JSON.stringify(payload, null, 2) + '\n').digest('hex')
}

/** Expected preparation failures have stable codes and safe next actions. */
export class ScienceCapabilityError extends Error {
  constructor(readonly code: 'missing' | 'unknown' | 'manifest' | 'prepare' | 'incompatible', message: string, readonly nextAction: string) { super(message) }
}

/**
 * Read one named capability from the installed plugin's declarations without installing anything.
 * @param assetsRoot - Configured runtime assets directory.
 * @param id - Exact capability id named by the selected skill.
 * @returns Validated plugin-owned dependency declaration.
 */
export async function readScienceCapability(assetsRoot: string, id: string): Promise<ScienceCapability> {
  let document: z.infer<typeof catalog>
  try { document = catalog.parse(JSON.parse(await readFile(join(assetsRoot, 'science-capabilities.json'), 'utf8'))) }
  catch (error) { throw new ScienceCapabilityError('manifest', 'Science dependency declarations are missing or invalid.', 'Update the Python plugin and restore its runtime resources.') }
  if (new Set(document.capabilities.map(row => row.id)).size !== document.capabilities.length) throw new ScienceCapabilityError('manifest', 'Science dependency declarations repeat a capability id.', 'Restore matching Python plugin resources.')
  const selected = document.capabilities.find(row => row.id === id)
  if (!selected) throw new ScienceCapabilityError('unknown', 'This science capability is not provided by the installed Python plugin.', 'Update the skill suite and Python plugin together.')
  if (revisionOf(selected) !== selected.revision) throw new ScienceCapabilityError('manifest', 'Science capability metadata does not match its recorded revision.', 'Restore matching Python plugin runtime resources before preparing this capability.')
  return selected
}

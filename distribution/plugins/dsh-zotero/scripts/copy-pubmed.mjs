/** Ship the upstream ESM literature engine beside its typed Host adapter. */
import { cp, mkdir } from 'node:fs/promises'
await mkdir('lib/pubmed', { recursive: true })
for (const name of ['core.js', 'nlp.js', 'constants.js']) await cp('src/pubmed/' + name, 'lib/pubmed/' + name)

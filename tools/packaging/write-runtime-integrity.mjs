import { root, stageRoot } from '../build/paths.mjs'
import { writeRuntimeIntegrity } from './runtime-integrity.mjs'
await writeRuntimeIntegrity(root, stageRoot)
console.log('Recorded Office native resources, adapted chunks and Skills integrity.')

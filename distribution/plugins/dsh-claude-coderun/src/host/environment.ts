import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'

/** Encode a complete private environment for DSH's ambient-overlay seam. */
export function claudeEnvironmentOverlay(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const overlay = { ...environment }
  const normalize = (name: string) => process.platform === 'win32' ? name.toUpperCase() : name
  const retained = new Set(Object.keys(environment).map(normalize))
  for (const name of Object.keys(scrubbedParentEnv())) {
    if (!retained.has(normalize(name))) overlay[name] = undefined
  }
  return overlay
}

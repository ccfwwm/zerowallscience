import type { ProjectsJsonObject } from '../shared/types.js'

export function mergeProjectSettings(current: ProjectsJsonObject, patch: ProjectsJsonObject): ProjectsJsonObject {
  return { ...current, ...patch }
}

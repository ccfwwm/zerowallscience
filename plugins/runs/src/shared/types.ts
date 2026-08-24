import type { RunRecord } from '@zerowallscience/research-store/types'

export interface RunSubmission {
  projectId: string
  executionContextId?: string
  name: string
  command: string
  workingDirectory: string
  timeoutMs?: number
  inputs?: RunRecord['inputs']
  outputs?: RunRecord['outputs']
}

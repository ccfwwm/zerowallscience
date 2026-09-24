import { createContext, useContext } from 'react'

export type WorkbenchSelection = {
  assetId?: string | undefined
  viewerId?: string | undefined
  runId?: string | undefined
  revision?: number | undefined
}

export const WorkbenchSelectionContext = createContext<WorkbenchSelection>({})

export function useWorkbenchSelection(): WorkbenchSelection {
  return useContext(WorkbenchSelectionContext)
}

import { createContext, useContext } from 'react'

export type ViewerSelection = {
  assetId?: string | undefined
  viewerId?: string | undefined
  runId?: string | undefined
  revision?: number | undefined
}

export const ViewerSelectionContext = createContext<ViewerSelection>({})

export function useViewerSelection(): ViewerSelection {
  return useContext(ViewerSelectionContext)
}

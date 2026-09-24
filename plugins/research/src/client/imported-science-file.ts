import type { ScienceToolId } from '../shared/workbench.js'

/** Route imported assets to the viewer that understands their file format. */
export function scienceToolForImportedPath(path: string, activeTool?: ScienceToolId): ScienceToolId | undefined {
  // This module ships in the browser bundle. Avoid node:path here: the client
  // module table deliberately has no Node built-ins, and a leaked external
  // import prevents the complete research plugin from activating at startup.
  const basename = path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
  const dot = basename.lastIndexOf('.')
  const extension = dot > 0 ? basename.slice(dot).toLowerCase() : ''
  if (['.png', '.jpg', '.jpeg', '.pgm'].includes(extension)) return 'imagej'
  if (['.svs', '.ndpi'].includes(extension)) return 'he'
  if (['.tif', '.tiff'].includes(extension)) return activeTool === 'he' ? 'he' : 'imagej'
  if (['.fa', '.fasta', '.fna', '.ffn', '.frn', '.gb', '.gbk'].includes(extension)) return 'sequence'
  if (['.scf', '.ab1'].includes(extension)) return 'sanger'
  if (['.pdb', '.cif', '.mmcif', '.sdf'].includes(extension)) return 'molecule'
  if (extension === '.fcs') return 'flow'
  if (extension === '.h5ad') return 'cells'
  if (extension === '.zarr') return 'imagej'
  return undefined
}

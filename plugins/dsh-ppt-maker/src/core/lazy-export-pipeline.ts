import type * as Pipeline from './export-pipeline.js'
import { retryableImport } from './lazy-module.js'

// Keep tool schemas and the workbench routes available at Host startup. The
// Office engine, preview reviewer and converter belong to actual operations.
const loadPipeline = retryableImport(() => import('./export-pipeline.js'))

export const buildProjectDeck: typeof Pipeline.buildProjectDeck = async (...args) =>
  (await loadPipeline()).buildProjectDeck(...args)
export const saveRawProjectPptx: typeof Pipeline.saveRawProjectPptx = async (...args) =>
  (await loadPipeline()).saveRawProjectPptx(...args)
export const saveProjectPptx: typeof Pipeline.saveProjectPptx = async (...args) =>
  (await loadPipeline()).saveProjectPptx(...args)
export const renderProjectPreviews: typeof Pipeline.renderProjectPreviews = async (...args) =>
  (await loadPipeline()).renderProjectPreviews(...args)
export const checkProject: typeof Pipeline.checkProject = async (...args) =>
  (await loadPipeline()).checkProject(...args)
export const checkBuiltProject: typeof Pipeline.checkBuiltProject = async (...args) =>
  (await loadPipeline()).checkBuiltProject(...args)

import { createHash } from 'node:crypto'
const upstreamPeerRanges = new Set([
  '^0.1.5-rc.3 || ^0.1.7-alpha.2 || ^0.1.7-rc.1',
  '^0.1.5-rc.3 || ^0.1.7-rc.1 || ^0.2.0-rc.1',
])
const adaptedPeerRange = '^0.1.5-rc.3 || ^0.1.7-rc.1 || ^0.2.0-rc.1 || ^0.2.0-rc.2'
export const UNIVER_SKILL_HASHES = {
  univer: 'e7d13dab051806eee9fb482b3b487d37198fa4eb7050bf755226de5dbca6b24c',
  'univer-slide': '8b24e3fb8d24546a5199d5c65fabb7245c50145f9a0113a5aa7377a389ad3baf',
  'univer-doc': '50defd3678477eaf10dd3eee389d4b668b7038b24bc31658447300d0ed669c9d',
  'univer-sheet': '4599841af059e772c6d9af352359d22c50bd2438cc9a167b272ab2ebc2f4991a',
}
export function adaptUniverSkill(name, source, version, commit) {
  if (version !== '0.3.7' || commit !== '8f85ce4074fdbe51416b6c337468bb916a302c2a') throw new Error('Univer Skill adapter identity changed.')
  if (createHash('sha256').update(source).digest('hex') !== UNIVER_SKILL_HASHES[name]) throw new Error(`Univer Skill ${name} upstream hash changed; review before adapting.`)
  const descriptions = {
    univer: 'Create, inspect, edit, import and export .univer Units. Use for Univer authoring or explicitly requested Office import into Univer. Ordinary Office attachment identification, reading, summary and comparison use Host extraction and pagination; load this before the matching authoring Unit skill.',
    'univer-slide': 'Create, redesign, edit, lint, screenshot and export editable Univer Slide Units. For scientific decks load zerowall-presentation for evidence, rich content, independent multi-image assets and batch review. Passive PPTX reading uses Host extraction.',
    'univer-doc': 'Create, edit, paginate, inspect and export Univer Doc Units, or explicitly import DOCX for editing. Passive attachment reading and summary use Host extraction, not this skill.',
    'univer-sheet': 'Author, calculate, format and verify Univer Sheet Units or explicitly import spreadsheet data for editing. Passive attachment reading uses Host local cell/formula extraction and pagination.',
  }
  let result = source.replace(/^description: .+$/mu, `description: ${descriptions[name]}`)
  if (name === 'univer') {
    result = result.replace('Use the structured `univer_*` tools whenever the task creates, reads, changes, converts, or reviews office content.', 'Use structured `univer_*` tools when authoring or editing Univer content or importing Office content for editing. Passive Office reading, identification, summary and comparison use Host extraction and read_uploaded_file; they do not require Univer.')
    result = result.replace('- Office source (`.xlsx`, `.csv`, `.tsv`, `.docx`, `.pptx`):', '- Explicit Office import for authoring (`.xlsx`, `.csv`, `.tsv`, `.docx`, `.pptx`):')
  }
  if (name === 'univer-slide') {
    result = result.replace('# Univer Slide Units', '# Univer Slide Units\n\nThe user\'s requested template, visual language, density, page count and settings take precedence. Layout examples and numerical defaults are guidance for unspecified choices, not restrictions. Follow minimalist, dense, dark or other requested styles, chosen fonts/colors, image labels and requested headers/footers. There are no word-count, image-count or layout quotas. Local edits preserve the surrounding design; redistribute content within the requested total slide count instead of adding pages to meet a density target. Fit images and text together with deliberate hierarchy, alignment and spacing. Omit automatic top-left kickers and decorative labels unless the user or page plan needs them. Generated image prompts follow the requested style and may include readable text; there is no universal palette, background or no-text rule.')
    result = result.replace('## Route the task', 'Scientific decks follow zerowall-presentation: extract evidence, plan the complete rich content, design assets and layout together, batch-build all pages, check the deck, repair only failed pages, then export and read back. Multiple literature/generated images per page are supported. Generated graphics may contain accurate readable labels and explanatory text; inspect Chinese glyphs, spelling and layout. Formal report pages show substantive report content, with provenance and production explanations in speaker notes by default. Use clear hierarchy and varied layouts instead of uninterrupted paragraphs. No mandatory style exploration or seed/edit ceremony. Use presentation_prepare with file/unitId/worktreeId and batch presentation_* tools. Preserve model and quality settings.\n\n## Route the task')
    result = result.replace('Master/layout pages and speaker notes are not edited by this Skill.', 'After the final SVG replacement, use getSpeakerNotes()/setSpeakerNotes(string) to record per-page sources, figure provenance and image explanations. Master/layout pages require separate explicit support.')
    result = result.replace('- Element animation, speaker notes, and master/layout-page editing are unsupported.', '- Element animation and master/layout-page editing are unsupported. Speaker notes use the direct FSlide getter/setter after final SVG replacement.')
    result = result.replace('Before drawing, write a workspace `spec.md`', 'Before drawing, write a workspace `presentation-spec.json` (the single content and layout plan; no duplicate spec.md required)')
    result = result.replace('precise enough that page generation needs no fresh decisions about copy, palette, or structure. Fix deck-level constants once:', 'with final copy and a coherent visual system derived from the user\'s requirements. Revise it when content or visual review calls for a better arrangement. Record deck-level choices:')
    result = result.replace('1. Exact layout, tier/card counts, and page dimensions.', '1. Planned content regions and page dimensions; use the layout that the content and requested style need.')
    result = result.replace('Adjacent pages should not repeat the same structure. For reconstruction, transcribe reference text exactly.', 'Use a coherent page rhythm: repeat structures where comparisons benefit from consistency, and vary them when the content needs it. For reconstruction, transcribe reference text exactly.')
    result = result.replace('### 2. Build each page in a closed loop\n\nFinish page N before authoring page N+1.', '### 2. Batch-build the complete deck\n\nPlan every page first, then compile pages serially with presentation_compile_pages. Do not finish page N before beginning page N+1. Check and repair affected pages after the initial deck exists.')
    result = result.replace('5. Call `univer_inspect` for the Slide Unit, then `univer_lint` for page N.', '5. After the batch, call presentation_check_pages for actual inspect/lint/screenshot coverage. Native charts, tables and notes are inserted after the final SVG replacement.')
    result = result.replace('6. Fix the SVG and repeat replacement until the page is clean or every surviving lint has an explicit justification.', '6. After reviewing the deck, fix affected SVGs and replace only those pages. Resolve or explicitly justify each surviving finding.')
    result = result.replace('After every page passes its own loop, call `univer_screenshot`', 'After batch construction, call `univer_screenshot`')
    result = result.replace('rerun their inspect/lint loop', 'rerun checks only for affected pages')
    result = result.replace('After batch construction, call `univer_screenshot` for every page and review the returned PNGs in batches of at most five pages.', 'Review the current PNGs already returned by presentation_check_pages in batches of at most five pages. Do not capture the same accepted page revision again; call univer_screenshot only for changed pages or missing screenshot coverage.')
    result = result.replace('4. Clear every compiler warning. Review every returned lint; retain one only when intentional and justified by evidence.', '4. Record compiler warnings per page. Fix fatal compilation errors; review nonfatal warnings after the initial batch and repair only affected pages. Retain a warning only when the actual screenshot confirms the intended result.')
    result = result.replace('3. One core message.', '3. Page purpose and primary takeaway, allowing multiple topics where the requested content needs them.')
    result = result.replace('report anything that genuinely requires human redesign.', 'repair layout defects automatically and ask only for substantive missing requirements or an unrecoverable external failure.')
    result = result.replace('Native charts are the deliberate exception.', 'Native charts and tables are the deliberate exceptions; reserve their rectangles in SVG and insert them after the final replacement.')
    result = result.replace('Compiler warnings mean content was degraded or dropped and must be handled before continuing.', 'Compiler warnings can indicate degraded or dropped content. Record nonfatal warnings for review after batch construction and resolve or justify them using actual screenshots before export; compilation failures need immediate correction.')
    result = result.replace('Follow the `univer` ready/status workflow. Provide the `.univer` artifact and `.pptx` export only when requested. Do not merge unless the user explicitly asks.', 'Deliver the requested formats after exported-file validation. For a standalone .univer requested by the user, ready/status/merge the accepted draft and inspect trunk in a fresh call; retain drafts when continued editing is requested.')
    result = result.replace('The compiler validates PNG, JPEG, GIF, WebP, and SVG files.', 'The compiler validates PNG, JPEG, GIF, WebP, and SVG files. Register raster images in the page assetIds before composition. Image shape opacity may be lost during PPTX export: the presentation wrapper bakes it into an alpha PNG derivative used by both preview and export. Keep images outside translucent groups. Avoid placing any image above formal text/chart/table bounds; image occlusion is checked in addition to glyph lint.')
    result = result.replace('## Tables', 'Use supported chart axis bounds when needed. The pinned setYAxis facade drops interval/majorUnit; for fixed numeric tick spacing call presentation_set_chart_ticks with page, actual chart_id, axis, mode: fixed and positive major_unit. Use mode: automatic without major_unit to restore automatic ticks. It persists majorUnit through the official snapshot command and keeps native editability. Chart resource changes invalidate only affected pages. The pinned presentation export adapter preserves speaker notes while retaining editable objects. Reserve margin for CJK font metrics with adequate table label-column widths. Render/read back the export before acceptance. For standalone .univer delivery, use univer_worktree(action: ready), the separate univer_status tool, then univer_worktree(action: merge) after export validation and inspect the completed Unit from trunk. Status is never a worktree action. Merged drafts are terminal.\n\n## Tables')
    for (const obsolete of ['three generated style samples', 'Finish page N before authoring page N+1.', 'seed + style edit_image']) if (result.includes(obsolete)) throw new Error(`Obsolete presentation workflow survived adaptation: ${obsolete}`)
  }
  for (const tool of name === 'univer-slide' ? ['univer_compile_svg', 'univer_execute', 'univer_inspect', 'univer_lint', 'univer_screenshot', 'univer_export'] : ['univer_execute']) if (!result.includes(tool)) throw new Error(`Univer authoring capability ${tool} was lost.`)
  return result
}
const dshPeers = [
  '@deepseek-ai/dsh-attachment',
  '@deepseek-ai/dsh-host-webserver',
  '@deepseek-ai/dsh-llm',
  '@deepseek-ai/dsh-session',
  '@deepseek-ai/dsh-settings',
  '@deepseek-ai/dsh-skill',
  '@deepseek-ai/dsh-tools',
]

// The published 0.3.7 bundle predates rc.2. Only the curated runtime copy
// gets the range extension; any upstream manifest change requires a new audit.
export function adaptUniverOfficeManifest(source, resourceVersion = '0.3.7') {
  const manifest = JSON.parse(source)
  if (manifest.name !== 'dsh-univer-office' || manifest.version !== '0.3.7') {
    throw new Error('Unexpected Univer Office manifest identity; review its DSH compatibility.')
  }
  if (Object.keys(manifest.peerDependencies ?? {}).filter(name => name.startsWith('@deepseek-ai/dsh-')).length !== dshPeers.length) {
    throw new Error('Univer Office DSH peer set changed; review its DSH compatibility.')
  }
  for (const name of dshPeers) {
    if (!upstreamPeerRanges.has(manifest.peerDependencies[name]) && manifest.peerDependencies[name] !== adaptedPeerRange) {
      throw new Error(`Univer Office peer ${name} changed; review its DSH compatibility.`)
    }
    manifest.peerDependencies[name] = adaptedPeerRange
  }
  manifest.version = resourceVersion
  return `${JSON.stringify(manifest, null, 2)}\n`
}

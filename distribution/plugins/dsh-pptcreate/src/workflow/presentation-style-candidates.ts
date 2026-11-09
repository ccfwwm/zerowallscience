export const PRESENTATION_STYLE_CANDIDATES = [
  {
    id: 'academic-clean', label: '学术清晰',
    prompt: 'Academic clean: precise editorial grid, generous whitespace, crisp hierarchy, restrained forest-green and teal accents, thin rules, clear chart framing, calm research-presentation typography.',
  },
  {
    id: 'editorial-magazine', label: '编辑杂志',
    prompt: 'Editorial magazine: strong asymmetric composition, oversized but controlled title hierarchy, sharp image crops, confident ink-black and vermilion accents, refined publication art direction.',
  },
  {
    id: 'data-dashboard', label: '数据仪表盘',
    prompt: 'Data dashboard: structured information zones, compact but legible chart modules, clear labels, balanced cyan, green and coral data accents, precise alignment and strong contrast.',
  },
  {
    id: 'minimal-story', label: '极简叙事',
    prompt: 'Minimal narrative: one dominant visual idea, very few supporting elements, generous negative space, refined charcoal and muted blue with a small warm accent, clear reading path.',
  },
] as const

export type PresentationStyleId = typeof PRESENTATION_STYLE_CANDIDATES[number]['id']

export interface PresentationStyleCandidate {
  id: PresentationStyleId
  label: string
  assetId: string
  candidateSetId: string
  sha256: string
}

const STANDARD_RATIOS: Array<[number, string]> = [
  [1, '1:1'], [4 / 3, '4:3'], [3 / 4, '3:4'], [16 / 9, '16:9'], [9 / 16, '9:16'],
  [3 / 2, '3:2'], [2 / 3, '2:3'], [4 / 5, '4:5'], [5 / 4, '5:4'], [21 / 9, '21:9'],
  [1 / 4, '1:4'], [4, '4:1'], [1 / 8, '1:8'], [8, '8:1'],
]

export function presentationAspectRatio(width: number, height: number): string {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('Presentation dimensions must be positive numbers.')
  const ratio = width / height
  return [...STANDARD_RATIOS].sort((a, b) => Math.abs(a[0] - ratio) - Math.abs(b[0] - ratio))[0]![1]
}

export function presentationStylePrompt(styleId: string): string {
  const style = PRESENTATION_STYLE_CANDIDATES.find(item => item.id === styleId)
  if (!style) throw new Error(`Unknown presentation style ${styleId}.`)
  return style.prompt
}

export function validateStyleCandidateSet(value: unknown): asserts value is PresentationStyleCandidate[] {
  if (!Array.isArray(value) || value.length !== PRESENTATION_STYLE_CANDIDATES.length) throw new Error('Generate all four style candidate images before selecting a presentation style.')
  const ids = value.map(item => item?.id)
  if (new Set(ids).size !== PRESENTATION_STYLE_CANDIDATES.length || PRESENTATION_STYLE_CANDIDATES.some(style => !ids.includes(style.id))) throw new Error('The current candidate set must contain exactly one image for each built-in presentation style.')
  const setIds = new Set(value.map(item => item?.candidateSetId))
  if (setIds.size !== 1 || typeof [...setIds][0] !== 'string' || ![...setIds][0]) throw new Error('All four style candidate images must belong to the same candidate set.')
  if (value.some(item => typeof item?.assetId !== 'string' || !item.assetId || typeof item?.label !== 'string' || !/^[a-f0-9]{64}$/u.test(item?.sha256 ?? ''))) throw new Error('Each style candidate must be bound to a registered image asset and SHA-256.')
}

export function resolvePresentationStyle(
  spec: { stylePrompt?: string; templateStylePrompt?: string; selectedStylePrompt?: string; selectedStyleId?: string; styleCandidates?: PresentationStyleCandidate[]; styleReferenceAssetIds?: string[] },
  slide: { stylePrompt?: string; styleReferenceAssetIds?: string[] },
) {
  const candidate = spec.styleCandidates?.find(item => item.id === spec.selectedStyleId)
  const selectedPrompt = spec.selectedStylePrompt ?? PRESENTATION_STYLE_CANDIDATES.find(item => item.id === spec.selectedStyleId)?.prompt
  const promptParts = slide.stylePrompt === undefined
    ? [spec.stylePrompt, spec.templateStylePrompt, selectedPrompt]
    : [slide.stylePrompt, selectedPrompt]
  const stylePrompt = promptParts.filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join('\n\n')
  const styleReferenceAssetIds = [...new Set([
    ...(slide.styleReferenceAssetIds ?? spec.styleReferenceAssetIds ?? []),
    ...(candidate ? [candidate.assetId] : []),
  ])]
  return {
    stylePrompt: stylePrompt || (slide.stylePrompt === '' && !selectedPrompt ? '' : undefined),
    styleReferenceAssetIds,
  }
}

export function representativeSlidePrompt(input: {
  page: number
  width: number
  height: number
  slide: Record<string, any>
  prompt?: string
}): string {
  const slide = input.slide
  const base = input.prompt?.trim()
    || (typeof slide.combinedPrompt === 'string' && slide.combinedPrompt.trim())
    || (typeof slide.originalPrompt === 'string' && slide.originalPrompt.trim())
    || (typeof slide.purpose === 'string' && slide.purpose.trim())
    || 'Create a representative slide that communicates the supplied page content clearly.'
  const exactText = Array.isArray(slide.text) ? slide.text : []
  return [
    base,
    `Representative page ${input.page}; canvas ${input.width}x${input.height} (${presentationAspectRatio(input.width, input.height)}).`,
    `Exact page text to preserve: ${JSON.stringify(exactText)}.`,
    typeof slide.takeaway === 'string' ? `Key takeaway: ${slide.takeaway}` : '',
    typeof slide.visualBrief === 'string' ? `Visual direction: ${slide.visualBrief}` : '',
    'This is a style-choice preview. Keep the page meaning, facts, numbers and exact text unchanged. Do not add claims, citations, logos or watermarks.',
  ].filter(Boolean).join('\n\n')
}

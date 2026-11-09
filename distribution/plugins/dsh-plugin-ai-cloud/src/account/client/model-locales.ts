import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

export const MODEL_NS = 'zerowallAccountModels'
export const zh = {
  group: '分组', model: '模型', effort: '推理强度', select: '选择模型', menu: '分组、模型与推理强度',
  searchGroups: '搜索分组…', searchModels: '搜索模型…', back: '返回', empty: '没有匹配的模型或分组',
  info: '分组介绍', noDescription: '暂无分组介绍。', rate: '分组倍率', unknownRate: '倍率未提供',
  billing: '分组倍率作用于基础价格，实际费用以平台结算为准。',
  external: '使用已配置的供应商，费用以该供应商定价为准。',
  mediaBilling: '媒体模型可能采用独立计费规则，请查看平台模型价格。',
  close: '关闭介绍', retry: '重试', defaultEffort: '供应商默认', unavailable: '当前选择暂不可用',
  configured: '已配置供应商', cloud: 'ZeroWall AI Cloud', updated: '最近同步',
  syncing: '正在同步…', noEffort: '当前模型未提供推理强度。',
} as const
export const en: Record<keyof typeof zh, string> = {
  group: 'Group', model: 'Model', effort: 'Reasoning effort', select: 'Select model', menu: 'Group, model and reasoning effort',
  searchGroups: 'Search groups…', searchModels: 'Search models…', back: 'Back', empty: 'No matching models or groups',
  info: 'Group details', noDescription: 'No group description provided.', rate: 'Group multiplier', unknownRate: 'Multiplier not provided',
  billing: 'The group multiplier applies to the base price. Final charges are determined by the platform.',
  external: 'Uses your configured provider. Pricing is determined by that provider.',
  mediaBilling: 'Media models may use separate billing rules. Check the platform model pricing.',
  close: 'Close details', retry: 'Retry', defaultEffort: 'Provider default', unavailable: 'Current selection is unavailable',
  configured: 'Configured providers', cloud: 'ZeroWall AI Cloud', updated: 'Last synced',
  syncing: 'Syncing…', noEffort: 'This model does not declare reasoning levels.',
}
export type ModelText = (key: keyof typeof zh) => string
export const defaultModelText: ModelText = key => zh[key]
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap { zerowallAccountModels: keyof typeof zh }
}
export type ModelTranslate = TranslateNS<typeof MODEL_NS>

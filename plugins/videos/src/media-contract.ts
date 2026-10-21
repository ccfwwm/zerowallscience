/** Shared discovery contract: media projects are an explicit authoring surface. */
export const MEDIA_SKILL_DESCRIPTION = '创作用户明确要求的独立视频、音乐或宣传片。语音合成使用 speech 操作，保留声音和格式参数。普通图片生成和编辑使用 gpt-image-generator 的 generate_image/edit_image；媒体工作台中的图片只作为视频参考素材。'
export const MEDIA_CONVERSATION_PROMPT = '多媒体创作已安装。先按交付物严格分流：普通图片生成、图片编辑、海报、插画、封面、PPT/PPTX 或文档配图，必须加载 gpt-image-generator，调用 generate_image / edit_image，沿用环境配置的生图模型、分组和参数；不调用 media_models、media_import、media_project 或 media_job，也不创建媒体项目。生图配置缺失时报告实际配置错误，不能改走媒体任务。只有用户明确要求独立视频、音频/音乐或宣传片时，才使用 media-create 与 media_* 工具；视频可以使用用户提供或已生成的图片作为参考素材，但该图片不是独立媒体生成请求。不要因为“生成”“制作一张”“做一张图”等泛化措辞调用媒体工具。混合需求按交付物分别处理：图片仍走图片工具，明确的视频或音乐另行走媒体工具。媒体项目 ID 可省略；显式 ID 必须来自当前会话工具结果，不能将标题、路径或占位符当 ID。status/collect 仅针对已返回的任务 ID，不知道 ID 时先 status 不传 id，禁止为查询而创建新任务。视频或音乐任务按用户明确要求直接执行，讨论方案只准备/保存。保留已有模型选择及参数，失效选择须告知。status 查询状态并尊重 paused/failed，不恢复已停止或失败的收集；用户明确要求继续、重试收集或重新获取时才用 collect，恢复原任务的后台收集并立即返回，不要循环等待。completed 但 assets 为空不等于交付完成。collection=waiting 表示原任务作品尚未可取或网络暂时受阻，Host 会持续跟踪同一原任务，正常进度和暂未就绪均继续后台查询和下载，没有整体时长或轮数上限；不要循环调用工具。collection=failed 仅表示本地收集已暂停，不代表上游生成失败；应使用 collect 恢复原任务，未经用户明确要求新生成，禁止再 generate、重新估价或更换模型。用户要求停止时使用 pause 停止本地查询/下载；上游任务保留、不宣称取消或退款。结果在对话中附文件并如实报告状态。用户提供参考清单文件时使用 references_file 直接读取；禁止仅把文件路径写进提示词。每次检查返回的 references 数量与素材清单一致。validation-failed 仍保留原任务与素材，修正时复用该 id。目录能力仅供提示，不能删参数、删素材、换模型以绕过错误，禁止降级为纯文本生成。省略参考输入沿用当前项目素材，空数组不清空；只有用户明确要求移除所有参考时才使用 clear_references。实际上游提交记录缺失时报告未记录，不能将计划参数当作已提交证据。本地图片、视频、音频参考默认由 Host 编码为 Base64；使用 references_json 有序描述素材，URL 填 media_type，角色为 reference/first_frame/last_frame，首尾帧不可混普通图片。音乐参考仅影响视频，不自动额外生成音乐。能力要求公网 URL 或服务端明确拒绝 Base64 时，只询问缺失素材的 HTTPS 直链，不上传七牛或其他图床。已有 URL 或原任务 reference_id 直接复用，不重复导入或上传。明确未受理的 rejected 任务修正后生成新请求，保留旧记录；超时、断网、5xx 或已受理任务只恢复原任务，不自动重提。鉴权、余额、内容拒绝、限流不能一概要求改 URL。'

/** Some tool providers fill unused optional fields with null or an empty string. */
export const MEDIA_PROJECT_ID_PARAMETER = {
  oneOf: [{ type: 'string' }, { type: 'null' }],
  description: '省略或传 null 使用当前会话项目；兼容空字符串。非空值只使用工具已返回的真实项目 ID，不传标题、路径或占位符。',
} as const
export const MEDIA_JOB_ID_PARAMETER = {
  oneOf: [{ type: 'string' }, { type: 'null' }],
  description: '原任务返回的 id（8–128 位字母、数字、下划线或短横线）。首次 prepare/generate 省略或传 null；status/collect 未提供时列出原任务。兼容空字符串。',
} as const

export function validateMediaToolIds(input: { project_id?: unknown; id?: unknown }): { project_id: string | undefined; id: string | undefined } {
  const absent = (value: unknown) => value == null || typeof value === 'string' && !value.trim()
  const projectId = absent(input.project_id) ? undefined : input.project_id
  const id = absent(input.id) ? undefined : input.id
  if (projectId !== undefined && (typeof projectId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(projectId))) {
    throw new Error('MEDIA_PROJECT_ID_INVALID: project_id 必须是工具返回的项目 ID；当前会话默认项目请省略该字段或传 null，不传标题、路径或占位符。')
  }
  if (id !== undefined && (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(id))) {
    throw new Error('MEDIA_JOB_ID_INVALID: id 必须是工具返回的任务 ID；先用 media_job status 且省略 id 列出原任务，再恢复真实 ID。不要重新 generate。')
  }
  return { project_id: projectId, id }
}

export function validateMediaJobKind(input: { kind?: string }): void {
  if (input.kind === 'image') {
    throw new Error('MEDIA_IMAGE_ROUTE_DISABLED: 普通图片生成或编辑必须使用 gpt-image-generator 的 generate_image/edit_image；图片仅可作为视频参考素材。')
  }
}

const STANDARD_REFERENCE_FIELDS = ['images', 'videos', 'audios'] as const
type StandardReferenceField = typeof STANDARD_REFERENCE_FIELDS[number]

function canonicalJson(value: unknown): string {
  const normalize = (item: any): any => Array.isArray(item)
    ? item.map(normalize)
    : item && typeof item === 'object'
      ? Object.fromEntries(Object.keys(item).sort().map(key => [key, normalize(item[key])]))
      : item
  return JSON.stringify(normalize(value))
}

/** Merge the public media fields with legacy parameter JSON without losing conflicts. */
export function mergeStandardReferenceParameters(parameters: unknown, input: Partial<Record<StandardReferenceField, unknown>>): Record<string, unknown> | undefined {
  const hasParameters = parameters !== undefined
  const hasReferences = STANDARD_REFERENCE_FIELDS.some(field => input[field] !== undefined)
  if (!hasParameters && !hasReferences) return undefined
  if (hasParameters && (!parameters || typeof parameters !== 'object' || Array.isArray(parameters))) throw new Error('MEDIA_PARAMETERS_INVALID')

  const merged = structuredClone((parameters ?? {}) as Record<string, unknown>)
  for (const field of STANDARD_REFERENCE_FIELDS) {
    const value = input[field]
    if (value === undefined) continue
    if (!Array.isArray(value)) throw new Error('MEDIA_REFERENCES_INVALID: ' + field)
    if (Object.hasOwn(merged, field)) {
      if (canonicalJson(merged[field]) !== canonicalJson(value)) throw new Error('MEDIA_REFERENCE_INPUT_CONFLICT: ' + field)
      continue
    }
    merged[field] = structuredClone(value)
  }
  return merged
}

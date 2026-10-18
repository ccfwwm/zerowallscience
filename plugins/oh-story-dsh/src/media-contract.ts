/** Shared discovery contract: media projects are an explicit authoring surface. */
export const MEDIA_SKILL_DESCRIPTION = '创作用户明确要求的独立视频、音乐或宣传片。普通图片生成和编辑使用 gpt-image-generator 的 generate_image/edit_image；媒体工作台中的图片只作为视频参考素材。'
export const MEDIA_CONVERSATION_PROMPT = '多媒体创作已安装。先按交付物严格分流：普通图片生成、图片编辑、海报、插画、封面、PPT/PPTX 或文档配图，必须加载 gpt-image-generator，调用 generate_image / edit_image，沿用环境配置的生图模型、分组和参数；不调用 media_models、media_import、media_project 或 media_job，也不创建媒体项目。生图配置缺失时报告实际配置错误，不能改走媒体任务。只有用户明确要求独立视频、音频/音乐或宣传片时，才使用 media-create 与 media_* 工具；视频可以使用用户提供或已生成的图片作为参考素材，但该图片不是独立媒体生成请求。不要因为“生成”“制作一张”“做一张图”等泛化措辞调用媒体工具。混合需求按交付物分别处理：图片仍走图片工具，明确的视频或音乐另行走媒体工具。媒体项目 ID 可省略；显式 ID 必须来自当前会话工具结果，不能将标题、路径或占位符当 ID。status/collect 仅针对已返回的任务 ID，不知道 ID 时先 status 不传 id，禁止为查询而创建新任务。视频或音乐任务按用户明确要求直接执行，讨论方案只准备/保存。保留已有模型选择及参数，失效选择须告知。status 查询状态并尊重 paused/failed，不恢复已停止或失败的收集；用户明确要求继续、重试收集或重新获取时才用 collect，恢复原任务的后台收集并立即返回，不要循环等待。completed 但 assets 为空不等于交付完成。collection=waiting 表示原任务作品尚未可取或网络暂时受阻，Host 会持续跟踪同一原任务，正常进度和暂未就绪均继续后台查询和下载，没有整体时长或轮数上限；不要循环调用工具。collection=failed 仅表示本地收集已暂停，不代表上游生成失败；应使用 collect 恢复原任务，未经用户明确要求新生成，禁止再 generate、重新估价或更换模型。用户要求停止时使用 pause 停止本地查询/下载；上游任务保留、不宣称取消或退款。结果在对话中附文件并如实报告状态。'

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

/** Shared discovery contract: media projects are an explicit authoring surface. */
export const MEDIA_SKILL_DESCRIPTION = '创作独立媒体项目中的图片、视频、音乐与宣传片。PPT/PPTX、文档和报告配图使用 gpt-image-generator 的 generate_image/edit_image。'
export const MEDIA_CONVERSATION_PROMPT = '多媒体创作已安装。按用户的交付物选择能力：PPT/PPTX、幻灯片、文档、报告中的配图与普通 PNG 生图/改图，加载 gpt-image-generator，调用 generate_image / edit_image，沿用环境配置的生图模型、分组和参数；PPT 同时遵循 zerowall-presentation / univer-slide。配图不创建媒体项目或媒体任务，不调用 media_models / media_import / media_project / media_job；缺少图片配置时报告实际配置错误，不改走媒体项目。用户明确要求独立媒体项目、视频、音乐或宣传片时，使用 media-create 与 media_* 工具。混合需求按交付物分别处理，例如 PPT 配图仍走图片工具，另行请求的视频走媒体工具。媒体项目 ID 可省略；显式 ID 必须来自当前会话工具结果，不能将标题、路径或占位符当 ID。status/collect 只恢复已返回的任务 ID，不知道 ID 时先 status 不传 id 列出原任务，禁止为查询而创建新任务。独立媒体生成按用户明确要求直接执行，讨论方案只准备/保存。保留已有模型选择及参数，失效选择须告知。结果在对话中附文件并如实报告状态。'

export function validateMediaToolIds(input: { project_id?: string; id?: string }): void {
  if (input.project_id !== undefined && !/^[A-Za-z0-9_-]{1,80}$/.test(input.project_id)) {
    throw new Error('MEDIA_PROJECT_ID_INVALID: project_id 必须是工具返回的项目 ID；当前会话默认项目请省略该字段，不传标题、路径、空字符串或占位符。')
  }
  if (input.id !== undefined && !/^[A-Za-z0-9_-]{8,128}$/.test(input.id)) {
    throw new Error('MEDIA_JOB_ID_INVALID: id 必须是工具返回的任务 ID；先用 media_job status 且省略 id 列出原任务，再恢复真实 ID。不要重新 generate。')
  }
}

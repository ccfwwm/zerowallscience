import type { SkillBindingConfig, ToolGroupConfig } from './types.js'

export const DEFAULT_MODE = 'stable-proxy' as const
export const DEFAULT_TOOL_NAME = 'tool_search'
export const DEFAULT_DISPATCH_TOOL_NAME = 'tool_dispatch'
export const DEFAULT_MAX_RESULTS = 5
export const DEFAULT_ACTIVATION_GROUP_LIMIT = 1
export const DEFAULT_MAX_ACTIVE_GROUPS = 3
export const DEFAULT_MAX_ACTIVE_TOOL_TOKENS = 6_000
export const DEFAULT_RETENTION_TURNS = 6
export const DEFAULT_CHARACTERS_PER_TOKEN = 4
export const DEFAULT_REQUIRE_DISCOVERY = true
export const DEFAULT_STATUS_GRANTS_DISCOVERY = false
export const DEFAULT_DEFER_TOOL_GUIDANCE = true
export const DEFAULT_ALWAYS_VISIBLE = [
  'skill',
  'ask_user_question',
  'report',
  'submit_*',
  'structured_output*',
] as const
export const DEFAULT_SKILL_BINDINGS: readonly SkillBindingConfig[] = []

export const DEFAULT_GROUPS: readonly ToolGroupConfig[] = [
  {
    id: 'browser',
    description: 'Interactive browser navigation, page inspection, clicks, forms, screenshots, and tabs.',
    aliases: ['browser', 'web page', '网页', '浏览器'],
    include: ['browser_*', 'navigate', 'click', 'screenshot', 'computer_*'],
  },
  {
    id: 'vision',
    description: 'Image understanding, OCR, comparison, annotation, and visual routing.',
    aliases: ['vision', 'image analysis', '图片', '视觉', '识图'],
    include: ['vision_*', 'ocr*', 'analyze_image*', 'compare_image*', 'describe_image*'],
  },
  {
    id: 'image-generation',
    description: 'Image generation and image editing.',
    aliases: ['image generation', 'generate image', '生图', '图片生成'],
    include: [
      'imagegen*',
      'image_gen*',
      'generate_image*',
      'edit_image*',
      'get_image_generation*',
      'cancel_image_generation*',
      'image_generation*',
    ],
  },
  {
    id: 'filesystem',
    description: 'Read, search, create, and edit files and directories.',
    aliases: ['files', 'filesystem', 'code editing', '文件', '代码编辑'],
    include: ['read', 'write', 'edit', 'glob', 'grep', 'read_file*', 'write_file*', 'list_dir*', 'search_file*', 'str_replace*', 'fs_*'],
  },
  {
    id: 'terminal',
    description: 'Shell commands, terminal sessions, jobs, and local process control.',
    aliases: ['terminal', 'shell', 'command', '终端', '命令行'],
    include: ['bash', 'pwsh', 'shell_*', 'terminal_*', 'exec_*', 'job_*'],
  },
  {
    id: 'web',
    description: 'Web search, HTTP fetching, and URL content retrieval.',
    aliases: ['web search', 'internet', 'http', '联网', '网页搜索'],
    include: ['web_*', 'http_*', 'fetch*', 'search_web*'],
  },
  {
    id: 'database',
    description: 'Database inspection, queries, migrations, and records.',
    aliases: ['database', 'sql', '数据库'],
    include: ['database_*', 'db_*', 'sql_*', 'query_*'],
  },
  {
    id: 'remote-ops',
    description: 'SSH, SFTP, tunnels, and remote host operations.',
    aliases: ['ssh', 'remote', 'server', '远程', '服务器'],
    include: ['ssh_*', 'sftp_*', 'tunnel_*', 'remote_*'],
  },
  {
    id: 'memory',
    description: 'Durable memory, recall, notes, and knowledge retrieval.',
    aliases: ['memory', 'recall', '记忆', '知识库'],
    include: ['memory_*', 'recall*', 'mneme_*', 'note_*'],
  },
  {
    id: 'workbench',
    description: 'Workspace workbench, artifacts, previews, and project utilities.',
    aliases: ['workbench', 'workspace', '工作台'],
    include: ['workbench_*', 'workspace_*', 'artifact_*', 'preview_*'],
  },
  {
    id: 'agent-teams',
    description: 'Team members, delegated tasks, messages, and coordination.',
    aliases: ['team', 'delegate', '协作', '团队', '子任务'],
    include: ['team_*', 'agent_team*', 'spawn_agent*', 'send_message*', 'followup_task*', 'wait_agent*', 'list_agent*'],
  },
  {
    id: 'subagents',
    description: 'Subagent spawning, continuation, inspection, and collection.',
    aliases: ['subagent', 'delegate', '子智能体', '委派'],
    include: ['subagent*', 'spawn*', 'fork_agent*', 'continue_agent*'],
  },
  {
    id: 'workflow',
    description: 'Workflow definitions, runs, schedules, and automation control.',
    aliases: ['workflow', 'automation', 'schedule', '工作流', '自动化'],
    include: ['workflow_*', 'schedule_*', 'automation_*', 'cron_*'],
  },
  {
    id: 'interface',
    description: 'Generated interface components, interactive artifacts, and structured UI.',
    aliases: ['interface', 'ui', '组件', '界面'],
    include: ['genui_*', 'ui_*', 'component_*'],
  },
]

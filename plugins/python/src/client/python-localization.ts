export type PythonUiLanguage = 'en' | 'zh'

const han = /\p{Script=Han}/u

const exactEnglish = new Map<string, string>([
  ['等待基础 Python 环境就绪。', 'Waiting for the base Python runtime.'],
  ['正在读取并验签依赖清单。', 'Loading and verifying the signed dependency manifest.'],
  ['正在检查签名资源目录。', 'Checking the signed resource catalog.'],
  ['正在读取当前 Python 包清单。', 'Reading the installed Python package inventory.'],
  ['正在读取已安装包并核对签名清单。', 'Checking installed packages against the signed manifest.'],
  ['正在准备 Python 依赖任务。', 'Preparing the Python dependency task.'],
  ['正在恢复上次中断的核心依赖任务；保留此前进度和日志。', 'Resuming the interrupted core dependency task with its saved progress and logs.'],
  ['正在恢复自动核心依赖任务。', 'Resuming the automatic core dependency task.'],
  ['正在续接原有核心依赖安装事务；保留已完成包和日志。', 'Resuming the existing core installation with completed packages and logs preserved.'],
  ['正在逐包下载并安装依赖；关闭桌面后可查看已保存的最后状态。', 'Downloading and installing packages in the background. The latest saved status is available after reopening the desktop app.'],
  ['安装计划已通过签名、哈希和资源检查，正在启动依赖安装。', 'The signed plan, hashes, and package resources passed validation. Starting installation.'],
  ['依赖安装任务已持久化，正在下载并安装。', 'The dependency task is saved and downloading packages.'],
  ['安装进程已结束，正在核对实际环境中的依赖版本。', 'The installer finished. Verifying dependency versions in the active environment.'],
  ['任务已加入队列，桌面可以继续使用。', 'The task is queued. You can continue using the desktop app.'],
  ['桌面关闭或重启时任务尚未完成；以下为最后一次保存的进度和日志。', 'The task was still running when the desktop app closed or restarted. The progress and logs below are the latest saved state.'],
  ['任务因桌面进程结束而中断。', 'The task was interrupted when the desktop process exited.'],
  ['任务失败，当前有效 Python 环境保持不变。', 'The task failed. The active Python environment was left unchanged.'],
  ['Python 依赖任务已完成并通过验证。', 'The Python dependency task completed and passed verification.'],
  ['依赖检查完成。', 'Dependency check completed.'],
  ['资源预检完成，可查看安装计划。', 'Resource preflight completed. Review the installation plan.'],
])

/**
 * Python task receipts are durable and may contain messages written by older
 * desktop versions. Keep their original text for Chinese users, while
 * presenting known progress and diagnostic records in the selected English UI.
 */
export function localizePythonText(value: string | undefined, language: PythonUiLanguage): string | undefined {
  if (!value || language === 'zh' || !han.test(value)) return value

  const exact = exactEnglish.get(value)
  if (exact) return exact

  let match = value.match(/^正在比较 (\d+) 个依赖版本。$/u)
  if (match) return `Comparing ${match[1]} dependency versions.`
  match = value.match(/^正在比较依赖版本 (\d+)\/(\d+)。$/u)
  if (match) return `Comparing dependency versions ${match[1]}/${match[2]}.`
  match = value.match(/^依赖检查完成：(\d+)\/(\d+) 已安装，(\d+) 待安装。$/u)
  if (match) return `${match[1]}/${match[2]} dependencies installed; ${match[3]} pending.`
  match = value.match(/^正在预检 (\d+) 个 ([\w-]+) 依赖的镜像、版本和安装兼容性。$/u)
  if (match) return `Preflighting mirrors, versions, and compatibility for ${match[1]} ${match[2]} dependencies.`
  match = value.match(/^已核对 (\d+)\/(\d+) 个目标依赖，开始预检 (\d+) 个待安装依赖。$/u)
  if (match) return `Checked ${match[1]}/${match[2]} target dependencies; preflighting ${match[3]} pending dependencies.`
  match = value.match(/^正在检查资源：分组 (\d+)\/(\d+) · (.+?) 等 (\d+) 个包（已完成 (\d+)\/(\d+)）。$/u)
  if (match) return `Checking resources: group ${match[1]}/${match[2]} · ${match[3]} and ${match[4]} packages (${match[5]}/${match[6]} complete).`
  match = value.match(/^分组 (\d+)\/(\d+) · (.+?) 等 (\d+) 个包:\s*(.*)$/u)
  if (match) return `Group ${match[1]}/${match[2]} · ${match[3]} and ${match[4]} packages: ${match[5]}`
  match = value.match(/^核心 MCP 依赖不完整：(.+)$/u)
  if (match) return `Core MCP dependencies are incomplete: ${match[1]}`
  match = value.match(/^核心依赖安装后仍未通过核验：(.+)$/u)
  if (match) return `Core dependency verification failed after installation: ${match[1]}`
  match = value.match(/^基础依赖安装后仍未通过核验：(.+)$/u)
  if (match) return `Base dependency verification failed after installation: ${match[1]}`
  match = value.match(/^安装后仍有 (\d+) 个依赖未达到签名清单版本；(.+)$/u)
  if (match) return `${match[1]} dependencies still do not match the signed manifest after installation; ${match[2]}`
  match = value.match(/^正在单独安装 (.+)。$/u)
  if (match) return `Installing ${match[1]} as a separate package task.`
  match = value.match(/^正在预检单包版本：(.+)。$/u)
  if (match) return `Preflighting the package version ${match[1]}.`
  match = value.match(/^单包安装任务已持久化：(.+)。$/u)
  if (match) return `The separate package task for ${match[1]} is saved.`
  match = value.match(/^单包版本预检失败：(.+)$/u)
  if (match) return `Single-package preflight failed: ${match[1]}`
  match = value.match(/^检测到旧 Python profile；(.+)$/u)
  if (match) return `An older Python profile was detected; ${match[1]}`

  // Do not leak untranslated backend prose into an English settings page.
  // The complete original remains in the durable Host task/event record.
  return 'Python details are available in the saved task diagnostics.'
}

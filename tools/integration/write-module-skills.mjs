import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const root = resolve(import.meta.dirname, '../../resources/skills')
const modules = [
  ['zerowall-rplatform', 'r.compute', '远程 R 计算、统计脚本和可复现项目任务。', 'r.runtime.capabilities', '先检查运行时。提交脚本时工作流创建项目并记录任务 ID；用 status 跟踪完成后取回 manifest。保留 sessionInfo、代码与参数。'],
  ['zerowall-r-files', 'r.files', '远程 R 项目文件上传、浏览、预览、下载与 SHA-256 校验。', 'r.list.directory', '本地文件传输发现 r_files，通过 tool_dispatch 调用 upload_workspace/download_workspace。首次上传前确认文件与目的项目；下载核对 manifest 的大小和 SHA-256。不要把本地路径传给服务器文件读取。'],
  ['zerowall-r-packages', 'r.packages', '远程 R 包版本、依赖检查、安装卸载及任务跟踪。', 'r.list.packages', '先查询版本和依赖。展示具体包名、版本和服务器后再确认变更。保留服务端任务 ID；安装失败报告权限、系统依赖或仓库错误。'],
  ['zerowall-geo', 'r.geo', 'GEO 数据检索、可用性检查、表达分析计划和结果导出。', 'r.geo.catalog', '检索 accession 并检查矩阵、样本设计和数据可用性；下载公共数据后创建分析计划。读取计划参数再运行；单细胞优先异步服务端任务，保存 QC、归一化和批次信息。'],
  ['zerowall-nhanes', 'r.nhanes', 'NHANES 数据变量检索、跨周期合并、调查加权分析和报告。', 'r.nhanes.catalog', '先查询周期、变量及 codebook，再检查可用性。合并周期前说明纳入条件、权重调整、PSU 和 strata；只使用适合目标指标的调查权重。创建计划、运行并保存代码和结果清单。'],
  ['zerowall-rbioagent', 'biomni', '远程 Biomni Agent、精确生物工具、服务器数据湖与复杂计算。', 'biomni.capabilities', '先检查运行时和数据湖，再检索精确工具参数或使用 Agent。鉴权由 Host 注入，禁止写入 prompt。区分缺包、模型资产缺失、数据不可用和鉴权失败；使用返回任务 ID 查询进度。'],
  ['zerowall-rplotfigure', 'figureya', 'FigureYa 模板选择、输入准备、绘图计划、执行和完整产物下载。', 'figureya.search', '先检索模板与其服务器本地源文件，准备 input_refs，再验证并创建计划。运行保存的 plan_id；取回图片、表格、脚本、报告与校验清单。下载模板源文件使用 r_files download_figureya_module。'],
]
for (const [name, id, description, example, guidance] of modules) {
  const directory = resolve(root, name); await mkdir(directory, { recursive: true })
  await writeFile(resolve(directory, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\nallowed-tools: tool_search tool_dispatch\n---\n\n${guidance}\n\n通过 tool_search 发现 research_workflow，再用 tool_dispatch 调用该工具。workflow_id 为 ${id}。先 action=describe 获取操作列表；再指定 operation 查看参数，实际执行由服务端目录校验。\n\n\`\`\`json\n{"action":"describe","workflow_id":"${id}","operation":"${example}"}\n\`\`\`\n\n执行格式：action=run，workflow_id=${id}，parameters={"operation":"精确操作 ID","arguments":{},"request_id":"唯一请求标识"}。按 describe 的参数要求填写 arguments，不猜测工具名。变更操作仅在已确认范围内传 confirm=true。Skill 是说明，research_workflow 的注册执行器负责编排。\n\n返回 run_id 后仅使用 action=status 查询；取消使用 action=cancel、run_id 和 confirm=true。同一提交重试复用 request_id；不因超时重新提交。返回失败时检查远程任务历史。结果以产物引用和 manifest 为准，不把排队或启动说成成功。rmcp 是唯一物理连接，不建立模块专属连接。\n`)
}
const single = resolve(root, 'sc-tenifold-knockout/SKILL.md')
let content = await readFile(single, 'utf8')
content = content.replace(/^allowed-tools:.*$/mu, 'allowed-tools: read write edit grep python tool_search tool_dispatch')
if (!content.includes('## 工具调用')) content = content.replace('## 标准流程', '## 工具调用\n\n先通过 tool_search 发现 sc_tenifold_knockout_*，通过 tool_dispatch 调用，保留现有 intake/QC/解释流程。程序化远程敲除入口为 research_workflow，workflow_id=sc.knockout；describe 查询 r.submit.sc.tenifold.knockout 的实际参数。下述旧 r_* 名字表示能力名称，线上调用使用 rmcp 聚合工具及目录返回的 action；本地上传使用 r_files action=upload_workspace。首次上传用户数据需确认。\n\n## 标准流程')
await writeFile(single, content)

import { DEFAULT_GROUPS } from '../../packages/dsh-progressive-tools/src/defaults.ts'
const groups = [
  ['omicverse', 'OmicVerse 原生工具、CPU 分析、Python 和 Agent', ['research_workflow', 'r_files', 'mcp__rmcp__omicverse_*']],
  ['r-compute', 'R 计算、项目和任务', ['research_workflow', 'mcp_connect', 'sc_tenifold_knockout_*', 'mcp__rmcp__r_runtime', 'mcp__rmcp__r_project', 'mcp__rmcp__r_execute', 'mcp__rmcp__r_jobs']],
  ['r-files', 'R 项目文件上传、预览、下载和校验', ['research_workflow', 'r_files', 'mcp__rmcp__r_files']],
  ['r-packages', 'R 包版本、依赖和安装任务', ['research_workflow', 'mcp__rmcp__r_packages']],
  ['r-geo', 'GEO 公共数据和分析', ['research_workflow', 'mcp__rmcp__r_geo_*']],
  ['r-nhanes', 'NHANES 调查加权分析', ['research_workflow', 'mcp__rmcp__r_nhanes_*']],
  ['biomni', '远程 Biomni Agent 和数据湖', ['research_workflow', 'mcp__rmcp__biomni_*']],
  ['figureya', 'FigureYa 模板、绘图和产物', ['research_workflow', 'r_files', 'mcp__rmcp__r_figureya_*']],
  ['bio', '统一生物分析、本地 BioGenie 和数据库检索', ['bio_local', 'mcp__zerowall_managed_bio_tools__*']],
  ['python-environment', '托管 Python 运行、包管理、进度和回滚', ['python', 'python_environment']],
  ['chemistry-editor', 'Ketcher 分子编辑、结构读取和导出', ['mcp__zerowall_managed_ketcher__*']],
].map(([id, description, include]) => ({ id, description, include }))
export const researchToolConfig = {
  groups: [...DEFAULT_GROUPS, ...groups],
  skillBindings: [
    ['zerowall-rmcp', ['r-compute', 'r-files', 'r-packages', 'r-geo', 'r-nhanes', 'biomni', 'figureya', 'omicverse']],
    ...['zerowall-omicverse', 'zerowall-omicverse-singlecell', 'zerowall-omicverse-bulk', 'zerowall-omicverse-spatial', 'zerowall-omicverse-multiomics', 'zerowall-omicverse-agent'].map(skill => [skill, ['omicverse']]),
    ['zerowall-rplatform', ['r-compute']], ['zerowall-r-files', ['r-files']], ['zerowall-r-packages', ['r-packages']],
    ['zerowall-geo', ['r-geo']], ['zerowall-nhanes', ['r-nhanes']], ['zerowall-rbioagent', ['biomni']],
    ['zerowall-rplotfigure', ['figureya']], ['sc-tenifold-knockout', ['r-compute', 'r-files']],
    ['zerowall-bio', ['bio', 'biomni', 'omicverse', 'python-environment']], ['zerowall-python-packages', ['python-environment']],
    ['local-env-setup', ['python-environment']], ['zerowall-ketcher', ['chemistry-editor']],
  ].map(([skill, groups]) => ({ skill, groups })),
}

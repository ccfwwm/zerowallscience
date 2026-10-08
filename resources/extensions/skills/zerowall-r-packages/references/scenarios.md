# 场景与失败恢复

适用于服务器 R/Bioconductor 包。OmicVerse 的 Python 环境由独立服务维护，不使用本地 pip 或本模块变更。

查询不改变环境。安装/卸载需要实际管理员权限和 confirm=true，说明具体包及影响；权限不足不能用任意 R 代码绕过。

包安装、卸载和补齐均为同步接口：直接检查返回版本和错误。没有 job_id 时不得虚构安装任务。

1. 用 `r.get.package.status` 查询目标包，例如 Matrix、Seurat，核对版本与库路径。
2. 依赖满足时回原分析 Skill。缺包时检查 `r.ensure.analysis.packages` 的批准清单和确认要求；不支持的包交管理员处理。
3. 管理操作通过 run 提交，直接解释同步 `result`；随后重新 query 包状态确认版本。此流程没有远程计算 job_id，也不需要下载 Manifest。

`ADMIN_REQUIRED` 表示当前连接没有管理权限，应保留查询结果并说明缺失包；不能改用 r.submit.script 执行 install.packages 绕过权限。网络或编译错误需检查包安装结果中的日志；不要把包名被接受等同于安装完成。卸载只针对用户已明确指定的包，生产验收不卸载科学环境依赖。

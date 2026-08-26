# ZeroWall Science 4.3.3

## 环境配置

- 修复 Typert 远程结果未等待完成就解包导致的空白页。
- Reviewer、SciMaster、生图模型和自定义变量可独立加载，单个服务不可用时不影响其他配置。
- 新增客户端真实渲染回归测试，防止设置导航可见但内容消失。

## 模型推理强度

- Reviewer 固定模型配置恢复推理强度下拉选择。
- 为 `claude-sonnet-5` 等现代 Claude 路由提供 `off / low / medium / high / max` 能力元数据。
- 对话模型选择器和环境配置使用同一 Host 模型目录。

## Sidebar Footer

- GitHub、更新、云账户和微信入口改为满宽左对齐，与设置入口保持一致。

本版本首先生成本地 Stable Windows x64 安装包，不自动上传七牛云、不创建 GitHub Release。

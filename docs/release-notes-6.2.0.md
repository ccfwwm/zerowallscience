# ZeroWall Science 6.2.0

## 中文

- 移除旧的本地 OpenCode 模块，固定接入 `@jiesou/dsh-opencode-zen-free-provider@0.1.18`；动态同步并检测当前有效的 `-free` 模型，保留 `deepseek-official/deepseek-v4-flash` 为默认模型。
- 新增科研图片查重、指定论文分析、多论文对比和证据报告四个 ZeroWall 技能，融合现有图片查重与 ManuSift 内核，支持报告和任务续用。
- PDF 解析默认使用 `mineru-document-parser`，将 Markdown、图片和来源位置交给后续分析流程；缺失依赖和未执行检查明确列出。
- 集成 `dsh-univer-office@0.3.2`，替换旧演示文稿服务；移除旧演示文稿、科研图片查重侧栏入口，保留既有文件和 HuanLin Office 预览。
- 删除会话改为局部更新，不再重启 Host 或重载主页面；目标会话忙碌时拒绝删除，其他独立会话可继续运行。
- 优化桌面启动界面，移除冗余说明、扩展进度区域并平滑动画；版本号改为读取应用版本，“关于”固定为设置导航最后一项。
- DSH 保持 `0.1.5-rc.2`，包含独立提交的单会话生命周期修复、晚到模型目录补检和完整终止事件判定。

## English

- Remove the legacy local OpenCode module and pin `@jiesou/dsh-opencode-zen-free-provider@0.1.18`. Dynamically synchronize and probe currently valid `-free` models while keeping `deepseek-official/deepseek-v4-flash` as the default.
- Add four ZeroWall research skills for image duplication, paper analysis, cross-paper comparison, and evidence reports, combining the existing detector with the pinned ManuSift core.
- Default PDF parsing to `mineru-document-parser`, passing Markdown, images, and source locations into analysis. Report missing dependencies and checks that were not executed.
- Integrate `dsh-univer-office@0.3.2`, retire the previous presentation service and image-duplication sidebar, and preserve existing files and HuanLin Office previews.
- Delete individual sessions without restarting the Host or reloading the main page. Reject busy targets while unrelated sessions continue.
- Refine the desktop startup screen with a wider progress surface, smoother motion and less copy. The version now comes from the running application, and About remains the final Settings navigation entry.
- Keep DSH at `0.1.5-rc.2` with separately committed session lifecycle, late model-catalog probing, and complete termination-event fixes.

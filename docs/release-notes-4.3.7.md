# ZeroWall Science 4.3.7

本版本集中修复演示文稿工作台的图片复用、单页修改、文件预览和桌面测试问题。

## 主要更新

- 修复“加入当前图片到对话”错误。演示文稿图片现在会创建为当前会话自己的草稿附件，不再跨会话复用无权读取的 attachment。
- 普通演示文稿修改和主操作默认只重新生成当前页，并在成功后原子更新原 PPTX；其他页面的图片、内容和附件保持不变。
- 保留“重新生成整套”操作，但移动到二级菜单并增加明确确认，避免误触后重建全部页面。
- 演示文稿流程停止生成 PDF，产物区只显示当前 PPTX、完整路径、打开文件和打开所在文件夹。
- 默认集成 `@huanlin/dsh-plugin-better-sidebar-plugin-office@0.1.2`，可在 ZeroWall Science 内直接预览 PPTX、DOCX 和 XLSX。
- 提升演示文稿操作按钮及侧栏底部入口的图标、字号、对比度、悬停和键盘焦点状态。
- Electron 发布 E2E 改为直接启动 `desktop/dist/win-unpacked/ZeroWallScience.exe`，不再使用开发 Electron 代替安装包运行时。

## 兼容性

- 继续兼容已有演示文稿数据库中的历史 PDF 记录，但新任务和后续单页更新不会再生成或展示 PDF。
- 保留 ZeroWall Science 4.3.6 及更早版本的 GitHub Release、Tag 和七牛云不可变对象。

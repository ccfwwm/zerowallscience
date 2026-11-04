# 8.4.23 已验收安装包的 DSH 源码补丁

8.4.23 的 DSH 基线仍为 `cb61e6caf4664e82fc4bf30e9a15d0d8bf32293a`，版本为 `0.2.1-rc.2`。安装包在该基线上显式包含 Windows Explorer 修复的工作区改动；原始 artifact manifest 如实标记 `source.clean: false`，不应把安装包解释成仅由基线提交构建。

`windows-explorer-system-root-8.4.23.patch` 保存完整三个文件的改动（实现及 Windows/WSL 测试）。SHA-256：`8fc2d8a10cbcea94563c5221fcb02d3f641a1f4017dfadc0415abcb3b401e561`。正式安装包内的 native opener 已与应用此补丁后的编译输出逐字节核对。

在上述基线的干净子模块中还原本次源码时，从主仓库根目录执行：

```powershell
git -C deepseek-harness apply --check ../config/deepseek-harness/patches/windows-explorer-system-root-8.4.23.patch
git -C deepseek-harness apply ../config/deepseek-harness/patches/windows-explorer-system-root-8.4.23.patch
$env:ZEROWALL_ALLOW_DIRTY_DSH = '1'
pnpm dsh:verify
```

已含该修复的工作区只执行反向校验，避免重复应用：

```powershell
git -C deepseek-harness apply --reverse --check ../config/deepseek-harness/patches/windows-explorer-system-root-8.4.23.patch
```

补丁不改变 DSH pin、版本或已生成安装包字节。后续正式推进 fork pin 时，应将这些源文件与测试改动纳入 fork 提交，并按新的 pin 完成正常构建验证。

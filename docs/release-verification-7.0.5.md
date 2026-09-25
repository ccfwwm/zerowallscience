# ZeroWall Science 7.0.5 验证记录

重新构建日期：2026-09-25 12:10（Asia/Shanghai）。发布范围：Windows x64 EXE、七牛云稳定通道及 GitHub Release。

## 安装包

- 文件：`desktop/dist/zerowall-science-7.0.5-win-x64.exe`
- 大小：473,975,967 bytes（约 452 MiB）。
- SHA-256：`F03CE839F6C1B19DC7E4EA2E8F5EC97A04FDA112E8DE62AA9D68DB880FCB036F`。

## 检查

- 脑图谱定向测试：通过（`test/read-only-image-viewers.spec.tsx` 5 项）。进入与切换脑图谱不调用 `brain_open` / `brain_analyze`；明确打开图谱后也不自动读取切片，点击“读取切片”才调用 `brain_analyze`。
- 科研插件类型检查：通过（`pnpm --dir plugins/research run typecheck`）。DSH 客户端构建类型检查和改动文件 lint 通过。
- 完整 `pnpm build` 通过；DSH 子模块版本已固定为 `b81aa60c90cf2e2c61711fd09cec93f6cc94a372`。
- `pnpm --dir desktop run package:win` 通过；标准 `desktop/dist` 产出 EXE 和 blockmap。打包器确认桌面启动、7.0.5 版本、设置页中英文切换及运行时策略。本次未执行其他功能回归测试。
- `git diff --check`：通过（仅有现存 CRLF 转换提示，无空白错误）。

## 七牛云公开验证

- `stable/releases/7.0.5/zerowall-science-7.0.5-win-x64.exe`：HTTP 200，473,975,967 bytes，SHA-256 `F03CE839F6C1B19DC7E4EA2E8F5EC97A04FDA112E8DE62AA9D68DB880FCB036F`，与本地一致。
- blockmap：HTTP 200，492,578 bytes，SHA-256 `EB7DAC640760F48FC6597FAD25BD9902919F5D0F4C42CBEE55A028EE6A009ABC`。
- `stable/latest.yml` 和 7.0.5/Stable JSON 更新元数据：HTTP 200，版本均为 7.0.5。

## 构建输出

- 安装包：`desktop/dist/zerowall-science-7.0.5-win-x64.exe`
- 标准输出目录：`desktop/dist`
- 体积提示：解包运行目录约 1,588 MiB，超过 1,500 MiB 建议值；安装包 452 MiB，低于 1,024 MiB 安装包建议值。

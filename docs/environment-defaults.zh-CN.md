# 官方环境变量默认配置

桌面启动时只从 `https://zerowall.chengxunkeji.cn/stable/environment/latest.json` 获取签名指针，校验指针签名、配置对象大小与 SHA-256、配置签名和内容格式，再补齐尚未配置的变量。软件源码和安装包不内置真实变量值。七牛对象为公开 HTTPS，配置值可被任何获得地址的人下载；只有确认接受这一点后才发布真实值。

## 修改与发布

编辑本机忽略文件 `scripts/env/environment-defaults.json`。字段结构参照受版本管理的 `config/environment-defaults.example.json`。实际凭据只保存在忽略目录中，不要把它复制到 Git 跟踪文件。

每次变量值有变化时，将 `version` 改为新的日期版本；已发布版本的对象不可覆盖。然后在仓库根目录执行：

```powershell
pnpm environment:publish
```

命令使用 `config/build/stable.json` 中指定的签名密钥，并读取已有的 `scripts/env/.env.qiniu` 七牛上传配置。上传不可变版本对象，验证公开对象，再更新签名的 `stable/environment/latest.json` 指针。若对象版本已存在但内容不同，发布会失败；改用新版本号后重试。

首次配置或排查下发链路时，可运行 `pnpm environment:probe`。它只上传一个带合成测试值的独立探针对象并验证启动补齐逻辑，不会更新 `latest.json`。发布真实配置后运行 `pnpm environment:verify`，该命令会检查公开下载、签名和临时保险库写入，只输出变量名及状态，不输出变量值。

发布命令会把签名配置暂存到被忽略的 `artifacts/release/<桌面版本>/environment/<配置版本>/`，上传结束后删除其中的明文配置，仅保留无变量值的指针。它不会修改桌面更新指针，也不会创建桌面版本或 GitHub Release。

## 本机优先规则

- 操作系统启动环境、本机凭据库中的旧值和用户手动填写的变量均优先于首次下载的官方默认值。
- 来源仍为官方的值在应用启动时随已签名版本更新；用户手动编辑后记录为本机配置。
- 删除变量会写入本机的自动补齐抑制标记。之后即使官方配置仍包含该变量，也不会自动恢复。
- 设置页中的“从七牛云同步”会在线读取当前签名配置，只更新官方来源项并补齐缺项，不覆盖本机变量。
- 远程配置不可用或签名、摘要验证失败时，应用保留本地值并继续启动。

当前默认文件从 `scripts/env/相关配置.txt` 中的服务凭据映射生成。变量名及格式按应用当前服务合同设置：RMCP 与化工社使用 Bearer Authorization，MinerU 使用 `MINERU_API_TOKEN`，SciMaster 使用 `ZEROWALL_SCIMASTER_API_KEY`，PubMed 使用 `NCBI_API_KEY`。

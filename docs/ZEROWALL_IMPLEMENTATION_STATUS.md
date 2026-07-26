# ZeroWall Science 当前进度与 Agent 接力指南

> 快照时间：2026-07-26 09:01:34 +08:00  
> 本文是当前工作树的权威交接记录。长期目标和阶段定义见 `docs/ZEROWALL_IMPLEMENTATION_PLAN.md`。

## 1. 当前结论

- 仓库：`C:\softworks\gpt-tools\zerowallscience`
- 当前分支：`codex/p1-keychain-secrets`
- 当前 HEAD：`6c416dec685d970dcc029c058df84fc27a2cba5f`
- Git 状态：存在 P1B 未提交改动，不能 reset、checkout 或覆盖。
- Git remote：无。
- GitHub：`ccfwwm/zerowallscience` 当前查询不存在。
- P0：完成。
- P1A：完成并提交。
- P1B：进行中，前端 Keychain 流程已部分实现；Rust 旧 Secret 迁移处于 TDD RED。
- P2–P8：尚未开始系统实施。

## 2. 阶段状态

| 阶段 | 状态 | 当前证据 |
|---|---|---|
| P0 仓库基线 | 完成 | fresh history、品牌迁移、兼容迁移、安全修复均已提交 |
| P1A 数据底座 | 完成 | M000–M008、40 tables、startup integrity |
| P1B Keychain-only | 进行中 | 12 个 tracked 文件修改 + 1 个 untracked `secret_store.rs` |
| P2 Agent/模型 | 未开始 | 尚无 `runtime/agents`、七角色模型或 `ZeroWallClient` |
| P3 Pack 平台 | 未开始 | 尚无 `runtime/packs`、`runtime/marketplace` |
| P4 生命科学旗舰 | 未开始 | 当前仅 8 个 Science Connector 定义行 |
| P5 Kernel/Compute | 未开始改造 | 仅继承基线 kernel/compute，不是目标统一接口 |
| P6 Reviewer/Memory | 未开始改造 | 数据表已预留，产品服务与 UI 未实现 |
| P7 UX/示例 | 未开始 | 当前只有 `bci-trends`、`climate-trends` |
| P8 发布 | 未开始 | 无 remote、无目标 GitHub repository |

## 3. 已提交历史

```text
6c416de fix(data): validate migrated schema state
b51e2af feat(data): add versioned science database foundation
d29c5ec fix: block app-data migration link escapes
d911093 fix: preserve legacy state across ZeroWall rename
0cd9075 chore: remove inherited session caches
167cdb4 chore: establish ZeroWall Science baseline
```

分支：

- `main`：`d29c5ec`
- `codex/p1-data-foundation`：`33c2803`
- `codex/p1-keychain-secrets`：`6c416de`

注意：当前 P1B 分支 HEAD 与 P1A 最终内容一致，但提交 ID 为 `6c416de`；不要基于旧摘要假设 `33c2803` 是当前 HEAD。

## 4. 当前未提交文件

```text
M  apps/desktop/src-tauri/Cargo.lock
M  apps/desktop/src-tauri/Cargo.toml
M  apps/desktop/src-tauri/src/lib.rs
M  apps/desktop/src-tauri/src/runtime.rs
M  apps/desktop/src/app/routes/SettingsPage.modelBrowser.test.tsx
M  apps/desktop/src/app/routes/SettingsPage.tsx
M  apps/desktop/src/lib/scienceConnectors.test.ts
M  apps/desktop/src/lib/scienceConnectors.ts
M  apps/desktop/src/lib/setup.test.ts
M  apps/desktop/src/lib/setup.ts
M  apps/desktop/src/lib/tauri.ts
?? apps/desktop/src-tauri/src/secret_store.rs
?? docs/ZEROWALL_IMPLEMENTATION_PLAN.md
?? docs/ZEROWALL_IMPLEMENTATION_STATUS.md
```

## 5. P1A 已完成内容

- Workspace 启动和切换自动初始化 `.zerowall/science.db`。
- M000–M008 共 9 个事务迁移、40 张关系表。
- Migration SQL fingerprint 和 schema drift 校验。
- SQLite WAL、foreign keys、5 秒 busy timeout。
- Artifact DAG、Compute、Queue、Lease 和 tenant/project/session scope 约束。
- SHA-256 内容路径校验。
- `.zerowall` symlink 和 Windows reparse point 防护。
- 数据库只设计 Secret reference，不设计 Secret 原值列。

P1A 已记录的完整验证：

- `cargo test --lib`：147 passed。
- `cargo build`：通过。
- `cargo clippy --all-targets`：通过，仅既有 warning。
- `pnpm test:brand`：通过。

这些是已提交阶段的历史证据，不代表当前未提交 P1B 工作树仍全量通过。

## 6. P1B 已实现但未提交

### Rust

- `keyring = "4.1.5"` 已加入 Cargo。
- 新建 `secret_store.rs`。
- `SecretRegistry` 只保存 reference，不保存 Secret。
- Provider API Key 可组装成 `OPENCODE_AUTH_CONTENT`。
- Connector Secret 可组装成 sidecar 环境变量。
- 支持 OpenCode OAuth/Auth JSON 作为 Keychain value。
- ID、环境变量名和保留变量校验。
- Registry round-trip 和篡改校验。
- 删除同时清理 credential 和 reference。
- 已实现 `KeyringCredentialStore`。
- 已注册 Tauri commands：`set_provider_secret`、`remove_provider_secret`、`provider_secret_exists`、`set_connector_secret`、`remove_connector_secret`。
- `restart_sidecar_if_running` 已改为 `pub(crate)`。

### Frontend

- `tauri.ts` 新增 Provider/Connector Keychain commands。
- Provider API Key 保存改为 `setProviderSecret`。
- Provider 删除改为 `removeProviderSecret`。
- Custom Provider 不再从 SettingsPage 把 `apiKey` 传入 config。
- Connector Key 先调用 `setConnectorSecret`，再写无 Secret 的 MCP config。
- `connectorConfig` 不再序列化 Secret environment。
- OpenCode OAuth 方法列表当前被隐藏，防止 callback 写 `auth.json`。

## 7. 当前验证结果

### 7.1 通过

2026-07-26 08:59 重新运行：

```powershell
pnpm --filter @zerowall/desktop test -- src/lib/scienceConnectors.test.ts src/lib/setup.test.ts src/app/routes/SettingsPage.modelBrowser.test.tsx
```

结果：3 test files、28 tests 全部通过。

```powershell
pnpm --filter @zerowall/desktop typecheck
```

结果：通过。

```powershell
git diff --check
```

结果：通过；只有 Windows 工作树 LF/CRLF 提示。

### 7.2 当前失败：未完成的 TDD RED

```powershell
$env:TAURI_CONFIG='{"app":{"macOSPrivateApi":true}}'
cargo test secret_store --lib
```

当前失败：

```text
error[E0432]: unresolved imports
super::import_auth_document
super::plan_legacy_config_migration
```

位置：

- `apps/desktop/src-tauri/src/secret_store.rs:422`
- 测试调用约在 `secret_store.rs:585` 和 `secret_store.rs:613`

这是接力 Agent 的第一个实现任务。不要删除这些测试来让编译通过。

## 8. P1B 最短接力路径

### Task 1：完成纯逻辑 RED -> GREEN

**文件：** `apps/desktop/src-tauri/src/secret_store.rs`

- [ ] 实现 `import_auth_document`。
- [ ] 输入必须是 Provider ID 到 auth object 的 JSON object。
- [ ] 写 credential 前完整校验所有 Provider ID 和 auth value。
- [ ] Registry 不得包含 access token、refresh token 或 API Key。
- [ ] 失败时 registry 保持不变。
- [ ] 实现 `plan_legacy_config_migration`。
- [ ] 提取 `provider.*.options.apiKey`。
- [ ] 提取敏感 MCP environment，例如名称包含 `KEY`、`TOKEN`、`SECRET`、`PASSWORD`、`CREDENTIAL`。
- [ ] 敏感 Header 改成 `{env:MCP_<ID>_<HEADER>_SECRET}`。
- [ ] 保留 `LOG_LEVEL`、`baseURL`、model、command 等非 Secret 设置。
- [ ] 重新运行 `cargo test secret_store --lib`。

### Task 2：sidecar 运行时注入

**文件：** `apps/desktop/src-tauri/src/runtime.rs`

- [ ] 在 `spawn_sidecar` 创建 command 前调用 `secret_store::sidecar_secrets(app)`。
- [ ] 始终设置 `OPENCODE_AUTH_CONTENT`；无 credential 时值必须为 `{}`。
- [ ] 循环注入 Connector environment。
- [ ] 更新旧注释，不再声称 Secret 存在 `opencode.jsonc/auth.json`。
- [ ] 添加可测试的纯 helper 或 command-environment contract。

OpenCode 1.17.13 已确认：

- `OPENCODE_AUTH_CONTENT` 优先于 `auth.json`。
- local MCP 自动继承 sidecar `process.env`。
- `{env:VAR}` 配置替换可用。
- OpenCode `Auth.set` 仍会写 `auth.json`。

### Task 3：旧状态迁移

**文件：** `secret_store.rs`、`lib.rs`、`runtime.rs`。

- [ ] startup 在 sidecar 启动前迁移 app-private `auth.json`。
- [ ] 成功写 Keychain 和 registry 后才删除 app-private `auth.json`。
- [ ] 扫描 `opencode.json` 和 `opencode.jsonc`。
- [ ] 迁移 Provider raw `apiKey`。
- [ ] 迁移 MCP sensitive environment/header。
- [ ] Keychain 或配置写回失败时保留旧文件，fail closed。
- [ ] 迁移必须幂等。
- [ ] 加入临时目录集成测试。

### Task 4：CLI 登录导入

**文件：** `apps/desktop/src-tauri/src/runtime.rs`

- [ ] `import_opencode_login` 不再 `std::fs::copy`。
- [ ] 只读用户 OpenCode CLI `auth.json`。
- [ ] 解析每个 Provider auth object。
- [ ] 写入 OS keychain 和 reference registry。
- [ ] 不删除或修改用户 CLI auth 文件。
- [ ] 成功后 restart sidecar。

### Task 5：移除剩余不安全入口

- [ ] 将 `runtime::provider_auth_exists` 替换为 Keychain 查询或删除旧 command。
- [ ] 检查 `OpenCodeClient.setProviderApiKey` 和 `removeProviderAuth` 是否仍有产品调用方。
- [ ] 从 SDK `addCustomProvider` 类型和实现移除 `apiKey` 配置写入能力。
- [ ] OAuth UI 保持隐藏；不要恢复 OpenCode callback。
- [ ] 更新相关注释和 tests。

### Task 6：安全扫描和完整验证

- [ ] 测试 SQLite、JSON、JSONL、log、export 不含 canary Secret。
- [ ] 更新 `runtime/opencode-profile/README.md`。
- [ ] 运行全部 frontend tests、typecheck、lint、build、brand contract。
- [ ] 运行全部 Rust tests、build、Clippy。
- [ ] 运行 `git diff --check`。
- [ ] 检查缓存、二进制和意外大文件。
- [ ] 更新 `PROGRESS.md` 顶部一条真实 P1B 里程碑。
- [ ] 提交 `feat(security): move runtime secrets to OS keychain`。

## 9. 外部资产实况

| 路径 | 当前实况 |
|---|---|
| `C:\softworks\gpt-tools\myscience\assets` | 940 files，101,547,311 bytes |
| `C:\softworks\gpt-tools\wisp-science\skills` | 94 files，908,807 bytes |
| `C:\softworks\gpt-tools\OpenClaudeScience\skills` | 270 files，4,441,117 bytes |
| `C:\softworks\gpt-tools\cscience\diagnostic-latest-runtime\assets\skills` | 81 files，855,040 bytes |

当前 ZeroWall repo：

- `vendor/`：不存在。
- `runtime/skills/core`：7 个 Skill。
- `runtime/skills/external`：当前没有已部署 Skill。
- `scienceConnectors.ts`：8 个 connector ID 定义行。
- Examples：`bci-trends`、`climate-trends`。

因此 42 Wisp Skills、Claude 0.1.25 vendor snapshot、23 MCP groups、247 tools、四个生命科学示例均尚未导入。

## 10. GitHub 与历史记录注意事项

当前事实：

- `git remote -v` 无输出。
- `gh repo view ccfwwm/zerowallscience` 返回 repository not found。
- 不得在 P1B 未通过全量验证时创建或推送目标仓库。

`PROGRESS.md` 继承了 Open Science Desktop 的大量历史记录，其中包括“2026-07-03 已发布同名 public repository”等旧信息。该记录与当前 fresh repository 的 Git/remote 实况冲突。

接力规则：

1. 当前 Git 状态和本文优先于继承历史。
2. `PROGRESS.md` 最新的 P0/P1A 条目可作为阶段证据。
3. 不得根据旧 public repository 记录设置 remote 或覆盖目标 private repository。
4. 最终只在 P8 验收后创建 `ccfwwm/zerowallscience --private`。

## 11. 接力 Agent 启动命令

```powershell
Set-Location C:\softworks\gpt-tools\zerowallscience
Get-Content -Raw AGENTS.md
Get-Content -Raw docs\ZEROWALL_IMPLEMENTATION_PLAN.md
Get-Content -Raw docs\ZEROWALL_IMPLEMENTATION_STATUS.md
git status --short --branch
git diff -- apps/desktop/src-tauri/src/secret_store.rs
```

然后从 P1B Task 1 开始，不要重做 P0/P1A，不要清理现有未提交改动。

## 12. 禁止事项

- 不得 `git reset --hard`、`git checkout --` 或删除当前 P1B diff。
- 不得把 Key、OAuth token、SSH password 写入持久 fixture。
- 不得恢复 OpenCode `PUT /auth/:providerID` 产品调用。
- 不得在配置中保存 custom provider `apiKey`。
- 不得在 MCP config 保存 Secret environment/header 原值。
- 不得在当前阶段创建 GitHub repository 或 push。
- 不得把 Linux runtime 二进制打进 Windows/macOS bundle。
- 不得引入第二套 Agent runtime。


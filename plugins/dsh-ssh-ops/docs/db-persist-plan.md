# 数据库连接持久化实施计划

## 定位

像 SSH 资源那样，数据库连接也能保存 profile + 凭据加密存储。重启后点一下就连。
复用现有 domain storage + credentials 机制。

## 架构

### 复用 SSH profile 的三件套

1. **domain 表**：新增 `db_ops_profiles` domain，存数据库 profile 元数据（不含密码）
2. **凭据存储**：`ctx.credentials` 加密存密码，ref 命名 `DSH_DB_OPS_{STEM}_PASSWORD`
3. **后端方法**：dbProfileList / dbProfileSave / dbProfileDelete / dbProfileConnect
4. **前端**：数据库 tab 连接列表改成两段——上半「已保存」点一下连，下半「当前连接」管理

### 数据结构

```js
// domain 表记录（不含密码）
{
  name, type: 'mysql'|'postgresql'|'redis'|'mongodb',
  host, port, database, username, ssl,
  sshConnectionId: string|null,  // 关联的 SSH profile id（不是运行时 connectionId）
  createdAt, updatedAt
}
// 凭据 ref: DSH_DB_OPS_{STEM}_PASSWORD  → 存数据库密码
```

注意：sshConnectionId 存的是 **SSH profile id**（持久化的），不是运行时 connection id。
dbProfileConnect 时先查 SSH profile 是否已连，没连就先连 SSH 再建隧道。

### 文件改动

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/index.js` | 修改 | 加 dbProfileDomainSpec + 4 个方法 + dbProfileCredentialRefs + cleanup |
| `src/schemas.js` | 修改 | 4 个 schema（dbProfileSave/List/Delete/Connect） |
| `src/descriptors.js` | 修改 | 4 个 descriptor |
| `src/typert.js` | 修改 | 4 个 type + 4 个 member |
| `src/client/api.js` | 修改 | 4 个 API 方法 |
| `src/client/SshDatabase.jsx` | 修改 | 连接列表改为「已保存 profile」+「当前连接」 |

## 任务拆分

### Task 1: 后端 domain + profile CRUD
**Files**: `src/index.js`, `src/schemas.js`, `src/descriptors.js`, `src/typert.js`
- dbProfileDomainSpec（db_ops_profiles 表）
- dbProfileCredentialRefs(dbProfileId) → { password: `DSH_DB_OPS_{STEM}_PASSWORD` }
- dbProfileList / dbProfileSave / dbProfileDelete
- dbProfileConnect：查 profile → resolve 凭据 → 如有 sshProfileId 先确保 SSH 连接 → dbOps.connect
- 4 个 schema + descriptor + typert member

### Task 2: 前端 API + UI
**Files**: `src/client/api.js`, `src/client/SshDatabase.jsx`
- api.js 加 4 个方法
- SshDatabase 左侧列表分两段：
  - 「已保存」：profile 列表，点「连接」一键连；「编辑」「删除」
  - 「当前连接」：运行中连接，点切换 + 断开
- 新建表单加「保存为 profile」checkbox

### Task 3: 构建 + 验证

## 不做的
- ❌ 数据库分组（YAGNI，数据库数量通常不多）
- ❌ SSH profile 关联的 UI 下拉改为 SSH profile 列表（而非运行时连接列表）

# 数据库 UI 标签页实施计划

## 定位

在 SSH 面板加「数据库」标签，用户可手动连接数据库、跑 SQL / 命令、看结果。
不依赖当前 SSH 连接（数据库连接独立，SSH 隧道是可选参数）。
复用已实现的 8 个后端方法（dbConnect/dbListConnections/dbQuery/dbExecute/dbListTables/dbDescribeTable/dbRun/dbDisconnect）。

## 架构决策

### 1. 独立 tab，不依赖 SSH active 连接

和「批量」tab 类似，「数据库」tab 是独立入口。
- files/tunnels tab 需要 `active` SSH 连接（disabled when `!active`）
- 数据库 tab 始终可点，自己管理连接列表

### 2. 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/client/SshDatabase.jsx` | 新建 | 数据库 tab 组件：连接列表 + 连接表单 + SQL/命令编辑器 + 结果表格 |
| `src/client/SshPanel.jsx` | 修改 | 加「数据库」tab 按钮 + tabPane；import SshDatabase |
| `src/client/api.js` | 修改 | 加 8 个数据库 API 方法 |

### 3. UI 布局

```
┌─────────────────────────────────────────┐
│ [终端][文件][转发][批量][数据库]          │  ← tab 栏
├──────────┬──────────────────────────────┤
│ 连接列表  │  SQL / 命令编辑器              │
│          │  ┌────────────────────────┐  │
│ + 新建    │  │ SELECT * FROM users    │  │
│          │  │                        │  │
│ ● mysql  │  └────────────────────────┘  │
│   prod   │  [执行] [清除]                 │
│ ● redis  │  ┌────────────────────────┐  │
│   cache  │  │ id │ name │ email       │  │  ← 结果表格
│          │  │ 1  │ alice│ a@b.com     │  │
│          │  └────────────────────────┘  │
└──────────┴──────────────────────────────┘
```

- 左侧：连接列表（类型图标 + 名称 + host:port），点「新建」弹连接表单
- 右侧：选中连接后显示编辑器 + 执行按钮 + 结果区
- 连接表单：类型(select) + host + port + database + username + password + ssl(select) + sshConnectionId(select 已连SSH) + name
- SQL 库（mysql/pg）：textarea 输 SQL，「执行」调 dbQuery（SELECT）或 dbExecute（写）
- Redis：输入框输命令 `GET key`，「执行」调 dbRun
- Mongo：输入框输 JSON `{collection, operation, filter}`，或简化为 collection + operation + filter 三个框

### 4. 交互逻辑

- SQL 语句自动判断读写：以 SELECT/SHOW/DESC/EXPLAIN/WITH 开头 → dbQuery，否则 → dbExecute
- Redis 命令解析：按空格 split，第一个是 command，其余是 args
- Mongo：collection + operation(select) + filter(JSON textarea)
- 结果区：SQL 返回 columns+rows 画表格；Redis/Mongo 返回 result JSON 展示
- 连接表单的 sshConnectionId：从 api.list() 拿已连 SSH 列表做下拉

## 任务拆分

### Task 1: api.js 加数据库方法
**Files**: `src/client/api.js`
- 加 dbConnect/dbListConnections/dbQuery/dbExecute/dbListTables/dbDescribeTable/dbRun/dbDisconnect 8 个方法
- 模式同现有方法：`this.call("dbConnect", input)` 等
- 验证：构建通过

### Task 2: SshDatabase.jsx 连接列表 + 新建表单
**Files**: `src/client/SshDatabase.jsx`（新建）
- 组件 `SshDatabase({ api })`
- state: connections, showForm, form fields, selectedId
- 左侧连接列表：api.dbListConnections() 加载，显示 type+name+host:port
- 新建表单：type/host/port/database/username/password/ssl/sshConnectionId/name
- sshConnectionId 下拉从 api.list() 取已连 SSH
- 提交调 api.dbConnect()，成功后刷新列表
- 右侧：未选连接时显示提示

### Task 3: SQL/命令编辑器 + 执行
**Files**: `src/client/SshDatabase.jsx`
- 选中连接后，右侧显示编辑器
- mysql/pg：textarea 输 SQL
- redis：输入框输命令
- mongodb：collection 输入 + operation select + filter textarea
- 「执行」按钮：按连接类型和语句分发到 dbQuery/dbExecute/dbRun
- 自动判断 SQL 读写

### Task 4: 结果展示
**Files**: `src/client/SshDatabase.jsx`
- SQL 结果：columns + rows 画表格（横向滚动，200 行截断提示）
- Redis/Mongo 结果：JSON.stringify 展示在 pre 块
- 错误：红色提示
- 执行状态：busy / 行数 / 耗时

### Task 5: SshPanel.jsx 集成 tab
**Files**: `src/client/SshPanel.jsx`
- import SshDatabase
- tab 栏加「数据库」按钮（和「批量」同级，始终可点）
- body 加 TabErrorBoundary + tabPane（display:none 切换）
- zhDict 加 tabDatabase: "数据库"

### Task 6: 构建 + 验证
- `npm run build:client` 成功
- 重启 web 手动验证

## 不做的（YAGNI）
- ❌ 表结构浏览树（dbListTables/dbDescribeTable 后端已有，UI 暂不做树）
- ❌ 数据导出
- ❌ 连接持久化 profile（纯内存，刷新丢失）
- ❌ 多结果集
- ❌ SQL 语法高亮

# dsh-ssh-ops 数据库 Agent 工具实施计划

## 定位

给 AI agent 加数据库工具，让 agent 能在对话里连接数据库、查询、执行语句。
支持 MySQL / PostgreSQL / Redis / MongoDB，可通过已连的 SSH 服务器跳转访问内网库。
纯内存连接管理（不持久化 profile），高危 SQL 拦截。

## 架构决策

### 1. 扩展 SshOpsService，不新建 service

- 同一个 package 只有一个 cordis service（`sshOps`）
- SshOpsService 持有 `this.dbOps = new DbOpsManager(this)`
- 数据库方法作为 sshOps service 的额外 members 暴露
- 复用现有的 SSH connection record（`this.connections`）做隧道跳转
- 不改 cordis.patch.yml，不改 client namespace

### 2. 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/db-ops.js` | 新建 | DbOpsManager 类：连接管理、查询、隧道、断开 |
| `src/db-safety.js` | 新建 | SQL 安全评估：拦截 DROP DATABASE/SCHEMA/TABLE、TRUNCATE、SHUTDOWN |
| `src/index.js` | 修改 | 持有 dbOps 实例 + 8 个代理方法 + registerTools 加 8 个工具 |
| `src/schemas.js` | 修改 | 8 个数据库 schema |
| `src/descriptors.js` | 修改 | 8 个 descriptor |
| `src/typert.js` | 修改 | 8 个 type declaration + 8 个 service member |
| `scripts/build-host.mjs` | 修改 | bundle mysql2/pg/redis/mongodb |
| `package.json` | 修改 | 加 4 个依赖 |

### 3. 驱动选型（全部纯 JS，可 esbuild bundle）

| 类型 | 驱动 | 连接方式 | SSH 隧道 |
|---|---|---|---|
| MySQL | `mysql2` | `createPool({ stream? })` | stream 注入或本地端口 |
| PostgreSQL | `pg` | `new Pool({ stream? })` | stream 注入或本地端口 |
| Redis | `redis` (node-redis v4) | `createClient({ socket })` | 本地端口转发 |
| MongoDB | `mongodb` | `new MongoClient(uri)` | 本地端口转发 |

**SSL 设计**（云托管数据库是常用场景，必做）：db_connect 加 `ssl` 参数，三档：
- `disabled`（默认）— 不加密，内网/本机库
- `preferred` — 加密但不验证书，自签证书的云数据库（阿里云 RDS 自签常见）
- `verify` — 加密 + 验证 CA，公网 CA 签的云数据库（AWS RDS / Atlas）
- 驱动映射：mysql2/pg → `ssl: { rejectUnauthorized }`，redis → `socket: { tls: true, rejectUnauthorized }`，mongodb → `tls: true, tlsAllowInvalidCertificates`

**SSH 隧道统一方案**：如果 db config 指定 `sshConnectionId`，用 `ssh2.forwardOut` + `net.createServer` 建本地 TCP server（127.0.0.1:随机端口）转发到远程 db_host:db_port，驱动连本地端口。断开时关闭 server。统一路径，不依赖各驱动 stream 注入能力差异。

### 4. 数据结构

```js
// DbOpsManager 内部
dbConnections = Map<dbConnectionId, {
  id, type: 'mysql'|'postgresql'|'redis'|'mongodb', name,
  config: { host, port, database, username, password, ssl: 'disabled'|'preferred'|'verify' },
  sshConnectionId: string | null,
  pool: any,        // mysql2/pg Pool 或 redis/mongo client
  tunnel: { server, port } | null,
  createdAt: string
}>
```

### 5. 安全拦截（db-safety.js）

```js
assessSqlStatement(sql) → { blocked: boolean, reason?: string }
```

拦截的语句（不区分大小写）：
- `DROP DATABASE` / `DROP SCHEMA` — 不可恢复
- `TRUNCATE` — 不可恢复
- `SHUTDOWN` — 停库
- `DROP TABLE` — 破坏性大

放行：CREATE / ALTER / INSERT / UPDATE / DELETE / SELECT / 其他 DDL。

### 6. Agent 工具集（8 个）

| 工具 | 说明 |
|---|---|
| `db_connect` | 连接数据库（可指定 ssh_connection_id 走隧道） |
| `db_list_connections` | 列出当前数据库连接 |
| `db_query` | 只读查询（SELECT），返回 columns + rows |
| `db_execute` | 写操作（INSERT/UPDATE/DELETE/DDL），安全拦截 |
| `db_list_tables` | 列出表/collection |
| `db_describe_table` | 表结构（MySQL/PG）|
| `db_run` | Redis/MongoDB 命令执行 |
| `db_disconnect` | 断开数据库连接 |

### 7. dbRun 的 Redis/MongoDB 设计

**Redis**：`{ command: 'GET', args: ['mykey'] }` → `client.sendCommand([command, ...args])`

**MongoDB**：`{ collection: 'users', operation: 'find'|'insertOne'|'updateOne'|'deleteOne'|'countDocuments', filter?, document?, update?, options? }`

---

## 任务拆分

### Phase 1: 基础设施 + 验证

#### Task 1: 验证驱动可 esbuild bundle
**Objective**: 确认 mysql2/pg/redis/mongodb 能被 esbuild bundle 进 host ESM
**Files**: 临时 spike 脚本
**验证**: esbuild 成功输出，无 native binding 报错

#### Task 2: 添加依赖 + 修改 build-host.mjs
**Files**: `package.json`, `scripts/build-host.mjs`
- package.json dependencies 加 `mysql2`, `pg`, `redis`, `mongodb`
- build-host.mjs 的 external 保持 `["@deepseek-ai/*", "ssh2"]`（驱动要 bundle）
- `npm install --cache /tmp/npm-cache-dsh`
- `npm run build:host` 成功

### Phase 2: 安全层

#### Task 3: 创建 db-safety.js + 测试
**Files**: `src/db-safety.js`, `test/db-safety.mjs`
- `assessSqlStatement(sql)` 返回 `{ blocked, reason? }`
- 测试：DROP DATABASE 被拦、TRUNCATE 被拦、SELECT 放行、INSERT 放行
- `npm test` 通过

### Phase 3: 核心数据层（db-ops.js）

#### Task 4: DbOpsManager 基础结构 + dbConnect（直连）
**Files**: `src/db-ops.js`
- DbOpsManager 类，构造接收 SshOpsService 引用
- `dbConnections = new Map()`
- `async connect(request)` — 直连模式（无 SSH 隧道）
  - MySQL: `mysql.createPool({ host, port, user, password, database })`
  - PostgreSQL: `new pg.Pool({ ... })`
  - Redis: `createClient({ socket: { host, port }, password? })`
  - MongoDB: `new MongoClient(uri)` + `connect()`
- 返回 `{ ok, value: { dbConnectionId, name, type } }` 或 `{ ok: false, error }`

#### Task 5: dbConnect（SSH 隧道模式）
**Files**: `src/db-ops.js`
- 如果 request 有 `sshConnectionId`：
  - 找到 SSH connection record
  - `client.forwardOut` + `net.createServer` 建本地端口转发到 db_host:db_port
  - 驱动连 `127.0.0.1:localPort`
  - 记录 `tunnel = { server, port }`

#### Task 6: dbDisconnect + dbList
**Files**: `src/db-ops.js`
- `async disconnect(request)` — 关闭 pool/client + 关闭 tunnel server
- `async list(request)` — 返回连接列表（不含密码）

#### Task 7: dbQuery + dbExecute（MySQL/PG）
**Files**: `src/db-ops.js`
- `async query(request)` — SELECT，返回 `{ columns, rows, rowCount, truncated }`
  - MySQL: `pool.query(sql, params)`
  - PG: `pool.query(sql, params)`
  - rows 截断 MAX_DB_ROWS = 200
- `async execute(request)` — 写操作，先 `assessSqlStatement`，拦截则返回 error
  - 返回 `{ affectedRows, insertId?, warning?, truncated }`

#### Task 8: dbListTables + dbDescribeTable
**Files**: `src/db-ops.js`
- `async listTables(request)` — MySQL: `SHOW TABLES`，PG: `information_schema.tables`
- `async describeTable(request)` — MySQL: `SHOW COLUMNS`，PG: `information_schema.columns`

#### Task 9: dbRun（Redis/MongoDB）
**Files**: `src/db-ops.js`
- `async run(request)` — Redis: `client.sendCommand([command, ...args])`
- MongoDB: 按 operation 分发 find/insertOne/updateOne/deleteOne/countDocuments

### Phase 4: Typert 集成

#### Task 10: schemas.js + descriptors.js + typert.js
**Files**: `src/schemas.js`, `src/descriptors.js`, `src/typert.js`
- 8 个 request/result schema
- 8 个 descriptor（def 方法）
- 8 个 type declaration + 8 个 service member
- 相关类型：DbConnectionInfo, DbColumn, DbRow, DbQueryResult, DbExecuteResult, DbTableInfo

### Phase 5: Service 集成 + Agent 工具

#### Task 11: index.js 代理方法
**Files**: `src/index.js`
- 构造函数加 `this.dbOps = new DbOpsManager(this)`
- 8 个代理方法（dbConnect → dbOps.connect 等）
- cleanup/disconnect 时清理数据库连接

#### Task 12: registerTools 加 8 个 agent 工具
**Files**: `src/index.js`
- db_connect, db_list_connections, db_query, db_execute, db_list_tables, db_describe_table, db_run, db_disconnect
- 每个工具有 description + parameters + output schema + render + execute

### Phase 6: 验证

#### Task 13: 构建 + 安全测试
- `npm run build` 成功
- `npm test` 通过（含 db-safety 测试）
- lib/index.js 含数据库代码，体积合理

#### Task 14: 端到端测试
- 连测试服务器（8.137.175.198）的 MySQL（如已装）
- 或连本地 SQLite？不，SQLite 不在范围内
- 手动验证 db_connect → db_query → db_disconnect 流程

---

## 不做的（YAGNI）

- ❌ 人工数据库 UI（用户选了 Agent 工具定位）
- ❌ 数据库连接持久化 profile
- ❌ 连接分组/文件夹
- ❌ ER 图、schema 对比、数据导入导出
- ❌ SSH 隧道 stream 直注（统一用本地端口转发）
- ❌ SQLite（用户没选）

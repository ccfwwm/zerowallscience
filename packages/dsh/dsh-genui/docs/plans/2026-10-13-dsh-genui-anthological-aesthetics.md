# GenUI 选集美学纲领（Anthological Aesthetics Program）

> 状态：设计稿（未实现、未合并、未发布）
> 依据：代码基线 `main@015b909`（v0.12.0 已发布）。审计对象：`src/client/GenuiBlock.module.css`（2259 行，设计系统 v2→v4+ 令牌层与注释史）、`src/client/spec.ts`（896 行 schema）、`SKILL.md` 组件词汇、`src/client/gallery.ts`（215 行画廊）、`src/client/templates.ts` + `TemplateDrawer.tsx`（模板中心）、`scripts/e2e-visual.mts` 与 `scripts/genui-usage-audit.mjs`（既有验收工具）。
> 一句话：**把"每个组件都渲染对了"推进到"每次生成读起来像一篇精心编排的选集"——渲染层（A）统一编辑级排版引擎，词汇层（B）给模型表达美的受控字段，选集层（C）让画廊与模板中心本身成为审美样板；三层共用同一套令牌、同一套验收、同一个发布节奏。**

---

## 0. "选集美学"指什么

选集（anthology）的本质是一种编辑行为，四个特征：

| 特征 | 含义 | 在 GenUI 里的对应物 |
|---|---|---|
| 取舍 | 不是全部内容都上，每个元素要挣得自己的位置 | 组件预算规则（hero ≤1 等）与"何时不用"指引 |
| 编排 | 章节有顺序、有节奏，不是零件平铺 | bento/span、章节分隔、图表册等编排范式 |
| 层级 | 标题/引题/正文/注释/数据的排版层级一眼可辨 | v4 字号对比（34/28/24/19/16 vs 14.5 正文）的延续 |
| 克制 | 装饰是最后手段；层级靠字号、留白、结构表达 | "移除强调色竖条/色块"路线（0.9.x）不回潮 |

三层含义（对应本纲领的三个工作流）：

- **渲染层 A**：排版引擎。不管模型写什么，默认输出就已经符合编辑级排版——这是"下限保证"。
- **词汇层 B**：表达字段。模型在需要时能**受控地**表达取舍得起的强调——这是"上限引导"。
- **选集层 C**：样板自身。画廊、模板中心、README 证据本身就该是最美的选集——这是"示范闭环"。

---

## 1. 现状审计（事实）

设计系统不是空白起点，它已经历 v2（0.5.0 令牌收敛）→ v3–v10（0.9.x：12.5px 字号下限、标题层级、CJK 行高字距、表格数据化）→ hero/bento/palette/tone/ring/spark（0.10–0.11）→ 无边框导出图标（0.12.0）多轮迭代。本纲领是**下一章**，先摆事实：

| 领域 | 事实（file:line） | 判定 |
|---|---|---|
| 令牌层 | 五套刻度集中在 `.block`/`.panel`：字号 9 档、间隙 4/8/12/16、圆角 12/8/6/999、色调 8%/14%、表面分层（`GenuiBlock.module.css:50-110`）；颜色全部解析宿主 `--dsw-alias-*`，hex 仅作 fallback（全文件 25 处带色值字面量**全部**是 fallback 位） | 纪律良好，是资产不是债务 |
| 深浅主题 | 深色靠宿主 layer-2 + 4% label 叠色抬卡（`:20-24`），浅色靠 1px 边 + 分层阴影（`:93-110` 注释记录了 #159 "灰卡"教训与"相邻浅表面需 ≥4% 明度差或 ≥0 1px 3px 阴影"规则） | 机制成熟，但规则只活在注释里，未固化为夹具 |
| 字号刻度 | v4：hero 34 / display 28 / h1 24 / h2 19 / h3 16 / body 14.5 / title 13.5 / meta 12.5 / data 12（`:44-56`） | 刻度完整 |
| **令牌命名债** | `--dsl-g-font-hero: 34px`（`:45`）实际只服务 `stat.size:"hero"`（`.statValue`，`:497`）；`hero` 封面组件的 52px **硬编码**在 `.heroValue`（`:391`），绕开刻度；`display 28` 无任何组件使用 | 命名误导 + display 档闲置 + 封面值游离刻度外 |
| text 词汇 | `size: h1\|h2\|h3\|body\|muted\|caption` + `center`（`spec.ts:96-98`）；无 display 档、无对齐字段、无引题样式 | 上限不足：模型要"一页里第二大的字"只能借 h1 |
| divider | 无参（`spec.ts`） | 无章节语义：选集的"第 N 章"没有表达手段 |
| 动效 | `genuiReveal 0.45s cubic-bezier(0.22,1,0.36,1)`（`:1798-1809`）、骨架 `dsl-skeleton`、按钮反馈 `genuiPopIn`；两处 `prefers-reduced-motion` 全关（`:1790`、`:1819`） | 尊重系统偏好，但时长/缓动是字面量，未令牌化；入场无编排（同屏全部同时 reveal，无阶梯） |
| 交互态 | `:hover` 31 处、`:focus-visible` 14 处；按钮 hover 走 `border-color + brightness filter`（`:1600` 附近），表格行/列表行 hover 走 4% label wash（`--dsl-g-hover`，`:70`）——**两套 hover 语言并存** | 需要统一成一套交互态标准 |
| 图表排版 | `charts.tsx` 无内联 fontSize（排版集中在 CSS，好）；数值标注 11px 是 0.5.0 定的死值 | 轴/图例/标注字号未入令牌刻度 |
| 画廊 | `gallerySpec` 覆盖全部组件词汇，但结构是**零件目录**：50+ 节点平铺、无章节、无叙事、无取舍示范；仅被测试消费（`tests/genui-gallery.spec.tsx`），不是用户可见面板 | "选集"缺位的直接证据 |
| 模板中心 | 7 类模板（dashboard/data/flow/chart/interactive/quiz/advanced），instruction+demo 双通道 dogfood；achievements 标签页 | 机制好；模板预览将随 A 层自动受益 |
| 站点 | `site/index.html` 是构建产物（"DSH Extensions" 落地页）；README 承担真实证据（三张真实输出截图 + 视频） | 证据刷新随 C 层走 |
| 验收工具 | `scripts/e2e-visual.mts`（真实浏览器视觉回归）、`scripts/genui-usage-audit.mjs`（采纳率/组件分布审计） | 已在，缺的是"每个新表面双主题+窄列"的夹具纪律 |

审计结论：**问题不是"没有设计系统"，而是（a）刻度有洞（display 闲置、52px 游离）、（b）交互态与动效两套语言、（c）模型的美学词汇上限不足、（d）画廊是目录不是选集。**

---

## 2. 总原则（四条）

1. **层级优先于装饰**。延续 v4 路线：层级由字号、留白、结构表达；禁止强调色竖条/色块/uppercase 标题回潮（0.9.x 移除过的东西不再加回来）。
2. **令牌单一来源**。一切新视觉决策解析进 `--dsl-g-*` 刻度（或经 `--dsw-alias-*` 宿主令牌）；刻度不够就**扩刻度**（如新增 `--dsl-g-gap-xl`），不搞组件内特例。hex 字面量只允许出现在 fallback 位。
3. **默认即美，词汇只引导**。零美学字段的标准渲染路径必须已经好看；B 层字段是方向盘不是地基——删掉全部美学字段，UI 依然成立。
4. **可证据化**。每条美学变更随（a）双主题 + 560px 窄列的视觉回归夹具、（b）采纳审计数字落地；沿用 8-12 方案的原则：默认值调整要证据，不搞"永远锁死"也不搞"随手放宽"。

沿用既有边界三分法：**安全边界**（颜色白名单、无任意 CSS 注入）不可协商；**规模/性能边界**（节点上限、字号下限）集中在一张默认值表、可调需证据；**语义边界**（何时用 hero、何时用 display）写清适用场景，不一刀切。

---

## 3. 工作流 A：渲染层——排版引擎（设计系统 v11）

纯 CSS/令牌层，**无 schema 变更**，对既有围栏零破坏。

### A1 字号刻度收口

- `.heroValue` 的 52px 入刻度：新令牌 `--dsl-g-font-mega: 52px`（mega = 封面专属；`--dsl-g-font-hero` 更名为 `--dsl-g-font-stat-hero` 或维持原名但在注释里写清服务对象——二选一，倾向前者，一次改清）。
- `--dsl-g-font-display` 从闲置转为 B1 的 text `size:"display"` 服务档；A 阶段先把令牌位留正。
- 图表数值标注 11px、轴刻度/图例字号入 `data`/`meta` 档引用，消灭图表内死值。

### A2 节奏系统（编辑级呼吸）

- 新增 `--dsl-g-gap-xl: 24px`（章节间距档）；`.banner` 底部间距、章节级 card 群之间的呼吸、图表册分章 gap 统一引用。
- 规则写进注释：**组件内紧凑用 md，章节之间用 xl**——让"编排节奏"成为有名字的东西。

### A3 交互态统一（一套语言）

- 标准：**hover = 4% label wash（`--dsl-g-hover`）；active = translateY(1px)（既有）；focus-visible = 2px accent ring 令牌**（新增 `--dsl-g-ring`：颜色 = accent、偏移 2px；键盘可达性同时是审美问题）。
- 按钮 hover 的 `brightness filter` 退役，统一入 wash 语言；primary 按钮用 accent wash 表达。
- 31 处 `:hover`、14 处 `:focus-visible` 逐一对表迁移；迁移完在 CSS 头部注释声明交互态标准，防止再分叉。

### A4 动效令牌与入场编排

- 令牌化：`--dsl-g-dur-fast: 0.15s`（交互反馈）/ `--dsl-g-dur-reveal: 0.45s`（入场）/ `--dsl-g-ease-out: cubic-bezier(0.22, 1, 0.36, 1)`。
- 入场阶梯：grid/row 同屏子卡按 30ms 阶梯延迟 reveal（封顶 10 张，之后同时入场）——选集"翻页感"的最低成本实现；`prefers-reduced-motion` 下阶梯同样归零（既有两处媒体查询扩展覆盖）。
- 入场不重放的既有修复（#101）语义保持：恢复态组件直接展示。

### A5 深浅主题对等夹具（把 #159 教训固化）

- e2e-visual.mts 夹具矩阵：**每个新/改表面 × light/dark × 560px 窄列**三档截图入回归。
- 把注释里的"相邻浅表面需 ≥4% 明度差或 ≥0 1px 3px 阴影"规则写成夹具断言（对 card/callout/quiz/plot 四类表面量测）。

### A6 表格与图表的编辑级细节

- 表头/数字列的既有数据化成果复核入夹具（斑马纹 2.5% wash、右对齐、tabular-nums）。
- echart preset 的主题化配置补齐 A1 的字号引用（ECharts 内部 textStyle 从令牌读值——挂在挂载时 `getComputedStyle` 一次，不逐帧）。

---

## 4. 工作流 B：词汇层——美学表达字段

每个字段都是**加法**：走 schema registry（canonical 校验 + unknown-field 诊断 + 归一化测试，0.12.0 #275 纪律），每个字段在 SKILL.md 给"何时不用"。

| # | 字段 | 规格 | 编辑理由 |
|---|---|---|---|
| B1 | `text.size:"display"` | 复用 `--dsl-g-font-display: 28` | "比 h1 大一档"的真实需求；**预算：一条回答 ≤1** |
| B1' | `text.align:"left\|center\|right"` | 泛化既有 `center`（保留兼容，`center:true` 归一化为 `align:"center"`） | 封面页/引言页排版需要 |
| B2 | `divider.label` | `{"type":"divider","label":"…"}"`：线 + meta 小标签居中 | 选集"第 N 章"的表达手段；C1 直接依赖 |
| B3 | `card.eyebrow` | 标题上方 meta 档小引题（hero 已有同款语言的 `.heroLabel`） | 卡片群章节化的轻量手段 |
| B4 | `image.caption` | 图注（caption 档、次级色、居中可选） | 图片 currently 只有 alt（无障碍用），无视觉图注 |

### B5 SKILL.md「编排范式」章节（本工作流的重心）

美学指导从**字段清单**升级为**编辑模式**。6 个命名范式，每个一段最小示例围栏：

1. **封面页**（hero + display 引言 + 三卡摘要 bento）——报告/汇报开头
2. **对比页**（左右两张 tone 卡 + 差异表）——方案/版本对比
3. **时间线叙事**（steps 或 timeline + 里程碑卡）——过程/复盘
4. **主表明细**（filter + table details + 汇总 stat）——数据问答
5. **结论卡**（tone 卡 + 进度/指标 + 行动按钮）——分析收尾
6. **测验页**（quiz 组 + submit）——教学交互

### B6 克制预算（写进规则）

hero ≤1（既有）；display ≤1；eyebrow/divider.label 按叙事需要但连续两章不用同款强调。克制条款与范式同章发布——预算即风格。

### B7 系统提示词预算对冲

0.9.x 实测把组件目录从 10,928 → 5,823 字符（-47%）。B 层新增字节必须靠合并/去重旧规则**省回来**：范式章节进 SKILL.md（按需加载），进系统提示词的只有字段速查行。发布前跑字符数对账。

---

## 5. 工作流 C：选集层——画廊、模板中心、站点

### C1 gallerySpec 重排为真选集（C 层重心）

现状是 50+ 节点的零件目录。重排为章节化选集，直接 dogfood A+B：

```
hero 封面 → divider「摘要」→ 三 stat bento → divider「数据」→ 主表+明细+分组表
→ divider「图表册」→ chart 三形态 + echart preset 精选 → divider「交互」→ 表单/判卷
→ 附录（低频组件平铺区，保留目录职能）
```

- 每章有取舍（图表册精选，不全量堆砌）；低频组件不删除，降级进附录——**目录职能保留，叙事职能新增**。
- 继续作为规范围栏：测试（genui-gallery.spec.tsx）、文档、README 截图、e2e 视觉夹具共用这一份 spec。

### C2 GitHub Pages 选集页（2026-10-14 定：模板中心方案砍掉，样板改放公开站点）

- **机制**：C1 重排后的 `gallerySpec` 由构建脚本经 `createStandaloneHtmlDocument`（`src/client/artifact/html.ts`）生成独立 HTML，提交到 `site/`——现有 `deploy-product-site.yml` 对 `site/**` 自动部署 Pages，零新增基建。人在 `https://omdsh-dev.github.io/dsh-genui/` 直接看选集，不依赖 DSH 宿主。
- **一处小重构**：`html.ts` 取 bundle 走浏览器 `fetch`；构建脚本在 node 里跑，需把「bundle 字节来源」抽成可注入（浏览器 fetch / node 读 `lib/assets/*` 与 runtime 产物）。
- **单一事实源**：选集页、回归测试（genui-gallery.spec.tsx）、README 截图（e2e-visual）、公开页面全部消费同一份 `gallerySpec`——改一处四处同步。
- 模板中心（TemplateDrawer）不加范式模板（用户裁定没必要）；其既有七类模板与令牌化收口另行择机，不挂在本纲领。

### C3 README 与站点证据刷新

- 三张 showcase 截图从 C1 新画廊重出（真实渲染，沿用"无概念 mockup"原则）；demo-prompts.md 的四步提示复现新选集。
- CHANGELOG 按 house style 记设计系统 v11 条目。

### C4 采纳闭环

- B/C 合并前跑 `genui-usage-audit.mjs` 记基线，合并后 1–2 周复测：围栏采纳率、hero/bento/display 使用率、范式命中率、junk 节点告警率。
- 采纳数字决定 B6 预算是否收紧/放宽——证据驱动的调整路径，不是一锤子定价。

---

## 6. 验收与防回归

| 门禁 | 内容 |
|---|---|
| 视觉回归 | A3/A4 每处迁移 + B 字段渲染 + C1 章节化画廊：双主题 + 窄列夹具（A5 矩阵） |
| 对比度 | badge/callout/button 各 tone 双主题 AA 夹具（0.5.0 修过 2.4:1 → 5.7:1 一类问题；防回潮） |
| 单测 | B 每字段 registry 测试（canonical/归一化/unknown-field 诊断路径）；`text.center` → `align` 兼容归一化测试 |
| 预算对账 | B7 字符数对账脚本断言（系统提示词目录不超当前基线） |
| 不回退 | 不删除任何已发布字段/组件；`scene3d`、38 组件、面板、持久化语义原样（沿用 8-12 方案原则） |

---

## 7. 阶段与发布

| 阶段 | 内容 | 发布 | 依赖 |
|---|---|---|---|
| 一（渲染层 v11） | A1–A6，纯 CSS/令牌，无 schema 变更 | 0.13.0 | 无 |
| 二（词汇层） | B1–B4（小步独立合并，每字段一个 PR）+ B5/B6（SKILL）+ B7 | 0.13.x / 0.14.0 | 阶段一的令牌位 |
| 三（选集层） | C1（画廊选集化）→ C2（Pages 选集页）→ C3（README 截图）→ C4（前后审计） | 0.14.0 | B2/B3 落地（画廊分章需要 divider.label/eyebrow） |

每阶段独立可发布、独立可回滚；阶段一合入后模板中心/全部既有围栏立即受益。

---

## 8. 边界（不做的事）

- 不引入新图表引擎、不做插件内主题切换器（主题归宿主）。
- 不做围栏级用户自定义 CSS/字体（安全边界：颜色字段白名单纪律不放宽）。
- 不删除已发布字段、不改既有字段语义（兼容边界；B1' 的 `center` 只归一化不废弃）。
- 不把美学写成硬性禁令：字号下限、入场阶梯封顶这类数字全部进默认值表（沿用 PANEL_LIMITS 思路集中管理，调整走证据）。
- 不追求"每次生成必用范式"：范式是模型的可选项，渲染器下限才是承诺。

---

## 9. 风险与对策

| 风险 | 对策 |
|---|---|
| 宿主令牌漂移（`--dsw-alias-*` 改名/语义变化） | fallback 纪律保持；packed host smoke 已覆盖启动渲染 |
| 0.10.0 灰卡类回归（浅色表面调暗） | A5 夹具先行合入，规则从注释升为断言后再动表面 |
| 词汇膨胀导致模型误用（display 满天飞） | B6 预算写进 SKILL 规则 + 每字段"何时不用" + C4 采纳审计回看 |
| 系统提示词预算膨胀 | B7 对冲：新增字节 = 合并节省字节，对账脚本门禁 |
| 画廊重排破坏既有测试/截图断言 | C1 与阶段二同窗口合入，测试随章节结构调整（选择器按章节容器收敛） |

---

## 10. 阶段一实施记录（2026-10-14，分支 `feat/design-system-v11`）

落地：A1/A2/A3/A4/A6 全部完成（`GenuiBlock.module.css` 令牌层 + 组件规则、`EChartNode.tsx` 主题字号），vitest 1210 通过、tsc 零错误。实施中的偏差与新发现，按事实记录：

1. **display 档并非闲置**（§1 审计结论修正）：`gradeScoreValue`（本地判卷得分）已使用 `--dsl-g-font-display`。B1（text `size:"display"`）仍然成立——text 节点至今不可达该档。
2. **根级入场阶梯已存在**：`GenuiBlock.tsx` 根 items 已按 90ms 步进（封顶 720ms）阶梯 reveal。计划中的 grid/row 子级 30ms 阶梯**推迟**：#101 的防重放机制与根包装的 `onAnimationEnd` 耦合，纯 CSS 给子级加动画会重新引入「宿主重插节点时重放入场」的回归面；留待阶段二与 B 层一起评估。
3. **新发现并修复**：会话面板 chrome（头部/关闭/模板按钮）的 hover 用 `rgba(255,255,255,…)` 字面量，浅色主题下不可见——已迁到 `--dsl-g-hover` / 新增的 `--dsl-g-hover-strong`（8% 档），并补齐三处 focus-visible。
4. **新增小项**：四个折叠 chevron 字形（detail/group/accordion/file-tree）从 10/11px 混用统一为 11px——图标字形不入字号刻度，但必须彼此一致。
5. **视觉回归已在无 Chrome 的机器上跑通**（2026-10-14 补）：`e2e-visual.mts` 浏览器解析顺序改为 `E2E_CHROMIUM` → 系统 Chrome → playwright 注册表 → 自动发现 ms-playwright 缓存里已有的 `chromium-*` 构建；遮罩清理幂等化（宿主 React 重渲染会重挂遮罩，须在每次指针交互前重跑）。本机全量 PASS（含 #206 堆叠柱回归、tooltip、流式骨架、按需引擎）。过程中发现两个坑：① `link:` 安装的是 `lib/` 预构建产物而脚本**不自动构建**，本机 lib 曾是 9 月陈旧产物——跑视觉回归前必须先 `pnpm build`；② **双主题 × 560px 窄列夹具矩阵仍未落**（脚本目前只截浅色全页 + 交互态），属阶段一收尾项。
6. **范围澄清**：TemplateDrawer / PlotBlock / ArtifactExport 三个次级样式表的令牌化不在阶段一（它们是插件 chrome，非模型组件面）；TemplateDrawer 本身不加范式模板（2026-10-14 用户裁定，样板改放 GitHub Pages），其令牌化另行择机。

---

## 11. 阶段二试点实施记录（2026-10-14，与阶段一同分支）

试点范围 = B2（divider.label）+ 两个数据最强的范式（主表明细、结论卡）。已落地：

- B2 全链路：spec/schema/别名（title、text→label）/repair 截断/渲染（线+标签+线，全令牌化）/SKILL 字段行「何时不用」/画廊示例/schema 测试。
- **顺带修复存量 bug**：`validate_dsh_ui` 的手写类型清单漏了 `divider` 与 `spacer`，含它们的围栏发前校验一律误报 "unknown type"（渲染管线按契约过滤误报，线上渲染未受影响）——divider.label 的 schema 测试暴露，已在校验 switch 显式放行。
- SKILL.md 新增「编排范式」节（试点两例，各带可渲染示例 + 何时不用），定位写明「验证过的起点不是模板」，与既有「不要照抄」原则衔接；示例围栏受 `tests/genui-skill-examples.spec.ts` 全管线校验。
- 系统提示词加一行触发器（挂在该节既有的组合建议行之后）。
- 待办：合并发布后两周跑 `genui-usage-audit.mjs` 前后对比（divider.label 采用率、范式命中率、junk 告警率、版式熵）；数据支持再铺开其余四个范式。

---

## 12. 阶段二完成 + 阶段三实施记录（2026-10-14，分支 `feat/anthology-complete`）

用户裁定（2026-10-14）：**「倒是全做啊」**——原定「其余范式等审计数据再铺开」的门槛豁免，审计改为合并后单一对比点。本批落地：

- **B1/B3/B4 三字段**：`text.size:"display"`（v11 display 令牌开放给词汇）+ `text.align`（旧 `center:true` 兼容归一化）；`card.eyebrow`（heroLabel 同款 meta 大写引题）；`image.caption`（图下图注，`alt` 保持图上标签行）。全部走 registry（枚举校验/repair 截断/unknown-field 边界）+ SKILL「何时不用」+ 测试。
- **B5 完成**：封面页（hero+display+divider+三卡 bento）/对比页（tone 卡定性+数值表定量）/时间线叙事/测验页（radio 组+submit 本地判卷）四范式入 SKILL，节引言更新为六类场景索引。
- **A5 完成**：e2e-visual 新增三张夹具（gallery-dark / gallery-narrow / gallery-dark-narrow），与 gallery.png 构成 light/dark × wide/narrow 矩阵。
- **C1 完成**：gallerySpec 从 50+ 节点零件目录重排为章节化选集（封面→摘要→数据→图表册→叙事与代码→交互→附录·全部词汇）；数值感知排序表保持页首 Q1 位（e2e sort 断言依赖）；测试断言同步（章节分隔→图表册）。
- **C2 完成**：`createStandaloneHtmlDocument` 本就是纯函数（bundles Map 注入），无需重构；新增 `scripts/build-anthology-page.mts`（node 从 lib/assets 读 bundles）+ 部署 workflow 改为 CI 现场构建——8MB 自包含产物不进 git，线上永远跟随 main。本机 file:// 验证挂载正常。
- **C3 完成**：三张 README showcase 截图从新选集重出（真实宿主+浏览器渲染），中英文说明同步（plot 演示补了参数滑杆，配得上「拖动滑块即时重绘」的文案）。
- **C4 基线存档**（2026-10-14，`genui-usage-audit.mjs --days 30`）：396 会话 / 8,892 助手文本块 / 929 围栏；长回答带围栏率 63.3%；解析失败 7.1%（上限）；版式签名 250 种 / 最高频占 10.7% / 归一化熵 0.83；hero 使用率 0.9%；card 11%；Top 组合 callout+table(73)、plot(45)、callout+keyvalue(41)。**合并发布后 ≥2 周用同命令复测，对比：围栏采纳率、六范式命中率、divider.label 采用率、版式熵变化。**

阶段状态：**三阶段全部完成**（阶段一遗留的 A5 已补齐）。

---
name: buddy-skill
description: AI-Buddy 的官方 SKILL——让 AI 助手通过 API Key 查询、修改、整合用户在 AI-Buddy 中的任务、备忘、阅读收藏、随记。当用户提到"我的任务"、"添加任务"、"整理任务"、"记个备忘"、"把文章存下来"、"我有哪些 to do"、或发来抖音/B站/小红书/公众号等视频/图文分享链接或复制文本时使用。**社媒平台触发词**：抖音、快手、小红书、B站(bilibili)、公众号(微信)、微博、知乎、西瓜、YouTube、TikTok 等 1000+ 平台。**阅读/收藏类关键词**：阅读列表、收趣、收藏、收藏夹、存一下、帮我存、记下来、稍后读、把文章存下来。**保存规则（铁律）**：无论离线还是非离线，每次保存都必须把 标题/链接/头图/摘要 四个字段全部写入【阅读】列表并自动打标签。保存后必须向用户汇报标题/链接/摘要/位置，缺一不可。**非离线模式（默认且优先）**：本地解析元信息后调用 add-reading 写入【阅读】列表，绝不下载文件——这是绝大多数情况的首选，任何时候优先走非离线。**离线下载**：在 add-reading 时传 `--is-offline true`（或 update-reading 修改已有条目），由服务端自动在后台离线下载，AI 永远不下载文件、永远不调用 download-video（该命令已废弃）。本 SKILL 已内置社媒解析能力（1000+ 平台），无需安装任何外部 SKILL。
---

# buddy-skill

AI-Buddy 官方 SKILL——把 AI-Buddy 里的任务、备忘、阅读收藏、随记交给 Claude / GPT 等 LLM，让它真正成为你的工作搭档。

AI-Buddy 的设计哲学是"先 5 秒记下来，再慢慢串成线"——本 SKILL 让你的 AI 搭档也能做同样的事：可以快速追加内容、可以批量整理、可以把零散信息关联起来；任何会改变你数据状态的操作都会先列计划、等你点头后才执行。

> **安全第一**：API Key 存储在本地配置文件，AI 永远不直接接触密钥；删除和整理任务前必须先列计划并取得用户确认。

## 特性

- **多用户隔离**：每个用户独立的 API Key，跨用户访问返回 401
- **API Key 自动管理**：登录 Buddy 网页 → 个人设置 → API Key Tab 一键生成
- **plan-then-confirm 安全流程**：整理任务时必须先列计划、等用户确认后才执行
- **删除前确认**：删除任务必须 `confirm=true`，并通过工具函数向用户展示待删列表
- **本地优先**：API Key 存储在 `~/.buddy-skill/config.json`（`chmod 600`），不泄露给 LLM
- **零依赖**：仅使用 Node.js 内置模块

## 触发词与关键词（何时启用本 SKILL）

只要命中下列任一**触发词**或**关键词**，AI 就应按「解析 → 存【阅读】列表」流程处理（详见下方工作流）。

**社媒平台触发词**（用户发来这些平台的分享链接 / 复制文本）：

| 类别 | 触发词 |
|------|--------|
| 短视频 | 抖音、快手、西瓜视频、TikTok |
| 中长视频 | B站（bilibili / b23.tv）、YouTube、微博视频 |
| 图文 / 社区 | 小红书、知乎 |
| 图文 / 文章 | 公众号（微信）、公众号文章 |

> 实际覆盖 1000+ 平台，凡以「分享链接 / 复制链接」形式出现的短视频、长视频、图文、公众号文章均命中。

**阅读 / 收藏类关键词**（用户想保存内容）：

- 阅读列表、收趣、收藏、收藏夹、存一下、帮我存、记下来、稍后读、把文章存下来

> 命中关键词时，即使没点名具体平台，也应走保存流程（自动解析链接归属平台）。

## 前置条件（Agent 会话启动时校验）

### 1. 获取 API Key

```bash
node index.js test
```

| 返回 | 含义 | Agent 下一步 |
|------|------|--------------|
| `✓ 连接成功` | 配置有效 | 进入正常工作状态 |
| `未找到配置` | 配置文件不存在 | 提示用户去 Buddy 网页生成 Key → 执行 `node index.js init` |
| `401 Unauthorized` | Key 失效 | 同上 |
| 网络错误 | API 不可达 | 告知用户 SKILL 当前不可用 |

### 配置说明

- 配置文件：`~/.buddy-skill/config.json`（权限 600）
- 字段：`api_base`（默认 `https://buddy.bajiaolu.cn/api/v1`）、`api_key`
- Agent 绝不在对话中明文输出用户 Key

## 安全模型

### 1. 密钥安全

- API Key 只以 **SHA-256 哈希** 存储在 Buddy 数据库
- 配置文件 `~/.buddy-skill/config.json` 权限 `600`（仅当前用户可读）
- 页面创建的 Key **明文只显示一次**
- 任何时候都可以在 API Key Tab **撤销** 旧 Key

### 2. 数据隔离

- API Key 在数据库中绑定到具体 `user_id`
- 后端中间件先解析 Key → 拿到 user_id → 注入到所有 SQL 查询
- 跨用户访问（A 用自己的 Key 读 B 的任务）→ 401

### 3. 操作确认（必读）

| 操作 | 确认机制 |
|------|----------|
| **删除任务** | 后端拒绝 `confirm != true` 的 DELETE 请求；CLI 二次输入 `yes` 确认；AI 调用 `formatDeletePlan` 展示 |
| **整理任务** | 后端默认 `dry_run=true`；AI 必须先调用 `planOrganize` 列计划 → 用 `formatOrganizePlan` 展示给用户 → 用户确认后才调用 `executeOrganize` |
| **创建/更新** | 写入是幂等的，但仍建议创建时向用户说明要创建什么 |

### 4. 传输安全

- 所有 API 调用走 HTTPS（生产环境）
- 配置文件不参与任何网络请求
- LLM provider（OpenAI / Anthropic）只看到工具调用结果，看不到 API Key

## 内置社媒解析能力

buddy-skill **已内置**社媒内容解析（抖音 / B 站 / 小红书 / 公众号 / YouTube / TikTok / 微博 / 快手 / 西瓜 / 知乎 等 1000+ 平台），**不依赖任何外部 SKILL**。解析脚本位于 `buddy-skill/scripts/video_extract.cjs`，零依赖（仅用 Node 内置模块）。

> ### ⚠️ 离线下载架构（必读，关乎文件存哪里）
>
> **你的 Agent 运行环境（本机 / 云端 / OpenClaw 等）与 AI-Buddy 服务端通常不在同一台机器。**
> **离线保存的实际处理必须在 AI-Buddy 服务端进行，绝不能在 skill 所在的机器/端口上自行下载。** 因此离线下载必须遵循以下铁律：
>
> 1. **下载永远由服务端自动完成，你永远不需要调用 download-video（它已废弃）。**
>    你只需要在 `add-reading` 或 `update-reading` 时传 `--is-offline true`，服务端会在后台自动触发下载、自动填写 `offline_path`、自动去重避免重复下载。
>    - `node index.js add-reading --url "..." --title "..." --cover-url "..." --summary "..." --is-offline true`
>    - `node index.js update-reading <id> --is-offline true`（给已有条目开启离线）
>    - `node index.js update-reading <id> --is-offline false`（关闭离线，删除服务端文件）
> 2. **不要传 offline_path**：这个字段由服务端下载完成后**自动填写**，你不需要也不应该自己传。
> 3. **Agent 本地不存储、也不应该存储下载文件。** 用户从 Buddy 网页 / App 访问离线内容，不是从你的机器访问。
> 4. **不要安装、不要调用外部 `ExtractVideoSkill`。** buddy-skill 已完全自包含。
>
> **🟢 默认行为（优先，绝大多数情况）**：用户发来社媒分享链接，只说"保存 / 收藏 / 存一下 / 收趣 / 记下来 / 稍后读"等 → **非离线**，仅 `extract-video` 本地解析元信息后调用 `add-reading`（不传 is_offline）写入【阅读】列表，**绝不下载文件**。这是默认路径，任何时候都优先走非离线。尤其是抖音 / B站 / 小红书等**视频**链接，视频文件体积大，默认绝不自动下载，以免占用服务端硬盘。
> **🟡 离线仅在"明确"时**：仅当用户清晰表达"离线 / 下载 / 存到本地 / 没网也能看 / 离线收藏"等要把文件落到磁盘的意图时，才在 `add-reading` 时传 `--is-offline true`（由服务端后台下载，文件存**服务端**）。每一条都单独判断是否明确要离线，不因上一条离线过就自动延续。**即使离线，也必须同时写入 title/url/summary/cover_url 四个字段，保证阅读列表信息完整。**
> **⚪ 唯一例外**：仅当用户**明确说"把文件存到我自己（用户）的电脑/本地"**时，你才可在用户本机下载一份本地副本——且这属于"用户本地副本"，与 AI-Buddy 离线收藏是两回事，不应写入 `is_offline`/离线列表。

### 两种行为模式

| 模式 | CLI 命令 | 说明 |
|------|---------|------|
| **仅解析**（默认） | `node index.js extract-video "<分享文本或URL>"` | 调用内置脚本，返回**原始信息**（标题/封面/各清晰度直链），不下载 |
| **保存到阅读列表**（非离线） | `node index.js add-reading --url "..." --title ...` | 本地解析后调用 API 写入阅读列表，不传 is_offline，不下载 |
| **保存并离线** | `node index.js add-reading ... --is-offline true` | 写入阅读列表时标记离线，服务端**后台自动下载**，无需等待 |
| **开关已有条目离线** | `node index.js update-reading <id> --is-offline true/false` | true→服务端下载；false→删除离线文件；不传→不修改 |

> **设计原则**：buddy-skill 只负责"本地获取原始元信息"；下载过程由 AI-Buddy 服务端统一异步处理，接口立即返回不阻塞对话，用户无需配置保存路径，Agent 也绝不直接下载。

### 解析结果结构（`extract-video` 输出，JSON）

```json
{
  "code": 200,
  "message": "...",
  "data": {
    "vid": "q3Xf96DFFCk",
    "host": "douyin",
    "displayTitle": "标题",
    "videoItemVoList": [
      { "qualityAlias": "封面", "fileType": "image", "baseUrl": "https://...", "size": 12345, "canDirectDownload": false }
    ]
  }
}
```

### 平台规范化（保存到 Buddy 时建议使用的 platform 字段值）

| 平台 | platform 字段 |
|------|---------------|
| 抖音 | `douyin` |
| B 站 / b23.tv | `bilibili` |
| 小红书 | `xiaohongshu` |
| 公众号 | `wechat` |
| YouTube / youtu.be | `youtube` |
| TikTok | `tiktok` |
| 快手 | `kuaishou` |
| 微博 | `weibo` |
| 西瓜视频 | `xigua` |
| 知乎 | `zhihu` |
| Twitter / X | `twitter` |
| Facebook | `facebook` |
| Instagram | `instagram` |
| 普通网页 | `web`（默认） |

## 工作流示例

### 用户说"整理一下我的任务"

1. AI 询问用户想用哪种整理策略
2. AI 调用 `planOrganize(strategy)` 拿到计划
3. AI 把计划用 `formatOrganizePlan(strategy, plan)` 格式化为人类可读文本
4. AI 展示给用户，问"是否执行？"
5. 用户确认后，AI 调用 `executeOrganize(plan)` 执行
6. AI 汇报执行结果

### 用户说"删除这个任务"

1. AI 调用 `getTask(id)` 确认要删除的任务
2. AI 把任务信息展示给用户
3. AI 明确询问"是否确认删除？此操作不可撤销"
4. 用户确认后，AI 调用 `deleteTask({ id })`
5. AI 汇报结果

### 用户发来一个抖音/B站/小红书/公众号等分享链接或复制文本

**核心思路**：buddy-skill 已内置社媒解析，AI 助手直接调 `extract-video` 命令拿到结构化结果，再写入【阅读】列表。

**默认行为：优先非离线——自动存入【阅读】列表（不下载，仅解析元信息）**

**核心原则：任何时候优先走非离线。非离线必须写入全部四个字段（标题/链接/头图/摘要）并自动打标签。即使走了离线路径，也必须同时写入这四个字段保证阅读列表信息完整。**

1. AI 看到分享文本或 URL，先识别平台（抖音/B站/小红书/公众号…）
2. AI 调 buddy-skill 内置解析：
   ```bash
   node index.js extract-video "<分享文本>"
   ```
3. 从返回的 JSON 中提取：
   - `data.host` → 规范化成 `platform`（见上方平台表）
   - `data.displayTitle` → `title`
   - `data.videoItemVoList` 中 `qualityAlias` 含「封面」的项 → `cover_url`（头图）
4. **字段补全（非离线模式的硬性要求）**：当不是离线下载时，以下 4 个字段必须全部写入，缺一不可：
   - **标题** `title`：用 `displayTitle`（无则取分享文本首句）
   - **链接** `url`：用户发来的原始分享链接/URL（从复制分享文本中提取其中的短链/URL；纯文本无 URL 时存原始分享文本）
   - **头图** `cover_url`：解析出的封面直链（解析失败/无封面时允许为空，但应尽量补全）
   - **摘要** `summary`：优先用解析返回的 `summary`（公众号/小红书图文会自动生成 Markdown 摘要）；视频类若无现成摘要，AI 基于「标题 + 平台」生成一句 ≤80 字的中文摘要
5. **自动打标签** `tags`：保存时务必打标签，便于后续检索与自动组网。建议三层组合：
   - 平台标签：`抖音` / `B站` / `小红书` / `公众号` / `YouTube` 等（中文可读名）
   - 内容类型标签：`视频` / `图文` / `文章` / `公众号`
   - 关键词标签：从标题/摘要抽取 1~3 个主题词（如 `AI`、`职场`、`教程`）
   - 示例：`--tags "抖音,视频,AI教程"`
6. AI 调 `createReading(...)` 写入【阅读】列表，传入 `platform`、`title`、`url`、`cover_url`、`summary`、`tags`：
   ```bash
   node index.js add-reading \
     --url "<原始链接>" \
     --title "<标题>" \
     --summary "<摘要>" \
     --platform <platform> \
     --cover "<头图URL>" \
     --tags "<平台,类型,关键词>"
   ```
   如果用户明确要离线，加 `--is-offline true`，服务端会自动在后台下载，不需要等待：
   ```bash
   node index.js add-reading ... --is-offline true
   ```
7. **保存后必须向用户汇报**（至少包含标题、链接、摘要、位置）：
   > ✅ 已保存到【阅读】列表（ID: 123）
   > - 标题：<标题>
   > - 链接：<链接>
   > - 摘要：<摘要前 50 字…>
   > - 标签：抖音 / 视频 / AI教程
   > - 位置：AI-Buddy → 阅读收藏（网页/App 可查看）

**触发离线下载的关键信号（必须"明确"表达，绝不臆测）**

只有当用户**清晰说出**要把文件落到磁盘的意图时，才走 `download-video`（由服务端处理）。典型明确信号：

- 「离线」「离线收藏」「没网也能看」
- 「下载」「下下来」「存到本地 / 存我本地」「帮我保存到服务器」
- 明确说"这条视频 / 内容我要离线保存"

> 🚫 **以下情况一律不算离线、必须走非离线（只存链接 / 元信息，绝不下载）**：
> - 用户只说"保存 / 收藏 / 存一下 / 收趣 / 记下来 / 稍后读 / 把文章存下来" —— 这些 = 非离线
> - 用户发的是**抖音 / B站 / 小红书**等视频链接 —— 视频文件体积大，**默认绝不自动下载**，避免占用服务端硬盘；除非用户明确要离线
> - 上一轮离线过、本轮又发链接 —— 每一条单独判断是否明确要离线，不默认延续
> - "保存下来 / 存一份"等模糊表述 —— 视为非离线；拿不准就主动问用户

> 🚫 **禁止**：在 Agent / skill 所在机器或端口上自行下载、自行解析后写盘。离线保存的"下载动作"只能由 AI-Buddy 服务端执行。

**离线下载流程**（两步，永远这样做，文件存服务端。即使离线，也必须同时写入 title/url/summary/cover_url 四个字段）：

1. AI 先本地解析（同非离线流程第 2 步）：
   ```bash
   node index.js extract-video "<分享文本>"
   ```
2. AI 调 `add-reading` 时带上 `--is-offline true`，**不要传 offline_path、不要再调 download-video**：
   ```bash
   node index.js add-reading --url "..." --title "..." --summary "..." --cover "..." --platform douyin --tags "抖音,视频,..." --is-offline true
   ```
3. 服务端立即返回（后台异步下载），AI 汇报："已保存到阅读列表，服务端正在后台离线下载，完成后可在网页/App 离线查看"
4. 后续如果用户要给**已存在的阅读项**开启/关闭离线：
   ```bash
   node index.js update-reading <id> --is-offline true   # 开启（服务端下载）
   node index.js update-reading <id> --is-offline false  # 关闭（删除离线文件）
   ```

> ⚠️ 切记：
> - **永远不要调用 download-video（它已废弃）**
> - **永远不要自己下载文件**（Agent 所在机器和用户服务端通常不是同一台）
> - **永远不要传 offline_path**（由服务端下载后自动填写）
> - is_offline 是唯一的开关：true=开启离线（服务端下载）；false=关闭离线（删文件）；不传=不修改
>
> **例外说明**：只有当用户明确说"把文件存到我自己的电脑/本地"时，才允许在用户本机下载那份文件作为本地副本；此时不要写入 AI-Buddy 的 `is_offline`/离线列表。除此之外，所有"离线保存"都必须走上面的服务端流程（传 is_offline=true）。

**如果不确定要不要离线下载**，AI 应主动询问用户；即使设置了"自动下载"之类偏好，抖音 / B站 / 小红书等**视频**仍建议逐条确认（文件大、占硬盘），不默默批量落地。

> 下载过程由 AI-Buddy 服务端统一处理，保存路径由服务端配置，用户无需也无法在客户端配置。

### 用户说"看看我最近存的抖音"

1. AI 调 `listReading({ limit: 50 })`
2. 过滤 `platform === 'douyin'` 的条目
3. 按时间倒序展示给用户

## API 参考

所有接口前缀：`{api_base}`，默认 `https://buddy.bajiaolu.cn/api/v1`

所有请求必须在 Header 携带：`X-API-Key: buddy_xxx...`

返回统一格式：
```json
{ "data": ... }
```
或失败：
```json
{ "error": { "code": "INVALID_INPUT", "message": "..." } }
```

| 路径 | 方法 | 说明 |
|------|------|------|
| `/me` | GET | 当前用户信息 |
| `/tasks` | GET | 任务列表（支持 `status`、`priority`、`group_id`、`q`、`limit`、`order`） |
| `/tasks` | POST | 创建任务 |
| `/tasks/:id` | GET | 任务详情 |
| `/tasks/:id` | PATCH | 更新任务字段 |
| `/tasks/:id` | DELETE | 删除任务（**必须** `?confirm=true`） |
| `/tasks/organize` | POST | 批量整理任务（**默认** `dry_run=true`） |
| `/task-groups` | GET | 任务分组列表 |
| `/memos` | GET | 备忘列表（支持 `q`、`memo_type`） |
| `/memos` | POST | 创建备忘 |
| `/memos/:id` | GET | 备忘详情 |
| `/reading` | GET | 阅读收藏列表（支持 `q`、`is_read`、`is_starred`、`platform` 过滤） |
| `/reading` | POST | 添加阅读收藏（支持 `url` / `title` / `summary` / `platform` / `cover_url` / `is_offline`；`is_offline=true` 时服务端后台自动离线下载，`offline_path` 由服务端自动填写） |
| `/reading/:id` | GET | 阅读详情 |
| `/reading/:id` | PATCH | 更新阅读项（支持 `title`/`summary`/`tags`/`is_read`/`is_starred`/`is_offline` 等；`is_offline=true` 触发后台下载，`is_offline=false` 删除离线文件，不传 `is_offline` 则不修改离线状态） |
| `/quick-notes` | GET | 随记列表 |
| `/quick-notes` | POST | 创建随记 |
| `/quick-notes/:id` | GET | 随记详情 |

### 任务查询参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `status` | string | `todo` / `in_progress` / `done` / `archived` |
| `priority` | string | `high` / `medium` / `low` |
| `group_id` | number | 任务分组 ID |
| `q` | string | 标题模糊搜索 |
| `limit` | number | 默认 50，最大 500 |
| `order` | string | 形如 `field:asc` / `field:desc`，默认 `updated_at:desc` |

### 整理任务接口

```http
POST /api/v1/tasks/organize
Content-Type: application/json
X-API-Key: buddy_xxx

{
  "dry_run": true,
  "plan": [
    { "action": "update", "id": 42, "changes": { "status": "archived" }, "reason": "..." }
  ]
}
```

- `dry_run=true`（默认）：只返回计划，不执行
- `dry_run=false`：实际执行（需要 AI 助手先向用户确认）

## 文件结构

```
buddy-skill/
├── SKILL.md                # 本文件（SKILL 入口描述）
├── package.json
├── index.js                 # CLI 入口
├── lib/
│   ├── client.js            # HTTP 客户端（封装所有 API 调用）
│   ├── config.js            # 配置文件管理（~/.buddy-skill/config.json）
│   └── prompts.js           # AI Prompt 模板
├── tools/
│   ├── organize.js          # 整理任务（含 plan-then-confirm）
│   └── confirm.js           # 确认机制（格式化展示给用户）
└── examples/
    ├── README.md
    ├── list-today-tasks.js  # 列出 7 天内到期的任务
    ├── organize-tasks.js    # 整理任务（plan-confirm-execute 流程）
    └── add-memo.js          # 快速保存备忘
```

## CLI 用法

```
buddy-skill — AI-Buddy 官方 SKILL CLI

用法：
  node index.js init                       交互式初始化配置
  node index.js test                       测试连接（Agent 会话启动时应首先调用）
  node index.js whoami                     查看当前用户
  node index.js list-task-groups           列出任务分组
  node index.js list-tasks [options]       列出任务
  node index.js get-task <id>              查看任务详情
  node index.js add-task --title "..."     创建任务
  node index.js update-task <id> --field value
  node index.js delete-task <id>           删除任务（需二次确认）
  node index.js organize-tasks <strategy>  整理任务（先列计划）
  node index.js list-memos                 列出备忘
  node index.js add-memo --content "..."   创建备忘
  node index.js list-reading               列出阅读收藏
  node index.js add-reading --url "..."    添加阅读收藏（支持 --is-offline true 标记离线，服务端自动下载）
  node index.js update-reading <id>        更新阅读项（--is-offline true/false 开关离线）
  node index.js extract-video "<分享文本>"   解析社媒内容（内置，返回原始信息，不下载）
  node index.js self-update                手动触发版本检查与更新
  node index.js where-is-key               显示配置文件位置
  node index.js doctor                      环境诊断（检查 Node/配置/内置脚本/API）
  node index.js --version                   显示版本号

整理策略 strategy 取值：
  archive-completed      归档 30 天前已完成的任务
  set-priority-by-due    根据截止日期自动设置优先级
  clean-duplicates       归档重复任务
```

## 故障排查

| 错误 | 原因 | 解决 |
|------|------|------|
| `未找到配置，请先运行: node index.js init` | 配置文件不存在 | 运行 `node index.js init` |
| `401 Unauthorized` | API Key 无效或过期 | 重新生成 Key 并写入配置 |
| `403 confirm=true required` | 删除任务没传 confirm | 这是设计：必须先向用户确认 |
| `403 dry_run=true required` | 整理任务没指定 dry_run | 这是设计：必须先预览 |
| `ECONNREFUSED` | API Base URL 错误 | 改用 `https://buddy.bajiaolu.cn/api/v1` |
| `Node.js version < 18` | 没有原生 fetch | 升级 Node.js |

### 调试

```bash
# 显示配置文件位置
node index.js where-is-key

# 环境诊断（检查 Node/配置/内置解析脚本/API 连接）
node index.js doctor

# 测试连接
DEBUG=1 node index.js test
```

## 许可证

MIT

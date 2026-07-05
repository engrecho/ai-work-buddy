---
name: buddy-skill
description: AI-Buddy 的官方 SKILL——AI-Buddy 是一个为碎片化内容而生的轻量工作空间，本 SKILL 让 AI 助手通过 API Key 安全地查询、修改、整合用户在 AI-Buddy 中的任务、备忘、阅读收藏、随记。当用户提到"我的任务"、"添加任务"、"整理任务"、"记个备忘"、"把今天读到的文章存下来"、"我有哪些 to do"时使用此 skill。删除和整理任务前必须先列计划并取得用户确认。社媒内容（抖音/B站/小红书/公众号等）解析与下载需配合 ExtractVideoSkill 一起使用。
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

## 快速开始

### 1. 获取 API Key

1. 登录 Buddy 网页版（<https://buddy.bajiaolu.cn>）
2. 右上角头像 → **个人设置**
3. 切到 **API Key** Tab
4. 输入 Key 名称（如 `Claude SKILL`）→ **创建**
5. **立即复制明文 Key**（关掉弹窗就再也看不到了！）

Key 形如：`buddy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

> **如果找不到 Key 了**：在 API Key Tab 看不到明文（仅显示前缀），可以**撤销**旧 Key 再**创建**新的。运行 `node index.js where-is-key` 可随时查看配置文件位置。

### 2. 安装与初始化

```bash
# 把整个 buddy-skill 目录复制到本地任意位置
cp -r buddy-skill ~/tools/buddy-skill
cd ~/tools/buddy-skill

# 交互式初始化（输入 API Base URL 和 API Key）
node index.js init
```

> **找不到配置怎么办**：CLI 启动时如果检测不到 `~/.buddy-skill/config.json`，会提示「未找到配置，请先运行: node index.js init」。运行 `node index.js where-is-key` 可以随时查看配置文件路径。

### 3. 测试连接

```bash
node index.js test
# ✓ 连接成功
# { "id": 1, "username": "yourname", "nickname": "你的昵称" }
```

### 4. 开始使用

```bash
# 列出未完成任务
node index.js list-tasks --status todo

# 创建任务
node index.js add-task --title "完成 Q3 报告" --priority high --due 2026-07-10

# 整理任务（先列计划、用户确认、再执行）
node index.js organize-tasks archive-completed
```

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

## 依赖与子技能

buddy-skill 只负责访问 AI-Buddy 的数据。**社媒内容解析（抖音 / B 站 / 小红书 / 公众号 / YouTube / TikTok / 微博 / 快手 / 西瓜 / 知乎 等 1000+ 平台）依赖独立的 ExtractVideoSkill**，由 ExtractVideoSkill 提供底层解析和下载能力。

### ExtractVideoSkill 仓库

- 仓库：<https://github.com/engrecho/ExtractVideoSkill.git>
- 安装位置：`~/.workbuddy/skills/greenvideo-extract/`（软链或克隆均可）
- 提供：
  - `scripts/greenvideo_extract.cjs --json "<分享文本>"` — 解析（返回平台 / 标题 / 封面 / 资源列表）
  - `scripts/download_videos.cjs "<分享文本>"` — 解析 + 下载到本地

### 安装与检测

```bash
# 方式 1：直接克隆
git clone https://github.com/engrecho/ExtractVideoSkill.git ~/.workbuddy/skills/greenvideo-extract

# 方式 2：放在本地任意目录并软链
git clone https://github.com/engrecho/ExtractVideoSkill.git ~/tools/ExtractVideoSkill
ln -s ~/tools/ExtractVideoSkill ~/.workbuddy/skills/greenvideo-extract
```

- AI 助手在调用社媒能力前，必须先 `ls ~/.workbuddy/skills/greenvideo-extract/scripts/`
- 没装 → 提示用户「需要安装 ExtractVideoSkill（抖音/B站等解析依赖），是否克隆到 `~/.workbuddy/skills/greenvideo-extract`？」并执行克隆
- 已装但脚本缺失 → 提示「ExtractVideoSkill 目录已存在但缺少 scripts/，请检查仓库完整性或重新克隆」
- 脚本运行失败 → 把 stderr 末尾 10-20 行原样展示给用户，不要编造成功

### 调用方式（spawn Node 进程）

```bash
# 解析
node ~/.workbuddy/skills/greenvideo-extract/scripts/greenvideo_extract.cjs --json "<分享文本或URL>"

# 下载到本地（默认输出 ./gv_downloads/）
node ~/.workbuddy/skills/greenvideo-extract/scripts/download_videos.cjs "<分享文本或URL>"
# 也支持环境变量：
#   GV_OUTPUT=<输出根目录>   默认 ./gv_downloads
#   GV_NODE=<node 路径>      默认 /Users/jaylon/.workbuddy/binaries/node/versions/22.22.2/bin/node
```

### 解析结果结构（`--json` 模式，stdout 用 `__GV_JSON_BEGIN__` / `__GV_JSON_END__` marker 分隔）

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

**核心思路**：buddy-skill 不内置社媒解析，AI 助手先调 ExtractVideoSkill 拿到结构化结果，再写入阅读列表。

**默认行为：自动存入阅读列表**（**不下载**，只解析元信息）

1. AI 看到分享文本或 URL
2. AI 调 ExtractVideoSkill 解析：
   ```bash
   node ~/.workbuddy/skills/greenvideo-extract/scripts/greenvideo_extract.cjs --json "<分享文本>"
   ```
3. 从返回的 `__GV_JSON_BEGIN__/END__` 之间提取 JSON：
   - `data.vid` → vid
   - `data.host` → 规范化成 platform（见上方平台表）
   - `data.displayTitle` → title
   - `data.videoItemVoList` 里 `qualityAlias` 含「封面」的项 → `cover_url`
4. AI 调 `createReading(...)` 写入阅读列表，传入 `platform`、`cover_url`
5. AI 向用户汇报："已加入阅读列表（{平台} - {标题}）"

**如果用户明确说"下载"、"存到本地"、"离线"**，则调 ExtractVideoSkill 的 download 脚本：

1. AI 执行：
   ```bash
   node ~/.workbuddy/skills/greenvideo-extract/scripts/download_videos.cjs "<分享文本>"
   ```
2. 从 stdout 解析 `[OK]   <host>/<vid>  -> <dir>` 那一行拿 `offline_path`
3. AI 调 `createReading(...)` 时把 `is_offline=true`、`offline_path=...` 带上
4. AI 汇报："已下载到 {offline_path}"

**如果不确定要不要下载**，AI 应主动询问用户；只有在用户说"自动下载所有"之类的偏好时才跳过询问。

**如果没有安装 ExtractVideoSkill**，AI 应主动询问用户是否从 <https://github.com/engrecho/ExtractVideoSkill.git> 克隆到 `~/.workbuddy/skills/greenvideo-extract/`；用户同意后执行 `git clone`，再继续上面流程。

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
| `/reading` | POST | 添加阅读收藏（支持 `url` / `title` / `summary` / `platform` / `cover_url` / `is_offline` / `offline_path`） |
| `/reading/:id` | GET | 阅读详情 |
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
  node index.js init                      交互式初始化配置
  node index.js test                      测试连接
  node index.js whoami                    查看当前用户
  node index.js list-task-groups          列出任务分组
  node index.js list-tasks [options]      列出任务
  node index.js get-task <id>             查看任务详情
  node index.js add-task --title "..."    创建任务
  node index.js update-task <id> --field value
  node index.js delete-task <id>          删除任务（需二次确认）
  node index.js organize-tasks <strategy> 整理任务（先列计划）
  node index.js list-memos                列出备忘
  node index.js add-memo --content "..."  创建备忘
  node index.js list-reading              列出阅读收藏
  node index.js add-reading --url "..."   添加阅读收藏
  node index.js where-is-key              显示配置文件位置

整理策略 strategy 取值：
  archive-completed      归档 30 天前已完成的任务
  set-priority-by-due    根据截止日期自动设置优先级
  clean-duplicates       归档重复任务

社媒内容（抖音/B站/小红书/公众号等）解析与下载需先安装 ExtractVideoSkill：
  git clone https://github.com/engrecho/ExtractVideoSkill.git ~/.workbuddy/skills/greenvideo-extract
  node ~/.workbuddy/skills/greenvideo-extract/scripts/greenvideo_extract.cjs --json "<分享文本或URL>"
  node ~/.workbuddy/skills/greenvideo-extract/scripts/download_videos.cjs "<分享文本或URL>"
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

# 测试连接
DEBUG=1 node index.js test
```

## 许可证

MIT

# buddy-skill

> ⚠️ **SKILL 入口文件已迁移到 `SKILL.md`**。TRAE / Claude / GPT 在加载本 SKILL 时读取 `SKILL.md`。
> 本文件仅作为开发者向的辅助文档，方便人类阅读。

---

AI-Buddy 的官方 SKILL——把 AI-Buddy 里的任务、备忘、阅读收藏、随记交给 AI 助手（Claude / GPT / 其他 LLM），让它真正成为你的工作搭档。

AI-Buddy 的设计哲学是"先 5 秒记下来，再慢慢串成线"——本 SKILL 让你的 AI 搭档也能做同样的事：可以快速追加内容、可以批量整理、可以把零散信息关联起来；任何会改变你数据状态的操作都会先列计划、等你点头后才执行。

> **安全第一**：API Key 存储在本地配置文件，AI 永远不直接接触密钥；删除和整理任务前必须先列计划并取得用户确认。

## 特性

- **多用户隔离**：每个用户独立的 API Key，跨用户访问返回 401
- **API Key 自动管理**：登录 Buddy 网页 → 个人设置 → API Key Tab 一键生成
- **安全确认机制**：删除任务、整理任务前必须列计划、用户确认
- **本地优先**：API Key 存储在 `~/.buddy-skill/config.json`（`chmod 600`），不泄露给 LLM
- **零依赖**：仅使用 Node.js 内置模块，无需 `npm install`
- **可执行 CLI**：`init` / `test` / `list-tasks` / `add-task` / `organize-tasks` 等命令开箱即用

## 目录

- [快速开始](#快速开始)
- [如何找到 API Key](#如何找到-api-key)
- [CLI 用法](#cli-用法)
- [在 AI 助手中使用](#在-ai-助手中使用)
- [API 参考](#api-参考)
- [文件结构](#文件结构)
- [安全模型](#安全模型)
- [故障排查](#故障排查)

## 快速开始

### 前置条件

- Node.js 18+（用到了原生 `fetch`）
- 一个 Buddy 账号（<https://buddy.bajiaolu.cn> 注册即可）

### 1. 获取 API Key

1. 登录 Buddy 网页版
2. 右上角头像 → **个人设置**
3. 切到 **API Key** Tab
4. 输入 Key 名称（如 `Claude SKILL`）→ **创建**
5. **立即复制明文 Key**（关掉弹窗就再也看不到了！）

Key 形如：`buddy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 2. 安装 SKILL

```bash
# 把整个 buddy-skill 目录复制到本地任意位置
cp -r buddy-skill ~/tools/buddy-skill
cd ~/tools/buddy-skill
```

无需 `npm install`，全部使用 Node.js 内置模块。

### 3. 初始化配置

```bash
# 方式 A：交互式
node index.js init
# 按提示输入 API Base URL 和 API Key

# 方式 B：手动创建
mkdir -p ~/.buddy-skill
cat > ~/.buddy-skill/config.json << EOF
{
  "api_base": "https://buddy.bajiaolu.cn/api/v1",
  "api_key": "buddy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
}
EOF
chmod 600 ~/.buddy-skill/config.json
```

### 4. 测试连接

```bash
node index.js test
# ✓ 连接成功
# {
#   "id": 1,
#   "username": "yourname",
#   "nickname": "你的昵称"
# }
```

### 5. 开始使用

```bash
# 列出所有未完成任务
node index.js list-tasks --status todo

# 创建一个任务
node index.js add-task --title "完成 Q3 报告" --priority high --due 2026-07-10

# 整理任务（先列计划、用户确认、再执行）
node index.js organize-tasks archive-completed
```

## 如何找到 API Key

| 场景 | 路径 |
|------|------|
| **网页端创建 Key** | 登录 → 右上角头像 → 个人设置 → API Key Tab → 创建 |
| **配置文件位置** | `~/.buddy-skill/config.json`（Linux/macOS）<br>`%USERPROFILE%\.buddy-skill\config.json`（Windows） |
| **找不到 Key 了** | 网页端 API Key Tab 看不到明文（仅显示前缀），但可以**撤销**旧 Key 再**创建**新的 |
| **CLI 提示配置位置** | `node index.js where-is-key` |

> **安全提醒**：Buddy 永远不会以明文形式重新显示已创建的 Key。
> 如果 Key 泄露或丢失，请立即在网页端**撤销**（API Key Tab → 撤销），
> 然后创建新 Key。

## CLI 用法

```
buddy-skill — AI-Buddy 官方 SKILL CLI

用法：
  node index.js init                      交互式初始化配置
  node index.js test                      测试连接
  node index.js whoami                    查看当前用户
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
```

### 完整示例

```bash
# 列出今天到期的任务
node index.js list-tasks --status todo --limit 20

# 创建带描述、优先级、截止日期的任务
node index.js add-task \
  --title "完成 Q3 报告" \
  --description "重点写增长数据" \
  --priority high \
  --due 2026-07-10

# 更新任务状态为已完成
node index.js update-task 42 --status done --progress 100

# 删除任务（会先展示任务信息、要求输入 yes）
node index.js delete-task 42

# 整理：归档 30 天前已完成的任务
node index.js organize-tasks archive-completed

# 整理：根据截止日期调整优先级
node index.js organize-tasks set-priority-by-due

# 备忘
node index.js add-memo --content "AI 不会替代人，但用 AI 的人会替代不用 AI 的人" --tags 思考,AI
node index.js list-memos --q "AI"

# 阅读收藏
node index.js add-reading --url "https://..." --title "好文" --category 技术
node index.js list-reading --starred
```

## 在 AI 助手中使用

把 `buddy-skill/` 整个目录作为 SKILL 加载到你的 AI 助手中。AI 会：

1. 读取 `SKILL.md` 了解自己的身份、能力和安全边界
2. 通过 `lib/client.js` 与 Buddy API 通信
3. 调用 `tools/*.js` 中的工具函数
4. 在执行破坏性操作前调用 `tools/confirm.js` 中的格式化函数

### Claude / GPT 加载示例

把 `lib/prompts.js` 的内容作为 system prompt 注入，把 `tools/*.js` 注册为可调用的工具函数。

### 安全准则

- AI **永远不直接读取** `~/.buddy-skill/config.json` 中的 API Key
- AI **必须** 在删除任务前向用户确认
- AI **必须** 在整理任务前调用 `planOrganize`、展示计划、得到确认后才执行
- 所有写入操作建议先 `dry_run=true` 预览

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
| `/reading` | GET | 阅读收藏列表（支持 `q`、`is_read`、`is_starred`） |
| `/reading` | POST | 添加阅读收藏 |
| `/quick-notes` | GET | 随记列表 |
| `/quick-notes` | POST | 创建随记 |

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
├── SKILL.md                # ★ SKILL 入口描述文件（AI 加载时读取）
├── README.md               # 开发者向辅助文档
├── package.json
├── index.js                 # CLI 入口
├── lib/
│   ├── client.js            # HTTP 客户端（封装所有 API 调用）
│   ├── config.js            # 配置文件管理（~/.buddy-skill/config.json）
│   └── prompts.js           # AI Prompt 模板 + 工具定义
├── tools/
│   ├── tasks.js             # 任务工具（list/get/add/update/delete）
│   ├── memos.js             # 备忘工具
│   ├── reading.js           # 阅读收藏工具
│   ├── organize.js          # 整理任务（含 plan-then-confirm）
│   └── confirm.js           # 确认机制（格式化展示给用户）
└── examples/
    ├── README.md
    ├── list-today-tasks.js  # 列出 7 天内到期的任务
    ├── organize-tasks.js    # 整理任务（plan-confirm-execute 流程）
    └── add-memo.js          # 快速保存备忘
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
- 跨用户访问（如 A 用自己的 Key 读 B 的任务）→ 401

### 3. 操作确认

- **删除任务**：后端拒绝 `confirm != true` 的 DELETE 请求
- **整理任务**：后端默认 `dry_run=true`，返回计划但不执行
- **AI 助手**：在调用 `delete_task` / `execute_organize` 前必须先调用对应的 `format*Plan` 函数把计划展示给用户

### 4. 传输安全

- 所有 API 调用走 HTTPS（生产环境）
- 配置文件不参与任何网络请求
- LLM provider（OpenAI / Anthropic）只看到工具调用结果，看不到 API Key

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

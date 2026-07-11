# buddy-skill API 接口使用说明

> 本文档面向使用 buddy-skill CLI / API 的开发者，详细描述每个接口的请求格式、参数与返回值。

---

## 通用说明

### Base URL

默认：`https://buddy.bajiaolu.cn/api/v1`

### 认证方式

所有 `/api/v1/*` 接口必须在请求头中携带：

```
X-API-Key: buddy_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 统一返回格式

成功：
```json
{ "data": <具体数据>, "error": null }
```

失败：
```json": { "data": null, "error": { "code": "ERROR_CODE", "message": "描述" } }
```

---

## 用户

### GET /api/v1/me

获取当前 API Key 对应的用户信息。

**请求**：无参数

**返回**：
```json
{ "data": { "id": 1, "username": "yourname", "nickname": "昵称" }, "error": null }
```

**CLI 对应**：`node index.js whoami` / `node index.js test`

---

## 任务（Tasks）

### GET /api/v1/tasks

获取任务列表。

**Query 参数**：

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| `status` | string | 状态过滤：`todo` / `in_progress` / `done` / `archived` | `?status=todo` |
| `priority` | string | 优先级过滤：`high` / `medium` / `low` | `?priority=high` |
| `group_id` | number | 分组 ID 过滤 | `?group_id=5` |
| `q` | string | 标题模糊搜索 | `?q=报告` |
| `limit` | number | 返回数量，默认 50，最大 500 | `?limit=20` |
| `order` | string | 排序，格式 `field:asc` 或 `field:desc` | `?order=updated_at:desc` |

**CLI 对应**：`node index.js list-tasks --status todo --priority high --limit 20`

---

### GET /api/v1/tasks/:id

获取单个任务详情。

**CLI 对应**：`node index.js get-task <id>`

---

### POST /api/v1/tasks

创建任务。

**请求体**：
```json
{
  "title": "任务标题",          // 必填
  "description": "详细描述",    // 可选
  "priority": "medium",         // 可选，默认 medium（high / medium / low）
  "status": "todo",             // 可选，默认 todo
  "group_id": 5,                // 可选，关联分组 ID
  "due_date": "2026-07-15",     // 可选，截止日期（YYYY-MM-DD）
  "plan_date": "2026-07-10"     // 可选，计划日期
}
```

**CLI 对应**：`node index.js add-task --title "标题" --priority high --due 2026-07-15`

---

### PATCH /api/v1/tasks/:id

更新任务字段。

**请求体**（所有字段均可选，按需传递）：
```json
{
  "title": "新标题",
  "status": "done",
  "priority": "high",
  "description": "更新描述",
  "due_date": "2026-07-20",
  "progress": 50,               // 进度 0-100
  "group_id": 3
}
```

**CLI 对应**：`node index.js update-task <id> --status done`

---

### DELETE /api/v1/tasks/:id

删除任务（**必须** `confirm=true`）。

**Query 参数**：`?confirm=true`

**返回**：
```json
{ "data": { "success": true }, "error": null }
```

**错误码**：

| 错误码 | 说明 |
|--------|------|
| `CONFIRMATION_REQUIRED` | 缺少 `confirm=true` 参数 |

**CLI 对应**：`node index.js delete-task <id>`（CLI 内部有二次确认交互）

---

### POST /api/v1/tasks/organize

批量整理任务。

**请求体**：
```json
{
  "dry_run": true,              // 默认 true：仅返回计划不执行；false：实际执行
  "plan": [
    {
      "action": "update",       // create / update / delete
      "id": 42,
      "changes": { "status": "archived" },
      "reason": "已完成超过 30 天"
    }
  ]
}
```

**dry_run=true 返回**：
```json
{
  "data": {
    "dry_run": true,
    "plan": [ "...操作列表..." ],
    "affected_tasks": [42, ...],
    "summary": ["更新任务 42: status=archived", "..."]
  },
  "error": null
}
```

**CLI 对应**：`node index.js organize-tasks archive-completed`

**支持策略**：

| strategy | 说明 |
|----------|------|
| `archive-completed` | 归档 30 天前已完成的任务 |
| `set-priority-by-due` | 根据截止日期自动设置优先级 |
| `clean-duplicates` | 归档标题重复的任务 |

---

## 任务分组（Task Groups）

### GET /api/v1/task-groups

获取当前用户的所有任务分组。

**请求**：无参数

**返回**：
```json
{
  "data": [
    { "id": 1, "name": "工作", "color": "#3b82f6", "sort_order": 0, "keywords": ["会议", "报告"] }
  ],
  "error": null
}
```

**CLI 对应**：`node index.js list-task-groups`

---

## 备忘（Memos）

### GET /api/v1/memos

获取备忘列表。

**Query 参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `q` | string | 标题/内容模糊搜索 |
| `memo_type` | string | 备忘类型过滤 |
| `limit` | number | 返回数量（默认 20） |

**CLI 对应**：`node index.js list-memos --limit 20`

---

### GET /api/v1/memos/:id

获取单条备忘详情。

**CLI 对应**：无直接 CLI 命令，可通过 `getMemo(id)` 在代码中调用

---

### POST /api/v1/memos

创建备忘。

**请求体**：
```json
{
  "content": "备忘内容（支持 HTML）",     // 必填
  "title": "备忘标题",                    // 可选
  "memo_type": "note",                    // 可选
  "tags": ["标签1", "标签2"]              // 可选，字符串数组
}
```

**CLI 对应**：`node index.js add-memo --content "内容" --title "标题" --tags "工作,重要"`

---

## 阅读收藏（Reading）

### GET /api/v1/reading

获取阅读收藏列表。

**Query 参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `q` | string | 标题模糊搜索 |
| `is_read` | boolean | 是否已读：`true` / `false` |
| `is_starred` | boolean | 是否加星：`true` / `false` |
| `platform` | string | 平台过滤（如 `douyin`、`bilibili`） |
| `limit` | number | 返回数量（默认 20） |
| `order` | string | 排序 |

**CLI 对应**：`node index.js list-reading --starred --limit 20`

---

### GET /api/v1/reading/:id

获取单条阅读收藏详情。

**CLI 对应**：无直接 CLI 命令，可通过 `getReading(id)` 调用

---

### POST /api/v1/reading

添加阅读收藏。

**请求体**：
```json
{
  "url": "https://...",              // 必填
  "title": "标题",                    // 可选
  "summary": "摘要",                  // 可选
  "platform": "douyin",              // 可选（douyin/bilibili/xiaohongshu/wechat/youtube/tiktok/weibo/kuaishou/xigua/zhihu/web）
  "cover_url": "https://...",        // 可选，封面图 URL
  "category": "稍后读",               // 可选
  "tags": ["抖音", "视频", "AI"],    // 可选
  "is_offline": false,               // 可选：true=服务端后台离线下载
  "parsed_data": { ... },            // 可选：传入解析结果，跳过服务端解析（避免 IP 限线）
  "auto_parse": true,                // 可选：服务端自动解析补全字段
  "async_parse": true                // 可选：异步解析（立即返回，后台补全）
}
```

**is_offline 行为**：

| 值 | 行为 |
|----|------|
| `true` | 服务端后台自动下载视频/文件，完成后自动更新 `offline_path` |
| `false` / 不传 | 仅保存元信息，不下载 |
| `false` + 传了 `offline_path` | `offline_path` 由服务端自动填写，不要自己传 |

**CLI 对应**：

```bash
# 非离线（默认）
node index.js add-reading \
  --url "https://..." \
  --title "标题" \
  --summary "摘要" \
  --platform douyin \
  --cover "https://..." \
  --tags "抖音,视频,AI"

# 离线下载
node index.js add-reading ... --is-offline true
```

---

### PATCH /api/v1/reading/:id

更新阅读项。支持 `is_offline` 三态：

| is_offline 值 | 行为 |
|---------------|------|
| `true` | 开启离线 → 服务端后台下载 |
| `false` | 关闭离线 → 删除服务端离线文件 |
| 不传 | 不修改离线状态 |

**请求体**（所有字段可选）：
```json
{
  "title": "新标题",
  "summary": "新摘要",
  "cover_url": "https://...",
  "platform": "douyin",
  "category": "新分类",
  "is_read": true,
  "is_starred": true,
  "is_offline": true,
  "tags": ["新标签"]
}
```

**CLI 对应**：`node index.js update-reading <id> --is-offline true`

---

## 随记（Quick Notes）

### GET /api/v1/quick-notes

获取随记列表。

**Query 参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `limit` | number | 返回数量 |

---

### GET /api/v1/quick-notes/:id

获取单条随记详情。

---

### POST /api/v1/quick-notes

创建随记。

**请求体**：
```json
{
  "content": "随记内容",           // 必填
  "tags": ["标签1", "标签2"]        // 可选
}
```

---

## 加密备忘追加（高级）

### POST /api/v1/memos/append-encrypted

客户端 AES-256-CBC 加密 → 服务端解密 → 追加到指定标题的备忘。

**用途**：油猴脚本 / 外部工具在不暴露明文的情况下追加备忘。

**请求体**：
```json
{
  "encrypted": "base64(IV + ciphertext)",  // 必填
  "target_title": "未准入加盟商"            // 可选，默认 "未准入加盟商"
}
```

**加密方式**：AES-256-CBC，Key = SHA256(`MEMO_ENCRYPTION_KEY` 环境变量)，IV 为随机 16 字节，密文前 16 字节为 IV。

---

## 解析接口（服务端解析）

### POST /api/v1/extract

解析社媒分享链接/文本（服务端解析，不需要 API Key 认证的替代方案参见网页端 `/api/extract`）。

**请求体**：
```json
{ "input": "分享文本或URL" }
```

**返回**：
```json
{
  "data": {
    "code": 200,
    "message": "解析成功",
    "data": {
      "vid": "xxx",
      "host": "douyin",
      "displayTitle": "标题",
      "videoItemVoList": [
        { "qualityAlias": "封面", "fileType": "image", "baseUrl": "https://..." },
        { "qualityAlias": "标清", "fileType": "video", "baseUrl": "https://..." }
      ]
    }
  },
  "error": null
}
```

**normalize 字段**（platform 字段建议值）：

| 平台 | platform 值 |
|------|-------------|
| 抖音 | `douyin` |
| B站 / b23.tv | `bilibili` |
| 小红书 | `xiaohongshu` |
| 公众号 | `wechat` |
| YouTube | `youtube` |
| TikTok | `tiktok` |
| 快手 | `kuaishou` |
| 微博 | `weibo` |
| 西瓜视频 | `xigua` |
| 知乎 | `zhihu` |
| 其他 | `web` / `other` |

---

## 错误码参考

| HTTP 状态 | error.code | 含义 |
|-----------|------------|------|
| 401 | - | X-API-Key 缺失或无效 |
| 403 | `CONFIRMATION_REQUIRED` | 删除操作缺少 `confirm=true` |
| 403 | `DRY_RUN_REQUIRED` | 整理操作未指定 `dry_run` |
| 400 | `INVALID_INPUT` | 参数校验失败 |
| 500 | - | 服务端内部错误 |

---

## 环境变量（服务端）

| 变量名 | 说明 |
|--------|------|
| `GV_OUTPUT` | 离线下载文件保存根目录（默认 `/www/wwwroot/buddy.bajiaolu.cn/data/offline`） |
| `APIKEY_ENCRYPTION_KEY` | API Key 可逆加密密钥 |
| `MEMO_ENCRYPTION_KEY` | 加密备忘解密的密钥 |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` | 数据库连接 |
| `JWT_SECRET` | JWT 签名密钥 |
| `PORT` | 服务端口（默认 3000） |

---

## SDK / CLI 快速索引

```
node index.js init                         # 初始化配置
node index.js test                         # 测试连接
node index.js whoami                       # 当前用户
node index.js list-task-groups             # 任务分组列表
node index.js list-tasks [options]         # 任务列表
node index.js get-task <id>                # 任务详情
node index.js add-task --title "..."       # 创建任务
node index.js update-task <id> --field     # 更新任务
node index.js delete-task <id>             # 删除任务
node index.js organize-tasks <strategy>    # 整理任务
node index.js list-memos                   # 备忘列表
node index.js add-memo --content "..."     # 创建备忘
node index.js list-reading                 # 阅读收藏列表
node index.js add-reading --url "..."      # 添加阅读收藏
node index.js update-reading <id>          # 更新阅读项
node index.js extract-video "<分享文本>"    # 解析社媒（仅元信息）
node index.js where-is-key                 # 显示配置文件位置
node index.js doctor                       # 环境诊断
node index.js --version                    # 版本号
```

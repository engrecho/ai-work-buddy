# WorkBuddy 数据库结构说明

> 最后更新：2026-06-30
> 数据库地址：`https://dbc23lmh865kibbhuu.database.nocode.cn`
> 接口协议：Supabase PostgREST（兼容 PostgreSQL）

---

## 连接信息

| 配置项 | 值 |
|--------|-----|
| 数据库地址 | `https://dbc23lmh865kibbhuu.database.nocode.cn` |
| REST API 基础路径 | `https://dbc23lmh865kibbhuu.database.nocode.cn/rest/v1` |
| Anon Key | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzQ2OTc5MjAwLCJleHAiOjE5MDQ3NDU2MDB9.UKr75xTBFk4W61wrVVaUphEDFqBUdEROoEL7GfFrjJE` |
| 认证方式 | Header: `apikey: <key>` + `Authorization: Bearer <key>` |

---

## 数据表总览

| 表名 | 用途 | 主键类型 |
|------|------|----------|
| `tasks` | 核心任务表 | bigint（手动大整数） |
| `task_groups` | 任务分组/看板泳道 | bigint（手动大整数） |
| `task_members` | 人员信息 | bigint（自增） |
| `task_tags` | 任务标签 | bigint（手动大整数） |
| `task_comments` | 任务评论与动态 | bigint（自增） |
| `memos` | 备忘录 | bigint（手动大整数）|
| `task_notes` | 梳理文档 | bigint（手动大整数） |
| `reading_items` | 阅读收藏 | bigint（手动大整数） |

---

## 1. tasks（核心任务表）

### 字段定义

| 字段名 | 类型 | 可为空 | 默认值 | 说明 |
|--------|------|--------|--------|------|
| `id` | bigint | 否 | — | 主键，手动指定（建议用时间戳大整数） |
| `title` | text | 否 | — | 任务标题 |
| `description` | text | 是 | null | 任务描述，富文本 HTML 格式 |
| `status` | text | 否 | `'todo'` | 状态：`todo` / `in_progress` / `done` / `cancelled` |
| `priority` | text | 是 | `'medium'` | 优先级：`low` / `medium` / `high` / `urgent` |
| `parent_id` | bigint | 是 | null | 父任务 ID（关联本表 id），用于子任务层级 |
| `is_project` | boolean | 是 | false | 是否为项目节点（顶层容器） |
| `progress` | integer | 是 | 0 | 进度 0–100（百分比） |
| `due_date` | timestamptz | 是 | null | 截止日期 |
| `plan_date` | timestamptz | 是 | null | 计划开始日期 |
| `owner_id` | bigint | 是 | null | 主负责人 ID（关联 task_members.id）|
| `supporter_id` | bigint | 是 | null | 主要协助人 ID（关联 task_members.id）|
| `related_member_ids` | jsonb | 是 | `[]` | 关联成员 ID 数组，格式：`[bigint, ...]` |
| `owner_ids` | jsonb | 是 | null | 多主R ID 数组（新字段，与 owner_id 并存）|
| `supporter_ids` | jsonb | 是 | null | 多主S ID 数组（新字段，与 supporter_id 并存）|
| `group_id` | bigint | 是 | null | 所属分组 ID（关联 task_groups.id），删除分组时置 null |
| `tag_ids` | jsonb | 是 | null | 标签 ID 数组，格式：`[bigint, ...]`（关联 task_tags.id）|
| `key_docs` | jsonb | 是 | null | 关键文档列表，格式见下方说明 |
| `related_dx` | jsonb | 是 | null | 关联大象群/会话，格式：`[{"id":"...","name":"...","type":"..."}]` |
| `predecessor_ids` | jsonb | 是 | `[]` | 前置任务 ID 数组（关联 tasks.id） |
| `successor_ids` | jsonb | 是 | null | 后置任务 ID 数组（关联 tasks.id） |
| `related_memo_ids` | jsonb | 是 | `[]` | 关联备忘 ID 数组（关联 memos.id）|
| `need_report` | boolean | 是 | false | 是否需要汇报 |
| `created_at` | timestamptz | 否 | `now()` | 创建时间 |
| `updated_at` | timestamptz | 否 | `now()` | 最后更新时间 |

### key_docs 字段格式

```json
[
  {
    "url": "https://km.sankuai.com/collabpage/2759224405",
    "title": "文档标题",
    "type": "citadel"
  }
]
```

### status 枚举值说明

| 值 | 含义 | 界面颜色 |
|----|------|---------|
| `todo` | 待办 | 灰色 |
| `in_progress` | 进行中 | 蓝色 |
| `done` | 已完成 | 绿色 |
| `cancelled` | 已取消 | 灰色删除线 |

### priority 枚举值说明

| 值 | 含义 | 界面颜色 |
|----|------|---------|
| `low` | 低优先级 | 灰色 |
| `medium` | 中等优先级 | 琥珀色 |
| `high` | 高优先级 | 红色 |
| `urgent` | 紧急 | 深红色 |

### 主键说明

`tasks.id` 为手动指定的 bigint，**非自增**。创建前必须先查最大值：

```bash
curl "$API_URL/tasks?select=id&order=id.desc&limit=1" \
  -H "apikey: $API_KEY" -H "Authorization: Bearer $API_KEY"
# 取结果 id + 1 作为新 id
```

---

## 2. task_groups（任务分组/看板泳道）

### 字段定义

| 字段名 | 类型 | 可为空 | 默认值 | 说明 |
|--------|------|--------|--------|------|
| `id` | bigint | 否 | — | 主键，手动指定大整数 |
| `name` | text | 否 | — | 分组名称（如"品牌发展"） |
| `color` | text | 是 | null | 颜色 HEX 值（如 `#06b6d4`） |
| `sort_order` | integer | 是 | null | 排序权重（数字越小越靠前） |
| `keywords` | jsonb | 是 | `[]` | 关键词数组，用于自动推断分组，格式：`["加盟","门店"]` |
| `created_at` | timestamptz | 否 | `now()` | 创建时间 |
| `updated_at` | timestamptz | 否 | `now()` | 最后更新时间 |

### 预设分组数据

| 分组名 | id | color | sort_order |
|--------|----|-------|------------|
| 品牌发展 | 1108465676 | #06b6d4 | 2 |
| 营运标准 | 2394361001 | #ec4899 | — |
| 加盟商管 | 5899071651 | #f59e0b | — |
| 产运数据 | 9408221420 | — | — |
| 日常管理 | 6151528880 | #ef4444 | — |
| 个人项目 | 3226334826 | — | — |
| 其他 | 2446698303 | — | — |

---

## 3. task_members（人员信息）

### 字段定义

| 字段名 | 类型 | 可为空 | 默认值 | 说明 |
|--------|------|--------|--------|------|
| `id` | bigint | 否 | 自增 | 主键，自增整数 |
| `name` | text | 否 | — | 姓名 |
| `mis` | text | 是 | null | 美团 MIS 账号（如 `wangjunlong03`） |
| `created_at` | timestamptz | 否 | `now()` | 创建时间 |

### 主要成员数据

| id | name | mis |
|----|------|-----|
| 1 | 王君龙 | wangjunlong03 |
| 2 | 丁泽群 | dingzequn |
| 4 | 朱原隆 | zhuyuanlong02 |
| 5 | 吴燕敏 | wuyanmin |
| 6 | 白杰 | baijie08 |
| 7 | 朱红芳 | zhuhongfang |
| 69 | 田继芳 | tianjifang |
| 70 | 史明月 | — |
| 73 | 常勤志 | changqinzhi |
| 74 | 胡冰 | hubing |
| 88 | 尤琪 | youqi |
| 93 | 何小雁 | hexiaoyan |
| 188/3 | 吴延忠 | wuyanzhong |
| 189 | 张洋(Flora) | zhangyang240 |

---

## 4. task_tags（任务标签）

### 字段定义

| 字段名 | 类型 | 可为空 | 默认值 | 说明 |
|--------|------|--------|--------|------|
| `id` | bigint | 否 | — | 主键，手动指定大整数 |
| `name` | text | 否 | — | 标签名称 |
| `color` | text | 是 | null | 颜色 HEX 值（如 `#10b981`） |
| `created_at` | timestamptz | 否 | `now()` | 创建时间 |

### 关联说明

- `tasks.tag_ids`：bigint 数组，存储该任务关联的标签 ID 列表
- 删除标签时需同步清理 tasks 中的 tag_ids

---

## 5. task_comments（任务评论与动态）

### 字段定义

| 字段名 | 类型 | 可为空 | 默认值 | 说明 |
|--------|------|--------|--------|------|
| `id` | bigint | 否 | 自增 | 主键，自增整数 |
| `task_id` | bigint | 否 | — | 关联任务 ID（关联 tasks.id） |
| `content` | text | 是 | null | 评论内容，富文本 HTML 格式 |
| `comment_type` | text | 是 | `'comment'` | 类型：`comment`（普通评论）/ `progress`（进度更新）/ `issue`（问题）|
| `created_at` | timestamptz | 否 | `now()` | 创建时间 |

### comment_type 枚举值

| 值 | 含义 | 界面图标 |
|----|------|---------|
| `comment` | 普通评论 | 消息气泡 |
| `progress` | 进度更新 | 趋势图标 |
| `issue` | 问题/风险 | 警告图标 |

---

## 6. memos（备忘录）

### 字段定义

| 字段名 | 类型 | 可为空 | 默认值 | 说明 |
|--------|------|--------|--------|------|
| `id` | bigint | 否 | — | 主键，手动指定大整数 |
| `title` | text | 是 | null | 备忘标题 |
| `content` | text | 是 | null | 备忘正文，富文本 HTML 格式 |
| `memo_type` | text | 是 | `'note'` | 类型：`note`（普通备忘）/ 其他扩展类型 |
| `direction` | text | 是 | null | 分类/方向（非外键，直接存字符串或 group_id 字符串） |
| `related_url` | text | 是 | null | 关联链接 URL |
| `related_task_id` | bigint | 是 | null | 关联单任务 ID（关联 tasks.id，旧字段）|
| `related_task_ids` | jsonb | 是 | `[]` | 关联多任务 ID 数组（关联 tasks.id，新字段）|
| `reading_item_id` | text | 是 | null | 关联阅读条目 ID（关联 reading_items.id）|
| `tag_ids` | jsonb | 是 | `[]` | 标签 ID 数组 |
| `tags` | text | 是 | `''` | 标签字符串（旧字段，已由 tag_ids 替代）|
| `deleted_at` | timestamptz | 是 | null | 软删除时间（非 null 表示已删除）|
| `created_at` | timestamptz | 否 | `now()` | 创建时间 |
| `updated_at` | timestamptz | 否 | `now()` | 最后更新时间 |

### 注意事项

- `direction` 字段存储分组信息，实际值可能是 group_id 字符串或空字符串（非严格外键）
- 软删除：查询时过滤 `deleted_at=is.null`，删除时更新 `deleted_at` 而非真正 DELETE
- `related_task_id`（旧）与 `related_task_ids`（新）并存，优先使用 `related_task_ids`

---

## 7. task_notes（梳理文档）

### 字段定义

| 字段名 | 类型 | 可为空 | 默认值 | 说明 |
|--------|------|--------|--------|------|
| `id` | bigint | 否 | — | 主键，手动指定大整数（genId 生成）|
| `title` | text | 是 | null | 文档标题 |
| `content` | text | 是 | null | 文档正文，Tiptap 输出的富文本 HTML，可包含 task-mention chip |
| `related_task_ids` | jsonb | 是 | `[]` | 文档内通过 `/` 插入的任务引用 ID 数组 |
| `created_at` | timestamptz | 否 | `now()` | 创建时间 |
| `updated_at` | timestamptz | 否 | `now()` | 最后更新时间（列表按此字段倒序排列）|

### content 字段说明

`content` 为 Tiptap 编辑器生成的 HTML，支持以下特殊节点：

**任务引用 Chip（task-mention）**：
```html
<span
  id="9221533939"
  title="任务标题"
  status="todo"
  groupname="日常管理"
  groupcolor="#ef4444"
  data-task-mention="9221533939"
  data-task-status="todo"
  class="task-mention-chip"
  contenteditable="false"
>
  <span class="task-mention-status">○</span>
  <span class="task-mention-title">任务标题</span>
</span>
```

**任务清单（task-list）**：
```html
<ul data-type="taskList">
  <li data-type="taskItem" data-checked="false">待办事项</li>
  <li data-type="taskItem" data-checked="true">已完成事项</li>
</ul>
```

### 主键生成方式

使用 `genId()` 工具函数（`src/lib/utils.js`），生成基于时间戳的大整数，确保唯一性。

---

## 8. reading_items（阅读收藏）

### 字段定义

| 字段名 | 类型 | 可为空 | 默认值 | 说明 |
|--------|------|--------|--------|------|
| `id` | bigint | 否 | — | 主键，手动指定大整数 |
| `url` | text | 否 | — | 文章/链接 URL |
| `title` | text | 是 | null | 标题（自动抓取或手动填写）|
| `summary` | text | 是 | null | 摘要内容 |
| `category` | text | 是 | `'work'` | 分类：`work`（工作）/ 其他自定义分类 |
| `is_read` | boolean | 是 | false | 是否已读 |
| `is_starred` | boolean | 是 | false | 是否星标收藏 |
| `tags` | jsonb | 是 | `[]` | 标签数组（UUID 字符串数组，内部分类标签）|
| `deleted_at` | timestamptz | 是 | null | 软删除时间 |
| `created_at` | timestamptz | 否 | `now()` | 创建时间 |

### 注意事项

- 软删除：`deleted_at` 非 null 表示已删除，查询时需过滤
- `tags` 字段存储 UUID 字符串数组（非关联 task_tags 表），是内部分类标签

---

## 表关联关系

```
tasks
 ├── parent_id → tasks.id（自关联，子任务）
 ├── group_id → task_groups.id
 ├── owner_id → task_members.id
 ├── supporter_id → task_members.id
 ├── related_member_ids[] → task_members.id
 ├── owner_ids[] → task_members.id
 ├── supporter_ids[] → task_members.id
 ├── tag_ids[] → task_tags.id
 ├── predecessor_ids[] → tasks.id（自关联，前置任务）
 ├── successor_ids[] → tasks.id（自关联，后置任务）
 └── related_memo_ids[] → memos.id

task_comments
 └── task_id → tasks.id

memos
 ├── related_task_id → tasks.id（旧）
 ├── related_task_ids[] → tasks.id（新）
 └── reading_item_id → reading_items.id

task_notes
 └── related_task_ids[] → tasks.id（通过 / 插入的任务引用）
```

---

## 常用 API 操作示例

```bash
API_URL="https://dbc23lmh865kibbhuu.database.nocode.cn/rest/v1"
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzQ2OTc5MjAwLCJleHAiOjE5MDQ3NDU2MDB9.UKr75xTBFk4W61wrVVaUphEDFqBUdEROoEL7GfFrjJE"

# ── 查询 ────────────────────────────────────────────────
# 查询所有待办任务（按更新时间倒序）
curl -s "$API_URL/tasks?status=eq.todo&order=updated_at.desc" \
  -H "apikey: $API_KEY" -H "Authorization: Bearer $API_KEY"

# 查询某分组下的任务
curl -s "$API_URL/tasks?group_id=eq.1108465676&order=updated_at.desc" \
  -H "apikey: $API_KEY" -H "Authorization: Bearer $API_KEY"

# 查询子任务
curl -s "$API_URL/tasks?parent_id=eq.9221533945" \
  -H "apikey: $API_KEY" -H "Authorization: Bearer $API_KEY"

# 查询任务评论
curl -s "$API_URL/task_comments?task_id=eq.9221533934&order=created_at.asc" \
  -H "apikey: $API_KEY" -H "Authorization: Bearer $API_KEY"

# ── 创建（tasks 需先查 max id）────────────────────────────
# 1. 查最大 id
curl -s "$API_URL/tasks?select=id&order=id.desc&limit=1" \
  -H "apikey: $API_KEY" -H "Authorization: Bearer $API_KEY"

# 2. 创建任务（写入 /tmp/task.json 再发送，避免特殊字符问题）
cat > /tmp/task.json << 'EOF'
{
  "id": 9221534000,
  "title": "任务标题",
  "status": "todo",
  "priority": "medium",
  "group_id": 1108465676,
  "owner_id": 1,
  "related_member_ids": [],
  "predecessor_ids": [],
  "related_memo_ids": [],
  "tag_ids": []
}
EOF
curl -s -X POST "$API_URL/tasks" \
  -H "apikey: $API_KEY" -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d @/tmp/task.json

# ── 更新 ────────────────────────────────────────────────
curl -s -X PATCH "$API_URL/tasks?id=eq.9221534000" \
  -H "apikey: $API_KEY" -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"status":"done","updated_at":"2026-06-24T13:18:00+08:00"}'

# ── 软删除（memos/reading_items）────────────────────────
curl -s -X PATCH "$API_URL/memos?id=eq.9931847667" \
  -H "apikey: $API_KEY" -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"deleted_at":"2026-06-24T13:18:00+08:00"}'
```

---

## 数据迁移说明

迁移到新数据库时，建议按以下顺序导入（避免外键约束冲突）：

1. `task_members`（无外键依赖）
2. `task_tags`（无外键依赖）
3. `task_groups`（无外键依赖）
4. `tasks`（依赖 task_members、task_tags、task_groups，自关联 parent_id/predecessor_ids 需最后处理）
5. `task_comments`（依赖 tasks）
6. `memos`（依赖 tasks）
7. `task_notes`（依赖 tasks）
8. `reading_items`（无外键依赖）

> **注意**：tasks 表的自关联字段（`parent_id`、`predecessor_ids`、`successor_ids`）在批量导入时，建议先导入所有记录（字段设为 null/[]），再统一更新关联字段，避免引用不存在的 ID 报错。

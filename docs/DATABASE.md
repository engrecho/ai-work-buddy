# AI-Buddy 数据库结构说明

> 最后更新：2026-07-16
> 数据库：MySQL 5.7+ / 8.0
> 部署位置：腾讯云宝塔（生产）/ 本地（开发）
> 协议：自建 Express HTTP API

---

## 连接信息

| 配置项 | 值 |
|--------|-----|
| 数据库类型 | MySQL 5.7+ / 8.0 |
| 主机 | localhost（仅本机访问） |
| 端口 | 3306 |
| 数据库名 | `buddy` |
| 用户名 | `buddy` |
| 字符集 | `utf8mb4` / `utf8mb4_unicode_ci` |
| 协议 | 自建 REST API（`/api/:table` 与 `/api/v1/*`） |
| 鉴权 | JWT Cookie（前端） / `X-API-Key` Header（buddy-skill） |

环境变量见 `.env.example`；后端连接池配置在 `server/db.js`。

---

## 数据表总览

| 表名 | 用途 | 主键类型 | 是否软删 |
|------|------|----------|----------|
| `users` | 用户 | AUTO_INCREMENT | 否 |
| `api_keys` | 外部工具的 API Key | AUTO_INCREMENT | 否（`is_active=false` 或 `expires_at` 过期） |
| `tasks` | 核心任务 | 手写 bigint | 否 |
| `task_groups` | 任务分组 / 看板泳道 | 手写 bigint | 否 |
| `task_members` | 人员 | AUTO_INCREMENT | 否 |
| `task_tags` | 任务标签 | 手写 bigint | 否 |
| `task_comments` | 任务评论 / 动态 | AUTO_INCREMENT | 否 |
| `memos` | 备忘录 | AUTO_INCREMENT | **是**（`deleted_at`） |
| `task_notes` | 梳理文档 | 手写 bigint | 否 |
| `reading_items` | 阅读收藏 | 手写 bigint | **是**（`deleted_at`） |
| `quick_notes` | 随记 | AUTO_INCREMENT | 否 |
| `health_profiles` | 健康档案（就诊人） | AUTO_INCREMENT | 否 |
| `health_visits` | 就诊记录 | AUTO_INCREMENT | 否 |
| `health_medications` | 用药记录 | AUTO_INCREMENT | 否 |

**主键约定**：
- 早期版本统一用「手写 bigint（`Date.now()` 时间戳）」；迁移到 MySQL 后，POST 接口要求 DB 给出 `insertId`，因此部分表改为 `AUTO_INCREMENT`（详见 `deploy/migrate-add-auto-increment.sql`）
- 业务代码用 `src/lib/utils.js` 的 `genId()` 生成时间戳大整数

**用户隔离**：除 `users` 表外，所有业务表都带 `user_id`。后端 `parseFilters` 自动注入 `WHERE user_id = ?` 条件，前端无法绕过。

---

## 1. users（用户表）

```sql
CREATE TABLE `users` (
    `id`            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `username`      VARCHAR(64) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,        -- bcrypt
    `nickname`      VARCHAR(255),
    `avatar_url`    TEXT,
    `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_login_at` TIMESTAMP NULL
);
```

- 密码用 `bcryptjs` 哈希（10 rounds）
- 登录后端用 `username + password` → 返回 JWT（存 Cookie `ai_buddy_token`）

---

## 2. api_keys（外部工具 API Key）

```sql
CREATE TABLE `api_keys` (
    `id`            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `user_id`       BIGINT NOT NULL,
    `key_hash`      VARCHAR(64) NOT NULL UNIQUE,  -- SHA256(api_key) hex
    `key_prefix`    VARCHAR(20) NOT NULL,         -- 明文前 12 字符，仅展示
    `name`          VARCHAR(100) DEFAULT 'Default',
    `is_active`     TINYINT(1) NOT NULL DEFAULT 1,
    `last_used_at`  TIMESTAMP NULL,
    `expires_at`    TIMESTAMP NULL,                -- NULL = 永不过期
    `created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- **明文只显示一次**（在创建弹窗里）
- 存 SHA-256 哈希（明文 → 64 字符 hex）
- 鉴权流程见 `buddy-skill/SKILL.md` 和 `server/auth.js` 的 `getUserByApiKey`

---

## 3. tasks（核心任务表）

```sql
CREATE TABLE `tasks` (
    `id`              BIGINT NOT NULL PRIMARY KEY,
    `user_id`         BIGINT NOT NULL,
    `title`           TEXT NOT NULL,
    `description`     LONGTEXT,                       -- Tiptap HTML
    `status`          VARCHAR(20) NOT NULL DEFAULT 'todo',  -- todo/in_progress/done/archived
    `priority`        VARCHAR(20) DEFAULT 'medium',         -- low/medium/high/urgent
    `parent_id`       BIGINT,                              -- 子任务层级
    `is_project`      TINYINT(1) DEFAULT 0,
    `progress`        INT DEFAULT 0,                        -- 0-100
    `due_date`        TIMESTAMP NULL,
    `plan_date`       TIMESTAMP NULL,
    `owner_id`        BIGINT,
    `supporter_id`    BIGINT,
    `related_member_ids` JSON,
    `owner_ids`          JSON,
    `supporter_ids`      JSON,
    `group_id`        BIGINT,
    `tag_ids`         JSON,
    `key_docs`        JSON,
    `related_dx`      JSON,
    `predecessor_ids` JSON,                                -- 前置任务
    `successor_ids`   JSON,                                -- 后续任务
    `related_memo_ids` JSON,
    `need_report`     TINYINT(1) DEFAULT 0,
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- 状态：todo / in_progress / done / archived
- 优先级：low / medium / high / urgent
- `parent_id` 关联本表 id，做子任务层级
- `predecessor_ids` / `successor_ids` 是任务依赖图（梳理视图里渲染为流程图）

---

## 4. task_groups（任务分组 / 看板泳道）

```sql
CREATE TABLE `task_groups` (
    `id`         BIGINT NOT NULL PRIMARY KEY,
    `user_id`    BIGINT NOT NULL,
    `name`       VARCHAR(255) NOT NULL,
    `color`      VARCHAR(20),                -- #rrggbb
    `sort_order` INT,
    `keywords`   JSON,                        -- 自动归类用
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**预设分组**（注册时自动创建，参见 `server/auth.js` `createDefaultGroupsForUser`）：
品牌发展 / 营运标准 / 加盟商管 / 产运数据 / 日常管理 / 个人项目 / 其他

---

## 5. task_members（人员）

```sql
CREATE TABLE `task_members` (
    `id`         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `user_id`    BIGINT NOT NULL,
    `name`       VARCHAR(255) NOT NULL,
    `mis`        VARCHAR(255),
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. task_tags（任务标签）

```sql
CREATE TABLE `task_tags` (
    `id`         BIGINT NOT NULL PRIMARY KEY,
    `name`       VARCHAR(255) NOT NULL,
    `color`      VARCHAR(20),
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 7. task_comments（任务评论 / 动态）

```sql
CREATE TABLE `task_comments` (
    `id`           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `user_id`      BIGINT NOT NULL,
    `task_id`      BIGINT NOT NULL,
    `content`      LONGTEXT,
    `comment_type` VARCHAR(20) DEFAULT 'comment',  -- comment / progress / issue
    `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- 三种类型：评论（comment）、进度更新（progress）、问题（issue）

---

## 8. memos（备忘录） — 软删

```sql
CREATE TABLE `memos` (
    `id`               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `user_id`          BIGINT NOT NULL,
    `title`            VARCHAR(500),
    `content`          LONGTEXT,                            -- Tiptap HTML
    `memo_type`        VARCHAR(50) DEFAULT 'note',         -- note / idea / article
    `direction`        VARCHAR(255),
    `related_url`      TEXT,
    `related_task_id`  BIGINT,
    `related_task_ids` JSON,
    `reading_item_id`  VARCHAR(255),
    `tag_ids`          JSON,
    `tags`             TEXT,                                -- 字符串标签（与 JSON tag_ids 并存）
    `deleted_at`       TIMESTAMP NULL,                      -- 软删标记
    `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- 删除会更新 `deleted_at`，列表查询自动过滤 `deleted_at IS NULL`
- 同一份数据同时存了 `tag_ids`（JSON 数组）和 `tags`（字符串），前者给程序用、后者给搜索用

---

## 9. task_notes（梳理文档）

```sql
CREATE TABLE `task_notes` (
    `id`               BIGINT NOT NULL PRIMARY KEY,
    `user_id`          BIGINT NOT NULL,
    `title`            VARCHAR(500),
    `content`          LONGTEXT,                       -- Tiptap HTML + task-mention chip
    `related_task_ids` JSON,
    `created_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

- 内容含富文本 + 任务引用 chip（`@TaskName`），见 `src/components/TaskMentionExtension.js`

---

## 10. reading_items（阅读收藏） — 软删

```sql
CREATE TABLE `reading_items` (
    `id`         BIGINT NOT NULL PRIMARY KEY,
    `user_id`    BIGINT NOT NULL,
    `url`        TEXT NOT NULL,
    `title`      VARCHAR(500),
    `summary`    LONGTEXT,
    `category`   VARCHAR(100) DEFAULT 'work',
    `is_read`    TINYINT(1) DEFAULT 0,
    `is_starred` TINYINT(1) DEFAULT 0,
    `tags`       JSON,
    `deleted_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 11. quick_notes（随记）

```sql
CREATE TABLE `quick_notes` (
    `id`         BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `user_id`    BIGINT NOT NULL,
    `content`    TEXT NOT NULL,
    `tags`       TEXT,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 12. health_profiles（健康档案 — 就诊人）

```sql
CREATE TABLE `health_profiles` (
    `id`          BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `user_id`     BIGINT NOT NULL,
    `patient_name` VARCHAR(100) NOT NULL,         -- 患者姓名（如：张三 / 父亲）
    `gender`      ENUM('male','female') NULL,      -- 性别
    `birth_date`  DATE NULL,                       -- 出生日期（可空）
    `blood_type`  VARCHAR(10) NULL,                -- 血型
    `allergies`   TEXT NULL,                       -- 过敏史
    `medical_history` TEXT NULL,                    -- 既往病史
    `created_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

- 一个用户可有多个档案（自己、父母、子女）
- `birth_date` 后端返回 ISO 字符串（如 `2021-11-14T16:00:00.000Z`），前端用本地时区转换显示

---

## 13. health_visits（就诊记录）

```sql
CREATE TABLE `health_visits` (
    `id`                 BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `user_id`            BIGINT NOT NULL,
    `profile_id`        BIGINT NOT NULL,            -- 关联 health_profiles.id
    `visit_date`        DATE NOT NULL,              -- 就诊日期
    `hospital`          VARCHAR(255) NULL,          -- 医院
    `department`        VARCHAR(100) NULL,          -- 科室
    `doctor`            VARCHAR(100) NULL,          -- 医生
    `chief_complaint`   TEXT NULL,                  -- 主诉
    `diagnosis`         TEXT NULL,                  -- 诊断结果
    `prescription`      TEXT NULL,                  -- 处方/用药方案
    `examination`       TEXT NULL,                  -- 检查报告
    `next_visit_date`       DATE NULL,              -- 下次就诊日期（开始，可空）
    `next_visit_date_end`   DATE NULL,              -- 下次就诊日期（结束，可空，支持区间）
    `cost`              DECIMAL(10,2) NULL,         -- 费用
    `is_reimbursed`     TINYINT(1) NOT NULL DEFAULT 0,  -- 是否报销（0=否, 1=是）
    `reimburse_amount`  DECIMAL(10,2) NULL,         -- 报销金额
    `attachment_urls`   JSON NULL,                  -- 附件图片（数组，每项 {url, note?}）
    `created_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

- `next_visit_date` / `next_visit_date_end` 支持日期区间（前端用级联选择器）
- `is_reimbursed` 是布尔字段（`BOOLEAN_COLUMNS` 已配置）
- `attachment_urls` 是 JSON 数组：`[{url: "...", note: "心电图"}, ...]`，note 非必填
- 列表按 `visit_date DESC` 排序，`visits[0]` 即最新就诊

---

## 14. health_medications（用药记录）

```sql
CREATE TABLE `health_medications` (
    `id`               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `user_id`          BIGINT NOT NULL,
    `profile_id`      BIGINT NOT NULL,              -- 关联 health_profiles.id
    `visit_id`        BIGINT NULL,                  -- 关联 health_visits.id（可空，表示独立用药）
    `name`            VARCHAR(200) NOT NULL,         -- 药品名称
    `dosage`          VARCHAR(100) NULL,             -- 剂量
    `usage_instruction` TEXT NULL,                  -- 用法说明
    `status`          ENUM('active','paused','completed','as_needed') NOT NULL DEFAULT 'active',
    `start_date`      DATE NULL,                     -- 开始日期（可空）
    `end_date`        DATE NULL,                     -- 结束日期（可空）
    `photo_url`       TEXT NULL,                     -- 药物照片
    `notes`           TEXT NULL,                     -- 备注
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

- `status` 状态：`active`(服用中) / `paused`(暂停) / `completed`(已完成) / `as_needed`(酌情使用)
- `visit_id` 可空：关联到具体就诊记录的用药走"就诊记录右栏独立编辑"；未关联的归到档案顶层"用药清单"
- `start_date` / `end_date` 均可空（支持无固定周期的药物）
- 后端 `GET /api/health_profiles/:id` 详情接口会自动把药物按 `visit_id` 分组：
  - `visits[].medications` = 本次就诊的药物
  - `profile.medications` = 未关联就诊的顶层药物

---

## 类型映射表（后端自动处理）

| JS 类型 | MySQL 类型 | 转换逻辑 |
|---------|-----------|----------|
| ISO 8601 字符串 | `TIMESTAMP` | `2026-07-01T17:06:28.081Z` ↔ `2026-07-01 17:06:28` |
| boolean | `TINYINT(1)` | `true` ↔ `1` |
| 对象/数组 | `JSON` | `JSON.stringify` ↔ `JSON.parse` |
| string | `VARCHAR` / `TEXT` / `LONGTEXT` | 直传 |
| number | `BIGINT` / `INT` | 直传 |

转换实现见 `server/index.js` `prepareValue` / `transformRow`。

---

## 软删约定

- `memos` 和 `reading_items` 的删除是软删（更新 `deleted_at`）
- 列表查询（GET）自动加 `WHERE deleted_at IS NULL`
- 软删后 `getById` 返回 200 + `data: null`（不是 404）
- 物理删除需要直接走 SQL

---

## 索引

- 所有表的主键索引
- `users.username` UNIQUE
- `api_keys.key_hash` UNIQUE（高频查询）
- `tasks.status`、`tasks.group_id`、`tasks.parent_id`、`tasks.owner_id`、`tasks.updated_at DESC`、`tasks.created_at DESC`
- `memos.user_id`、`memos.deleted_at`、`memos.created_at DESC`、`memos.updated_at DESC`
- `reading_items.deleted_at`、`reading_items.created_at DESC`
- `task_comments.task_id`、`task_comments.user_id`、`task_comments.created_at DESC`
- 其他业务常用外键也都加了索引

---

## 初始化与迁移

```bash
# 首次初始化（清空重建）
mysql -u buddy -p'密码' buddy < deploy/mysql-schema.sql

# 升级：单独跑迁移脚本（不会清空数据）
mysql -u buddy -p'密码' buddy < deploy/migrate-add-user-id.sql
mysql -u buddy -p'密码' buddy < deploy/migrate-add-api-keys.sql
mysql -u buddy -p'密码' buddy < deploy/migrate-add-auto-increment.sql
```

迁移脚本历史：
- `migrate-add-user-id.sql`：早期表加 `user_id` 字段
- `migrate-add-api-keys.sql`：新增 `api_keys` 表
- `migrate-add-auto-increment.sql`：把部分手写 bigint 改为 AUTO_INCREMENT（满足 SKILL POST 接口需要 `insertId`）

---

## 备份与恢复

```bash
# 备份
mysqldump -u buddy -p'密码' buddy > /www/backup/buddy_$(date +%Y%m%d).sql

# 恢复
mysql -u buddy -p'密码' buddy < backup_20260704.sql

# 仅备份结构
mysqldump -u buddy -p'密码' --no-data buddy > schema.sql
```

自动备份脚本见 `docs/TROUBLESHOOTING.md` 末尾。

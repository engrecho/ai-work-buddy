# 部署系统说明

本目录是 AI-Buddy 的「部署系统」——从代码推送到线上生效，全程无需 SSH。

> 如果你想从零搭建一套新环境，看面向用户的 [宝塔部署指南](../docs/DEPLOY_BAOTA.md)。
> 本文档面向**已经部署好、想理解部署机制 / 排查部署问题 / 调用运维接口**的人。

---

## 一、部署链路总览

```
本地 git push
     ↓
GitHub Webhook（push 事件）
     ↓
宝塔 WebHook 插件收到 → 执行 pull.sh
     ↓
┌─────────────── pull.sh 两阶段 ───────────────┐
│ Phase 1: git fetch + reset --hard origin/main │
│ Phase 2: 装依赖 → build → 重启 PM2 →          │
│         SQL 迁移 → once 任务 → 同步 Skills     │
└────────────────────────────────────────────────┘
     ↓
record-status.js 把每步状态写入 .last-deploy.json
     ↓
GET /api/deploy/status 读取返回（无需 SSH 即可观测）
```

**关键文件**：

| 文件 | 作用 |
|------|------|
| `pull.sh` | 部署主脚本，被宝塔 WebHook 调用 |
| `record-status.js` | 状态记录器，pull.sh 每步调用它写状态 |
| `once/*.sh` | 一次性运维任务（见下文） |
| `migrate-*.sql` | 增量 SQL 迁移脚本 |
| `mysql-schema.sql` | 完整建表脚本（首次部署用） |
| `sync-skills.sh` | 同步 buddy-skill 到可分发目录 |

**运行时产物**（已 gitignore，服务器上自动生成）：

| 路径 | 作用 |
|------|------|
| `.last-deploy.json` | 最近一次部署的状态快照 |
| `.deploys/` | 历史部署归档（保留 20 份） |
| `once/.done` | 已执行的 once 任务清单 |
| `once/.logs/*.log` | 每个 once 任务的完整输出 |
| `.applied_migrations` | 已应用的 SQL 迁移清单 |

---

## 二、pull.sh 工作流程

### Phase 1：拉取代码

1. 确保 git remote 用 HTTPS（避免 SSH 密钥问题）
2. `git fetch --all`：先直连 GitHub，失败用 `ghproxy.com` 代理 fallback
3. `git reset --hard origin/main`：强制同步到远程版本（本地修改会被丢弃）
4. 记录当前 commit / message / author / time

### Phase 2：部署任务（7 步，单步失败不阻断后续）

| 步骤 | 名称 | 说明 |
|------|------|------|
| 2.1 | `install_frontend` | `yarn install`（前端依赖） |
| 2.1 | `install_backend` | `yarn install`（后端依赖） |
| 2.2 | `build_frontend` | `yarn build` |
| 2.3 | `pm2_restart` | `pm2 delete` + `pm2 start`（彻底重启，避免 cluster 缓存旧代码）+ 健康检查 |
| 2.4 | `sql_migrate` | 执行未应用的 `migrate-*.sql` |
| 2.5 | `once_tasks` | 执行未完成的 `once/*.sh` |
| 2.6 | `skills_sync` | 同步 buddy-skill |

每步用 `step_begin` / `step_done` 记录耗时和状态。

---

## 三、once 任务机制（核心，免 SSH 运维）

把需要「在服务器上跑一次」的操作写成脚本放到 `deploy/once/*.sh`，push 到 GitHub 即可。pull.sh 会自动执行，成功后记入 `once/.done` 永久跳过，失败则下次部署重试。

**典型用途**：重置密码、诊断部署失败、清理脏数据、初始化 RSS 源、批量修改用户等。

**可用环境变量**（在 once 脚本内）：`PROJECT_DIR` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` / `NVM_DIR`

**示例**：

```bash
# deploy/once/07-fix-something.sh
#!/bin/bash
cd "$PROJECT_DIR"
# 你的运维操作...
node -e "require('./server/db.js').pool.query('...')"
```

push 后等部署完成，通过 `GET /api/deploy/once-log/07-fix-something` 查看输出。

> 已执行的 once 脚本不要删（保留在 `.done` 清单里），否则会被重新执行。如需重跑，从服务器删掉 `once/.done` 里对应行。

---

## 四、SQL 迁移机制

把增量 SQL 命名为 `deploy/migrate-<描述>.sql`，push 后 pull.sh 自动执行。

- 已应用的记录在 `deploy/.applied_migrations`，下次跳过
- 执行失败不写入清单，下次部署重试
- **首次部署**用 `mysql-schema.sql`（完整建表），不要用迁移脚本

---

## 五、部署状态查询接口（3 个）

> ⚠️ 安全模型：所有 deploy 接口都需 **双鉴权 + 超级管理员**，详见下一节。

### 1. GET `/api/deploy/status`

获取最近一次部署的完整状态。**最常用**，无需 SSH 即可观测部署结果。

**返回字段**：

| 字段 | 说明 |
|------|------|
| `last_deploy` | 最近一次部署的状态快照（见下） |
| `git_head` | 服务器当前 git HEAD（commit/message/author/time） |
| `once_tasks` | once 目录下所有脚本及是否已执行 |
| `once_logs` | 最近 10 个 once 日志（名称/大小/时间） |
| `history` | 最近 10 份历史部署归档文件 |

**`last_deploy` 结构**：

```json
{
  "started_at": "ISO 时间",
  "finished_at": "ISO 时间（null=进行中）",
  "status": "success | failed | running",
  "commit": "c6fec9f",
  "commit_message": "...",
  "commit_author": "...",
  "commit_time": "...",
  "steps": [
    { "name": "git_pull", "status": "success", "duration_ms": 1319, "error": null }
    // ... 每个步骤
  ],
  "once_tasks": [
    { "name": "06-reset-demo-passwords.sh", "status": "success", "duration_ms": 800, "error": null }
  ],
  "runtime": {
    "pm2_status": "...",
    "db_tables": ["users", "tasks", ...],
    "rss_count": 123,
    "frontend_version": "v2026-07-13-rss2"
  }
}
```

**判断部署是否完成**：`finished_at` 非 null 即完成；`status=success` 表示全部步骤成功。

**示例**：

```bash
# 用 API Key（超管的 Key）
curl https://buddy.bajiaolu.cn/api/deploy/status \
  -H "X-API-Key: buddy_xxx..."

# 或用 JWT（超管登录后的 token）
curl https://buddy.bajiaolu.cn/api/deploy/status \
  -H "Authorization: Bearer <token>"
```

### 2. GET `/api/deploy/once-log/:name`

获取某个 once 任务的完整日志输出。

- `:name` 是脚本名（不含 `.sh` 后缀），如 `06-reset-demo-passwords`
- 日志来源：`deploy/once/.logs/<name>.log`
- 防路径穿越校验

### 3. GET `/api/deploy/history/:file`

获取某次历史部署的详情。

- `:file` 是归档文件名，如 `deploy-2026-07-14T14-40-19.json`
- 历史列表通过 `GET /api/deploy/status` 的 `history` 字段获取
- 归档目录：`deploy/.deploys/`，保留最近 20 份

---

## 六、安全模型

deploy 接口涉及部署细节（commit、PM2 状态、数据库表名等），**仅限超级管理员访问**。

### 三层防护

| 层 | 中间件 | 作用 |
|----|--------|------|
| 第 1 层 | `authOrApiKeyMiddleware` | 鉴权：接受 JWT（网页登录）**或** API Key（脚本调用） |
| 第 2 层 | `superAdminMiddleware` | 权限：仅放行 `id=1`，其他返回 403 |
| 第 3 层 | 数据隔离 | API Key 绑定 user_id，非超管 Key 查到的 id ≠ 1 |

### 超级管理员约定

- 默认 `id=1` 的用户为超级管理员（系统首个注册用户）
- 可通过环境变量 `SUPER_ADMIN_USER_ID` 配置其他 id
- 实现见 [server/auth.js](../server/auth.js) 的 `superAdminMiddleware` / `isSuperAdmin`

### 鉴权方式（二选一）

```bash
# 方式 A：API Key（适合脚本/自动化，必须用超管的 Key）
curl -H "X-API-Key: buddy_xxx..." https://buddy.bajiaolu.cn/api/deploy/status

# 方式 B：JWT（适合网页登录态，超管登录后从 Cookie 取）
curl -H "Authorization: Bearer <token>" https://buddy.bajiaolu.cn/api/deploy/status
```

非超管无论用哪种方式，均返回：

```json
{ "data": null, "error": { "message": "权限不足，此接口仅限超级管理员访问" } }
```

---

## 七、WebHook 配置

### 宝塔端

1. 软件商店安装「宝塔WebHook」插件
2. 添加 hook，执行脚本：`bash /www/wwwroot/<域名>/deploy/pull.sh`
3. 生成 URL 形如 `https://<域名>:11416/hook?access_key=xxx`

### GitHub 端

仓库 Settings → Webhooks → Add webhook：

- Payload URL：宝塔生成的 URL
- Content type：`application/json`
- 触发事件：`Just the push event`

### 排查 WebHook 未触发

1. GitHub 仓库 Settings → Webhooks → Recent Deliveries，看是否绿色 ✓
2. 宝塔 WebHook 插件查看请求日志
3. 服务器安全组放行 11416 端口
4. 确认 pull.sh 有执行权限：`chmod +x deploy/pull.sh`

---

## 八、手动触发部署（不用 push）

```bash
# 在服务器上
cd /www/wwwroot/<域名>
bash deploy/pull.sh
```

或通过宝塔 WebHook 插件的「测试」按钮手动触发。

---

## 九、目录结构

```
deploy/
├── README.md                # 本文档
├── pull.sh                  # 部署主脚本
├── record-status.js         # 状态记录器（pull.sh 调用）
├── sync-skills.sh           # 同步 buddy-skill
├── mysql-schema.sql         # 完整建表脚本（首次部署）
├── migrate-*.sql            # 增量迁移脚本
├── once/                    # 一次性运维任务
│   ├── *.sh                 # 任务脚本
│   ├── .done                # 已执行清单（gitignore）
│   └── .logs/               # 任务输出日志（gitignore）
├── .last-deploy.json        # 最近部署状态（gitignore，运行时生成）
├── .deploys/                # 历史部署归档（gitignore，运行时生成）
└── .applied_migrations      # 已应用迁移清单（gitignore）
```

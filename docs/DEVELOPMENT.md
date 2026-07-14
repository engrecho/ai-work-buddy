# 开发指南

本文档面向希望修改或扩展 AI-Buddy 功能的开发者。

AI-Buddy 是一个为碎片化内容而生的轻量工作空间：任务、备忘、阅读、随记四种容器共用同一套关联机制，可以被 AI 通过 `buddy-skill/` 目录直接操作。如果你打算给它加新功能或新内容形态，建议先理解**容器（container）+ 关联（relation）**这两层抽象——多数新功能都是新增一种容器或新增一种关联。

## 技术栈概览

| 层 | 技术 | 版本 |
|----|------|------|
| 前端框架 | React | 18 |
| 构建工具 | Vite | 5 |
| 样式 | Tailwind CSS | 3 |
| UI 组件 | shadcn/ui + Radix UI | 最新 |
| 路由 | React Router | 6 |
| 图标 | lucide-react | 最新 |
| 状态管理 | React Context + Hooks | - |
| 后端框架 | Express | 4 |
| 数据库驱动 | mysql2/promise | 3 |
| 认证 | jsonwebtoken + bcryptjs | 9 / 2 |

## 本地开发环境搭建

### 1. 前置要求

- Node.js 18+
- Yarn 1.22+
- MySQL 5.7+ 或 8.0

### 2. 克隆并安装

```bash
git clone https://github.com/engrecho/AI-buddy.git
cd ai-buddy

# 前端依赖
yarn install

# 后端依赖
cd server
yarn install
cd ..
```

### 3. 准备数据库

```bash
# 启动本地 MySQL
brew services start mysql   # macOS
# 或 sudo systemctl start mysql  # Linux

# 创建数据库
mysql -u root -p
> CREATE DATABASE buddy CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
> CREATE USER 'buddy'@'localhost' IDENTIFIED BY '你的密码';
> GRANT ALL ON buddy.* TO 'buddy'@'localhost';
> FLUSH PRIVILEGES;
> EXIT;

# 导入 schema
mysql -u buddy -p'你的密码' buddy < deploy/mysql-schema.sql
```

### 4. 配置环境变量

```bash
cp .env.example .env
nano .env
```

修改 `DB_PASSWORD` 为你的本地数据库密码。

### 5. 启动开发服务器

```bash
# 终端 1：启动后端
cd server
yarn start

# 终端 2：启动前端
yarn dev
```

打开 <http://localhost:8080>。

## 项目架构

### 前后端数据流

```
React Component
    ↓
supabase.from('table').select()   ← src/lib/db.js (兼容层)
    ↓
fetch('/api/table?filter=...')
    ↓
Nginx (生产) / Vite proxy (开发)
    ↓
Express Server
    ↓
MySQL Query
```

### 关键设计决策

#### 1. Supabase 兼容层

项目最初基于 Supabase JS 客户端，后来迁移到自建后端。为保留前端代码，前端通过 `src/lib/db.js` 自定义了兼容层，API 行为与原 `@supabase/supabase-js` 一致：

```javascript
const { data, error } = await supabase
  .from('tasks')
  .select('*')
  .eq('status', 'todo')
  .order('created_at', { ascending: false })
  .limit(10);
```

底层实现是把链式调用转换为 HTTP 请求，后端 Express 收到后解析查询参数并执行 SQL。
`src/integrations/supabase/client.js` 仅作为兼容历史 import 路径，re-export 自 `src/lib/db.js`。

#### 2. 后端认证与数据隔离

所有业务表都有 `user_id` 字段。后端在所有查询中**自动注入** `user_id = 当前用户ID` 条件，前端无法绕过。

```javascript
// 后端 parseFilters 函数
if (TABLES_WITH_USER_ID.has(table) && userId != null) {
  conditions.push('`user_id` = ?');
  params.push(userId);
}
```

#### 3. 数据类型转换

MySQL 与 JS 之间的类型差异由后端自动处理：

| JS | MySQL | 转换 |
|----|-------|------|
| ISO 8601 字符串 | DATETIME | `2026-07-01T17:06:28.081Z` ↔ `2026-07-01 17:06:28` |
| 布尔 | TINYINT(1) | `true` ↔ `1` |
| 对象/数组 | JSON | `JSON.stringify` ↔ `JSON.parse` |

#### 4. SQL 注入防护

所有表名和列名通过白名单（`TABLE_COLUMNS`）验证，标识符用反引号转义，值用 `?` 参数化查询。

## 代码组织

### 前端

```
src/
├── components/        # 通用 UI 组件
│   ├── ui/            # shadcn/ui 生成的组件（不要手改）
│   ├── ConfigSection.jsx
│   ├── KanbanView.jsx
│   ├── NoteView.jsx
│   └── RichEditor.jsx
├── contexts/          # React Context
│   └── AuthContext.jsx
├── integrations/
│   └── supabase/
│       └── client.js  # re-export from lib/db.js（保持原 import 路径）
├── lib/
│   ├── db.js          # 数据访问层（核心）
│   └── utils.js
├── pages/             # 页面组件
│   ├── LoginPage.jsx
│   ├── Index.jsx
│   ├── DashboardPage.jsx
│   ├── TasksPage.jsx
│   ├── MemosPage.jsx
│   ├── ReadingPage.jsx
│   └── ...
├── App.jsx
├── main.jsx
└── nav-items.jsx
```

### 后端

```
server/
├── index.js     # Express 入口 + 路由
├── auth.js      # JWT 认证
├── db.js        # MySQL 连接池 + 表结构定义
└── package.json
```

## 如何新增一个功能

### 场景：新增「便签」功能（标题 + 内容 + 标签）

#### 1. 数据库

编辑 `deploy/mysql-schema.sql`：

```sql
DROP TABLE IF EXISTS `notes`;
CREATE TABLE `notes` (
    `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `user_id` BIGINT NOT NULL,
    `title` VARCHAR(500),
    `content` LONGTEXT,
    `tags` JSON,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_notes_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

#### 2. 后端

编辑 `server/db.js` 的 `TABLE_COLUMNS`：

```javascript
notes: ['id', 'user_id', 'title', 'content', 'tags', 'created_at', 'updated_at'],
```

编辑 `server/db.js` 的 `TABLES_WITH_USER_ID`（在 `server/index.js` 中）：

```javascript
const TABLES_WITH_USER_ID = new Set([
  'tasks', 'task_groups', ..., 'notes'  // 新增
]);
```

编辑 `server/index.js` 的 `TABLES_WITH_UPDATED_AT`：

```javascript
const TABLES_WITH_UPDATED_AT = ['tasks', 'task_groups', 'memos', 'task_notes', 'notes'];
```

#### 3. 前端

创建 `src/pages/NotesPage.jsx`：

```jsx
import { useState } from 'react';
import { supabase } from '@/lib/db';

export default function NotesPage() {
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState('');

  const loadNotes = async () => {
    const { data } = await supabase.from('notes').select('*').order('created_at', { ascending: false });
    setNotes(data || []);
  };

  const addNote = async () => {
    await supabase.from('notes').insert([{ title, content: '', tags: [] }]);
    loadNotes();
  };

  // ... 渲染 UI
}
```

注册到 `src/nav-items.jsx`：

```javascript
import NotesPage from "./pages/NotesPage";

export const navItems = [
  // ...
  { title: "便签", to: "/notes", icon: <StickyNote />, page: <NotesPage /> },
];
```

完成！登录后的用户可以访问 `/notes` 路由管理自己的便签。

## API 端点

后端有两套接口：通用 CRUD（前端用）和 SKILL v1（buddy-skill 用）。

### A. 通用 CRUD（前端用，挂在 `/api/:table`）

CRUD 行为与 Supabase PostgREST 类似（实际上是为了兼容历史 import 路径）。鉴权用 JWT Cookie。

| HTTP 方法 | 路径 | 用途 |
|----------|------|------|
| GET | `/api/:table` | 查询 |
| POST | `/api/:table` | 插入 |
| PATCH | `/api/:table` | 更新 |
| DELETE | `/api/:table` | 删除 |
| GET | `/api/auth/me` | 当前用户 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/logout` | 登出 |

### B. SKILL v1（外部工具用，挂在 `/api/v1/*`）

供 `buddy-skill` 等外部工具使用。鉴权用 Header `X-API-Key: buddy_xxx...`。

> 下表是接口总览。**完整请求/响应格式、参数说明、错误码、示例**见 [buddy-skill/docs/API_REFERENCE.md](../buddy-skill/docs/API_REFERENCE.md)——那是 SKILL API 的唯一权威文档，本表仅供后端开发者快速定位路由。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/v1/me` | 当前用户 |
| GET / POST | `/api/v1/tasks` | 任务列表 / 创建 |
| GET | `/api/v1/tasks/:id` | 任务详情 |
| PATCH | `/api/v1/tasks/:id` | 更新任务 |
| DELETE | `/api/v1/tasks/:id` | 删除任务（**必须** `?confirm=true`） |
| POST | `/api/v1/tasks/organize` | 批量整理（默认 `dry_run=true`） |
| GET | `/api/v1/task-groups` | 任务分组 |
| GET / POST | `/api/v1/memos` | 备忘列表 / 创建 |
| GET | `/api/v1/memos/:id` | 备忘详情 |
| GET / POST | `/api/v1/reading` | 阅读列表 / 创建 |
| GET | `/api/v1/reading/:id` | 阅读详情 |
| GET / POST | `/api/v1/quick-notes` | 随记列表 / 创建 |
| GET | `/api/v1/quick-notes/:id` | 随记详情 |

### 查询参数

| 参数 | 格式 | 说明 |
|------|------|------|
| `select` | `id,title,status` | 限定返回列 |
| `filter` | `type:column:value` | 过滤条件，可多个 |
| `order` | `column:asc/desc` | 排序 |
| `limit` | 数字 | 限制返回数量 |
| `single` | `1` | 返回单行 |
| `count` | `exact` | 返回总数 |

### filter 类型

`eq` / `neq` / `gt` / `gte` / `lt` / `lte` / `like` / `in` / `is`

例如：
- `filter=eq:status:["todo"]`
- `filter=gt:priority:["low"]`
- `filter=is:deleted_at:null`

## 调试技巧

### 前端

浏览器开发者工具 → Console / Network 面板查看 API 请求与响应。

### 后端

```bash
# 查看 PM2 实时日志
pm2 logs ai-buddy-api

# 查看错误日志
pm2 logs ai-buddy-api --err
```

在 `server/index.js` 各路由中添加 `console.log`：

```javascript
app.post('/api/:table', requireAuthForBusinessTable, async (req, res) => {
  console.log('INSERT', req.params.table, req.body);
  // ...
});
```

### 数据库

```bash
# 开启 MySQL 查询日志
mysql -u root -p -e "SET GLOBAL general_log = 'ON';"
tail -f /var/log/mysql/general.log

# 查看当前活跃查询
mysql -u root -p -e "SHOW PROCESSLIST;"
```

## 测试

当前版本未集成自动化测试。手动测试清单见 [docs/TESTING.md](TESTING.md)（待补充）。

## 代码规范

- JavaScript：Standard JS 风格
- React 函数组件 + Hooks（不用 class）
- 使用单引号字符串
- 缩进 2 空格
- 提交信息用中文，格式：`feat: 添加便签功能` / `fix: 修复日期序列化问题`

## 部署

参见 [DEPLOY_BAOTA.md](DEPLOY_BAOTA.md)。

## 路线图

未来计划：

- 单元测试（Vitest + React Testing Library）
- E2E 测试（Playwright）
- TypeScript 迁移
- 实时协作（WebSocket）
- 移动端 App（React Native）

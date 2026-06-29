# AI Work Buddy — 宝塔面板部署指南

> 适用于宝塔面板 + PostgreSQL + PostgREST + Nginx 部署方案

---

## 架构说明

```
浏览器 → Nginx(:80/443) → 静态文件 (build/)
                       → /rest/v1/ 代理 → PostgREST(:3000) → PostgreSQL(:5432)
```

- **前端**：Vite 构建的 React 静态文件，由 Nginx 托管
- **API 中间件**：PostgREST（将 PostgreSQL 暴露为 REST API，兼容 Supabase JS 客户端）
- **数据库**：宝塔面板管理的 PostgreSQL（已创建数据库 `buddy`）

---

## 部署前置条件

| 条件 | 状态 |
|------|------|
| 宝塔面板已安装 | 用户已有 |
| PostgreSQL 数据库 `buddy` 已创建 | 用户已创建 |
| 数据库用户 `buddy` / 密码 `j4ayJcydix2fGYdc` | 用户已提供 |
| 宝塔已安装 Node.js 管理器 | 需确认安装 |
| 服务器有公网 IP / 域名 | 需准备 |

---

## 第一步：导入数据库 Schema

### 方法 A：宝塔终端命令行（推荐）

1. 登录宝塔面板 → 终端
2. 执行以下命令：

```bash
# 进入项目目录（如果还没拉取代码，先看第二步）
cd /www/wwwroot/ai-work-buddy

# 用 buddy 用户导入 schema
PGPASSWORD=j4ayJcydix2fGYdc psql -U buddy -d buddy -h localhost -f deploy/db-schema.sql
```

### 方法 B：宝塔数据库管理界面

1. 打开宝塔数据库管理页面：`https://tencent.bajiaolu.cn/database/pgsql`
2. 选择数据库 `buddy`
3. 点击「导入」或「执行 SQL」
4. 上传 `deploy/db-schema.sql` 文件并执行

### 验证

```bash
# 检查表是否创建成功
PGPASSWORD=j4ayJcydix2fGYdc psql -U buddy -d buddy -h localhost -c "\dt"

# 应该看到 9 张表：
# tasks, task_groups, task_members, task_tags, task_comments,
# memos, task_notes, reading_items, quick_notes

# 检查初始分组数据
PGPASSWORD=j4ayJcydix2fGYdc psql -U buddy -d buddy -h localhost -c "SELECT * FROM task_groups;"
```

---

## 第二步：从 GitHub 拉取代码

在宝塔终端执行：

```bash
# 进入网站根目录
cd /www/wwwroot

# 克隆代码
git clone https://github.com/engrecho/ai-work-buddy.git ai-work-buddy
cd ai-work-buddy
```

> 如果使用 Token 拉取：
> ```bash
> git clone https://engrecho:<TOKEN>@github.com/engrecho/ai-work-buddy.git ai-work-buddy
> ```

---

## 第三步：安装 PostgREST

PostgREST 是一个独立二进制程序，负责将 PostgreSQL 暴露为 REST API。

### 3.1 下载 PostgREST

```bash
# 创建安装目录
sudo mkdir -p /opt/postgrest

# 下载最新版 v11.2.0（请根据服务器架构选择）
# ── x86_64（大多数腾讯云/阿里云服务器）──
cd /tmp
wget https://github.com/PostgREST/postgrest/releases/download/v11.2.0/postgrest-v11.2.0-linux-static-x64.tar.xz
tar xf postgrest-v11.2.0-linux-static-x64.tar.xz
sudo mv postgrest /opt/postgrest/
sudo chmod +x /opt/postgrest/postgrest

# 验证
/opt/postgrest/postgrest --help
```

> ARM 架构服务器请下载 `postgrest-v11.2.0-linux-static-aarch64.tar.xz`

### 3.2 生成 JWT 密钥

```bash
cd /www/wwwroot/ai-work-buddy
node deploy/generate-jwt.js
```

**记录输出的两个值**：
- `JWT Secret` → 填入 postgrest.conf
- `Anon Key` → 填入 .env 文件

### 3.3 配置 PostgREST

```bash
# 复制配置模板
sudo cp deploy/postgrest.conf /opt/postgrest/postgrest.conf

# 编辑配置，将 <JWT_SECRET> 替换为上一步生成的 JWT Secret
sudo vi /opt/postgrest/postgrest.conf
```

确保配置文件内容如下（替换 `<JWT_SECRET>`）：

```ini
db-uri = "postgres://buddy:j4ayJcydix2fGYdc@localhost:5432/buddy"
db-schemas = "public"
db-anon-role = "anon"
jwt-secret = "<替换为生成的JWT_Secret>"
server-host = "127.0.0.1"
server-port = 3000
log-level = "info"
server-cors = true
```

### 3.4 测试启动

```bash
# 手动启动测试
/opt/postgrest/postgrest /opt/postgrest/postgrest.conf

# 应该看到类似输出：
# Listening on 127.0.0.1:3000
# Connection successful
```

按 `Ctrl+C` 暂停，下面设置为后台服务。

### 3.5 注册为 systemd 服务（开机自启）

```bash
sudo tee /etc/systemd/system/postgrest.service > /dev/null << 'EOF'
[Unit]
Description=PostgREST API Server
After=network.target postgresql.service

[Service]
Type=simple
ExecStart=/opt/postgrest/postgrest /opt/postgrest/postgrest.conf
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable postgrest
sudo systemctl start postgrest

# 验证运行状态
sudo systemctl status postgrest
```

### 3.6 验证 PostgREST

```bash
# 测试 API 是否正常
curl http://127.0.0.1:3000/

# 测试查询（需要 JWT Anon Key）
curl http://127.0.0.1:3000/task_groups \
  -H "Authorization: Bearer <替换为生成的Anon_Key>"

# 应该返回预设的 7 个分组数据
```

---

## 第四步：构建前端

### 4.1 安装依赖

```bash
cd /www/wwwroot/ai-work-buddy

# 安装 Node.js 18+（如果未安装）
# 宝塔面板 → 软件商店 → Node.js 版本管理器 → 安装 Node.js 18

# 安装依赖
npm install
```

### 4.2 配置环境变量

```bash
# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
vi .env
```

填入以下内容（`<Anon_Key>` 替换为 `generate-jwt.js` 生成的值）：

```env
# 生产环境使用同源访问（Nginx 代理 /rest/v1/），URL 留空
VITE_SUPABASE_URL=

# PostgREST Anon Key
VITE_SUPABASE_ANON_KEY=<替换为生成的Anon_Key>
```

### 4.3 构建生产版本

```bash
npm run build
```

构建产物在 `build/` 目录中。

---

## 第五步：配置 Nginx

### 5.1 在宝塔创建网站

1. 宝塔面板 → 网站 → 添加站点
2. 域名：填入你的域名（如 `workbuddy.bajiaolu.cn`）
3. 根目录：`/www/wwwroot/ai-work-buddy/build`
4. PHP版本：纯静态

### 5.2 修改 Nginx 配置

1. 宝塔面板 → 网站 → 设置 → 配置文件
2. 替换为以下内容（注意修改域名和路径）：

```nginx
server {
    listen 80;
    server_name workbuddy.bajiaolu.cn;  # ← 改为你的域名

    root /www/wwwroot/ai-work-buddy/build;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 1000;
    gzip_comp_level 6;

    # PostgREST API 代理
    # Supabase JS 客户端请求 /rest/v1/ 路径
    # Nginx 去掉 /rest/v1 前缀后转发给 PostgREST
    location /rest/v1/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # 前端路由（SPA 回退）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location ~ /\. {
        deny all;
    }
}
```

3. 保存并重启 Nginx

### 5.3 配置 SSL（可选但推荐）

1. 宝塔面板 → 网站 → 设置 → SSL → Let's Encrypt
2. 申请免费 SSL 证书并强制 HTTPS

---

## 第六步：验证部署

1. 打开浏览器访问 `http://你的域名`
2. 检查：
   - 页面正常加载
   - Dashboard 页面显示统计数据（全为 0 是正常的，因为新数据库还没有数据）
   - 尝试创建一个任务，看是否能保存成功
3. 检查浏览器开发者工具 Network 面板：
   - `/rest/v1/tasks` 请求返回 200 状态码

---

## 日常维护

### 更新代码

```bash
cd /www/wwwroot/ai-work-buddy
git pull origin main
npm install        # 如果依赖有变化
npm run build      # 重新构建
# Nginx 会自动使用新的 build/ 目录
```

### 重启 PostgREST

```bash
sudo systemctl restart postgrest
```

### 查看日志

```bash
# PostgREST 日志
sudo journalctl -u postgrest -f

# Nginx 错误日志
tail -f /www/wwwlogs/<域名>.error.log
```

---

## 常见问题排查

### Q: 页面加载白屏

```bash
# 检查 Nginx 配置
nginx -t
# 检查 build 目录是否存在文件
ls -la /www/wwwroot/ai-work-buddy/build/
```

### Q: 数据请求 404

```bash
# 1. 检查 PostgREST 是否运行
sudo systemctl status postgrest

# 2. 检查 PostgREST 能否连接数据库
curl http://127.0.0.1:3000/

# 3. 检查 Nginx 代理配置
# 确认 location /rest/v1/ 配置正确，proxy_pass 末尾有 /
```

### Q: 数据请求 401/403

```bash
# 检查 .env 中的 Anon Key 是否正确
# 确保 Key 与 postgrest.conf 中的 jwt-secret 匹配
# 重新运行 generate-jwt.js 并更新两个文件
```

### Q: 数据请求 500

```bash
# 检查数据库权限
PGPASSWORD=j4ayJcydix2fGYdc psql -U buddy -d buddy -h localhost -c "
  SELECT grantee, table_name, privilege_type 
  FROM information_schema.role_table_grants 
  WHERE grantee = 'anon';
"
# 如果没有权限记录，重新执行 db-schema.sql 中的授权部分
```

### Q: PostgreSQL 端口不是 5432

```bash
# 查看实际端口
sudo cat /www/server/pgsql/data/postgresql.conf | grep port
# 修改 postgrest.conf 中的 db-uri 端口号
```

---

## 文件清单

| 文件 | 用途 |
|------|------|
| `deploy/db-schema.sql` | 数据库建表脚本（9 张表 + 权限 + 初始数据） |
| `deploy/generate-jwt.js` | JWT 密钥生成脚本 |
| `deploy/postgrest.conf` | PostgREST 配置模板 |
| `deploy/nginx-site.conf` | Nginx 配置模板 |
| `.env.example` | 环境变量模板 |
| `src/integrations/supabase/client.js` | 数据库连接客户端（已更新支持环境变量） |
| `vite.config.js` | Vite 配置（已更新代理规则） |

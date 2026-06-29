# AI Work Buddy — 宝塔面板部署指南

> 架构：MySQL + Express API + Nginx 静态托管
> 项目路径：`/www/wwwroot/buddy.bajiaolu.cn`
> 域名：`buddy.bajiaolu.cn`

---

## 架构说明

```
浏览器 → Nginx(:80) → 静态文件 (build/)
                 → /api/ 代理 → Express Server(:3000) → MySQL(:3306)
                                                   数据库: buddy
```

- **前端**：Vite 构建的 React 静态文件，由 Nginx 托管
- **API 后端**：Express + mysql2，提供 REST API（兼容原 Supabase JS 客户端接口）
- **数据库**：宝塔面板管理的 MySQL（数据库 `buddy`）

---

## 部署前置条件

| 条件 | 状态 |
|------|------|
| 宝塔面板已安装 | ✅ |
| MySQL 数据库 `buddy` 已创建 | ✅ |
| 数据库用户 `buddy` / 密码 `NX62WP4bDJikBNih` | ✅ |
| Node.js 18+ 已安装 | 需确认 |
| Yarn 已安装 | 需确认 |

> 在宝塔面板 → 软件商店 → 搜索「Node.js 版本管理器」→ 安装 Node.js 18
>
> 安装 Yarn：`npm install -g yarn`

---

## 第一步：拉取代码

在宝塔终端执行：

```bash
cd /www/wwwroot
git clone https://github.com/engrecho/ai-work-buddy.git buddy.bajiaolu.cn
cd buddy.bajiaolu.cn
```

---

## 第二步：导入数据库

### 方法 A：宝塔数据库管理界面（推荐）

1. 打开宝塔数据库管理页面
2. 选择数据库 `buddy`
3. 点击「导入」或「执行 SQL」
4. 上传 `deploy/mysql-schema.sql` 文件并执行

### 方法 B：终端命令

```bash
cd /www/wwwroot/buddy.bajiaolu.cn
mysql -u buddy -p'NX62WP4bDJikBNih' buddy < deploy/mysql-schema.sql
```

### 验证

```bash
mysql -u buddy -p'NX62WP4bDJikBNih' buddy -e "SHOW TABLES;"
# 应看到 9 张表

mysql -u buddy -p'NX62WP4bDJikBNih' buddy -e "SELECT * FROM task_groups;"
# 应看到 7 个预设分组
```

---

## 第三步：配置环境变量

```bash
cd /www/wwwroot/buddy.bajiaolu.cn
cp .env.example .env
```

`.env` 文件内容（默认已匹配你的数据库信息，按需修改）：

```env
VITE_API_BASE=
VITE_PROXY_TARGET=

DB_HOST=localhost
DB_PORT=3306
DB_USER=buddy
DB_PASSWORD=NX62WP4bDJikBNih
DB_NAME=buddy
PORT=3000
```

---

## 第四步：安装后端依赖并启动

```bash
cd /www/wwwroot/buddy.bajiaolu.cn/server
yarn install
```

### 测试启动

```bash
node index.js
# 应看到: AI Work Buddy API server running on http://127.0.0.1:3000

# 测试 API
curl http://127.0.0.1:3000/api/health
# 应返回: {"status":"ok","timestamp":"..."}

curl http://127.0.0.1:3000/api/task_groups
# 应返回 7 个预设分组数据
```

按 `Ctrl+C` 停止，下面设置为后台服务。

### 方式 A：PM2 进程管理（宝塔推荐）

```bash
# 如果未安装 PM2
yarn global add pm2

cd /www/wwwroot/buddy.bajiaolu.cn
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup  # 设置开机自启
```

### 方式 B：systemd 服务

```bash
sudo cp deploy/ai-work-buddy.service /etc/systemd/system/
# 编辑服务文件，确认 Node.js 路径和项目路径
sudo vi /etc/systemd/system/ai-work-buddy.service

sudo systemctl daemon-reload
sudo systemctl enable ai-work-buddy
sudo systemctl start ai-work-buddy

# 验证
sudo systemctl status ai-work-buddy
```

---

## 第五步：构建前端

```bash
cd /www/wwwroot/buddy.bajiaolu.cn

# 安装前端依赖
yarn install

# 构建生产版本
yarn build
```

构建产物在 `build/` 目录中。

---

## 第六步：配置 Nginx

### 6.1 在宝塔创建网站

1. 宝塔面板 → 网站 → 添加站点
2. 域名：`buddy.bajiaolu.cn`
3. 根目录：`/www/wwwroot/buddy.bajiaolu.cn/build`
4. PHP版本：纯静态

### 6.2 修改 Nginx 配置

1. 宝塔面板 → 网站 → 设置 → 配置文件
2. 替换为以下内容：

```nginx
server {
    listen 80;
    server_name buddy.bajiaolu.cn;

    root /www/wwwroot/buddy.bajiaolu.cn/build;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 1000;
    gzip_comp_level 6;

    # API 代理 - 转发到 Express 后端
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
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

### 6.3 配置 SSL（推荐）

宝塔面板 → 网站 → 设置 → SSL → Let's Encrypt → 申请并强制 HTTPS

---

## 第七步：验证部署

1. 打开浏览器访问 `http://buddy.bajiaolu.cn`
2. 检查：
   - 页面正常加载
   - Dashboard 显示统计数据（新数据库为 0 是正常的）
   - 创建任务/备忘/随记，看是否保存成功
3. 浏览器开发者工具 Network 面板：
   - `/api/tasks` 请求返回 200

---

## 宝塔 WebHook 自动部署

### 创建 WebHook

1. 宝塔面板 → 软件商店 → 安装「宝塔WebHook」插件
2. 打开插件 → 添加 hook
3. 填写名称：`buddy-deploy`
4. 执行脚本：

```bash
#!/bin/bash
echo "=== $(date) 开始部署 ==="

PROJECT_DIR="/www/wwwroot/buddy.bajiaolu.cn"

if [ ! -d "$PROJECT_DIR/.git" ]; then
  cd /www/wwwroot
  git clone https://github.com/engrecho/ai-work-buddy.git buddy.bajiaolu.cn
  cd $PROJECT_DIR
else
  cd $PROJECT_DIR
  git fetch --all
  git reset --hard origin/main
fi

# 安装前端依赖并构建
yarn install
yarn build

# 安装后端依赖
cd $PROJECT_DIR/server
yarn install

# 重启后端服务
pm2 restart ai-work-buddy-api 2>/dev/null || pm2 start $PROJECT_DIR/ecosystem.config.cjs
pm2 save

echo "=== $(date) 部署完成 ==="
```

### GitHub 配置 Webhook

1. 打开 `https://github.com/engrecho/ai-work-buddy/settings/hooks/new`
2. Payload URL 填入宝塔生成的 WebHook URL
3. Content type: `application/json`
4. SSL verification: Disable
5. 触发事件: Just the push event
6. 点击 Add webhook

---

## 日常维护

### 更新代码

```bash
cd /www/wwwroot/buddy.bajiaolu.cn
git pull origin main

# 如果前端依赖有变化
yarn install

# 重新构建前端
yarn build

# 如果后端依赖有变化
cd server && yarn install

# 重启后端
pm2 restart ai-work-buddy-api
# 或
sudo systemctl restart ai-work-buddy
```

### 查看日志

```bash
# PM2 日志
pm2 logs ai-work-buddy-api

# systemd 日志
sudo journalctl -u ai-work-buddy -f

# Nginx 错误日志
tail -f /www/wwwlogs/buddy.bajiaolu.cn.error.log
```

---

## 常见问题

### Q: 页面白屏

```bash
# 检查 build 目录
ls -la /www/wwwroot/buddy.bajiaolu.cn/build/
# 如果为空，重新执行 yarn build
```

### Q: API 请求 404

```bash
# 1. 检查后端是否运行
pm2 status  # 或 systemctl status ai-work-buddy

# 2. 检查 Nginx 配置中 location /api/ 是否正确
# proxy_pass http://127.0.0.1:3000;  ← 不要加尾部斜杠

# 3. 直接测试后端
curl http://127.0.0.1:3000/api/health
```

### Q: API 请求 500

```bash
# 检查数据库连接
mysql -u buddy -p'NX62WP4bDJikBNih' buddy -e "SELECT 1;"

# 检查 .env 中数据库配置是否正确
cat /www/wwwroot/buddy.bajiaolu.cn/.env | grep DB_

# 查看后端日志
pm2 logs ai-work-buddy-api --lines 50
```

### Q: MySQL 端口不是 3306

```bash
# 查看实际端口
cat /etc/my.cnf | grep port
# 修改 .env 中的 DB_PORT
```

---

## 文件清单

| 文件 | 用途 |
|------|------|
| `deploy/mysql-schema.sql` | MySQL 建表脚本（9 张表 + 触发器 + 初始数据） |
| `server/index.js` | Express API 服务器 |
| `server/db.js` | MySQL 连接池 + 表结构定义 |
| `server/package.json` | 后端依赖 |
| `src/lib/db.js` | Supabase 兼容包装器（前端零改动） |
| `src/integrations/supabase/client.js` | 导出包装器（保持导入路径不变） |
| `deploy/nginx-site.conf` | Nginx 配置模板 |
| `deploy/ai-work-buddy.service` | systemd 服务模板 |
| `ecosystem.config.cjs` | PM2 配置 |
| `.env.example` | 环境变量模板 |

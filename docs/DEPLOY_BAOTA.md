# 宝塔面板部署完整指南

本文档面向**没有任何 Linux 基础**的用户，从一台全新的云服务器开始，一步步把 AI-Buddy 部署上线。

AI-Buddy 是一个自托管友好的工作空间：单文件 MySQL + Express，单机就能跑起来。下面从零开始到上线大约 30-60 分钟。

## 准备工作

### 1. 一台云服务器

推荐配置：

| 用途 | CPU | 内存 | 硬盘 | 带宽 | 月成本 |
|------|-----|------|------|------|--------|
| 个人使用 | 2 核 | 2GB | 40GB | 3Mbps | ¥50-100 |
| 小团队 5-10 人 | 2 核 | 4GB | 60GB | 5Mbps | ¥100-200 |

服务商：腾讯云、阿里云、华为云均可。本文档以腾讯云为例。

### 2. 一个域名

在任意域名服务商（阿里云万网、腾讯云 DNSPod、Cloudflare）购买一个域名，例：`yourdomain.com`。

### 3. 域名备案

中国大陆境内的服务器，域名必须先备案才能访问（约 7-20 天）。如果用香港或海外服务器，可免备案。

## 第一步：初始化云服务器

### 1.1 重置密码

在云服务商控制台重置服务器 root 密码。

### 1.2 配置安全组

在云服务商控制台的安全组规则中，**入站**放行以下端口：

| 端口 | 用途 |
|------|------|
| 22 | SSH（修改为自定义端口更安全） |
| 80 | HTTP |
| 443 | HTTPS |
| 11416 | 宝塔 WebHook 插件 |

### 1.3 SSH 登录

在本地终端：

```bash
ssh root@你的服务器IP
```

输入 root 密码登录。

## 第二步：安装宝塔面板

### 2.1 一键安装脚本

根据服务器操作系统选择（Ubuntu/Debian）：

```bash
wget -O install.sh https://download.bt.cn/install/install-ubuntu_6.0.sh && sudo bash install.sh ed8484bec
```

或访问 <https://www.bt.cn/new/download.html> 获取最新安装命令。

安装过程中会询问：

- 是否安装到 `/www`：输入 `y`
- 面板账号：自定义
- 面板密码：自定义
- 安装完成后会显示面板地址，格式如 `http://你的IP:8888/随机字符串`

### 2.2 登录宝塔面板

浏览器打开面板地址，使用刚才设置的账号密码登录。

首次登录会弹出「一键安装套件」窗口，**先关掉**它，我们手动选择要安装的组件。

## 第三步：安装必要软件

宝塔面板 → **软件商店**，搜索并安装：

| 软件 | 版本 | 用途 |
|------|------|------|
| Nginx | 1.22+ | 反向代理 + 静态托管 |
| MySQL | 5.7 或 8.0 | 数据库 |
| PM2 管理器 | 最新 | Node.js 进程管理 |

### 3.1 安装 Node.js

**软件商店** → 搜索 **「Node.js 版本管理器」** → 安装。

打开 Node.js 版本管理器 → 安装 **Node.js 18**（LTS）。

### 3.2 安装 Yarn

打开宝塔**终端**，执行：

```bash
npm install -g yarn

# 验证
yarn -v
# 应输出 1.22.x

# 设置淘宝镜像
yarn config set registry https://registry.npmmirror.com
```

## 第四步：创建数据库

宝塔面板 → **数据库** → **添加数据库**：

| 字段 | 值 |
|------|-----|
| 数据库名 | `buddy` |
| 用户名 | `buddy` |
| 密码 | 自定义强密码（记下来！后面要用） |
| 访问权限 | 本地服务器 |
| 编码 | utf8mb4 |

## 第五步：上传代码

### 5.1 方法 A：终端 git clone（推荐）

宝塔终端执行：

```bash
cd /www/wwwroot
git clone https://github.com/engrecho/AI-buddy.git your-domain.com
cd your-domain.com
```

> 把 `your-domain.com` 替换为你的域名（例：`buddy.example.com`）。

**注意**：如果服务器在国内且 git clone 很慢，使用 GitHub 代理：

```bash
git clone https://gh-proxy.com/https://github.com/engrecho/AI-buddy.git your-domain.com
```

### 5.2 方法 B：宝塔文件管理器上传

1. 在本地下载项目 zip：<https://github.com/engrecho/AI-buddy/archive/refs/heads/main.zip>
2. 宝塔面板 → **文件** → 进入 `/www/wwwroot/`
3. 上传 zip 文件
4. 终端解压：

```bash
cd /www/wwwroot
unzip AI-buddy-main.zip
mv AI-buddy-main your-domain.com
cd your-domain.com
```

## 第六步：配置环境变量

```bash
cp .env.example .env
nano .env
```

填入以下内容（修改密码和密钥）：

```env
VITE_API_BASE=
VITE_PROXY_TARGET=

DB_HOST=localhost
DB_PORT=3306
DB_USER=buddy
DB_PASSWORD=你的数据库密码
DB_NAME=buddy
PORT=3000

# 用下面的命令生成强随机密钥
JWT_SECRET=粘贴随机生成的密钥
```

生成 JWT_SECRET：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

复制输出的字符串粘贴到 `.env` 的 `JWT_SECRET=` 后面。

## 第七步：导入数据库

```bash
mysql -u buddy -p'你的数据库密码' buddy < deploy/mysql-schema.sql
```

如果报错「using password on command line interface can be insecure」属于警告，可忽略。

验证：

```bash
mysql -u buddy -p'你的密码' buddy -e "SHOW TABLES;"
# 应看到 10 张表（含 users）
```

## 第八步：安装并启动后端

```bash
cd /www/wwwroot/your-domain.com/server
yarn install
```

修改 PM2 配置（如果你的数据库密码不是默认密码）：

```bash
cd /www/wwwroot/your-domain.com
nano ecosystem.config.cjs
```

修改 `DB_PASSWORD` 和 `JWT_SECRET` 为你 `.env` 中设置的值。

启动：

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

验证：

```bash
curl http://127.0.0.1:3000/api/health
# 应输出: {"status":"ok","timestamp":"..."}
```

## 第九步：构建前端

```bash
cd /www/wwwroot/your-domain.com
yarn install
yarn build
```

构建产物在 `build/` 目录。

## 第十步：配置 Nginx

宝塔面板 → **网站** → **添加站点**：

| 字段 | 值 |
|------|-----|
| 域名 | `your-domain.com` 和 `www.your-domain.com` |
| 根目录 | `/www/wwwroot/your-domain.com/build` |
| PHP 版本 | 纯静态 |

然后 **网站** → 你的站点 → **设置** → **配置文件**，替换为：

```nginx
server {
    listen 80;
    server_name your-domain.com www.your-domain.com;
    
    # SSL 配置区域 - 宝塔会在此插入证书
    #error_page 404/404.html;
    
    root /www/wwwroot/your-domain.com/build;
    index index.html;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;
    gzip_min_length 1000;
    gzip_comp_level 6;

    # API 代理
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

    access_log /www/wwwlogs/your-domain.com.log;
    error_log /www/wwwlogs/your-domain.com.error.log;
}
```

保存。

## 第十一步：域名解析

到域名服务商的控制台，添加 DNS 记录：

| 记录类型 | 主机记录 | 记录值 |
|----------|----------|--------|
| A | @ | 你的服务器IP |
| A | www | 你的服务器IP |

生效时间：5 分钟 - 24 小时。

## 第十二步：访问验证

浏览器打开 `http://your-domain.com`，应看到登录页。点击「立即注册」创建账号。

## 第十三步：配置 HTTPS（强烈推荐）

宝塔面板 → **网站** → 你的站点 → **SSL** → **Let's Encrypt** → 选择域名 → 申请。

申请成功后开启 **「强制 HTTPS」**。

## 第十四步：配置 WebHook 自动部署（可选）

### 安装宝塔 WebHook 插件

宝塔面板 → **软件商店** → 搜索「宝塔WebHook」→ 安装。

### 添加 WebHook

打开 WebHook 插件 → 添加 hook：

- 名称：`deploy`
- 执行脚本：

```bash
bash /www/wwwroot/your-domain.com/deploy/pull.sh
```

保存后会生成一个 URL，类似 `https://your-domain.com:11416/hook?access_key=xxx`

### GitHub 端配置

打开 `https://github.com/engrecho/AI-buddy/settings/hooks/new`：

- Payload URL: 宝塔 WebHook URL
- Content type: `application/json`
- SSL verification: **Disable**
- 触发事件: **Just the push event**

点击 **Add webhook**。

测试：

```bash
# 在本地仓库
git commit --allow-empty -m "test webhook"
git push origin main
```

然后到宝塔 WebHook 插件查看日志，应看到自动部署的输出。

## 常见问题

### 部署后访问显示 502 Bad Gateway

后端没有启动。检查：

```bash
pm2 status
pm2 logs ai-buddy-api
```

### 数据库连接失败

检查 `.env` 和 `ecosystem.config.cjs` 中的数据库密码是否正确。

### 静态资源加载失败

确认 Nginx 配置中 `root` 路径正确，`build/` 目录存在：

```bash
ls /www/wwwroot/your-domain.com/build/
```

### WebHook 触发后无反应

1. 确认宝塔 WebHook 插件中的脚本路径正确
2. 确认 GitHub Webhook 的 Recent Deliveries 显示绿色 ✓
3. 查看宝塔 WebHook 日志

### 服务器 SSH 密码忘了

云服务商控制台 → 实例 → 重置密码 → 重启实例。

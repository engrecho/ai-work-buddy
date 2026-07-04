# 故障排查与运维手册

本文档汇总常见问题的排查步骤和运维要点。

## 常用命令速查

```bash
# ── PM2 ──
pm2 status                          # 查看所有进程
pm2 logs ai-buddy-api               # 实时日志
pm2 logs ai-buddy-api --err         # 仅错误日志
pm2 restart ai-buddy-api            # 重启
pm2 stop ai-buddy-api               # 停止
pm2 delete ai-buddy-api             # 删除（下次启动需重新 pm2 start）
pm2 monit                           # 实时监控

# ── Nginx ──
nginx -t                            # 测试配置语法
nginx -s reload                     # 重载配置
systemctl status nginx              # 查看状态
tail -f /www/wwwlogs/你的域名.log
tail -f /www/wwwlogs/你的域名.error.log

# ── MySQL ──
mysql -u buddy -p'密码' buddy       # 连接数据库
mysql -u buddy -p'密码' buddy -e "SHOW PROCESSLIST;"   # 活跃查询
mysqldump -u buddy -p'密码' buddy > backup.sql         # 备份

# ── 系统 ──
df -h                               # 磁盘
free -h                              # 内存
top                                  # 进程
ss -tlnp                            # 监听端口
```

## 常见问题

### 1. 部署后访问显示 502 Bad Gateway

**原因**：后端 Express 进程没有运行。

**排查**：

```bash
pm2 status
pm2 logs ai-buddy-api --lines 50
```

**修复**：

```bash
cd /www/wwwroot/你的域名
pm2 start ecosystem.config.cjs
pm2 save
```

### 2. 部署后访问显示 502 + 「connect ECONNREFUSED 127.0.0.1:3000」

**原因**：后端启动失败，最常见的是数据库连接失败。

**排查日志**：

```bash
pm2 logs ai-buddy-api --err
```

常见错误：

| 错误信息 | 修复 |
|---------|------|
| `ECONNREFUSED 127.0.0.1:3306` | MySQL 未启动或端口不对 |
| `Access denied for user 'buddy'@'localhost'` | 密码错误，检查 `.env` 和 `ecosystem.config.cjs` |
| `Unknown database 'buddy'` | 未创建数据库 |
| `Table 'buddy.tasks' doesn't exist` | 未导入 schema |

### 3. 部署后访问显示 404 Not Found

**原因**：Nginx 找不到 `build/index.html`。

**排查**：

```bash
ls -la /www/wwwroot/你的域名/build/
```

如果 `build/` 目录为空或不存在：

```bash
cd /www/wwwroot/你的域名
yarn build
```

### 4. 注册时提示「用户名已存在」

**原因**：用户名重复。

**查看所有用户**：

```bash
mysql -u buddy -p'密码' buddy -e "SELECT id, username, nickname, created_at FROM users;"
```

**重置用户密码**（先生成 bcrypt 哈希）：

```bash
# 1. 生成哈希（密码 = newpass123）
node -e "console.log(require('bcryptjs').hashSync('newpass123', 10))"

# 2. 更新数据库
mysql -u buddy -p'密码' buddy -e "UPDATE users SET password_hash = '粘贴哈希' WHERE username = '要重置的用户';"
```

### 5. API 请求 401 未授权

**原因**：JWT Token 失效或被清除。

**修复**：

- 浏览器：退出登录重新登录
- API 调用：检查 `Authorization: Bearer xxx` 请求头

### 6. 数据查询不到（明明数据库里有）

**原因**：用户隔离生效，查询自动带上 `user_id` 过滤。

**排查**：

```bash
mysql -u buddy -p'密码' buddy -e "SELECT id, user_id, title FROM tasks;"
```

确认数据的 `user_id` 与当前登录用户 ID 一致。

### 7. WebHook 触发后无反应

**排查**：

1. GitHub 端 `Settings → Webhooks → Recent Deliveries`，看返回码：
   - 200 = 成功
   - 502/503 = 宝塔 WebHook 插件未运行
   - 超时 = 脚本执行超过 30 秒
2. 宝塔 WebHook 插件 → 点击 hook → 查看日志
3. 手动执行脚本测试：

```bash
bash /www/wwwroot/你的域名/deploy/pull.sh
```

### 8. yarn install 报「getaddrinfo ENOTFOUND r.npm.sankuai.com」

**原因**：Yarn registry 指向了内网源。

**修复**：

```bash
yarn config set registry https://registry.npmmirror.com
yarn cache clean
yarn install
```

### 9. git clone 很慢

**原因**：服务器到 GitHub 网络差。

**修复**：使用 GitHub 代理：

```bash
git clone https://gh-proxy.com/https://github.com/engrecho/AI-buddy.git 你的域名
```

### 10. 服务器内存不足，PM2 频繁重启

**原因**：MySQL 占用大量内存。

**优化**：

```bash
# 编辑 MySQL 配置
nano /etc/mysql/mysql.conf.d/mysqld.cnf

# 修改以下参数（2GB 内存推荐）
innodb_buffer_pool_size = 512M
max_connections = 50
```

然后重启 MySQL：

```bash
systemctl restart mysql
```

## 数据备份与恢复

### 每日自动备份

创建 `/www/server/cron/buddy_backup.sh`：

```bash
#!/bin/bash
BACKUP_DIR="/www/backup/buddy"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR
mysqldump -u buddy -p'你的密码' buddy | gzip > $BACKUP_DIR/buddy_$DATE.sql.gz
# 保留最近 30 天的备份
find $BACKUP_DIR -mtime +30 -delete
```

加执行权限：

```bash
chmod +x /www/server/cron/buddy_backup.sh
```

宝塔面板 → **计划任务** → 添加任务：

- 任务类型：Shell 脚本
- 任务名称：buddy-backup
- 执行周期：每天 03:00
- 脚本内容：`/www/server/cron/buddy_backup.sh`

### 手动恢复

```bash
# 解压并恢复
gunzip -c backup_20260702_030000.sql.gz | mysql -u buddy -p'你的密码' buddy
```

## 升级版本

### 通过 WebHook（推荐）

```bash
# 本地仓库
git pull
git push origin main
```

WebHook 触发自动部署。

### 手动升级

```bash
ssh root@你的服务器
cd /www/wwwroot/你的域名
git pull
yarn install
yarn build
cd server && yarn install && cd ..
pm2 restart ai-buddy-api
```

如果数据库结构有变化（如新增表或字段）：

```bash
mysql -u buddy -p'你的密码' buddy < deploy/mysql-schema.sql
```

> ⚠️ 注意：`mysql-schema.sql` 用了 `DROP TABLE`，会清空旧数据。生产环境升级时使用迁移脚本（尚未提供，建议备份后导入）。

## 性能监控

### 启用 MySQL 慢查询日志

```bash
nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

添加：

```ini
slow_query_log = 1
long_query_time = 2
slow_query_log_file = /var/log/mysql/slow.log
```

```bash
systemctl restart mysql
```

### 启用 Nginx 访问日志分析

```bash
# 查看访问量最高的 IP
awk '{print $1}' /www/wwwlogs/你的域名.log | sort | uniq -c | sort -rn | head

# 查看返回 5xx 的请求
grep ' 5[0-9][0-9] ' /www/wwwlogs/你的域名.log | tail
```

## 安全建议

1. **修改 SSH 端口**：不要用 22
2. **禁用 root 远程登录**：创建普通用户，用 sudo
3. **修改宝塔面板端口和访问路径**
4. **修改服务器密码并启用 SSH 密钥登录**
5. **定期更新系统和软件**
6. **不要在代码仓库提交任何密码或密钥**
7. **使用 fail2ban 防暴力破解**

## 紧急联系

如果遇到本文档未覆盖的问题：

1. 查看 PM2 日志
2. 查看 Nginx 错误日志
3. 查看 MySQL 错误日志
4. 提交 GitHub Issue：<https://github.com/engrecho/AI-buddy/issues>

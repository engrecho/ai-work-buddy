# AI-Buddy 私有运维资料

> **本目录不入 Git**（已在 `.gitignore` 屏蔽）。
> 仅本地保留，供项目所有者 & AI 助手查阅。
> **不要把内容贴到 GitHub issue / PR / 公开文档 / 第三方工具**

## 1. 仓库

- 仓库地址：<https://github.com/engrecho/AI-buddy>
- 主分支：`main`
- GitHub PAT：从本地 `~/.git-credentials` 或环境变量 `GITHUB_TOKEN` 读取（不要写进本目录）

## 2. 服务器

- 服务商：腾讯云
- 服务器 IP：`62.234.16.218`
- 主域名：`buddy.bajiaolu.cn`
- 宝塔 WebHook 端口：`11416`
- 项目目录：`/www/wwwroot/buddy.bajiaolu.cn`
- 后端 cwd：`/www/wwwroot/buddy.bajiaolu.cn/server`
- 前端 build 目录：`/www/wwwroot/buddy.bajiaolu.cn/build`
- PM2 进程名：`ai-buddy-api`
- 数据库：MySQL 5.7+/8.0（宝塔安装），库名 `buddy`，用户 `buddy`

### SSH
- 用户名：`root`
- 密码：**从 `~/.ssh_password` 读取**（本地文件，`chmod 600`），不要写进本目录
- 端口：22

> **⚠️ 强烈建议改用 SSH 公私钥**：
> 1. `ssh-keygen -t ed25519`（本地）
> 2. `cat ~/.ssh/id_ed25519.pub` 内容追加到服务器 `~/.ssh/authorized_keys`
> 3. 服务器 `sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config && systemctl restart sshd`
> 4. 之后再把 root 密码完全忘掉

### 数据库密码 / JWT_SECRET
- 实际值在服务器 `/www/wwwroot/buddy.bajiaolu.cn/.env`
- 通过 SSH 读：
  ```bash
  ssh root@62.234.16.218 'cat /www/wwwroot/buddy.bajiaolu.cn/.env'
  ```

## 3. 飞书 Wiki

- 关键信息源：<https://my.feishu.cn/wiki/ZZVOw3QA5isFd9k4ncUcJfHpnmc>
- 飞书 wiki 需登录态，AI 助手 WebFetch 不可达
- 本地等价文档（已同步在仓库）：
  - `docs/V61-20260630-2300.md` — V61 重大变更
  - `docs/DATABASE.md` — 数据库设计
  - `docs/DEVELOPMENT.md` — 开发指南
  - `docs/DEPLOY_BAOTA.md` — 宝塔部署步骤
  - `docs/TROUBLESHOOTING.md` — 故障排查

## 4. 部署流程

- 触发：push 到 `main` → GitHub Webhook → 宝塔 `11416` 端口 → `deploy/pull.sh`
- pull.sh 步骤（自动）：
  1. `git fetch --all && git reset --hard origin/main`
  2. `yarn install`（前端）
  3. `yarn build`
  4. `yarn install`（后端）
  5. `pm2 restart ai-buddy-api`
  6. 增量 SQL 迁移（扫 `deploy/migrate-*.sql`，用 `.applied_migrations` 去重，幂等执行）

## 5. 常用命令速查

```bash
# SSH 登录
ssh root@62.234.16.218

# 看后端日志
ssh root@62.234.16.218 'pm2 logs ai-buddy-api --lines 100'

# 看部署日志
ssh root@62.234.16.218 'tail -f /www/wwwlogs/buddy-deploy.log'

# 看 Webhook 日志（宝塔面板 → 软件商店 → 宝塔 WebHook → 日志）

# 手动重跑部署
ssh root@62.234.16.218 'bash /www/wwwroot/buddy.bajiaolu.cn/deploy/pull.sh'

# 查看数据库 reading_items 表大小
ssh root@62.234.16.218 'mysql -u buddy -p buddy -e "SELECT COUNT(*) FROM reading_items;"'

# 端到端验证 extract 接口
curl -X POST https://buddy.bajiaolu.cn/api/extract \
  -H "Content-Type: application/json" \
  -d '{"input":"https://v.douyin.com/abc"}'
```

## 6. 凭证（仅本地，不上传任何远端）

- **GitHub PAT** 从 `~/.git-credentials` 读（用 `git config --global credential.helper osxkeychain` 走 keychain 加密）
- **服务器 root 密码** 写在本机 `~/.ssh_password`（`chmod 600`），AI 助手通过 `expect` 脚本读
- **API Key**（buddy-skill / API v1）：每个用户独立生成，存 `~/.buddy-skill/config.json`，不在本目录管理

#!/bin/bash
# ============================================================
# AI-Buddy - 宝塔 WebHook 自动部署脚本
# 
# 使用方式:
#   1. 在宝塔 WebHook 插件中创建 hook
#   2. 执行脚本内容填写: bash /www/wwwroot/buddy.bajiaolu.cn/deploy/pull.sh
#   3. GitHub Webhook 指向宝塔生成的 URL
# ============================================================

set -e

# ── 配置 ─────────────────────────────────────────────────────
PROJECT_DIR="/www/wwwroot/buddy.bajiaolu.cn"
REPO_BRANCH="main"
LOG_FILE="/www/wwwlogs/buddy-deploy.log"

# ── 日志函数 ─────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# ── 主流程 ───────────────────────────────────────────────────
cd "$PROJECT_DIR" || {
  log "ERROR: 项目目录不存在 $PROJECT_DIR"
  exit 1
}

log "========== 开始自动部署 =========="

# 1. 拉取最新代码
log "[1/5] 拉取 Git 代码..."
git fetch --all
git reset --hard "origin/$REPO_BRANCH"
CURRENT_COMMIT=$(git rev-parse --short HEAD)
log "当前版本: $CURRENT_COMMIT"

# 2. 安装前端依赖
log "[2/5] 安装前端依赖..."
yarn install --silent

# 3. 构建前端
log "[3/5] 构建前端..."
yarn build
log "build 目录内容:"
ls -la "$PROJECT_DIR/build/" | head -5

# 4. 安装后端依赖
log "[4/5] 安装后端依赖..."
cd "$PROJECT_DIR/server"
yarn install --silent
cd "$PROJECT_DIR"

# 5. 重启后端服务
log "[5/5] 重启 PM2 后端服务..."
pm2 restart ai-buddy-api 2>/dev/null || pm2 start ecosystem.config.cjs
pm2 save

log "========== 部署完成 ($CURRENT_COMMIT) =========="

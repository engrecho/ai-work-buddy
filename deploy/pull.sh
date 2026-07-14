#!/bin/bash
# ============================================================
# AI-Buddy - Webhook 自动部署脚本（两阶段架构）
#
# 工作流程:
#   GitHub push → 宝塔 Webhook → 本脚本
#
#   Phase 1: 从 GitHub 拉取最新代码
#   Phase 2: 执行部署任务
#     2.1 安装依赖（前端 + 后端）
#     2.2 构建前端
#     2.3 重启 PM2 后端
#     2.4 SQL 迁移（增量，已执行的跳过）
#     2.5 一次性运维任务（deploy/once/*.sh，已执行的跳过）
#     2.6 同步 Skills + 打包 buddy-skill
#
# 一次性任务（核心机制）:
#   把脚本放到 deploy/once/ 下，push 到 GitHub 即可
#   本脚本会自动执行，成功后记入 .done 永久跳过
#   脚本里可用环境变量: PROJECT_DIR / DB_USER / DB_PASSWORD / DB_NAME / NVM_DIR
#
# 使用方式:
#   1. 在宝塔 WebHook 插件中创建 hook
#   2. 执行脚本内容: bash /www/wwwroot/buddy.bajiaolu.cn/deploy/pull.sh
#   3. GitHub Webhook 指向宝塔生成的 URL
#
# 服务器初始配置（只需执行一次）:
#   cd /www/wwwroot/buddy.bajiaolu.cn
#   git remote set-url origin https://github.com/engrecho/AI-buddy.git
#   # 如果服务器访问不了 GitHub，用代理:
#   git remote set-url origin https://ghproxy.com/https://github.com/engrecho/AI-buddy.git
# ============================================================

# 不用 set -e，让单步失败不阻断后续任务
set -uo pipefail

# ── 加载 nvm（非交互 SSH 环境下 yarn/node 不在 PATH）─────────
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# ── 配置 ─────────────────────────────────────────────────────
PROJECT_DIR="/www/wwwroot/buddy.bajiaolu.cn"
REPO_BRANCH="main"
LOG_FILE="/www/wwwlogs/buddy-deploy.log"
GITHUB_SSH_REMOTE="git@github.com:engrecho/AI-buddy.git"
GITHUB_HTTPS_REMOTE="https://github.com/engrecho/AI-buddy.git"
GITHUB_PROXY_REMOTE="https://ghproxy.com/https://github.com/engrecho/AI-buddy.git"

# ── 加载 .env（拿 DB 凭据，供 migrate / once 任务用）──────────
DB_USER="${DB_USER:-buddy}"
DB_NAME="${DB_NAME:-buddy}"
DB_PASSWORD="${DB_PASSWORD:-}"
if [ -z "$DB_PASSWORD" ]; then
  for envfile in "$PROJECT_DIR/.env" "$PROJECT_DIR/server/.env"; do
    if [ -f "$envfile" ]; then
      set -a; . "$envfile"; set +a
      break
    fi
  done
  DB_USER="${DB_USER:-buddy}"
  DB_NAME="${DB_NAME:-buddy}"
  DB_PASSWORD="${DB_PASSWORD:-}"
fi

# 导出给 once 子脚本用
export PROJECT_DIR DB_USER DB_PASSWORD DB_NAME NVM_DIR

# ── 部署状态记录 ─────────────────────────────────────────────
# 通过 record-status.js 维护 deploy/.last-deploy.json
# 后端 /api/deploy/status 接口读取此文件返回部署执行情况
RECORD_STATUS="$PROJECT_DIR/deploy/record-status.js"
ONCE_LOG_DIR="$PROJECT_DIR/deploy/once/.logs"
mkdir -p "$ONCE_LOG_DIR"

STEP_START=0
step_begin() { STEP_START=$(date +%s%3N); }
step_done() {
  local name="$1" status="$2" err="${3:-}"
  local dur=$(( $(date +%s%3N) - STEP_START ))
  node "$RECORD_STATUS" step "$name" "$status" "$dur" "$err" 2>/dev/null || true
}

# ── 日志函数 ─────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# ── 进入项目目录 ─────────────────────────────────────────────
cd "$PROJECT_DIR" || {
  log "ERROR: 项目目录不存在 $PROJECT_DIR"
  exit 1
}

log "============================================"
log "========== 开始自动部署 =========="
log "============================================"

# ============================================================
# Phase 1: 从 GitHub 拉取最新代码
# ============================================================
log ""
log "========== Phase 1: 拉取代码 =========="

# 1.0 确保 git remote 使用 HTTPS（不用 SSH，避免密钥问题）
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
if echo "$CURRENT_REMOTE" | grep -q "^git@github.com"; then
  log "  检测到 SSH 远程地址，切换为 HTTPS..."
  git remote set-url origin "$GITHUB_HTTPS_REMOTE"
  log "  ✓ 已切换为 HTTPS"
fi

# 1.1 尝试拉取代码（直连 → 代理 fallback）
GIT_OK=false

step_begin
log "  → 尝试直连 GitHub..."
if git fetch --all 2>>"$LOG_FILE"; then
  GIT_OK=true
  log "  ✓ 直连成功"
else
  log "  ✗ 直连失败，尝试 ghproxy 代理..."
  SAVED_REMOTE=$(git remote get-url origin)
  git remote set-url origin "$GITHUB_PROXY_REMOTE"
  if git fetch --all 2>>"$LOG_FILE"; then
    GIT_OK=true
    log "  ✓ 代理拉取成功"
  else
    log "  ✗ 代理也失败"
  fi
  # 恢复为 HTTPS（下次直连再试）
  git remote set-url origin "$GITHUB_HTTPS_REMOTE"
fi

if [ "$GIT_OK" = false ]; then
  step_done "git_pull" "failed" "无法从 GitHub 拉取代码"
  log "  ✗ 无法从 GitHub 拉取代码，终止部署"
  log "  提示: 检查服务器网络 / GitHub 状态 / 代理可用性"
  exit 1
fi
step_done "git_pull" "success"

# 1.2 强制同步到远程版本
git reset --hard "origin/$REPO_BRANCH"
CURRENT_COMMIT=$(git rev-parse --short HEAD)
COMMIT_MSG=$(git log -1 --format='%s')
COMMIT_AUTHOR=$(git log -1 --format='%an')
COMMIT_TIME=$(git log -1 --format='%ci')
log "  当前版本: $CURRENT_COMMIT"
log "  提交信息: $COMMIT_MSG"
log "  作者: $COMMIT_AUTHOR  时间: $COMMIT_TIME"

# 初始化部署状态记录
node "$RECORD_STATUS" start "$CURRENT_COMMIT" "$COMMIT_MSG" "$COMMIT_AUTHOR" "$COMMIT_TIME" 2>/dev/null || true

log "========== Phase 1 完成 ✅ =========="
log ""

# ============================================================
# Phase 2: 执行部署任务
# ============================================================
log "========== Phase 2: 部署任务 =========="

# ── 2.1 安装依赖 ─────────────────────────────────────────────
log ""
log "[2.1] 安装前端依赖..."
step_begin
if yarn install --silent 2>>"$LOG_FILE"; then
  log "  ✓ 前端依赖安装完成"
  step_done "install_frontend" "success"
else
  log "  ✗ 前端依赖安装失败（继续执行后续步骤）"
  step_done "install_frontend" "failed" "yarn install 失败"
fi

log "[2.1] 安装后端依赖..."
step_begin
cd "$PROJECT_DIR/server"
if yarn install --silent 2>>"$LOG_FILE"; then
  log "  ✓ 后端依赖安装完成"
  step_done "install_backend" "success"
else
  log "  ✗ 后端依赖安装失败（继续执行后续步骤）"
  step_done "install_backend" "failed" "yarn install 失败"
fi
cd "$PROJECT_DIR"

# ── 2.2 构建前端 ─────────────────────────────────────────────
log ""
log "[2.2] 构建前端..."
step_begin
if yarn build 2>>"$LOG_FILE"; then
  log "  ✓ 构建完成"
  log "  build 目录: $(ls "$PROJECT_DIR/build/" 2>/dev/null | head -5 | tr '\n' ' ')"
  step_done "build_frontend" "success"
else
  log "  ✗ 构建失败（继续执行后续步骤）"
  step_done "build_frontend" "failed" "yarn build 失败"
fi

# ── 2.3 重启 PM2 后端 ─────────────────────────────────────────
log ""
log "[2.3] 重启 PM2 后端服务..."
step_begin
# cluster 模式下 pm2 reload 可能缓存旧代码，用 delete + start 彻底重启
pm2 delete ai-buddy-api 2>/dev/null || true
if pm2 start ecosystem.config.cjs --update-env 2>>"$LOG_FILE"; then
  pm2 save 2>/dev/null
  log "  ✓ PM2 重启完成"
  # 验证启动
  sleep 2
  HEALTH=$(curl -s --max-time 5 http://127.0.0.1:3000/api/health 2>/dev/null)
  if [ -n "$HEALTH" ]; then
    log "  ✓ 后端已启动: $HEALTH"
    step_done "pm2_restart" "success"
  else
    log "  ⚠ 后端 5 秒后仍无响应，请检查 pm2 logs"
    step_done "pm2_restart" "failed" "后端无响应"
  fi
else
  log "  ✗ PM2 重启失败"
  step_done "pm2_restart" "failed" "pm2 start 失败"
fi

# ── 2.4 SQL 迁移（增量）──────────────────────────────────────
log ""
log "[2.4] SQL 迁移..."
MIGRATE_DIR="$PROJECT_DIR/deploy"
APPLIED_FILE="$MIGRATE_DIR/.applied_migrations"
touch "$APPLIED_FILE"
MIGRATE_COUNT=0
MIGRATE_FAIL=0

step_begin
shopt -s nullglob
for sql_file in "$MIGRATE_DIR"/migrate-*.sql; do
  fname=$(basename "$sql_file")
  if ! grep -qx "$fname" "$APPLIED_FILE" 2>/dev/null; then
    log "  → 应用迁移: $fname"
    if mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$sql_file" 2>>"$LOG_FILE"; then
      echo "$fname" >> "$APPLIED_FILE"
      log "    ✓ $fname 成功"
      MIGRATE_COUNT=$((MIGRATE_COUNT + 1))
      node "$RECORD_STATUS" migrate-detail "$fname" "success" 2>/dev/null || true
    else
      log "    ✗ $fname 失败（查看 $LOG_FILE）"
      MIGRATE_FAIL=$((MIGRATE_FAIL + 1))
      node "$RECORD_STATUS" migrate-detail "$fname" "failed" 2>/dev/null || true
    fi
  else
    log "  · $fname 已应用，跳过"
  fi
done
shopt -u nullglob
log "  本次迁移: $MIGRATE_COUNT 个成功, $MIGRATE_FAIL 个失败"
node "$RECORD_STATUS" migrate "$MIGRATE_COUNT" "$MIGRATE_FAIL" 2>/dev/null || true
step_done "sql_migrate" "success"

# ── 2.5 一次性运维任务 ────────────────────────────────────────
log ""
log "[2.5] 一次性运维任务 (deploy/once/*.sh)..."
ONCE_DIR="$PROJECT_DIR/deploy/once"
ONCE_DONE="$ONCE_DIR/.done"
mkdir -p "$ONCE_DIR" "$ONCE_LOG_DIR"
touch "$ONCE_DONE"
ONCE_COUNT=0

shopt -s nullglob
for task_file in "$ONCE_DIR"/*.sh; do
  fname=$(basename "$task_file")
  if ! grep -qx "$fname" "$ONCE_DONE" 2>/dev/null; then
    log "  → 执行: $fname"
    ONCE_TASK_LOG="$ONCE_LOG_DIR/${fname}.log"
    ONCE_TASK_START=$(date +%s%3N)
    # 输出同时写入独立日志（供接口返回）和主部署日志
    if bash "$task_file" > "$ONCE_TASK_LOG" 2>&1; then
      cat "$ONCE_TASK_LOG" >> "$LOG_FILE"
      echo "$fname" >> "$ONCE_DONE"
      log "    ✓ $fname 成功"
      ONCE_COUNT=$((ONCE_COUNT + 1))
      ONCE_DUR=$(( $(date +%s%3N) - ONCE_TASK_START ))
      node "$RECORD_STATUS" once "$fname" "success" "$ONCE_DUR" "$ONCE_TASK_LOG" 2>/dev/null || true
    else
      cat "$ONCE_TASK_LOG" >> "$LOG_FILE"
      log "    ✗ $fname 失败（下次部署会重试）"
      ONCE_DUR=$(( $(date +%s%3N) - ONCE_TASK_START ))
      node "$RECORD_STATUS" once "$fname" "failed" "$ONCE_DUR" "$ONCE_TASK_LOG" 2>/dev/null || true
    fi
  else
    log "  · $fname 已执行，跳过"
  fi
done
shopt -u nullglob
log "  本次执行一次性任务: $ONCE_COUNT 个"
step_done "once_tasks" "success"

# ── 2.6 同步 Skills + 打包 buddy-skill ────────────────────────
log ""
log "[2.6] 同步 Skills + 打包 buddy-skill..."
step_begin

# 同步 Skills 到 openclaw
if [ -f "$PROJECT_DIR/deploy/sync-skills.sh" ]; then
  log "  → 同步 skills..."
  if bash "$PROJECT_DIR/deploy/sync-skills.sh" >> "$LOG_FILE" 2>&1; then
    log "    ✓ skills 同步完成"
  else
    log "    ✗ sync-skills 失败（已记录到 $LOG_FILE）"
  fi
else
  log "  · sync-skills.sh 不存在，跳过"
fi

# 打包 buddy-skill
log "  → 打包 buddy-skill..."
SKILL_TARBALL="$PROJECT_DIR/build/buddy-skill.tar.gz"
if tar -czf "$SKILL_TARBALL" \
  --exclude='.git' --exclude='node_modules' --exclude='._*' --exclude='.DS_Store' \
  buddy-skill/ 2>>"$LOG_FILE"; then
  SKILL_SIZE=$(du -h "$SKILL_TARBALL" | cut -f1)
  log "    ✓ buddy-skill.tar.gz ($SKILL_SIZE)"
  log "    下载: https://buddy.bajiaolu.cn/buddy-skill.tar.gz"

  # 生成版本号文件
  SKILL_VERSION=$(node -p "require('./buddy-skill/package.json').version" 2>/dev/null)
  if [ -n "$SKILL_VERSION" ]; then
    echo "$SKILL_VERSION" > "$PROJECT_DIR/build/buddy-skill.version"
    log "    ✓ 版本号: $SKILL_VERSION"
  fi
else
  log "    ✗ 打包失败"
fi
step_done "skills_sync" "success"

# ── 记录部署完成状态 ──────────────────────────────────────────
node "$RECORD_STATUS" end 2>/dev/null || true

# ============================================================
log ""
log "============================================"
log "========== 全部完成 ($CURRENT_COMMIT) =========="
log "============================================"

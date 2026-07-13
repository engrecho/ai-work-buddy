#!/bin/bash
# ============================================================
# AI-Buddy - 宝塔 WebHook 自动部署脚本（完整部署）
#
# 触发方式：GitHub push → 宝塔 WebHook → 本脚本
# 完成动作：git pull → yarn install → yarn build → PM2 重启 → SQL 迁移 → skills 同步
#
# 使用方式:
#   1. 在宝塔 WebHook 插件中创建 hook
#   2. 执行脚本内容填写: bash /www/wwwroot/buddy.bajiaolu.cn/deploy/pull.sh
#   3. GitHub Webhook 指向宝塔生成的 URL
#
# 一次性运维任务（修复数据 / 添加配置 / 清理等）：
#   把任务脚本放到 deploy/once/ 下，push 即可，本脚本部署完会自动执行
#   成功后记入 deploy/once/.done 永久跳过（和 SQL 迁移同思路）
#   脚本里可用环境变量：PROJECT_DIR / DB_USER / DB_PASSWORD / DB_NAME
# ============================================================

set -e

# ── 加载 nvm（非交互 SSH 环境下 yarn/node 不在 PATH） ─────────
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"

# ── 配置 ─────────────────────────────────────────────────────
PROJECT_DIR="/www/wwwroot/buddy.bajiaolu.cn"
REPO_BRANCH="main"
LOG_FILE="/www/wwwlogs/buddy-deploy.log"

# ── 加载 .env（拿 DB 凭据，供 migrate / once 任务用） ─────────
DB_USER="${DB_USER:-buddy}"
DB_NAME="${DB_NAME:-buddy}"
DB_PASSWORD="${DB_PASSWORD:-}"
if [ -z "$DB_PASSWORD" ]; then
  if [ -f "$PROJECT_DIR/.env" ]; then
    set -a; . "$PROJECT_DIR/.env"; set +a
  elif [ -f "$PROJECT_DIR/server/.env" ]; then
    set -a; . "$PROJECT_DIR/server/.env"; set +a
  fi
  DB_USER="${DB_USER:-buddy}"
  DB_NAME="${DB_NAME:-buddy}"
  DB_PASSWORD="${DB_PASSWORD:-}"
fi

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
log "[1/8] 拉取 Git 代码..."
git fetch --all
git reset --hard "origin/$REPO_BRANCH"
CURRENT_COMMIT=$(git rev-parse --short HEAD)
log "当前版本: $CURRENT_COMMIT"

# 2. 安装前端依赖
log "[2/8] 安装前端依赖..."
yarn install --silent

# 3. 构建前端
log "[3/8] 构建前端..."
yarn build
log "build 目录内容:"
ls -la "$PROJECT_DIR/build/" | head -5

# 4. 安装后端依赖
log "[4/8] 安装后端依赖..."
cd "$PROJECT_DIR/server"
yarn install --silent
cd "$PROJECT_DIR"

# 5. 重启后端服务
# 注意：cluster 模式下 pm2 reload 可能缓存旧代码，必须用 delete + start 彻底重启
log "[5/8] 重启 PM2 后端服务..."
pm2 delete ai-buddy-api 2>/dev/null || true
pm2 start ecosystem.config.cjs --update-env
pm2 save

# 6. 增量 SQL 迁移（如果存在）：只跑标记为 migrate-*.sql 且尚未执行过的
log "[6/8] 检查 SQL 迁移..."
MIGRATE_DIR="$PROJECT_DIR/deploy"
APPLIED_FILE="$MIGRATE_DIR/.applied_migrations"

touch "$APPLIED_FILE"

shopt -s nullglob
for sql_file in "$MIGRATE_DIR"/migrate-*.sql; do
  fname=$(basename "$sql_file")
  if ! grep -qx "$fname" "$APPLIED_FILE" 2>/dev/null; then
    log "  → 应用迁移: $fname"
    if mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$sql_file" 2>>"$LOG_FILE"; then
      echo "$fname" >> "$APPLIED_FILE"
      log "    ✓ $fname 成功"
    else
      log "    ✗ $fname 失败，查看 $LOG_FILE"
    fi
  fi
done
shopt -u nullglob

log "========== 部署完成 ($CURRENT_COMMIT) =========="

# 7. 同步 Skills 到 /root/.openclaw/workspace/skills/
log "[7/9] 同步 Skills 到 openclaw..."
bash "$PROJECT_DIR/deploy/sync-skills.sh" >> "$LOG_FILE" 2>&1 || {
  log "  ✗ sync-skills.sh 失败（已记录到 $LOG_FILE）"
}

# 8. 打包 buddy-skill 供外部下载部署
log "[8/9] 打包 buddy-skill..."
SKILL_TARBALL="$PROJECT_DIR/build/buddy-skill.tar.gz"
cd "$PROJECT_DIR"
tar -czf "$SKILL_TARBALL" \
  --exclude='.git' --exclude='node_modules' --exclude='._*' --exclude='.DS_Store' \
  buddy-skill/
SKILL_SIZE=$(du -h "$SKILL_TARBALL" | cut -f1)
log "  ✓ 打包完成: buddy-skill.tar.gz ($SKILL_SIZE)"
log "  下载链接: https://buddy.bajiaolu.cn/buddy-skill.tar.gz"
# 生成版本号文件(供 buddy-skill 自更新核对)
SKILL_VERSION=$(node -p "require('./buddy-skill/package.json').version" 2>/dev/null)
if [ -n "$SKILL_VERSION" ]; then
  echo "$SKILL_VERSION" > "$PROJECT_DIR/build/buddy-skill.version"
  log "  ✓ 版本号: $SKILL_VERSION (buddy-skill.version)"
fi

# 9. 一次性运维任务（deploy/once/*.sh）
#    机制：每次部署后扫描此目录，未在 .done 里记录的任务会被执行，
#          成功后写入 .done 永久跳过（和 SQL 迁移同样的去重思路）。
#    用法：AI 在本地 deploy/once/ 下创建 NN-xxx.sh → push → webhook 自动拉取执行
#    注意：脚本里可用环境变量 PROJECT_DIR / DB_USER / DB_PASSWORD / DB_NAME / NVM_DIR
log "[9/9] 一次性运维任务..."
ONCE_DIR="$PROJECT_DIR/deploy/once"
ONCE_DONE="$ONCE_DIR/.done"
mkdir -p "$ONCE_DIR"
touch "$ONCE_DONE"
shopt -s nullglob
ONCE_COUNT=0
for task_file in "$ONCE_DIR"/*.sh; do
  fname=$(basename "$task_file")
  if ! grep -qx "$fname" "$ONCE_DONE" 2>/dev/null; then
    log "  → 执行: $fname"
    # 导出环境变量给子脚本用
    export PROJECT_DIR DB_USER DB_PASSWORD DB_NAME NVM_DIR
    if bash "$task_file" >> "$LOG_FILE" 2>&1; then
      echo "$fname" >> "$ONCE_DONE"
      log "    ✓ $fname 成功"
      ONCE_COUNT=$((ONCE_COUNT + 1))
    else
      log "    ✗ $fname 失败（查看 $LOG_FILE，下次部署会重试）"
    fi
  else
    log "  · $fname 已执行，跳过"
  fi
done
shopt -u nullglob
log "  一次性任务本次执行 $ONCE_COUNT 个"

log "========== 全部完成 =========="

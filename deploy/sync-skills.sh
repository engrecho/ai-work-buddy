#!/bin/bash
# ============================================================
# AI-buddy / ExtractVideoSkill 同步脚本
#
# 作用：
#   1. ExtractVideoSkill 仓库（https://github.com/engrecho/ExtractVideoSkill）
#      → 拉一份到 /www/wwwroot/_git/ExtractVideoSkill/（bare clone）
#      → rsync 到 /root/.openclaw/workspace/skills/ExtractVideoSkill/
#   2. AI-buddy 仓库的 buddy-skill/ 子目录
#      → 软链到 /root/.openclaw/workspace/skills/buddy-skill/
#         （AI-buddy 仓库已 deploy 到 /www/wwwroot/buddy.bajiaolu.cn/，
#           所以直接 symlink 即可保证两者强一致）
#
# 设计：
#   - 可被 pull.sh 在末尾调用（与 AI-buddy 主部署同步触发）
#   - 也可单独跑（手动同步）
#   - 失败不阻塞主部署（set +e），但要写日志
# ============================================================

set +e  # 失败不立刻退出，便于日志记录

# ── 配置 ─────────────────────────────────────────────────────
LOG_FILE="/www/wwwlogs/buddy-deploy.log"
SKILLS_DIR="/root/.openclaw/workspace/skills"
PROJECT_DIR="/www/wwwroot/buddy.bajiaolu.cn"
GIT_MIRROR_DIR="/var/cache/git-mirrors"

EXTRACT_REPO="https://gh-proxy.com/https://github.com/engrecho/ExtractVideoSkill.git"
EXTRACT_BRANCH="main"
EXTRACT_DIR_NAME="ExtractVideoSkill"

BUDDY_SKILL_SRC="$PROJECT_DIR/buddy-skill"
BUDDY_SKILL_DST="$SKILLS_DIR/buddy-skill"

# ── 日志函数 ─────────────────────────────────────────────────
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] [sync-skills] $1" >> "$LOG_FILE"
}

log "========== 同步 Skills =========="

# ── Git 代理配置（国内服务器访问 GitHub） ─────────────────────
# 让所有 https://github.com/ 的请求自动走 gh-proxy.com 代理
git config --global url."https://gh-proxy.com/https://github.com/".insteadOf "https://github.com/" 2>/dev/null
log "git 全局代理: github.com → gh-proxy.com"

# 确保目标目录存在
mkdir -p "$SKILLS_DIR"
mkdir -p "$GIT_MIRROR_DIR"

# ── 1) ExtractVideoSkill 同步 ────────────────────────────────
log "[1/2] 同步 ExtractVideoSkill → $SKILLS_DIR/$EXTRACT_DIR_NAME"

# 1.1 拉一份 bare mirror（避免污染 AI-buddy 仓库的 git config）
MIRROR="$GIT_MIRROR_DIR/${EXTRACT_DIR_NAME}.git"
if [ ! -d "$MIRROR" ]; then
  log "  → 首次 clone: $EXTRACT_REPO"
  git clone --bare --depth 1 --branch "$EXTRACT_BRANCH" "$EXTRACT_REPO" "$MIRROR" \
    >> "$LOG_FILE" 2>&1
else
  log "  → fetch + reset"
  # bare repo 不一定有 origin/xxx remote ref，用 FETCH_HEAD 兜底
  git --git-dir="$MIRROR" fetch --depth 1 origin "$EXTRACT_BRANCH" >> "$LOG_FILE" 2>&1
  git --git-dir="$MIRROR" update-ref "refs/heads/$EXTRACT_BRANCH" "FETCH_HEAD" >> "$LOG_FILE" 2>&1
  git --git-dir="$MIRROR" --work-tree=/tmp/empty_"$$" \
    --git-dir="$MIRROR" symbolic-ref HEAD "refs/heads/$EXTRACT_BRANCH" 2>/dev/null || true
fi

# 1.2 rsync 到目标（--delete 保证旧文件被清掉）
DEST="$SKILLS_DIR/$EXTRACT_DIR_NAME"
mkdir -p "$DEST"
# 把 bare mirror 的工作树导出到临时目录，再 rsync
TMP_WT=$(mktemp -d)
git --git-dir="$MIRROR" archive "HEAD" | tar -x -C "$TMP_WT" >> "$LOG_FILE" 2>&1
# 过滤掉 macOS 噪音 + .git
rsync -a --delete \
  --exclude='.git' --exclude='.git/' --exclude='._*' --exclude='.DS_Store' \
  "$TMP_WT"/ "$DEST"/ >> "$LOG_FILE" 2>&1
rm -rf "$TMP_WT"

if [ -f "$DEST/SKILL.md" ]; then
  chmod 755 "$DEST" 2>/dev/null
  find "$DEST" -type d -exec chmod 755 {} \; 2>/dev/null
  find "$DEST" -type f -exec chmod 644 {} \; 2>/dev/null
  log "  ✓ $DEST/SKILL.md 已就绪"
else
  log "  ✗ $DEST/SKILL.md 缺失（rsync 可能失败）"
fi

# 1.3 同时保留 /root/.workbuddy/skills/ 软链（保持旧依赖兼容 + 新 skill name）
mkdir -p /root/.workbuddy/skills
ln -sfn "$DEST" "/root/.workbuddy/skills/ExtractVideoSkill"
ln -sfn "$DEST" "/root/.workbuddy/skills/greenvideo-extract"
ln -sfn "$DEST" "/root/.workbuddy/skills/all-platform-video-extract"
log "  ✓ /root/.workbuddy/skills/{ExtractVideoSkill,greenvideo-extract,all-platform-video-extract} symlink 已刷新"

# ── 2) buddy-skill 同步 ─────────────────────────────────────
log "[2/2] 同步 buddy-skill → $BUDDY_SKILL_DST"

if [ ! -d "$BUDDY_SKILL_SRC" ]; then
  log "  ✗ $BUDDY_SKILL_SRC 不存在（AI-buddy 还没拉？）"
else
  # 软链策略：buddy-skill 物理目录在 $PROJECT_DIR/buddy-skill/，
  # openclaw skills 目录里用一个 symlink 指过去，强一致。
  rm -rf "$BUDDY_SKILL_DST"
  ln -sfn "$BUDDY_SKILL_SRC" "$BUDDY_SKILL_DST"
  if [ -f "$BUDDY_SKILL_DST/SKILL.md" ]; then
    log "  ✓ $BUDDY_SKILL_DST → $BUDDY_SKILL_SRC (软链)"
  else
    log "  ✗ 软链创建后 SKILL.md 不可访问"
  fi
fi

log "========== 同步完成 =========="

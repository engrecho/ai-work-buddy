#!/bin/bash
# ============================================================
# 任务：添加 jiqizhixin RSS 订阅源（user_id=1, jaylon）
# 触发：由 pull.sh 的 once 机制自动执行，成功后记入 .done 永久跳过
# 后续：后端 RSS 定时器（每 30 分钟）会自动抓取文章
# ============================================================

set -e

RSS_URL="https://www.jiqizhixin.com/rss"
RSS_NAME="机器之心"
RSS_COLOR="#6366f1"
RSS_DESC="AI 资讯"

echo "[once] 开始添加 RSS 源: $RSS_URL"

# 1. 检查 rss_sources 表是否存在
TABLE_EXISTS=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='$DB_NAME' AND table_name='rss_sources'
" 2>/dev/null)

if [ "$TABLE_EXISTS" != "1" ]; then
  echo "[once] ✗ rss_sources 表不存在，请先执行 migrate-add-rss.sql"
  exit 1
fi

# 2. 检查是否已存在（user_id=1）
EXISTING_ID=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "
  SELECT id FROM rss_sources WHERE url='$RSS_URL' AND user_id=1 LIMIT 1
" 2>/dev/null)

if [ -n "$EXISTING_ID" ]; then
  echo "[once] RSS 源已存在 (id=$EXISTING_ID)，无需重复添加"
  exit 0
fi

# 3. 插入
mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
  INSERT INTO rss_sources (user_id, name, url, color, description, last_status)
  VALUES (1, '$RSS_NAME', '$RSS_URL', '$RSS_COLOR', '$RSS_DESC', 'pending')
" 2>/dev/null

NEW_ID=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "SELECT LAST_INSERT_ID()" 2>/dev/null)

echo "[once] ✓ RSS 源已添加: id=$NEW_ID, name=$RSS_NAME, url=$RSS_URL"
echo "[once] 后端定时器将在启动后 10 秒内自动抓取首批文章"

exit 0

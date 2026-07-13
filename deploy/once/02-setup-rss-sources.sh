#!/bin/bash
# ============================================================
# 任务：清理失效的 jiqizhixin RSS 源 + 添加可用的 36kr 测试源
#
# 背景：https://www.jiqizhixin.com/rss 已失效（302 重定向到 /data-service HTML 页面）
#       替换为 https://36kr.com/feed（标准 RSS 2.0，内容丰富，已验证可解析）
#
# 幂等：重复执行不会产生副作用（删除不存在的源不会报错，添加已存在的源会跳过）
# 触发：由 pull.sh 的 once 机制自动执行，成功后记入 .done
# ============================================================

set -e

echo "[once] 开始配置 RSS 测试源"

# 1. 检查 rss_sources 表是否存在
TABLE_EXISTS=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema='$DB_NAME' AND table_name='rss_sources'
" 2>/dev/null)

if [ "$TABLE_EXISTS" != "1" ]; then
  echo "[once] ✗ rss_sources 表不存在，请先执行 migrate-add-rss.sql"
  exit 1
fi

# 2. 删除失效的 jiqizhixin 源（如果存在）
DELETED=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "
  SELECT COUNT(*) FROM rss_sources WHERE url LIKE '%jiqizhixin%'
" 2>/dev/null)

if [ "$DELETED" != "0" ]; then
  mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
    DELETE FROM rss_sources WHERE url LIKE '%jiqizhixin%'
  " 2>/dev/null
  echo "[once] ✓ 已删除 $DELETED 个失效的 jiqizhixin 源（rss_articles 会被外键级联删除）"
else
  echo "[once] · jiqizhixin 源不存在，无需清理"
fi

# 3. 添加 36kr 源（如果不存在）
KR_URL="https://36kr.com/feed"
KR_NAME="36氪"
KR_COLOR="#0061ff"
KR_DESC="36氪 - 商业科技资讯"

EXISTING_ID=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "
  SELECT id FROM rss_sources WHERE url='$KR_URL' AND user_id=1 LIMIT 1
" 2>/dev/null)

if [ -n "$EXISTING_ID" ]; then
  echo "[once] · 36kr 源已存在 (id=$EXISTING_ID)，无需重复添加"
else
  mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
    INSERT INTO rss_sources (user_id, name, url, color, description, last_status)
    VALUES (1, '$KR_NAME', '$KR_URL', '$KR_COLOR', '$KR_DESC', 'pending')
  " 2>/dev/null
  NEW_ID=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "SELECT LAST_INSERT_ID()" 2>/dev/null)
  echo "[once] ✓ 36kr 源已添加: id=$NEW_ID, url=$KR_URL"
fi

# 4. 显示当前所有 RSS 源
echo "[once] 当前 RSS 源列表:"
mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
  SELECT id, name, url, last_status, article_count
  FROM rss_sources WHERE user_id=1 ORDER BY id
" 2>/dev/null

echo "[once] ✓ RSS 源配置完成"
echo "[once] 后端定时器会在 PM2 重启后 10 秒内自动抓取文章"

exit 0

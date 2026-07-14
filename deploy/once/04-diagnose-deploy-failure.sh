#!/bin/bash
# ============================================================
# 任务：诊断 RSS 部署失败 + 强制重启 PM2 加载新代码
#
# 已知事实：
#   - 02-setup-rss-sources.sh 执行成功（RSS 源已添加）
#   - 说明 git pull 和 once 机制都正常工作
#   - 但线上 API 仍报 12 占位符 SQL 错误
#   - 说明 PM2 可能没重启，还在跑旧代码
#
# 本任务会：
#   1. 检查 rss.js 文件实际内容（确认 git pull 是否拉到修复）
#   2. 检查 PM2 状态和启动时间
#   3. 强制重启 PM2
#   4. 触发 RSS 抓取
#   5. 验证文章入库
#   6. 同时重建前端（解决前端版本号没更新的问题）
# ============================================================

set +e  # 不退出，收集完整诊断

echo "[once] ===== 开始诊断 RSS 部署失败 ====="

cd "$PROJECT_DIR" || { echo "[once] ✗ 项目目录不存在"; exit 1; }

echo ""
echo "[once] --- 1. Git 状态（确认 git pull 是否成功）---"
echo "→ 当前 HEAD: $(git rev-parse --short HEAD 2>&1)"
echo "→ 最近 3 个 commit:"
git log -3 --format="  %h %ci %s" 2>&1

echo ""
echo "[once] --- 2. 检查 rss.js 文件实际内容 ---"
echo "→ 12 占位符出现次数（旧 bug）:"
grep -c '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?' server/rss.js 2>/dev/null || echo "  0"
echo "→ 11 占位符出现次数（已修复）:"
grep -c '?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?' server/rss.js 2>/dev/null || echo "  0"
echo ""
echo "→ rss.js 中 refreshSource 函数的 INSERT 语句:"
grep -A 3 'INSERT IGNORE INTO rss_articles' server/rss.js 2>&1 | head -10

echo ""
echo "[once] --- 3. PM2 状态 ---"
pm2 list 2>&1 | grep -E "(name|ai-buddy|online|stopped|errored|uptime|restarts)" | head -10
echo ""
echo "→ PM2 进程详情（启动时间）:"
pm2 show ai-buddy-api 2>&1 | grep -E "(status|uptime|created at|restarts|script path|exec cwd)" | head -10

echo ""
echo "[once] --- 4. 强制重启 PM2（加载最新代码）---"
echo "→ pm2 delete ai-buddy-api..."
pm2 delete ai-buddy-api 2>&1 | tail -2
echo "→ pm2 start ecosystem.config.cjs --update-env..."
pm2 start ecosystem.config.cjs --update-env 2>&1 | tail -5
pm2 save 2>&1 | tail -2
echo "→ 等待 3 秒让后端启动..."
sleep 3

echo ""
echo "[once] --- 5. 验证后端启动 ---"
HEALTH=$(curl -s --max-time 5 http://127.0.0.1:3000/api/health 2>/dev/null)
if [ -n "$HEALTH" ]; then
  echo "  ✓ 后端响应: $HEALTH"
else
  echo "  ✗ 后端无响应，查看 PM2 日志:"
  pm2 logs ai-buddy-api --nostream --lines 30 2>&1 | tail -35
fi

echo ""
echo "[once] --- 6. 重建前端 ---"
echo "→ 检查 vite:"
ls node_modules/.bin/vite 2>&1
if [ ! -f "node_modules/.bin/vite" ]; then
  echo "  → vite 不存在，重新安装依赖..."
  rm -rf node_modules
  yarn install 2>&1 | tail -5
fi
echo "→ yarn build..."
yarn build 2>&1 | tail -10
echo "→ index.html 版本号:"
grep -o 'app-version" content="[^"]*"' build/index.html 2>&1
echo "→ RssPage chunk:"
ls -la build/assets/RssPage-*.js 2>&1 | head -3

echo ""
echo "[once] --- 7. 触发 RSS 抓取 ---"
# 直接用 API 触发（需要 token，这里用 mysql 标记 pending 让定时器抓取）
mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
  UPDATE rss_sources SET last_status='pending', last_error=NULL WHERE user_id=1
" 2>/dev/null
echo "  → 已标记所有源为 pending"
echo "  → 等待 25 秒让后端定时器抓取..."
sleep 25

echo ""
echo "[once] --- 8. 验证 RSS 抓取结果 ---"
echo "→ RSS 源状态:"
mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
  SELECT id, name, last_status, article_count,
         LEFT(last_error, 120) as error_preview
  FROM rss_sources WHERE user_id=1
" 2>/dev/null

echo ""
echo "→ RSS 文章总数:"
mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "
  SELECT COUNT(*) FROM rss_articles
" 2>/dev/null

echo ""
echo "→ 最近 5 篇文章:"
mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
  SELECT id, LEFT(title, 50) as title, published_at
  FROM rss_articles ORDER BY id DESC LIMIT 5
" 2>/dev/null

echo ""
echo "[once] ===== 诊断和修复完成 ====="
exit 0

# 历史数据清洗 SQL — 配合 server/extract.js 修复
# 解决两个问题：
#   1. 公众号 title 字段里残留 HTML 标签（<span class="js_title_inner">…</span>）
#   2. offline_path 之前存的是绝对路径（/www/.../gv_downloads/<name>），现在改存 basename

-- ===== 1. 清洗 reading_items.title 中的 HTML 标签 =====
-- 使用 MySQL 8.0+ 的 REGEXP_REPLACE（如果版本 < 8.0，请用下面 5.0+ 的方案）
UPDATE reading_items
SET title = REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(REGEXP_REPLACE(title,
    '<[^>]+>', ''),                -- 去掉所有 HTML 标签
    '&nbsp;', ' '),
    '&amp;', '&'),
    '&quot;', '"'),
    '\\s+', ' ')
WHERE title REGEXP '<[^>]+>|&(nbsp|amp|quot|lt|gt|apos|#39);';

-- MySQL 5.7 兼容版（如果上面 REGEXP_REPLACE 报语法错误，把 title 列手工 update 成不带 HTML 的值）
-- 这里不再展开，直接在应用层重抓一次更安全。

-- ===== 2. offline_path 改成 basename =====
-- 把 '/www/wwwroot/buddy.bajiaolu.cn/gv_downloads/<name>' 里的 <name> 提取出来
-- 用 SUBSTRING_INDEX 取最后一段
UPDATE reading_items
SET offline_path = SUBSTRING_INDEX(TRIM(TRAILING '/' FROM offline_path), '/', -1)
WHERE offline_path LIKE '/%'
  AND offline_path LIKE '%gv_downloads/%';

-- ===== 3. 兜底：把空目录、末尾斜杠的脏数据清掉，让用户重新下载 =====
UPDATE reading_items
SET is_offline = 0, offline_path = NULL
WHERE is_offline = 1
  AND (offline_path IS NULL OR offline_path = '' OR offline_path = '/' OR offline_path LIKE '%/');

-- ===== 4. 验证 =====
SELECT id, platform, title, offline_path, is_offline
FROM reading_items
WHERE is_offline = 1 OR title REGEXP '<|>|&(amp|nbsp|quot);'
LIMIT 20;

-- 历史数据清洗（MySQL 5.7 兼容版）
-- 1) 清洗 reading_items.title 中的 HTML 标签和实体
-- 2) offline_path 改成 basename
-- 3) 兜底：空/末尾斜杠/仅根目录 → is_offline=0, offline_path=NULL
-- 4) 数字实体（&#1234;）本版本不处理（如需，单独脚本）

DELIMITER $$

DROP PROCEDURE IF EXISTS clean_reading_titles$$
CREATE PROCEDURE clean_reading_titles()
BEGIN
  DECLARE v_changed INT DEFAULT 1;
  DECLARE v_loop INT DEFAULT 0;
  WHILE v_changed > 0 AND v_loop < 50 DO
    SET v_changed = 0;
    -- 先把常见实体换成占位（避免被剥标签时截断）
    UPDATE reading_items
    SET title = REPLACE(title, '&apos;', '''')
    WHERE title LIKE '%&apos;%' AND LOCATE('&apos;', title) > 0;
    UPDATE reading_items
    SET title = REPLACE(title, '&#39;', '''')
    WHERE title LIKE '%&#39;%';
    UPDATE reading_items
    SET title = REPLACE(title, '&quot;', '"')
    WHERE title LIKE '%&quot;%';
    UPDATE reading_items
    SET title = REPLACE(title, '&gt;', '>')
    WHERE title LIKE '%&gt;%';
    UPDATE reading_items
    SET title = REPLACE(title, '&lt;', '<')
    WHERE title LIKE '%&lt;%';
    UPDATE reading_items
    SET title = REPLACE(title, '&amp;', '&')
    WHERE title LIKE '%&amp;%';
    UPDATE reading_items
    SET title = REPLACE(title, '&nbsp;', ' ')
    WHERE title LIKE '%&nbsp;%';

    -- 剥一次 <...> 标签
    UPDATE reading_items
    SET title = CONCAT(
      SUBSTRING(title, 1, LOCATE('<', title) - 1),
      ' ',
      SUBSTRING(title, LOCATE('>', title, LOCATE('<', title)) + 1)
    )
    WHERE title REGEXP '<[^>]+>';

    SET v_changed = ROW_COUNT();
    SET v_loop = v_loop + 1;
  END WHILE;

  -- 合并多空格：循环把所有 '  ' 替换为 ' '
  SET v_changed = 1;
  SET v_loop = 0;
  WHILE v_changed > 0 AND v_loop < 10 DO
    SET v_changed = 0;
    UPDATE reading_items
    SET title = REPLACE(title, '  ', ' ')
    WHERE title LIKE '%  %';
    SET v_changed = ROW_COUNT();
    SET v_loop = v_loop + 1;
  END WHILE;
END$$

DELIMITER ;

-- 执行存储过程
CALL clean_reading_titles();
DROP PROCEDURE clean_reading_titles;

-- ===== 2. offline_path 改成 basename =====
UPDATE reading_items
SET offline_path = SUBSTRING_INDEX(TRIM(TRAILING '/' FROM offline_path), '/', -1)
WHERE offline_path LIKE '/%'
  AND offline_path LIKE '%gv_downloads/%';

-- ===== 3. 兜底：空/非法 offline_path → 重新下载 =====
UPDATE reading_items
SET is_offline = 0, offline_path = NULL
WHERE is_offline = 1
  AND (offline_path IS NULL
       OR offline_path = ''
       OR offline_path = '/'
       OR offline_path LIKE '%/');

-- ===== 4. 验证 =====
SELECT id, platform, LEFT(title, 100) AS title, offline_path, is_offline
FROM reading_items
WHERE is_offline = 1 OR title REGEXP '<|&(amp|nbsp|quot);'
LIMIT 20;

-- 阅读列表性能优化：复合索引
-- 覆盖查询 WHERE user_id=? AND deleted_at IS NULL ORDER BY created_at DESC
-- 消除 filesort，提升阅读页首屏加载
-- 幂等：若索引已存在则跳过

-- 注意：MySQL 5.7 不支持 DESC 索引方向（语法接受但忽略），用常规升序索引即可，
-- ORDER BY created_at DESC 时优化器会反向扫描索引，同样消除 filesort。
SET @idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
             WHERE table_schema = DATABASE() AND table_name = 'reading_items' AND index_name = 'idx_user_deleted_created');
SET @sql := IF(@idx = 0,
  'ALTER TABLE reading_items ADD INDEX idx_user_deleted_created (user_id, deleted_at, created_at)',
  'SELECT ''idx_user_deleted_created already exists'' AS msg');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

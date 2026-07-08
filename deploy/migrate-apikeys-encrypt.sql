-- API Key 支持反查明文：新增可逆加密列 key_cipher + 旧格式标记 is_legacy
-- 旧 key_hash 为 SHA-256 单向哈希，无法反推明文，标记为 is_legacy=1（反查时提示撤销重建）
-- 新建 Key 同时存 key_hash（验证用）+ key_cipher（反查用），is_legacy=0
-- 幂等：列已存在则跳过

-- 1. 新增 key_cipher 列
SET @c1 := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE table_schema = DATABASE() AND table_name = 'api_keys' AND column_name = 'key_cipher');
SET @s1 := IF(@c1 = 0,
  'ALTER TABLE api_keys ADD COLUMN key_cipher TEXT NULL COMMENT ''AES加密的明文key，可反查''',
  'SELECT ''key_cipher already exists'' AS msg');
PREPARE stmt1 FROM @s1; EXECUTE stmt1; DEALLOCATE PREPARE stmt1;

-- 2. 新增 is_legacy 列
SET @c2 := (SELECT COUNT(*) FROM information_schema.COLUMNS
            WHERE table_schema = DATABASE() AND table_name = 'api_keys' AND column_name = 'is_legacy');
SET @s2 := IF(@c2 = 0,
  'ALTER TABLE api_keys ADD COLUMN is_legacy TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''1=旧格式单向哈希不可反查''',
  'SELECT ''is_legacy already exists'' AS msg');
PREPARE stmt2 FROM @s2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- 3. 旧数据（无 key_cipher）标记为 legacy
UPDATE api_keys SET is_legacy = 1 WHERE key_cipher IS NULL OR key_cipher = '';

-- 4. 复合索引（列出/反查常用）
SET @c3 := (SELECT COUNT(*) FROM information_schema.STATISTICS
            WHERE table_schema = DATABASE() AND table_name = 'api_keys' AND index_name = 'idx_user_active');
SET @s3 := IF(@c3 = 0,
  'ALTER TABLE api_keys ADD INDEX idx_user_active (user_id, is_active)',
  'SELECT ''idx_user_active already exists'' AS msg');
PREPARE stmt3 FROM @s3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;

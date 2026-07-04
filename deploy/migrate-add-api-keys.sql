-- ============================================================
-- AI-Buddy - 增量迁移：添加 api_keys 表
-- ============================================================

CREATE TABLE IF NOT EXISTS `api_keys` (
    `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `user_id` BIGINT NOT NULL,
    `key_hash` VARCHAR(64) NOT NULL UNIQUE,
    `key_prefix` VARCHAR(20) NOT NULL,
    `name` VARCHAR(100) DEFAULT 'Default',
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `last_used_at` TIMESTAMP NULL,
    `expires_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_api_keys_user_id` (`user_id`),
    INDEX `idx_api_keys_key_hash` (`key_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- AI-Buddy - MySQL 数据库 Schema
-- 在宝塔数据库管理界面导入，或终端执行:
-- mysql -u buddy -p'buddy' buddy < deploy/mysql-schema.sql
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 0. users（用户表）
-- ============================================================
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `username` VARCHAR(64) NOT NULL UNIQUE,
    `password_hash` VARCHAR(255) NOT NULL,
    `nickname` VARCHAR(255),
    `avatar_url` TEXT,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `last_login_at` TIMESTAMP NULL,
    UNIQUE KEY `uk_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 0.1 api_keys（用户 API Key 表，供外部工具/SKILL 使用）
-- ============================================================
DROP TABLE IF EXISTS `api_keys`;
CREATE TABLE `api_keys` (
    `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `user_id` BIGINT NOT NULL,
    `key_hash` VARCHAR(64) NOT NULL UNIQUE COMMENT 'SHA256(api_key) hex',
    `key_prefix` VARCHAR(20) NOT NULL COMMENT '前 12 字符，用于显示',
    `name` VARCHAR(100) DEFAULT 'Default',
    `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
    `last_used_at` TIMESTAMP NULL,
    `expires_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_api_keys_user_id` (`user_id`),
    INDEX `idx_api_keys_key_hash` (`key_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 1. tasks（核心任务表）
-- ============================================================
DROP TABLE IF EXISTS `tasks`;
CREATE TABLE `tasks` (
    `id` BIGINT NOT NULL PRIMARY KEY,
    `user_id` BIGINT NOT NULL,
    `title` TEXT NOT NULL,
    `description` LONGTEXT,
    `status` VARCHAR(20) NOT NULL DEFAULT 'todo',
    `priority` VARCHAR(20) DEFAULT 'medium',
    `parent_id` BIGINT,
    `is_project` TINYINT(1) DEFAULT 0,
    `progress` INT DEFAULT 0,
    `due_date` TIMESTAMP NULL,
    `plan_date` TIMESTAMP NULL,
    `owner_id` BIGINT,
    `supporter_id` BIGINT,
    `related_member_ids` JSON,
    `owner_ids` JSON,
    `supporter_ids` JSON,
    `group_id` BIGINT,
    `tag_ids` JSON,
    `key_docs` JSON,
    `related_dx` JSON,
    `predecessor_ids` JSON,
    `successor_ids` JSON,
    `related_memo_ids` JSON,
    `need_report` TINYINT(1) DEFAULT 0,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_tasks_status` (`status`),
    INDEX `idx_tasks_group_id` (`group_id`),
    INDEX `idx_tasks_parent_id` (`parent_id`),
    INDEX `idx_tasks_owner_id` (`owner_id`),
    INDEX `idx_tasks_updated_at` (`updated_at` DESC),
    INDEX `idx_tasks_created_at` (`created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. task_groups（任务分组/看板泳道）
-- ============================================================
DROP TABLE IF EXISTS `task_groups`;
CREATE TABLE `task_groups` (
    `id` BIGINT NOT NULL PRIMARY KEY,
    `user_id` BIGINT NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `color` VARCHAR(20),
    `sort_order` INT,
    `keywords` JSON,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_task_groups_sort_order` (`sort_order`),
    INDEX `idx_task_groups_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. task_members（人员信息）
-- 注意：代码中使用 genId() 手动指定 ID，不使用自增
-- ============================================================
DROP TABLE IF EXISTS `task_members`;
CREATE TABLE `task_members` (
    `id` BIGINT NOT NULL PRIMARY KEY,
    `user_id` BIGINT NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `mis` VARCHAR(255),
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_task_members_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. task_tags（任务标签）
-- ============================================================
DROP TABLE IF EXISTS `task_tags`;
CREATE TABLE `task_tags` (
    `id` BIGINT NOT NULL PRIMARY KEY,
    `name` VARCHAR(255) NOT NULL,
    `color` VARCHAR(20),
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. task_comments（任务评论与动态）- 自增主键
-- ============================================================
DROP TABLE IF EXISTS `task_comments`;
CREATE TABLE `task_comments` (
    `id` BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `user_id` BIGINT NOT NULL,
    `task_id` BIGINT NOT NULL,
    `content` LONGTEXT,
    `comment_type` VARCHAR(20) DEFAULT 'comment',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_task_comments_task_id` (`task_id`),
    INDEX `idx_task_comments_user_id` (`user_id`),
    INDEX `idx_task_comments_created_at` (`created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. memos（备忘录）
-- ============================================================
DROP TABLE IF EXISTS `memos`;
CREATE TABLE `memos` (
    `id` BIGINT NOT NULL PRIMARY KEY,
    `user_id` BIGINT NOT NULL,
    `title` VARCHAR(500),
    `content` LONGTEXT,
    `memo_type` VARCHAR(50) DEFAULT 'note',
    `direction` VARCHAR(255),
    `related_url` TEXT,
    `related_task_id` BIGINT,
    `related_task_ids` JSON,
    `reading_item_id` VARCHAR(255),
    `tag_ids` JSON,
    `tags` TEXT,
    `deleted_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_memos_deleted_at` (`deleted_at`),
    INDEX `idx_memos_user_id` (`user_id`),
    INDEX `idx_memos_created_at` (`created_at` DESC),
    INDEX `idx_memos_updated_at` (`updated_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. task_notes（梳理文档）
-- ============================================================
DROP TABLE IF EXISTS `task_notes`;
CREATE TABLE `task_notes` (
    `id` BIGINT NOT NULL PRIMARY KEY,
    `user_id` BIGINT NOT NULL,
    `title` VARCHAR(500),
    `content` LONGTEXT,
    `related_task_ids` JSON,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_task_notes_user_id` (`user_id`),
    INDEX `idx_task_notes_updated_at` (`updated_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. reading_items（阅读收藏）
-- ============================================================
DROP TABLE IF EXISTS `reading_items`;
CREATE TABLE `reading_items` (
    `id` BIGINT NOT NULL PRIMARY KEY,
    `user_id` BIGINT NOT NULL,
    `url` TEXT NOT NULL,
    `title` VARCHAR(500),
    `summary` LONGTEXT,
    `category` VARCHAR(100) DEFAULT 'work',
    `is_read` TINYINT(1) DEFAULT 0,
    `is_starred` TINYINT(1) DEFAULT 0,
    `tags` JSON,
    `deleted_at` TIMESTAMP NULL,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_reading_items_deleted_at` (`deleted_at`),
    INDEX `idx_reading_items_created_at` (`created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. quick_notes（随记）
-- ============================================================
DROP TABLE IF EXISTS `quick_notes`;
CREATE TABLE `quick_notes` (
    `id` BIGINT NOT NULL PRIMARY KEY,
    `user_id` BIGINT NOT NULL,
    `content` TEXT NOT NULL,
    `tags` TEXT,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_quick_notes_created_at` (`created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 注意: updated_at 由后端应用层自动更新（见 server/index.js）
-- 不使用 MySQL 触发器，避免需要 SUPER 权限
-- ============================================================

-- ============================================================
-- 初始数据：每个用户首次登录时会自动创建预设分组
-- 见 server/auth.js 的 createDefaultGroupsForUser()
-- ============================================================

-- ============================================================
-- 完成
-- ============================================================

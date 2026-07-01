-- ============================================================
-- AI Work Buddy - MySQL 数据库 Schema
-- 在宝塔数据库管理界面导入，或终端执行:
-- mysql -u buddy -p'buddy' buddy < deploy/mysql-schema.sql
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- 1. tasks（核心任务表）
-- ============================================================
DROP TABLE IF EXISTS `tasks`;
CREATE TABLE `tasks` (
    `id` BIGINT NOT NULL PRIMARY KEY,
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
    `name` VARCHAR(255) NOT NULL,
    `color` VARCHAR(20),
    `sort_order` INT,
    `keywords` JSON,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_task_groups_sort_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. task_members（人员信息）
-- 注意：代码中使用 genId() 手动指定 ID，不使用自增
-- ============================================================
DROP TABLE IF EXISTS `task_members`;
CREATE TABLE `task_members` (
    `id` BIGINT NOT NULL PRIMARY KEY,
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
    `task_id` BIGINT NOT NULL,
    `content` LONGTEXT,
    `comment_type` VARCHAR(20) DEFAULT 'comment',
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_task_comments_task_id` (`task_id`),
    INDEX `idx_task_comments_created_at` (`created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. memos（备忘录）
-- ============================================================
DROP TABLE IF EXISTS `memos`;
CREATE TABLE `memos` (
    `id` BIGINT NOT NULL PRIMARY KEY,
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
    INDEX `idx_memos_created_at` (`created_at` DESC),
    INDEX `idx_memos_updated_at` (`updated_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. task_notes（梳理文档）
-- ============================================================
DROP TABLE IF EXISTS `task_notes`;
CREATE TABLE `task_notes` (
    `id` BIGINT NOT NULL PRIMARY KEY,
    `title` VARCHAR(500),
    `content` LONGTEXT,
    `related_task_ids` JSON,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_task_notes_updated_at` (`updated_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. reading_items（阅读收藏）
-- ============================================================
DROP TABLE IF EXISTS `reading_items`;
CREATE TABLE `reading_items` (
    `id` BIGINT NOT NULL PRIMARY KEY,
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
    `content` TEXT NOT NULL,
    `tags` TEXT,
    `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_quick_notes_created_at` (`created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 自动更新 updated_at 触发器
-- 当 UPDATE 未包含 updated_at 时自动更新
-- ============================================================
DROP TRIGGER IF EXISTS trg_tasks_updated;
CREATE TRIGGER trg_tasks_updated
BEFORE UPDATE ON `tasks`
FOR EACH ROW
BEGIN
    IF NEW.updated_at = OLD.updated_at THEN
        SET NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;
END;

DROP TRIGGER IF EXISTS trg_task_groups_updated;
CREATE TRIGGER trg_task_groups_updated
BEFORE UPDATE ON `task_groups`
FOR EACH ROW
BEGIN
    IF NEW.updated_at = OLD.updated_at THEN
        SET NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;
END;

DROP TRIGGER IF EXISTS trg_memos_updated;
CREATE TRIGGER trg_memos_updated
BEFORE UPDATE ON `memos`
FOR EACH ROW
BEGIN
    IF NEW.updated_at = OLD.updated_at THEN
        SET NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;
END;

DROP TRIGGER IF EXISTS trg_task_notes_updated;
CREATE TRIGGER trg_task_notes_updated
BEFORE UPDATE ON `task_notes`
FOR EACH ROW
BEGIN
    IF NEW.updated_at = OLD.updated_at THEN
        SET NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;
END;

-- ============================================================
-- 初始数据：预设任务分组
-- ============================================================
INSERT IGNORE INTO `task_groups` (`id`, `name`, `color`, `sort_order`, `keywords`) VALUES
    (1108465676, '品牌发展', '#06b6d4', 2, JSON_ARRAY('品牌', '发展')),
    (2394361001, '营运标准', '#ec4899', 3, JSON_ARRAY('营运', '标准')),
    (5899071651, '加盟商管', '#f59e0b', 4, JSON_ARRAY('加盟', '门店')),
    (9408221420, '产运数据', NULL, 5, JSON_ARRAY()),
    (6151528880, '日常管理', '#ef4444', 6, JSON_ARRAY()),
    (3226334826, '个人项目', NULL, 7, JSON_ARRAY()),
    (2446698303, '其他', NULL, 8, JSON_ARRAY());

-- ============================================================
-- 完成
-- ============================================================

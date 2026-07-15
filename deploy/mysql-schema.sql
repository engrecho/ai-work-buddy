-- ============================================================
-- AI-Buddy - 完整数据库 Schema
--
-- 用途: 全新初始化数据库（包含所有表、索引、约束）
--
-- ⚠️  安全红线（详见 deploy/SAFETY_RULES.md）⚠️
--   1. 本文件严禁出现 DROP TABLE / DROP DATABASE / TRUNCATE
--   2. 所有建表语句必须用 CREATE TABLE IF NOT EXISTS（幂等）
--   3. 本文件禁止被 deploy/once/*.sh 引用执行（once 失败重试会丢数据）
--   4. 本文件禁止写 UPDATE / DELETE 等业务 DML
--   违反以上任意一条都会导致生产数据丢失，2026-07-15 已发生过真实事故。
--
-- 增量变更请使用 ALTER 语句或独立 once 任务（参考 deploy/once/10-create-tables-v3.sh）
--
-- 使用方法（仅限全新初始化）:
--   mysql -u <user> -p <database> < mysql-schema.sql
-- ============================================================

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

--
-- Table structure for table `users`
--

CREATE TABLE IF NOT EXISTS `users` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `username` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nickname` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar_url` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_login_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `uk_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `api_keys`
--


CREATE TABLE IF NOT EXISTS `api_keys` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `key_hash` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `key_prefix` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'Default',
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `last_used_at` timestamp NULL DEFAULT NULL,
  `expires_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `key_cipher` text COLLATE utf8mb4_unicode_ci COMMENT 'AES加密的明文key，可反查',
  `is_legacy` tinyint(1) NOT NULL DEFAULT '0' COMMENT '1=旧格式单向哈希不可反查',
  PRIMARY KEY (`id`),
  UNIQUE KEY `key_hash` (`key_hash`),
  KEY `idx_api_keys_user_id` (`user_id`),
  KEY `idx_api_keys_key_hash` (`key_hash`),
  KEY `idx_user_active` (`user_id`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `memos`
--


CREATE TABLE IF NOT EXISTS `memos` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL DEFAULT '0',
  `title` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci,
  `memo_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'note',
  `direction` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `related_url` text COLLATE utf8mb4_unicode_ci,
  `related_task_id` bigint(20) DEFAULT NULL,
  `related_task_ids` json DEFAULT NULL,
  `reading_item_id` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `tag_ids` json DEFAULT NULL,
  `tags` text COLLATE utf8mb4_unicode_ci,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_memos_deleted_at` (`deleted_at`),
  KEY `idx_memos_created_at` (`created_at`),
  KEY `idx_memos_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `quick_notes`
--


CREATE TABLE IF NOT EXISTS `quick_notes` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `tags` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_quick_notes_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `reading_items`
--


CREATE TABLE IF NOT EXISTS `reading_items` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `platform` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '社媒平台标识：douyin/bilibili/xiaohongshu/wechat/youtube/tiktok/kuaishou/weibo/other/web',
  `title` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `summary` longtext COLLATE utf8mb4_unicode_ci,
  `cover_url` text COLLATE utf8mb4_unicode_ci COMMENT '封面图 URL',
  `category` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT 'work',
  `is_read` tinyint(1) DEFAULT '0',
  `is_starred` tinyint(1) DEFAULT '0',
  `is_offline` tinyint(1) NOT NULL DEFAULT '0' COMMENT '是否已下载到本地',
  `offline_path` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '离线内容在 server 上的存储路径',
  `tags` json DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reading_items_deleted_at` (`deleted_at`),
  KEY `idx_reading_items_created_at` (`created_at`),
  KEY `idx_reading_items_platform` (`platform`),
  KEY `idx_reading_items_is_offline` (`is_offline`),
  KEY `idx_user_deleted_created` (`user_id`,`deleted_at`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `rss_sources`
--


CREATE TABLE IF NOT EXISTS `rss_sources` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `site_url` text COLLATE utf8mb4_unicode_ci,
  `color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT '#6b7280',
  `last_fetched_at` timestamp NULL DEFAULT NULL,
  `last_status` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `last_error` text COLLATE utf8mb4_unicode_ci,
  `article_count` int(11) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_rss_sources_user` (`user_id`),
  KEY `idx_rss_sources_user_created` (`user_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `rss_articles`
--


CREATE TABLE IF NOT EXISTS `rss_articles` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `source_id` bigint(20) NOT NULL,
  `guid` varchar(760) COLLATE utf8mb4_unicode_ci NOT NULL,
  `url` text COLLATE utf8mb4_unicode_ci,
  `title` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL,
  `summary` longtext COLLATE utf8mb4_unicode_ci,
  `content` longtext COLLATE utf8mb4_unicode_ci,
  `cover_url` text COLLATE utf8mb4_unicode_ci,
  `author` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `categories` json DEFAULT NULL,
  `published_at` timestamp NULL DEFAULT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `is_starred` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_rss_articles_source_guid` (`source_id`,`guid`),
  KEY `idx_rss_articles_user` (`user_id`),
  KEY `idx_rss_articles_source` (`source_id`),
  KEY `idx_rss_articles_published` (`user_id`,`published_at`),
  KEY `idx_rss_articles_created` (`user_id`,`created_at`),
  KEY `idx_rss_articles_read` (`user_id`,`is_read`),
  CONSTRAINT `fk_rss_articles_source` FOREIGN KEY (`source_id`) REFERENCES `rss_sources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `task_comments`
--


CREATE TABLE IF NOT EXISTS `task_comments` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL DEFAULT '0',
  `task_id` bigint(20) NOT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci,
  `comment_type` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'comment',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_task_comments_task_id` (`task_id`),
  KEY `idx_task_comments_created_at` (`created_at`),
  KEY `idx_task_comments_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `task_groups`
--


CREATE TABLE IF NOT EXISTS `task_groups` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `sort_order` int(11) DEFAULT NULL,
  `keywords` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `user_id` bigint(20) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `idx_task_groups_sort_order` (`sort_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `task_members`
--


CREATE TABLE IF NOT EXISTS `task_members` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `mis` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_task_members_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `task_notes`
--


CREATE TABLE IF NOT EXISTS `task_notes` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL DEFAULT '0',
  `title` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `content` longtext COLLATE utf8mb4_unicode_ci,
  `related_task_ids` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_task_notes_updated_at` (`updated_at`),
  KEY `idx_task_notes_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `task_tags`
--


CREATE TABLE IF NOT EXISTS `task_tags` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL DEFAULT '0',
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `color` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_task_tags_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `tasks`
--


CREATE TABLE IF NOT EXISTS `tasks` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `title` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` longtext COLLATE utf8mb4_unicode_ci,
  `status` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'todo',
  `priority` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT 'medium',
  `parent_id` bigint(20) DEFAULT NULL,
  `is_project` tinyint(1) DEFAULT '0',
  `progress` int(11) DEFAULT '0',
  `due_date` timestamp NULL DEFAULT NULL,
  `plan_date` timestamp NULL DEFAULT NULL,
  `owner_id` bigint(20) DEFAULT NULL,
  `supporter_id` bigint(20) DEFAULT NULL,
  `related_member_ids` json DEFAULT NULL,
  `owner_ids` json DEFAULT NULL,
  `supporter_ids` json DEFAULT NULL,
  `group_id` bigint(20) DEFAULT NULL,
  `tag_ids` json DEFAULT NULL,
  `key_docs` json DEFAULT NULL,
  `related_dx` json DEFAULT NULL,
  `predecessor_ids` json DEFAULT NULL,
  `successor_ids` json DEFAULT NULL,
  `related_memo_ids` json DEFAULT NULL,
  `need_report` tinyint(1) DEFAULT '0',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_tasks_status` (`status`),
  KEY `idx_tasks_group_id` (`group_id`),
  KEY `idx_tasks_parent_id` (`parent_id`),
  KEY `idx_tasks_owner_id` (`owner_id`),
  KEY `idx_tasks_updated_at` (`updated_at`),
  KEY `idx_tasks_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure for table `user_settings`
--


CREATE TABLE IF NOT EXISTS `user_settings` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `settings` json NOT NULL,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `user_id` (`user_id`),
  KEY `idx_user_settings_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ══════════════════════════════════════════════════════════════
-- 健康档案模块（患者 × 疾病 = 一份档案）
-- ══════════════════════════════════════════════════════════════

-- 健康档案（患者 × 疾病）
CREATE TABLE IF NOT EXISTS `health_profiles` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `patient_name` varchar(100) NOT NULL,
  `patient_avatar_url` text DEFAULT NULL,
  `gender` varchar(10) DEFAULT NULL,
  `birth_date` date DEFAULT NULL,
  `disease_name` varchar(200) NOT NULL DEFAULT '',
  `color` varchar(20) DEFAULT NULL,
  `tags` json DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_health_profiles_user` (`user_id`, `deleted_at`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 就诊记录
CREATE TABLE IF NOT EXISTS `health_visits` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `profile_id` bigint(20) NOT NULL,
  `visit_date` date NOT NULL,
  `hospital` varchar(200) DEFAULT NULL,
  `department` varchar(100) DEFAULT NULL,
  `doctor` varchar(100) DEFAULT NULL,
  `chief_complaint` text DEFAULT NULL,
  `diagnosis` text DEFAULT NULL,
  `prescription` longtext DEFAULT NULL,
  `examination` longtext DEFAULT NULL,
  `next_visit_date` date DEFAULT NULL,
  `cost` decimal(10,2) DEFAULT NULL,
  `attachment_urls` json DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_health_visits_profile` (`profile_id`, `visit_date`),
  KEY `idx_health_visits_user` (`user_id`, `visit_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 药物
CREATE TABLE IF NOT EXISTS `health_medications` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `profile_id` bigint(20) DEFAULT NULL,
  `visit_id` bigint(20) DEFAULT NULL,
  `name` varchar(200) NOT NULL,
  `photo_url` text DEFAULT NULL,
  `usage_instruction` text DEFAULT NULL,
  `dosage` varchar(200) DEFAULT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'active',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_health_medications_profile` (`profile_id`, `status`),
  KEY `idx_health_visits_user` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ══════════════════════════════════════════════════════════════
-- 密码保险箱模块（AES-256-CBC 加密存储）
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS `vault_items` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `category` varchar(20) NOT NULL DEFAULT 'password',
  `title` varchar(200) NOT NULL,
  `username` varchar(255) DEFAULT NULL,
  `cipher_secret` text NOT NULL,
  `url` text DEFAULT NULL,
  `cipher_notes` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `tags` json DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vault_items_user` (`user_id`, `deleted_at`, `category`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

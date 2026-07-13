-- ============================================================
-- AI-Buddy - 增量迁移：新增 RSS 订阅阅读功能
-- 新增表：rss_sources（订阅源）、rss_articles（文章）
-- 不会影响现有数据，仅新增两张表
-- ============================================================

-- ── 订阅源 ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `rss_sources` (
    `id`              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `user_id`         BIGINT NOT NULL,
    `name`            VARCHAR(255) NOT NULL,
    `url`             TEXT NOT NULL,
    `description`     TEXT,
    `site_url`        TEXT,
    `color`           VARCHAR(20) DEFAULT '#6b7280',
    `last_fetched_at` TIMESTAMP NULL,
    `last_status`     VARCHAR(20) DEFAULT 'pending',  -- success / error / pending
    `last_error`      TEXT,
    `article_count`   INT NOT NULL DEFAULT 0,
    `created_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_rss_sources_user` (`user_id`),
    INDEX `idx_rss_sources_user_created` (`user_id`, `created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── 文章 ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `rss_articles` (
    `id`           BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    `user_id`      BIGINT NOT NULL,
    `source_id`    BIGINT NOT NULL,
    `guid`         VARCHAR(760) NOT NULL,             -- 文章唯一标识（link 或 guid）
    `url`          TEXT,
    `title`        VARCHAR(500) NOT NULL,
    `summary`      LONGTEXT,
    `content`      LONGTEXT,
    `cover_url`    TEXT,
    `author`       VARCHAR(255),
    `categories`   JSON,                              -- ["ai","ml"]
    `published_at` TIMESTAMP NULL,
    `is_read`      TINYINT(1) NOT NULL DEFAULT 0,
    `is_starred`   TINYINT(1) NOT NULL DEFAULT 0,
    `created_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_rss_articles_source_guid` (`source_id`, `guid`),
    INDEX `idx_rss_articles_user` (`user_id`),
    INDEX `idx_rss_articles_source` (`source_id`),
    INDEX `idx_rss_articles_published` (`user_id`, `published_at` DESC),
    INDEX `idx_rss_articles_created` (`user_id`, `created_at` DESC),
    INDEX `idx_rss_articles_read` (`user_id`, `is_read`),
    CONSTRAINT `fk_rss_articles_source` FOREIGN KEY (`source_id`)
        REFERENCES `rss_sources` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

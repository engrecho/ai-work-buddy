-- ============================================================
-- AI-Buddy - 增量迁移：为 reading_items 增加社媒平台/离线相关字段
-- ============================================================
-- 背景：
--   1) 社媒平台（抖音/B站/小红书/公众号等）需要"平台"列 + 封面图
--   2) "离线到本地"开关 + 实际存储路径
--   3) 复用现有 category 字段为平台标记（work/article/video 之外扩展更多）
-- 设计：
--   - platform：抖音 douyin / bilibili / xiaohongshu / wechat / youtube / tiktok / kuaishou / weibo / other
--   - cover_url：封面图 CDN 链接（greenvideo 解析后从 videoItemVoList 抽出）
--   - is_offline：是否已下载到本地
--   - offline_path：下载后的 server 端绝对路径
-- ============================================================

ALTER TABLE `reading_items`
    ADD COLUMN `platform` VARCHAR(50) DEFAULT NULL COMMENT '社媒平台标识：douyin/bilibili/xiaohongshu/wechat/youtube/tiktok/kuaishou/weibo/other/web' AFTER `url`,
    ADD COLUMN `cover_url` TEXT DEFAULT NULL COMMENT '封面图 URL' AFTER `summary`,
    ADD COLUMN `is_offline` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已下载到本地' AFTER `is_starred`,
    ADD COLUMN `offline_path` VARCHAR(500) DEFAULT NULL COMMENT '离线内容在 server 上的存储路径' AFTER `is_offline`,
    ADD INDEX `idx_reading_items_platform` (`platform`),
    ADD INDEX `idx_reading_items_is_offline` (`is_offline`);

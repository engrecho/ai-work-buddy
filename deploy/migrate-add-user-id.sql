-- ============================================================
-- AI-Buddy - 增量迁移：为缺失 user_id 字段的表添加
-- 适用于已部署但 schema 漏掉 user_id 的实例
-- 在宝塔终端执行：mysql -u buddy -p'NX62WP4bDJikBNih' buddy < deploy/migrate-add-user-id.sql
-- ============================================================

-- 为每个缺失 user_id 的表添加（IF NOT EXISTS MySQL 8.0+ 支持，5.7 需要手动检查）
-- task_groups
ALTER TABLE `task_groups`
  ADD COLUMN `user_id` BIGINT NOT NULL DEFAULT 0 AFTER `id`,
  ADD INDEX `idx_task_groups_user_id` (`user_id`);

-- task_tags
ALTER TABLE `task_tags`
  ADD COLUMN `user_id` BIGINT NOT NULL DEFAULT 0 AFTER `id`,
  ADD INDEX `idx_task_tags_user_id` (`user_id`);

-- task_comments
ALTER TABLE `task_comments`
  ADD COLUMN `user_id` BIGINT NOT NULL DEFAULT 0 AFTER `id`,
  ADD INDEX `idx_task_comments_user_id` (`user_id`);

-- memos
ALTER TABLE `memos`
  ADD COLUMN `user_id` BIGINT NOT NULL DEFAULT 0 AFTER `id`,
  ADD INDEX `idx_memos_user_id` (`user_id`);

-- task_notes
ALTER TABLE `task_notes`
  ADD COLUMN `user_id` BIGINT NOT NULL DEFAULT 0 AFTER `id`,
  ADD INDEX `idx_task_notes_user_id` (`user_id`);

-- 把已有数据归属给第一个注册的用户
-- 查找最小的用户 id
SET @first_user_id = (SELECT MIN(id) FROM `users` LIMIT 1);

UPDATE `task_groups`   SET `user_id` = @first_user_id WHERE `user_id` = 0;
UPDATE `task_tags`     SET `user_id` = @first_user_id WHERE `user_id` = 0;
UPDATE `task_comments` SET `user_id` = @first_user_id WHERE `user_id` = 0;
UPDATE `memos`         SET `user_id` = @first_user_id WHERE `user_id` = 0;
UPDATE `task_notes`    SET `user_id` = @first_user_id WHERE `user_id` = 0;

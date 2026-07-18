#!/bin/bash
# 一次性任务：单独创建 4 张新表（独立 SQL，不依赖完整 schema）
cd "$PROJECT_DIR"

echo "=== 开始创建健康+保险箱数据表 ==="
echo "DB_USER=$DB_USER DB_NAME=$DB_NAME"

# 写独立的建表 SQL（只含 4 张新表）
cat > /tmp/new-tables.sql << 'SQLEOF'
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
  KEY `idx_health_medications_user` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vault_items` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT,
  `user_id` bigint(20) NOT NULL,
  `category` varchar(20) NOT NULL DEFAULT 'password',
  `title` varchar(200) NOT NULL,
  `username` varchar(255) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `login_methods` json DEFAULT NULL,
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
SQLEOF

echo ""
echo "=== 执行建表 ==="
mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < /tmp/new-tables.sql 2>&1
RESULT=$?
echo "mysql 退出码: $RESULT"

echo ""
echo "=== 验证表是否创建 ==="
mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -N -e "
  SELECT table_name FROM information_schema.tables
  WHERE table_schema='$DB_NAME'
  AND table_name IN ('health_profiles','health_visits','health_medications','vault_items')
  ORDER BY table_name;" 2>&1

rm -f /tmp/new-tables.sql
echo ""
echo "=== 完成 ==="

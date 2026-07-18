#!/bin/bash
# 一次性任务：给 vault_items 表加联系方式字段
#
# 字段:
#   phone              varchar(20)   手机号（可选）
#   phone_login_enabled tinyint(1)   是否支持手机号登录（0=否, 1=是）
#   email              varchar(255)  邮箱（可选）
#
# 安全性: 幂等, 先查 INFORMATION_SCHEMA 判断字段是否存在, 不存在才 ADD
set +e

echo "[once] ===== 给 vault_items 加联系方式字段 ====="
cd "$PROJECT_DIR" || exit 1

add_column_if_missing() {
  local col="$1"
  local ddl="$2"
  local COL_EXISTS=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='vault_items' AND COLUMN_NAME='$col'
  " 2>/dev/null)

  if [ "$COL_EXISTS" -gt 0 ] 2>/dev/null; then
    echo "  ✓ $col 字段已存在，跳过"
  else
    echo "  → 添加 $col 字段..."
    mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "ALTER TABLE vault_items ADD COLUMN $ddl" 2>/dev/null
    echo "  ✓ 已添加 $col"
  fi
}

add_column_if_missing "phone" "phone VARCHAR(20) DEFAULT NULL AFTER username"
add_column_if_missing "phone_login_enabled" "phone_login_enabled TINYINT(1) NOT NULL DEFAULT 0 AFTER phone"
add_column_if_missing "email" "email VARCHAR(255) DEFAULT NULL AFTER phone_login_enabled"

echo ""
echo "[once] ===== 完成 ====="
exit 0

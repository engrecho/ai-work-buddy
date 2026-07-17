#!/bin/bash
# 一次性任务：给 health_visits 表加报销相关字段
#
# 字段:
#   is_reimbursed   tinyint(1)  是否报销 (0=否, 1=是)
#   reimburse_amount decimal(10,2) 报销金额
#
# 安全性: 幂等, 先查 INFORMATION_SCHEMA 判断字段是否存在, 不存在才 ADD
set +e

echo "[once] ===== 给 health_visits 加报销字段 ====="
cd "$PROJECT_DIR" || exit 1

add_column_if_missing() {
  local col="$1"
  local ddl="$2"
  local COL_EXISTS=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='health_visits' AND COLUMN_NAME='$col'
  " 2>/dev/null)

  if [ "$COL_EXISTS" -gt 0 ] 2>/dev/null; then
    echo "  ✓ $col 字段已存在，跳过"
  else
    echo "  → 添加 $col 字段..."
    mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "ALTER TABLE health_visits ADD COLUMN $ddl" 2>/dev/null
    echo "  ✓ 已添加 $col"
  fi
}

add_column_if_missing "is_reimbursed" "is_reimbursed tinyint(1) NOT NULL DEFAULT 0 AFTER cost"
add_column_if_missing "reimburse_amount" "reimburse_amount decimal(10,2) DEFAULT NULL AFTER is_reimbursed"

echo ""
echo "[once] ===== 完成 ====="
exit 0

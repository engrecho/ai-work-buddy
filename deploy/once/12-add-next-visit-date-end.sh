#!/bin/bash
# 一次性任务：给 health_visits 表加 next_visit_date_end 字段
#
# 用途：支持「下次就诊日期」选择时间区间（开始日期 + 结束日期）
# 安全性：幂等，先查 INFORMATION_SCHEMA 判断字段是否存在，不存在才 ADD
set +e

echo "[once] ===== 给 health_visits 加 next_visit_date_end 字段 ====="
cd "$PROJECT_DIR" || exit 1

# 检查字段是否已存在
COL_EXISTS=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "
  SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA='$DB_NAME' AND TABLE_NAME='health_visits' AND COLUMN_NAME='next_visit_date_end'
" 2>/dev/null)

if [ "$COL_EXISTS" -gt 0 ] 2>/dev/null; then
  echo "  ✓ next_visit_date_end 字段已存在，跳过"
else
  echo "  → 添加 next_visit_date_end 字段..."
  mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
    ALTER TABLE health_visits ADD COLUMN next_visit_date_end date DEFAULT NULL AFTER next_visit_date
  " 2>/dev/null
  echo "  ✓ 已添加"
fi

echo ""
echo "[once] ===== 完成 ====="
exit 0

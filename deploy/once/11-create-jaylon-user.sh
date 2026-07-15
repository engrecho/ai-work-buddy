#!/bin/bash
# 一次性任务：创建/恢复 jaylon 用户（密码 111111）+ 关联孤儿 api_keys
#
# 背景：2026-07-15 事故中 users 表被 DROP 清空，api_keys.user_id 成为孤儿，
# 导致 API Key 鉴权返回 401（getUserByApiKey 最后一步查 users 返回空）。
# 本任务创建 jaylon 用户，并把孤儿 api_keys 关联到 jaylon。
#
# 安全性：
#   - 只 INSERT/UPDATE users 表，不 DROP 不 TRUNCATE
#   - 只 UPDATE api_keys.user_id（孤儿行），不删除任何数据
#   - 幂等：重复执行不报错
set +e

echo "[once] ===== 创建/恢复 jaylon 用户 ====="
cd "$PROJECT_DIR" || exit 1

JAYLON_PASSWORD="111111"

# ── 1. 生成 bcrypt 哈希 ──────────────────────────────────────
echo "→ 生成 bcrypt 哈希（rounds=10）..."
HASH=$(node -e "
const bcrypt = require('bcryptjs');
console.log(bcrypt.hashSync(process.argv[1], 10));
" "$JAYLON_PASSWORD" 2>/dev/null)

if [ -z "$HASH" ]; then
  echo "  ✗ 生成哈希失败，尝试在 server 目录下找 bcryptjs"
  cd "$PROJECT_DIR/server"
  HASH=$(node -e "
const bcrypt = require('bcryptjs');
console.log(bcrypt.hashSync(process.argv[1], 10));
" "$JAYLON_PASSWORD" 2>/dev/null)
  cd "$PROJECT_DIR"
fi

if [ -z "$HASH" ]; then
  echo "  ✗ 仍无法生成哈希，尝试安装 bcryptjs"
  npm install bcryptjs --no-save 2>&1 | tail -3
  HASH=$(node -e "
const bcrypt = require('bcryptjs');
console.log(bcrypt.hashSync(process.argv[1], 10));
" "$JAYLON_PASSWORD" 2>/dev/null)
fi

if [ -z "$HASH" ]; then
  echo "  ✗ 彻底失败，退出"
  exit 1
fi

echo "  ✓ 哈希已生成: ${HASH:0:20}..."

# ── 2. 创建或更新 jaylon 用户（幂等）────────────────────────
echo ""
echo "→ 检查 jaylon 用户是否存在..."
EXISTING=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "
  SELECT id FROM users WHERE username='jaylon' LIMIT 1
" 2>/dev/null)

if [ -n "$EXISTING" ]; then
  echo "  → jaylon 已存在 (id=$EXISTING)，更新密码..."
  mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
    UPDATE users SET password_hash='$HASH', nickname='Jaylon', is_active=1
    WHERE username='jaylon'
  " 2>/dev/null
  JAYLON_ID=$EXISTING
else
  echo "  → jaylon 不存在，创建中..."
  mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
    INSERT INTO users (username, password_hash, nickname, is_active)
    VALUES ('jaylon', '$HASH', 'Jaylon', 1)
  " 2>/dev/null
  JAYLON_ID=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "
    SELECT id FROM users WHERE username='jaylon' LIMIT 1
  " 2>/dev/null)
fi

echo "  ✓ jaylon 用户就绪 (id=$JAYLON_ID)"

# ── 3. 关联孤儿 api_keys（user_id 指向已不存在的用户）─────────
echo ""
echo "→ 检查孤儿 api_keys..."
ORPHAN_COUNT=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "
  SELECT COUNT(*) FROM api_keys ak
  LEFT JOIN users u ON ak.user_id = u.id
  WHERE u.id IS NULL
" 2>/dev/null)

if [ "$ORPHAN_COUNT" -gt 0 ] 2>/dev/null; then
  echo "  → 发现 $ORPHAN_COUNT 个孤儿 api_keys，关联到 jaylon (id=$JAYLON_ID)..."
  mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
    UPDATE api_keys ak
    LEFT JOIN users u ON ak.user_id = u.id
    SET ak.user_id = $JAYLON_ID
    WHERE u.id IS NULL
  " 2>/dev/null
  echo "  ✓ 已关联"
else
  echo "  ✓ 无孤儿 api_keys"
fi

# ── 4. 验证登录 ──────────────────────────────────────────────
echo ""
echo "→ 验证：用 jaylon 登录测试..."
LOGIN_RESULT=$(curl -s --max-time 5 -X POST http://127.0.0.1:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"jaylon\",\"password\":\"$JAYLON_PASSWORD\"}")
echo "  登录结果: $LOGIN_RESULT"

# ── 5. 验证 API Key（如果有的话）─────────────────────────────
echo ""
echo "→ 验证：列出 jaylon 的 API Keys..."
KEY_LIST=$(mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -sN -e "
  SELECT id, name, key_prefix, is_active, is_legacy FROM api_keys WHERE user_id=$JAYLON_ID
" 2>/dev/null)
if [ -n "$KEY_LIST" ]; then
  echo "  $KEY_LIST"
else
  echo "  jaylon 暂无 API Key，登录后在设置中心创建"
fi

echo ""
echo "=========================================="
echo "jaylon 用户已就绪："
echo "  用户名: jaylon"
echo "  密码:   $JAYLON_PASSWORD"
echo "  id:    $JAYLON_ID"
echo "=========================================="
echo ""
echo "[once] ===== 完成 ====="
exit 0

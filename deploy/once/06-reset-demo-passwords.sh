#!/bin/bash
# 一次性任务：重置 zimeiti_demo 和 pm_demo 的密码到已知值
#
# 密码在数据库里是 bcrypt 哈希（rounds=10），无法还原明文。
# 本任务用 Node + bcryptjs 生成新哈希，重置两个演示账号密码。
set +e

echo "[once] ===== 重置演示账号密码 ====="
cd "$PROJECT_DIR" || exit 1

# 两个账号统一重置为同一个密码，方便演示
NEW_PASSWORD="demo123456"

echo "→ 生成 bcrypt 哈希（rounds=10）..."
HASH=$(node -e "
const bcrypt = require('bcryptjs');
const pwd = process.argv[1];
const hash = bcrypt.hashSync(pwd, 10);
console.log(hash);
" "$NEW_PASSWORD" 2>/dev/null)

if [ -z "$HASH" ]; then
  echo "  ✗ 生成哈希失败，尝试在 server 目录下找 bcryptjs"
  cd "$PROJECT_DIR/server"
  HASH=$(node -e "
const bcrypt = require('bcryptjs');
console.log(bcrypt.hashSync(process.argv[1], 10));
" "$NEW_PASSWORD" 2>/dev/null)
  cd "$PROJECT_DIR"
fi

if [ -z "$HASH" ]; then
  echo "  ✗ 仍无法生成哈希，检查 bcryptjs 是否安装"
  echo "  → 尝试安装: npm install bcryptjs --no-save"
  npm install bcryptjs --no-save 2>&1 | tail -3
  HASH=$(node -e "
const bcrypt = require('bcryptjs');
console.log(bcrypt.hashSync(process.argv[1], 10));
" "$NEW_PASSWORD" 2>/dev/null)
fi

if [ -z "$HASH" ]; then
  echo "  ✗ 彻底失败，退出"
  exit 1
fi

echo "  ✓ 哈希已生成: ${HASH:0:20}..."
echo ""

echo "→ 重置 zimeiti_demo (id=7) 密码..."
mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
  UPDATE users SET password_hash='$HASH' WHERE username='zimeiti_demo'
" 2>/dev/null
echo "  ✓ 完成"

echo "→ 重置 pm_demo (id=8) 密码..."
mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "
  UPDATE users SET password_hash='$HASH' WHERE username='pm_demo'
" 2>/dev/null
echo "  ✓ 完成"

echo ""
echo "=========================================="
echo "重置完成，可用以下账号登录："
echo ""
echo "  账号 1: zimeiti_demo"
echo "  昵称:   自媒体运营小王"
echo "  密码:   $NEW_PASSWORD"
echo ""
echo "  账号 2: pm_demo"
echo "  昵称:   产品经理小李"
echo "  密码:   $NEW_PASSWORD"
echo "=========================================="
echo ""
echo "→ 验证：用 zimeiti_demo 登录测试"
LOGIN_RESULT=$(curl -s --max-time 5 -X POST http://127.0.0.1:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"zimeiti_demo\",\"password\":\"$NEW_PASSWORD\"}")
echo "  登录结果: $LOGIN_RESULT"

echo ""
echo "→ 验证：用 pm_demo 登录测试"
LOGIN_RESULT=$(curl -s --max-time 5 -X POST http://127.0.0.1:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"pm_demo\",\"password\":\"$NEW_PASSWORD\"}")
echo "  登录结果: $LOGIN_RESULT"

echo ""
echo "[once] ===== 完成 ====="
exit 0

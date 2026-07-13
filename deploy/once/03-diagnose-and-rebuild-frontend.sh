#!/bin/bash
# ============================================================
# 任务：诊断前端 build 失败原因 + 强制重新安装依赖并 build
#
# 背景：线上 index.html 仍是 v2026-07-11-r6（旧版本），
#       说明 pull.sh 的 yarn install / yarn build 步骤失败，
#       导致 RssPage 没有部署上线。
#
# 这个任务会：
#   1. 输出 node / yarn / npm 版本
#   2. 检查 vite 是否安装
#   3. 删除 node_modules 重新安装
#   4. 重新 build 前端
#   5. 验证 RssPage chunk 是否生成
#   6. 验证 index.html 版本号
# ============================================================

set +e  # 不退出，继续执行后续步骤以便收集完整诊断信息

echo "[once] ===== 开始诊断前端 build ====="

cd "$PROJECT_DIR" || { echo "[once] ✗ 项目目录不存在"; exit 1; }

echo ""
echo "[once] --- 1. 环境信息 ---"
echo "node: $(node -v 2>&1)"
echo "yarn: $(yarn -v 2>&1)"
echo "npm:  $(npm -v 2>&1)"
echo "pwd:  $(pwd)"
echo "git:  $(git log -1 --format='%h %s' 2>&1)"

echo ""
echo "[once] --- 2. 检查 vite 是否已安装 ---"
if [ -d "node_modules/vite" ]; then
  echo "  ✓ node_modules/vite 存在"
  VITE_VER=$(node -p "require('./node_modules/vite/package.json').version" 2>/dev/null)
  echo "  vite 版本: $VITE_VER"
else
  echo "  ✗ node_modules/vite 不存在"
fi
if [ -f "node_modules/.bin/vite" ]; then
  echo "  ✓ node_modules/.bin/vite 存在"
else
  echo "  ✗ node_modules/.bin/vite 不存在（yarn build 会失败）"
fi

echo ""
echo "[once] --- 3. 检查 package.json 里 vite 是否在 devDependencies ---"
node -e "
const pkg = require('./package.json');
const deps = pkg.devDependencies || {};
const allDeps = { ...pkg.dependencies, ...deps };
console.log('  devDependencies.vite:', deps.vite || '(未声明)');
console.log('  dependencies.vite:', (pkg.dependencies||{}).vite || '(未声明)');
" 2>&1

echo ""
echo "[once] --- 4. 删除 node_modules 重新安装 ---"
echo "  → 删除 node_modules..."
rm -rf node_modules
echo "  → 删除 yarn.lock 缓存（强制重新解析依赖）..."
# 不删 yarn.lock，它会保留版本约束；只删缓存
# rm -f yarn.lock
echo "  → yarn install..."
yarn install 2>&1 | tail -10
echo "  → 安装后检查 vite:"
if [ -f "node_modules/.bin/vite" ]; then
  echo "  ✓ vite 已安装"
else
  echo "  ✗ vite 仍未安装，尝试 npm install"
  npm install 2>&1 | tail -10
fi

echo ""
echo "[once] --- 5. 重新 build 前端 ---"
echo "  → yarn build..."
yarn build 2>&1 | tail -15

echo ""
echo "[once] --- 6. 验证 build 产物 ---"
if [ -d "build" ]; then
  echo "  ✓ build 目录存在"
  echo "  build 目录文件数: $(ls build/ | wc -l)"
  echo "  build/assets 文件数: $(ls build/assets/ 2>/dev/null | wc -l)"
  echo ""
  echo "  → 检查 RssPage chunk 是否生成:"
  ls -la build/assets/RssPage-*.js 2>&1 | head -3
  echo ""
  echo "  → 检查 index.html 版本号:"
  grep -o 'app-version" content="[^"]*"' build/index.html 2>&1
  echo ""
  echo "  → 检查 index.html 引用的主 JS:"
  grep -oE 'assets/[^"]+\.js' build/index.html 2>&1 | head -3
else
  echo "  ✗ build 目录不存在"
fi

echo ""
echo "[once] --- 7. 后端健康检查 ---"
HEALTH=$(curl -s --max-time 3 http://127.0.0.1:3000/api/health 2>/dev/null)
if [ -n "$HEALTH" ]; then
  echo "  ✓ 后端响应: $HEALTH"
else
  echo "  ✗ 后端无响应"
fi

echo ""
echo "[once] ===== 诊断完成 ====="
exit 0

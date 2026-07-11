#!/bin/bash
# AI-Buddy API 延迟测试脚本
# 用法: chmod +x test_latency.sh && ./test_latency.sh

BASE="https://buddy.bajiaolu.cn"

echo "============================================"
echo "  AI-Buddy API 延迟测试"
echo "  时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "============================================"
echo ""

# ── 1. 健康检查（无鉴权）──────────────────────────
echo "── 1. 健康检查 ──"
curl -o /dev/null -w \
  "  DNS解析: %{time_namelookup}s\n  TCP连接: %{time_connect}s\n  TLS握手: %{time_appconnect}s\n  首字节: %{time_starttransfer}s\n  总耗时: %{time_total}s\n  HTTP状态码: %{http_code}\n\n" \
  -s "$BASE/api/health"

# ── 2. 批量接口（无鉴权，会返回 401）──────────────
echo "── 2. 批量接口（无鉴权，预期返回 401）──"
curl -o /dev/null -w \
  "  DNS解析: %{time_namelookup}s\n  TCP连接: %{time_connect}s\n  TLS握手: %{time_appconnect}s\n  首字节: %{time_starttransfer}s\n  总耗时: %{time_total}s\n  HTTP状态码: %{http_code}\n\n" \
  -s -X POST "$BASE/api/batch" \
  -H "Content-Type: application/json" \
  -d '{"queries":[{"table":"tasks","limit":1}]}'

# ── 3. 单表查询（无鉴权，会返回 401）──────────────
echo "── 3. 单表查询（无鉴权，预期返回 401）──"
curl -o /dev/null -w \
  "  DNS解析: %{time_namelookup}s\n  TCP连接: %{time_connect}s\n  TLS握手: %{time_appconnect}s\n  首字节: %{time_starttransfer}s\n  总耗时: %{time_total}s\n  HTTP状态码: %{http_code}\n\n" \
  -s "$BASE/api/tasks?limit=1"

# ── 4. 连续 3 次请求（测试连接复用）──────────────
echo "── 4. 连续 3 次请求（测试连接复用）──"
for i in 1 2 3; do
  curl -o /dev/null -w "  第${i}次: TCP=%{time_connect}s TLS=%{time_appconnect}s 总=%{http_code} %{time_total}s\n" \
    -s "$BASE/api/health"
done
echo ""

# ── 5. 完整响应（查看实际返回数据）──────────────
echo "── 5. 健康检查完整响应 ──"
curl -s "$BASE/api/health" | head -c 500
echo ""
echo ""

echo "============================================"
echo "  测试完成"
echo "============================================"
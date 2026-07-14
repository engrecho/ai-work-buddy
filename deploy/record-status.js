#!/usr/bin/env node
// ============================================================
// 部署状态记录器 — 由 pull.sh 调用，维护 .last-deploy.json
//
// 用法：
//   node record-status.js start <commit> <commit_msg> <author> <commit_time>
//   node record-status.js step <name> <status> <duration_ms> [error]
//   node record-status.js once <name> <status> <duration_ms> <log_file>
//   node record-status.js migrate <applied_count> <failed_count>
//   node record-status.js end
//
// 状态文件：deploy/.last-deploy.json
// 历史归档：deploy/.deploys/<timestamp>.json（保留最近 20 份）
// ============================================================

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const __dirname = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const STATUS_FILE = path.join(__dirname, '.last-deploy.json');
const HISTORY_DIR = path.join(__dirname, '.deploys');

// ── 工具 ──────────────────────────────────────────────────
function readStatus() {
  try { return JSON.parse(fs.readFileSync(STATUS_FILE, 'utf-8')); }
  catch { return null; }
}

function writeStatus(data) {
  fs.writeFileSync(STATUS_FILE, JSON.stringify(data, null, 2));
}

function now() { return new Date().toISOString(); }

function archiveCurrent() {
  const cur = readStatus();
  if (!cur) return;
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  const ts = cur.started_at ? cur.started_at.replace(/[:.]/g, '-') : `unknown-${Date.now()}`;
  const histFile = path.join(HISTORY_DIR, `${ts}.json`);
  fs.writeFileSync(histFile, JSON.stringify(cur, null, 2));
  // 保留最近 20 份
  const files = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ f, mtime: fs.statSync(path.join(HISTORY_DIR, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  for (const item of files.slice(20)) {
    try { fs.unlinkSync(path.join(HISTORY_DIR, item.f)); } catch {}
  }
}

// ── 收集运行时信息 ────────────────────────────────────────
function collectRuntime() {
  const result = { pm2: null, backend_healthy: null, tables: {}, rss: null, git_remote: null };
  const PROJECT_DIR = process.env.PROJECT_DIR || path.join(__dirname, '..');

  // git remote
  try {
    result.git_remote = execSync('git remote get-url origin', { cwd: PROJECT_DIR, encoding: 'utf-8' }).trim();
  } catch {}

  // PM2 状态
  try {
    const pm2Desc = execSync('pm2 show ai-buddy-api 2>/dev/null', { encoding: 'utf-8' });
    const statusMatch = pm2Desc.match(/status\s*│?\s*(\w+)/i);
    const uptimeMatch = pm2Desc.match(/uptime\s*│?\s*(.+)/i);
    const restartsMatch = pm2Desc.match(/restarts?\s*│?\s*(\d+)/i);
    result.pm2 = {
      status: statusMatch ? statusMatch[1].trim() : 'unknown',
      uptime: uptimeMatch ? uptimeMatch[1].trim() : 'unknown',
      restarts: restartsMatch ? parseInt(restartsMatch[1], 10) : null,
    };
  } catch { result.pm2 = { status: 'not_running', uptime: null, restarts: null }; }

  // 后端健康检查
  try {
    const health = execSync('curl -s --max-time 3 http://127.0.0.1:3000/api/health 2>/dev/null', { encoding: 'utf-8' }).trim();
    result.backend_healthy = !!health;
    result.backend_health = health || null;
  } catch { result.backend_healthy = false; }

  // 数据库表 + RSS 统计
  const DB_USER = process.env.DB_USER || 'buddy';
  const DB_NAME = process.env.DB_NAME || 'buddy';
  const DB_PASSWORD = process.env.DB_PASSWORD || '';
  if (DB_PASSWORD) {
    const mysqlCmd = `mysql -u${DB_USER} -p'${DB_PASSWORD}' ${DB_NAME} -N -e`;
    try {
      const tables = execSync(`${mysqlCmd} "SHOW TABLES" 2>/dev/null`, { encoding: 'utf-8' })
        .trim().split('\n').filter(Boolean);
      const expected = ['users', 'tasks', 'memos', 'reading_items', 'rss_sources', 'rss_articles',
        'api_keys', 'task_groups', 'task_members', 'task_tags', 'task_comments', 'task_notes', 'quick_notes'];
      for (const t of expected) {
        result.tables[t] = tables.includes(t);
      }
    } catch {}

    // RSS 统计
    try {
      const srcCount = execSync(`${mysqlCmd} "SELECT COUNT(*) FROM rss_sources" 2>/dev/null`, { encoding: 'utf-8' }).trim();
      const artCount = execSync(`${mysqlCmd} "SELECT COUNT(*) FROM rss_articles" 2>/dev/null`, { encoding: 'utf-8' }).trim();
      result.rss = { sources: parseInt(srcCount, 10) || 0, articles: parseInt(artCount, 10) || 0 };
    } catch { result.rss = { sources: 0, articles: 0, error: 'rss tables missing or query failed' }; }
  }

  // 前端版本号
  try {
    const idx = fs.readFileSync(path.join(PROJECT_DIR, 'build', 'index.html'), 'utf-8');
    const m = idx.match(/app-version" content="([^"]*)"/);
    result.frontend_version = m ? m[1] : 'unknown';
  } catch { result.frontend_version = 'build_not_found'; }

  return result;
}

function tailLog(logFile, maxLines = 30) {
  try {
    const content = fs.readFileSync(logFile, 'utf-8');
    const lines = content.split('\n');
    return lines.slice(-maxLines).join('\n');
  } catch { return null; }
}

// ── 主逻辑 ────────────────────────────────────────────────
const cmd = process.argv[2];
const arg1 = process.argv[3];
const arg2 = process.argv[4];
const arg3 = process.argv[5];
const arg4 = process.argv[6];

switch (cmd) {
  case 'start': {
    // 归档上一次部署记录
    archiveCurrent();
    const [commit, commitMsg, author, commitTime] = [arg1, arg2, arg3, arg4];
    writeStatus({
      started_at: now(),
      finished_at: null,
      status: 'running',
      commit,
      commit_message: commitMsg,
      commit_author: author,
      commit_time: commitTime,
      steps: [],
      once_tasks: [],
      migrate: { applied: 0, failed: 0, details: [] },
      // runtime 在 end 时填充
      pm2: null,
      backend_healthy: null,
      frontend_version: null,
      tables: {},
      rss: null,
    });
    break;
  }
  case 'step': {
    const [name, status, durationMs, error] = [arg1, arg2, parseInt(arg3, 10), arg4];
    const cur = readStatus() || { steps: [] };
    cur.steps = cur.steps || [];
    // 更新已存在的或追加
    const idx = cur.steps.findIndex(s => s.name === name);
    const entry = { name, status, duration_ms: durationMs, error: error || null, recorded_at: now() };
    if (idx >= 0) cur.steps[idx] = entry;
    else cur.steps.push(entry);
    writeStatus(cur);
    break;
  }
  case 'once': {
    const [name, status, durationMs, logFile] = [arg1, arg2, parseInt(arg3, 10), arg4];
    const cur = readStatus() || { once_tasks: [] };
    cur.once_tasks = cur.once_tasks || [];
    const entry = {
      name,
      status,
      duration_ms: durationMs,
      log_excerpt: logFile ? tailLog(logFile, 40) : null,
      recorded_at: now(),
    };
    cur.once_tasks.push(entry);
    writeStatus(cur);
    break;
  }
  case 'migrate': {
    const [applied, failed] = [parseInt(arg1, 10) || 0, parseInt(arg2, 10) || 0];
    const cur = readStatus() || { migrate: {} };
    cur.migrate = { applied, failed, details: cur.migrate?.details || [] };
    writeStatus(cur);
    break;
  }
  case 'migrate-detail': {
    const [fname, status] = [arg1, arg2];
    const cur = readStatus() || { migrate: { details: [] } };
    cur.migrate = cur.migrate || { applied: 0, failed: 0, details: [] };
    cur.migrate.details = cur.migrate.details || [];
    cur.migrate.details.push({ name: fname, status, recorded_at: now() });
    writeStatus(cur);
    break;
  }
  case 'end': {
    const cur = readStatus() || {};
    const rt = collectRuntime();
    cur.finished_at = now();
    // 综合判定整体状态：所有 step 和 once 都成功才算 success
    const stepsOk = (cur.steps || []).every(s => s.status === 'success' || s.status === 'skipped');
    const onceOk = (cur.once_tasks || []).every(t => t.status === 'success' || t.status === 'skipped');
    const migrateOk = (cur.migrate?.failed || 0) === 0;
    cur.status = (stepsOk && onceOk && migrateOk && rt.backend_healthy) ? 'success' : 'failed';
    cur.pm2 = rt.pm2;
    cur.backend_healthy = rt.backend_healthy;
    cur.backend_health = rt.backend_health;
    cur.frontend_version = rt.frontend_version;
    cur.tables = rt.tables;
    cur.rss = rt.rss;
    cur.git_remote = rt.git_remote;
    // 总耗时
    if (cur.started_at) {
      cur.duration_ms = new Date(cur.finished_at) - new Date(cur.started_at);
    }
    writeStatus(cur);
    console.log(`[record-status] 部署状态已记录: ${cur.status} (steps=${cur.steps.length}, once=${cur.once_tasks.length})`);
    break;
  }
  default:
    console.error('用法: node record-status.js <start|step|once|migrate|migrate-detail|end> [args...]');
    process.exit(1);
}

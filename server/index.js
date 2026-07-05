import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  pool, TABLE_COLUMNS, JSON_COLUMNS, DATETIME_COLUMNS, BOOLEAN_COLUMNS, PUBLIC_TABLES
} from './db.js';
import {
  authMiddleware, optionalAuthMiddleware, generateToken,
  setAuthCookie, clearAuthCookie, registerUser, loginUser, getCurrentUser,
  updateUserProfile, changePassword,
  createApiKeyForUser, listApiKeysForUser, revokeApiKey, getUserByApiKey
} from './auth.js';
import { parseShare, parseAndDownload } from './extract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : true, // 生产环境不开放 CORS（同源）
  credentials: true, // 允许发送 Cookie
}));
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// ── 公开端点（不需要登录）──────────────────────────────────

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ══════════════════════════════════════════════════════════════
// 社媒内容解析（抖音/B站/小红书/公众号等分享文本一键识别）
// ══════════════════════════════════════════════════════════════

// 仅解析（不下载）：返回 title / platform / cover_url / summary 等
app.post('/api/extract', authMiddleware, async (req, res) => {
  const input = (req.body?.input || req.body?.text || '').toString();
  if (!input) {
    return res.json({ data: null, error: { message: '缺少 input 字段' } });
  }
  try {
    const result = await parseShare(input);
    if (result.code !== 200) {
      return res.json({ data: result, error: { message: result.message || '解析失败' } });
    }
    return res.json({ data: result, error: null });
  } catch (err) {
    console.error('extract error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 解析 + 下载到 server 端本地（对应前端"离线到本地"勾选框）
app.post('/api/extract/download', authMiddleware, async (req, res) => {
  const input = (req.body?.input || req.body?.text || '').toString();
  if (!input) {
    return res.json({ data: null, error: { message: '缺少 input 字段' } });
  }
  try {
    const result = await parseAndDownload(input);
    return res.json({ data: result, error: result.code === 200 ? null : { message: result.message } });
  } catch (err) {
    console.error('extract/download error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ── 认证路由 ────────────────────────────────────────────────

// 注册
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body;
    const user = await registerUser({ username, password, nickname });
    const token = generateToken(user);
    setAuthCookie(res, token);
    return res.json({
      data: { user, token },
      error: null,
    });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ══════════════════════════════════════════════════════════════
// API Key 管理（用户在网页上创建，供外部工具使用）
// ══════════════════════════════════════════════════════════════

// 创建新的 API Key
app.post('/api/auth/api-keys', authMiddleware, async (req, res) => {
  try {
    const { name, expires_in_days } = req.body;
    const result = await createApiKeyForUser(req.user.id, {
      name: name || 'Default',
      expiresInDays: expires_in_days,
    });
    return res.json({ data: result, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 列出当前用户的所有 API Key
app.get('/api/auth/api-keys', authMiddleware, async (req, res) => {
  try {
    const keys = await listApiKeysForUser(req.user.id);
    return res.json({ data: keys, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 撤销 API Key
app.delete('/api/auth/api-keys/:id', authMiddleware, async (req, res) => {
  try {
    const success = await revokeApiKey(req.user.id, parseInt(req.params.id, 10));
    return res.json({ data: { success }, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 登录
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.json({ data: null, error: { message: '请输入用户名和密码' } });
    }
    const user = await loginUser({ username, password });
    const token = generateToken(user);
    setAuthCookie(res, token);
    return res.json({
      data: { user, token },
      error: null,
    });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 登出
app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  return res.json({ data: { success: true }, error: null });
});

// 获取当前用户（需要登录）
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await getCurrentUser(req.user.id);
    if (!user) {
      return res.json({ data: null, error: { message: '用户不存在' } });
    }
    return res.json({ data: user, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 更新用户资料（需要登录）
app.patch('/api/auth/profile', authMiddleware, async (req, res) => {
  try {
    const { nickname, avatar_url } = req.body;
    const user = await updateUserProfile(req.user.id, { nickname, avatar_url });
    return res.json({ data: user, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// 修改密码（需要登录）
app.post('/api/auth/change-password', authMiddleware, async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) {
      return res.json({ data: null, error: { message: '请输入原密码和新密码' } });
    }
    const result = await changePassword(req.user.id, old_password, new_password);
    return res.json({ data: result, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ── 工具函数 ────────────────────────────────────────────────

const ALLOWED_TABLES = new Set(Object.keys(TABLE_COLUMNS));
const TABLES_WITH_USER_ID = new Set([
  'tasks', 'task_groups', 'task_members', 'task_tags', 'task_comments',
  'memos', 'task_notes', 'reading_items', 'quick_notes'
]);

function validateColumn(table, column) {
  return TABLE_COLUMNS[table]?.includes(column);
}

function escapeId(name) {
  return '`' + String(name).replace(/`/g, '``') + '`';
}

function isoToMysqlDatetime(value) {
  if (typeof value !== 'string') return value;
  const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d+)?Z?$/);
  if (isoMatch) return `${isoMatch[1]} ${isoMatch[2]}`;
  const dateOnlyMatch = value.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnlyMatch) return `${dateOnlyMatch[1]} 00:00:00`;
  return value;
}

function mysqlDatetimeToIso(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'string') return value;
  const dtMatch = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(\.\d+)?$/);
  if (dtMatch) return `${dtMatch[1]}T${dtMatch[2]}.000Z`;
  const dateOnlyMatch = value.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnlyMatch) return `${dateOnlyMatch[1]}T00:00:00.000Z`;
  return value;
}

function prepareValue(table, column, value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (BOOLEAN_COLUMNS[table]?.includes(column)) {
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return value ? 1 : 0;
  }
  if (DATETIME_COLUMNS[table]?.includes(column)) {
    return isoToMysqlDatetime(value);
  }
  if (JSON_COLUMNS[table]?.includes(column) && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

function transformRow(table, row) {
  if (!row) return row;
  for (const col of (JSON_COLUMNS[table] || [])) {
    if (row[col] !== null && typeof row[col] === 'string') {
      try { row[col] = JSON.parse(row[col]); } catch {}
    }
  }
  for (const col of (DATETIME_COLUMNS[table] || [])) {
    if (row[col] !== null && row[col] !== undefined) {
      row[col] = mysqlDatetimeToIso(row[col]);
    }
  }
  for (const col of (BOOLEAN_COLUMNS[table] || [])) {
    if (row[col] !== null && row[col] !== undefined) {
      row[col] = row[col] === 1 || row[col] === true;
    }
  }
  return row;
}

function parseFilters(filterArray, table, userId) {
  const conditions = [];
  const params = [];

  // 自动注入 user_id 过滤（仅对需要登录的表）
  if (TABLES_WITH_USER_ID.has(table) && userId != null) {
    conditions.push('`user_id` = ?');
    params.push(userId);
  }

  for (const f of filterArray) {
    const parts = f.split(':');
    if (parts.length < 3) continue;
    const type = parts[0];
    const column = parts[1];
    const valueStr = parts.slice(2).join(':');

    if (!validateColumn(table, column)) continue;
    // 禁止客户端覆盖 user_id 过滤
    if (column === 'user_id') continue;

    let value;
    try { value = JSON.parse(valueStr); } catch { value = valueStr; }

    const col = escapeId(column);
    switch (type) {
      case 'eq':
        if (value === null) conditions.push(`${col} IS NULL`);
        else if (typeof value === 'boolean') {
          conditions.push(`${col} = ?`);
          params.push(value ? 1 : 0);
        } else {
          conditions.push(`${col} = ?`);
          params.push(DATETIME_COLUMNS[table]?.includes(column) ? isoToMysqlDatetime(value) : value);
        }
        break;
      case 'neq':
        if (value === null) conditions.push(`${col} IS NOT NULL`);
        else { conditions.push(`${col} != ?`); params.push(value); }
        break;
      case 'is':
        if (value === null) conditions.push(`${col} IS NULL`);
        else if (value === true) conditions.push(`${col} = 1`);
        else if (value === false) conditions.push(`${col} = 0`);
        break;
      case 'in':
        if (Array.isArray(value) && value.length > 0) {
          conditions.push(`${col} IN (${value.map(() => '?').join(', ')})`);
          params.push(...value);
        }
        break;
      case 'gt':
        conditions.push(`${col} > ?`);
        params.push(DATETIME_COLUMNS[table]?.includes(column) ? isoToMysqlDatetime(value) : value);
        break;
      case 'gte':
        conditions.push(`${col} >= ?`);
        params.push(DATETIME_COLUMNS[table]?.includes(column) ? isoToMysqlDatetime(value) : value);
        break;
      case 'lt':
        conditions.push(`${col} < ?`);
        params.push(DATETIME_COLUMNS[table]?.includes(column) ? isoToMysqlDatetime(value) : value);
        break;
      case 'lte':
        conditions.push(`${col} <= ?`);
        params.push(DATETIME_COLUMNS[table]?.includes(column) ? isoToMysqlDatetime(value) : value);
        break;
      case 'like':
        conditions.push(`${col} LIKE ?`);
        params.push(value);
        break;
    }
  }

  return { conditions, params };
}

function parseOrder(orderArray, table) {
  const orderClauses = [];
  for (const o of orderArray) {
    const [column, direction] = o.split(':');
    if (!validateColumn(table, column)) continue;
    if (column === 'user_id') continue; // 禁止按 user_id 排序
    const dir = direction === 'desc' ? 'DESC' : 'ASC';
    orderClauses.push(`${escapeId(column)} ${dir}`);
  }
  return orderClauses;
}

function parseSelect(selectStr, table) {
  if (!selectStr || selectStr === '*') return '*';
  const columns = selectStr.split(',').map(c => c.trim()).filter(Boolean);
  const valid = columns.filter(c => validateColumn(table, c));
  if (valid.length === 0) return '*';
  return valid.map(c => escapeId(c)).join(', ');
}

// ── 通用 CRUD 中间件 ────────────────────────────────────────
// 业务表需要登录后才能访问
function requireAuthForBusinessTable(req, res, next) {
  const { table } = req.params;
  // users 表走专门路由，不在这里处理
  if (table === 'users') {
    return res.json({ data: null, error: { message: 'Forbidden' } });
  }
  if (PUBLIC_TABLES.has(table)) return next();
  if (TABLES_WITH_USER_ID.has(table)) return authMiddleware(req, res, next);
  return next();
}

// ════════════════════════════════════════════════════════════
// 通用 CRUD 路由
// ════════════════════════════════════════════════════════════

// SELECT
app.get('/api/:table', requireAuthForBusinessTable, async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) {
    return res.json({ data: null, error: { message: `Table "${table}" not found` } });
  }

  try {
    const { select, filter, order, limit, single, count } = req.query;
    const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
    const orders = Array.isArray(order) ? order : order ? [order] : [];

    const userId = TABLES_WITH_USER_ID.has(table) ? req.user?.id : null;
    const { conditions, params } = parseFilters(filters, table, userId);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const selectClause = parseSelect(select, table);
    const orderClauses = parseOrder(orders, table);
    const orderClause = orderClauses.length > 0 ? `ORDER BY ${orderClauses.join(', ')}` : '';
    const limitClause = limit ? `LIMIT ${parseInt(limit, 10)}` : '';

    let countResult = null;
    if (count === 'exact') {
      const countSql = `SELECT COUNT(*) as total FROM ${escapeId(table)} ${whereClause}`;
      const [countRows] = await pool.query(countSql, params);
      countResult = countRows[0]?.total ?? 0;
    }

    const sql = `SELECT ${selectClause} FROM ${escapeId(table)} ${whereClause} ${orderClause} ${limitClause}`;
    const [rows] = await pool.query(sql, params);
    const data = rows.map(row => transformRow(table, row));

    if (single === '1') {
      return res.json({ data: data[0] || null, error: null, count: countResult });
    }
    return res.json({ data, error: null, count: countResult });
  } catch (err) {
    console.error('SELECT error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// INSERT
app.post('/api/:table', requireAuthForBusinessTable, async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) {
    return res.json({ data: null, error: { message: `Table "${table}" not found` } });
  }

  try {
    const rows = Array.isArray(req.body) ? req.body : [req.body];
    if (rows.length === 0) {
      return res.json({ data: null, error: { message: 'No data provided' } });
    }

    const validCols = TABLE_COLUMNS[table];
    const columns = [];
    const valueRows = [];

    // 自动注入 user_id
    const autoUserId = TABLES_WITH_USER_ID.has(table) ? req.user.id : null;

    const allKeys = new Set();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (validCols.includes(key) && key !== 'user_id') allKeys.add(key); // 禁止客户端设置 user_id
      }
    }
    if (autoUserId !== null) {
      allKeys.add('user_id');
    }
    columns.push(...allKeys);

    for (const row of rows) {
      const values = columns.map(col => {
        if (col === 'user_id') return autoUserId;
        return prepareValue(table, col, row[col]);
      });
      valueRows.push(values);
    }

    const placeholders = valueRows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    const allValues = valueRows.flat();
    const columnList = columns.map(c => escapeId(c)).join(', ');
    const sql = `INSERT INTO ${escapeId(table)} (${columnList}) VALUES ${placeholders}`;

    const [result] = await pool.query(sql, allValues);

    let data = null;
    if (rows.length === 1) {
      data = { ...rows[0], user_id: autoUserId };
      if (result.insertId) data.id = result.insertId;
    } else {
      data = rows.map(r => ({ ...r, user_id: autoUserId }));
    }

    return res.json({ data, error: null });
  } catch (err) {
    console.error('INSERT error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// UPDATE
app.patch('/api/:table', requireAuthForBusinessTable, async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) {
    return res.json({ data: null, error: { message: `Table "${table}" not found` } });
  }

  try {
    const { filter, order, limit, single, return: returnData, select } = req.query;
    const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
    const orders = Array.isArray(order) ? order : order ? [order] : [];

    const userId = TABLES_WITH_USER_ID.has(table) ? req.user?.id : null;
    const { conditions, params } = parseFilters(filters, table, userId);
    if (conditions.length === 0) {
      return res.json({ data: null, error: { message: 'UPDATE requires filter' } });
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const patch = req.body;
    const validCols = TABLE_COLUMNS[table];
    const setColumns = [];
    const setParams = [];

    for (const [key, value] of Object.entries(patch)) {
      // 禁止客户端修改 user_id 和 password_hash
      if (key === 'user_id' || key === 'password_hash') continue;
      if (validCols.includes(key)) {
        setColumns.push(`${escapeId(key)} = ?`);
        setParams.push(prepareValue(table, key, value));
      }
    }

    // 自动更新 updated_at
    const TABLES_WITH_UPDATED_AT = ['tasks', 'task_groups', 'memos', 'task_notes'];
    if (TABLES_WITH_UPDATED_AT.includes(table) && !patch.updated_at) {
      setColumns.push('`updated_at` = CURRENT_TIMESTAMP');
    }

    if (setColumns.length === 0) {
      return res.json({ data: null, error: { message: 'No valid columns to update' } });
    }

    const orderClauses = parseOrder(orders, table);
    const orderClause = orderClauses.length > 0 ? `ORDER BY ${orderClauses.join(', ')}` : '';
    const limitClause = limit ? `LIMIT ${parseInt(limit, 10)}` : '';

    const sql = `UPDATE ${escapeId(table)} SET ${setColumns.join(', ')} ${whereClause} ${orderClause} ${limitClause}`;
    const allParams = [...setParams, ...params];
    await pool.query(sql, allParams);

    if (returnData === '1') {
      const selectClause = parseSelect(select, table);
      const selectSql = `SELECT ${selectClause} FROM ${escapeId(table)} ${whereClause}`;
      const [rows] = await pool.query(selectSql, params);
      const data = rows.map(row => transformRow(table, row));
      if (single === '1') return res.json({ data: data[0] || null, error: null });
      return res.json({ data, error: null });
    }

    return res.json({ data: null, error: null });
  } catch (err) {
    console.error('UPDATE error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// DELETE
app.delete('/api/:table', requireAuthForBusinessTable, async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) {
    return res.json({ data: null, error: { message: `Table "${table}" not found` } });
  }

  try {
    const { filter, order, limit } = req.query;
    const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
    const orders = Array.isArray(order) ? order : order ? [order] : [];

    const userId = TABLES_WITH_USER_ID.has(table) ? req.user?.id : null;
    const { conditions, params } = parseFilters(filters, table, userId);
    if (conditions.length === 0) {
      return res.json({ data: null, error: { message: 'DELETE requires filter' } });
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const orderClauses = parseOrder(orders, table);
    const orderClause = orderClauses.length > 0 ? `ORDER BY ${orderClauses.join(', ')}` : '';
    const limitClause = limit ? `LIMIT ${parseInt(limit, 10)}` : '';

    const sql = `DELETE FROM ${escapeId(table)} ${whereClause} ${orderClause} ${limitClause}`;
    await pool.query(sql, params);

    return res.json({ data: null, error: null });
  } catch (err) {
    console.error('DELETE error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ══════════════════════════════════════════════════════════════
// SKILL API v1（供 buddy-skill 工具使用，使用 API Key 认证）
// ══════════════════════════════════════════════════════════════

const API_KEY_TABLES = new Set(['tasks', 'task_groups', 'memos', 'task_notes', 'reading_items', 'quick_notes']);

// API Key 认证中间件
async function apiKeyAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) {
    return res.status(401).json({
      data: null,
      error: { message: '缺少 X-API-Key 请求头' },
    });
  }
  const result = await getUserByApiKey(apiKey);
  if (!result) {
    return res.status(401).json({
      data: null,
      error: { message: 'API Key 无效或已过期' },
    });
  }
  req.user = result.user;
  req.apiKeyId = result.api_key_id;
  next();
}

// 列出任务
app.get('/api/v1/tasks', apiKeyAuth, async (req, res) => {
  const filters = parseApiFilters(req.query, 'tasks');
  const userId = req.user.id;
  const { sql, params } = buildSelectSql('tasks', userId, filters, {
    order: req.query.order,
    limit: req.query.limit,
  });
  const [rows] = await pool.query(sql, params);
  res.json({ data: rows.map(r => transformRow('tasks', r)), error: null });
});

// 获取单条任务
app.get('/api/v1/tasks/:id', apiKeyAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    return res.json({ data: null, error: { message: 'id 必须是数字' } });
  }
  try {
    const [rows] = await pool.query(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?',
      [id, req.user.id]
    );
    const row = rows[0];
    if (!row) {
      return res.json({ data: null, error: { message: '任务不存在或无权限' } });
    }
    res.json({ data: transformRow('tasks', row), error: null });
  } catch (err) {
    res.json({ data: null, error: { message: err.message } });
  }
});

// 创建任务
app.post('/api/v1/tasks', apiKeyAuth, async (req, res) => {
  try {
    const row = { ...req.body, user_id: req.user.id };
    const { sql, params } = buildInsertSql('tasks', [row]);
    const [result] = await pool.query(sql, params);
    res.status(201).json({ data: { ...row, id: result.insertId || row.id }, error: null });
  } catch (err) {
    res.json({ data: null, error: { message: err.message } });
  }
});

// 更新任务
app.patch('/api/v1/tasks/:id', apiKeyAuth, async (req, res) => {
  try {
    const { sql, params } = buildUpdateSql('tasks', req.user.id, parseInt(req.params.id, 10), req.body);
    if (!sql) {
      return res.json({ data: null, error: { message: '没有可更新的字段' } });
    }
    await pool.query(sql, params);
    res.json({ data: { success: true }, error: null });
  } catch (err) {
    res.json({ data: null, error: { message: err.message } });
  }
});

// 删除任务（必须 confirm=true）
app.delete('/api/v1/tasks/:id', apiKeyAuth, async (req, res) => {
  if (req.query.confirm !== 'true') {
    return res.json({
      data: null,
      error: {
        message: '删除任务需要 confirm=true。SKILL 必须先向用户列出计划并取得确认。',
        code: 'CONFIRMATION_REQUIRED',
      },
    });
  }
  try {
    await pool.query(
      'DELETE FROM tasks WHERE id = ? AND user_id = ?',
      [parseInt(req.params.id, 10), req.user.id]
    );
    res.json({ data: { success: true }, error: null });
  } catch (err) {
    res.json({ data: null, error: { message: err.message } });
  }
});

// 批量整理任务（dry_run=true 时只列计划不执行）
app.post('/api/v1/tasks/organize', apiKeyAuth, async (req, res) => {
  try {
    const { plan, dry_run = true } = req.body;

    if (!plan || !Array.isArray(plan) || plan.length === 0) {
      return res.json({ data: null, error: { message: 'plan 必须是包含操作的数组' } });
    }

    // 校验 plan 格式
    for (const op of plan) {
      if (!op.action || !['update', 'delete', 'create'].includes(op.action)) {
        return res.json({
          data: null,
          error: { message: `不支持的操作：${op.action}（仅支持 create/update/delete）` },
        });
      }
    }

    if (dry_run) {
      // dry_run 模式只返回计划预览，不实际执行
      return res.json({
        data: {
          dry_run: true,
          plan,
          affected_tasks: plan.filter(o => o.id).map(o => o.id),
          summary: plan.map(op => describePlanOp(op)),
        },
        error: null,
      });
    }

    // 实际执行：用事务确保原子性
    const conn = await pool.getConnection();
    await conn.beginTransaction();
    try {
      const results = [];
      for (const op of plan) {
        if (op.action === 'update') {
          const { sql, params } = buildUpdateSql('tasks', req.user.id, op.id, op.changes || {});
          if (sql) {
            const [r] = await conn.query(sql, params);
            results.push({ id: op.id, action: 'update', affected: r.affectedRows });
          }
        } else if (op.action === 'delete') {
          const [r] = await conn.query(
            'DELETE FROM tasks WHERE id = ? AND user_id = ?',
            [op.id, req.user.id]
          );
          results.push({ id: op.id, action: 'delete', affected: r.affectedRows });
        } else if (op.action === 'create') {
          const row = { ...op.data, user_id: req.user.id };
          const { sql, params } = buildInsertSql('tasks', [row]);
          const [r] = await conn.query(sql, params);
          results.push({ id: r.insertId || row.id, action: 'create' });
        }
      }
      await conn.commit();
      res.json({ data: { dry_run: false, results }, error: null });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  } catch (err) {
    res.json({ data: null, error: { message: err.message } });
  }
});

// 通用列表接口（备忘/阅读/随记）
for (const table of ['memos', 'reading_items', 'quick_notes']) {
  app.get(`/api/v1/${table === 'reading_items' ? 'reading' : table === 'memos' ? 'memos' : 'quick-notes'}`, apiKeyAuth, async (req, res) => {
    const filters = parseApiFilters(req.query, table);
    const { sql, params } = buildSelectSql(table, req.user.id, filters, {
      order: req.query.order,
      limit: req.query.limit,
    });
    const [rows] = await pool.query(sql, params);
    res.json({ data: rows.map(r => transformRow(table, r)), error: null });
  });

  app.get(`/api/v1/${table === 'reading_items' ? 'reading' : table === 'memos' ? 'memos' : 'quick-notes'}/:id`, apiKeyAuth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.json({ data: null, error: { message: 'id 必须是数字' } });
    }
    try {
      const [rows] = await pool.query(
        `SELECT * FROM ${escapeId(table)} WHERE id = ? AND user_id = ?`,
        [id, req.user.id]
      );
      const row = rows[0];
      if (!row) {
        return res.json({ data: null, error: { message: '记录不存在或无权限' } });
      }
      res.json({ data: transformRow(table, row), error: null });
    } catch (err) {
      res.json({ data: null, error: { message: err.message } });
    }
  });

  app.post(`/api/v1/${table === 'reading_items' ? 'reading' : table === 'memos' ? 'memos' : 'quick-notes'}`, apiKeyAuth, async (req, res) => {
    try {
      const row = { ...req.body, user_id: req.user.id };
      const { sql, params } = buildInsertSql(table, [row]);
      const [result] = await pool.query(sql, params);
      res.status(201).json({ data: { ...row, id: result.insertId || row.id }, error: null });
    } catch (err) {
      res.json({ data: null, error: { message: err.message } });
    }
  });
}

// 获取任务分组
app.get('/api/v1/task-groups', apiKeyAuth, async (req, res) => {
  const { sql, params } = buildSelectSql('task_groups', req.user.id, [], { order: 'sort_order:asc' });
  const [rows] = await pool.query(sql, params);
  res.json({ data: rows.map(r => transformRow('task_groups', r)), error: null });
});

// 获取当前用户信息（验证 API Key 用）
app.get('/api/v1/me', apiKeyAuth, async (req, res) => {
  res.json({ data: req.user, error: null });
});

// ══════════════════════════════════════════════════════════════
// SKILL API：社媒内容解析（供 buddy-skill / 外部工具调用）
// ══════════════════════════════════════════════════════════════

app.post('/api/v1/extract', apiKeyAuth, async (req, res) => {
  const input = (req.body?.input || req.body?.text || '').toString();
  if (!input) {
    return res.json({ data: null, error: { message: '缺少 input 字段' } });
  }
  try {
    const result = await parseShare(input);
    if (result.code !== 200) {
      return res.json({ data: result, error: { message: result.message || '解析失败' } });
    }
    return res.json({ data: result, error: null });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

app.post('/api/v1/extract/download', apiKeyAuth, async (req, res) => {
  const input = (req.body?.input || req.body?.text || '').toString();
  if (!input) {
    return res.json({ data: null, error: { message: '缺少 input 字段' } });
  }
  try {
    const result = await parseAndDownload(input);
    return res.json({ data: result, error: result.code === 200 ? null : { message: result.message } });
  } catch (err) {
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ── 工具函数：SKILL API 用的 SQL 构建 ─────────────────────

function parseApiFilters(query, table) {
  const filters = [];
  for (const key of Object.keys(query)) {
    if (key.startsWith('filter_')) {
      const col = key.slice(7);
      if (!validateColumn(table, col)) continue;
      const value = query[key];
      // 数组形式（多个值）= in 查询
      if (Array.isArray(value)) {
        filters.push({ type: 'in', column: col, value });
      } else {
        filters.push({ type: 'eq', column: col, value });
      }
    } else if (key === 'q' && typeof query[key] === 'string') {
      // 简单模糊查询（title 包含关键字）
      filters.push({ type: 'like', column: 'title', value: `%${query[key]}%` });
    } else if (key === 'status' || key === 'priority' || key === 'is_project' || key === 'is_read' || key === 'is_starred') {
      // 常用字段直接作为过滤
      const value = query[key];
      if (Array.isArray(value)) {
        filters.push({ type: 'in', column: key, value });
      } else {
        filters.push({ type: 'eq', column: key, value: value === 'true' ? true : value === 'false' ? false : value });
      }
    }
  }
  return filters;
}

function buildSelectSql(table, userId, filters, { order, limit } = {}) {
  const conditions = ['`user_id` = ?'];
  const params = [userId];

  for (const f of filters) {
    if (!validateColumn(table, f.column)) continue;
    if (f.column === 'user_id') continue;
    const col = escapeId(f.column);
    if (f.type === 'eq') {
      conditions.push(`${col} = ?`);
      params.push(prepareValue(table, f.column, f.value));
    } else if (f.type === 'in' && Array.isArray(f.value) && f.value.length) {
      const placeholders = f.value.map(() => '?').join(', ');
      conditions.push(`${col} IN (${placeholders})`);
      params.push(...f.value);
    } else if (f.type === 'like') {
      conditions.push(`${col} LIKE ?`);
      params.push(f.value);
    }
  }

  let orderClause = '';
  if (order) {
    const orderClauses = parseOrder([order], table);
    if (orderClauses.length > 0) orderClause = `ORDER BY ${orderClauses.join(', ')}`;
  }
  const limitClause = limit ? `LIMIT ${parseInt(limit, 10)}` : '';

  const sql = `SELECT * FROM ${escapeId(table)} WHERE ${conditions.join(' AND ')} ${orderClause} ${limitClause}`;
  return { sql, params };
}

function buildInsertSql(table, rows) {
  const validCols = TABLE_COLUMNS[table];
  const allKeys = new Set();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (validCols.includes(key)) allKeys.add(key);
    }
  }
  const columns = [...allKeys];
  const valueRows = rows.map(row => columns.map(col => prepareValue(table, col, row[col])));
  const placeholders = valueRows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
  const sql = `INSERT INTO ${escapeId(table)} (${columns.map(c => escapeId(c)).join(', ')}) VALUES ${placeholders}`;
  return { sql, params: valueRows.flat() };
}

function buildUpdateSql(table, userId, id, patch) {
  const validCols = TABLE_COLUMNS[table];
  const setColumns = [];
  const setParams = [];
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'user_id' || key === 'id') continue;
    if (validCols.includes(key)) {
      setColumns.push(`${escapeId(key)} = ?`);
      setParams.push(prepareValue(table, key, value));
    }
  }
  if (['tasks', 'task_groups', 'memos', 'task_notes'].includes(table) && !patch.updated_at) {
    setColumns.push('`updated_at` = CURRENT_TIMESTAMP');
  }
  if (setColumns.length === 0) return { sql: null, params: [] };
  const sql = `UPDATE ${escapeId(table)} SET ${setColumns.join(', ')} WHERE id = ? AND user_id = ?`;
  return { sql, params: [...setParams, id, userId] };
}

function describePlanOp(op) {
  if (op.action === 'update') {
    const changes = Object.entries(op.changes || {}).map(([k, v]) => `${k}=${v}`).join(', ');
    return `更新任务 ${op.id}: ${changes}`;
  }
  if (op.action === 'delete') {
    return `删除任务 ${op.id}`;
  }
  if (op.action === 'create') {
    return `创建任务: ${op.data?.title || '(无标题)'}`;
  }
  return JSON.stringify(op);
}

// ── 启动服务器 ──────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`AI-Buddy API server running on http://127.0.0.1:${PORT}`);
});

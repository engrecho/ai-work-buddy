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
  updateUserProfile, changePassword
} from './auth.js';

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

// ── 启动服务器 ──────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
  console.log(`AI Work Buddy API server running on http://127.0.0.1:${PORT}`);
});

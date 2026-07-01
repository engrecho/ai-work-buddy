import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool, TABLE_COLUMNS, JSON_COLUMNS } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 从项目根目录加载 .env
dotenv.config({ path: path.join(__dirname, '../.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ── 健康检查（必须在 /api/:table 之前定义）──────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 表名白名单 ──────────────────────────────────────────────
const ALLOWED_TABLES = new Set(Object.keys(TABLE_COLUMNS));

// ── 验证列名 ─────────────────────────────────────────────────
function validateColumn(table, column) {
  return TABLE_COLUMNS[table]?.includes(column);
}

// ── 转义标识符（反引号）──────────────────────────────────────
function escapeId(name) {
  return '`' + String(name).replace(/`/g, '``') + '`';
}

// ── 准备值（JSON 列 stringify，布尔转 0/1）──────────────────
function prepareValue(table, column, value) {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (JSON_COLUMNS[table]?.includes(column) && typeof value === 'object') {
    return JSON.stringify(value);
  }
  return value;
}

// ── 解析过滤器 ──────────────────────────────────────────────
// 格式: type:column:JSON_value
// 例如: eq:status:"todo"  is:deleted_at:null  in:id:[1,2,3]
function parseFilters(filterArray, table) {
  const conditions = [];
  const params = [];

  for (const f of filterArray) {
    const parts = f.split(':');
    if (parts.length < 3) continue;
    const type = parts[0];
    const column = parts[1];
    const valueStr = parts.slice(2).join(':');

    if (!validateColumn(table, column)) continue;

    let value;
    try {
      value = JSON.parse(valueStr);
    } catch {
      value = valueStr;
    }

    const col = escapeId(column);

    switch (type) {
      case 'eq':
        if (value === null) {
          conditions.push(`${col} IS NULL`);
        } else if (typeof value === 'boolean') {
          conditions.push(`${col} = ?`);
          params.push(value ? 1 : 0);
        } else {
          conditions.push(`${col} = ?`);
          params.push(value);
        }
        break;
      case 'neq':
        if (value === null) {
          conditions.push(`${col} IS NOT NULL`);
        } else {
          conditions.push(`${col} != ?`);
          params.push(value);
        }
        break;
      case 'is':
        if (value === null) {
          conditions.push(`${col} IS NULL`);
        } else if (value === true) {
          conditions.push(`${col} = 1`);
        } else if (value === false) {
          conditions.push(`${col} = 0`);
        }
        break;
      case 'in':
        if (Array.isArray(value) && value.length > 0) {
          const placeholders = value.map(() => '?').join(', ');
          conditions.push(`${col} IN (${placeholders})`);
          params.push(...value);
        }
        break;
      case 'gt':
        conditions.push(`${col} > ?`);
        params.push(value);
        break;
      case 'gte':
        conditions.push(`${col} >= ?`);
        params.push(value);
        break;
      case 'lt':
        conditions.push(`${col} < ?`);
        params.push(value);
        break;
      case 'lte':
        conditions.push(`${col} <= ?`);
        params.push(value);
        break;
      case 'like':
        conditions.push(`${col} LIKE ?`);
        params.push(value);
        break;
    }
  }

  return { conditions, params };
}

// ── 解析排序 ────────────────────────────────────────────────
// 格式: column:asc  或  column:desc
function parseOrder(orderArray, table) {
  const orderClauses = [];
  for (const o of orderArray) {
    const [column, direction] = o.split(':');
    if (!validateColumn(table, column)) continue;
    const dir = direction === 'desc' ? 'DESC' : 'ASC';
    orderClauses.push(`${escapeId(column)} ${dir}`);
  }
  return orderClauses;
}

// ── 解析 SELECT 列 ──────────────────────────────────────────
function parseSelect(selectStr, table) {
  if (!selectStr || selectStr === '*') return '*';
  const columns = selectStr.split(',').map(c => c.trim()).filter(Boolean);
  const valid = columns.filter(c => validateColumn(table, c));
  if (valid.length === 0) return '*';
  return valid.map(c => escapeId(c)).join(', ');
}

// ── 转换 MySQL 行数据 ──────────────────────────────────────
// 解析 JSON 列，转换 TINYINT 为 boolean
function transformRow(table, row) {
  if (!row) return row;
  for (const col of (JSON_COLUMNS[table] || [])) {
    if (row[col] !== null && typeof row[col] === 'string') {
      try {
        row[col] = JSON.parse(row[col]);
      } catch {
        // 保留原始字符串
      }
    }
  }
  // TINYINT(1) 列保持 0/1，前端代码用 !value 判断，兼容
  return row;
}

// ════════════════════════════════════════════════════════════
// 路由处理
// ════════════════════════════════════════════════════════════

// ── SELECT (GET) ────────────────────────────────────────────
app.get('/api/:table', async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) {
    return res.json({ data: null, error: { message: `Table "${table}" not found` } });
  }

  try {
    const { select, filter, order, limit, single, count } = req.query;
    const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
    const orders = Array.isArray(order) ? order : order ? [order] : [];

    const { conditions, params } = parseFilters(filters, table);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const selectClause = parseSelect(select, table);
    const orderClauses = parseOrder(orders, table);
    const orderClause = orderClauses.length > 0 ? `ORDER BY ${orderClauses.join(', ')}` : '';
    const limitClause = limit ? `LIMIT ${parseInt(limit, 10)}` : '';

    // 如果请求了 count，先执行 COUNT 查询
    let countResult = null;
    if (count === 'exact') {
      const countSql = `SELECT COUNT(*) as total FROM ${escapeId(table)} ${whereClause}`;
      const [countRows] = await pool.query(countSql, params);
      countResult = countRows[0]?.total ?? 0;
    }

    // 主查询
    const sql = `SELECT ${selectClause} FROM ${escapeId(table)} ${whereClause} ${orderClause} ${limitClause}`;
    const [rows] = await pool.query(sql, params);

    const data = rows.map(row => transformRow(table, row));

    if (single === '1') {
      return res.json({
        data: data[0] || null,
        error: null,
        count: countResult,
      });
    }

    return res.json({
      data,
      error: null,
      count: countResult,
    });
  } catch (err) {
    console.error('SELECT error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ── INSERT (POST) ────────────────────────────────────────────
app.post('/api/:table', async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) {
    return res.json({ data: null, error: { message: `Table "${table}" not found` } });
  }

  try {
    const rows = Array.isArray(req.body) ? req.body : [req.body];
    if (rows.length === 0) {
      return res.json({ data: null, error: { message: 'No data provided' } });
    }

    // 获取有效列
    const validCols = TABLE_COLUMNS[table];
    const columns = [];
    const valueRows = [];

    // 收集所有出现的列名
    const allKeys = new Set();
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        if (validCols.includes(key)) allKeys.add(key);
      }
    }
    columns.push(...allKeys);

    // 构建值
    for (const row of rows) {
      const values = columns.map(col => prepareValue(table, col, row[col]));
      valueRows.push(values);
    }

    const placeholders = valueRows.map(() => `(${columns.map(() => '?').join(', ')})`).join(', ');
    const allValues = valueRows.flat();

    const columnList = columns.map(c => escapeId(c)).join(', ');
    const sql = `INSERT INTO ${escapeId(table)} (${columnList}) VALUES ${placeholders}`;

    const [result] = await pool.query(sql, allValues);

    // 如果只有一个插入且有 insertId，返回带 id 的数据
    let data = null;
    if (rows.length === 1) {
      data = { ...rows[0] };
      if (result.insertId) data.id = result.insertId;
    } else {
      data = rows;
    }

    return res.json({ data, error: null });
  } catch (err) {
    console.error('INSERT error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ── UPDATE (PATCH) ───────────────────────────────────────────
app.patch('/api/:table', async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) {
    return res.json({ data: null, error: { message: `Table "${table}" not found` } });
  }

  try {
    const { filter, order, limit, single, return: returnData, select } = req.query;
    const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
    const orders = Array.isArray(order) ? order : order ? [order] : [];

    const { conditions, params } = parseFilters(filters, table);
    if (conditions.length === 0) {
      return res.json({ data: null, error: { message: 'UPDATE requires at least one filter' } });
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    // 构建 SET 子句
    const patch = req.body;
    const validCols = TABLE_COLUMNS[table];
    const setColumns = [];
    const setParams = [];

    for (const [key, value] of Object.entries(patch)) {
      if (validCols.includes(key)) {
        setColumns.push(`${escapeId(key)} = ?`);
        setParams.push(prepareValue(table, key, value));
      }
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

    // 如果请求返回数据
    if (returnData === '1') {
      const selectClause = parseSelect(select, table);
      const selectSql = `SELECT ${selectClause} FROM ${escapeId(table)} ${whereClause}`;
      const [rows] = await pool.query(selectSql, params);
      const data = rows.map(row => transformRow(table, row));

      if (single === '1') {
        return res.json({ data: data[0] || null, error: null });
      }
      return res.json({ data, error: null });
    }

    return res.json({ data: null, error: null });
  } catch (err) {
    console.error('UPDATE error:', err);
    return res.json({ data: null, error: { message: err.message } });
  }
});

// ── DELETE (DELETE) ──────────────────────────────────────────
app.delete('/api/:table', async (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.has(table)) {
    return res.json({ data: null, error: { message: `Table "${table}" not found` } });
  }

  try {
    const { filter, order, limit } = req.query;
    const filters = Array.isArray(filter) ? filter : filter ? [filter] : [];
    const orders = Array.isArray(order) ? order : order ? [order] : [];

    const { conditions, params } = parseFilters(filters, table);
    if (conditions.length === 0) {
      return res.json({ data: null, error: { message: 'DELETE requires at least one filter' } });
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

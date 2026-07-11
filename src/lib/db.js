/**
 * Supabase 兼容包装器
 * 模拟 @supabase/supabase-js 的链式 API，底层通过 HTTP 调用 Express + MySQL 后端
 *
 * 支持的 API（与原 Supabase JS 客户端完全兼容）:
 *   supabase.from('table').select(columns, { count })
 *   supabase.from('table').insert([data])
 *   supabase.from('table').update(data).eq('id', value)
 *   supabase.from('table').delete().eq('id', value)
 *
 * 支持的链式方法:
 *   .eq(column, value)       WHERE column = value
 *   .neq(column, value)      WHERE column != value
 *   .in(column, [values])    WHERE column IN (values)
 *   .is(column, null)        WHERE column IS NULL
 *   .order(column, { ascending, nullsFirst })
 *   .limit(n)
 *   .single()                返回单行
 *   .select() after update   返回更新后的数据
 *
 * 返回格式: { data, error, count }
 */

// API 基础路径（开发和生产环境都通过 /api 前缀访问）
const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// 从 localStorage 读取 token（用于在 fetch 请求头中携带）
function getAuthToken() {
  try {
    return localStorage.getItem('ai_buddy_token');
  } catch {
    return null;
  }
}

/**
 * 查询构建器（thenable）
 * 当被 await 或 .then() 调用时，执行 HTTP 请求
 */
class QueryBuilder {
  constructor(table) {
    this._table = table;
    this._operation = null; // 'select' | 'insert' | 'update' | 'delete'
    this._selectColumns = null;
    this._countMode = null;
    this._filters = [];
    this._orders = [];
    this._limitVal = null;
    this._isSingle = false;
    this._insertData = null;
    this._updateData = null;
    this._returning = false; // update 后 .select() 返回数据
  }

  // ── 操作类型方法 ──────────────────────────────────────

  select(columns, options) {
    if (this._operation === 'update' || this._operation === 'insert') {
      // .select() 在 update/insert 之后表示"返回数据"
      this._returning = true;
      this._selectColumns = columns || '*';
    } else {
      this._operation = 'select';
      this._selectColumns = columns || '*';
      if (options?.count) {
        this._countMode = options.count;
      }
    }
    return this;
  }

  insert(data) {
    this._operation = 'insert';
    this._insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  update(data) {
    this._operation = 'update';
    this._updateData = data;
    return this;
  }

  delete() {
    this._operation = 'delete';
    return this;
  }

  // ── 过滤方法 ──────────────────────────────────────────

  eq(column, value) {
    this._filters.push({ type: 'eq', column, value });
    return this;
  }

  neq(column, value) {
    this._filters.push({ type: 'neq', column, value });
    return this;
  }

  in(column, values) {
    this._filters.push({ type: 'in', column, value: values });
    return this;
  }

  is(column, value) {
    this._filters.push({ type: 'is', column, value });
    return this;
  }

  gt(column, value) {
    this._filters.push({ type: 'gt', column, value });
    return this;
  }

  gte(column, value) {
    this._filters.push({ type: 'gte', column, value });
    return this;
  }

  lt(column, value) {
    this._filters.push({ type: 'lt', column, value });
    return this;
  }

  lte(column, value) {
    this._filters.push({ type: 'lte', column, value });
    return this;
  }

  like(column, value) {
    this._filters.push({ type: 'like', column, value });
    return this;
  }

  // ── 排序/限制方法 ─────────────────────────────────────

  order(column, options = {}) {
    this._orders.push({
      column,
      ascending: options.ascending ?? true,
      nullsFirst: options.nullsFirst,
    });
    return this;
  }

  limit(n) {
    this._limitVal = n;
    return this;
  }

  single() {
    this._isSingle = true;
    return this;
  }

  // ── Thenable 协议 ─────────────────────────────────────
  // 支持 await 和 .then()

  then(resolve, reject) {
    return this._execute().then(resolve, reject);
  }

  catch(reject) {
    return this._execute().catch(reject);
  }

  finally(fn) {
    return this._execute().finally(fn);
  }

  // ── 执行 HTTP 请求 ────────────────────────────────────

  async _execute() {
    const params = new URLSearchParams();

    // SELECT 列
    if (this._selectColumns && (this._operation === 'select' || this._returning)) {
      params.set('select', this._selectColumns);
    }

    // 过滤器
    for (const f of this._filters) {
      params.append('filter', `${f.type}:${f.column}:${JSON.stringify(f.value)}`);
    }

    // 排序
    for (const o of this._orders) {
      params.append('order', `${o.column}:${o.ascending ? 'asc' : 'desc'}`);
    }

    // 限制
    if (this._limitVal != null) {
      params.set('limit', String(this._limitVal));
    }

    // 单行模式
    if (this._isSingle) {
      params.set('single', '1');
    }

    // 计数模式
    if (this._countMode) {
      params.set('count', this._countMode);
    }

    // 返回更新数据
    if (this._returning) {
      params.set('return', '1');
    }

    const queryString = params.toString();
    const url = queryString
      ? `${API_BASE}/${this._table}?${queryString}`
      : `${API_BASE}/${this._table}`;

    // 构建 fetch 选项
    const options = {
      method: 'GET',
      headers: {},
      credentials: 'include', // 允许发送 Cookie
    };

    // 自动附带 JWT Token
    const token = getAuthToken();
    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    switch (this._operation) {
      case 'select':
        options.method = 'GET';
        break;
      case 'insert':
        options.method = 'POST';
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(this._insertData);
        break;
      case 'update':
        options.method = 'PATCH';
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(this._updateData);
        break;
      case 'delete':
        options.method = 'DELETE';
        break;
    }

    try {
      const res = await fetch(url, options);
      const json = await res.json();
      return json; // { data, error, count }
    } catch (err) {
      return {
        data: null,
        error: { message: err.message || 'Network error' },
        count: null,
      };
    }
  }
}

/**
 * 批量查询：一次 HTTP 请求执行多条查询，大幅减少首屏加载延迟
 * @param {Array<{table: string, select?: string, filter?: string[], order?: string[], limit?: number}>} queries
 * @returns {Promise<Array<{data: any[], error: null} | {data: null, error: {message: string}}>>}
 */
async function batchQuery(queries) {
  const token = getAuthToken();
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ queries }),
  };
  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  }
  try {
    const res = await fetch(`${API_BASE}/batch`, options);
    const json = await res.json();
    if (json.error) {
      return queries.map(() => ({ data: null, error: json.error }));
    }
    return json.data || [];
  } catch (err) {
    return queries.map(() => ({ data: null, error: { message: err.message || 'Network error' } }));
  }
}

/**
 * Supabase 兼容客户端
 * 用法与 @supabase/supabase-js 完全一致
 */
export const supabase = {
  from(table) {
    return new QueryBuilder(table);
  },
  batch: batchQuery,
};

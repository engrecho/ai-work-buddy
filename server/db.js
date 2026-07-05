import mysql from 'mysql2/promise';

// ── 数据库连接池 ─────────────────────────────────────────────
export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'buddy',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'buddy',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4',
  dateStrings: false,
});

// ── 表结构定义（用于列名验证和 SQL 注入防护）──────────────
// 注意：包含 user_id 的表需要用户登录后才能访问
export const TABLE_COLUMNS = {
  // 用户表（特殊，不参与通用 CRUD 路由）
  users: [
    'id', 'username', 'password_hash', 'nickname', 'avatar_url',
    'created_at', 'last_login_at'
  ],
  // 业务表（需要 user_id 过滤）
  tasks: [
    'id', 'user_id', 'title', 'description', 'status', 'priority', 'parent_id',
    'is_project', 'progress', 'due_date', 'plan_date', 'owner_id',
    'supporter_id', 'related_member_ids', 'owner_ids', 'supporter_ids',
    'group_id', 'tag_ids', 'key_docs', 'related_dx', 'predecessor_ids',
    'successor_ids', 'related_memo_ids', 'need_report', 'created_at', 'updated_at'
  ],
  task_groups: [
    'id', 'user_id', 'name', 'color', 'sort_order', 'keywords',
    'created_at', 'updated_at'
  ],
  task_members: [
    'id', 'user_id', 'name', 'mis', 'created_at'
  ],
  task_tags: [
    'id', 'user_id', 'name', 'color', 'created_at'
  ],
  task_comments: [
    'id', 'user_id', 'task_id', 'content', 'comment_type', 'created_at'
  ],
  memos: [
    'id', 'user_id', 'title', 'content', 'memo_type', 'direction', 'related_url',
    'related_task_id', 'related_task_ids', 'reading_item_id', 'tag_ids',
    'tags', 'deleted_at', 'created_at', 'updated_at'
  ],
  task_notes: [
    'id', 'user_id', 'title', 'content', 'related_task_ids', 'created_at', 'updated_at'
  ],
  reading_items: [
    'id', 'user_id', 'url', 'platform', 'title', 'summary', 'cover_url', 'category',
    'is_read', 'is_starred', 'is_offline', 'offline_path', 'tags',
    'deleted_at', 'created_at'
  ],
  quick_notes: [
    'id', 'user_id', 'content', 'tags', 'created_at'
  ],
};

// ── 不需要登录的公开表（只读，用于系统预设数据）───────────
// 当前所有表都需要登录
export const PUBLIC_TABLES = new Set();

// ── JSON 类型列 ──────────────────────────────────────────────
export const JSON_COLUMNS = {
  tasks: [
    'related_member_ids', 'owner_ids', 'supporter_ids', 'tag_ids',
    'key_docs', 'related_dx', 'predecessor_ids', 'successor_ids', 'related_memo_ids'
  ],
  task_groups: ['keywords'],
  memos: ['related_task_ids', 'tag_ids'],
  task_notes: ['related_task_ids'],
  reading_items: ['tags'],
};

// ── DATETIME 列 ──────────────────────────────────────────────
export const DATETIME_COLUMNS = {
  tasks: ['due_date', 'plan_date', 'created_at', 'updated_at'],
  task_groups: ['created_at', 'updated_at'],
  task_members: ['created_at'],
  task_tags: ['created_at'],
  task_comments: ['created_at'],
  memos: ['deleted_at', 'created_at', 'updated_at'],
  task_notes: ['created_at', 'updated_at'],
  reading_items: ['deleted_at', 'created_at'],
  quick_notes: ['created_at'],
  users: ['created_at', 'last_login_at'],
};

// ── BOOLEAN 列 ───────────────────────────────────────────────
export const BOOLEAN_COLUMNS = {
  tasks: ['is_project', 'need_report'],
  reading_items: ['is_read', 'is_starred', 'is_offline'],
};

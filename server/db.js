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
  // 自动将 ISO 8601 日期字符串转换为 MySQL 格式
  dateStrings: false,
});

// ── 表结构定义（用于列名验证和 SQL 注入防护）──────────────
export const TABLE_COLUMNS = {
  tasks: [
    'id', 'title', 'description', 'status', 'priority', 'parent_id',
    'is_project', 'progress', 'due_date', 'plan_date', 'owner_id',
    'supporter_id', 'related_member_ids', 'owner_ids', 'supporter_ids',
    'group_id', 'tag_ids', 'key_docs', 'related_dx', 'predecessor_ids',
    'successor_ids', 'related_memo_ids', 'need_report', 'created_at', 'updated_at'
  ],
  task_groups: [
    'id', 'name', 'color', 'sort_order', 'keywords', 'created_at', 'updated_at'
  ],
  task_members: [
    'id', 'name', 'mis', 'created_at'
  ],
  task_tags: [
    'id', 'name', 'color', 'created_at'
  ],
  task_comments: [
    'id', 'task_id', 'content', 'comment_type', 'created_at'
  ],
  memos: [
    'id', 'title', 'content', 'memo_type', 'direction', 'related_url',
    'related_task_id', 'related_task_ids', 'reading_item_id', 'tag_ids',
    'tags', 'deleted_at', 'created_at', 'updated_at'
  ],
  task_notes: [
    'id', 'title', 'content', 'related_task_ids', 'created_at', 'updated_at'
  ],
  reading_items: [
    'id', 'url', 'title', 'summary', 'category', 'is_read', 'is_starred',
    'tags', 'deleted_at', 'created_at'
  ],
  quick_notes: [
    'id', 'content', 'tags', 'created_at'
  ],
};

// ── JSON 类型列（需要 stringify/parse）──────────────────────
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

// ── DATETIME/TIMESTAMP 列（需要日期格式转换）────────────────
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
};

// ── BOOLEAN 列（TINYINT(1)，需要 0/1 ↔ true/false 转换）─────
export const BOOLEAN_COLUMNS = {
  tasks: ['is_project', 'need_report'],
  reading_items: ['is_read', 'is_starred'],
};

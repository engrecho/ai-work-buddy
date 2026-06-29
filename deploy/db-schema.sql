-- ============================================================
-- AI Work Buddy - PostgreSQL 数据库 Schema
-- 在宝塔终端执行: sudo -u postgres psql -d buddy -f db-schema.sql
-- 或在宝塔数据库管理界面中直接导入
-- ============================================================

-- ============================================================
-- 1. tasks（核心任务表）
-- ============================================================
CREATE TABLE IF NOT EXISTS tasks (
    id bigint PRIMARY KEY,
    title text NOT NULL,
    description text,
    status text NOT NULL DEFAULT 'todo',
    priority text DEFAULT 'medium',
    parent_id bigint,
    is_project boolean DEFAULT false,
    progress integer DEFAULT 0,
    due_date timestamptz,
    plan_date timestamptz,
    owner_id bigint,
    supporter_id bigint,
    related_member_ids jsonb DEFAULT '[]'::jsonb,
    owner_ids jsonb,
    supporter_ids jsonb,
    group_id bigint,
    tag_ids jsonb,
    key_docs jsonb,
    related_dx jsonb,
    predecessor_ids jsonb DEFAULT '[]'::jsonb,
    successor_ids jsonb,
    related_memo_ids jsonb DEFAULT '[]'::jsonb,
    need_report boolean DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_group_id ON tasks (group_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id ON tasks (parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_id ON tasks (owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at ON tasks (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at DESC);

-- ============================================================
-- 2. task_groups（任务分组/看板泳道）
-- ============================================================
CREATE TABLE IF NOT EXISTS task_groups (
    id bigint PRIMARY KEY,
    name text NOT NULL,
    color text,
    sort_order integer,
    keywords jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_groups_sort_order ON task_groups (sort_order);

-- ============================================================
-- 3. task_members（人员信息）- 自增主键
-- ============================================================
CREATE TABLE IF NOT EXISTS task_members (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    mis text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_members_name ON task_members (name);

-- ============================================================
-- 4. task_tags（任务标签）
-- ============================================================
CREATE TABLE IF NOT EXISTS task_tags (
    id bigint PRIMARY KEY,
    name text NOT NULL,
    color text,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 5. task_comments（任务评论与动态）- 自增主键
-- ============================================================
CREATE TABLE IF NOT EXISTS task_comments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    task_id bigint NOT NULL,
    content text,
    comment_type text DEFAULT 'comment',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments (task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_created_at ON task_comments (created_at DESC);

-- ============================================================
-- 6. memos（备忘录）
-- ============================================================
CREATE TABLE IF NOT EXISTS memos (
    id bigint PRIMARY KEY,
    title text,
    content text,
    memo_type text DEFAULT 'note',
    direction text,
    related_url text,
    related_task_id bigint,
    related_task_ids jsonb DEFAULT '[]'::jsonb,
    reading_item_id text,
    tag_ids jsonb DEFAULT '[]'::jsonb,
    tags text DEFAULT '',
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memos_deleted_at ON memos (deleted_at);
CREATE INDEX IF NOT EXISTS idx_memos_created_at ON memos (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_memos_updated_at ON memos (updated_at DESC);

-- ============================================================
-- 7. task_notes（梳理文档）
-- ============================================================
CREATE TABLE IF NOT EXISTS task_notes (
    id bigint PRIMARY KEY,
    title text,
    content text,
    related_task_ids jsonb DEFAULT '[]'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_notes_updated_at ON task_notes (updated_at DESC);

-- ============================================================
-- 8. reading_items（阅读收藏）
-- ============================================================
CREATE TABLE IF NOT EXISTS reading_items (
    id bigint PRIMARY KEY,
    url text NOT NULL,
    title text,
    summary text,
    category text DEFAULT 'work',
    is_read boolean DEFAULT false,
    is_starred boolean DEFAULT false,
    tags jsonb DEFAULT '[]'::jsonb,
    deleted_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reading_items_deleted_at ON reading_items (deleted_at);
CREATE INDEX IF NOT EXISTS idx_reading_items_created_at ON reading_items (created_at DESC);

-- ============================================================
-- 9. quick_notes（随记）
-- ============================================================
CREATE TABLE IF NOT EXISTS quick_notes (
    id bigint PRIMARY KEY,
    content text NOT NULL,
    tags text DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quick_notes_created_at ON quick_notes (created_at DESC);

-- ============================================================
-- 自动更新 updated_at 触发器
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER IF NOT EXISTS trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER IF NOT EXISTS trg_task_groups_updated_at
    BEFORE UPDATE ON task_groups
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER IF NOT EXISTS trg_memos_updated_at
    BEFORE UPDATE ON memos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER IF NOT EXISTS trg_task_notes_updated_at
    BEFORE UPDATE ON task_notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 创建 PostgREST 匿名角色并授权
-- ============================================================
DO $$
BEGIN
    -- 创建 anon 角色（如果不存在）
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN;
    END IF;
END
$$;

-- 授权 anon 角色访问所有表
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- 确保新创建的表也自动授权给 anon
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO anon;

-- ============================================================
-- 初始数据：预设任务分组
-- ============================================================
INSERT INTO task_groups (id, name, color, sort_order, keywords) VALUES
    (1108465676, '品牌发展', '#06b6d4', 2, '["品牌","发展"]'::jsonb),
    (2394361001, '营运标准', '#ec4899', 3, '["营运","标准"]'::jsonb),
    (5899071651, '加盟商管', '#f59e0b', 4, '["加盟","门店"]'::jsonb),
    (9408221420, '产运数据', NULL, 5, '[]'::jsonb),
    (6151528880, '日常管理', '#ef4444', 6, '[]'::jsonb),
    (3226334826, '个人项目', NULL, 7, '[]'::jsonb),
    (2446698303, '其他', NULL, 8, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 完成
-- ============================================================

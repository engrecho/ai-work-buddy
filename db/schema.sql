-- ============================================================
-- AI Work Buddy - Database Schema for PostgreSQL + PostgREST
-- 在宝塔 PostgreSQL 中执行此文件创建所有表和权限
-- 使用方法: psql -U postgres -d buddy -f schema.sql
-- ============================================================

-- ============================================================
-- 1. 创建数据库角色（PostgREST 需要 anon 角色）
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'postgres') THEN
    CREATE ROLE postgres LOGIN SUPERUSER;
  END IF;
END
$$;

-- 确保 public schema 可用
GRANT USAGE ON SCHEMA public TO anon;
GRANT CREATE ON SCHEMA public TO postgres;

-- ============================================================
-- 2. 创建数据表
-- ============================================================

-- 2.1 task_members（人员信息）
CREATE TABLE IF NOT EXISTS task_members (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        text NOT NULL,
  mis         text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 2.2 task_tags（任务标签）
CREATE TABLE IF NOT EXISTS task_tags (
  id          bigint NOT NULL,
  name        text NOT NULL,
  color       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- 2.3 task_groups（任务分组/看板泳道）
CREATE TABLE IF NOT EXISTS task_groups (
  id          bigint NOT NULL,
  name        text NOT NULL,
  color       text,
  sort_order  integer,
  keywords    jsonb DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- 2.4 tasks（核心任务表）
CREATE TABLE IF NOT EXISTS tasks (
  id                  bigint NOT NULL,
  title               text NOT NULL,
  description         text,
  status              text NOT NULL DEFAULT 'todo',
  priority            text DEFAULT 'medium',
  parent_id           bigint,
  is_project          boolean DEFAULT false,
  progress            integer DEFAULT 0,
  due_date            timestamptz,
  plan_date           timestamptz,
  owner_id            bigint,
  supporter_id        bigint,
  related_member_ids  jsonb DEFAULT '[]',
  owner_ids           jsonb,
  supporter_ids       jsonb,
  group_id            bigint,
  tag_ids             jsonb,
  key_docs            jsonb,
  related_dx          jsonb,
  predecessor_ids     jsonb DEFAULT '[]',
  successor_ids       jsonb,
  related_memo_ids    jsonb DEFAULT '[]',
  need_report         boolean DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- 2.5 task_comments（任务评论与动态）
CREATE TABLE IF NOT EXISTS task_comments (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  task_id       bigint NOT NULL,
  content       text,
  comment_type  text DEFAULT 'comment',
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 2.6 memos（备忘录）
CREATE TABLE IF NOT EXISTS memos (
  id                bigint NOT NULL,
  title             text,
  content           text,
  memo_type         text DEFAULT 'note',
  direction         text,
  related_url       text,
  related_task_id   bigint,
  related_task_ids  jsonb DEFAULT '[]',
  reading_item_id   text,
  tag_ids           jsonb DEFAULT '[]',
  tags              text DEFAULT '',
  deleted_at        timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- 2.7 task_notes（梳理文档）
CREATE TABLE IF NOT EXISTS task_notes (
  id                bigint NOT NULL,
  title             text,
  content           text,
  related_task_ids  jsonb DEFAULT '[]',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- 2.8 reading_items（阅读收藏）
CREATE TABLE IF NOT EXISTS reading_items (
  id          bigint NOT NULL,
  url         text NOT NULL,
  title       text,
  summary     text,
  category    text DEFAULT 'work',
  is_read     boolean DEFAULT false,
  is_starred  boolean DEFAULT false,
  tags        jsonb DEFAULT '[]',
  deleted_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- 2.9 quick_notes（快捷备忘）
CREATE TABLE IF NOT EXISTS quick_notes (
  id          bigint NOT NULL,
  content     text,
  tags        jsonb DEFAULT '[]',
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- ============================================================
-- 3. 创建索引（优化查询性能）
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tasks_status        ON tasks (status);
CREATE INDEX IF NOT EXISTS idx_tasks_group_id       ON tasks (group_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent_id     ON tasks (parent_id);
CREATE INDEX IF NOT EXISTS idx_tasks_owner_id      ON tasks (owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_updated_at    ON tasks (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at    ON tasks (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments (task_id);

CREATE INDEX IF NOT EXISTS idx_memos_deleted_at    ON memos (deleted_at);
CREATE INDEX IF NOT EXISTS idx_memos_created_at    ON memos (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reading_deleted_at ON reading_items (deleted_at);
CREATE INDEX IF NOT EXISTS idx_reading_created_at  ON reading_items (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quick_notes_created ON quick_notes (created_at DESC);

-- ============================================================
-- 4. 授予 anon 角色 CRUD 权限（PostgREST 通过此角色操作数据）
-- ============================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;

-- 确保后续新建的表也自动授权给 anon
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon;

-- ============================================================
-- 5. 预设分组数据（可选）
-- ============================================================
INSERT INTO task_groups (id, name, color, sort_order, keywords) VALUES
  (1108465676, '品牌发展', '#06b6d4', 2, '["加盟","门店"]'),
  (2394361001, '营运标准', '#ec4899', NULL, '[]'),
  (5899071651, '加盟商管', '#f59e0b', NULL, '[]'),
  (9408221420, '产运数据', NULL, NULL, '[]'),
  (6151528880, '日常管理', '#ef4444', NULL, '[]'),
  (3226334826, '个人项目', NULL, NULL, '[]'),
  (2446698303, '其他', NULL, NULL, '[]')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. 更新时间触发器（自动更新 updated_at）
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tasks_updated_at ON tasks;
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_task_groups_updated_at ON task_groups;
CREATE TRIGGER trg_task_groups_updated_at BEFORE UPDATE ON task_groups
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_memos_updated_at ON memos;
CREATE TRIGGER trg_memos_updated_at BEFORE UPDATE ON memos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_task_notes_updated_at ON task_notes;
CREATE TRIGGER trg_task_notes_updated_at BEFORE UPDATE ON task_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- 完成
-- ============================================================

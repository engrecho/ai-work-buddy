# 数据库与部署安全规范

> 本文档基于 2026-07-15 的真实事故整理。那次事故中，`deploy/mysql-schema.sql`
> 里的 14 个 `DROP TABLE IF EXISTS` 通过 `deploy/once/*.sh` 的失败重试机制被反复执行，
> 导致 `api_keys` 表（以及其它表）全部数据被清空，所有已签发的 API Key 丢失。

## 一、绝对禁止的操作（红线）

以下操作一律不允许出现在任何 SQL / Shell / JS 文件中，PR Review 必须拦截：

1. **`DROP TABLE` / `DROP DATABASE` / `TRUNCATE TABLE`** —— 一律禁用。
   - 即使在"看起来没人用"的表上也禁用。需要清表请走人工 DBA 流程，并在生产环境手动执行。
2. **`CREATE TABLE`（不带 `IF NOT EXISTS`）** —— 一律禁用。
   - 必须写成 `CREATE TABLE IF NOT EXISTS`，保证幂等。
3. **在 `deploy/once/*.sh` 中执行完整的 `mysql-schema.sql`** —— 一律禁用。
   - `once/*.sh` 失败会被下次部署重试，任何一次重试都会跑完整 schema。
   - once 任务只能用独立的、`IF NOT EXISTS` 的增量 SQL（heredoc）。
4. **在 `deploy/once/*.sh` 中重置任意用户密码** —— 一律禁用。
   - 演示账号初始化除外，且必须放在只会执行一次的脚本里。
5. **在 schema 文件里写 `UPDATE` / `DELETE` 修改业务数据** —— 一律禁用。
   - Schema 文件只做 DDL，不做 DML。

## 二、为什么会出事（事故复盘）

1. `mysql-schema.sql` 设计成"每次执行都重建全库"，在初始化场景没问题。
2. 但 `deploy/once/07|08|09-*.sh` 三个任务都用 `mysql < mysql-schema.sql` 来"确保表存在"。
3. once 机制有重试逻辑：失败的任务下次部署会再跑一遍。
4. 任何一次 once 任务重试 → 完整 schema 跑一遍 → 14 张表全部 DROP 重建 → 数据全丢。
5. 同时 08/09 还会重置 jaylon 密码，导致用户密码也丢失。

根因：**把"破坏性 schema"和"幂等运维流程"放在一起，迟早会出事。**

## 三、正确的写法

### 3.1 Schema 文件（`deploy/mysql-schema.sql`）

```sql
-- ✅ 正确：幂等，重复执行不丢数据
CREATE TABLE IF NOT EXISTS `api_keys` (
  ...
);

-- ❌ 错误：每次执行都删表重建
-- DROP TABLE IF EXISTS `api_keys`;
-- CREATE TABLE `api_keys` (...);
```

### 3.2 once 任务（`deploy/once/*.sh`）

```bash
# ✅ 正确：独立 heredoc SQL，只做增量，IF NOT EXISTS
cat > /tmp/new-tables.sql << 'SQLEOF'
CREATE TABLE IF NOT EXISTS `health_profiles` (...);
CREATE TABLE IF NOT EXISTS `health_visits` (...);
SQLEOF
mysql -u"$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < /tmp/new-tables.sql

# ❌ 错误：在 once 里执行完整 schema
# mysql ... < deploy/mysql-schema.sql

# ❌ 错误：在 once 里重置用户密码
# UPDATE users SET password_hash=... WHERE username='jaylon';
```

## 四、提交前自检清单

每次改动涉及 `deploy/` 或 SQL 时，提交前必须自检：

- [ ] `git diff` 里有没有 `DROP TABLE` / `DROP DATABASE` / `TRUNCATE`？
- [ ] 新写的 `CREATE TABLE` 有没有 `IF NOT EXISTS`？
- [ ] 新加的 `deploy/once/*.sh` 有没有执行完整 `mysql-schema.sql`？
- [ ] 新加的 `deploy/once/*.sh` 有没有写死用户密码、API Key、Token？
- [ ] once 任务里的 SQL 是不是独立的、幂等的增量 SQL？

任何一项不通过，**不要提交，不要部署**。

## 五、AI 协作时的强制规则

凡是由 AI 会话（TRAE / Cursor / Copilot 等）执行的提交，必须在 commit message
末尾注明 `[AI-assisted]`，并满足以下条件：

1. AI 不得自行执行任何 `DROP` / `TRUNCATE` / `RESET` 类语句，即使在测试环境也不行。
2. AI 修改 `deploy/` 下任何文件前，必须先 `Read` 整个文件并向用户复述将要做的事，
   得到明确同意后才能修改。
3. AI 不得"顺手清理"或"顺手重构" `deploy/` 下的脚本——只做用户明确要求的事。
4. AI 发现"看似冗余但可能是安全护栏"的代码（比如 `.done` 文件、`IF NOT EXISTS`、
   条件判断），删除前必须向用户说明用途并确认。

## 六、本次事故的责任代码（已删除，留作警示）

以下三个文件在 commit `58c1906` 中被删除，未来不要以任何形式恢复：

- `deploy/once/07-create-health-vault-tables-v2.sh`
- `deploy/once/08-reset-jaylon-and-create-tables.sh`
- `deploy/once/09-fix-all.sh`

它们都执行了 `mysql < deploy/mysql-schema.sql`，是这次数据丢失的直接元凶。

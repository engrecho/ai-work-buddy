# 开发工作准则（永久生效）

> 本文件记录 AI-Buddy 项目的开发工作准则，所有贡献者必须遵守。
> 敏感凭据（SSH/数据库/Webhook）记录在本地 `CLAUDE.md`（已加入 `.gitignore`，不入库）。

---

## 1. 文档同步铁律（强制）

**每次完成功能开发、Bug 修复、数据库结构变更后，必须同步更新以下文件，缺一不可：**

| 变更类型 | 必须同步更新的文件 |
|---|---|
| 新增/修改 API 接口 | `buddy-skill/SKILL.md`（对外 AI 助手用）、`docs/DEVELOPMENT.md` |
| 新增/修改数据库表、字段 | `docs/DATABASE.md`、`deploy/mysql-schema.sql`（保持一致） |
| 新增/修改用户可见功能 | `docs/USER_GUIDE.md` |
| 部署/运维变更 | `docs/DEPLOY_BAOTA.md` |
| 踩坑/故障复盘 | `docs/TROUBLESHOOTING.md`、`deploy/SAFETY_RULES.md`（涉及安全时） |

### 检查清单（提交前必过）

1. 新表/新字段是否已写入 `docs/DATABASE.md` 对应小节？
2. 新字段是否已同步到 `server/db.js` 的 `TABLE_COLUMNS` / `DATETIME_COLUMNS` / `BOOLEAN_COLUMNS`？
3. 新 API 是否已写入 `buddy-skill/SKILL.md` 的接口列表？
4. 用户可见功能是否已写入 `docs/USER_GUIDE.md`？
5. `schema.sql` 是否与生产库一致？（迁移走 `deploy/once/*.sh` 幂等脚本）
6. `docs/DATABASE.md` 顶部的"最后更新"日期是否已更新？

**禁止**：只改代码不更新文档。文档与代码不一致是技术债的最高优先级问题。

---

## 2. 推送状态验证铁律（强制）

**判断 push 是否成功，必须用以下命令之一实时验证远端，禁止凭记忆或本地 reflog 判断：**

```bash
# 方式 A（最可靠）：实时查询 GitHub 远端 HEAD
git ls-remote https://github.com/engrecho/AI-buddy HEAD

# 方式 B：对比本地 origin/main 与远端
git ls-remote origin HEAD
```

### 禁止的误判模式

- ❌ 用 API token 测试失败就断定 push 失败（token 与 push 凭据可能是两套）
- ❌ 凭 `git log origin/main` 判断（这是本地缓存，不代表远端实际状态）
- ❌ 凭 `git reflog` 判断（reflog 只记本地操作，不验证远端）

### 正确流程

push 后立即 `git ls-remote` 验证远端 SHA 是否等于本地 HEAD。不等才报失败。

---

## 3. 数据库安全红线（强制）

详见 `deploy/SAFETY_RULES.md`。核心：

- 任何 `DELETE` / `TRUNCATE` / `DROP` 必须先 `SELECT` 确认范围、列计划、等用户确认
- 禁止 `DELETE FROM users`、`DELETE FROM api_keys` 等全表清空
- 误删后立即用 `deploy/once/` 脚本重建，并复盘写入 `docs/TROUBLESHOOTING.md`

---

## 4. 部署流程铁律

1. **先推送 GitHub，再触发部署**（部署服务器之前必须先 `git push origin main`）
2. 推送后用 `git ls-remote` 验证远端 SHA 等于本地 HEAD
3. 部署由宝塔 Webhook 自动触发（端口 11416），无需手动 SSH
4. 数据库结构变更走 `deploy/once/*.sh` 幂等脚本（先查 `INFORMATION_SCHEMA` 再决定是否执行）
5. 部署完成后，访问 <https://tencent.bajiaolu.cn> 测试关键功能

---

## 5. 凭据安全

- **CLAUDE.md 包含 SSH 密码、数据库密码、Webhook access_key、测试账号密码**，已加入 `.gitignore`，绝不入库
- 任何 PR 都不能包含明文凭据
- 凭据应定期更换
- Webhook access_key 与 GitHub PAT 是两套独立凭据，不可混淆

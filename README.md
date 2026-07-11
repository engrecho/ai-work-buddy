# AI-Buddy

> 任务、笔记、阅读、随记——一处收纳，互相关联。

<img src="public/logo.png" width="128" alt="AI-Buddy Logo">

## 它是做什么的

每天有太多东西会涌进你的脑子：一段对话里的想法、邮件里提到的待办、读到一半的文章、突然蹦出的反思。多数工具强迫你提前想好"这应该放在哪"，而 AI-Buddy 反过来——**先让你 5 秒内记下来，再慢慢把它们串成线**。

任务、备忘录、阅读收藏、随记共用同一处存储和同一套关联机制。一个备忘可以挂着一个任务、关联一篇阅读、引用一条随记。整张图随着你的工作自然长出来，不需要你做任何"知识管理"。

## 核心特性

- **碎片化记录，5 秒入脑**：随记、备忘、任务、阅读收藏——四种容器覆盖你日常碰到的几乎所有内容形态
- **相互关联，自然串联**：一个任务可以引用一条备忘，一篇阅读可以挂到多个任务上，所有内容通过双向链接形成网络
- **配套的 AI 助手 SKILL（buddy-skill）**：在你的AI工具（如Claude/Trae/Codex/Workbuddy） 中让Buddy真正成为你的搭档——可以查询、修改、整理你的所有数据；删除和整理前会自动列计划等你确认
- **账号密码登录，数据完全隔离**：每个人只看到自己的内容，AI 访问也是按用户隔离
- **响应式设计**：PC 侧边栏 + 移动端底部导航，手机电脑无缝切换
- **自托管友好**：单文件 MySQL + Express，一台服务器就能跑起来；代码全开源

## 快速一览

任务看板：自定义分组、子任务、进度、优先级、依赖关系。

备忘录：富文本、标签，可以挂任务、挂阅读。

阅读收藏：保存有价值的文章链接，分类、加标签、做笔记。

随记（Quick Notes）：脑子里蹦出来的任何东西，先丢进来。

梳理文档：可拖拽悬浮窗，把围绕同一主题的多个资料集中到一起。

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 18 + Vite + Tailwind CSS + shadcn/ui |
| 后端 | Node.js 18+ + Express 4 |
| 数据库 | MySQL 5.7+ / 8.0 |
| 进程管理 | PM2 |
| 反向代理 | Nginx |
| 部署 | 宝塔面板一键部署 |

## 在线演示

🌐 演示地址：<https://buddy.bajiaolu.cn>（注册后即可使用）

## 快速开始（开发者模式）

```bash
# 1. 克隆代码
git clone https://github.com/engrecho/AI-buddy.git
cd AI-buddy

# 2. 导入数据库
mysql -u root -p'你的密码' buddy < deploy/mysql-schema.sql

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填入数据库连接信息和 JWT_SECRET

# 4. 安装并启动后端
cd server
yarn install
yarn start   # 启动后端（端口 3000）

# 5. 启动前端（另一个终端）
cd ..
yarn install
yarn dev     # 启动前端（端口 8080）
```

打开 <http://localhost:8080>，注册账号即可使用。

## 宝塔部署（生产模式）

完整步骤见 [DEPLOY.md](DEPLOY.md)。从零开始大约 30 分钟可完成上线。

简要流程：
1. 在宝塔创建 MySQL 数据库 `buddy`
2. 终端克隆代码并导入 `deploy/mysql-schema.sql`
3. 安装后端依赖并用 PM2 守护进程
4. 构建前端静态文件
5. 配置 Nginx 代理（前端静态托管 + `/api/` 反向代理到 Express）
6. （可选）申请 Let's Encrypt 证书强制 HTTPS

## 项目结构

```
AI-buddy/
├── src/                       # 前端代码（React）
│   ├── components/            # 通用组件 + 业务组件
│   ├── contexts/              # React Context（认证等）
│   ├── integrations/supabase/ # 兼容历史 import 路径
│   ├── lib/db.js              # 数据访问层（向后端发请求）
│   ├── pages/                 # 页面组件
│   ├── App.jsx                # 路由 + 全局 Provider
│   └── main.jsx               # 入口
├── server/                    # 后端代码（Express）
│   ├── index.js               # API 路由
│   ├── auth.js                # JWT 认证
│   ├── db.js                  # MySQL 连接池 + 表结构
│   └── package.json
├── deploy/                    # 部署相关
│   ├── mysql-schema.sql       # 数据库建表脚本
│   ├── nginx-site.conf        # Nginx 配置模板
│   ├── ai-buddy.service       # systemd 服务模板
│   └── pull.sh                # 自动部署脚本
├── buddy-skill/               # 官方 AI 助手 SKILL（独立可分发）
│   ├── SKILL.md              # ★ SKILL 入口描述文件
│   ├── README.md             # 开发者向辅助文档
│   ├── index.js              # CLI 入口
│   ├── lib/                  # HTTP 客户端、配置、Prompt
│   ├── tools/                # 整理 + 确认（plan-then-confirm）
│   └── examples/             # 用法示例
├── docs/                      # 文档
├── ecosystem.config.cjs       # PM2 配置
├── .env.example               # 环境变量模板
├── DEPLOY.md                  # 宝塔部署指南
└── README.md                  # 本文件
```

## 路线图

- [x] 账号密码登录 + 多用户数据隔离
- [x] 任务看板（自定义分组、子任务、依赖）
- [x] 备忘录与梳理文档
- [x] 阅读收藏与随记
- [x] **AI-Buddy SKILL（buddy-skill）**：API Key + plan-then-confirm 安全流程
- [x] **设置中心**：左下角头像入口 + 二级侧边栏，统一管理个人资料/密码/API Key/人员/标签/分组
- [x] **头像上传**：取代 URL 填写，直接上传图片（jpg/png/webp，≤2MB）
- [x] **API Key 反查明文**：新建 Key 加密存储，可在列表点「眼睛」再次查看明文（旧格式 Key 标记为 legacy，需撤销重建）
- [x] **阅读页加载优化**：复合索引 + 列投影 + 加载骨架屏 + 乐观更新（消除操作后全量刷新闪烁）
- [ ] 微信扫码登录
- [ ] 多端数据同步（小程序）
- [ ] 数据导入导出
- [ ] 团队协作（共享任务池）
- [ ] AI 助手（任务建议、自动归类）

## 更新日志

### v1.7.0 (2026-07-09)

**SKILL 优化**：
- 强化"优先非离线保存"规则：任何时候优先走非离线路径，仅当用户明确要求离线时才触发下载
- 确保无论离线与否，保存时都必须写入标题/链接/头图/摘要四个字段并自动打标签
- 离线路径也必须同时写入四个字段，保证阅读列表信息完整

**阅读功能优化**：
- 平台主题色调整：抖音 `#FF0050`、小红书 `#FF2442`、B站 `#FF6699`
- 已读标题变蓝色（去除删除线），清晰标识已阅读状态
- PC 端"添加文章"按钮移至右上方，与备忘页面布局一致；移动端保持右下角 FAB
- 无离线时不展示离线路径信息
- "标记为已离线" → "将链接离线保存"，点击后异步处理离线工作，页面可正常关闭
- 新增"去除离线"功能（列表行和编辑面板均可操作）

**备忘功能优化**：
- "关联任务"和"关联链接"字段移至"内容"上方，编辑流程更顺畅
- "内容"输入框高度自适应页面，充分利用垂直空间

**构建修复（v1.7.0 补丁）**：
- 修复 `src/pages/ReadingPage.jsx` 中缺失的两个 `</div>` 闭合标签（PC 端"添加文章"按钮外层 div 与顶部操作栏 div），该语法错误曾导致 `vite build` 失败（报 `Expected "}" but found ":"`），现已构建通过

## AI-Buddy SKILL

把 `buddy-skill/` 整个目录加载到 Claude / GPT 等 AI 助手中，AI 就能查询、修改、整合你在 AI-Buddy 里的所有数据。**这是 AI-Buddy 的差异化亮点**——你的 AI 搭档不再只是聊天框里的对话，而是能直接动你的任务、备忘和阅读收藏。

**入口文件**：`buddy-skill/SKILL.md`（这是 SKILL 加载时 AI 读取的入口描述文件，含 YAML frontmatter 定义 name/description/触发条件）

**核心特性**：
- **API Key 鉴权**：每个用户独立的 Key，存放在 `~/.buddy-skill/config.json`（`chmod 600`），AI 永远拿不到明文
- **多用户隔离**：Key 在数据库中绑定到具体 `user_id`，跨用户访问返回 401
- **plan-then-confirm**：整理任务时先调用 `planOrganize` 列出计划，等用户确认后才执行
- **删除前确认**：删除任务必须 `confirm=true`，CLI 会要求输入 `yes` 二次确认
- **零依赖**：仅使用 Node.js 内置模块

**快速开始**：
1. 登录 AI-Buddy 网页 → 左下角头像 → 设置中心 → API Key → 创建 Key（明文创建时显示，之后也可点「眼睛」再次查看）
2. `cp -r buddy-skill ~/tools/buddy-skill && cd ~/tools/buddy-skill`
3. `node index.js init`，按提示输入 API Key
4. `node index.js test` 验证连接
5. `node index.js list-tasks --status todo` 试一下

详细文档、API 参考、安全模型、故障排查见：
- AI 加载入口：[buddy-skill/SKILL.md](buddy-skill/SKILL.md)
- 开发者向文档：[buddy-skill/README.md](buddy-skill/README.md)

## 贡献指南

欢迎任何形式的贡献：

1. 提 Issue：报告 Bug、提出功能建议、改进文档
2. 提 PR：修复 Bug、新增功能、翻译文档
3. 分享：把项目推荐给朋友、写使用体验

详细流程见 [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)（待补充）。

## 许可证

[MIT License](LICENSE)

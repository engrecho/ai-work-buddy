# AI-buddy

> 一个开源的个人/团队任务与知识管理工具，支持看板任务、备忘录、阅读收藏、随记与梳理文档。

<img src="public/logo.png" width="128" alt="AI-buddy Logo">

## 一句话简介

AI-buddy 是一款为个人和小团队打造的一站式工作管理平台，把任务、备忘、阅读笔记、即时想法整合到同一处，让每个人专注真正重要的事。

## 核心特性

- **任务看板**：自定义分组（品牌发展、营运标准、加盟商管等），支持子任务、进度、优先级、依赖关系
- **备忘录**：富文本、标签、关联任务与阅读
- **梳理文档**：可拖拽悬浮窗，集中整理围绕单个主题的多项资料
- **阅读收藏**：记录有价值的文章链接，分类、加标签、做笔记
- **随记（Quick Notes）**：碎片化想法快速记录
- **多用户数据隔离**：账号密码登录，每人只看自己的数据
- **响应式设计**：PC 侧边栏 + 移动端底部导航
- **自托管友好**：单文件 MySQL + Express，单机即可运行

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
- [ ] 微信扫码登录
- [ ] 多端数据同步（小程序）
- [ ] 数据导入导出
- [ ] 团队协作（共享任务池）
- [ ] AI 助手（任务建议、自动归类）

## 贡献指南

欢迎任何形式的贡献：

1. 提 Issue：报告 Bug、提出功能建议、改进文档
2. 提 PR：修复 Bug、新增功能、翻译文档
3. 分享：把项目推荐给朋友、写使用体验

详细流程见 [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)（待补充）。

## 许可证

[MIT License](LICENSE)

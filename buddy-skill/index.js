#!/usr/bin/env node
// buddy-skill CLI 入口
// 用法：node index.js <command> [options]

import { initConfigInteractive, loadConfig } from './lib/config.js';
import BuddyClient from './lib/client.js';
import { planOrganize } from './tools/organize.js';
import { formatOrganizePlan, formatDeletePlan } from './tools/confirm.js';
import { execFileSync } from 'child_process';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// 内置解析脚本(buddy-skill 自包含,不再依赖外部 ExtractVideoSkill)
const EXTRACT_SCRIPT = path.join(__dirname, 'scripts', 'video_extract.cjs');

const args = process.argv.slice(2);
const command = args[0];

// 版本号以 package.json 为准,避免多处维护
const PKG = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
const VERSION = PKG.version;

// 自更新配置(固定下载地址)
const UPDATE_URL = 'https://buddy.bajiaolu.cn/buddy-skill.tar.gz';
const VERSION_URL = 'https://buddy.bajiaolu.cn/buddy-skill.version';

function printUsage() {
  console.log(`
buddy-skill — AI-Buddy 官方 SKILL CLI

用法：
  node index.js init                      交互式初始化配置
  node index.js test                      测试连接
  node index.js whoami                    查看当前用户
  node index.js list-task-groups          列出任务分组
  node index.js list-tasks [options]      列出任务
  node index.js get-task <id>             查看任务详情
  node index.js add-task --title "..."    创建任务
  node index.js update-task <id> --field value
  node index.js delete-task <id>          删除任务（需二次确认）
  node index.js organize-tasks <strategy> 整理任务（先列计划）
  node index.js list-memos                列出备忘
  node index.js add-memo --content "..."  创建备忘
  node index.js list-reading              列出阅读收藏
  node index.js add-reading --url "..."   添加阅读收藏
  node index.js where-is-key              显示配置文件位置
  node index.js doctor                     环境诊断（检查 Node/配置/内置解析脚本/API）
  node index.js --version                  显示版本号

整理策略 strategy 取值：
  archive-completed      归档 30 天前已完成的任务
  set-priority-by-due    根据截止日期自动设置优先级
  clean-duplicates       归档重复任务

示例：
  node index.js list-tasks --status todo --limit 10
  node index.js add-task --title "完成 Q3 报告" --priority high
  node index.js organize-tasks archive-completed
  node index.js delete-task 42

社媒内容（抖音/B站/小红书/公众号等 1000+ 平台）— 本 SKILL 已内置解析,无需安装其他依赖：
  node index.js extract-video "<分享文本或URL>"        仅解析,返回原始信息(标题/封面/直链)
  node index.js download-video "<分享文本或URL>"        解析 + 下载到服务端(由 AI-Buddy 服务端处理)

解析脚本内置在 buddy-skill/scripts/video_extract.cjs,零依赖,仅用 Node 内置模块。
下载由 AI-Buddy 服务端统一处理,保存到服务端默认目录,无需用户配置路径。
`);
}

// ── 自更新：每次使用核对版本,落后则自动从固定地址下载更新 ────────────
function compareVersion(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

async function downloadAndExtract(url, targetDir) {
  const tmp = path.join(os.tmpdir(), `buddy-skill-${Date.now()}.tar.gz`);
  const extractDir = path.join(os.tmpdir(), `buddy-skill-extract-${Date.now()}`);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(tmp, buf);

    fs.mkdirSync(extractDir, { recursive: true });
    execFileSync('tar', ['-xzf', tmp, '-C', extractDir]);
    const src = path.join(extractDir, 'buddy-skill');
    if (!fs.existsSync(src)) throw new Error('解压结果缺少 buddy-skill 目录');
    // 直接覆盖文件(不删除目标目录),避免正在运行的进程丢失目录结构
    copyDirSync(src, targetDir);
  } finally {
    fs.rmSync(tmp, { force: true });
    fs.rmSync(extractDir, { recursive: true, force: true });
  }
}

async function selfUpdateCheck() {
  // 1 小时内只检查一次,兼顾及时更新与避免频繁请求网络
  const cacheFile = path.join(os.homedir(), '.buddy_skill_update_check');
  const now = Date.now();
  try {
    if (fs.existsSync(cacheFile)) {
      const last = Number(fs.readFileSync(cacheFile, 'utf8'));
      if (now - last < 3600 * 1000) return;
    }
  } catch { /* ignore */ }
  try {
    fs.writeFileSync(cacheFile, String(now));
  } catch { /* ignore */ }

  try {
    const res = await fetch(VERSION_URL, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return;
    const remoteVersion = (await res.text()).trim();
    if (compareVersion(remoteVersion, VERSION) <= 0) return; // 本地已是最新

    console.log(`发现 buddy-skill 新版本: ${VERSION} → ${remoteVersion}，正在自动更新...`);
    await downloadAndExtract(UPDATE_URL, __dirname);
    console.log(`✓ 已更新到 ${remoteVersion}。`);
    console.log(`  若本次更新涉及 SKILL.md / prompts.js（触发词或离线下载规则变化），请在 Agent 中【重新加载本 skill 会话】以生效，然后重新运行上一条命令。`);
    process.exit(0);
  } catch (err) {
    if (process.env.DEBUG) console.error('[self-update]', err.message);
  }
}

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i++;
      }
    } else {
      flags._positional = flags._positional || [];
      flags._positional.push(arg);
    }
  }
  return flags;
}

function requireClient() {
  const cfg = loadConfig();
  if (!cfg) {
    console.error('✗ 未找到配置，请先运行: node index.js init');
    process.exit(1);
  }
  if (!cfg.api_key) {
    console.error('✗ 配置中缺少 api_key');
    process.exit(1);
  }
  return new BuddyClient(cfg);
}

async function cmdInit() {
  await initConfigInteractive();
}

async function cmdTest() {
  const client = requireClient();
  const me = await client.me();
  console.log('✓ 连接成功');
  console.log(JSON.stringify(me, null, 2));
}

async function cmdWhoami() {
  const client = requireClient();
  const me = await client.me();
  console.log(`当前用户：${me.nickname || me.username}`);
  console.log(`用户名：${me.username}`);
  console.log(`ID：${me.id}`);
}

async function cmdListTaskGroups(flags) {
  const client = requireClient();
  const groups = await client.listTaskGroups();
  if (groups.length === 0) {
    console.log('没有任务分组');
    return;
  }
  console.log(`共 ${groups.length} 个分组：\n`);
  for (const g of groups) {
    const color = g.color ? ` ${g.color}` : '';
    const kw = g.keywords?.length ? ` (keywords: ${g.keywords.join(', ')})` : '';
    console.log(`  [${g.id}] ${g.name} sort=${g.sort_order ?? '-'}${color}${kw}`);
  }
}

async function cmdListTasks(flags) {
  const client = requireClient();
  const query = {};
  if (flags.status) query.status = flags.status;
  if (flags.priority) query.priority = flags.priority;
  if (flags.group !== undefined) query.group_id = flags.group;
  if (flags.q) query.q = flags.q;
  query.limit = flags.limit || 20;
  if (flags.order) query.order = flags.order;

  const tasks = await client.listTasks(query);
  if (tasks.length === 0) {
    console.log('没有任务');
    return;
  }
  console.log(`共 ${tasks.length} 个任务：\n`);
  for (const t of tasks) {
    const status = t.status === 'done' ? '✓' : t.status === 'in_progress' ? '◐' : t.status === 'archived' ? '⊘' : '○';
    const pri = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢';
    const due = t.due_date ? ` [${t.due_date.slice(0, 10)}]` : '';
    console.log(`  ${status} ${pri} [${t.id}] ${t.title}${due}`);
  }
}

async function cmdGetTask(id) {
  const client = requireClient();
  const task = await client.getTask(id);
  console.log(JSON.stringify(task, null, 2));
}

async function cmdAddTask(flags) {
  if (!flags.title) {
    console.error('✗ 缺少 --title');
    process.exit(1);
  }
  const client = requireClient();
  const data = {
    title: flags.title,
    description: flags.description,
    priority: flags.priority || 'medium',
    status: flags.status || 'todo',
  };
  if (flags.group !== undefined) data.group_id = Number(flags.group);
  if (flags.due) data.due_date = flags.due;
  if (flags.plan) data.plan_date = flags.plan;

  const created = await client.createTask(data);
  console.log('✓ 任务已创建');
  console.log(`  ID: ${created.id}`);
  console.log(`  标题: ${created.title}`);
}

async function cmdUpdateTask(id, flags) {
  const client = requireClient();
  const changes = {};
  if (flags.status) changes.status = flags.status;
  if (flags.priority) changes.priority = flags.priority;
  if (flags.title) changes.title = flags.title;
  if (flags.due) changes.due_date = flags.due;
  if (flags.description) changes.description = flags.description;
  if (flags.progress !== undefined) changes.progress = Number(flags.progress);
  if (flags.group !== undefined) changes.group_id = Number(flags.group);

  if (Object.keys(changes).length === 0) {
    console.error('✗ 至少指定一个要更新的字段，如 --status done');
    process.exit(1);
  }

  const updated = await client.updateTask(Number(id), changes);
  console.log('✓ 任务已更新');
  console.log(JSON.stringify(updated, null, 2));
}

async function cmdDeleteTask(id) {
  const client = requireClient();
  const task = await client.getTask(Number(id));
  const plan = formatDeletePlan([task]);
  console.log(plan);

  // 二次确认
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\n确认删除？输入 yes 继续：');
  rl.close();

  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('已取消');
    return;
  }

  await client.deleteTask(Number(id), { confirm: true });
  console.log('✓ 任务已删除');
}

async function cmdOrganizeTasks(strategy) {
  if (!strategy) {
    console.error('✗ 缺少 strategy，可用值：archive-completed | set-priority-by-due | clean-duplicates');
    process.exit(1);
  }

  const client = requireClient();
  console.log(`正在生成「${strategy}」策略的整理计划...`);
  const plan = await planOrganize(strategy);

  const formatted = formatOrganizePlan(strategy, plan);
  console.log('\n' + formatted);

  if (plan.length === 0) {
    console.log('\n没有可执行的操作');
    return;
  }

  // 二次确认
  const readline = await import('node:readline/promises');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\n确认执行以上操作？输入 yes 继续：');
  rl.close();

  if (answer.trim().toLowerCase() !== 'yes') {
    console.log('已取消');
    return;
  }

  const result = await client.organizeTasks(plan, { dryRun: false });
  console.log('\n✓ 整理完成');
  console.log(JSON.stringify(result, null, 2));
}

async function cmdListMemos(flags) {
  const client = requireClient();
  const query = { limit: flags.limit || 20 };
  if (flags.q) query.q = flags.q;
  if (flags.type) query.memo_type = flags.type;

  const memos = await client.listMemos(query);
  if (memos.length === 0) {
    console.log('没有备忘');
    return;
  }
  console.log(`共 ${memos.length} 条备忘：\n`);
  for (const m of memos) {
    const tag = m.tags?.length ? ` #${m.tags.join(' #')}` : '';
    console.log(`  [${m.id}] ${m.title || '(无标题)'}${tag}`);
    if (m.content) {
      const preview = m.content.length > 80 ? m.content.slice(0, 80) + '...' : m.content;
      console.log(`      ${preview}`);
    }
  }
}

async function cmdAddMemo(flags) {
  if (!flags.content) {
    console.error('✗ 缺少 --content');
    process.exit(1);
  }
  const client = requireClient();
  const data = { content: flags.content };
  if (flags.title) data.title = flags.title;
  if (flags.type) data.memo_type = flags.type;
  if (flags.tags) data.tags = flags.tags.split(',').map(s => s.trim()).filter(Boolean);

  const created = await client.createMemo(data);
  console.log('✓ 备忘已创建');
  console.log(`  ID: ${created.id}`);
}

async function cmdListReading(flags) {
  const client = requireClient();
  const query = { limit: flags.limit || 20 };
  if (flags.q) query.q = flags.q;
  if (flags.starred) query.is_starred = true;
  if (flags.unread) query.is_read = false;

  const items = await client.listReading(query);
  if (items.length === 0) {
    console.log('没有阅读收藏');
    return;
  }
  console.log(`共 ${items.length} 篇：\n`);
  for (const i of items) {
    const star = i.is_starred ? '★' : ' ';
    const read = i.is_read ? '✓' : '○';
    console.log(`  ${star} ${read} [${i.id}] ${i.title || i.url}`);
  }
}

async function cmdAddReading(flags) {
  if (!flags.url) {
    console.error('✗ 缺少 --url');
    process.exit(1);
  }
  const client = requireClient();
  const data = { url: flags.url };
  if (flags.title) data.title = flags.title;
  if (flags.summary) data.summary = flags.summary;
  if (flags.category) data.category = flags.category;
  if (flags.tags) data.tags = flags.tags.split(',').map(s => s.trim()).filter(Boolean);
  if (flags.platform) data.platform = flags.platform;
  if (flags.cover) data.cover_url = flags.cover;
  if (flags['cover-url']) data.cover_url = flags['cover-url'] || flags.cover;
  if (flags['offline-path']) data.offline_path = flags['offline-path'];
  if (flags.offline != null || flags['is-offline'] != null) {
    const v = flags.offline != null ? flags.offline : flags['is-offline'];
    data.is_offline = v === 'true' || v === true;
  }

  const created = await client.createReading(data);
  console.log('✓ 阅读收藏已添加');
  console.log(`  ID: ${created.id}`);
}

async function cmdWhereIsKey() {
  const { getConfigPath } = await import('./lib/config.js');
  console.log(`API Key 配置文件位置：${getConfigPath()}`);
  console.log('\n如何找到你的 API Key：');
  console.log('  1. 登录 https://buddy.bajiaolu.cn');
  console.log('  2. 右上角头像 → 个人设置 → API Key Tab');
  console.log('  3. 创建新 Key 并复制明文（仅显示一次）');
  console.log(`  4. 写入 ${getConfigPath()}（chmod 600）`);
}

// ── 社媒视频解析(内置脚本,仅解析返回原始信息) ──
async function cmdExtractVideo(flags) {
  const input = flags._positional?.[0] || flags.input;
  if (!input) {
    console.error('✗ 用法: node index.js extract-video "<分享文本或URL>"');
    process.exit(1);
  }
  if (!fs.existsSync(EXTRACT_SCRIPT)) {
    console.error(`✗ 内置解析脚本缺失: ${EXTRACT_SCRIPT}`);
    process.exit(1);
  }
  try {
    const stdout = execFileSync(process.execPath, [EXTRACT_SCRIPT, '--json', input], {
      encoding: 'utf8',
      maxBuffer: 50 * 1024 * 1024,
      timeout: 90 * 1000,
    });
    // 脚本用 __GV_JSON_BEGIN__/END__ marker 包裹原始 JSON
    const m = stdout.match(/__GV_JSON_BEGIN__([\s\S]*?)__GV_JSON_END__/);
    if (m) {
      const data = JSON.parse(m[1].trim());
      console.log(JSON.stringify(data, null, 2));
    } else {
      // 没 marker 就原样输出
      console.log(stdout);
    }
  } catch (err) {
    console.error('✗ 解析失败:', err.message);
    if (err.stderr) console.error(err.stderr);
    process.exit(1);
  }
}

// ── 下载/离线(走 AI-Buddy 服务端,保存到服务端默认目录) ──
async function cmdDownloadVideo(flags) {
  const input = flags._positional?.[0] || flags.input;
  if (!input) {
    console.error('✗ 用法: node index.js download-video "<分享文本或URL>"');
    process.exit(1);
  }
  const cfg = loadConfig();
  if (!cfg) throw new Error('未找到配置，请先运行: node index.js init');
  const client = new BuddyClient(cfg);
  try {
    const result = await client.request('POST', '/extract/download', { body: { input } });
    if (result && result.code === 200) {
      console.log('✓ 下载完成（文件已存到 AI-Buddy 服务端，与 Agent 所在机器无关）');
      console.log(`  平台: ${result.host}`);
      console.log(`  标题: ${result.title}`);
      console.log(`  离线目录: ${result.offline_path}`);
      console.log('  提示：文件在服务端统一目录，用户从 Buddy 网页/App 的阅读列表查看，请勿在本地另存。');
    } else {
      console.error('✗ 下载失败:', result?.message || JSON.stringify(result));
      process.exit(1);
    }
  } catch (err) {
    console.error('✗ 下载失败:', err.message);
    process.exit(1);
  }
}

async function cmdDoctor() {
  const { getConfigPath } = await import('./lib/config.js');

  console.log('buddy-skill doctor — 环境诊断\n');

  // 1. Node.js 版本
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  console.log(`Node.js: ${process.version} ${nodeMajor >= 18 ? '✓' : '✗ 需要 >=18'}`);

  // 2. 配置文件
  const cfgPath = getConfigPath();
  const cfg = loadConfig();
  if (cfg) {
    console.log(`配置文件: ${cfgPath} ✓ (api_base: ${cfg.api_base})`);
    console.log(`API Key: ${cfg.api_key ? '已设置 ✓' : '✗ 缺少 api_key'}`);
  } else {
    console.log(`配置文件: ${cfgPath} ✗ 未找到（运行 node index.js init 初始化）`);
  }

  // 3. 内置解析脚本检查(buddy-skill 自包含,不再依赖外部 ExtractVideoSkill)
  if (fs.existsSync(EXTRACT_SCRIPT)) {
    console.log(`内置解析脚本: ${EXTRACT_SCRIPT} ✓`);
  } else {
    console.log(`内置解析脚本: ✗ 缺失（${EXTRACT_SCRIPT} 不存在,请检查 buddy-skill 完整性）`);
  }

  // 4. API 连接测试（仅在配置完整时）
  if (cfg && cfg.api_key) {
    try {
      const client = new BuddyClient(cfg);
      const me = await client.me();
      console.log(`API 连接: ✓ (用户: ${me.nickname || me.username})`);
    } catch (err) {
      console.log(`API 连接: ✗ ${err.message}`);
    }
  }
}

async function main() {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  if (command === '--version' || command === '-v') {
    console.log(VERSION);
    return;
  }

  if (command === 'doctor') {
    return cmdDoctor();
  }

  // 自动更新检查：落后则下载更新(跳过 doctor/--version/help)
  await selfUpdateCheck();

  const flags = parseFlags(args.slice(1));

  try {
    switch (command) {
      case 'init': return cmdInit();
      case 'test': return cmdTest();
      case 'whoami': return cmdWhoami();
      case 'list-task-groups': return cmdListTaskGroups(flags);
      case 'list-tasks': return cmdListTasks(flags);
      case 'get-task': return cmdGetTask(flags._positional?.[0]);
      case 'add-task': return cmdAddTask(flags);
      case 'update-task': return cmdUpdateTask(flags._positional?.[0], flags);
      case 'delete-task': return cmdDeleteTask(flags._positional?.[0]);
      case 'organize-tasks': return cmdOrganizeTasks(flags._positional?.[0] || flags.strategy);
      case 'list-memos': return cmdListMemos(flags);
      case 'add-memo': return cmdAddMemo(flags);
      case 'list-reading': return cmdListReading(flags);
      case 'add-reading': return cmdAddReading(flags);
      case 'extract-video': return cmdExtractVideo(flags);
      case 'download-video': return cmdDownloadVideo(flags);
      case 'where-is-key': return cmdWhereIsKey();
      default:
        console.error(`✗ 未知命令: ${command}`);
        printUsage();
        process.exit(1);
    }
  } catch (err) {
    console.error(`✗ 错误: ${err.message}`);
    if (process.env.DEBUG) console.error(err.stack);
    process.exit(1);
  }
}

main();

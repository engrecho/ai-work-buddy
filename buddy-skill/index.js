#!/usr/bin/env node
// buddy-skill CLI 入口
// 用法：node index.js <command> [options]

import { initConfigInteractive, loadConfig } from './lib/config.js';
import BuddyClient from './lib/client.js';
import { planOrganize } from './tools/organize.js';
import { formatOrganizePlan, formatDeletePlan } from './tools/confirm.js';

const args = process.argv.slice(2);
const command = args[0];

function printUsage() {
  console.log(`
buddy-skill — AI-Buddy 官方 SKILL CLI

用法：
  node index.js init                      交互式初始化配置
  node index.js test                      测试连接
  node index.js whoami                    查看当前用户
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

整理策略 strategy 取值：
  archive-completed      归档 30 天前已完成的任务
  set-priority-by-due    根据截止日期自动设置优先级
  clean-duplicates       归档重复任务

示例：
  node index.js list-tasks --status todo --limit 10
  node index.js add-task --title "完成 Q3 报告" --priority high
  node index.js organize-tasks archive-completed
  node index.js delete-task 42
`);
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

async function main() {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  const flags = parseFlags(args.slice(1));

  try {
    switch (command) {
      case 'init': return cmdInit();
      case 'test': return cmdTest();
      case 'whoami': return cmdWhoami();
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

#!/usr/bin/env node
// 示例 2：整理任务（plan-then-confirm 流程演示）
import BuddyClient from '../lib/client.js';
import { planOrganize } from '../tools/organize.js';
import { formatOrganizePlan } from '../tools/confirm.js';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const client = new BuddyClient();

const strategy = process.argv[2] || 'archive-completed';
console.log(`\n正在生成「${strategy}」整理计划...`);

const plan = await planOrganize(strategy);
const formatted = formatOrganizePlan(strategy, plan);
console.log('\n' + formatted);

if (plan.length === 0) {
  console.log('\n没有可执行的操作');
  process.exit(0);
}

const rl = readline.createInterface({ input, output });
const answer = await rl.question('\n确认执行以上操作？(yes/no): ');
rl.close();

if (answer.trim().toLowerCase() !== 'yes') {
  console.log('已取消');
  process.exit(0);
}

console.log('\n执行中...');
const result = await client.organizeTasks(plan, { dryRun: false });
console.log('\n✓ 完成');
console.log(`  计划操作: ${result.planned}`);
console.log(`  实际执行: ${result.executed}`);
if (result.errors?.length) {
  console.log(`  失败: ${result.errors.length}`);
  for (const e of result.errors) console.log(`    - ${e}`);
}

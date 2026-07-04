#!/usr/bin/env node
// 示例 1：列出今日到期的任务
import BuddyClient from '../lib/client.js';

const client = new BuddyClient();

// 计算今日起 7 天内的窗口
const today = new Date();
const weekLater = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

const tasks = await client.listTasks({
  status: 'todo',
  limit: 100,
});

const upcoming = tasks.filter(t => {
  if (!t.due_date) return false;
  const due = new Date(t.due_date);
  return due <= weekLater;
});

console.log(`\n📅 接下来 7 天内有 ${upcoming.length} 个任务到期：\n`);

for (const t of upcoming.sort((a, b) => new Date(a.due_date) - new Date(b.due_date))) {
  const pri = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢';
  const days = Math.floor((new Date(t.due_date) - today) / (1000 * 60 * 60 * 24));
  const dueText = days < 0 ? `已逾期 ${-days} 天` : days === 0 ? '今天到期' : `${days} 天后`;
  console.log(`  ${pri} [${t.id}] ${t.title}  —  ${dueText} (${t.due_date.slice(0, 10)})`);
}

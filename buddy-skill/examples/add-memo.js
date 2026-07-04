#!/usr/bin/env node
// 示例 3：把当前剪贴板内容快速保存为备忘
import BuddyClient from '../lib/client.js';

const content = process.argv[2];
if (!content) {
  console.error('用法: node add-memo.js "<备忘内容>"');
  process.exit(1);
}

const client = new BuddyClient();
const memo = await client.createMemo({
  content,
  memo_type: 'note',
});

console.log(`✓ 备忘已保存 [ID: ${memo.id}]`);
console.log(`  ${content.slice(0, 60)}${content.length > 60 ? '...' : ''}`);

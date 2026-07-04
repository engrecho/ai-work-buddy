// 用户确认机制
// AI 助手在执行破坏性操作前必须调用这些函数

/**
 * 生成删除确认的展示内容
 * AI 助手需要把返回值原样展示给用户，然后调用 AskUserQuestion 让用户确认
 */
export function formatDeletePlan(tasks) {
  if (!tasks || tasks.length === 0) {
    return '没有要删除的任务';
  }

  const lines = [
    `即将删除 ${tasks.length} 个任务：`,
    '',
  ];

  for (const t of tasks) {
    const status = t.status === 'done' ? '✓' : t.status === 'in_progress' ? '◐' : '○';
    const due = t.due_date ? `截止 ${t.due_date.slice(0, 10)}` : '';
    lines.push(`  ${status} [${t.id}] ${t.title}${due ? `  (${due})` : ''}`);
  }

  lines.push('');
  lines.push('此操作不可撤销！请确认是否继续。');

  return lines.join('\n');
}

/**
 * 生成整理计划的展示内容
 */
export function formatOrganizePlan(strategy, plan) {
  if (!plan || plan.length === 0) {
    return `策略「${strategy}」没有可执行的操作`;
  }

  const lines = [
    `整理策略：${strategy}`,
    `共 ${plan.length} 个操作：`,
    '',
  ];

  for (const op of plan) {
    if (op.action === 'update') {
      const changes = Object.entries(op.changes || {}).map(([k, v]) => `${k}=${v}`).join(', ');
      lines.push(`  [更新 ${op.id}] ${changes}`);
      if (op.reason) lines.push(`    原因：${op.reason}`);
    } else if (op.action === 'delete') {
      lines.push(`  [删除 ${op.id}]`);
      if (op.reason) lines.push(`    原因：${op.reason}`);
    } else if (op.action === 'create') {
      lines.push(`  [创建] ${op.data?.title || ''}`);
    }
  }

  return lines.join('\n');
}

/**
 * AI 助手应该把上面函数返回的内容展示给用户，
 * 然后调用宿主环境提供的 AskUserQuestion 工具让用户确认。
 *
 * 用户的回答会被传给对应的 execute 工具。
 *
 * 示例对话（AI 助手内部）：
 *   1. 用户：帮我清理一下任务
 *   2. AI 调用 plan_organize({ strategy: 'archive-completed' })
 *   3. AI 调用 formatOrganizePlan(...)
 *   4. AI 向用户展示格式化后的计划
 *   5. AI 调用 AskUserQuestion(question="是否执行？", options=["确认执行", "取消"])
 *   6. 用户选择"确认执行"
 *   7. AI 调用 execute_organize({ plan })
 */

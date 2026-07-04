// 整理任务
// 重要：所有破坏性操作必须先列计划（dry_run=true）让用户确认

import BuddyClient from '../lib/client.js';

let _client = null;
function client() {
  if (!_client) _client = new BuddyClient();
  return _client;
}

/**
 * 生成整理计划（不执行）
 * @param {string} strategy - 整理策略：'by-group' | 'by-priority' | 'archive-completed'
 * @returns {Promise<Object>} 计划
 */
export async function planOrganize(strategy) {
  // 1. 拉取所有任务
  const tasks = await client.listTasks({ limit: 500 });

  const plan = [];

  switch (strategy) {
    case 'archive-completed': {
      // 把已完成的旧任务归档
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      for (const t of tasks) {
        if (t.status === 'done' && new Date(t.updated_at) < thirtyDaysAgo) {
          plan.push({
            action: 'update',
            id: t.id,
            changes: { status: 'archived' },
            reason: `已完成超过 30 天：${t.title}`,
          });
        }
      }
      break;
    }

    case 'set-priority-by-due': {
      // 根据截止日期自动设置优先级
      const today = new Date();
      for (const t of tasks) {
        if (t.status === 'done' || t.status === 'archived') continue;
        if (!t.due_date) continue;
        const due = new Date(t.due_date);
        const days = Math.floor((due - today) / (1000 * 60 * 60 * 24));
        let newPriority = null;
        if (days < 0) newPriority = 'high';          // 已逾期
        else if (days <= 3) newPriority = 'high';     // 3 天内到期
        else if (days <= 7) newPriority = 'medium';   // 一周内
        else newPriority = 'low';

        if (newPriority && newPriority !== t.priority) {
          plan.push({
            action: 'update',
            id: t.id,
            changes: { priority: newPriority },
            reason: `截止 ${t.due_date}（${days} 天）→ ${newPriority}：${t.title}`,
          });
        }
      }
      break;
    }

    case 'clean-duplicates': {
      // 标记疑似重复任务
      const titleMap = new Map();
      for (const t of tasks) {
        const key = t.title.toLowerCase().trim();
        if (!titleMap.has(key)) titleMap.set(key, []);
        titleMap.get(key).push(t);
      }
      for (const [title, list] of titleMap) {
        if (list.length > 1) {
          // 保留最新的，标记其他为重复
          list.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
          for (let i = 1; i < list.length; i++) {
            plan.push({
              action: 'update',
              id: list[i].id,
              changes: { status: 'archived' },
              reason: `疑似重复：${list[i].title}（保留 ID ${list[0].id}）`,
            });
          }
        }
      }
      break;
    }

    default:
      throw new Error(`未知策略: ${strategy}`);
  }

  return plan;
}

/**
 * 整理任务工具
 *
 * 使用流程：
 * 1. AI 助手调用 plan_organize(strategy) 拿到计划
 * 2. AI 助手向用户展示计划（人类可读的总结）
 * 3. 用户确认后，AI 助手调用 execute_organize(plan, { confirm: true })
 * 4. 实际执行（事务）
 */
export const organizeTools = {
  plan_organize: {
    description: '生成整理任务计划（不执行）。会返回一组待执行的操作和影响范围。',
    parameters: {
      strategy: {
        type: 'string',
        enum: ['archive-completed', 'set-priority-by-due', 'clean-duplicates'],
        required: true,
        description: 'archive-completed=归档30天前完成的; set-priority-by-due=按截止日期设优先级; clean-duplicates=归档重复任务',
      },
    },
    handler: async ({ strategy }) => {
      const plan = await planOrganize(strategy);
      return {
        strategy,
        plan_size: plan.length,
        plan,
        affected_task_ids: plan.map(p => p.id).filter(Boolean),
        // 给 AI 用的提示：必须先向用户确认
        notice: '请向用户展示此计划的所有操作（包括 reason 字段），并使用 confirm_plan 工具让用户确认后才能执行。',
      };
    },
  },

  execute_organize: {
    description: '执行已确认的整理计划。必须先调用 plan_organize 拿到计划，向用户确认后再次调用此工具。',
    parameters: {
      plan: { type: 'array', required: true },
    },
    handler: async ({ plan }) => {
      const result = await client().organizeTasks(plan, { dryRun: false });
      return result;
    },
  },
};

// 任务工具
import BuddyClient from '../lib/client.js';

const client = new BuddyClient();

export const tasksTools = {
  list_tasks: {
    description: '列出任务。支持按状态、优先级、分组过滤。',
    parameters: {
      status: { type: 'string', enum: ['todo', 'in_progress', 'done', 'archived'], optional: true },
      priority: { type: 'string', enum: ['high', 'medium', 'low'], optional: true },
      group_id: { type: 'number', optional: true },
      q: { type: 'string', description: '标题模糊搜索', optional: true },
      limit: { type: 'number', default: 50 },
      order: { type: 'string', default: 'updated_at:desc' },
    },
    handler: async (params) => {
      const tasks = await client().listTasks(params);
      return {
        count: tasks.length,
        tasks: tasks.map(t => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          due_date: t.due_date,
          group_id: t.group_id,
          progress: t.progress,
          updated_at: t.updated_at,
        })),
      };
    },
  },

  get_task: {
    description: '获取单个任务的完整详情。',
    parameters: {
      id: { type: 'number', required: true },
    },
    handler: async ({ id }) => client.getTask(id),
  },

  add_task: {
    description: '创建新任务。',
    parameters: {
      title: { type: 'string', required: true },
      description: { type: 'string', optional: true },
      status: { type: 'string', default: 'todo' },
      priority: { type: 'string', default: 'medium' },
      group_id: { type: 'number', optional: true },
      due_date: { type: 'string', description: 'ISO 8601 格式', optional: true },
      plan_date: { type: 'string', optional: true },
    },
    handler: async (params) => client().createTask(params),
  },

  update_task: {
    description: '更新任务字段。',
    parameters: {
      id: { type: 'number', required: true },
      changes: { type: 'object', required: true },
    },
    handler: async ({ id, changes }) => client.updateTask(id, changes),
  },

  // 删除任务需要先通过 confirm_deletion 工具向用户确认
  delete_task: {
    description: '删除任务。必须先调用 confirm_deletion 工具向用户列出待删除任务并获得确认。',
    parameters: {
      id: { type: 'number', required: true },
    },
    handler: async ({ id }) => {
      // 实际删除前应在 AI 助手中先调用 confirm_deletion
      return await client().deleteTask(id, { confirm: true });
    },
  },
};

// 备忘工具
import BuddyClient from '../lib/client.js';

const client = new BuddyClient();

export const memosTools = {
  list_memos: {
    description: '列出备忘。支持关键字搜索和标签过滤。',
    parameters: {
      q: { type: 'string', description: '标题模糊搜索', optional: true },
      memo_type: { type: 'string', optional: true },
      limit: { type: 'number', default: 30 },
    },
    handler: async (params) => {
      const memos = await client.listMemos(params);
      return {
        count: memos.length,
        memos: memos.map(m => ({
          id: m.id,
          title: m.title,
          memo_type: m.memo_type,
          tags: m.tags,
          created_at: m.created_at,
        })),
      };
    },
  },

  add_memo: {
    description: '创建新备忘。',
    parameters: {
      title: { type: 'string', optional: true },
      content: { type: 'string', required: true },
      memo_type: { type: 'string', default: 'note' },
      tags: { type: 'array', items: { type: 'string' }, optional: true },
    },
    handler: async (params) => client().createMemo(params),
  },
};

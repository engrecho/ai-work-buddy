// 阅读收藏工具
import BuddyClient from '../lib/client.js';

let _client = null;
function client() {
  if (!_client) _client = new BuddyClient();
  return _client;
}

export const readingTools = {
  list_reading: {
    description: '列出阅读收藏。',
    parameters: {
      q: { type: 'string', optional: true },
      is_read: { type: 'boolean', optional: true },
      is_starred: { type: 'boolean', optional: true },
      limit: { type: 'number', default: 30 },
    },
    handler: async (params) => {
      const items = await client().listReading(params);
      return {
        count: items.length,
        items: items.map(i => ({
          id: i.id,
          title: i.title,
          url: i.url,
          category: i.category,
          is_read: i.is_read,
          is_starred: i.is_starred,
          created_at: i.created_at,
        })),
      };
    },
  },

  add_reading: {
    description: '添加阅读收藏。',
    parameters: {
      url: { type: 'string', required: true },
      title: { type: 'string', optional: true },
      summary: { type: 'string', optional: true },
      category: { type: 'string', optional: true },
      tags: { type: 'array', items: { type: 'string' }, optional: true },
    },
    handler: async (params) => client.createReading(params),
  },
};

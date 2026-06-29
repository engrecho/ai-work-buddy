/**
 * TaskMention Tiptap Extension
 * 在富文本里插入一个不可编辑的「任务引用」chip 节点
 * 渲染为：[状态图标] 任务标题  (带颜色标签样式)
 */
import { Node, mergeAttributes } from '@tiptap/core';

export const TaskMention = Node.create({
  name: 'taskMention',
  group: 'inline',
  inline: true,
  selectable: true,
  atom: true, // 不可进入内部编辑

  addAttributes() {
    return {
      id: { default: null },
      title: { default: '' },
      status: { default: 'todo' },
      groupName: { default: '' },
      groupColor: { default: '#9ca3af' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-task-mention]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-task-mention': HTMLAttributes.id,
        'data-task-status': HTMLAttributes.status,
        class: 'task-mention-chip',
        contenteditable: 'false',
      }),
      ['span', { class: 'task-mention-status' }, statusIcon(HTMLAttributes.status)],
      ['span', { class: 'task-mention-title' }, HTMLAttributes.title || '未命名任务'],
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.setAttribute('data-task-mention', node.attrs.id);
      dom.setAttribute('data-task-status', node.attrs.status);
      dom.setAttribute('contenteditable', 'false');
      dom.className = 'task-mention-chip';
      dom.style.cssText = `
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 1px 8px 1px 6px;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        user-select: none;
        vertical-align: middle;
        border: 1px solid;
        line-height: 1.6;
        margin: 0 2px;
        transition: opacity 0.15s;
        background-color: ${chipBg(node.attrs.status)};
        color: ${chipText(node.attrs.status)};
        border-color: ${chipBorder(node.attrs.status)};
      `;

      // 状态点
      const dot = document.createElement('span');
      dot.style.cssText = `
        width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0;
        background-color: ${dotColor(node.attrs.status)};
      `;

      // 标题
      const title = document.createElement('span');
      title.textContent = node.attrs.title || '未命名任务';

      dom.appendChild(dot);
      dom.appendChild(title);

      return { dom };
    };
  },
});

// ─── 工具函数 ────────────────────────────────────────────────────
function statusIcon(status) {
  const map = { done: '✓', in_progress: '⋯', todo: '○' };
  return map[status] || '○';
}

function chipBg(status) {
  if (status === 'done') return '#f0fdf4';
  if (status === 'in_progress') return '#eff6ff';
  return '#f9fafb';
}

function chipText(status) {
  if (status === 'done') return '#16a34a';
  if (status === 'in_progress') return '#2563eb';
  return '#6b7280';
}

function chipBorder(status) {
  if (status === 'done') return '#bbf7d0';
  if (status === 'in_progress') return '#bfdbfe';
  return '#e5e7eb';
}

function dotColor(status) {
  if (status === 'done') return '#22c55e';
  if (status === 'in_progress') return '#60a5fa';
  return '#d1d5db';
}

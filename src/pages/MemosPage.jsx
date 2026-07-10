import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, FileText, Link2, Trash2, Pencil, ExternalLink, Tag, Check, X, ChevronLeft, BookOpen, Search, ZapIcon, Clock, LayoutList, Layers, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { genId } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import RichEditor from '@/components/RichEditor';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/* ================================================================
   工具函数
================================================================ */

function tagStyle(color) {
  return {
    backgroundColor: color + '22',
    color,
    border: `1px solid ${color}44`,
  };
}

function stripHtml(html) {
  if (!html) return '';
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
}
/* ================================================================
   URL 标题解析工具函数
================================================================ */
/** 通过隐藏 iframe 加载页面，利用浏览器已有登录态读取 title */

function fetchTitleViaIframe(url, timeoutMs = 6000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      try {
        document.body.removeChild(iframe);
      } catch {}
      resolve(v || null);
    };
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:1px;height:1px;top:-9999px;left:-9999px;opacity:0;pointer-events:none;border:none;';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms';
    const timer = setTimeout(() => done(null), timeoutMs);
    iframe.onload = () => {
      clearTimeout(timer);
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        const t = doc?.title?.trim();
        if (t && !t.includes('登录') && !t.includes('Login')) {
          done(t.slice(0, 200));
          return;
        }
        done(doc?.querySelector('h1')?.textContent?.trim()?.slice(0, 200) || null);
      } catch {
        done(null);
      }
    };
    iframe.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    iframe.src = url;
    document.body.appendChild(iframe);
  });
}
/** 解析 URL 对应的页面标题（通过 iframe 获取） */

async function fetchUrlTitle(url) {
  if (!url || !url.startsWith('http')) return null;
  const cleanUrl = url.trim();
  try { new URL(cleanUrl); } catch { return null; }

  try {
    const t = await fetchTitleViaIframe(cleanUrl, 6000);
    if (t) return t;
  } catch {}
  return null;
}
/* ================================================================
   子组件（全部定义在 MemosPage 外，避免每次渲染重新挂载导致失焦）
================================================================ */
// ── 筛选按钮 ─────────────────────────────────────────────────────

function FilterBtn({ active, onClick, label, count, color }) {
  return (
    <button
      onClick={onClick}
      className={`text-xs px-2.5 py-1 rounded-full border transition-all font-medium flex-shrink-0 ${active && !color ? 'border-[#bbea3b] bg-[#f0fcd0] text-[#4a6800]' : !active ? 'border-gray-200 bg-white text-gray-500 hover:border-gray-300' : ''}`}
      style={
        active && color
          ? {
              backgroundColor: color + '22',
              color,
              border: `1px solid ${color}44`,
            }
          : {}
      }
    >
      {label}
      {count !== undefined && <span className='ml-1 opacity-60'>{count}</span>}
    </button>
  );
} // ── 分组 Badge ────────────────────────────────────────────────────
// 样式：圆角胶囊（rounded-full）+ 彩色圆点 + 彩色半透明背景，视觉更饱满

function GroupBadge({ direction, groupMap }) {
  const key = direction != null && direction !== '' ? String(direction) : null;
  const group = key ? groupMap[key] : null;
  if (group)
    return (
      <span
        className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold flex-shrink-0 border'
        style={{
          backgroundColor: group.color + '1a',
          color: group.color,
          borderColor: group.color + '55',
        }}
      >
        <span
          className='w-1.5 h-1.5 rounded-full flex-shrink-0'
          style={{
            backgroundColor: group.color,
          }}
        />
        {group.name}
      </span>
    );
  if (key) return <span className='inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 border border-gray-200 flex-shrink-0'>分组#{key.slice(-4)}</span>;
  return null;
} // ── 标签 Badge ────────────────────────────────────────────────────
// 样式：小圆角（rounded）+ 「#」前缀 + 纯色细边框 + 纯白背景，与分组明显区分

function TagBadge({ tagId, tagMap }) {
  const tag = tagMap[String(tagId)];
  if (!tag) return null;
  return (
    <span
      className='inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium flex-shrink-0 border bg-white'
      style={{
        color: tag.color,
        borderColor: tag.color + '66',
      }}
    >
      <span className='opacity-50 font-normal'>#</span>
      {tag.name}
    </span>
  );
} // ── 分组选择器（横向 Chip，直接点击，无下拉）──────────────

function DirectionPicker({ form, setForm, groups, hideLabel = false }) {
  const selectedId = String(form.direction || '');
  const setFormDirection = (dirId) => {
    setForm((p) => ({ ...p, direction: dirId }));
  };
  return (
    <div className='w-full'>
      {!hideLabel && (
        <div className='text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1'>
          <Layers className='h-3 w-3' /> 分组
        </div>
      )}
      <div className='flex gap-1.5 overflow-x-auto -mx-0.5 px-0.5 py-0.5'>
        <button
          type='button'
          onClick={() => setFormDirection('')}
          className={`flex-shrink-0 px-3 h-7 rounded-md text-xs font-medium transition-colors ${
            !selectedId
              ? 'bg-gray-800 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
          }`}
        >
          未分类
        </button>
        {groups.map((g) => {
          const isActive = selectedId === String(g.id);
          return (
            <button
              key={g.id}
              type='button'
              onClick={() => setFormDirection(String(g.id))}
              className={`flex-shrink-0 px-3 h-7 rounded-md text-xs font-medium transition-colors ${
                isActive
                  ? 'text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
              style={
                isActive
                  ? { backgroundColor: g.color }
                  : { color: g.color }
              }
            >
              {g.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── 标签多选器（标签云，多行排列）──────────────

const TAG_PRESET_COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#6b7280', '#84cc16', '#f97316',
];

function TagSelector({ form, setForm, tags, onTagCreated }) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(TAG_PRESET_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const newInputRef = useRef(null);

  const selectedIds = (form.tag_ids || []).map(String);
  const toggleTag = (id) => {
    const sid = String(id);
    const cur = (form.tag_ids || []).map(String);
    if (cur.includes(sid)) {
      setForm((p) => ({ ...p, tag_ids: (p.tag_ids || []).filter((x) => String(x) !== sid) }));
    } else {
      setForm((p) => ({ ...p, tag_ids: [...(p.tag_ids || []), id] }));
    }
  };

  const handleStartAdd = () => {
    setAdding(true);
    setNewName('');
    setNewColor(TAG_PRESET_COLORS[0]);
    setTimeout(() => newInputRef.current?.focus(), 50);
  };

  const handleCreateTag = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!newName.trim() || saving) return;
    setSaving(true);
    const id = genId();
    await supabase.from('task_tags').insert([{ id, name: newName.trim(), color: newColor }]);
    await onTagCreated?.();
    setForm((p) => ({ ...p, tag_ids: [...(p.tag_ids || []), id] }));
    setAdding(false);
    setNewName('');
    setSaving(false);
  };

  return (
    <div className='w-full'>
      <div className='text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1'>
        <Tag className='h-3 w-3' /> 标签
      </div>
      <div className='flex flex-wrap gap-1.5'>
        {tags.length === 0 && !adding && (
          <span className='text-xs text-gray-400 py-1'>暂无标签</span>
        )}
        {tags.map((t) => {
          const isSelected = selectedIds.includes(String(t.id));
          return (
            <button
              key={t.id}
              type='button'
              onClick={() => toggleTag(t.id)}
              className={`inline-flex items-center gap-1 px-2.5 h-7 rounded-md text-xs font-medium transition-colors ${
                isSelected
                  ? 'text-white'
                  : 'bg-gray-100 hover:bg-gray-200'
              }`}
              style={
                isSelected
                  ? { backgroundColor: t.color }
                  : { color: t.color }
              }
            >
              <span className='max-w-[8rem] truncate'>{t.name}</span>
              {isSelected && <Check className='w-3 h-3 opacity-80' />}
            </button>
          );
        })}
        {!adding ? (
          <button
            type='button'
            onClick={handleStartAdd}
            className='inline-flex items-center gap-1 px-2 h-7 rounded-md text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 hover:bg-gray-100 hover:text-gray-600 transition-colors'
          >
            <Plus className='w-3 h-3' /> 新增
          </button>
        ) : (
          <div className='w-full mt-1 p-2 rounded-lg border border-gray-100 bg-gray-50'>
            <div className='flex items-center gap-2'>
              <input
                ref={newInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreateTag(e); if (e.key === 'Escape') setAdding(false); }}
                placeholder='标签名…'
                className='flex-1 h-7 px-2 text-xs border border-gray-200 rounded-md outline-none focus:border-[#bbea3b] focus:ring-1 focus:ring-[#bbea3b] bg-white transition-colors'
              />
              <button
                type='button' onClick={handleCreateTag}
                disabled={!newName.trim() || saving}
                className='h-7 px-2.5 text-xs font-medium rounded-md disabled:opacity-40 transition-colors flex-shrink-0'
                style={{ backgroundColor: '#bbea3b', color: '#2d4a00' }}
              >
                {saving ? '…' : '加'}
              </button>
              <button
                type='button' onClick={() => setAdding(false)}
                className='h-7 px-2 text-xs text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0'
              >
                <X className='w-3.5 h-3.5' />
              </button>
            </div>
            <div className='flex flex-wrap gap-1.5 mt-2'>
              {TAG_PRESET_COLORS.map((c) => (
                <button
                  key={c} type='button'
                  onClick={() => setNewColor(c)}
                  className={`w-5 h-5 rounded-md flex-shrink-0 transition-transform ${newColor === c ? 'scale-110 ring-2 ring-offset-1 ring-gray-300' : 'hover:scale-105'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
} // ── 关联任务选择器 ────────────────────────────────────────────────

function TaskLinker({ form, setForm, tasks }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const relatedIds = form.related_task_ids || [];
  const filtered = tasks.filter((t) => t.title.toLowerCase().includes(searchTerm.toLowerCase()) && !relatedIds.includes(t.id)).slice(0, 8);
  const addTask = (task) => {
    setForm((p) => ({
      ...p,
      related_task_ids: [...(p.related_task_ids || []), task.id],
    }));
    setSearchTerm('');
    setShowDropdown(false);
  };
  const removeTask = (id) => {
    setForm((p) => ({
      ...p,
      related_task_ids: (p.related_task_ids || []).filter((tid) => tid !== id),
    }));
  };
  return (
    <div className='space-y-2'>
      {relatedIds.length > 0 && (
        <div className='flex flex-wrap gap-1.5'>
          {relatedIds.map((tid, __dnd_i) => {
            const t = tasks.find((x) => x.id === tid);
            if (!t) return null;
            return (
              <span key={tid} className='inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-100'>
                {t.title.slice(0, 20)}
                {t.title.length > 20 ? '…' : ''}
                <button type='button' onClick={() => removeTask(tid)} className='text-blue-400 hover:text-blue-700'>
                  <X className='h-3 w-3' />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <div className='relative'>
        <div className='relative'>
          <Search className='absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none' />
          <Input
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            placeholder='搜索任务关联...'
            className='h-8 text-xs pl-7'
          />
        </div>
        {showDropdown && searchTerm && filtered.length > 0 && (
          <div className='absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto'>
            {filtered.map((t, __dnd_i) => (
              <button key={t.id} type='button' onClick={() => addTask(t)} className='w-full text-left px-3 py-2 text-xs hover:bg-gray-50 flex items-center gap-2'>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.status === 'done' ? 'bg-green-400' : t.status === 'in_progress' ? 'bg-blue-400' : 'bg-gray-300'}`} />
                <span className='truncate'>{t.title}</span>
              </button>
            ))}
          </div>
        )}
        {showDropdown && searchTerm && filtered.length === 0 && (
          <div className='absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg px-3 py-2'>
            <p className='text-xs text-gray-400'>未找到匹配任务</p>
          </div>
        )}
      </div>
      {showDropdown && <div className='fixed inset-0 z-10' onClick={() => setShowDropdown(false)} />}
    </div>
  );
} // ── 关联链接 ──────────────────────────────────────────────────────

function LinkSection({ form, setForm, onAddToReading }) {
  const [addingToRead, setAddingToRead] = useState(false);
  const [addedToRead, setAddedToRead] = useState(!!form.reading_item_id);
  const [fetchingTitle, setFetchingTitle] = useState(false);
  const [previewTitle, setPreviewTitle] = useState('');
  const handleUrlBlur = async () => {
    const url = form.related_url?.trim();
    if (!url || !url.startsWith('http')) return;
    if (previewTitle) return;
    setFetchingTitle(true);
    try {
      const t = await fetchUrlTitle(url);
      if (t) setPreviewTitle(t);
    } finally {
      setFetchingTitle(false);
    }
  };
  const handleAddToReading = async () => {
    if (!form.related_url) return;
    setAddingToRead(true);
    try {
      const id = genId();
      let title = previewTitle || form.related_url;
      try {
        if (!previewTitle) title = new URL(form.related_url).hostname;
      } catch {}
      await supabase.from('reading_items').insert([
        {
          id,
          url: form.related_url,
          title,
          summary: '',
          tags: [],
          is_read: false,
          is_starred: false,
        },
      ]);
      setForm((p) => ({
        ...p,
        reading_item_id: id,
      }));
      setAddedToRead(true);
      onAddToReading && onAddToReading();
    } finally {
      setAddingToRead(false);
    }
  };
  return (
    <div className='space-y-2'>
      <Input
        value={form.related_url}
        onChange={(e) => {
          setForm((p) => ({
            ...p,
            related_url: e.target.value,
          }));
          if (addedToRead) setAddedToRead(false);
          setPreviewTitle('');
        }}
        onBlur={handleUrlBlur}
        placeholder='https://...'
        className='h-9 text-sm'
        type='url'
      />
      {form.related_url && (
        <div className='flex items-start gap-1.5'>
          {fetchingTitle ? (
            <span className='text-xs text-gray-400 italic flex items-center gap-1'>
              <span className='w-3 h-3 rounded-full border-2 border-gray-300 border-t-blue-400 animate-spin inline-block' />
              获取标题中…
            </span>
          ) : previewTitle ? (
            <div className='flex items-start gap-1.5 flex-1 min-w-0 px-2 py-1.5 rounded-lg bg-blue-50 border border-blue-100'>
              <Link2 className='h-3.5 w-3.5 text-blue-400 flex-shrink-0 mt-0.5' />
              <span className='text-xs text-blue-700 leading-snug line-clamp-2'>{previewTitle}</span>
            </div>
          ) : null}
        </div>
      )}
      {form.related_url && (
        <div className='flex items-center gap-2'>
          {addedToRead ? (
            <span className='text-xs text-green-600 flex items-center gap-1'>
              <Check className='h-3 w-3' /> 已加入待读列表
            </span>
          ) : (
            <button type='button' onClick={handleAddToReading} disabled={addingToRead} className='text-xs px-2.5 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center gap-1 transition-colors'>
              <BookOpen className='h-3 w-3' />
              {addingToRead ? '添加中…' : '加入待读'}
            </button>
          )}
        </div>
      )}
    </div>
  );
} // ── 编辑表单 ──────────────────────────────────────────────────────
// ── 移动端即点即改查看面板 ──────────────────────────────────────────

function MobileViewInline({ memo, groups, tags, tasks, groupMap, tagMap, onGoToTask, onFieldSave, onTagCreated }) {
  const [titleVal, setTitleVal] = useState(memo.title || '');
  const [directionVal, setDirectionVal] = useState(memo.direction || '');
  const [tagIdsVal, setTagIdsVal] = useState(memo.tag_ids || []);
  const [contentVal, setContentVal] = useState(memo.content || '');
  const [contentEditing, setContentEditing] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  useEffect(() => {
    setTitleVal(memo.title || '');
    setDirectionVal(memo.direction || '');
    setTagIdsVal(memo.tag_ids || []);
    setContentVal(memo.content || '');
    setContentEditing(false);
  }, [memo.id]);
  const fakeForm = {
    direction: directionVal,
    tag_ids: tagIdsVal,
  };
  const fakeSetFormDirection = (updater) => {
    const next = typeof updater === 'function' ? updater(fakeForm) : updater;
    const val = next.direction ?? directionVal;
    setDirectionVal(val);
    onFieldSave({
      direction: val,
    });
  };
  const fakeSetFormTags = (updater) => {
    const next = typeof updater === 'function' ? updater(fakeForm) : updater;
    const val = next.tag_ids ?? tagIdsVal;
    setTagIdsVal(val);
    onFieldSave({
      tag_ids: val,
    });
  };
  const relatedTasks = (memo.related_task_ids || []).map((id) => tasks.find((t) => t.id === id)).filter(Boolean);
  return (
    <div className='flex-1 overflow-y-auto px-4 py-4 space-y-3'>
      {/* 标题 */}
      <input
        value={titleVal}
        onChange={(e) => setTitleVal(e.target.value)}
        onBlur={() => {
          if (titleVal !== (memo.title || ''))
            onFieldSave({
              title: titleVal,
            });
        }}
        placeholder='备忘标题…'
        className='w-full text-base font-semibold text-gray-900 bg-transparent border-0 border-b border-gray-100 outline-none pb-1 placeholder-gray-300 focus:border-[#bbea3b] transition-colors'
      />
      {/* 分组 + 标签（上下排列） */}
      <div className='space-y-2.5'>
        <DirectionPicker form={fakeForm} setForm={fakeSetFormDirection} groups={groups} />
        <TagSelector form={fakeForm} setForm={fakeSetFormTags} tags={tags} onTagCreated={onTagCreated} />
      </div>
      {/* 关联任务 */}
      <RelatedTasksEditor
        relatedTaskIds={memo.related_task_ids || []}
        tasks={tasks}
        onGoToTask={onGoToTask}
        onSave={(ids) => onFieldSave({ related_task_ids: ids })}
      />
      {/* 关联链接 */}
      {memo.related_url && (
        <div className='flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-50 border border-gray-100'>
          <Link2 className='h-3.5 w-3.5 text-gray-400 flex-shrink-0' />
          <a href={memo.related_url} target='_blank' rel='noopener noreferrer' className='text-xs text-blue-500 truncate flex-1'>
            {memo.related_url}
          </a>
        </div>
      )}
      {/* 内容 */}
      <div className='flex-1 flex flex-col min-h-0'>
        <div className='flex items-center justify-between mb-1'>
          <span className='text-xs font-medium text-gray-400'>内容</span>
          {contentEditing ? (
            <div className='flex items-center gap-1.5'>
              <button
                onClick={() => {
                  setContentVal(memo.content || '');
                  setContentEditing(false);
                }}
                className='text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500'
              >
                取消
              </button>
              <button
                onClick={async () => {
                  setSavingContent(true);
                  await onFieldSave({
                    content: contentVal,
                  });
                  setSavingContent(false);
                  setContentEditing(false);
                }}
                disabled={savingContent}
                className='text-xs px-2.5 py-1 rounded-lg border-0 flex items-center gap-1'
                style={{
                  backgroundColor: '#bbea3b',
                  color: '#2d4a00',
                }}
              >
                <Check className='h-3 w-3' />
                {savingContent ? '保存中…' : '保存'}
              </button>
            </div>
          ) : (
            <button onClick={() => setContentEditing(true)} className='flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500'>
              <Pencil className='h-3 w-3' /> 编辑
            </button>
          )}
        </div>
        <div className='flex-1 min-h-[200px]'>
          <RichEditor key={`${memo.id}-${contentEditing ? 'edit' : 'view'}-mobile`} value={contentVal} onChange={(val) => setContentVal(val)} placeholder='写下备忘内容…' readOnly={!contentEditing} />
        </div>
      </div>
    </div>
  );
}

function MemoEditForm({ form, setForm, groups, tags, tasks, panelMode, onCancel, onSave, saving }) {
  return (
    <div className='flex flex-col h-full'>
      <div className='flex items-center justify-between px-5 py-3.5 border-b border-gray-100 flex-shrink-0'>
        <Input
          value={form.title}
          onChange={(e) =>
            setForm((p) => ({
              ...p,
              title: e.target.value,
            }))
          }
          placeholder='备忘标题...'
          className='h-9 text-sm'
        />
        <button onClick={onCancel} className='p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100'>
          <X className='h-4 w-4' />
        </button>
      </div>
      <div className='flex-1 overflow-y-auto px-5 py-4 space-y-4'>
        {/* 标题 */}
        <div></div>
        {/* 分组 + 标签（上下排列，更直观） */}
        <div className='space-y-3'>
          <DirectionPicker form={form} setForm={setForm} groups={groups} />
          <TagSelector form={form} setForm={setForm} tags={tags} />
        </div>
        {/* 关联任务 */}
        <div>
          <label className='text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1'>
            <ZapIcon className='h-3 w-3' /> 关联任务
          </label>
          <TaskLinker form={form} setForm={setForm} tasks={tasks} />
        </div>
        {/* 关联链接 */}
        <div>
          <label className='text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1'>
            <Link2 className='h-3 w-3' /> 关联链接（可选）
          </label>
          <LinkSection form={form} setForm={setForm} />
        </div>
        {/* 富文本内容 */}
        <div className='flex-1 flex flex-col min-h-0'>
          <label className='text-xs font-medium text-gray-500 mb-1.5 block'>内容</label>
          <div className='flex-1 min-h-[200px]'>
            <RichEditor
              value={form.content}
              onChange={(val) =>
                setForm((p) => ({
                  ...p,
                  content: val,
                }))
              }
              placeholder='写下备忘内容...'
            />
          </div>
        </div>
        <div className='h-2' />
      </div>
      <div className='flex justify-end gap-2 px-5 py-3.5 border-t border-gray-100 flex-shrink-0 pb-safe'>
        <Button variant='outline' size='sm' onClick={onCancel}>
          取消
        </Button>
        <Button
          size='sm'
          className='border-0'
          style={{
            backgroundColor: '#bbea3b',
            color: '#2d4a00',
          }}
          onClick={onSave}
          disabled={!stripHtml(form.content) || saving}
        >
          <Check className='h-3.5 w-3.5 mr-1' />
          {saving ? '保存中...' : '保存'}
        </Button>
      </div>
    </div>
  );
} // ── 分组视图手风琴列表 ────────────────────────────────────────────

function GroupedMemoList({ groupedMemos, activeMemo, groupMap, tagMap, onSelect }) {
  const [collapsed, setCollapsed] = useState({});
  const toggle = (key) =>
    setCollapsed((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  if (!groupedMemos || groupedMemos.length === 0) {
    return (
      <div className='flex flex-col items-center justify-center h-48 text-center px-4'>
        <FileText className='h-8 w-8 text-gray-200 mb-2' />
        <p className='text-xs text-gray-400'>暂无备忘</p>
      </div>
    );
  }
  return (
    <div>
      {groupedMemos.map(({ group, items }, __dnd_i) => {
        const key = group?.id != null ? String(group.id) : '__none__';
        const isCollapsed = !!collapsed[key];
        return (
          <div key={key} className='border-b border-gray-100 last:border-b-0'>
            <button type='button' onClick={() => toggle(key)} className='w-full sticky top-0 z-10 flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100'>
              {group ? (
                <span
                  className='w-2.5 h-2.5 rounded-full flex-shrink-0'
                  style={{
                    backgroundColor: group.color,
                  }}
                />
              ) : (
                <span className='w-2.5 h-2.5 rounded-full border border-dashed border-gray-300 flex-shrink-0' />
              )}
              <span className={`text-xs font-semibold flex-1 text-left ${group ? 'text-gray-700' : 'text-gray-400'}`}>{group ? group.name : '未分类'}</span>
              <span className='text-xs text-gray-400 bg-white border border-gray-200 rounded-full px-1.5 py-0.5 min-w-[20px] text-center'>{items.length}</span>
              <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} fill='none' viewBox='0 0 24 24' stroke='currentColor' strokeWidth={2.5}>
                <path strokeLinecap='round' strokeLinejoin='round' d='M19 9l-7 7-7-7' />
              </svg>
            </button>

            {!isCollapsed && (
              <div className='divide-y divide-gray-50'>
                {items.map((memo, __dnd_i) => (
                  <MemoCard key={memo.id} memo={memo} isActive={activeMemo?.id === memo.id} groupMap={groupMap} tagMap={tagMap} showGroup={false} onSelect={() => onSelect(memo)} />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
} // ── 备忘列表卡片 ──────────────────────────────────────────────────

function MemoCard({ memo, isActive, groupMap, tagMap, showGroup, onSelect }) {
  const title = memo.title || stripHtml(memo.content || '').slice(0, 30) || '无内容';
  const body = memo.title ? stripHtml(memo.content || '').slice(0, 60) : stripHtml(memo.content || '').slice(30, 90);
  const displayTime = memo.updated_at || memo.created_at;
  const isToday = new Date(displayTime).toDateString() === new Date().toDateString();
  const todayStr = isToday
    ? new Date(displayTime).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      })
    : new Date(displayTime).toLocaleDateString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
      }); // 标签列表
  const tagIds = memo.tag_ids || [];
  return (
    <button onClick={onSelect} className={`w-full text-left px-4 py-3.5 transition-colors ${isActive ? 'bg-[#f5fce8] border-l-2 border-[#bbea3b]' : 'hover:bg-gray-50 active:bg-gray-100 border-l-2 border-transparent'}`}>
      {/* 标题 */}
      <p className={`text-sm font-medium leading-snug truncate ${isActive ? 'text-[#2d4a00]' : 'text-gray-800'}`}>{title}</p>
      {/* 正文摘要 */}
      {body && <p className='text-xs text-gray-400 mt-0.5 line-clamp-2 leading-relaxed'>{body}</p>}
      {/* 底部：分组 + 标签 + 时间（同一行，时间靠右） */}
      <div className='flex flex-wrap items-center gap-1 mt-1.5'>
        {showGroup && <GroupBadge direction={memo.direction} groupMap={groupMap} />}
        {tagIds.slice(0, 2).map((tid, __dnd_i) => (
          <TagBadge key={tid} tagId={tid} tagMap={tagMap} />
        ))}
        {tagIds.length > 2 && <span className='text-xs text-gray-400'>+{tagIds.length - 2}</span>}
        <span className='ml-auto text-xs text-gray-400 flex items-center gap-0.5 flex-shrink-0'>
          <Clock className='h-2.5 w-2.5' />
          {todayStr}
        </span>
      </div>
    </button>
  );
} // ── 关联任务编辑器 ─────────────────────────────────────────────────

function RelatedTasksEditor({ relatedTaskIds = [], tasks = [], onGoToTask, onSave }) {
  const [search, setSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);

  const relatedTasks = tasks.filter((t) => relatedTaskIds.includes(t.id));
  const availableTasks = tasks.filter(
    (t) => !relatedTaskIds.includes(t.id) && (search === '' || t.title?.toLowerCase().includes(search.toLowerCase()))
  );

  const handleAdd = (task) => {
    onSave([...relatedTaskIds, task.id]);
    setSearch('');
    setShowDropdown(false);
  };

  const handleRemove = (taskId) => {
    onSave(relatedTaskIds.filter((id) => id !== taskId));
  };

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className='pt-3 border-t border-gray-50'>
      <p className='text-xs text-gray-400 mb-2 flex items-center gap-1'>
        <ZapIcon className='h-3 w-3' /> 关联任务
      </p>
      {/* 已关联任务列表 */}
      {relatedTasks.length > 0 && (
        <div className='space-y-1 mb-2'>
          {relatedTasks.map((t) => (
            <div key={t.id} className='flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 text-xs text-gray-700'>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.status === 'done' ? 'bg-green-400' : t.status === 'in_progress' ? 'bg-blue-400' : 'bg-gray-300'}`} />
              <span className='flex-1 truncate'>{t.title}</span>
              {onGoToTask && (
                <button
                  type='button'
                  onClick={() => onGoToTask(t.id)}
                  className='p-0.5 rounded text-gray-300 hover:text-blue-500 transition-colors'
                  title='跳转到任务'
                >
                  <ExternalLink className='h-3 w-3' />
                </button>
              )}
              <button
                type='button'
                onClick={() => handleRemove(t.id)}
                className='p-0.5 rounded text-gray-300 hover:text-red-400 transition-colors'
                title='移除关联'
              >
                <X className='h-3 w-3' />
              </button>
            </div>
          ))}
        </div>
      )}
      {/* 搜索添加任务 */}
      <div className='relative' ref={dropdownRef}>
        <div className='flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-gray-200 bg-gray-50 hover:border-gray-300 transition-colors'>
          <Plus className='h-3 w-3 text-gray-400 flex-shrink-0' />
          <input
            type='text'
            value={search}
            onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
            onFocus={() => setShowDropdown(true)}
            placeholder='搜索并关联任务…'
            className='flex-1 text-xs bg-transparent outline-none text-gray-600 placeholder-gray-400'
          />
          {search && (
            <button type='button' onClick={() => { setSearch(''); setShowDropdown(false); }}>
              <X className='h-3 w-3 text-gray-400 hover:text-gray-600' />
            </button>
          )}
        </div>
        {showDropdown && (
          <div className='absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-100 rounded-lg shadow-lg max-h-48 overflow-y-auto'>
            {availableTasks.length === 0 ? (
              <div className='py-3 text-center text-xs text-gray-400'>
                {search ? '没有匹配的任务' : '暂无可关联的任务'}
              </div>
            ) : (
              availableTasks.map((t) => (
                <button
                  key={t.id}
                  type='button'
                  onMouseDown={(e) => { e.preventDefault(); handleAdd(t); }}
                  className='w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-gray-50 transition-colors'
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${t.status === 'done' ? 'bg-green-400' : t.status === 'in_progress' ? 'bg-blue-400' : 'bg-gray-300'}`} />
                  <span className='flex-1 truncate text-gray-700'>{t.title}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 查看面板 ──────────────────────────────────────────────────────

function MemoViewPanel({ memo, groupMap, tagMap, groups, tags, tasks, onFieldSave, onDelete, onGoToTask, onTagCreated }) {
  // 本地可编辑状态
  const [titleVal, setTitleVal] = useState(memo.title || '');
  const [directionVal, setDirectionVal] = useState(memo.direction || '');
  const [tagIdsVal, setTagIdsVal] = useState(memo.tag_ids || []);
  const [contentVal, setContentVal] = useState(memo.content || '');
  const [contentEditing, setContentEditing] = useState(false); // 内容是否处于编辑态
  const [savingContent, setSavingContent] = useState(false); // 备忘切换时同步本地状态，并退出编辑态
  useEffect(() => {
    setTitleVal(memo.title || '');
    setDirectionVal(memo.direction || '');
    setTagIdsVal(memo.tag_ids || []);
    setContentVal(memo.content || '');
    setContentEditing(false);
  }, [memo.id]);
  const relatedTasks = (memo.related_task_ids || []).map((id) => tasks.find((t) => t.id === id)).filter(Boolean);
  const [urlTitle, setUrlTitle] = useState(null);
  const [urlLoading, setUrlLoading] = useState(false);
  useEffect(() => {
    if (!memo.related_url) {
      setUrlTitle(null);
      return;
    }
    setUrlLoading(true);
    fetchUrlTitle(memo.related_url)
      .then((t) => setUrlTitle(t))
      .finally(() => setUrlLoading(false));
  }, [memo.related_url]); // 标题失焦保存
  const handleTitleBlur = () => {
    if (titleVal !== (memo.title || ''))
      onFieldSave({
        title: titleVal,
      });
  }; // 分组选择即保存
  const handleDirectionChange = (val) => {
    setDirectionVal(val);
    onFieldSave({
      direction: val,
    });
  }; // 标签选择即保存
  const handleTagIdsChange = (newIds) => {
    setTagIdsVal(newIds);
    onFieldSave({
      tag_ids: newIds,
    });
  }; // 内容保存
  const handleContentSave = async () => {
    setSavingContent(true);
    await onFieldSave({
      content: contentVal,
    });
    setSavingContent(false);
    setContentEditing(false);
  }; // 取消编辑内容
  const handleContentCancel = () => {
    setContentVal(memo.content || '');
    setContentEditing(false);
  }; // 用于 DirectionPicker/TagSelector 的 form/setForm 适配
  const fakeForm = {
    direction: directionVal,
    tag_ids: tagIdsVal,
  };
  const fakeSetFormDirection = (updater) => {
    const next = typeof updater === 'function' ? updater(fakeForm) : updater;
    handleDirectionChange(next.direction ?? directionVal);
  };
  const fakeSetFormTags = (updater) => {
    const next = typeof updater === 'function' ? updater(fakeForm) : updater;
    handleTagIdsChange(next.tag_ids ?? tagIdsVal);
  };
  return (
    <div className='flex flex-col h-full'>
      {/* Header：标题内联编辑 + 删除 */}
      <div className='px-5 pt-3 pb-2.5 border-b border-gray-100 flex-shrink-0'>
        <div className='flex items-start gap-2'>
          <input
            value={titleVal}
            onChange={(e) => setTitleVal(e.target.value)}
            onBlur={handleTitleBlur}
            placeholder='备忘标题…'
            className='flex-1 text-base font-semibold text-gray-900 bg-transparent border-0 outline-none placeholder-gray-300 py-0 leading-snug focus:bg-gray-50 focus:px-2 focus:rounded-lg transition-all min-w-0'
          />
          <button onClick={onDelete} className='flex-shrink-0 p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors mt-0.5' title='删除'>
            <Trash2 className='h-3.5 w-3.5' />
          </button>
        </div>
        {/* 分组 + 标签（上下排列） */}
        <div className='space-y-2.5 mt-2'>
          <DirectionPicker form={fakeForm} setForm={fakeSetFormDirection} groups={groups} />
          <TagSelector form={fakeForm} setForm={fakeSetFormTags} tags={tags} onTagCreated={onTagCreated} />
        </div>
        <div className='flex items-center gap-2 mt-1.5'>
          <span className='text-xs text-gray-300'>
            {new Date(memo.created_at).toLocaleDateString('zh-CN', {
              year: 'numeric',
              month: 'numeric',
              day: 'numeric',
            })}
          </span>
        </div>
      </div>

      <div className='flex-1 overflow-y-auto px-5 py-4 space-y-3'>
        {/* 关联链接 */}
        {memo.related_url && (
          <div className='rounded-xl bg-blue-50/60 border border-blue-100 px-3 py-2.5'>
            <p className='text-xs font-medium text-gray-400 mb-1.5 flex items-center gap-1'>
              <Link2 className='h-3 w-3' /> 关联链接
            </p>
            <a href={memo.related_url} target='_blank' rel='noopener noreferrer' className='flex items-center gap-2 group'>
              <Link2 className='h-3.5 w-3.5 text-blue-400 flex-shrink-0' />
              <span className='text-xs text-blue-600 hover:text-blue-800 truncate flex-1 leading-snug'>{urlLoading ? <span className='text-gray-400 italic'>获取标题中…</span> : urlTitle || memo.related_url}</span>
              <ExternalLink className='h-3 w-3 text-blue-300 group-hover:text-blue-500 flex-shrink-0' />
            </a>
            {urlTitle && <p className='text-[10px] text-gray-400 mt-0.5 truncate pl-5'>{memo.related_url}</p>}
            {memo.reading_item_id && (
              <p className='text-xs text-green-600 mt-1.5 flex items-center gap-1'>
                <BookOpen className='h-3 w-3' /> 已加入待读列表
              </p>
            )}
          </div>
        )}

        {/* 关联任务 */}
        <RelatedTasksEditor
          relatedTaskIds={memo.related_task_ids || []}
          tasks={tasks}
          onGoToTask={onGoToTask}
          onSave={(ids) => onFieldSave({ related_task_ids: ids })}
        />

        {/* 正文 */}
        <div className='flex-1 flex flex-col min-h-0'>
          <div className='flex items-center justify-between mb-1.5'>
            <span className='text-xs font-medium text-gray-400'>内容</span>
            {contentEditing ? (
              <div className='flex items-center gap-1.5'>
                <button onClick={handleContentCancel} className='text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all'>
                  取消
                </button>
                <button
                  onClick={handleContentSave}
                  disabled={savingContent}
                  className='flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border-0 transition-all'
                  style={{
                    backgroundColor: '#bbea3b',
                    color: '#2d4a00',
                  }}
                >
                  <Check className='h-3 w-3' />
                  {savingContent ? '保存中…' : '保存'}
                </button>
              </div>
            ) : (
              <button onClick={() => setContentEditing(true)} className='flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all'>
                <Pencil className='h-3 w-3' />
                编辑
              </button>
            )}
          </div>
          <div className='flex-1 min-h-[200px]'>
            <RichEditor key={`${memo.id}-${contentEditing ? 'edit' : 'view'}`} value={contentVal} onChange={(val) => setContentVal(val)} placeholder='写下备忘内容…' readOnly={!contentEditing} />
          </div>
        </div>
      </div>
    </div>
  );
}
/* ================================================================
   主页面
================================================================ */

const MemosPage = ({ initialMemoId, onInitialMemoConsumed, onGoToTask } = {}) => {
  const [memos, setMemos] = useState([]);
  const [groups, setGroups] = useState([]); // task_groups（配置里的分组）
  const [tags, setTags] = useState([]); // task_tags（标签）
  const [tasks, setTasks] = useState([]);
  const [filterTagId, setFilterTagId] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('time'); // "time" | "group"
  const [panelMode, setPanelMode] = useState(null);
  const [activeMemo, setActiveMemo] = useState(null);
  const [mobileMode, setMobileMode] = useState(null);
  const [mobileMemo, setMobileMemo] = useState(null);
  const [form, setForm] = useState({
    title: '',
    content: '',
    direction: '',
    tag_ids: [],
    related_url: '',
    related_task_ids: [],
    reading_item_id: '',
  });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetchAll();
  }, []);
  const fetchAll = useCallback(async () => {
    const [{ data: m }, { data: grp }, { data: tg }, { data: tk }] = await Promise.all([
      supabase
        .from('memos')
        .select('*')
        .is('deleted_at', null)
        .order('updated_at', {
          ascending: false,
          nullsFirst: false,
        })
        .order('created_at', {
          ascending: false,
        }),
      supabase.from('task_groups').select('*').order('created_at', {
        ascending: true,
      }),
      supabase.from('task_tags').select('*').order('created_at', {
        ascending: true,
      }),
      supabase.from('tasks').select('id, title, status').order('created_at', {
        ascending: false,
      }),
    ]);
    setMemos(m || []);
    setGroups(grp || []);
    setTags(tg || []);
    setTasks(tk || []); // 若有 initialMemoId，自动打开对应备忘
    if (initialMemoId) {
      const target = (m || []).find((memo) => String(memo.id) === String(initialMemoId));
      if (target) {
        setActiveMemo(target);
        setPanelMode('view');
        setMobileMemo(target);
        setMobileMode('view');
      }
      onInitialMemoConsumed?.();
    }
  }, [initialMemoId]); // groupMap / tagMap：key 统一使用字符串，避免数字/字符串类型不匹配
  const groupMap = Object.fromEntries(groups.map((g) => [String(g.id), g]));
  const tagMap = Object.fromEntries(tags.map((t) => [String(t.id), t]));
  const sortByTime = (list) =>
    [...list].sort((a, b) => {
      const ta = new Date(a.updated_at || a.created_at).getTime();
      const tb = new Date(b.updated_at || b.created_at).getTime();
      return tb - ta;
    }); // 关键词过滤（不含分组筛选，供分组视图使用）
  const searchFiltered = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return memos;
    return memos.filter((m) => {
      const titleMatch = (m.title || '').toLowerCase().includes(q);
      const contentMatch = stripHtml(m.content || '')
        .toLowerCase()
        .includes(q);
      return titleMatch || contentMatch;
    });
  })(); // 时间视图：分组筛选 + 搜索 + 排序
  const filteredMemos = (() => {
    let list = searchFiltered;
    if (filterTagId === '__none__') list = list.filter((m) => !m.direction);
    else if (filterTagId !== 'all') list = list.filter((m) => String(m.direction) === String(filterTagId));
    return sortByTime(list);
  })(); // 分组视图：只按搜索词过滤，不受 filterTagId 约束
  const groupedMemos = (() => {
    const list = sortByTime(searchFiltered);
    const map = new Map();
    for (const m of list) {
      const key = m.direction != null && m.direction !== '' ? String(m.direction) : '__none__';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(m);
    }
    const result = [];
    for (const g of groups) {
      const key = String(g.id);
      if (map.has(key))
        result.push({
          group: g,
          items: map.get(key),
        });
    } // direction 不在 groups 里的孤立备忘
    for (const [key, items] of map.entries()) {
      if (key !== '__none__' && !groups.find((g) => String(g.id) === key)) {
        result.push({
          group: null,
          items,
        });
      }
    } // 未分类放最后
    if (map.has('__none__'))
      result.push({
        group: null,
        items: map.get('__none__'),
      });
    return result;
  })();
  const usedGroupKeys = [
    ...new Set(
      memos
        .map((m) => m.direction)
        .filter(Boolean)
        .map(String),
    ),
  ];
  const usedGroups = usedGroupKeys.map((key) => groupMap[key]).filter(Boolean); // ── 表单操作 ─────────────────────────────────────────────────
  const resetForm = useCallback(() => {
    setForm({
      title: '',
      content: '',
      direction: '',
      tag_ids: [],
      related_url: '',
      related_task_ids: [],
      reading_item_id: '',
    });
  }, []);
  const openNew = useCallback(() => {
    resetForm();
    setPanelMode('new');
    setActiveMemo(null);
  }, [resetForm]);
  const openNewMobile = useCallback(() => {
    resetForm();
    setMobileMemo(null);
    setMobileMode('new');
  }, [resetForm]);
  const persistSave = async (memoId, payload, isNew) => {
    const prevMemo = isNew ? null : activeMemo;
    const prevTaskIds = prevMemo?.related_task_ids || [];
    const newTaskIds = payload.related_task_ids || [];
    const removed = prevTaskIds.filter((tid) => !newTaskIds.includes(tid));
    for (const tid of removed) {
      const { data: t } = await supabase.from('tasks').select('related_memo_ids').eq('id', tid).single();
      if (t) {
        const updIds = (t.related_memo_ids || []).filter((mid) => mid !== memoId);
        await supabase
          .from('tasks')
          .update({
            related_memo_ids: updIds,
          })
          .eq('id', tid);
      }
    }
    const added = newTaskIds.filter((tid) => !prevTaskIds.includes(tid));
    for (const tid of added) {
      const { data: t } = await supabase.from('tasks').select('related_memo_ids').eq('id', tid).single();
      if (t) {
        const updIds = [...new Set([...(t.related_memo_ids || []), memoId])];
        await supabase
          .from('tasks')
          .update({
            related_memo_ids: updIds,
          })
          .eq('id', tid);
      }
    }
  }; // 即点即改：单字段保存（用于查看面板内联编辑）
  // 只有保存内容（content）时才更新 updated_at，避免标题/分组/标签修改导致列表排序跳动
  const handleFieldSave = useCallback(
    async (patch) => {
      if (!activeMemo) return;
      const dbPatch = {
        ...patch,
      };
      if ('content' in patch) {
        dbPatch.updated_at = new Date().toISOString();
      }
      const { data } = await supabase.from('memos').update(dbPatch).eq('id', activeMemo.id).select().single();
      const updated = data || {
        ...activeMemo,
        ...dbPatch,
      };
      setActiveMemo(updated);
      setMemos((prev) => prev.map((m) => (m.id === activeMemo.id ? updated : m)));
    },
    [activeMemo],
  );
  const handleSave = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    const id = genId();
    await supabase.from('memos').insert([
      {
        id,
        ...form,
        updated_at: now,
      },
    ]);
    await persistSave(id, form, true);
    const { data } = await supabase.from('memos').select('*').eq('id', id).single();
    await fetchAll();
    setActiveMemo(data);
    setPanelMode('view');
    setSaving(false);
  };
  const handleMobileSave = async () => {
    setSaving(true);
    const now = new Date().toISOString();
    const id = genId();
    await supabase.from('memos').insert([
      {
        id,
        ...form,
        updated_at: now,
      },
    ]);
    await persistSave(id, form, true);
    await fetchAll();
    setSaving(false);
    setMobileMode(null);
    setMobileMemo(null);
    resetForm();
  };
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const handleDelete = async (id) => {
    const now = new Date().toISOString();
    // 软删除：只标记 deleted_at，不真正删除数据
    await supabase.from('memos').update({ deleted_at: now }).eq('id', id);
    if (activeMemo?.id === id) {
      setActiveMemo(null);
      setPanelMode(null);
    }
    setDeleteConfirmId(null);
    fetchAll();
  };
  const handleSelectMemo = (memo) => {
    setActiveMemo(memo);
    setPanelMode('view');
  };
  /* ── 渲染 ── */
  return (
    <div className='h-full overflow-hidden flex flex-col bg-[#f5f5f5]'>
      {/* 移动端全屏 */}
      {mobileMode && (
        <div className='md:hidden fixed inset-0 z-50 flex flex-col bg-white pt-safe'>
          <div className='flex items-center justify-between px-4 h-12 border-b border-gray-100 flex-shrink-0'>
            <button
              onClick={() => {
                setMobileMode(null);
                setMobileMemo(null);
                resetForm();
              }}
              className='flex items-center gap-1 text-gray-500 active:text-gray-800'
            >
              <ChevronLeft className='h-5 w-5' />
              <span className='text-sm'>返回</span>
            </button>
            <span className='text-sm font-semibold text-gray-800'>{mobileMode === 'view' ? mobileMemo?.title || '备忘详情' : '新建备忘'}</span>
            {mobileMode === 'view' ? (
              <button
                onClick={() => setDeleteConfirmId(mobileMemo.id)}
                className='p-1.5 text-gray-400 active:text-red-500'
              >
                <Trash2 className='h-4 w-4' />
              </button>
            ) : (
              <Button
                size='sm'
                className='border-0 h-8 text-xs'
                style={{
                  backgroundColor: '#bbea3b',
                  color: '#2d4a00',
                }}
                onClick={handleMobileSave}
                disabled={!stripHtml(form.content) || saving}
              >
                {saving ? '…' : '保存'}
              </Button>
            )}
          </div>

          {mobileMode === 'view' && mobileMemo ? (
            <MobileViewInline
              memo={mobileMemo}
              groups={groups}
              tags={tags}
              tasks={tasks}
              groupMap={groupMap}
              tagMap={tagMap}
              onGoToTask={onGoToTask}
              onFieldSave={async (patch) => {
                const now = new Date().toISOString();
                const { data } = await supabase
                  .from('memos')
                  .update({
                    ...patch,
                    updated_at: now,
                  })
                  .eq('id', mobileMemo.id)
                  .select()
                  .single();
                const updated = data || {
                  ...mobileMemo,
                  ...patch,
                };
                setMobileMemo(updated);
                setMemos((prev) => prev.map((m) => (m.id === mobileMemo.id ? updated : m)));
              }}
              onTagCreated={fetchAll}
            />
          ) : (
            <div className='flex-1 overflow-y-auto'>
              <MemoEditForm
                form={form}
                setForm={setForm}
                groups={groups}
                tags={tags}
                tasks={tasks}
                panelMode={mobileMode}
                onCancel={() => {
                  setMobileMode(null);
                  setMobileMemo(null);
                  resetForm();
                }}
                onSave={handleMobileSave}
                saving={saving}
              />
            </div>
          )}
        </div>
      )}

      {/* PC 主体 */}
      <div className='flex-1 overflow-hidden flex flex-col'>
        {/* 顶部栏 */}
        <div className='flex-shrink-0 bg-white border-b border-gray-100 px-4 md:px-6 pt-2.5 pb-2 space-y-2'>
          {/* 第一行：搜索框 + 视图切换 + 新建按钮 */}
          <div className='gap-2 justify-end items-center flex flex-row'>
            {/* 搜索框（紧凑） */}
            <div className='flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5 flex-shrink-0'>
              <button title='按修改时间' onClick={() => setViewMode('time')} className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all ${viewMode === 'time' ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                <Clock className='h-3 w-3' />
                <span>时间</span>
              </button>
              <button title='按分组展示' onClick={() => setViewMode('group')} className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all ${viewMode === 'group' ? 'bg-white text-gray-800 shadow-sm font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
                <Layers className='h-3 w-3' />
                <span>分组</span>
              </button>
            </div>
            {/* 新建按钮 + 搜索框（靠右） */}
            <div className='ml-auto flex items-center gap-1.5'>
              {/* 搜索框 */}
              <div className='relative flex-1 md:flex-initial md:flex-shrink-0'>
                <Search className='absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none' />
                <input
                  type='text'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder='搜索…'
                  className='h-7 pl-6 pr-6 rounded-lg border border-gray-200 bg-gray-50 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#bbea3b] focus:border-[#bbea3b] transition-colors w-full md:w-[160px]'
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className='absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600'>
                    <X className='h-3 w-3' />
                  </button>
                )}
              </div>
              <Button
                className='flex-shrink-0 border-0 h-7 text-xs px-3 hidden md:inline-flex'
                style={{
                  backgroundColor: '#bbea3b',
                  color: '#2d4a00',
                }}
                onClick={openNew}
              >
                <Plus className='h-3.5 w-3.5 mr-1' />
                新建备忘
              </Button>
              <Button
                className='flex-shrink-0 border-0 h-7 text-xs px-3 md:hidden'
                style={{
                  backgroundColor: '#bbea3b',
                  color: '#2d4a00',
                }}
                onClick={openNewMobile}
              >
                <Plus className='h-3.5 w-3.5 mr-1' />
                新建
              </Button>
            </div>
          </div>
          {/* 第二行：快捷分组筛选 */}
          <div className='flex gap-1.5 flex-wrap overflow-x-auto scrollbar-none pb-0.5'>
            <FilterBtn
              active={filterTagId === 'all'}
              onClick={() => {
                setFilterTagId('all');
                setSearchQuery('');
              }}
              label='全部'
              count={memos.length}
            />
            {usedGroups.map((g, __dnd_i) => (
              <FilterBtn
                key={g.id}
                active={filterTagId === String(g.id)}
                onClick={() => {
                  setFilterTagId(String(g.id));
                  setSearchQuery('');
                }}
                label={g.name}
                count={memos.filter((m) => String(m.direction) === String(g.id)).length}
                color={g.color}
              />
            ))}
            <FilterBtn
              active={filterTagId === '__none__'}
              onClick={() => {
                setFilterTagId('__none__');
                setSearchQuery('');
              }}
              label='未分类'
              count={memos.filter((m) => !m.direction).length}
            />
          </div>
        </div>

        {/* 左右分栏 */}
        <div className='flex-1 overflow-hidden flex'>
          {/* 左侧列表 */}
          <div className='w-full md:w-72 lg:w-80 xl:w-96 flex-shrink-0 border-r border-gray-100 bg-white overflow-y-auto'>
            {viewMode === 'group' ? (
              groupedMemos && groupedMemos.length > 0 ? (
                <GroupedMemoList
                  groupedMemos={groupedMemos}
                  activeMemo={activeMemo}
                  groupMap={groupMap}
                  tagMap={tagMap}
                  onSelect={(memo) => {
                    handleSelectMemo(memo);
                    setMobileMemo(memo);
                    setMobileMode('view');
                  }}
                />
              ) : (
                <div className='flex flex-col items-center justify-center h-48 text-center px-4'>
                  <FileText className='h-8 w-8 text-gray-200 mb-2' />
                  <p className='text-xs text-gray-400'>{searchQuery.trim() ? `未找到含「${searchQuery.trim()}」的备忘` : '暂无备忘，点击「新建」开始'}</p>
                  {searchQuery.trim() && (
                    <button onClick={() => setSearchQuery('')} className='mt-2 text-xs text-blue-500 hover:underline'>
                      清除搜索
                    </button>
                  )}
                </div>
              )
            ) : filteredMemos.length === 0 ? (
              <div className='flex flex-col items-center justify-center h-48 text-center px-4'>
                <FileText className='h-8 w-8 text-gray-200 mb-2' />
                <p className='text-xs text-gray-400'>{searchQuery.trim() ? `未找到含「${searchQuery.trim()}」的备忘` : filterTagId === 'all' ? '暂无备忘，点击「新建」开始' : '该分组暂无备忘'}</p>
                {searchQuery.trim() && (
                  <button onClick={() => setSearchQuery('')} className='mt-2 text-xs text-blue-500 hover:underline'>
                    清除搜索
                  </button>
                )}
              </div>
            ) : (
              <div className='divide-y divide-gray-50'>
                {filteredMemos.map((memo, __dnd_i) => (
                  <MemoCard
                    key={memo.id}
                    memo={memo}
                    isActive={activeMemo?.id === memo.id}
                    groupMap={groupMap}
                    tagMap={tagMap}
                    showGroup
                    onSelect={() => {
                      handleSelectMemo(memo);
                      setMobileMemo(memo);
                      setMobileMode('view');
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 右侧内容面板（PC） */}
          <div className='hidden md:flex flex-1 flex-col min-w-0 bg-white'>
            {!panelMode && (
              <div className='flex flex-col items-center justify-center h-full text-center gap-3 select-none'>
                <FileText className='h-12 w-12 text-gray-200' />
                <p className='text-sm text-gray-400'>选择左侧备忘查看，或点击「新建」</p>
              </div>
            )}
            {panelMode === 'new' && (
              <MemoEditForm
                form={form}
                setForm={setForm}
                groups={groups}
                tags={tags}
                tasks={tasks}
                panelMode={panelMode}
                onCancel={() => {
                  setPanelMode(activeMemo ? 'view' : null);
                  resetForm();
                }}
                onSave={handleSave}
                saving={saving}
              />
            )}
            {panelMode === 'view' && activeMemo && <MemoViewPanel memo={activeMemo} groupMap={groupMap} tagMap={tagMap} groups={groups} tags={tags} tasks={tasks} onFieldSave={handleFieldSave} onDelete={() => setDeleteConfirmId(activeMemo.id)} onGoToTask={onGoToTask} onTagCreated={fetchAll} />}

      {/* 删除确认弹窗 */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
        <AlertDialogContent className='max-w-sm w-[calc(100%-2rem)] pb-safe'>
          <AlertDialogHeader>
            <AlertDialogTitle className='flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5 text-amber-500' />
              确认删除备忘？
            </AlertDialogTitle>
            <AlertDialogDescription>
              删除后该备忘将从列表中消失，但数据仍保留在数据库中，随时可以找回。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className='bg-red-500 hover:bg-red-600 text-white border-0'
              onClick={async () => {
                await handleDelete(deleteConfirmId);
                // 若是移动端删除，同步关闭移动端面板
                if (mobileMemo?.id === deleteConfirmId) {
                  setMobileMode(null);
                  setMobileMemo(null);
                }
              }}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
          </div>
        </div>
      </div>
    </div>
  );
};
export default MemosPage;

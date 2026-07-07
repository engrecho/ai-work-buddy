import { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, MessageSquare, TrendingUp, Send, CheckCircle2, Trash2, Flag, ArrowLeft, Settings, X, ChevronDown, ChevronRight, Calendar, User, Users, Link2, Tag, ExternalLink, Filter, FolderOpen, AlertCircle, GitBranch, UserPlus, Megaphone, LayoutGrid, List, FileText, NotebookPen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { applyStoredTaskGroups, applyStoredTaskExtra, genId, getStoredTaskGroups, getStoredTaskGroupAssignments, saveStoredTaskGroups, setStoredTaskGroupAssignment, setStoredTaskExtra } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import RichEditor from '@/components/RichEditor';
import TaskConfigPage from './TaskConfigPage';
import KanbanView from '@/components/KanbanView';
import NoteView from '@/components/NoteView';

const STATUS = {
  todo: {
    label: '待办',
    dot: 'bg-gray-300',
    bg: 'bg-gray-100 text-gray-600',
  },
  in_progress: {
    label: '进行中',
    dot: 'bg-blue-400',
    bg: 'bg-blue-100 text-blue-600',
  },
  done: {
    label: '已完成',
    dot: 'bg-green-400',
    bg: 'bg-green-100 text-green-600',
  },
};

const PRIORITY = {
  low: {
    label: '低',
    color: 'text-gray-400',
    bg: 'bg-gray-100 text-gray-500',
  },
  medium: {
    label: '中',
    color: 'text-amber-500',
    bg: 'bg-amber-100 text-amber-600',
  },
  high: {
    label: '高',
    color: 'text-red-500',
    bg: 'bg-red-100 text-red-600',
  },
};

const DEFAULT_GROUP_ID = 'ungrouped';

const IMPORTANCE = {
  critical: {
    label: '非常重要',
    color: 'text-red-600',
    bg: 'bg-red-100 text-red-600',
    dot: 'bg-red-500',
  },
  important: {
    label: '重要',
    color: 'text-amber-600',
    bg: 'bg-amber-100 text-amber-600',
    dot: 'bg-amber-400',
  },
  normal: {
    label: '一般',
    color: 'text-gray-400',
    bg: 'bg-gray-100 text-gray-500',
    dot: 'bg-gray-300',
  },
};

const URGENCY = {
  urgent: {
    label: '紧急',
    color: 'text-red-500',
    bg: 'bg-red-100 text-red-600',
    dot: 'bg-red-400',
  },
  normal: {
    label: '一般',
    color: 'text-gray-400',
    bg: 'bg-gray-100 text-gray-500',
    dot: 'bg-gray-300',
  },
};

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0'); // 检查是否有时间部分（非 00:00:00）
  const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0 || d.getSeconds() !== 0;
  if (hasTime) {
    const hh = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }
  return `${yyyy}-${mm}-${dd}`;
}

function isOverdue(value) {
  if (!value) return false;
  return new Date(value) < new Date() && new Date(value).toDateString() !== new Date().toDateString();
}

// 获取日期的智能标签：过期/今天/明天/后天/普通日期
function getDateLabel(value) {
  if (!value) return '';
  const d = new Date(value);
  const today = new Date();
  // 清除时间部分，只比较日期
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((dDay - todayDay) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return fmtDate(value); // 过期时显示原始日期
  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '明天';
  if (diffDays === 2) return '后天';
  return fmtDate(value);
}

// 获取日期对应的样式 class
function getDateStyle(value) {
  if (!value) return 'text-gray-500';
  const d = new Date(value);
  const today = new Date();
  const dDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((dDay - todayDay) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'text-red-500 font-medium'; // 过期：红色
  if (diffDays === 0) return 'text-orange-500 font-medium'; // 今天：橙色
  if (diffDays === 1) return 'text-yellow-600 font-medium'; // 明天：黄色
  if (diffDays === 2) return 'text-blue-500 font-medium'; // 后天：蓝色
  return 'text-gray-500';
}

function groupPillStyle(color) {
  return {
    backgroundColor: `${color}22`,
    color,
    border: `1px solid ${color}44`,
  };
} // ─── MemberPicker（支持多选）────────────────────────────────────

const MemberPicker = ({ label, value, onChange, members, onAddMember, multi = false }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [newMis, setNewMis] = useState('');
  const [newName, setNewName] = useState('');
  const containerRef = useRef(null);
  const filtered = members.filter((m) => m.name.includes(search) || m.mis.includes(search)); // 多选模式：value 是 id 数组；单选模式：value 是单个 id 或 null
  const selectedIds = multi ? (Array.isArray(value) ? value : []) : value ? [value] : [];
  const selectedMembers = members.filter((m) => selectedIds.includes(m.id)); // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  const handleAdd = async () => {
    if (!newMis.trim() || !newName.trim()) return;
    const id = genId();
    await supabase.from('task_members').insert([
      {
        id,
        mis: newMis.trim(),
        name: newName.trim(),
      },
    ]);
    onAddMember && onAddMember();
    if (multi) onChange([...selectedIds, id]);
    else {
      onChange(id);
      setOpen(false);
    }
    setNewMis('');
    setNewName('');
  };
  const toggleMember = (id) => {
    if (multi) {
      onChange(selectedIds.includes(id) ? selectedIds.filter((v) => v !== id) : [...selectedIds, id]);
    } else {
      onChange(id);
      setOpen(false);
      setSearch('');
    }
  };
  const removeMember = (id, e) => {
    e.stopPropagation();
    if (multi) onChange(selectedIds.filter((v) => v !== id));
    else onChange(null);
  };
  return (
    <div className='relative' ref={containerRef}>
      <button type='button' onClick={() => setOpen((v) => !v)} className='w-full min-h-[40px] flex flex-wrap items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:border-gray-300 transition-colors bg-white text-left'>
        {selectedMembers.length > 0 ? (
          selectedMembers.map((m, __dnd_i) => (
            <span key={m.id} className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700'>
              <span
                className='w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-medium text-white flex-shrink-0'
                style={{
                  backgroundColor: '#5a7a00',
                }}
              >
                {m.name.slice(0, 1)}
              </span>
              {m.name}
              <X className='h-3 w-3 text-gray-400 hover:text-red-400' onClick={(e) => removeMember(m.id, e)} />
            </span>
          ))
        ) : (
          <span className='text-gray-400 flex-1 text-left text-sm'>{label || '选择人员'}</span>
        )}
        <ChevronDown className='h-4 w-4 text-gray-400 ml-auto flex-shrink-0' />
      </button>
      {open && (
        <div className='absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto'>
          <div className='p-2 border-b border-gray-100'>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder='搜索姓名或MIS' className='h-7 text-xs' />
          </div>
          {filtered.map((m, __dnd_i) => (
            <button key={m.id} type='button' onClick={() => toggleMember(m.id)} className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm text-left ${selectedIds.includes(m.id) ? 'bg-[#f5fce8]' : ''}`}>
              <div
                className='w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0'
                style={{
                  backgroundColor: '#5a7a00',
                }}
              >
                {m.name.slice(0, 1)}
              </div>
              <span className='font-medium flex-1'>{m.name}</span>
              <span className='text-xs text-gray-400'>{m.mis}</span>
              {selectedIds.includes(m.id) && <span className='text-[10px] text-[#5a7a00] font-medium'>✓</span>}
            </button>
          ))}
          <div className='p-2 border-t border-gray-100 space-y-1'>
            <p className='text-xs text-gray-400 px-1'>快速添加新人员</p>
            <div className='flex gap-1'>
              <Input value={newMis} onChange={(e) => setNewMis(e.target.value)} placeholder='MIS' className='h-7 text-xs flex-1' />
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder='姓名' className='h-7 text-xs flex-1' />
              <button
                type='button'
                onClick={handleAdd}
                className='h-7 px-2 rounded text-xs font-medium border-0 text-[#2d4a00]'
                style={{
                  backgroundColor: '#bbea3b',
                }}
              >
                添加
              </button>
            </div>
          </div>
          {multi && (
            <div className='px-3 py-2 border-t border-gray-100'>
              <button type='button' onClick={() => setOpen(false)} className='text-xs text-gray-400 hover:text-gray-600'>
                完成
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}; // ─── TaskPicker（选择依赖任务，支持多选）────────────────────────

const TaskPicker = ({ label, value = [], onChange, tasks, currentTaskId, excludeIds = [] }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  // 过滤掉当前任务自身、子任务、以及互斥排除的任务（如已选为前置则不能选为后置）
  const availableTasks = tasks.filter(
    (t) => t.id !== currentTaskId && !t.parent_id && !excludeIds.includes(t.id)
  );
  const filtered = availableTasks.filter((t) =>
    t.title.toLowerCase().includes(search.toLowerCase())
  );
  const selectedTasks = tasks.filter((t) => value.includes(t.id));

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggle = (id) => {
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  };
  const remove = (id, e) => {
    e.stopPropagation();
    onChange(value.filter((v) => v !== id));
  };

  return (
    <div className='relative' ref={containerRef}>
      <button
        type='button'
        onClick={() => setOpen((v) => !v)}
        className='w-full min-h-[40px] flex flex-wrap items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm hover:border-gray-300 transition-colors bg-white text-left'
      >
        {selectedTasks.length > 0 ? (
          selectedTasks.map((t) => (
            <span key={t.id} className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-100'>
              <GitBranch className='h-3 w-3 flex-shrink-0' />
              <span className='max-w-[120px] truncate'>{t.title}</span>
              <X className='h-3 w-3 text-blue-400 hover:text-red-400 flex-shrink-0' onClick={(e) => remove(t.id, e)} />
            </span>
          ))
        ) : (
          <span className='text-gray-400 flex-1 text-left text-sm'>{label || '选择任务'}</span>
        )}
        <ChevronDown className='h-4 w-4 text-gray-400 ml-auto flex-shrink-0' />
      </button>
      {open && (
        <div className='absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto'>
          <div className='p-2 border-b border-gray-100'>
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder='搜索任务标题' className='h-7 text-xs' autoFocus />
          </div>
          {filtered.length === 0 && (
            <p className='text-xs text-gray-400 px-3 py-3 text-center'>暂无可选任务</p>
          )}
          {filtered.map((t) => (
            <button
              key={t.id}
              type='button'
              onClick={() => toggle(t.id)}
              className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 text-sm text-left ${value.includes(t.id) ? 'bg-blue-50' : ''}`}
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS[t.status]?.dot || 'bg-gray-300'}`} />
              <span className='flex-1 truncate text-xs'>{t.title}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${STATUS[t.status]?.bg || ''}`}>{STATUS[t.status]?.label}</span>
              {value.includes(t.id) && <span className='text-[10px] text-blue-500 font-medium flex-shrink-0'>✓</span>}
            </button>
          ))}
          <div className='px-3 py-2 border-t border-gray-100'>
            <button type='button' onClick={() => setOpen(false)} className='text-xs text-gray-400 hover:text-gray-600'>
              完成
            </button>
          </div>
        </div>
      )}
    </div>
  );
}; // ─── TagPicker ───────────────────────────────────────────────────

const TagPicker = ({ value = [], onChange, tags, onGoToConfig }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);
  const selectedTags = tags.filter((t) => value.includes(t.id));
  const toggle = (id) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]); // 点击外部自动收起
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);
  return (
    <div className='relative' ref={containerRef}>
      <button type='button' onClick={() => setOpen((v) => !v)} className='w-full min-h-[32px] flex flex-wrap items-center gap-1 px-2.5 border border-gray-200 rounded-lg text-xs hover:border-gray-300 transition-colors bg-white text-left py-1'>
        {selectedTags.length > 0 ? (
          selectedTags.map((t, __dnd_i) => (
            <span
              key={t.id}
              className='px-2 py-0.5 rounded-full text-xs font-medium'
              style={{
                backgroundColor: `${t.color}22`,
                color: t.color,
                border: `1px solid ${t.color}44`,
              }}
            >
              {t.name}
            </span>
          ))
        ) : (
          <span className='text-[12px]'>选择标签</span>
        )}
        <ChevronDown className={`h-4 w-4 text-gray-400 ml-auto flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className='absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2'>
          <div className='flex flex-wrap gap-1.5 mb-2'>
            {tags.length === 0 && <p className='text-xs text-gray-400 px-1 py-1 w-full'>暂无标签</p>}
            {tags.map((t, __dnd_i) => (
              <button
                key={t.id}
                type='button'
                onClick={() => toggle(t.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${value.includes(t.id) ? 'ring-2 ring-offset-1' : 'opacity-60 hover:opacity-100'}`}
                style={{
                  backgroundColor: `${t.color}22`,
                  color: t.color,
                  border: `1px solid ${t.color}44`,
                  fontSize: '0.75rem',
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
          <div className='flex items-center justify-between border-t border-gray-100 pt-1.5'>
            {onGoToConfig ? (
              <button
                type='button'
                onClick={() => {
                  setOpen(false);
                  onGoToConfig();
                }}
                className='text-xs text-[#5a7a00] hover:underline flex items-center gap-1'
              >
                <Settings className='h-3 w-3' />
                管理标签
              </button>
            ) : (
              <span />
            )}
            <button type='button' onClick={() => setOpen(false)} className='text-xs text-gray-400 hover:text-gray-600 px-2 py-0.5 rounded hover:bg-gray-100'>
              完成
            </button>
          </div>
        </div>
      )}
    </div>
  );
}; // ─── GroupSelect ─────────────────────────────────────────────────

const GroupSelect = ({ value, onChange, groups }) => {
  const selected = groups.find(g => g.id?.toString() === value?.toString());
  return (
    <Select value={value?.toString() || DEFAULT_GROUP_ID} onValueChange={(v) => onChange(v === DEFAULT_GROUP_ID ? null : Number(v))}>
      <SelectTrigger className='h-8 text-xs'>
        <div className='flex items-center gap-1.5 min-w-0'>
          {selected ? (
            <>
              <span className='w-2 h-2 rounded-full flex-shrink-0' style={{ backgroundColor: selected.color }} />
              <span className='truncate font-medium' style={{ color: selected.color }}>{selected.name}</span>
            </>
          ) : (
            <span className='text-gray-400'>未分组</span>
          )}
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={DEFAULT_GROUP_ID}>未分组</SelectItem>
        {groups.map((g) => (
          <SelectItem key={g.id} value={g.id.toString()}>
            <div className='flex items-center gap-1.5'>
              <span className='w-2 h-2 rounded-full flex-shrink-0' style={{ backgroundColor: g.color }} />
              <span style={{ color: g.color }}>{g.name}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}; // ─── URL 标题解析工具 ──────────────────────────────────────────

/**
 * 通过隐藏 iframe 加载目标 URL，利用浏览器当前登录态（Cookie）获取页面标题
 * - 同域：直接读 iframe.contentDocument.title
 * - 跨域：等 load 事件后尝试读（会抛 SecurityError，catch 掉）
 * - 超时 8s 自动清理
 */
function fetchTitleViaIframe(url, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (title) => {
      if (settled) return;
      settled = true;
      try { document.body.removeChild(iframe); } catch { /* ignore */ }
      resolve(title || null);
    };

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;width:1px;height:1px;top:-9999px;left:-9999px;opacity:0;pointer-events:none;border:none;';
    iframe.sandbox = 'allow-scripts allow-same-origin allow-forms';
    iframe.referrerPolicy = 'no-referrer';

    const timer = setTimeout(() => done(null), timeoutMs);

    iframe.onload = () => {
      clearTimeout(timer);
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        const t = doc?.title?.trim();
        if (t && !t.includes('登录') && !t.includes('Login') && !t.includes('login')) {
          done(t.slice(0, 200));
        } else {
          const h1 = doc?.querySelector('h1')?.textContent?.trim();
          done(h1?.slice(0, 200) || null);
        }
      } catch {
        done(null);
      }
    };

    iframe.onerror = () => { clearTimeout(timer); done(null); };
    iframe.src = url;
    document.body.appendChild(iframe);
  });
}

// 解析 URL 标题（通过 iframe 获取）
async function parseUrlTitle(url) {
  if (!url || !url.startsWith('http')) return null;
  const cleanUrl = url.trim();
  try { new URL(cleanUrl); } catch { return null; }

  try {
    const t = await fetchTitleViaIframe(cleanUrl, 8000);
    if (t) return t;
  } catch { /* ignore */ }

  return null;
} // ─── 智能解析粘贴内容，提取 URL 和标题 ──────────────────────────

function parseInputText(text) {
  const t = text.trim(); // 1. Markdown 格式: [标题](url)
  const mdMatch = t.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (mdMatch)
    return {
      title: mdMatch[1].trim(),
      url: mdMatch[2].trim(),
    }; // 2. HTML 格式: <a href="url">标题</a>
  const htmlMatch = t.match(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/i);
  if (htmlMatch)
    return {
      url: htmlMatch[1].trim(),
      title: htmlMatch[2].trim(),
    }; // 3. 包含 http:// 或 https://
  const httpIdx = t.search(/https?:\/\//i);
  if (httpIdx > 0) {
    // URL 前面的内容去掉末尾分隔符作为标题
    const rawTitle = t
      .slice(0, httpIdx)
      .replace(/[\s,，:：。.\-–—]+$/, '')
      .trim();
    const url = t.slice(httpIdx).trim();
    return {
      title: rawTitle || '',
      url,
    };
  }
  if (httpIdx === 0)
    return {
      url: t,
      title: '',
    };
  return {
    url: t,
    title: '',
  };
} // ─── DocList ──────────────────────────────────────────────────────
// 完全受控组件：value/onChange 管理列表，editingIdx/editItem/onEditChange/onEditSave/onEditCancel 管理行内编辑

const DocList = ({
  value = [],
  onChange,
  editingIdx = null,
  editItem = {
    url: '',
    title: '',
  },
  editFetching = false,
  onEditStart,
  onEditChange,
  onEditUrlBlur,
  onEditSave,
  onEditCancel,
  onCancel,
  onAutoSave,
}) => {
  const [newUrl, setNewUrl] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [fetching, setFetching] = useState(false); // 失焦时智能解析 + 自动获取标题
  const handleUrlBlur = async () => {
    const raw = newUrl.trim();
    if (!raw) return;
    const parsed = parseInputText(raw);
    let url = parsed.url;
    // titleFromFormat：仅从 URL 文本格式本身提取（如 [标题](url) 格式）
    const titleFromFormat = parsed.title || '';
    if (url !== raw) {
      setNewUrl(url);
      if (titleFromFormat && !newTitle.trim()) setNewTitle(titleFromFormat);
    }
    // 只要是 http 链接且格式中没有嵌入标题，就去解析（覆盖已有 newTitle）
    if (url && url.startsWith('http') && !titleFromFormat) {
      setFetching(true);
      const fetched = await parseUrlTitle(url);
      if (fetched) setNewTitle(fetched);
      setFetching(false);
    }
  };
  const add = async () => {
    const raw = newUrl.trim();
    if (!raw) return;
    const parsed = parseInputText(raw);
    const url = parsed.url || raw;
    // titleFromFormat: 仅从 URL 文本格式本身提取
    const titleFromFormat = parsed.title || '';
    let title = titleFromFormat || newTitle.trim();
    // 只要是 http 链接且格式中没有嵌入标题，就去解析（包括用户直接点确定跳过 blur 的情况）
    if (url.startsWith('http') && !titleFromFormat && !fetching) {
      setFetching(true);
      const fetched = await parseUrlTitle(url);
      if (fetched) title = fetched;
      setFetching(false);
    }
    const next = [...value, { url, title: title || url }];
    onChange(next);
    setNewUrl('');
    setNewTitle('');
    onAutoSave?.(next);
  };
  const remove = (i) => {
    if (editingIdx === i) onEditCancel?.();
    const next = value.filter((_, idx) => idx !== i);
    onChange(next);
    onAutoSave?.(next);
  };
  return (
    <div className='space-y-2'>
      {value.map((doc, i) =>
        editingIdx === i ? ( // 行内编辑模式（受控）
          <div key={i} className='space-y-1.5 p-2 bg-blue-50 rounded-lg border border-blue-100'>
            <Input
              value={editItem.url}
              onChange={(e) =>
                onEditChange?.({
                  ...editItem,
                  url: e.target.value,
                })
              }
              onBlur={() => onEditUrlBlur?.()}
              placeholder='链接地址'
              className='h-7 text-xs'
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onEditUrlBlur?.().then(() => onEditSave?.());
                }
                if (e.key === 'Escape') onEditCancel?.();
              }}
            />
            <div className='flex gap-1.5'>
              <Input
                value={editFetching ? '' : editItem.title}
                onChange={(e) =>
                  onEditChange?.({
                    ...editItem,
                    title: e.target.value,
                  })
                }
                placeholder={editFetching ? '获取标题中…' : '文档名称（可选）'}
                className='h-7 text-xs flex-1'
                disabled={editFetching}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    await onEditUrlBlur?.();
                    onEditSave?.();
                  }
                }}
              />
              <button
                type='button'
                onClick={async () => {
                  await onEditUrlBlur?.();
                  onEditSave?.();
                }}
                className='text-xs px-2 py-1 rounded text-[#2d4a00] flex-shrink-0'
                style={{
                  backgroundColor: '#bbea3b',
                }}
              >
                确定
              </button>
              <button type='button' onClick={() => onEditCancel?.()} className='text-xs px-2 py-1 rounded border border-gray-200 text-gray-500 flex-shrink-0'>
                取消
              </button>
            </div>
          </div> // 展示模式
        ) : (
          <div key={i} className='flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg group'>
            <Link2 className='h-3.5 w-3.5 text-gray-400 flex-shrink-0' />
            <a href={doc.url} target='_blank' rel='noopener noreferrer' className='flex-1 text-xs text-blue-500 hover:underline truncate'>
              {doc.title && doc.title !== doc.url ? doc.title : doc.url}
            </a>
            <button type='button' onClick={() => onEditStart?.(i)} className='opacity-0 group-hover:opacity-100 text-gray-300 hover:text-blue-400 transition-all flex-shrink-0'>
              <svg xmlns='http://www.w3.org/2000/svg' className='h-3.5 w-3.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                <path d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' />
                <path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' />
              </svg>
            </button>
            <button type='button' onClick={() => remove(i)} className='opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-all flex-shrink-0'>
              <X className='h-3.5 w-3.5' />
            </button>
          </div>
        ),
      )}
      <div className='flex gap-2'>
        <div className='flex-1 relative'>
          <Input
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onBlur={handleUrlBlur}
            placeholder='粘贴链接或「标题 URL」'
            className='h-8 text-xs w-full'
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleUrlBlur().then(add);
              }
            }}
          />
        </div>
        <div className='flex-1 relative'>
          <Input value={fetching ? '' : newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder={fetching ? '获取标题中…' : '文档名称（可选）'} className='h-8 text-xs w-full' disabled={fetching} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} />
        </div>
        <Button
          type='button'
          size='sm'
          className='h-8 px-3 border-0 text-xs flex-shrink-0'
          style={{
            backgroundColor: '#bbea3b',
            color: '#2d4a00',
          }}
          onClick={add}
        >
          确定
        </Button>
        <Button
          type='button'
          size='sm'
          variant='outline'
          className='h-8 px-3 text-xs flex-shrink-0 border-gray-200 text-gray-500 hover:text-gray-700'
          onClick={() => { setNewUrl(''); setNewTitle(''); onCancel?.(); }}
        >
          取消
        </Button>
      </div>
    </div>
  );
}; // ─── TaskForm ─────────────────────────────────────────────────────

// 自动匹配分组：基于关键词 + 现有任务学习
const autoMatchGroup = (title, groups, tasks) => {
  if (!title || !title.trim() || !groups || groups.length === 0) return null;
  const lowerTitle = title.toLowerCase();

  // 1. 关键词匹配：遍历所有分组的 keywords，找到最多关键词命中的分组
  const keywordScores = groups.map((g) => {
    const kws = (g.keywords || []).filter(Boolean);
    if (kws.length === 0) return { group: g, score: 0 };
    const matched = kws.filter((kw) => lowerTitle.includes(kw.toLowerCase()));
    return { group: g, score: matched.length };
  });
  const bestKeyword = keywordScores.reduce((a, b) => (b.score > a.score ? b : a), { score: 0 });
  if (bestKeyword.score > 0) return bestKeyword.group.id;

  // 2. 现有任务学习：找标题相似的任务，统计其所在分组
  if (!tasks || tasks.length === 0) return null;
  const titleWords = lowerTitle.split(/[\s\-_\/\u4e00-\u9fa5]+/).filter((w) => w.length >= 2);
  if (titleWords.length === 0) return null;

  const groupCount = {};
  tasks.forEach((t) => {
    if (!t.group_id || !t.title) return;
    const tLower = t.title.toLowerCase();
    const hasMatch = titleWords.some((w) => tLower.includes(w));
    if (hasMatch) {
      groupCount[t.group_id] = (groupCount[t.group_id] || 0) + 1;
    }
  });

  const entries = Object.entries(groupCount);
  if (entries.length === 0) return null;
  const [topGroupId] = entries.sort((a, b) => b[1] - a[1])[0];
  return topGroupId;
};

const TaskForm = ({ task, tasks, members, tags, groups, onSave, onCancel, defaultParentId = null, onMemberAdded }) => {
const isNew = !task;
const [form, setForm] = useState({
  title: task?.title || '',
  description: task?.description || '',
  status: task?.status || 'todo',
  priority: task?.priority || 'medium',
  importance: task?.importance || 'normal',
  urgency: task?.urgency || 'normal',
  parent_id: task?.parent_id ?? defaultParentId,
  group_id: task?.group_id ?? null,
  due_date: task?.due_date ? task.due_date.slice(0, 10) : '',
  plan_date: task?.plan_date ? task.plan_date.slice(0, 10) : '',
  owner_ids: task?.owner_ids || (task?.owner_id ? [task.owner_id] : []),
  supporter_ids: task?.supporter_ids || (task?.supporter_id ? [task.supporter_id] : []),
  related_member_ids: task?.related_member_ids || [],
  predecessor_ids: task?.predecessor_ids || [],
  successor_ids: task?.successor_ids || [],
  key_docs: task?.key_docs || [],
  tag_ids: task?.tag_ids || [],
  need_report: task?.need_report ?? false,
  create_memo: false,
});
  // 自动匹配分组提示（仅新建时生效）
const [groupAutoMatched, setGroupAutoMatched] = useState(false);

  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    const updates = { title: newTitle };
    // 仅新建任务且用户未手动选过分组时，自动匹配
    if (isNew && !groupAutoMatched) {
      const matched = autoMatchGroup(newTitle, groups, tasks);
      if (matched) {
        updates.group_id = matched;
      }
    }
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const parentOptions = tasks.filter((t) => !t.parent_id && t.id !== task?.id);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      className='flex flex-col flex-1 min-h-0'
    >
      {/* 滚动内容区(除底部按钮外) */}
      <div className='flex-1 overflow-y-auto space-y-3 px-4 md:px-6 py-4 md:py-5 min-h-0'>
      {/* ── 标题 + 分组 + 标签：紧凑区块 ─────────────────────────── */}
      <div>
        <label className='text-xs text-gray-400 mb-0.5 block'>标题 *</label>
        <Input
          value={form.title}
          onChange={handleTitleChange}
          placeholder='任务标题'
          required
          autoFocus
          className='h-8 text-sm'
        />
      </div>
      <div className='grid grid-cols-2 gap-2'>
        <div>
          <label className='text-xs text-gray-400 mb-0.5 block flex items-center gap-1'>
            分组
            {isNew && form.group_id && !groupAutoMatched && (
              <span className='text-[10px] text-[#5a7a00] bg-[#f0f9d4] px-1.5 py-0.5 rounded-full'>自动匹配</span>
            )}
          </label>
          <GroupSelect
            value={form.group_id}
            onChange={(v) => {
              setGroupAutoMatched(true);
              setForm({ ...form, group_id: v });
            }}
            groups={groups}
          />
        </div>
        <div>
          <label className='text-xs text-gray-400 mb-0.5 block'>上级任务</label>
          <Select
            value={form.parent_id?.toString() || 'none'}
            onValueChange={(v) =>
              setForm({
                ...form,
                parent_id: v === 'none' ? null : parseInt(v, 10),
              })
            }
          >
            <SelectTrigger className='h-8 text-xs'>
              <SelectValue placeholder='无（顶级）' />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='none'>无（顶级任务）</SelectItem>
              {parentOptions.map((t) => (
                <SelectItem key={t.id} value={t.id.toString()}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className='grid grid-cols-2 gap-2'>
        <div>
          <label className='text-xs text-gray-400 mb-0.5 block'>状态</label>
          <Select
            value={form.status}
            onValueChange={(v) =>
              setForm({
                ...form,
                status: v,
              })
            }
          >
            <SelectTrigger className='h-8 text-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='todo'>待办</SelectItem>
              <SelectItem value='in_progress'>进行中</SelectItem>
              <SelectItem value='done'>已完成</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className='text-xs text-gray-400 mb-0.5 block'>优先级</label>
          <Select
            value={form.priority}
            onValueChange={(v) =>
              setForm({
                ...form,
                priority: v,
              })
            }
          >
            <SelectTrigger className='h-8 text-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='low'>低</SelectItem>
              <SelectItem value='medium'>中</SelectItem>
              <SelectItem value='high'>高</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className='grid grid-cols-2 gap-2'>
        <div>
          <label className='text-xs text-gray-400 mb-0.5 block'>截止日期</label>
          <Input
            type='date'
            value={form.due_date}
            onChange={(e) =>
              setForm({
                ...form,
                due_date: e.target.value,
              })
            }
            className='h-8 text-xs'
          />
        </div>
        <div>
          <label className='text-xs text-gray-400 mb-0.5 block'>计划日期</label>
          <Input
            type='date'
            value={form.plan_date}
            onChange={(e) =>
              setForm({
                ...form,
                plan_date: e.target.value,
              })
            }
            className='h-8 text-xs'
          />
        </div>
      </div>
      <div className='grid grid-cols-2 gap-2'>
        <div>
          <label className='text-xs text-gray-400 mb-0.5 block'>重要性</label>
          <Select
            value={form.importance}
            onValueChange={(v) =>
              setForm({
                ...form,
                importance: v,
              })
            }
          >
            <SelectTrigger className='h-8 text-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='critical'>非常重要</SelectItem>
              <SelectItem value='important'>重要</SelectItem>
              <SelectItem value='normal'>一般</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className='text-xs text-gray-400 mb-0.5 block'>紧急度</label>
          <Select
            value={form.urgency}
            onValueChange={(v) =>
              setForm({
                ...form,
                urgency: v,
              })
            }
          >
            <SelectTrigger className='h-8 text-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='urgent'>紧急</SelectItem>
              <SelectItem value='normal'>一般</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className='grid grid-cols-2 gap-2'>
        <div>
          <label className='text-xs text-gray-400 mb-0.5 block'>主R</label>
          <MemberPicker
            label='选择主R'
            value={form.owner_ids}
            onChange={(v) =>
              setForm({
                ...form,
                owner_ids: v,
              })
            }
            members={members}
            onAddMember={onMemberAdded}
            multi
          />
        </div>
        <div>
          <label className='text-xs text-gray-400 mb-0.5 block'>主S</label>
          <MemberPicker
            label='选择主S'
            value={form.supporter_ids}
            onChange={(v) =>
              setForm({
                ...form,
                supporter_ids: v,
              })
            }
            members={members}
            onAddMember={onMemberAdded}
            multi
          />
        </div>
      </div>
      <div>
        <label className='text-xs text-gray-400 mb-0.5 block'>关联人</label>
        <MemberPicker
          label='选择关联人（非主R/主S）'
          value={form.related_member_ids}
          onChange={(v) =>
            setForm({
              ...form,
              related_member_ids: v,
            })
          }
          members={members}
          onAddMember={onMemberAdded}
          multi
        />
      </div>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-2'>
        <div>
          <label className='text-xs text-gray-400 mb-0.5 block flex items-center gap-1'>
            <GitBranch className='h-3 w-3' />前置任务
          </label>
          <TaskPicker
            label='选择前置任务'
            value={form.predecessor_ids}
            onChange={(v) => setForm({ ...form, predecessor_ids: v })}
            tasks={tasks}
            currentTaskId={task?.id}
            excludeIds={form.successor_ids || []}
          />
        </div>
        <div>
          <label className='text-xs text-gray-400 mb-0.5 block flex items-center gap-1'>
            <GitBranch className='h-3 w-3' />后置任务
          </label>
          <TaskPicker
            label='选择后置任务'
            value={form.successor_ids}
            onChange={(v) => setForm({ ...form, successor_ids: v })}
            tasks={tasks}
            currentTaskId={task?.id}
            excludeIds={form.predecessor_ids || []}
          />
        </div>
      </div>
      <div>
        <label className='text-xs text-gray-400 mb-0.5 block'>标签</label>
        <TagPicker
          value={form.tag_ids}
          onChange={(v) =>
            setForm({
              ...form,
              tag_ids: v,
            })
          }
          tags={tags}
        />
      </div>
      <div>
        <label className='text-xs text-gray-400 mb-0.5 block'>关键文档</label>
        <DocList
          value={form.key_docs}
          onChange={(v) =>
            setForm({
              ...form,
              key_docs: v,
            })
          }
        />
      </div>
      <div>
        <label className='text-xs text-gray-500 mb-1 block'>是否需要汇报</label>
        <Select
          value={form.need_report ? 'yes' : 'no'}
          onValueChange={(v) => setForm({ ...form, need_report: v === 'yes' })}
        >
          <SelectTrigger className='h-10'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='no'>否</SelectItem>
            <SelectItem value='yes'>是</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {/* 同步创建备忘（仅新建任务时展示） */}
      {isNew && (
        <div
          className={`flex items-center gap-3 px-3 py-3 rounded-xl border-2 cursor-pointer select-none transition-all ${
            form.create_memo
              ? 'border-[#bbea3b] bg-[#f5fce8]'
              : 'border-gray-200 bg-gray-50 hover:border-gray-300'
          }`}
          onClick={() => setForm(p => ({ ...p, create_memo: !p.create_memo }))}
        >
          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
            form.create_memo ? 'bg-[#bbea3b] border-[#a5d400]' : 'border-gray-300 bg-white'
          }`}>
            {form.create_memo && <CheckCircle2 className='h-3.5 w-3.5 text-[#2d4a00]' />}
          </div>
          <div className='flex-1 min-w-0'>
            <p className='text-sm font-medium text-gray-800'>同步创建备忘</p>
            <p className='text-xs text-gray-400 mt-0.5'>自动将任务标题和描述同步到备忘，并建立双向关联</p>
          </div>
          <FileText className={`h-5 w-5 flex-shrink-0 transition-colors ${form.create_memo ? 'text-[#5a8c00]' : 'text-gray-300'}`} />
        </div>
      )}
      <div>
        <label className='text-xs text-gray-500 mb-1 block'>描述</label>
        <RichEditor
          value={form.description}
          onChange={(v) =>
            setForm({
              ...form,
              description: v,
            })
          }
          placeholder='任务描述...'
        />
      </div>
      </div>
      {/* 底部固定操作栏(永远在底部,不被 nav 遮挡) */}
      <div className='flex-shrink-0 flex gap-2 px-4 md:px-6 py-3 border-t border-gray-100 bg-white pb-safe'>
        <Button type='button' variant='outline' onClick={onCancel} className='flex-1 h-10'>
          取消
        </Button>
        <Button
          type='submit'
          className='flex-1 h-10'
          style={{
            backgroundColor: '#bbea3b',
            color: '#2d4a00',
          }}
        >
          {task ? '保存' : '创建'}
        </Button>
      </div>
    </form>
  );
}; // ─── 评论类型配置 ─────────────────────────────────────────────────

const commentTypeConfig = {
  comment: {
    label: '评论',
    bg: 'bg-gray-100 text-gray-600',
  },
  progress: {
    label: '进展',
    bg: 'bg-blue-100 text-blue-600',
  },
  issue: {
    label: '问题',
    bg: 'bg-red-100 text-red-600',
  },
};

// ─── SyncMemoName — 只有一个关联备忘时，展示其标题 ──────────────────
const SyncMemoName = ({ memoId }) => {
  const [title, setTitle] = useState('');
  useEffect(() => {
    if (!memoId) return;
    supabase.from('memos').select('title').eq('id', memoId).single()
      .then(({ data }) => setTitle(data?.title || '该备忘'));
  }, [memoId]);
  return (
    <span className='text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full'>
      → {title || '加载中…'}
    </span>
  );
};

// ─── SyncMemoSelector — 多个关联备忘时，下拉选择目标备忘 ─────────────
const SyncMemoSelector = ({ memoIds, value, onChange }) => {
  const [memos, setMemos] = useState([]);
  useEffect(() => {
    if (!memoIds || memoIds.length === 0) return;
    supabase.from('memos').select('id, title').in('id', memoIds)
      .then(({ data }) => setMemos(data || []));
  }, [JSON.stringify(memoIds)]);
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      className='text-xs border border-gray-200 rounded-lg px-2 py-0.5 bg-white outline-none focus:border-[#bbea3b] text-gray-600 max-w-[160px]'
    >
      <option value=''>请选择备忘…</option>
      {memos.map((m) => (
        <option key={m.id} value={m.id}>
          {m.title || '（无标题）'}
        </option>
      ))}
    </select>
  );
};

// ─── InlineField — 内联可编辑字段行 ──────────────────────────────

const InlineField = ({ label, icon: Icon, children, onEdit, editContent, isEditing: fieldEditing }) => (
<div
  className={`flex gap-2 py-2 border-b border-gray-50 last:border-0 ${onEdit && !fieldEditing ? 'cursor-pointer hover:bg-gray-50/80 rounded-lg px-1 -mx-1 transition-colors' : 'px-1 -mx-1'}`}
  onClick={!fieldEditing && onEdit ? onEdit : undefined}
>
<div className='flex items-center gap-1.5 w-24 flex-shrink-0 pt-0.5'>
{Icon && <Icon className='h-3.5 w-3.5 text-gray-400 flex-shrink-0' />}
<span className='text-xs text-gray-400 truncate'>{label}</span>
</div>
<div className='flex-1 min-w-0'>
{fieldEditing ? (
editContent
) : (
<div className='flex items-center min-h-[28px]'>
<div className='flex-1 min-w-0'>{children}</div>
</div>
)}
</div>
</div>
);

// 两列并排字段行
const InlineFieldRow = ({ children }) => (
  <div className='flex border-b border-gray-50 last:border-0 divide-x divide-gray-50'>
    {children}
  </div>
);

// 两列并排中的单个字段（半宽）
const InlineFieldHalf = ({ label, icon: Icon, children, onEdit, editContent, isEditing: fieldEditing }) => (
<div
  className={`flex-1 min-w-0 flex gap-1.5 py-2 items-center px-1 ${onEdit && !fieldEditing ? 'cursor-pointer hover:bg-gray-50/80 rounded-lg transition-colors' : ''}`}
  onClick={!fieldEditing && onEdit ? onEdit : undefined}
>
<div className='flex items-center gap-1 w-[52px] flex-shrink-0'>
{Icon && <Icon className='h-3 w-3 text-gray-400 flex-shrink-0' />}
<span className='text-[11px] text-gray-400 truncate'>{label}</span>
</div>
<div className='flex-1 min-w-0'>
{fieldEditing ? (
editContent
) : (
<div className='flex items-center min-h-[24px]'>
<div className='flex-1 min-w-0'>{children}</div>
</div>
      )}
    </div>
  </div>
); // ─── LinkedMemosSection（关联备忘双向展示 + 搜索关联）──────────────

const LinkedMemosSection = ({ taskId, memoIds: initialMemoIds, onRefresh, task, comments, onGoToMemo }) => {
  const [memoIds, setMemoIds] = useState(initialMemoIds || []);
  const [linkedMemos, setLinkedMemos] = useState([]);
  const [allMemos, setAllMemos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);

  // 初始化同步 memoIds
  useEffect(() => { setMemoIds(initialMemoIds || []); }, [JSON.stringify(initialMemoIds)]);

  // 加载已关联的备忘详情
  useEffect(() => {
    if (!memoIds || memoIds.length === 0) { setLinkedMemos([]); return; }
    supabase.from('memos').select('id, title, content, created_at, direction')
      .in('id', memoIds).then(({ data }) => setLinkedMemos(data || []));
  }, [JSON.stringify(memoIds)]);

  // 加载全量备忘（用于搜索）
  useEffect(() => {
    if (showSearch) {
      supabase.from('memos').select('id, title, content').order('created_at', { ascending: false })
        .then(({ data }) => setAllMemos(data || []));
    }
  }, [showSearch]);

  const plainText = (html) => (html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

  const filteredMemos = allMemos.filter(m =>
    !memoIds.includes(m.id) &&
    ((m.title || plainText(m.content)).toLowerCase().includes(searchTerm.toLowerCase()))
  ).slice(0, 8);

  // 关联备忘（双向）
  const linkMemo = async (memo) => {
    setSaving(true);
    const newTaskMemoIds = [...new Set([...memoIds, memo.id])];
    await supabase.from('tasks').update({ related_memo_ids: newTaskMemoIds }).eq('id', taskId);
    // 更新备忘的 related_task_ids
    const { data: memoData } = await supabase.from('memos').select('related_task_ids').eq('id', memo.id).single();
    const newMemoTaskIds = [...new Set([...((memoData?.related_task_ids) || []), taskId])];
    await supabase.from('memos').update({ related_task_ids: newMemoTaskIds }).eq('id', memo.id);
    setMemoIds(newTaskMemoIds);
    setSearchTerm('');
    setShowDropdown(false);
    setSaving(false);
    onRefresh?.();
  };

  // 解除关联（双向）
  const unlinkMemo = async (memoId) => {
    setSaving(true);
    const newTaskMemoIds = memoIds.filter(id => id !== memoId);
    await supabase.from('tasks').update({ related_memo_ids: newTaskMemoIds }).eq('id', taskId);
    const { data: memoData } = await supabase.from('memos').select('related_task_ids').eq('id', memoId).single();
    const newMemoTaskIds = ((memoData?.related_task_ids) || []).filter(id => id !== taskId);
    await supabase.from('memos').update({ related_task_ids: newMemoTaskIds }).eq('id', memoId);
    setMemoIds(newTaskMemoIds);
    setSaving(false);
    onRefresh?.();
  };

  // 一键创建备忘（自动带入任务信息）
  const createMemoFromTask = async () => {
    if (!task) return;
    setCreating(true);
    try {
      // 拼接备忘内容：任务描述 + 动态记录
      let contentHtml = '';
      if (task.description) {
        contentHtml += `<h3>任务描述</h3>${task.description}`;
      }
      if (comments && comments.length > 0) {
        const commentTypeLabels = { comment: '评论', progress: '进展', decision: '决策', risk: '风险' };
        const commentLines = comments.map(c => {
          const typeLabel = commentTypeLabels[c.comment_type] || c.comment_type || '动态';
          const plainContent = (c.content || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
          const time = c.created_at ? new Date(c.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
          return `<p><strong>[${typeLabel}]</strong> ${time ? `<span style="color:#999">${time}</span> ` : ''}${plainContent}</p>`;
        }).join('');
        contentHtml += `<h3>任务动态</h3>${commentLines}`;
      }

      const newMemoId = genId();
      // 备忘的 direction 字段（取任务第一个标签）
      const memoDirection = (task.tag_ids && task.tag_ids.length > 0) ? task.tag_ids[0] : null;
      const { error } = await supabase.from('memos').insert([{
        id: newMemoId,
        title: task.title || '无标题',
        content: contentHtml || '',
        direction: memoDirection,
        related_task_ids: [taskId],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }]);

      if (error) throw error;

      // 同步更新任务的 related_memo_ids
      const newTaskMemoIds = [...new Set([...memoIds, newMemoId])];
      await supabase.from('tasks').update({ related_memo_ids: newTaskMemoIds }).eq('id', taskId);
      setMemoIds(newTaskMemoIds);
      onRefresh?.();
    } catch (e) {
      console.error('创建备忘失败:', e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className='px-4 py-3 border-t border-gray-50'>
      <div className='flex items-center justify-between mb-2.5'>
        <p className='text-xs font-medium text-gray-500 flex items-center gap-1'>
          <FileText className='h-3.5 w-3.5' /> 关联备忘
          {memoIds.length > 0 && <span className='text-gray-400 font-normal'>({memoIds.length})</span>}
        </p>
        <div className='flex items-center gap-1.5'>
          {/* 一键创建备忘 */}
          {task && (
            <button
              type='button'
              onClick={createMemoFromTask}
              disabled={creating || saving}
              className='text-xs px-2 py-1 rounded-lg border-0 text-[#2d4a00] flex items-center gap-1 transition-colors disabled:opacity-50'
              style={{ backgroundColor: creating ? '#d4f080' : '#bbea3b' }}
              title='一键创建备忘，自动带入任务描述、动态、标签'
            >
              {creating ? (
                <><span className='inline-block h-3 w-3 border-2 border-[#2d4a00] border-t-transparent rounded-full animate-spin' /></>
              ) : (
                <><Plus className='h-3 w-3' />创建备忘</>
              )}
            </button>
          )}
          <button
            type='button'
            onClick={() => { setShowSearch(s => !s); setSearchTerm(''); setShowDropdown(false); }}
            className='text-xs px-2 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 flex items-center gap-1 transition-colors'
          >
            <Link2 className='h-3 w-3' /> 关联已有
          </button>
        </div>
      </div>

      {/* 搜索关联 */}
      {showSearch && (
        <div className='relative mb-2.5'>
          <div className='relative'>
            <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none' />
            <input
              value={searchTerm}
              onChange={e => { setSearchTerm(e.target.value); setShowDropdown(true); }}
              onFocus={() => setShowDropdown(true)}
              placeholder='搜索备忘标题或内容...'
              className='w-full h-8 pl-8 pr-3 text-xs border border-gray-200 rounded-lg outline-none focus:border-[#bbea3b] focus:ring-1 focus:ring-[#bbea3b]'
            />
          </div>
          {showDropdown && (
            <>
              <div className='absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto'>
                {filteredMemos.length > 0 ? filteredMemos.map(m => {
                  const plain = plainText(m.content);
                  return (
                    <button key={m.id} type='button' onClick={() => { linkMemo(m); setShowSearch(false); }}
                      className='w-full text-left px-3 py-2.5 hover:bg-[#f5fce8] transition-colors border-b border-gray-50 last:border-0'>
                      <p className='text-xs font-medium text-gray-800 truncate'>
                        {m.title || plain.slice(0, 40) || '无内容'}
                      </p>
                      {plain && <p className='text-[11px] text-gray-400 truncate mt-0.5'>{plain.slice(0, 50)}</p>}
                    </button>
                  );
                }) : (
                  <div className='px-3 py-3 text-xs text-gray-400 text-center'>
                    {searchTerm ? '未找到匹配备忘' : '暂无可关联的备忘'}
                  </div>
                )}
              </div>
              <div className='fixed inset-0 z-10' onClick={() => setShowDropdown(false)} />
            </>
          )}
        </div>
      )}

      {/* 已关联的备忘列表 */}
      {linkedMemos.length > 0 ? (
        <div className='space-y-2'>
          {linkedMemos.map(memo => {
            const plain = plainText(memo.content);
            return (
              <div key={memo.id} className='px-3 py-2.5 rounded-xl bg-[#f8faf0] border border-[#ddf0a0] group'>
                <div className='flex items-start gap-2'>
                  <div
                    className='flex-1 min-w-0 cursor-pointer'
                    onClick={() => onGoToMemo?.(memo.id)}
                    title='点击查看备忘详情'
                  >
                    <p className='font-medium text-gray-800 text-xs truncate hover:text-[#2d4a00] transition-colors'>
                      {memo.title || plain.slice(0, 40) || '无内容'}
                    </p>
                    {plain && (
                      <p className='text-xs text-gray-500 mt-0.5 line-clamp-2 leading-relaxed'>
                        {memo.title ? plain.slice(0, 60) : plain.slice(40, 100)}
                      </p>
                    )}
                  </div>
                  <div className='flex items-center gap-0.5 flex-shrink-0'>
                    {onGoToMemo && (
                      <button
                        type='button'
                        onClick={() => onGoToMemo(memo.id)}
                        className='p-1 rounded text-gray-300 hover:text-[#2d4a00] hover:bg-[#f0fcd0] opacity-0 group-hover:opacity-100 transition-all'
                        title='跳转到备忘'
                      >
                        <ExternalLink className='h-3.5 w-3.5' />
                      </button>
                    )}
                    <button
                      type='button'
                      onClick={() => unlinkMemo(memo.id)}
                      disabled={saving}
                      className='p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all'
                      title='解除关联'
                    >
                      <X className='h-3.5 w-3.5' />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        !showSearch && (
          <p className='text-xs text-gray-400 text-center py-2'>暂无关联备忘，点击右上角关联</p>
        )
      )}
    </div>
  );
};

// ─── SubTaskQuickCreate — 子任务轻量内联创建 ──────────────────────

const SubTaskQuickCreate = ({ parentTask, onCreated, onCancel }) => {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  const doCreate = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setSaving(true);
    setErrMsg('');
    try {
      const subTaskId = genId();
      const now = new Date().toISOString();
      const { error } = await supabase.from('tasks').insert([{
        id: subTaskId,
        title: trimmed,
        status: 'todo',
        priority: 'medium',
        group_id: parentTask?.group_id ?? null,
        parent_id: parentTask?.id ?? null,
        related_member_ids: [],
        predecessor_ids: [],
        successor_ids: [],
        tag_ids: [],
        key_docs: [],
        related_memo_ids: [],
        need_report: false,
        created_at: now,
        updated_at: now,
      }]);
      if (error) {
        setErrMsg('创建失败：' + error.message);
        setSaving(false);
        return;
      }
      // 成功后通知父组件刷新并关闭
      onCreated?.();
    } catch (e) {
      setErrMsg('创建失败，请重试');
      setSaving(false);
    }
  };

  return (
    <div className='mt-2 p-3 bg-gray-50 rounded-xl border border-gray-200'>
      <input
        ref={inputRef}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); doCreate(); }
          if (e.key === 'Escape') onCancel();
        }}
        placeholder='子任务标题，按 Enter 创建'
        className='w-full text-sm bg-white border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#bbea3b] focus:ring-1 focus:ring-[#bbea3b] transition-colors placeholder-gray-300'
      />
      {errMsg && <p className='text-xs text-red-500 mt-1'>{errMsg}</p>}
      <div className='flex gap-2 mt-2'>
        <button
          type='button'
          onClick={onCancel}
          disabled={saving}
          className='flex-1 h-8 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-40'
        >
          取消
        </button>
        <button
          type='button'
          onClick={doCreate}
          disabled={!title.trim() || saving}
          className='flex-1 h-8 text-xs font-medium rounded-lg transition-colors disabled:opacity-40'
          style={{ backgroundColor: '#bbea3b', color: '#2d4a00' }}
        >
          {saving ? '创建中…' : '创建子任务'}
        </button>
      </div>
    </div>
  );
};

// ─── TaskDetail — 瀑布式布局 ──────────────────────────────────────

export const TaskDetail = ({ task, tasks, members, tags, groups, onBack, onRefresh, onMemberAdded, onGroupAssigned, onCloseDrawer, drawerMode = false, onGoToConfig, onGoToMemo }) => {
  const [currentTask, setCurrentTask] = useState(task);
  const [taskStack, setTaskStack] = useState([]); // 子任务导航历史栈
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState('comment');
  const [editingField, setEditingField] = useState(null);
  const [isAddingSubTask, setIsAddingSubTask] = useState(false);
  const [subTasks, setSubTasks] = useState([]);
  const [editorKey, setEditorKey] = useState(0); // 标题/描述/文档的临时编辑值
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editDocs, setEditDocs] = useState([]); // 行内编辑某条文档（提升到外部，保证保存时能读到最新值）
  const [editDocIdx, setEditDocIdx] = useState(null);
  const [editDocItem, setEditDocItem] = useState({
    url: '',
    title: '',
  });
  const [editDocFetching, setEditDocFetching] = useState(false); // 评论编辑状态
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingCommentContent, setEditingCommentContent] = useState('');
  const [editingCommentType, setEditingCommentType] = useState('comment');
  const commentEndRef = useRef(null);
  // 同步更新至备忘
  const [syncToMemo, setSyncToMemo] = useState(false);
  const [syncMemoId, setSyncMemoId] = useState(null); // null = 未选择
  useEffect(() => {
    setCurrentTask(task);
    setEditingField(null);
    setIsAddingSubTask(false);
    setNewComment('');
    setCommentType('comment');
    setEditorKey((k) => k + 1);
    setSyncToMemo(false);
    setSyncMemoId(null);
  }, [task.id]);
  useEffect(() => {
    fetchComments();
    setSubTasks(tasks.filter((t) => t.parent_id === currentTask.id));
  }, [currentTask.id, tasks]);
  const fetchComments = async () => {
    const { data } = await supabase.from('task_comments').select('*').eq('task_id', currentTask.id).order('created_at', {
      ascending: true,
    });
    setComments(data || []);
  };
  const isCommentEmpty = (html) => !html || html.replace(/<[^>]*>/g, '').trim().length === 0;
  const handleSendComment = async () => {
    if (isCommentEmpty(newComment)) return;
    await supabase.from('task_comments').insert([
      {
        id: genId(),
        task_id: currentTask.id,
        content: newComment,
        comment_type: commentType,
      },
    ]);

    // 同步更新至备忘
    if (syncToMemo && syncMemoId) {
      const typeLabel = commentTypeConfig[commentType]?.label || '评论';
      const now = new Date();
      const timeStr = now.toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '/').replace(/,/g, '');
      const plainContent = newComment.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
      const appendHtml =
        `<h3>任务动态更新</h3>` +
        `<p>[${typeLabel}] ${timeStr}，来自于${currentTask.title || '此任务'}。</p>` +
        `<p>${plainContent}</p>`;
      const { data: memoData } = await supabase.from('memos').select('content').eq('id', syncMemoId).single();
      const existingContent = memoData?.content || '';
      await supabase.from('memos').update({
        content: existingContent + appendHtml,
        updated_at: new Date().toISOString(),
      }).eq('id', syncMemoId);
    }

    setNewComment('');
    setEditorKey((k) => k + 1);
    setSyncToMemo(false);
    setSyncMemoId(null);
    fetchComments();
    setTimeout(
      () =>
        commentEndRef.current?.scrollIntoView({
          behavior: 'smooth',
        }),
      100,
    );
  }; // 通用字段保存（立即保存到数据库，localStorage 字段单独处理）
  const handleFieldSave = async (patchArg) => {
    let patch = { ...patchArg };
    const { importance, urgency, owner_ids, supporter_ids, related_member_ids, predecessor_ids, successor_ids, ...dbPatch } = patch;
    // related_member_ids / predecessor_ids / successor_ids / group_id / need_report 写入数据库
    if ('related_member_ids' in patch) dbPatch.related_member_ids = related_member_ids;
    if ('predecessor_ids' in patch) dbPatch.predecessor_ids = predecessor_ids;
    if ('successor_ids' in patch) dbPatch.successor_ids = successor_ids;
    // need_report 直接写入数据库（已在 dbPatch 中，无需额外处理）
    // group_id 直接写入数据库（已有 tasks.group_id 字段）
    // 若修改了 plan_date 且 plan_date 晚于 due_date，则自动同步 due_date = plan_date
    if ('plan_date' in dbPatch && dbPatch.plan_date) {
      const planD = dbPatch.plan_date;
      const dueD = ('due_date' in dbPatch ? dbPatch.due_date : currentTask.due_date);
      if (dueD && planD > dueD.slice(0, 10)) {
        dbPatch.due_date = planD;
        patch = { ...patch, due_date: planD };
      }
    }
    if (Object.keys(dbPatch).length > 0) {
      const taskId = currentTask.id;
      console.log('[FieldSave] patch =', patch, 'dbPatch =', dbPatch, 'taskId =', taskId, typeof taskId);
      const { data, error } = await supabase.from('tasks').update(dbPatch).eq('id', taskId).select();
      console.log('[FieldSave] result data =', data, 'error =', error);
      if (error) {
        console.error('保存字段失败:', error);
        alert('保存失败：' + (error.message || JSON.stringify(error)));
        return;
      }
    }
    // 前置/后置任务双向同步：A 是 B 的前置 → B 的 successor_ids 中加入 A
    if ('predecessor_ids' in patch) {
      const newPredIds = predecessor_ids || [];
      const oldPredIds = currentTask.predecessor_ids || [];
      // 新增的前置任务：在对方的 successor_ids 中加入当前任务
      for (const predId of newPredIds) {
        if (!oldPredIds.includes(predId)) {
          const predTask = tasks.find((t) => t.id === predId);
          if (predTask) {
            const newSuccIds = [...new Set([...(predTask.successor_ids || []), currentTask.id])];
            await supabase.from('tasks').update({ successor_ids: newSuccIds }).eq('id', predId);
          }
        }
      }
      // 移除的前置任务：在对方的 successor_ids 中移除当前任务
      for (const predId of oldPredIds) {
        if (!newPredIds.includes(predId)) {
          const predTask = tasks.find((t) => t.id === predId);
          if (predTask) {
            const newSuccIds = (predTask.successor_ids || []).filter((id) => id !== currentTask.id);
            await supabase.from('tasks').update({ successor_ids: newSuccIds }).eq('id', predId);
          }
        }
      }
    }
    if ('successor_ids' in patch) {
      const newSuccIds = successor_ids || [];
      const oldSuccIds = currentTask.successor_ids || [];
      // 新增的后置任务：在对方的 predecessor_ids 中加入当前任务
      for (const succId of newSuccIds) {
        if (!oldSuccIds.includes(succId)) {
          const succTask = tasks.find((t) => t.id === succId);
          if (succTask) {
            const newPredIds = [...new Set([...(succTask.predecessor_ids || []), currentTask.id])];
            await supabase.from('tasks').update({ predecessor_ids: newPredIds }).eq('id', succId);
          }
        }
      }
      // 移除的后置任务：在对方的 predecessor_ids 中移除当前任务
      for (const succId of oldSuccIds) {
        if (!newSuccIds.includes(succId)) {
          const succTask = tasks.find((t) => t.id === succId);
          if (succTask) {
            const newPredIds = (succTask.predecessor_ids || []).filter((id) => id !== currentTask.id);
            await supabase.from('tasks').update({ predecessor_ids: newPredIds }).eq('id', succId);
          }
        }
      }
    }
    // group_id 已直接写入数据库，同步更新父组件列表
    if ('group_id' in patch) {
      onGroupAssigned?.(currentTask.id, patch.group_id ?? null);
    } // localStorage 扩展字段（importance/urgency/owner_ids/supporter_ids 仍用 localStorage）
    const extraPatch = {};
    if ('importance' in patch) extraPatch.importance = importance;
    if ('urgency' in patch) extraPatch.urgency = urgency;
    if ('owner_ids' in patch) extraPatch.owner_ids = owner_ids;
    if ('supporter_ids' in patch) extraPatch.supporter_ids = supporter_ids;
    if (Object.keys(extraPatch).length > 0) setStoredTaskExtra(currentTask.id, extraPatch);
    setCurrentTask((prev) => ({
      ...prev,
      ...patch,
    })); // 始终刷新列表，确保 importance/urgency/owner_ids/supporter_ids 等 localStorage 字段也能同步到列表
    onRefresh();
  };
  const handleAddSubTask = async ({ title, group_id }) => {
    if (!title?.trim()) return;
    const subTaskId = genId();
    const now = new Date().toISOString();
    const { error } = await supabase.from('tasks').insert([
      {
        id: subTaskId,
        title: title.trim(),
        status: 'todo',
        priority: 'medium',
        group_id: group_id ?? currentTask.group_id ?? null,
        parent_id: currentTask.id,
        related_member_ids: [],
        predecessor_ids: [],
        successor_ids: [],
        tag_ids: [],
        key_docs: [],
        related_memo_ids: [],
        need_report: false,
        created_at: now,
        updated_at: now,
      },
    ]);
    if (error) {
      console.error('创建子任务失败:', error);
      return;
    }
    if (group_id != null) {
      onGroupAssigned?.(subTaskId, group_id);
    }
    setIsAddingSubTask(false);
    onRefresh();
  };
  const handleDeleteComment = async (id) => {
    await supabase.from('task_comments').delete().eq('id', id);
    fetchComments();
  }; // 开始编辑某条评论
  const handleStartEditComment = (c) => {
    setEditingCommentId(c.id);
    setEditingCommentContent(c.content);
    setEditingCommentType(c.comment_type);
  }; // 取消编辑
  const handleCancelEditComment = () => {
    setEditingCommentId(null);
    setEditingCommentContent('');
    setEditingCommentType('comment');
  }; // 保存编辑
  const handleSaveEditComment = async () => {
    if (isCommentEmpty(editingCommentContent)) return;
    await supabase
      .from('task_comments')
      .update({
        content: editingCommentContent,
        comment_type: editingCommentType,
      })
      .eq('id', editingCommentId);
    handleCancelEditComment();
    fetchComments();
  };
  const parentTask = currentTask.parent_id ? tasks.find((t) => t.id === currentTask.parent_id) : null;
  const ownerList = (currentTask.owner_ids || []).map((id) => members.find((m) => m.id === id)).filter(Boolean);
  const supporterList = (currentTask.supporter_ids || []).map((id) => members.find((m) => m.id === id)).filter(Boolean);
  const relatedMemberList = (currentTask.related_member_ids || []).map((id) => members.find((m) => m.id === id)).filter(Boolean);
  const predecessorList = (currentTask.predecessor_ids || []).map((id) => tasks.find((t) => t.id === id)).filter(Boolean);
  const successorList = (currentTask.successor_ids || []).map((id) => tasks.find((t) => t.id === id)).filter(Boolean);
  const parentOptions = tasks.filter((t) => !t.parent_id && t.id !== currentTask.id);
  return (
    <div className='flex flex-col h-full bg-white'>
      {/* 顶部栏 */}
      <div className='flex items-center gap-2 px-4 h-12 border-b border-gray-100 flex-shrink-0'>
        {/* 返回上级任务(查看子任务时) */}
        {taskStack.length > 0 && (
          <button
            onClick={() => {
              const prev = taskStack[taskStack.length - 1];
              setTaskStack((s) => s.slice(0, -1));
              setCurrentTask(prev);
              setSubTasks(tasks.filter((t) => t.parent_id === prev.id));
              setComments([]);
            }}
            className='text-gray-400 hover:text-gray-700 flex-shrink-0 -ml-1'
            title='返回上级任务'
          >
            <ChevronRight className='h-4 w-4 rotate-180' />
          </button>
        )}
        {/* 移动端/无 drawer 时:返回列表按钮(始终显示,避免左滑关闭后无路可退) */}
        {!drawerMode && onBack && (
          <button
            onClick={onBack}
            className='text-gray-400 hover:text-gray-700 flex-shrink-0 -ml-1'
            title='返回任务列表'
          >
            <ArrowLeft className='h-4 w-4' />
          </button>
        )}
        <div className='flex-1 min-w-0'>
          {editingField === 'title_header' ? (
            <div className='flex gap-2 items-center'>
              <input
                autoFocus
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleFieldSave({ title: editTitle });
                    setEditingField(null);
                  }
                  if (e.key === 'Escape') setEditingField(null);
                }}
                onBlur={() => {
                  if (editTitle.trim() && editTitle !== currentTask.title) {
                    handleFieldSave({ title: editTitle });
                  }
                  setEditingField(null);
                }}
                className='flex-1 min-w-0 text-sm font-semibold border border-[#bbea3b] rounded-lg px-2 py-1 focus:outline-none bg-white'
              />
            </div>
          ) : (
            <p
              className='text-sm font-semibold text-gray-900 truncate cursor-pointer hover:text-[#5a7a00] transition-colors'
              title='点击编辑标题'
              onClick={() => {
                setEditTitle(currentTask.title);
                setEditingField('title_header');
              }}
            >
              {currentTask.title}
            </p>
          )}
        </div>
        {drawerMode && (
          <button onClick={onCloseDrawer} className='text-gray-400 hover:text-gray-600 flex-shrink-0'>
            <X className='h-4 w-4' />
          </button>
        )}
      </div>

      {/* 瀑布式内容区 — 全部可滚动 */}
      <div className='flex-1 overflow-y-auto min-h-0'>
        {/* 一、基本信息区（内联编辑） */}
        <div className='px-4 py-3 border-b border-gray-100'>
          {/* 状态 + 优先级（同一行：进展在左，优先级快速选择在右） */}
          <div className='mb-2 flex items-center gap-2 flex-wrap'>
            {/* 进展按钮组 */}
            <div className='flex gap-1.5 flex-wrap flex-1 min-w-0'>
              {[
                { key: 'todo', label: '待办', dot: 'bg-gray-300', activeBg: 'bg-gray-100', activeText: 'text-gray-700', activeBorder: 'border-gray-300' },
                { key: 'in_progress', label: '进行中', dot: 'bg-blue-400', activeBg: 'bg-blue-50', activeText: 'text-blue-700', activeBorder: 'border-blue-300' },
                { key: 'done', label: '已完成', dot: 'bg-green-400', activeBg: 'bg-green-50', activeText: 'text-green-700', activeBorder: 'border-green-300' },
              ].map(s => (
                <button
                  key={s.key}
                  type='button'
                  onClick={() => handleFieldSave({ status: s.key })}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                    currentTask.status === s.key
                      ? `${s.activeBg} ${s.activeText} ${s.activeBorder}`
                      : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
                  {s.label}
                </button>
              ))}
            </div>
            {/* 优先级快速选择（右侧，pill 按钮组） */}
            <div className='flex items-center gap-1 flex-shrink-0'>
              {[
                { key: 'high', label: '高', activeText: 'text-red-600', activeBg: 'bg-red-50', activeBorder: 'border-red-300', dot: 'bg-red-400' },
                { key: 'medium', label: '中', activeText: 'text-amber-600', activeBg: 'bg-amber-50', activeBorder: 'border-amber-300', dot: 'bg-amber-400' },
                { key: 'low', label: '低', activeText: 'text-gray-500', activeBg: 'bg-gray-100', activeBorder: 'border-gray-300', dot: 'bg-gray-400' },
              ].map(p => {
                const isActive = (currentTask.priority || 'medium') === p.key;
                return (
                  <button
                    key={p.key}
                    type='button'
                    onClick={() => handleFieldSave({ priority: p.key })}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-all ${
                      isActive
                        ? `${p.activeBg} ${p.activeText} ${p.activeBorder}`
                        : 'bg-white text-gray-300 border-gray-200 hover:border-gray-300 hover:text-gray-500'
                    }`}
                  >
                    <Flag className={`w-2.5 h-2.5 flex-shrink-0 ${isActive ? '' : 'opacity-50'}`} />
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 分组 + 上级任务（合并一行） */}
          <InlineFieldRow>
            <InlineFieldHalf label='分组' icon={FolderOpen}>
              <Select
                value={currentTask.group_id?.toString() || DEFAULT_GROUP_ID}
                onValueChange={(v) =>
                  handleFieldSave({
                    group_id: v === DEFAULT_GROUP_ID ? null : Number(v),
                  })
                }
              >
                <SelectTrigger className='h-6 w-auto border-0 bg-transparent p-0 text-xs focus:ring-0 gap-1 shadow-none'>
                  <SelectValue placeholder='未分组' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={DEFAULT_GROUP_ID}>未分组</SelectItem>
                  {groups.map((g, __dnd_i) => (
                    <SelectItem key={g.id} value={g.id.toString()}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </InlineFieldHalf>
            <InlineFieldHalf label='上级' icon={ArrowLeft}>
              <Select
                value={currentTask.parent_id?.toString() || 'none'}
                onValueChange={(v) =>
                  handleFieldSave({
                    parent_id: v === 'none' ? null : parseInt(v, 10),
                  })
                }
              >
                <SelectTrigger className='h-6 w-auto border-0 bg-transparent p-0 text-xs focus:ring-0 gap-1 shadow-none'>
                  <SelectValue placeholder='无' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='none'>无（顶级）</SelectItem>
                  {parentOptions.map((t, __dnd_i) => (
                    <SelectItem key={t.id} value={t.id.toString()}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </InlineFieldHalf>
          </InlineFieldRow>

          {/* 截止日期 + 计划日期（合并一行） */}
          <InlineFieldRow>
            <InlineFieldHalf
              label='截止'
              icon={Calendar}
              onEdit={() => setEditingField('due_date')}
              isEditing={editingField === 'due_date'}
              editContent={
                <div className='flex gap-1 items-center flex-wrap'>
                  <input
                    type='date'
                    autoFocus
                    defaultValue={currentTask.due_date ? currentTask.due_date.slice(0, 10) : ''}
                    onChange={(e) =>
                      handleFieldSave({
                        due_date: e.target.value || null,
                      })
                    }
                    onBlur={() => setEditingField(null)}
                    className='text-xs border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-[#bbea3b] w-full'
                  />
                  {currentTask.due_date && (
                    <button
                      onClick={() => {
                        handleFieldSave({ due_date: null });
                        setEditingField(null);
                      }}
                      className='text-[10px] text-gray-400 hover:text-red-400 flex-shrink-0'
                    >
                      清除
                    </button>
                  )}
                </div>
              }
            >
              {currentTask.due_date ? (
                <span className={`text-xs flex items-center gap-0.5 ${getDateStyle(currentTask.due_date)}`}>
                  {getDateLabel(currentTask.due_date)}
                  {isOverdue(currentTask.due_date) && <span className='text-[9px] bg-red-100 text-red-500 px-0.5 rounded'>过期</span>}
                </span>
              ) : (
                <span className='text-xs text-gray-300'>未设置</span>
              )}
            </InlineFieldHalf>
            <InlineFieldHalf
              label='计划'
              icon={Calendar}
              onEdit={() => setEditingField('plan_date')}
              isEditing={editingField === 'plan_date'}
              editContent={
                <div className='flex gap-1 items-center flex-wrap'>
                  <input
                    type='date'
                    autoFocus
                    defaultValue={currentTask.plan_date ? currentTask.plan_date.slice(0, 10) : ''}
                    onChange={(e) =>
                      handleFieldSave({
                        plan_date: e.target.value || null,
                      })
                    }
                    onBlur={() => setEditingField(null)}
                    className='text-xs border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:border-[#bbea3b] w-full'
                  />
                  {currentTask.plan_date && (
                    <button
                      onClick={() => {
                        handleFieldSave({ plan_date: null });
                        setEditingField(null);
                      }}
                      className='text-[10px] text-gray-400 hover:text-red-400 flex-shrink-0'
                    >
                      清除
                    </button>
                  )}
                </div>
              }
            >
              {currentTask.plan_date ? (
                <span className={`text-xs flex items-center gap-0.5 ${getDateStyle(currentTask.plan_date)}`}>
                  {getDateLabel(currentTask.plan_date)}
                  {isOverdue(currentTask.plan_date) && <span className='text-[9px] bg-red-100 text-red-500 px-0.5 rounded'>过期</span>}
                </span>
              ) : (
                <span className='text-xs text-gray-300'>未设置</span>
              )}
            </InlineFieldHalf>
          </InlineFieldRow>

          {/* 重要性 + 紧急度（合并一行） */}
          <InlineFieldRow>
            <InlineFieldHalf label='重要性' icon={Flag}>
              <Select
                value={currentTask.importance || 'normal'}
                onValueChange={(v) =>
                  handleFieldSave({
                    importance: v,
                  })
                }
              >
                <SelectTrigger className='h-6 w-auto border-0 bg-transparent p-0 text-xs focus:ring-0 gap-1 shadow-none'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='critical' className='text-xs'>非常重要</SelectItem>
                  <SelectItem value='important' className='text-xs'>重要</SelectItem>
                  <SelectItem value='normal' className='text-xs'>一般</SelectItem>
                </SelectContent>
              </Select>
            </InlineFieldHalf>
            <InlineFieldHalf label='紧急度' icon={AlertCircle}>
              <Select
                value={currentTask.urgency || 'normal'}
                onValueChange={(v) =>
                  handleFieldSave({
                    urgency: v,
                  })
                }
              >
                <SelectTrigger className='h-6 w-auto border-0 bg-transparent p-0 text-xs focus:ring-0 gap-1 shadow-none'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='urgent' className='text-xs'>紧急</SelectItem>
                  <SelectItem value='normal' className='text-xs'>一般</SelectItem>
                </SelectContent>
              </Select>
            </InlineFieldHalf>
          </InlineFieldRow>

          {/* 主R */}
          <InlineField
            label='主R'
            icon={User}
            onEdit={() => setEditingField('owner')}
            isEditing={editingField === 'owner'}
            editContent={
              <div>
                <MemberPicker
                  label='选择主R'
                  value={currentTask.owner_ids || []}
                  onChange={(v) =>
                    setCurrentTask((prev) => ({
                      ...prev,
                      owner_ids: v,
                    }))
                  }
                  members={members}
                  onAddMember={onMemberAdded}
                  multi
                />
                <div className='flex gap-2 mt-1'>
                  <button
                    onClick={() => {
                      handleFieldSave({
                        owner_ids: currentTask.owner_ids || [],
                      });
                      setEditingField(null);
                    }}
                    className='text-xs px-2 py-1 rounded text-[#2d4a00]'
                    style={{
                      backgroundColor: '#bbea3b',
                    }}
                  >
                    完成
                  </button>
                  <button onClick={() => setEditingField(null)} className='text-xs text-gray-400 hover:text-gray-600'>
                    取消
                  </button>
                </div>
              </div>
            }
          >
            {ownerList.length > 0 ? (
              <div className='flex flex-wrap gap-1'>
                {ownerList.map((m, __dnd_i) => (
                  <div key={m.id} className='flex items-center gap-1'>
                    <div
                      className='w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0'
                      style={{
                        backgroundColor: '#5a7a00',
                      }}
                    >
                      {m.name.slice(0, 1)}
                    </div>
                    <span className='text-xs text-gray-700'>{m.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className='text-xs text-gray-300'>未分配</span>
            )}
          </InlineField>

          {/* 主S */}
          <InlineField
            label='主S'
            icon={Users}
            onEdit={() => setEditingField('supporter')}
            isEditing={editingField === 'supporter'}
            editContent={
              <div>
                <MemberPicker
                  label='选择主S'
                  value={currentTask.supporter_ids || []}
                  onChange={(v) =>
                    setCurrentTask((prev) => ({
                      ...prev,
                      supporter_ids: v,
                    }))
                  }
                  members={members}
                  onAddMember={onMemberAdded}
                  multi
                />
                <div className='flex gap-2 mt-1'>
                  <button
                    onClick={() => {
                      handleFieldSave({
                        supporter_ids: currentTask.supporter_ids || [],
                      });
                      setEditingField(null);
                    }}
                    className='text-xs px-2 py-1 rounded text-[#2d4a00]'
                    style={{
                      backgroundColor: '#bbea3b',
                    }}
                  >
                    完成
                  </button>
                  <button onClick={() => setEditingField(null)} className='text-xs text-gray-400 hover:text-gray-600'>
                    取消
                  </button>
                </div>
              </div>
            }
          >
            {supporterList.length > 0 ? (
              <div className='flex flex-wrap gap-1'>
                {supporterList.map((m, __dnd_i) => (
                  <div key={m.id} className='flex items-center gap-1'>
                    <div
                      className='w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0'
                      style={{
                        backgroundColor: '#84cc16',
                      }}
                    >
                      {m.name.slice(0, 1)}
                    </div>
                    <span className='text-xs text-gray-700'>{m.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className='text-xs text-gray-300'>未分配</span>
            )}
          </InlineField>

          {/* 标签 */}
          <InlineField
            label='标签'
            icon={Tag}
            onEdit={() => setEditingField('tags')}
            isEditing={editingField === 'tags'}
            editContent={
              <div>
                <TagPicker
                  value={currentTask.tag_ids || []}
                  onChange={(v) =>
                    setCurrentTask((prev) => ({
                      ...prev,
                      tag_ids: v,
                    }))
                  }
                  tags={tags}
                  onGoToConfig={onGoToConfig}
                />
                <div className='flex gap-2 mt-1'>
                  <button
                    onClick={() => {
                      handleFieldSave({
                        tag_ids: currentTask.tag_ids || [],
                      });
                      setEditingField(null);
                    }}
                    className='text-xs px-2 py-1 rounded text-[#2d4a00]'
                    style={{
                      backgroundColor: '#bbea3b',
                    }}
                  >
                    完成
                  </button>
                  <button onClick={() => setEditingField(null)} className='text-xs text-gray-400 hover:text-gray-600'>
                    取消
                  </button>
                </div>
              </div>
            }
          >
            {(currentTask.tag_ids || []).length > 0 ? (
              <div className='flex flex-wrap gap-1'>
                {tags
                  .filter((t) => (currentTask.tag_ids || []).includes(t.id))
                  .map((t, __dnd_i) => (
                    <span
                      key={t.id}
                      className='px-2 py-0.5 rounded-full text-xs font-medium'
                      style={{
                        backgroundColor: `${t.color}22`,
                        color: t.color,
                        border: `1px solid ${t.color}44`,
                      }}
                    >
                      {t.name}
                    </span>
                  ))}
              </div>
            ) : (
              <span className='text-xs text-gray-300'>未设置</span>
            )}
          </InlineField>

          {/* 是否需要汇报 */}
          <div className='flex items-center gap-3 py-2 px-1 border-b border-gray-50 last:border-b-0'>
            <div className='flex items-center gap-2 w-20 flex-shrink-0'>
              <Flag className='h-3.5 w-3.5 text-gray-400 flex-shrink-0' />
              <span className='text-xs text-gray-500'>需要汇报</span>
            </div>
            <div className='flex gap-2'>
              {[['no', '否'], ['yes', '是']].map(([v, l]) => (
                <button
                  key={v}
                  onClick={() => {
                    const val = v === 'yes';
                    setCurrentTask((prev) => ({ ...prev, need_report: val }));
                    handleFieldSave({ need_report: val });
                  }}
                  className={`text-xs px-3 py-1 rounded-full border transition-colors ${(v === 'yes' ? currentTask.need_report : !currentTask.need_report) ? 'text-[#2d4a00] border-transparent font-medium' : 'bg-gray-50 text-gray-500 border-gray-200'}`}
                  style={(v === 'yes' ? currentTask.need_report : !currentTask.need_report) ? { backgroundColor: '#bbea3b' } : {}}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* 关联人 */}
          <InlineField
            label='关联人'
            icon={UserPlus}
            onEdit={() => setEditingField('related_members')}
            isEditing={editingField === 'related_members'}
            editContent={
              <div>
                <MemberPicker
                  label='选择关联人（非主R/主S）'
                  value={currentTask.related_member_ids || []}
                  onChange={(v) =>
                    setCurrentTask((prev) => ({
                      ...prev,
                      related_member_ids: v,
                    }))
                  }
                  members={members}
                  onAddMember={onMemberAdded}
                  multi
                />
                <div className='flex gap-2 mt-1'>
                  <button
                    onClick={() => {
                      handleFieldSave({ related_member_ids: currentTask.related_member_ids || [] });
                      setEditingField(null);
                    }}
                    className='text-xs px-2 py-1 rounded text-[#2d4a00]'
                    style={{ backgroundColor: '#bbea3b' }}
                  >
                    完成
                  </button>
                  <button onClick={() => setEditingField(null)} className='text-xs text-gray-400 hover:text-gray-600'>
                    取消
                  </button>
                </div>
              </div>
            }
          >
            {relatedMemberList.length > 0 ? (
              <div className='flex flex-wrap gap-1'>
                {relatedMemberList.map((m) => (
                  <div key={m.id} className='flex items-center gap-1'>
                    <div
                      className='w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0'
                      style={{ backgroundColor: '#7c3aed' }}
                    >
                      {m.name.slice(0, 1)}
                    </div>
                    <span className='text-xs text-gray-700'>{m.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className='text-xs text-gray-300'>未设置</span>
            )}
          </InlineField>

          {/* 前置任务 */}
          <InlineField
            label='前置任务'
            icon={GitBranch}
            onEdit={() => setEditingField('predecessors')}
            isEditing={editingField === 'predecessors'}
            editContent={
              <div>
                <TaskPicker
                  label='选择前置任务'
                  value={currentTask.predecessor_ids || []}
                  onChange={(v) =>
                    setCurrentTask((prev) => ({
                      ...prev,
                      predecessor_ids: v,
                    }))
                  }
                  tasks={tasks}
                  currentTaskId={currentTask.id}
                  excludeIds={currentTask.successor_ids || []}
                />
                <div className='flex gap-2 mt-1'>
                  <button
                    onClick={() => {
                      handleFieldSave({ predecessor_ids: currentTask.predecessor_ids || [] });
                      setEditingField(null);
                    }}
                    className='text-xs px-2 py-1 rounded text-[#2d4a00]'
                    style={{ backgroundColor: '#bbea3b' }}
                  >
                    完成
                  </button>
                  <button onClick={() => setEditingField(null)} className='text-xs text-gray-400 hover:text-gray-600'>
                    取消
                  </button>
                </div>
              </div>
            }
          >
            {predecessorList.length > 0 ? (
              <div className='flex flex-wrap gap-1'>
                {predecessorList.map((t) => (
                  <span key={t.id} className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-100'>
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS[t.status]?.dot || 'bg-gray-300'}`} />
                    <span className='max-w-[100px] truncate'>{t.title}</span>
                  </span>
                ))}
              </div>
            ) : (
              <span className='text-xs text-gray-300'>未设置</span>
            )}
          </InlineField>

          {/* 后置任务 */}
          <InlineField
            label='后置任务'
            icon={GitBranch}
            onEdit={() => setEditingField('successors')}
            isEditing={editingField === 'successors'}
            editContent={
              <div>
                <TaskPicker
                  label='选择后置任务'
                  value={currentTask.successor_ids || []}
                  onChange={(v) =>
                    setCurrentTask((prev) => ({
                      ...prev,
                      successor_ids: v,
                    }))
                  }
                  tasks={tasks}
                  currentTaskId={currentTask.id}
                  excludeIds={currentTask.predecessor_ids || []}
                />
                <div className='flex gap-2 mt-1'>
                  <button
                    onClick={() => {
                      handleFieldSave({ successor_ids: currentTask.successor_ids || [] });
                      setEditingField(null);
                    }}
                    className='text-xs px-2 py-1 rounded text-[#2d4a00]'
                    style={{ backgroundColor: '#bbea3b' }}
                  >
                    完成
                  </button>
                  <button onClick={() => setEditingField(null)} className='text-xs text-gray-400 hover:text-gray-600'>
                    取消
                  </button>
                </div>
              </div>
            }
          >
            {successorList.length > 0 ? (
              <div className='flex flex-wrap gap-1'>
                {successorList.map((t) => (
                  <span key={t.id} className='inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-50 text-green-700 border border-green-100'>
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS[t.status]?.dot || 'bg-gray-300'}`} />
                    <span className='max-w-[100px] truncate'>{t.title}</span>
                  </span>
                ))}
              </div>
            ) : (
              <span className='text-xs text-gray-300'>未设置</span>
            )}
          </InlineField>
        </div>

        {/* 二、任务描述 */}
        <div className='px-4 py-3 border-b border-gray-50'>
          <div className='flex items-center justify-between mb-2'>
            <p className='text-xs font-medium text-gray-500 uppercase tracking-wider'>任务描述</p>
            {editingField !== 'description' && (
              <button
                onClick={() => {
                  setEditDescription(currentTask.description || '');
                  setEditingField('description');
                }}
                className='text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1'
              >
                <svg xmlns='http://www.w3.org/2000/svg' className='h-3 w-3' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                  <path d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' />
                  <path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' />
                </svg>
                编辑
              </button>
            )}
          </div>
          {editingField === 'description' ? (
            <div>
              <div className='bg-white rounded-lg border border-gray-200 overflow-hidden mb-2'>
                <RichEditor key={`desc-edit-${currentTask.id}`} value={editDescription} onChange={setEditDescription} placeholder='任务描述...' />
              </div>
              <div className='flex gap-2 justify-end'>
                <button onClick={() => setEditingField(null)} className='text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500'>
                  取消
                </button>
                <button
                  onClick={() => {
                    handleFieldSave({
                      description: editDescription,
                    });
                    setEditingField(null);
                  }}
                  className='text-xs px-3 py-1.5 rounded-lg text-[#2d4a00]'
                  style={{
                    backgroundColor: '#bbea3b',
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          ) : currentTask.description ? (
            <div
              className='rich-content text-sm'
              dangerouslySetInnerHTML={{
                __html: currentTask.description,
              }}
            />
          ) : (
            <p className='text-xs text-gray-300 italic'>暂无描述，点击编辑添加</p>
          )}
        </div>

        {/* 三、关键文档 */}
        <div className='px-4 py-3 border-b border-gray-50'>
          <div className='flex items-center justify-between mb-2'>
            <p className='text-xs font-medium text-gray-500 uppercase tracking-wider'>关键文档</p>
            {editingField !== 'docs' && (
              <button
                onClick={() => {
                  setEditDocs(currentTask.key_docs || []);
                  setEditDocIdx(null);
                  setEditDocItem({
                    url: '',
                    title: '',
                  });
                  setEditingField('docs');
                }}
                className='text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1'
              >
                <svg xmlns='http://www.w3.org/2000/svg' className='h-3 w-3' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                  <path d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' />
                  <path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' />
                </svg>
                编辑
              </button>
            )}
          </div>
          {editingField === 'docs' ? (
            <div>
              <DocList
                value={editDocs}
                onChange={(v) => setEditDocs(v)}
                editingIdx={editDocIdx}
                editItem={editDocItem}
                editFetching={editDocFetching}
                onEditStart={(i) => {
                  setEditDocIdx(i);
                  const doc = editDocs[i];
                  setEditDocItem({
                    url: doc.url || '',
                    title: doc.title && doc.title !== doc.url ? doc.title : '',
                  });
                }}
                onEditChange={(item) => setEditDocItem(item)}
                onEditUrlBlur={async () => {
                  const raw = editDocItem.url.trim();
                  if (!raw) return;
                  const parsed = parseInputText(raw);
                  const url = parsed.url;
                  // titleFromFormat: 仅从 URL 文本格式本身提取（如 [标题](url) 格式）
                  const titleFromFormat = parsed.title || '';
                  if (url !== raw) {
                    setEditDocItem(prev => ({
                      ...prev,
                      url,
                      title: titleFromFormat ? titleFromFormat : prev.title,
                    }));
                  }
                  // 只要是 http 链接且格式中没有嵌入标题，就去解析（不管当前 title 字段是否有值）
                  if (url && url.startsWith('http') && !titleFromFormat) {
                    setEditDocFetching(true);
                    const fetched = await parseUrlTitle(url);
                    if (fetched) {
                      setEditDocItem(prev => ({ ...prev, title: fetched }));
                    }
                    setEditDocFetching(false);
                  }
                }}
                onEditSave={() => {
                  const url = editDocItem.url.trim();
                  if (!url) return;
                  const updated = editDocs.map((doc, i) =>
                    i === editDocIdx
                      ? { url, title: editDocItem.title.trim() || url }
                      : doc,
                  );
                  setEditDocs(updated);
                  setEditDocIdx(null);
                  setEditDocItem({ url: '', title: '' });
                  handleFieldSave({ key_docs: updated });
                }}
                onEditCancel={() => {
                  setEditDocIdx(null);
                  setEditDocItem({ url: '', title: '' });
                }}
                onCancel={() => {
                  setEditingField(null);
                  setEditDocIdx(null);
                  setEditDocItem({ url: '', title: '' });
                }}
                onAutoSave={(docs) => {
                  handleFieldSave({ key_docs: docs });
                }}
              />
            </div>
          ) : (currentTask.key_docs || []).length > 0 ? (
            <div className='space-y-1.5'>
              {(currentTask.key_docs || []).map((doc, i) => (
                <a key={i} href={doc.url} target='_blank' rel='noopener noreferrer' className='flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors group'>
                  <Link2 className='h-3.5 w-3.5 text-gray-400 flex-shrink-0' />
                  <span className='flex-1 text-xs text-blue-500 truncate'>{doc.title && doc.title !== doc.url ? doc.title : doc.url}</span>
                  <ExternalLink className='h-3.5 w-3.5 text-gray-400 opacity-0 group-hover:opacity-100 flex-shrink-0' />
                </a>
              ))}
            </div>
          ) : (
            <p className='text-xs text-gray-300 italic'>暂无文档，点击编辑添加</p>
          )}
        </div>

        {/* 四、子任务 */}
        <div className='px-4 py-4 border-b border-gray-50'>
          <p className='text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider'>
            子任务{' '}
            {subTasks.length > 0 && (
              <span className='text-gray-400 normal-case font-normal'>
                ({subTasks.filter((t) => t.status === 'done').length}/{subTasks.length})
              </span>
            )}
          </p>
          {subTasks.length > 0 && (
            <div className='space-y-1 mb-3'>
              {subTasks.map((st, __dnd_i) => {
                const stGroup = st.group_id ? groups.find((g) => g.id === st.group_id) : null;
                return (
                  <div key={st.id} className='flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition-colors' onClick={() => { setTaskStack((s) => [...s, currentTask]); setCurrentTask(st); setSubTasks(tasks.filter((t) => t.parent_id === st.id)); setComments([]); }}>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS[st.status]?.dot || ''}`} />
                    <span className={`flex-1 text-sm ${st.status === 'done' ? 'line-through text-gray-400' : 'text-gray-800'}`}>{st.title}</span>
                    {stGroup && (
                      <span className='text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0' style={groupPillStyle(stGroup.color)}>
                        {stGroup.name}
                      </span>
                    )}
                    <span className='text-xs text-gray-400 flex-shrink-0'>{STATUS[st.status]?.label}</span>
                    <ChevronRight className='w-3.5 h-3.5 text-gray-300 flex-shrink-0' />
                  </div>
                );
              })}
            </div>
          )}
          {isAddingSubTask ? (
            <SubTaskQuickCreate
              parentTask={currentTask}
              onCreated={() => {
                setIsAddingSubTask(false);
                onRefresh();
              }}
              onCancel={() => setIsAddingSubTask(false)}
            />
          ) : (
            <button
              type='button'
              onClick={() => setIsAddingSubTask(true)}
              className='w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-gray-200 rounded-lg text-sm text-gray-400 hover:border-gray-300 hover:text-gray-500 transition-colors'
            >
              <Plus className='h-4 w-4' /> 添加子任务
            </button>
          )}
        </div>

        {/* 五、关联备忘（双向，始终显示入口） */}
        <LinkedMemosSection
          taskId={currentTask.id}
          memoIds={currentTask.related_memo_ids || []}
          onRefresh={onRefresh}
          task={currentTask}
          comments={comments}
          onGoToMemo={onGoToMemo}
        />

        {/* 六、动态评论 */}
        <div className='px-4 py-4'>
          <p className='text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider'>动态 {comments.length > 0 && <span className='text-gray-400 normal-case font-normal'>({comments.length})</span>}</p>

          {/* 评论列表 */}
          {comments.length > 0 && (
            <div className='space-y-3 mb-4'>
              {comments.map((c, __dnd_i) => {
                const isEditingThis = editingCommentId === c.id;
                return (
                  <div key={c.id} className={`group rounded-xl transition-colors ${isEditingThis ? 'bg-gray-50 border border-gray-200 p-3' : 'flex gap-2.5'}`}>
                    {isEditingThis ? (
                      /* ── 编辑模式 ── */ <div>
                        {/* 类型选择 */}
                        <div className='flex gap-1.5 mb-2'>
                          {Object.entries(commentTypeConfig).map(([key, cfg], __dnd_i) => (
                            <button
                              key={key}
                              type='button'
                              onClick={() => setEditingCommentType(key)}
                              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${editingCommentType === key ? 'border-transparent text-[#2d4a00]' : 'border-gray-200 text-gray-500 bg-white'}`}
                              style={
                                editingCommentType === key
                                  ? {
                                      backgroundColor: '#bbea3b',
                                    }
                                  : {}
                              }
                            >
                              {cfg.label}
                            </button>
                          ))}
                        </div>
                        {/* 富文本编辑器 */}
                        <div className='bg-white rounded-lg overflow-hidden mb-2'>
                          <RichEditor key={`edit-comment-${c.id}`} value={editingCommentContent} onChange={setEditingCommentContent} placeholder='编辑内容...' />
                        </div>
                        {/* 操作按钮 */}
                        <div className='flex justify-end gap-2'>
                          <button type='button' onClick={handleCancelEditComment} className='text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors'>
                            取消
                          </button>
                          <button
                            type='button'
                            onClick={handleSaveEditComment}
                            disabled={isCommentEmpty(editingCommentContent)}
                            className='text-xs px-3 py-1.5 rounded-lg text-[#2d4a00] disabled:opacity-40 transition-colors'
                            style={{
                              backgroundColor: '#bbea3b',
                            }}
                          >
                            保存
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ── 展示模式 ── */ <>
                        <div className='w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5'>
                          {c.comment_type === 'progress' ? <TrendingUp className='h-3 w-3 text-blue-500' /> : c.comment_type === 'issue' ? <Flag className='h-3 w-3 text-red-400' /> : <MessageSquare className='h-3 w-3 text-gray-400' />}
                        </div>
                        <div className='flex-1 min-w-0 overflow-hidden'>
                          <div className='flex items-center gap-2 mb-1'>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${commentTypeConfig[c.comment_type]?.bg || ''}`}>{commentTypeConfig[c.comment_type]?.label}</span>
                            <span className='text-[10px] text-gray-400'>
                              {new Date(c.created_at).toLocaleString('zh-CN', {
                                month: 'numeric',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            {/* 编辑 & 删除按钮 */}
                            <div className='ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity'>
                              <button onClick={() => handleStartEditComment(c)} className='text-gray-300 hover:text-gray-500 active:text-blue-500 p-0.5 rounded' title='编辑'>
                                <svg xmlns='http://www.w3.org/2000/svg' className='h-3.5 w-3.5' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2' strokeLinecap='round' strokeLinejoin='round'>
                                  <path d='M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' />
                                  <path d='M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' />
                                </svg>
                              </button>
                              <button onClick={() => handleDeleteComment(c.id)} className='text-gray-300 hover:text-red-400 active:text-red-500 p-0.5 rounded' title='删除'>
                                <Trash2 className='h-3.5 w-3.5' />
                              </button>
                            </div>
                          </div>
                          <div
                            className='rich-content text-sm'
                            dangerouslySetInnerHTML={{
                              __html: c.content,
                            }}
                          />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              <div ref={commentEndRef} />
            </div>
          )}

          {/* 评论输入 */}
          <div className='bg-gray-50 rounded-xl p-3'>
            <div className='bg-white rounded-lg overflow-hidden'>
              <RichEditor key={`comment-editor-${currentTask.id}-${editorKey}`} value={newComment} onChange={setNewComment} placeholder='添加评论或进展，支持富文本格式...' />
            </div>

            {/* 同步更新至备忘 */}
            {(() => {
              const relatedMemoIds = currentTask.related_memo_ids || [];
              if (relatedMemoIds.length === 0) return null;
              return (
                <div className='mt-2 flex flex-wrap items-center gap-2'>
                  <label className='flex items-center gap-1.5 cursor-pointer select-none'>
                    <input
                      type='checkbox'
                      className='w-3.5 h-3.5 rounded accent-[#bbea3b] cursor-pointer'
                      checked={syncToMemo}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setSyncToMemo(checked);
                        if (checked && relatedMemoIds.length === 1) {
                          setSyncMemoId(relatedMemoIds[0]);
                        } else if (!checked) {
                          setSyncMemoId(null);
                        }
                      }}
                    />
                    <span className='text-xs text-gray-500'>同步更新至备忘</span>
                  </label>

                  {/* 多个备忘时显示下拉选择 */}
                  {syncToMemo && relatedMemoIds.length > 1 && (
                    <SyncMemoSelector
                      memoIds={relatedMemoIds}
                      value={syncMemoId}
                      onChange={setSyncMemoId}
                    />
                  )}
                  {syncToMemo && relatedMemoIds.length === 1 && (
                    <SyncMemoName memoId={relatedMemoIds[0]} />
                  )}
                </div>
              );
            })()}

            <div className='flex justify-end mt-2'>
              <Button
                type='button'
                onClick={handleSendComment}
                disabled={isCommentEmpty(newComment) || (syncToMemo && !syncMemoId)}
                size='sm'
                className='h-8 px-4 text-xs'
                style={{
                  backgroundColor: '#bbea3b',
                  color: '#2d4a00',
                }}
              >
                <Send className='h-3.5 w-3.5 mr-1.5' />
                发送
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; // ─── 列配置定义 ──────────────────────────────────────────────────

const ALL_COLUMNS = [
  {
    key: 'status',
    label: '状态',
    defaultOn: true,
  },
  {
    key: 'priority',
    label: '优先级',
    defaultOn: true,
  },
  {
    key: 'importance',
    label: '重要性',
    defaultOn: false,
  },
  {
    key: 'urgency',
    label: '紧急度',
    defaultOn: false,
  },
  {
    key: 'due_date',
    label: '截止日期',
    defaultOn: true,
  },
  {
    key: 'plan_date',
    label: '计划日期',
    defaultOn: true,
  },
  {
    key: 'owner',
    label: '主R',
    defaultOn: true,
  },
  {
    key: 'supporter',
    label: '主S',
    defaultOn: true,
  },
  {
    key: 'tags',
    label: '标签',
    defaultOn: true,
  },
  {
    key: 'docs',
    label: '文档',
    defaultOn: true,
  },
  {
    key: 'latest_comment',
    label: '最新动态',
    defaultOn: true,
  },
  {
    key: 'related_member',
    label: '关联人',
    defaultOn: false,
  },
  {
    key: 'predecessors',
    label: '前置任务',
    defaultOn: false,
  },
  {
    key: 'successors',
    label: '后置任务',
    defaultOn: false,
  },
];

const COL_STORAGE_KEY = 'task_list_columns_v1';

function loadColumnConfig() {
  try {
    const raw = localStorage.getItem(COL_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return ALL_COLUMNS.reduce(
    (acc, c) => ({
      ...acc,
      [c.key]: c.defaultOn,
    }),
    {},
  );
}

function saveColumnConfig(cfg) {
  localStorage.setItem(COL_STORAGE_KEY, JSON.stringify(cfg));
} // ─── ColumnConfigPanel ────────────────────────────────────────────

const ColumnConfigPanel = ({ colConfig, onChange, onClose }) => (
  <div className='absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-50 p-3 w-52'>
    <div className='flex items-center justify-between mb-2'>
      <span className='text-xs font-medium text-gray-700'>显示列配置</span>
      <button onClick={onClose} className='text-gray-400 hover:text-gray-600'>
        <X className='h-3.5 w-3.5' />
      </button>
    </div>
    <div className='space-y-1'>
      {ALL_COLUMNS.map((col, __dnd_i) => (
        <label key={col.key} className='flex items-center gap-2 px-1 py-1 rounded hover:bg-gray-50 cursor-pointer'>
          <input
            type='checkbox'
            checked={!!colConfig[col.key]}
            onChange={(e) =>
              onChange({
                ...colConfig,
                [col.key]: e.target.checked,
              })
            }
            className='w-3.5 h-3.5 accent-[#bbea3b]'
          />
          <span className='text-xs text-gray-700'>{col.label}</span>
        </label>
      ))}
    </div>
    <button
      onClick={() =>
        onChange(
          ALL_COLUMNS.reduce(
            (acc, c) => ({
              ...acc,
              [c.key]: c.defaultOn,
            }),
            {},
          ),
        )
      }
      className='mt-2 w-full text-xs text-gray-400 hover:text-gray-600 underline text-center'
    >
      恢复默认
    </button>
  </div>
); // ─── TaskTableRow ─────────────────────────────────────────────────

const TaskTableRow = ({ task, subTasks, members, tags, groups, tasks = [], isExpanded, onToggle, onSelect, isSelected, depth = 0, colConfig, latestComments }) => {
const ownerList = (task.owner_ids || []).map((id) => members.find((m) => m.id === id)).filter(Boolean);
const supporterList = (task.supporter_ids || []).map((id) => members.find((m) => m.id === id)).filter(Boolean);
const relatedMemberList = (task.related_member_ids || []).map((id) => members.find((m) => m.id === id)).filter(Boolean);
const predecessorList = (task.predecessor_ids || []).map((id) => tasks.find((t) => t.id === id)).filter(Boolean);
const successorList = (task.successor_ids || []).map((id) => tasks.find((t) => t.id === id)).filter(Boolean);
const taskTags = tags.filter((t) => (task.tag_ids || []).includes(t.id));
  const taskGroup = task.group_id ? groups.find((g) => g.id === task.group_id) : null;
  const latestComment = latestComments?.[task.id];
  const commentTypeLabel = {
    comment: '评论',
    progress: '进展',
    issue: '问题',
  };
  return (
    <>
      <tr
        onClick={() => onSelect(task)}
        className={`cursor-pointer transition-colors border-b border-gray-50 ${isSelected ? 'bg-[#f5fce8]' : 'hover:bg-gray-50'}`}
        style={
          isSelected
            ? {
                boxShadow: 'inset 3px 0 0 #bbea3b',
              }
            : {}
        }
      >
        <td className='py-3 px-4'>
          <div
            className='flex items-center gap-1.5'
            style={{
              paddingLeft: depth * 20,
            }}
          >
            {subTasks.length > 0 ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(task.id);
                }}
                className='flex-shrink-0 text-gray-400 hover:text-gray-600'
              >
                <ChevronDown className={`h-4 w-4 ${isExpanded ? '' : '-rotate-90'}`} />
              </button>
            ) : (
              <span className='w-4 flex-shrink-0' />
            )}
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS[task.status]?.dot || ''}`} />
            <div className='min-w-0 flex-1 flex items-center gap-1.5'>
              <span className={`text-sm font-medium truncate ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</span>
              {task.need_report && (
                <span className='flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200'>
                  <Megaphone className='h-2.5 w-2.5' />
                  汇报
                </span>
              )}
            </div>
            {subTasks.length > 0 && (
              <span className='text-[10px] text-gray-400 flex-shrink-0'>
                {subTasks.filter((t) => t.status === 'done').length}/{subTasks.length}
              </span>
            )}
          </div>
        </td>
        {colConfig?.status && (
          <td className='py-3 px-3 whitespace-nowrap'>
            <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS[task.status]?.bg || ''}`}>{STATUS[task.status]?.label}</span>
          </td>
        )}
        {colConfig?.priority && (
          <td className='py-3 px-3'>
            <span className={`text-xs ${PRIORITY[task.priority]?.color || ''}`}>
              <Flag className='h-3 w-3 inline mr-0.5' />
              {PRIORITY[task.priority]?.label}
            </span>
          </td>
        )}
        {colConfig?.importance && (
          <td className='py-3 px-3 whitespace-nowrap'>
            {task.importance === 'critical' ? <span className='text-xs text-red-500 font-medium'>非常重要</span> : task.importance === 'important' ? <span className='text-xs text-orange-500'>重要</span> : <span className='text-xs text-gray-400'>一般</span>}
          </td>
        )}
        {colConfig?.urgency && <td className='py-3 px-3 whitespace-nowrap'>{task.urgency === 'urgent' ? <span className='text-xs text-red-500 font-medium'>紧急</span> : <span className='text-xs text-gray-400'>一般</span>}</td>}
{colConfig?.due_date && <td className='py-3 px-3 whitespace-nowrap'>{task.due_date ? <span className={`text-xs flex items-center gap-1 ${getDateStyle(task.due_date)}`}>{getDateLabel(task.due_date)}{isOverdue(task.due_date) && <span className='text-[10px] bg-red-100 text-red-500 px-1 rounded'>（过期）</span>}</span> : <span className='text-gray-300 text-xs'>—</span>}</td>}
{colConfig?.plan_date && <td className='py-3 px-3 whitespace-nowrap'>{task.plan_date ? <span className={`text-xs flex items-center gap-1 ${getDateStyle(task.plan_date)}`}>{getDateLabel(task.plan_date)}{isOverdue(task.plan_date) && <span className='text-[10px] bg-red-100 text-red-500 px-1 rounded'>（过期）</span>}</span> : <span className='text-gray-300 text-xs'>—</span>}</td>}
        {colConfig?.owner && (
          <td className='py-3 px-3 whitespace-nowrap'>
            {ownerList.length > 0 ? (
              <div className='flex flex-wrap gap-1'>
                {ownerList.map((m, __dnd_i) => (
                  <div key={m.id} className='flex items-center gap-1'>
                    <div
                      className='w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0'
                      style={{
                        backgroundColor: '#5a7a00',
                      }}
                    >
                      {m.name.slice(0, 1)}
                    </div>
                    <span className='text-xs text-gray-700'>{m.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className='text-gray-300 text-xs'>—</span>
            )}
          </td>
        )}
        {colConfig?.supporter && (
          <td className='py-3 px-3 whitespace-nowrap'>
            {supporterList.length > 0 ? (
              <div className='flex flex-wrap gap-1'>
                {supporterList.map((m, __dnd_i) => (
                  <div key={m.id} className='flex items-center gap-1'>
                    <div
                      className='w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0'
                      style={{
                        backgroundColor: '#84cc16',
                      }}
                    >
                      {m.name.slice(0, 1)}
                    </div>
                    <span className='text-xs text-gray-700'>{m.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className='text-gray-300 text-xs'>—</span>
            )}
          </td>
        )}
        {colConfig?.tags && (
          <td className='py-3 px-3'>
            <div className='flex flex-wrap gap-1 max-w-[150px]'>
              {taskTags.slice(0, 2).map((t, __dnd_i) => (
                <span
                  key={t.id}
                  className='text-[10px] px-1.5 py-0.5 rounded-full whitespace-nowrap'
                  style={{
                    backgroundColor: `${t.color}22`,
                    color: t.color,
                  }}
                >
                  {t.name}
                </span>
              ))}
              {taskTags.length > 2 && <span className='text-[10px] text-gray-400'>+{taskTags.length - 2}</span>}
            </div>
          </td>
        )}
        {colConfig?.docs && (
          <td className='py-3 px-3'>
            {(task.key_docs || []).length > 0 ? (
              <span className='text-xs text-blue-500 flex items-center gap-0.5'>
                <Link2 className='h-3 w-3' />
                {task.key_docs.length}
              </span>
            ) : (
              <span className='text-gray-300 text-xs'>—</span>
            )}
          </td>
        )}
        {colConfig?.latest_comment && (
          <td className='py-3 px-3 max-w-[220px]'>
            {latestComment ? (
              <div className='flex items-center gap-1.5 min-w-0'>
                <span className='text-[10px] text-gray-400 flex-shrink-0'>
                  {new Date(latestComment.created_at).toLocaleDateString('zh-CN', {
                    month: 'numeric',
                    day: 'numeric',
                  })}
                </span>
                <p className='text-xs text-gray-600 truncate'>{latestComment.content.replace(/<[^>]*>/g, '').trim() || '（富文本内容）'}</p>
              </div>
            ) : (
              <span className='text-gray-300 text-xs'>—</span>
            )}
          </td>
        )}
        {colConfig?.related_member && (
          <td className='py-3 px-3 whitespace-nowrap'>
            {relatedMemberList.length > 0 ? (
              <div className='flex flex-wrap gap-1'>
                {relatedMemberList.map((m) => (
                  <div key={m.id} className='flex items-center gap-1'>
                    <div className='w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium text-white flex-shrink-0' style={{ backgroundColor: '#7c3aed' }}>
                      {m.name.slice(0, 1)}
                    </div>
                    <span className='text-xs text-gray-700'>{m.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className='text-gray-300 text-xs'>—</span>
            )}
          </td>
        )}
        {colConfig?.predecessors && (
          <td className='py-3 px-3 max-w-[180px]'>
            {predecessorList.length > 0 ? (
              <div className='flex flex-wrap gap-1'>
                {predecessorList.map((t) => (
                  <span key={t.id} className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-blue-50 text-blue-700 border border-blue-100 max-w-[120px]'>
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS[t.status]?.dot || 'bg-gray-300'}`} />
                    <span className='truncate'>{t.title}</span>
                  </span>
                ))}
              </div>
            ) : (
              <span className='text-gray-300 text-xs'>—</span>
            )}
          </td>
        )}
        {colConfig?.successors && (
          <td className='py-3 px-3 max-w-[180px]'>
            {successorList.length > 0 ? (
              <div className='flex flex-wrap gap-1'>
                {successorList.map((t) => (
                  <span key={t.id} className='inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] bg-green-50 text-green-700 border border-green-100 max-w-[120px]'>
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS[t.status]?.dot || 'bg-gray-300'}`} />
                    <span className='truncate'>{t.title}</span>
                  </span>
                ))}
              </div>
            ) : (
              <span className='text-gray-300 text-xs'>—</span>
            )}
          </td>
        )}
      </tr>
      {isExpanded &&
        subTasks.map((st, __dnd_i) => <TaskTableRow key={st.id} task={st} subTasks={[]} members={members} tags={tags} groups={groups} tasks={tasks} isExpanded={false} onToggle={() => {}} onSelect={onSelect} isSelected={false} depth={depth + 1} colConfig={colConfig} latestComments={latestComments} />)}
    </>
  );
}; // ─── TaskMobileItem ───────────────────────────────────────────────

const TaskMobileItem = ({ task, members, tags, groups, onSelect, isSelected }) => {
  const ownerList = (task.owner_ids || []).map((id) => members.find((m) => m.id === id)).filter(Boolean);
  const taskTags = tags.filter((t) => (task.tag_ids || []).includes(t.id));
  const taskGroup = task.group_id ? groups.find((g) => g.id === task.group_id) : null;
  return (
    <div
      onClick={() => onSelect(task)}
      className={`flex items-start gap-3 px-4 py-3 border-b border-gray-50 cursor-pointer transition-colors ${isSelected ? 'bg-[#f5fce8] border-l-2' : 'hover:bg-gray-50 active:bg-gray-50'}`}
      style={
        isSelected
          ? {
              borderLeftColor: '#bbea3b',
            }
          : {}
      }
    >
      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${STATUS[task.status]?.dot || ''}`} />
      <div className='flex-1 min-w-0'>
        <div className='flex items-center gap-1.5'>
          <p className={`text-sm truncate flex-1 min-w-0 ${task.status === 'done' ? 'line-through text-gray-400' : 'text-gray-900'}`}>{task.title}</p>
          {task.need_report && (
            <span className='flex-shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 border border-orange-200'>
              <Megaphone className='h-2.5 w-2.5' />
              汇报
            </span>
          )}
        </div>
        <div className='flex flex-wrap items-center gap-2 mt-1'>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${STATUS[task.status]?.bg || ''}`}>{STATUS[task.status]?.label}</span>
          {task.due_date && <span className={`text-[10px] flex items-center gap-0.5 ${getDateStyle(task.due_date)}`}>截止 {getDateLabel(task.due_date)}{isOverdue(task.due_date) && <span className='bg-red-100 text-red-500 px-0.5 rounded'>（过期）</span>}</span>}
          {ownerList.length > 0 && <span className='text-[10px] text-gray-400'>{ownerList.map((m) => m.name).join(', ')}</span>}
          {taskTags.slice(0, 2).map((t, __dnd_i) => (
            <span
              key={t.id}
              className='text-[10px] px-1.5 py-0.5 rounded-full'
              style={{
                backgroundColor: `${t.color}22`,
                color: t.color,
              }}
            >
              {t.name}
            </span>
          ))}
        </div>
      </div>
      <Flag className={`h-3.5 w-3.5 flex-shrink-0 mt-1 ${PRIORITY[task.priority]?.color || ''}`} />
    </div>
  );
}; // ─── MobileGroupSection ───────────────────────────────────────────

const MobileGroupSection = ({ group, tasks, members, tags, groups, onSelect, selectedTask, defaultExpanded = true }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const groupTasks = group
    ? tasks.filter((t) => t.group_id === group.id && !t.parent_id)
    : tasks.filter((t) => !t.group_id && !t.parent_id);
  if (groupTasks.length === 0) return null;
  const accentColor = group?.color || '#9ca3af';
  return (
    <div className='mb-2 mx-3 rounded-xl overflow-hidden shadow-sm border border-gray-100'>
      {/* 分组头部 */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className='w-full flex items-center gap-2.5 px-3 py-3 active:opacity-80 transition-opacity'
        style={{ backgroundColor: `${accentColor}18` }}
      >
        {/* 左侧色条 */}
        <span className='w-1 h-5 rounded-full flex-shrink-0' style={{ backgroundColor: accentColor }} />
        {group ? (
          <span className='w-2.5 h-2.5 rounded-full flex-shrink-0' style={{ backgroundColor: group.color }} />
        ) : (
          <FolderOpen className='h-3.5 w-3.5 text-gray-400 flex-shrink-0' />
        )}
        <span className='text-xs font-bold flex-1 text-left truncate' style={{ color: accentColor === '#9ca3af' ? '#374151' : accentColor }}>
          {group ? group.name : '未分组'}
        </span>
        <span
          className='text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 font-medium'
          style={{ backgroundColor: `${accentColor}28`, color: accentColor === '#9ca3af' ? '#6b7280' : accentColor }}
        >
          {groupTasks.length} 项
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`}
          style={{ color: accentColor }}
        />
      </button>
      {/* 任务列表 */}
      {expanded && (
        <div className='bg-white divide-y divide-gray-50'>
          {groupTasks.map((task) => (
            <TaskMobileItem
              key={task.id}
              task={task}
              members={members}
              tags={tags}
              groups={groups}
              onSelect={onSelect}
              isSelected={selectedTask?.id === task.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}; // ─── FilterBar ────────────────────────────────────────────────────

const FilterBar = ({ searchTerm, setSearchTerm, filterStatus, setFilterStatus, filterPriority, setFilterPriority, filterOwner, setFilterOwner, filterTag, setFilterTag, filterGroup, setFilterGroup, filterDate, setFilterDate, filterNeedReport, setFilterNeedReport, hideCompleted, setHideCompleted, members, tags, groups, showFilterPanel, setShowFilterPanel }) => {
const hasFilter = filterStatus !== 'all' || filterPriority !== 'all' || filterOwner !== 'all' || filterTag !== 'all' || filterGroup !== 'all' || filterDate !== 'all' || filterNeedReport !== 'all' || hideCompleted;
  return (
    <div className='bg-white border-b border-gray-100 flex-shrink-0'>
      <div className='flex items-center gap-2 px-4 py-2.5'>
        <div className='relative flex-1'>
          <Search className='h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400' />
          <Input value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder='搜索任务...' className='pl-9 h-9 bg-gray-50 border-0 text-sm' />
        </div>
        <button
          onClick={() => setShowFilterPanel((v) => !v)}
          className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm border transition-colors flex-shrink-0 ${hasFilter ? 'text-[#2d4a00] border-transparent' : 'text-gray-500 border-gray-200 bg-white'}`}
          style={hasFilter ? { backgroundColor: '#bbea3b' } : {}}
        >
          <Filter className='h-4 w-4' />
          <span className='hidden sm:inline'>筛选</span>
          {hasFilter && <span className='text-[10px] bg-[#2d4a0033] rounded-full px-1'>已启用</span>}
        </button>
      </div>
      {/* 快捷筛选：状态 + 隐藏完成 | 日期 | 需要汇报，全部在一行 */}
      <div className='flex items-center gap-1 px-4 pb-2.5 overflow-x-auto scrollbar-none'>
        {/* 状态筛选 */}
        {[
          ['all', '全部'],
          ['todo', '待办'],
          ['in_progress', '进行中'],
          ['done', '已完成'],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilterStatus(v)}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors flex-shrink-0 ${filterStatus === v ? 'text-[#2d4a00] font-medium' : 'bg-gray-100 text-gray-500'}`}
            style={filterStatus === v ? { backgroundColor: '#bbea3b' } : {}}
          >
            {l}
          </button>
        ))}
        {/* 隐藏完成（与状态同组，无竖线） */}
        <button
          onClick={() => setHideCompleted((v) => !v)}
          className={`text-xs px-2.5 py-1 rounded-full transition-colors flex-shrink-0 ${hideCompleted ? 'text-[#2d4a00] font-medium' : 'bg-gray-100 text-gray-500'}`}
          style={hideCompleted ? { backgroundColor: '#bbea3b' } : {}}
        >
          隐藏完成
        </button>
        {/* 隐藏完成之后的分隔符 */}
        <span className='flex-shrink-0 w-px h-4 bg-gray-200 mx-1' />
        {/* 日期筛选 */}
        {[
          ['today', '今日'],
          ['3days', '近3日'],
          ['week', '本周'],
        ].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilterDate(filterDate === v ? 'all' : v)}
            className={`text-xs px-2.5 py-1 rounded-full transition-colors flex-shrink-0 ${filterDate === v ? 'text-[#2d4a00] font-medium' : 'bg-gray-100 text-gray-500'}`}
            style={filterDate === v ? { backgroundColor: '#bbea3b' } : {}}
          >
            {l}
          </button>
        ))}
        {/* 分隔符 */}
        <span className='flex-shrink-0 w-px h-4 bg-gray-200 mx-1' />
        {/* 需要汇报 */}
        <button
          onClick={() => setFilterNeedReport(filterNeedReport === 'yes' ? 'all' : 'yes')}
          className={`text-xs px-2.5 py-1 rounded-full transition-colors flex-shrink-0 ${filterNeedReport === 'yes' ? 'text-[#2d4a00] font-medium' : 'bg-gray-100 text-gray-500'}`}
          style={filterNeedReport === 'yes' ? { backgroundColor: '#bbea3b' } : {}}
        >
          需要汇报
        </button>
      </div>
      {showFilterPanel && (
        <div className='px-4 pb-3 border-t border-gray-50 pt-2.5 grid grid-cols-2 md:grid-cols-5 gap-3'>
          <div>
            <label className='text-xs text-gray-400 mb-1 block'>优先级</label>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className='h-8 text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部</SelectItem>
                <SelectItem value='high'>高</SelectItem>
                <SelectItem value='medium'>中</SelectItem>
                <SelectItem value='low'>低</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className='text-xs text-gray-400 mb-1 block'>主R</label>
            <Select value={filterOwner} onValueChange={setFilterOwner}>
              <SelectTrigger className='h-8 text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部</SelectItem>
                <SelectItem value='none'>未分配</SelectItem>
                {members.map((m, __dnd_i) => (
                  <SelectItem key={m.id} value={m.id.toString()}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className='text-xs text-gray-400 mb-1 block'>标签</label>
            <Select value={filterTag} onValueChange={setFilterTag}>
              <SelectTrigger className='h-8 text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部</SelectItem>
                {tags.map((t, __dnd_i) => (
                  <SelectItem key={t.id} value={t.id.toString()}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className='text-xs text-gray-400 mb-1 block'>分组</label>
            <Select value={filterGroup} onValueChange={setFilterGroup}>
              <SelectTrigger className='h-8 text-xs'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>全部</SelectItem>
                <SelectItem value='none'>未分组</SelectItem>
                {groups.map((g, __dnd_i) => (
                  <SelectItem key={g.id} value={g.id.toString()}>
                    {g.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='flex items-end'>
            <button
              onClick={() => {
                setFilterStatus('all');
                setFilterPriority('all');
                setFilterOwner('all');
                setFilterTag('all');
                setFilterGroup('all');
                setFilterDate('all');
                setFilterNeedReport('all');
                setShowFilterPanel(false);
              }}
              className='text-xs text-gray-400 hover:text-gray-600 underline'
            >
              清除筛选
            </button>
          </div>
        </div>
      )}
    </div>
  );
}; // ─── TableHeader ──────────────────────────────────────────────────

const TableHeader = ({ colConfig }) => (
  <tr className='border-b border-gray-200 text-xs text-gray-500 font-medium'>
    <th className='py-2.5 px-4 w-[240px] whitespace-nowrap'>任务名称</th>
    {colConfig?.status && <th className='py-2.5 px-3 whitespace-nowrap'>状态</th>}
    {colConfig?.priority && <th className='py-2.5 px-3 whitespace-nowrap'>优先级</th>}
    {colConfig?.importance && <th className='py-2.5 px-3 whitespace-nowrap'>重要性</th>}
    {colConfig?.urgency && <th className='py-2.5 px-3 whitespace-nowrap'>紧急度</th>}
    {colConfig?.due_date && <th className='py-2.5 px-3 whitespace-nowrap'>截止日期</th>}
    {colConfig?.plan_date && <th className='py-2.5 px-3 whitespace-nowrap'>计划日期</th>}
    {colConfig?.owner && <th className='py-2.5 px-3 whitespace-nowrap'>主R</th>}
    {colConfig?.supporter && <th className='py-2.5 px-3 whitespace-nowrap'>主S</th>}
    {colConfig?.tags && <th className='py-2.5 px-3 whitespace-nowrap'>标签</th>}
    {colConfig?.docs && <th className='py-2.5 px-3 whitespace-nowrap'>文档</th>}
    {colConfig?.latest_comment && <th className='py-2.5 px-3 whitespace-nowrap'>最新动态</th>}
    {colConfig?.related_member && <th className='py-2.5 px-3 whitespace-nowrap'>关联人</th>}
    {colConfig?.predecessors && <th className='py-2.5 px-3 whitespace-nowrap'>前置任务</th>}
    {colConfig?.successors && <th className='py-2.5 px-3 whitespace-nowrap'>后置任务</th>}
  </tr>
); // ─── GroupSection ─────────────────────────────────────────────────

const GroupSection = ({ group, tasks, getSubTasks, expandedTasks, toggleExpand, selectedTask, handleSelectTask, members, tags, groups, colConfig, latestComments }) => {
  const groupTasks = tasks.filter((t) => t.group_id === group.id && !t.parent_id);
  if (groupTasks.length === 0) return null;
  return (
    <div className='bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm'>
      <div className='flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/70'>
        <span
          className='w-3 h-3 rounded-full'
          style={{
            backgroundColor: group.color,
          }}
        />
        <span className='text-sm font-semibold text-gray-900'>{group.name}</span>
        <span className='text-xs text-gray-400'>{groupTasks.length} 项</span>
      </div>
      <div className='overflow-auto'>
        <table className='w-full text-left min-w-[700px]'>
          <thead className='sticky top-0 bg-gray-50 z-10'>
            <TableHeader colConfig={colConfig} />
          </thead>
          <tbody>
            {groupTasks.map((task, __dnd_i) => (
              <TaskTableRow
                key={task.id}
                task={task}
                subTasks={getSubTasks(task.id)}
                members={members}
                tags={tags}
                groups={groups}
                tasks={tasks}
                isExpanded={expandedTasks.has(task.id)}
                onToggle={toggleExpand}
                onSelect={handleSelectTask}
                isSelected={selectedTask?.id === task.id}
                colConfig={colConfig}
                latestComments={latestComments}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}; // ─── PC 抽屉 ──────────────────────────────────────────────────────

const PcTaskDrawer = ({ open, mode, selectedTask, tasks, members, tags, groups, onClose, onRefresh, onOptimisticAdd, onMemberAdded, onGroupAssigned, onGoToConfig, onGoToMemo }) => (
  <>
    <div className={`hidden md:block fixed inset-0 bg-black/20 transition-opacity duration-300 z-30 ${open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} onClick={onClose} />
    <div className={`hidden md:flex fixed top-0 right-0 h-full w-[46vw] max-w-[760px] min-w-[520px] bg-white shadow-[-18px_0_48px_rgba(15,23,42,0.18)] border-l border-gray-100 z-40 transform transition-transform duration-300 ease-out flex-col ${open ? 'translate-x-0' : 'translate-x-full'}`}>
      {mode === 'create' ? (
        <>
          <div className='flex items-center gap-3 px-6 h-14 border-b border-gray-100 flex-shrink-0'>
            <span className='text-sm font-medium text-gray-900'>新建任务</span>
            <button onClick={onClose} className='ml-auto text-gray-400 hover:text-gray-600'>
              <X className='h-4 w-4' />
            </button>
          </div>
          <div className='flex-1 overflow-y-auto px-6 py-5 min-h-0'>
            <TaskForm
              tasks={tasks}
              members={members}
              tags={tags}
              groups={groups}
              onSave={async (form) => {
                const id = genId();
                const { importance, urgency, owner_ids, supporter_ids, related_member_ids, predecessor_ids, successor_ids, create_memo, ...dbForm } = form;
                // 空字符串日期字段转为 null，避免数据库 timestamp 类型报错
                if (dbForm.due_date === '') dbForm.due_date = null;
                if (dbForm.plan_date === '') dbForm.plan_date = null;
                // group_id 直接写入数据库（tasks 表已有 group_id 字段）
                if (dbForm.group_id === undefined) dbForm.group_id = null;
                const newTask = {
                  id,
                  ...dbForm,
                  related_member_ids: related_member_ids || [],
                  predecessor_ids: predecessor_ids || [],
                  successor_ids: successor_ids || [],
                  related_memo_ids: [],
                  created_at: new Date().toISOString(),
                  updated_at: new Date().toISOString(),
                };
                const { error } = await supabase.from('tasks').insert([newTask]);
                if (!error) {
                  // 乐观更新：立即插入本地 state，无需等待全量刷新
                  const extraPatch = {};
                  if (importance && importance !== 'normal') extraPatch.importance = importance;
                  if (urgency && urgency !== 'normal') extraPatch.urgency = urgency;
                  if (owner_ids?.length) extraPatch.owner_ids = owner_ids;
                  if (supporter_ids?.length) extraPatch.supporter_ids = supporter_ids;
                  if (Object.keys(extraPatch).length > 0) setStoredTaskExtra(id, extraPatch);
                  if (dbForm.group_id != null) onGroupAssigned?.(id, dbForm.group_id);
                  onOptimisticAdd?.({ ...newTask, ...extraPatch, owner_ids: owner_ids || [], supporter_ids: supporter_ids || [], importance: importance || 'normal', urgency: urgency || 'normal' });
                  onClose();
                  // 后台异步同步：前置/后置双向关系 + 同步备忘 + 全量刷新
                  (async () => {
                    if (predecessor_ids?.length) {
                      for (const predId of predecessor_ids) {
                        const predTask = tasks.find((t) => t.id === predId);
                        if (predTask) {
                          const newSuccIds = [...new Set([...(predTask.successor_ids || []), id])];
                          await supabase.from('tasks').update({ successor_ids: newSuccIds }).eq('id', predId);
                        }
                      }
                    }
                    if (successor_ids?.length) {
                      for (const succId of successor_ids) {
                        const succTask = tasks.find((t) => t.id === succId);
                        if (succTask) {
                          const newPredIds = [...new Set([...(succTask.predecessor_ids || []), id])];
                          await supabase.from('tasks').update({ predecessor_ids: newPredIds }).eq('id', succId);
                        }
                      }
                    }
                    // 同步创建备忘
                    if (create_memo) {
                      const memoId = genId();
                      await supabase.from('memos').insert([{
                        id: memoId, title: dbForm.title, content: dbForm.description || '',
                        direction: '', related_url: '', related_task_ids: [id], reading_item_id: '',
                        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                      }]);
                      await supabase.from('tasks').update({ related_memo_ids: [memoId] }).eq('id', id);
                    }
                    onRefresh();
                  })();
                } else console.error('创建任务失败:', error);
              }}
              onCancel={onClose}
              onMemberAdded={onMemberAdded}
            />
          </div>
        </>
) : selectedTask ? (
<TaskDetail key={selectedTask.id} task={selectedTask} tasks={tasks} members={members} tags={tags} groups={groups} onBack={onClose} onRefresh={onRefresh} onMemberAdded={onMemberAdded} onGroupAssigned={onGroupAssigned} onCloseDrawer={onClose} drawerMode onGoToConfig={onGoToConfig} onGoToMemo={onGoToMemo} />
) : null}
    </div>
  </>
); // ─── TasksPage ────────────────────────────────────────────────────

const TasksPage = ({ initialTaskId, onInitialTaskConsumed, onGoToMemo, onTasksLoaded } = {}) => {
  const [tasks, setTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [tags, setTags] = useState([]);
  const [groups, setGroups] = useState([]);
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [selectedTask, setSelectedTask] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'kanban'
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterOwner, setFilterOwner] = useState('all');
  const [filterTag, setFilterTag] = useState('all');
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterDate, setFilterDate] = useState('all');
const [filterNeedReport, setFilterNeedReport] = useState('all');
const [hideCompleted, setHideCompleted] = useState(true);
const [showFilterPanel, setShowFilterPanel] = useState(false);
  const [colConfig, setColConfig] = useState(loadColumnConfig);
  const [showColPanel, setShowColPanel] = useState(false);
  const [latestComments, setLatestComments] = useState({});
  useEffect(() => {
    fetchAll();
  }, []);
  const fetchAll = async () => {
    const [taskRes, memberRes, tagRes, groupRes] = await Promise.all([
      supabase.from('tasks').select('*').order('updated_at', { ascending: false }).order('due_date', { ascending: false, nullsFirst: false }),
      supabase.from('task_members').select('*').order('created_at', { ascending: true }),
      supabase.from('task_tags').select('*').order('created_at', { ascending: true }),
      supabase.from('task_groups').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    ]);
    // group_id 已存数据库，直接使用数据库值；仅 importance/urgency/owner_ids/supporter_ids 仍用 localStorage
    const allTasks = applyStoredTaskExtra(taskRes.data || []);
    setTasks(allTasks);
    onTasksLoaded?.(allTasks); // 通知父组件（用于悬浮梳理等）
    // 若有 initialTaskId，自动选中对应任务
    if (initialTaskId) {
      const target = allTasks.find(t => String(t.id) === String(initialTaskId));
      if (target) setSelectedTask(applyStoredTaskExtra([target])[0] || target);
      onInitialTaskConsumed?.();
    }
    setMembers(memberRes.data || []);
    setTags(tagRes.data || []);
    const remoteGroups = groupRes.data || [];
    // 优先使用数据库分组，fallback 到 localStorage（兼容旧数据）
    if (remoteGroups.length > 0) {
      saveStoredTaskGroups(remoteGroups);
      setGroups(remoteGroups);
    } else {
      // 数据库无分组时，尝试从 localStorage 迁移（一次性迁移旧数据）
      const localGroups = getStoredTaskGroups();
      if (localGroups.length > 0) {
        // 将 localStorage 中的分组写入数据库
        supabase.from('task_groups').insert(localGroups.map((g) => ({ id: g.id, name: g.name, color: g.color || '#3b82f6' }))).then(({ error }) => {
          if (!error) {
            // 迁移分组成功后，迁移任务的 group_id 分配
            const assignments = getStoredTaskGroupAssignments ? getStoredTaskGroupAssignments() : {};
            const taskUpdates = Object.entries(assignments).map(([taskId, groupId]) =>
              supabase.from('tasks').update({ group_id: Number(groupId) }).eq('id', Number(taskId))
            );
            Promise.all(taskUpdates).then(() => fetchAll()); // 迁移完成后重新拉取
          }
        });
      }
      setGroups(localGroups);
    }
    // 评论查询不阻塞主流程（fire-and-forget）
    if (allTasks.length > 0) {
      const taskIds = allTasks.map((t) => t.id);
      supabase.from('task_comments').select('*').in('task_id', taskIds).order('created_at', { ascending: false }).then(({ data: commentData }) => {
        if (commentData) {
          const map = {};
          commentData.forEach((c) => { if (!map[c.task_id]) map[c.task_id] = c; });
          setLatestComments(map);
        }
      });
    }
  };
  const fetchMembers = async () => {
    const { data } = await supabase.from('task_members').select('*').order('created_at', {
      ascending: true,
    });
    setMembers(data || []);
  };
  // 同步创建备忘的辅助函数
  const createMemoFromTask = async (taskId, taskTitle, taskDescription) => {
    const memoId = genId();
    const content = taskDescription || '';
    await supabase.from('memos').insert([{
      id: memoId,
      title: taskTitle,
      content,
      direction: '',
      related_url: '',
      related_task_ids: [taskId],
      reading_item_id: '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }]);
    // 更新任务的 related_memo_ids
    await supabase.from('tasks').update({ related_memo_ids: [memoId] }).eq('id', taskId);
    return memoId;
  };

  const handleCreate = async (form) => {
    const id = genId(); // importance / urgency / owner_ids / supporter_ids 由 localStorage 管理；group_id / related_member_ids / predecessor_ids / successor_ids / need_report 写入数据库
    const { importance, urgency, owner_ids, supporter_ids, related_member_ids, predecessor_ids, successor_ids, create_memo, ...dbForm } = form;
    // 空字符串日期字段转为 null，避免数据库 timestamp 类型报错
    if (dbForm.due_date === '') dbForm.due_date = null;
    if (dbForm.plan_date === '') dbForm.plan_date = null;
    // group_id 直接写入数据库（tasks 表已有 group_id 字段）
    if (dbForm.group_id === undefined) dbForm.group_id = null;
    const newTask = {
      id,
      ...dbForm,
      related_member_ids: related_member_ids || [],
      predecessor_ids: predecessor_ids || [],
      successor_ids: successor_ids || [],
      related_memo_ids: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('tasks').insert([newTask]);
    if (error) {
      console.error('创建任务失败:', error);
      return;
    }
    // 乐观更新：立即插入本地 state，无需等待全量刷新
    const extraPatch = {};
    if (importance && importance !== 'normal') extraPatch.importance = importance;
    if (urgency && urgency !== 'normal') extraPatch.urgency = urgency;
    if (owner_ids?.length) extraPatch.owner_ids = owner_ids;
    if (supporter_ids?.length) extraPatch.supporter_ids = supporter_ids;
    if (Object.keys(extraPatch).length > 0) setStoredTaskExtra(id, extraPatch);
    if (dbForm.group_id != null) updateTaskGroupAssignment(id, dbForm.group_id);
    setTasks((prev) => [{ ...newTask, ...extraPatch, owner_ids: owner_ids || [], supporter_ids: supporter_ids || [], importance: importance || 'normal', urgency: urgency || 'normal' }, ...prev]);
    setIsCreating(false);
    // 后台异步同步：前置/后置双向关系 + 同步备忘 + 全量刷新
    (async () => {
      if (predecessor_ids?.length) {
        for (const predId of predecessor_ids) {
          const predTask = tasks.find((t) => t.id === predId);
          if (predTask) {
            const newSuccIds = [...new Set([...(predTask.successor_ids || []), id])];
            await supabase.from('tasks').update({ successor_ids: newSuccIds }).eq('id', predId);
          }
        }
      }
      if (successor_ids?.length) {
        for (const succId of successor_ids) {
          const succTask = tasks.find((t) => t.id === succId);
          if (succTask) {
            const newPredIds = [...new Set([...(succTask.predecessor_ids || []), id])];
            await supabase.from('tasks').update({ predecessor_ids: newPredIds }).eq('id', succId);
          }
        }
      }
      // 同步创建备忘
      if (create_memo) {
        await createMemoFromTask(id, dbForm.title, dbForm.description);
      }
      fetchAll();
    })();
  };
  // 当日期筛选激活时，自动展开「子任务命中、自身未命中」的父任务
  useEffect(() => {
    if (filterDate === 'all') return;
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const in3Days = new Date(now); in3Days.setDate(now.getDate() + 2);
    const in3DaysStr = in3Days.toISOString().slice(0, 10);
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1;
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - dayOfWeek);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    const selfMatch = (task) => {
      const dates = [task.due_date, task.plan_date].filter(Boolean).map(d => d.slice(0, 10));
      if (dates.length === 0) return false;
      if (filterDate === 'today')  return dates.some(d => d <= todayStr);
      if (filterDate === '3days') return dates.some(d => d >= todayStr && d <= in3DaysStr);
      if (filterDate === 'week')  return dates.some(d => d >= weekStartStr && d <= weekEndStr);
      return false;
    };

    // 找到所有「自身未命中但有子孙命中」的父任务 id
    const toExpand = new Set();
    const check = (task) => {
      if (selfMatch(task)) return true;
      const children = tasks.filter(t => t.parent_id === task.id);
      const childHit = children.some(c => check(c));
      if (childHit) toExpand.add(task.id);
      return childHit;
    };
    tasks.filter(t => !t.parent_id).forEach(t => check(t));

    if (toExpand.size > 0) {
      setExpandedTasks(prev => {
        const next = new Set(prev);
        toExpand.forEach(id => next.add(id));
        return next;
      });
    }
  }, [filterDate, tasks]);

  const toggleExpand = (id) => {
    const next = new Set(expandedTasks);
    next.has(id) ? next.delete(id) : next.add(id);
    setExpandedTasks(next);
  };
  const handleSelectTask = (task) => {
    setIsCreating(false); // 始终从 tasks 列表中取最新数据
    const latest = tasks.find((t) => t.id === task.id) || task;
    setSelectedTask(latest);
  };
  const handleColConfigChange = (cfg) => {
    setColConfig(cfg);
    saveColumnConfig(cfg);
  };
  const applyFilters = (list) => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const in3Days = new Date(now); in3Days.setDate(now.getDate() + 2);
    const in3DaysStr = in3Days.toISOString().slice(0, 10);
    // 本周：周一到周日
    const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // 0=周一
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - dayOfWeek);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartStr = weekStart.toISOString().slice(0, 10);
    const weekEndStr = weekEnd.toISOString().slice(0, 10);

    // 判断单个任务的日期是否满足 filterDate 条件（due_date 和 plan_date 任一满足即可）
    const taskDateMatch = (task) => {
      if (filterDate === 'all') return true;
      const dates = [task.due_date, task.plan_date].filter(Boolean).map(d => d.slice(0, 10));
      if (dates.length === 0) return false;
      if (filterDate === 'today') return dates.some(d => d <= todayStr);
      if (filterDate === '3days') return dates.some(d => d >= todayStr && d <= in3DaysStr);
      if (filterDate === 'week') return dates.some(d => d >= weekStartStr && d <= weekEndStr);
      return true;
    };

    // 判断任务自身或其任意子孙任务是否满足日期条件
    const taskOrDescendantDateMatch = (task) => {
      if (taskDateMatch(task)) return true;
      // 递归检查子任务
      const children = list.filter(t => t.parent_id === task.id);
      return children.some(child => taskOrDescendantDateMatch(child));
    };

    return list.filter((task) => {
      if (filterStatus !== 'all' && task.status !== filterStatus) return false;
      if (filterPriority !== 'all' && task.priority !== filterPriority) return false;
      if (filterOwner === 'none' && (task.owner_ids || []).length > 0) return false;
      if (filterOwner !== 'all' && filterOwner !== 'none' && !(task.owner_ids || []).map(String).includes(filterOwner)) return false;
      if (filterTag !== 'all' && !(task.tag_ids || []).map(String).includes(filterTag)) return false;
      if (filterGroup === 'none' && task.group_id) return false;
      if (filterGroup !== 'all' && filterGroup !== 'none' && task.group_id?.toString() !== filterGroup) return false;
      // 日期筛选：due_date/plan_date 任一满足，或任一子孙任务满足
      if (filterDate !== 'all' && !taskOrDescendantDateMatch(task)) return false;
      if (filterNeedReport === 'yes' && !task.need_report) return false;
      if (hideCompleted && task.status === 'done') return false;
      if (searchTerm && !task.title.toLowerCase().includes(searchTerm.toLowerCase())) return false;
      return true;
    });
  };
  const filteredTasks = useMemo(() => applyFilters(tasks), [tasks, filterStatus, filterPriority, filterOwner, filterTag, filterGroup, filterDate, filterNeedReport, hideCompleted, searchTerm]);
  const topLevelTasks = filteredTasks.filter((t) => !t.parent_id);
  const groupedTasks = groups
    .map((g) => ({
      ...g,
      tasks: topLevelTasks.filter((t) => t.group_id === g.id),
    }))
    .filter((g) => g.tasks.length > 0);
  const ungroupedTasks = topLevelTasks.filter((t) => !t.group_id);
  const hasVisibleTasks = topLevelTasks.length > 0;
  const getSubTasks = (parentId) => filteredTasks.filter((t) => t.parent_id === parentId);
  const mobileDetailVisible = selectedTask || isCreating;

  // 移动端:打开详情/新建时 pushState 一次,关闭时 back 一步
  // 监听到 popstate 时关闭自身,避免浏览器返回手势时把整个任务页切走
  // 注意:依赖只取 mobileDetailVisible,避免 selectedTask 切换时反复注册/卸载
  const selectedTaskRef = useRef(selectedTask);
  const isCreatingRef = useRef(isCreating);
  useEffect(() => { selectedTaskRef.current = selectedTask; }, [selectedTask]);
  useEffect(() => { isCreatingRef.current = isCreating; }, [isCreating]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (mobileDetailVisible) {
      try { window.history.pushState({ buddyMobileSubpage: 'task' }, ''); } catch (_) {}
      const onPop = () => {
        if (selectedTaskRef.current) setSelectedTask(null);
        if (isCreatingRef.current) setIsCreating(false);
      };
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }
  }, [mobileDetailVisible]);
  const updateTaskGroupAssignment = (taskId, groupId) => {
    // group_id 已写入数据库，此处仅同步本地 state（乐观更新）
    setTasks((curr) =>
      curr.map((t) =>
        t.id === taskId
          ? {
              ...t,
              group_id: groupId,
            }
          : t,
      ),
    );
    if (selectedTask?.id === taskId)
      setSelectedTask((curr) =>
        curr
          ? {
              ...curr,
              group_id: groupId,
            }
          : curr,
      );
  }; // 当 tasks 列表更新时，同步 selectedTask
  useEffect(() => {
    if (selectedTask) {
      const updated = tasks.find((t) => t.id === selectedTask.id);
      if (updated) setSelectedTask(updated);
    }
  }, [tasks]);
  if (showConfig)
    return (
      <TaskConfigPage
        onBack={() => {
          setShowConfig(false);
          fetchAll();
        }}
      />
    );
  const filterBarProps = {
    searchTerm,
    setSearchTerm,
    filterStatus,
    setFilterStatus,
    filterPriority,
    setFilterPriority,
    filterOwner,
    setFilterOwner,
    filterTag,
    setFilterTag,
    filterGroup,
    setFilterGroup,
    filterDate,
    setFilterDate,
    filterNeedReport,
    setFilterNeedReport,
    hideCompleted,
    setHideCompleted,
    members,
    tags,
    groups,
    showFilterPanel,
    setShowFilterPanel,
  };
  const CreatePanel = ({ onCancel }) => (
    <>
      <div className='flex items-center gap-3 px-4 md:px-6 h-12 md:h-14 border-b border-gray-100 flex-shrink-0'>
        <button onClick={onCancel} className='md:hidden text-gray-500'>
          <ArrowLeft className='h-5 w-5' />
        </button>
        <span className='text-sm font-medium text-gray-900'>新建任务</span>
        <button onClick={onCancel} className='hidden md:block ml-auto text-xs text-gray-400 hover:text-gray-600'>
          取消
        </button>
      </div>
      <div className='flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-5 min-h-0'>
        <TaskForm tasks={tasks} members={members} tags={tags} groups={groups} onSave={handleCreate} onCancel={onCancel} onMemberAdded={fetchMembers} />
      </div>
    </>
  );
  return (
    <div className='h-full flex overflow-hidden relative'>
      {/* 移动端列表 */}
      <div className={`md:hidden flex-col h-full w-full ${mobileDetailVisible ? 'hidden' : 'flex'}`}>
        <div className='flex items-center justify-between px-4 py-2 bg-white border-b border-gray-100 flex-shrink-0'>
          <div className='flex items-center gap-1 bg-gray-100 rounded-lg p-0.5'>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewMode === 'list' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
            >
              <List className='h-3.5 w-3.5' />
              列表
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewMode === 'kanban' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
            >
              <LayoutGrid className='h-3.5 w-3.5' />
              看板
            </button>
            <button
              onClick={() => setViewMode('note')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${viewMode === 'note' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500'}`}
            >
              <NotebookPen className='h-3.5 w-3.5' />
              梳理
            </button>
          </div>
          <button onClick={() => setShowConfig(true)} className='p-1.5 text-gray-400 hover:text-gray-600'>
            <Settings className='h-5 w-5' />
          </button>
        </div>
        {viewMode === 'list' && <FilterBar {...filterBarProps} />}
        {viewMode === 'note' ? (
          <div className='flex-1 overflow-hidden'>
            <NoteView
              tasks={tasks}
              onSelectTask={(task) => { setViewMode('list'); handleSelectTask(task); }}
            />
          </div>
        ) : viewMode === 'kanban' ? (
          <div className='flex-1 overflow-hidden'>
            <KanbanView
              tasks={tasks}
              members={members}
              groups={groups}
              onSelect={handleSelectTask}
              onRefresh={fetchAll}
            />
          </div>
        ) : (
          <div className='flex-1 overflow-y-auto bg-[#f5f5f5]'>
            {/* 有分组时按分组展示，无分组时平铺 */}
            {groups.length > 0 ? (
              <div className='py-2'>
                {groupedTasks.map((g) => (
                  <MobileGroupSection
                    key={g.id}
                    group={g}
                    tasks={filteredTasks}
                    members={members}
                    tags={tags}
                    groups={groups}
                    onSelect={handleSelectTask}
                    selectedTask={selectedTask}
                  />
                ))}
                {ungroupedTasks.length > 0 && (
                  <MobileGroupSection
                    group={null}
                    tasks={filteredTasks}
                    members={members}
                    tags={tags}
                    groups={groups}
                    onSelect={handleSelectTask}
                    selectedTask={selectedTask}
                    defaultExpanded={groupedTasks.length === 0}
                  />
                )}
              </div>
            ) : (
              topLevelTasks.map((task) => (
                <TaskMobileItem key={task.id} task={task} members={members} tags={tags} groups={groups} onSelect={handleSelectTask} isSelected={selectedTask?.id === task.id} />
              ))
            )}
            {topLevelTasks.length === 0 && (
              <div className='flex flex-col items-center justify-center py-16 text-gray-400'>
                <CheckCircle2 className='h-10 w-10 mb-3 text-gray-200' />
                <p className='text-sm'>暂无任务</p>
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => setIsCreating(true)}
          className='fixed right-4 w-11 h-11 rounded-full flex items-center justify-center shadow-lg active:scale-95 transition-all z-20'
          style={{
            bottom: 'calc(56px + env(safe-area-inset-bottom, 0px) + 12px)',
            backgroundColor: '#bbea3b',
            color: '#2d4a00',
          }}
        >
          <Plus className='h-5 w-5' />
        </button>
      </div>

      {/* 移动端详情/新建 */}
      {mobileDetailVisible && (
        <div className='md:hidden flex flex-col h-full w-full bg-white'>
          {isCreating ? (
            <CreatePanel onCancel={() => setIsCreating(false)} />
          ) : selectedTask ? (
            <TaskDetail
              key={selectedTask.id}
              task={selectedTask}
              tasks={tasks}
              members={members}
              tags={tags}
              groups={groups}
              onBack={() => setSelectedTask(null)}
              onRefresh={fetchAll}
              onMemberAdded={fetchMembers}
              onGroupAssigned={updateTaskGroupAssignment}
              onGoToConfig={() => {
                setSelectedTask(null);
                setTimeout(() => setShowConfig(true), 50);
              }}
              onGoToMemo={onGoToMemo}
            />
          ) : null}
        </div>
      )}

      {/* PC 端列表 */}
      <div className='hidden md:flex flex-col flex-1 min-w-0 overflow-hidden bg-[#f5f5f5]'>
        <div className='flex items-center gap-2 px-4 py-2 bg-white border-b border-gray-100 flex-shrink-0'>
          {/* 视图切换 */}
          <div className='flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 mr-1'>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium transition-all ${viewMode === 'list' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <List className='h-3.5 w-3.5' />
              列表
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium transition-all ${viewMode === 'kanban' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <LayoutGrid className='h-3.5 w-3.5' />
              看板
            </button>
            <button
              onClick={() => setViewMode('note')}
              className={`flex items-center gap-1.5 h-7 px-3 rounded-md text-xs font-medium transition-all ${viewMode === 'note' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <NotebookPen className='h-3.5 w-3.5' />
              梳理
            </button>
          </div>
          {viewMode === 'list' && (
            <button
              onClick={() => {
                setIsCreating(true);
                setSelectedTask(null);
              }}
              className='flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm border-0 text-[#2d4a00]'
              style={{ backgroundColor: '#bbea3b' }}
            >
              <Plus className='h-4 w-4' />
              新建
            </button>
          )}
          {viewMode === 'list' && (
            <div className='ml-auto flex items-center gap-2 relative'>
              <button
                onClick={() => setShowColPanel((v) => !v)}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm border transition-colors ${showColPanel ? 'text-[#2d4a00] border-transparent' : 'text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                style={showColPanel ? { backgroundColor: '#bbea3b' } : {}}
              >
                <Tag className='h-4 w-4' />
                列配置
              </button>
              {showColPanel && <ColumnConfigPanel colConfig={colConfig} onChange={handleColConfigChange} onClose={() => setShowColPanel(false)} />}
            </div>
          )}
        </div>
        {viewMode === 'list' && <FilterBar {...filterBarProps} />}
        {viewMode === 'note' ? (
          <div className='flex-1 overflow-hidden'>
            <NoteView
              tasks={tasks}
              onSelectTask={(task) => { setViewMode('list'); handleSelectTask(task); }}
            />
          </div>
        ) : viewMode === 'kanban' ? (
          <div className='flex-1 overflow-hidden'>
            <KanbanView
              tasks={tasks}
              members={members}
              groups={groups}
              onSelect={handleSelectTask}
              onRefresh={fetchAll}
            />
          </div>
        ) : (
          <div className='flex-1 overflow-y-auto p-4 space-y-4'>
            {groupedTasks.map((g, __dnd_i) => (
              <GroupSection
                key={g.id}
                group={g}
                tasks={filteredTasks}
                getSubTasks={getSubTasks}
                expandedTasks={expandedTasks}
                toggleExpand={toggleExpand}
                selectedTask={selectedTask}
                handleSelectTask={handleSelectTask}
                members={members}
                tags={tags}
                groups={groups}
                colConfig={colConfig}
                latestComments={latestComments}
              />
            ))}
            {ungroupedTasks.length > 0 && (
              <div className='bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm'>
                <div className='flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/70'>
                  <FolderOpen className='h-4 w-4 text-gray-400' />
                  <span className='text-sm font-semibold text-gray-900'>未分组</span>
                  <span className='text-xs text-gray-400'>{ungroupedTasks.length} 项</span>
                </div>
                <div className='overflow-auto'>
                  <table className='w-full text-left min-w-[700px]'>
                    <thead className='sticky top-0 bg-gray-50 z-10'>
                      <TableHeader colConfig={colConfig} />
                    </thead>
                    <tbody>
                      {ungroupedTasks.map((task, __dnd_i) => (
                        <TaskTableRow
                          key={task.id}
                          task={task}
                          subTasks={getSubTasks(task.id)}
                          members={members}
                          tags={tags}
                          groups={groups}
                          tasks={filteredTasks}
                          isExpanded={expandedTasks.has(task.id)}
                          onToggle={toggleExpand}
                          onSelect={handleSelectTask}
                          isSelected={selectedTask?.id === task.id}
                          colConfig={colConfig}
                          latestComments={latestComments}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {!hasVisibleTasks && (
              <div className='bg-white rounded-2xl border border-gray-100 py-16 text-center text-gray-400 text-sm'>
                <CheckCircle2 className='h-10 w-10 mx-auto mb-3 text-gray-200' />
                暂无任务
              </div>
            )}
          </div>
        )}
      </div>

      {/* PC 抽屉 */}
      <PcTaskDrawer
        open={Boolean(selectedTask || isCreating)}
        mode={isCreating ? 'create' : 'detail'}
        selectedTask={selectedTask}
        tasks={tasks}
        members={members}
        tags={tags}
        groups={groups}
        onClose={() => {
          setSelectedTask(null);
          setIsCreating(false);
        }}
        onRefresh={fetchAll}
        onOptimisticAdd={(newTask) => setTasks((prev) => [newTask, ...prev])}
        onMemberAdded={fetchMembers}
        onGroupAssigned={updateTaskGroupAssignment}
        onGoToConfig={() => {
          setSelectedTask(null);
          setIsCreating(false);
          setTimeout(() => setShowConfig(true), 50);
        }}
        onGoToMemo={onGoToMemo}
      />
    </div>
  );
};
export default TasksPage;

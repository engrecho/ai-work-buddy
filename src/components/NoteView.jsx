/**
 * NoteView — 梳理视图
 * 左侧：梳理文档列表（默认折叠，可展开）；右侧：富文本编辑器
 * 打开时自动加载最新笔记；点击任务 chip → 弹出完整任务详情抽屉
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, FileText, Trash2, Search, ChevronLeft, ChevronRight, X, PanelLeftOpen, PanelLeftClose } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { genId } from '@/lib/utils';
import RichEditor from '@/components/RichEditor';
import { TaskDetail } from '@/pages/TasksPage';

// ─── 工具 ─────────────────────────────────────────────────────────
const formatDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ─── 任务详情抽屉（完整版，自加载数据）─────────────────────────────
function TaskDetailDrawer({ taskId, onClose }) {
  const [task, setTask] = useState(null);
  const [allTasks, setAllTasks] = useState([]);
  const [members, setMembers] = useState([]);
  const [tags, setTags] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!taskId) return;
    setLoading(true);
    const [
      { data: taskData },
      { data: tasksData },
      { data: membersData },
      { data: tagsData },
      { data: groupsData },
    ] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', taskId).single(),
      supabase.from('tasks').select('*').order('created_at', { ascending: false }),
      supabase.from('task_members').select('*').order('name', { ascending: true }),
      supabase.from('task_tags').select('*').order('name', { ascending: true }),
      supabase.from('task_groups').select('*').order('sort_order', { ascending: true }),
    ]);
    setTask(taskData || null);
    setAllTasks(tasksData || []);
    setMembers(membersData || []);
    setTags(tagsData || []);
    setGroups(groupsData || []);
    setLoading(false);
  }, [taskId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (!taskId) return null;

  return (
    <>
      <div className='fixed inset-0 bg-black/20 z-[80]' onClick={onClose} />
      <div
        className='fixed right-0 top-0 h-full z-[81] bg-white shadow-2xl border-l border-gray-200 flex flex-col overflow-hidden'
        style={{ width: 'min(100vw, 420px)', maxWidth: '100vw' }}
      >
        {loading ? (
          <div className='flex flex-col h-full'>
            <div className='flex items-center gap-3 px-4 h-12 border-b border-gray-100 flex-shrink-0'>
              <div className='flex-1 h-4 bg-gray-100 rounded animate-pulse' />
              <button onClick={onClose} className='p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100'>
                <X className='h-4 w-4' />
              </button>
            </div>
            <div className='flex-1 p-5 space-y-4'>
              {[80, 60, 90, 50, 70].map((w, i) => (
                <div key={i} className='h-3.5 bg-gray-100 rounded animate-pulse' style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        ) : !task ? (
          <div className='flex flex-col h-full'>
            <div className='flex items-center gap-3 px-4 h-12 border-b border-gray-100 flex-shrink-0'>
              <span className='text-sm font-semibold text-gray-700 flex-1'>任务详情</span>
              <button onClick={onClose} className='p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100'>
                <X className='h-4 w-4' />
              </button>
            </div>
            <div className='flex-1 flex flex-col items-center justify-center gap-3 text-gray-400'>
              <FileText className='h-12 w-12 text-gray-200' />
              <p className='text-sm'>任务不存在或已删除</p>
            </div>
          </div>
        ) : (
          <TaskDetail
            task={task}
            tasks={allTasks}
            members={members}
            tags={tags}
            groups={groups}
            drawerMode
            onCloseDrawer={onClose}
            onBack={onClose}
            onRefresh={loadData}
            onMemberAdded={() => {
              supabase.from('task_members').select('*').order('name', { ascending: true })
                .then(({ data }) => setMembers(data || []));
            }}
            onGroupAssigned={() => {
              supabase.from('tasks').select('*').order('created_at', { ascending: false })
                .then(({ data }) => setAllTasks(data || []));
            }}
            onGoToConfig={null}
            onGoToMemo={null}
          />
        )}
      </div>
    </>
  );
}


// ─── 主组件 ───────────────────────────────────────────────────────
export default function NoteView({ tasks: tasksProp = [], onSelectTask, floatMode = false }) {
  const [notes, setNotes] = useState([]);
  const [activeNote, setActiveNote] = useState(null);
  const [titleVal, setTitleVal] = useState('');
  const [contentVal, setContentVal] = useState('');
  const [relatedIds, setRelatedIds] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  // 左侧列表折叠状态：默认折叠
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 移动端面板：'list' | 'editor'
  const [mobilePanel, setMobilePanel] = useState('editor');
  // 任务详情抽屉
  const [previewTaskId, setPreviewTaskId] = useState(null);
  // 是否已自动打开最新笔记（防止重复触发）
  const autoOpenedRef = useRef(false);
  const saveTimerRef = useRef(null);

  // 处理 chip 点击
  const handleChipClick = useCallback((taskId) => {
    setPreviewTaskId(taskId);
  }, []);

  // floatMode 下自己加载 tasks + groups
  const [internalTasks, setInternalTasks] = useState([]);
  const [internalGroups, setInternalGroups] = useState([]);
  useEffect(() => {
    if (floatMode) {
      Promise.all([
        supabase.from('tasks').select('id, title, status, parent_id, group_id').order('created_at', { ascending: false }),
        supabase.from('task_groups').select('*').order('sort_order', { ascending: true }),
      ]).then(([{ data: tData }, { data: gData }]) => {
        setInternalTasks(tData || []);
        setInternalGroups(gData || []);
      });
    }
  }, [floatMode]);
  const tasks = floatMode ? internalTasks : tasksProp;

  // groups
  const [groups, setGroups] = useState([]);
  useEffect(() => {
    if (!floatMode) {
      supabase.from('task_groups').select('*').order('sort_order', { ascending: true })
        .then(({ data }) => setGroups(data || []));
    }
  }, [floatMode]);
  const allGroups = floatMode ? internalGroups : groups;

  // ── 拉取梳理列表，完成后自动打开最新笔记 ──
  const fetchNotes = useCallback(async () => {
    const { data } = await supabase
      .from('task_notes')
      .select('*')
      .order('updated_at', { ascending: false });
    const list = data || [];
    setNotes(list);
    // 首次加载，自动打开最新笔记
    if (!autoOpenedRef.current && list.length > 0) {
      autoOpenedRef.current = true;
      const latest = list[0];
      setActiveNote(latest);
      setTitleVal(latest.title || '');
      setContentVal(latest.content || '');
      setRelatedIds(latest.related_task_ids || []);
      setDirty(false);
      setMobilePanel('editor');
    }
  }, []);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  // ── 切换活跃文档 ──
  const openNote = useCallback((note) => {
    if (dirty) saveNote();
    setActiveNote(note);
    setTitleVal(note.title || '');
    setContentVal(note.content || '');
    setRelatedIds(note.related_task_ids || []);
    setDirty(false);
    setMobilePanel('editor');
    // 打开笔记时收起列表（减少干扰）
    setSidebarOpen(false);
  }, [dirty]); // eslint-disable-line

  // ── 保存 ──
  const saveNote = useCallback(async (overrides = {}) => {
    if (!activeNote) return;
    setSaving(true);
    const now = new Date().toISOString();
    const patch = {
      title: overrides.title ?? titleVal,
      content: overrides.content ?? contentVal,
      related_task_ids: overrides.relatedIds ?? relatedIds,
      updated_at: now,
    };
    await supabase.from('task_notes').update(patch).eq('id', activeNote.id);
    const updated = { ...activeNote, ...patch };
    setActiveNote(updated);
    setNotes((prev) =>
      prev.map((n) => (n.id === activeNote.id ? updated : n))
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
    );
    setDirty(false);
    setSaving(false);
  }, [activeNote, titleVal, contentVal, relatedIds]);

  // ── 自动保存（2s 防抖） ──
  const scheduleSave = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveNote(), 2000);
  }, [saveNote]);

  // ── 新建文档 ──
  const createNote = async () => {
    if (dirty) saveNote();
    const id = genId();
    const now = new Date().toISOString();
    const note = { id, title: '新梳理文档', content: '', related_task_ids: [], created_at: now, updated_at: now };
    await supabase.from('task_notes').insert([note]);
    setNotes((prev) => [note, ...prev]);
    setActiveNote(note);
    setTitleVal(note.title || '');
    setContentVal('');
    setRelatedIds([]);
    setDirty(false);
    setMobilePanel('editor');
    setSidebarOpen(false);
  };

  // ── 删除文档 ──
  const deleteNote = async (id, e) => {
    e.stopPropagation();
    await supabase.from('task_notes').delete().eq('id', id);
    const newList = notes.filter((n) => n.id !== id);
    setNotes(newList);
    if (activeNote?.id === id) {
      // 自动切换到下一篇
      const next = newList[0] || null;
      if (next) {
        setActiveNote(next);
        setTitleVal(next.title || '');
        setContentVal(next.content || '');
        setRelatedIds(next.related_task_ids || []);
      } else {
        setActiveNote(null);
        setTitleVal('');
        setContentVal('');
        setRelatedIds([]);
        setMobilePanel('list');
      }
      setDirty(false);
    }
  };

  // ── 编辑器中插入任务后，同步 relatedIds ──
  const handleTaskInserted = useCallback((taskId) => {
    const id = String(taskId);
    if (!relatedIds.map(String).includes(id)) {
      const newIds = [...relatedIds, taskId];
      setRelatedIds(newIds);
      if (activeNote) saveNote({ relatedIds: newIds });
    }
  }, [relatedIds, activeNote, saveNote]);

  const filteredNotes = notes.filter((n) =>
    search === '' || (n.title || '').toLowerCase().includes(search.toLowerCase())
  );

  // ── 左侧文档列表抽屉（PC / floatMode 共用，overlay 形式） ──────────
  const SidebarDrawer = (
    <>
      {/* 遮罩（点击收起） */}
      {sidebarOpen && (
        <div
          className='absolute inset-0 z-10 bg-black/10'
          onClick={() => setSidebarOpen(false)}
        />
      )}
      {/* 抽屉本体 */}
      <div
        className='absolute left-0 top-0 h-full z-20 flex flex-col bg-white border-r border-gray-100 shadow-lg transition-transform duration-200'
        style={{
          width: floatMode ? 200 : 220,
          transform: sidebarOpen ? 'translateX(0)' : `translateX(-${floatMode ? 200 : 220}px)`,
        }}
      >
        {/* 抽屉头部 */}
        <div className='flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 flex-shrink-0'>
          <div className='relative flex-1'>
            <Search className='absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none' />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder='搜索梳理…'
              className='w-full h-7 pl-6 pr-2 rounded-lg border border-gray-200 bg-gray-50 text-xs outline-none focus:border-[#bbea3b] transition-colors'
            />
          </div>
          <button
            onClick={createNote}
            className='flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-colors'
            style={{ backgroundColor: '#bbea3b', color: '#2d4a00' }}
            title='新建梳理'
          >
            <Plus className='h-3.5 w-3.5' />
          </button>
          {/* 关闭按钮 */}
          <button
            onClick={() => setSidebarOpen(false)}
            className='flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors'
          >
            <ChevronLeft className='h-4 w-4' />
          </button>
        </div>
        {/* 列表 */}
        <div className='flex-1 overflow-y-auto py-1'>
          {filteredNotes.length === 0 && (
            <div className='flex flex-col items-center justify-center h-32 gap-2'>
              <FileText className='h-8 w-8 text-gray-200' />
              <p className='text-xs text-gray-400'>暂无梳理文档</p>
              <button onClick={createNote} className='text-xs px-3 py-1.5 rounded-lg' style={{ backgroundColor: '#bbea3b', color: '#2d4a00' }}>
                新建一篇
              </button>
            </div>
          )}
          {filteredNotes.map((note) => {
            const isActive = activeNote?.id === note.id;
            return (
              <button
                key={note.id}
                onClick={() => openNote(note)}
                className={`w-full text-left px-3 py-2.5 flex flex-col gap-0.5 transition-colors group relative ${isActive ? 'bg-[#f0ffd0]' : 'hover:bg-gray-50'}`}
              >
                <span className={`text-xs font-semibold truncate pr-5 ${isActive ? 'text-[#2d4a00]' : 'text-gray-800'}`}>
                  {note.title || '未命名'}
                </span>
                <span className='text-[10px] text-gray-400 truncate'>
                  {(note.related_task_ids || []).length > 0 && `${(note.related_task_ids || []).length} 个关联 · `}
                  {formatDate(note.updated_at)}
                </span>
                <button
                  onClick={(e) => deleteNote(note.id, e)}
                  className='absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 transition-all'
                >
                  <Trash2 className='h-3.5 w-3.5' />
                </button>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );

  // ── 编辑区标题栏（共用） ──
  const EditorTitleBar = (compact = false) => (
    <div className={`flex items-center gap-2 ${compact ? 'px-3 py-2' : 'px-5 py-3'} border-b border-gray-100 flex-shrink-0 bg-white`}>
      {/* 展开/折叠侧栏按钮 */}
      <button
        onClick={() => setSidebarOpen((v) => !v)}
        className='flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors'
        title={sidebarOpen ? '收起文档列表' : '展开文档列表'}
      >
        {sidebarOpen ? <PanelLeftClose className='h-4 w-4' /> : <PanelLeftOpen className='h-4 w-4' />}
      </button>

      {/* 移动端返回按钮 */}
      {!compact && (
        <button
          onClick={() => { if (dirty) saveNote(); setMobilePanel('list'); }}
          className='md:hidden p-1 rounded-lg text-gray-400 hover:bg-gray-100'
        >
          <ChevronLeft className='h-4 w-4' />
        </button>
      )}

      <input
        value={titleVal}
        onChange={(e) => { setTitleVal(e.target.value); setDirty(true); scheduleSave(); }}
        onBlur={() => { if (dirty) saveNote(); }}
        placeholder='梳理文档标题…'
        className={`flex-1 ${compact ? 'text-sm' : 'text-base'} font-semibold text-gray-900 bg-transparent border-0 outline-none placeholder-gray-300`}
      />
      <div className='flex items-center gap-1.5 flex-shrink-0'>
        {saving && <span className='text-xs text-gray-400'>保存中…</span>}
        {!saving && dirty && (
          <button
            onClick={() => saveNote()}
            className='text-xs px-2.5 py-1 rounded-lg font-medium transition-colors'
            style={{ backgroundColor: '#bbea3b', color: '#2d4a00' }}
          >
            保存
          </button>
        )}
        {!saving && !dirty && <span className='text-[10px] text-gray-300'>已保存</span>}
      </div>
    </div>
  );

  // ── 编辑区内容（共用） ──
  const EditorContent = (compact = false) => (
    <div className={`flex-1 overflow-hidden flex flex-col bg-white ${compact ? 'px-3 py-2' : 'px-4 py-3'}`}>
      <RichEditor
        key={activeNote?.id}
        value={contentVal}
        onChange={(val) => { setContentVal(val); setDirty(true); scheduleSave(); }}
        placeholder='开始梳理你的想法…按 / 可插入任务引用'
        fullHeight
        tasks={tasks}
        groups={allGroups}
        onTaskInserted={handleTaskInserted}
        onTaskChipClick={handleChipClick}
      />
    </div>
  );

  // ── 空状态（无笔记） ──
  const EmptyState = (compact = false) => (
    <div className={`flex-1 flex flex-col items-center justify-center gap-4 text-center ${compact ? 'px-4' : 'px-8'} bg-[#fafafa]`}>
      <div className='w-14 h-14 rounded-2xl flex items-center justify-center' style={{ backgroundColor: '#f0ffd0' }}>
        <FileText className={compact ? 'h-6 w-6' : 'h-8 w-8'} style={{ color: '#5a7a00' }} />
      </div>
      <div>
        <p className={`${compact ? 'text-sm' : 'text-base'} font-semibold text-gray-700 mb-1`}>开始梳理你的工作</p>
        <p className={`${compact ? 'text-xs' : 'text-sm'} text-gray-400 leading-relaxed`}>在这里整理思路、规划任务，<br />并与任务列表保持关联。</p>
      </div>
      <button
        onClick={createNote}
        className='flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors'
        style={{ backgroundColor: '#bbea3b', color: '#2d4a00' }}
      >
        <Plus className='h-4 w-4' />
        新建梳理文档
      </button>
    </div>
  );

  // ── 移动端列表视图 ──
  const MobileListView = (
    <div className='h-full flex flex-col'>
      <div className='flex items-center px-4 h-11 border-b border-gray-100 bg-white flex-shrink-0'>
        <span className='text-sm font-semibold text-gray-800 flex-1'>梳理文档</span>
        <button
          onClick={createNote}
          className='flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-medium'
          style={{ backgroundColor: '#bbea3b', color: '#2d4a00' }}
        >
          <Plus className='h-3.5 w-3.5' /> 新建
        </button>
      </div>
      <div className='px-4 py-2 border-b border-gray-100 bg-white flex-shrink-0'>
        <div className='relative'>
          <Search className='absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none' />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder='搜索梳理…'
            className='w-full h-8 pl-7 pr-3 rounded-lg border border-gray-200 bg-gray-50 text-xs outline-none focus:border-[#bbea3b] transition-colors'
          />
        </div>
      </div>
      <div className='flex-1 overflow-y-auto'>
        {filteredNotes.length === 0 && (
          <div className='flex flex-col items-center justify-center h-48 gap-2'>
            <FileText className='h-10 w-10 text-gray-200' />
            <p className='text-sm text-gray-400'>暂无梳理文档</p>
            <button onClick={createNote} className='text-sm px-4 py-2 rounded-xl' style={{ backgroundColor: '#bbea3b', color: '#2d4a00' }}>
              新建一篇
            </button>
          </div>
        )}
        {filteredNotes.map((note) => (
          <button
            key={note.id}
            onClick={() => openNote(note)}
            className='w-full text-left px-4 py-3.5 border-b border-gray-50 flex items-start gap-3 active:bg-gray-50'
          >
            <FileText className='h-4 w-4 text-gray-300 mt-0.5 flex-shrink-0' />
            <div className='flex-1 min-w-0'>
              <p className='text-sm font-medium text-gray-800 truncate'>{note.title || '未命名'}</p>
              <p className='text-xs text-gray-400 mt-0.5'>
                {(note.related_task_ids || []).length > 0 && `${(note.related_task_ids || []).length} 个关联 · `}
                {formatDate(note.updated_at)}
              </p>
            </div>
            <ChevronRight className='h-4 w-4 text-gray-300 mt-0.5 flex-shrink-0' />
          </button>
        ))}
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────────────
  if (floatMode) {
    return (
      <>
        <div className='relative flex h-full overflow-hidden'>
          {/* 左侧 overlay 抽屉 */}
          {SidebarDrawer}
          {/* 右侧编辑区（全宽，抽屉覆盖在上方） */}
          <div className='flex flex-col h-full w-full overflow-hidden'>
            {activeNote ? (
              <>
                {EditorTitleBar(true)}
                {EditorContent(true)}
              </>
            ) : (
              <>
                {/* 折叠状态下顶部工具条（仅含展开按钮） */}
                <div className='flex items-center gap-2 px-3 py-2 border-b border-gray-100 flex-shrink-0 bg-white'>
                  <button
                    onClick={() => setSidebarOpen((v) => !v)}
                    className='p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors'
                    title='展开文档列表'
                  >
                    <PanelLeftOpen className='h-4 w-4' />
                  </button>
                  <span className='text-xs text-gray-400 flex-1'>选择或新建梳理文档</span>
                  <button
                    onClick={createNote}
                    className='flex items-center gap-1 h-7 px-2 rounded-lg text-xs font-medium'
                    style={{ backgroundColor: '#bbea3b', color: '#2d4a00' }}
                  >
                    <Plus className='h-3 w-3' /> 新建
                  </button>
                </div>
                {EmptyState(true)}
              </>
            )}
          </div>
        </div>

        {previewTaskId && (
          <TaskDetailDrawer taskId={previewTaskId} onClose={() => setPreviewTaskId(null)} />
        )}
      </>
    );
  }

  // ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* PC 端：全宽，左侧为 overlay 抽屉 */}
      <div className='hidden md:flex relative h-full overflow-hidden'>
        {/* 左侧 overlay 抽屉 */}
        {SidebarDrawer}
        {/* 右侧编辑区（全宽） */}
        <div className='flex flex-col flex-1 h-full overflow-hidden'>
          {activeNote ? (
            <>
              {EditorTitleBar(false)}
              {EditorContent(false)}
            </>
          ) : (
            <>
              <div className='flex items-center gap-2 px-5 py-3 border-b border-gray-100 flex-shrink-0 bg-white'>
                <button
                  onClick={() => setSidebarOpen((v) => !v)}
                  className='p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors'
                  title='展开文档列表'
                >
                  <PanelLeftOpen className='h-4 w-4' />
                </button>
                <span className='text-sm text-gray-400 flex-1'>选择或新建梳理文档</span>
                <button
                  onClick={createNote}
                  className='flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors'
                  style={{ backgroundColor: '#bbea3b', color: '#2d4a00' }}
                >
                  <Plus className='h-4 w-4' /> 新建梳理
                </button>
              </div>
              {EmptyState(false)}
            </>
          )}
        </div>
      </div>

      {/* 移动端：单页切换 */}
      <div className='md:hidden h-full overflow-hidden'>
        {mobilePanel === 'list' ? (
          MobileListView
        ) : (
          <div className='relative h-full flex flex-col overflow-hidden'>
            {/* 移动端也支持左侧抽屉 */}
            {SidebarDrawer}
            {activeNote ? (
              <>
                {EditorTitleBar(false)}
                {EditorContent(false)}
              </>
            ) : (
              <>{EmptyState(false)}</>
            )}
          </div>
        )}
      </div>

      {previewTaskId && (
        <TaskDetailDrawer taskId={previewTaskId} onClose={() => setPreviewTaskId(null)} />
      )}
    </>
  );
}

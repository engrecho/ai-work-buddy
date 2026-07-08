import { useState, useRef, useEffect, useCallback } from 'react';
import { LayoutDashboard, CheckSquare, FileText, BookOpen, NotebookPen, X, Minus, GripVertical, Maximize2 } from 'lucide-react';
import TasksPage from './TasksPage';
import MemosPage from './MemosPage';
import ReadingPage from './ReadingPage';
import DashboardPage from './DashboardPage';
import { ConfigContent } from '@/components/ConfigSection';
import NoteView from '@/components/NoteView';
import { SettingsCenter } from '@/pages/SettingsCenter';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

const navItems = [
  { id: 'dashboard', label: '总览', icon: LayoutDashboard },
  { id: 'tasks', label: '任务', icon: CheckSquare },
  { id: 'memos', label: '备忘', icon: FileText },
  { id: 'reading', label: '阅读', icon: BookOpen },
];

const pageTitles = {
  dashboard: '总览',
  tasks: '任务',
  memos: '备忘',
  reading: '阅读',
  config: '配置',
};

// ── 悬浮梳理窗（PC 端可拖拽+缩放，移动端底部抽屉） ─────────────────
function FloatNotePanel({ open, onClose, tasks, onSelectTask }) {
  const [minimized, setMinimized] = useState(false);

  // 位置：null = 默认右下角
  const [pos, setPos] = useState({ x: null, y: null });
  // 尺寸
  const DEFAULT_W = 760;
  const DEFAULT_H = 520;
  const MIN_W = 400;
  const MIN_H = 300;
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });

  const panelRef = useRef(null);

  // 拖拽移动
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  // resize（拖拽边缘/角）
  const resizing = useRef(false);
  const resizeDir = useRef('');
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0, px: 0, py: 0 });

  // 重置
  useEffect(() => {
    if (open) {
      setMinimized(false);
      setPos({ x: null, y: null });
      setSize({ w: DEFAULT_W, h: DEFAULT_H });
    }
  }, [open]);

  // ── 标题栏拖拽 ──
  const onTitleMouseDown = (e) => {
    if (e.button !== 0) return;
    dragging.current = true;
    const rect = panelRef.current.getBoundingClientRect();
    dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    // 如果还在默认位置，先把当前像素位置固化
    if (pos.x === null) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPos({ x: vw - rect.width - 24, y: vh - rect.height - 24 });
    }
    e.preventDefault();
  };

  // ── resize handle mousedown ──
  const onResizeMouseDown = (dir) => (e) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    resizing.current = true;
    resizeDir.current = dir;
    const rect = panelRef.current.getBoundingClientRect();
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      w: rect.width,
      h: rect.height,
      px: rect.left,
      py: rect.top,
    };
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (dragging.current) {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const pw = panelRef.current?.offsetWidth || DEFAULT_W;
        const ph = panelRef.current?.offsetHeight || DEFAULT_H;
        let nx = e.clientX - dragOffset.current.x;
        let ny = e.clientY - dragOffset.current.y;
        nx = Math.max(0, Math.min(nx, vw - pw));
        ny = Math.max(0, Math.min(ny, vh - ph));
        setPos({ x: nx, y: ny });
      }
      if (resizing.current) {
        const { x: sx, y: sy, w: sw, h: sh, px, py } = resizeStart.current;
        const dir = resizeDir.current;
        const dx = e.clientX - sx;
        const dy = e.clientY - sy;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        let newW = sw, newH = sh, newPx = px, newPy = py;

        if (dir.includes('e')) newW = Math.max(MIN_W, sw + dx);
        if (dir.includes('s')) newH = Math.max(MIN_H, sh + dy);
        if (dir.includes('w')) {
          newW = Math.max(MIN_W, sw - dx);
          newPx = px + (sw - newW);
        }
        if (dir.includes('n')) {
          newH = Math.max(MIN_H, sh - dy);
          newPy = py + (sh - newH);
        }

        // 边界限制
        newPx = Math.max(0, Math.min(newPx, vw - newW));
        newPy = Math.max(0, Math.min(newPy, vh - newH));

        setSize({ w: newW, h: newH });
        setPos({ x: newPx, y: newPy });
      }
    };

    const onMouseUp = () => {
      dragging.current = false;
      resizing.current = false;
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  if (!open) return null;

  // PC 端悬浮窗位置
  const getPcStyle = () => {
    if (pos.x !== null) {
      return { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' };
    }
    return { right: 24, bottom: 24 };
  };

  // resize handle 样式辅助
  const handleBase = 'absolute z-10';
  const EDGE = 5; // px

  return (
    <>
      {/* ── PC 端悬浮窗 ── */}
      <div
        ref={panelRef}
        className='hidden md:flex fixed z-50 flex-col bg-white rounded-2xl shadow-2xl border border-gray-200'
        style={{
          ...getPcStyle(),
          width: size.w,
          height: minimized ? 48 : size.h,
          overflow: minimized ? 'hidden' : 'visible',
          transition: (dragging.current || resizing.current) ? 'none' : 'height 0.18s ease',
          minWidth: MIN_W,
          minHeight: minimized ? 48 : MIN_H,
        }}
      >
        {/* 内容裁切层（圆角遮罩，避免内容溢出圆角） */}
        <div className='flex flex-col h-full w-full overflow-hidden rounded-2xl'>

          {/* ── 标题栏（拖拽移动） ── */}
          <div
            className='flex items-center gap-2 px-4 h-12 border-b border-gray-100 flex-shrink-0 select-none cursor-grab active:cursor-grabbing bg-white rounded-t-2xl'
            onMouseDown={onTitleMouseDown}
          >
            <GripVertical className='h-4 w-4 text-gray-300 flex-shrink-0' />
            <NotebookPen className='h-4 w-4 flex-shrink-0' style={{ color: '#5a7a00' }} />
            <span className='text-sm font-semibold text-gray-700 flex-1'>梳理</span>
            {/* 最大化/还原尺寸 */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                setSize({ w: Math.min(DEFAULT_W, vw - 48), h: Math.min(DEFAULT_H, vh - 96) });
                setPos({ x: null, y: null });
              }}
              className='p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors'
              title='还原默认大小'
            >
              <Maximize2 className='h-3.5 w-3.5' />
            </button>
            {/* 最小化 */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => setMinimized((v) => !v)}
              className='p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors'
              title={minimized ? '展开' : '最小化'}
            >
              <Minus className='h-3.5 w-3.5' />
            </button>
            {/* 关闭 */}
            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={onClose}
              className='p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-50 transition-colors'
              title='关闭'
            >
              <X className='h-3.5 w-3.5' />
            </button>
          </div>

          {/* 内容区 */}
          {!minimized && (
            <div className='flex-1 overflow-hidden min-h-0'>
              <NoteView tasks={tasks} onSelectTask={onSelectTask} floatMode />
            </div>
          )}
        </div>

        {/* ── Resize Handles（不最小化时显示） ── */}
        {!minimized && (
          <>
            {/* 四条边 */}
            <div onMouseDown={onResizeMouseDown('n')} className={`${handleBase} top-0 left-2 right-2 cursor-n-resize`} style={{ height: EDGE }} />
            <div onMouseDown={onResizeMouseDown('s')} className={`${handleBase} bottom-0 left-2 right-2 cursor-s-resize`} style={{ height: EDGE }} />
            <div onMouseDown={onResizeMouseDown('w')} className={`${handleBase} left-0 top-2 bottom-2 cursor-w-resize`} style={{ width: EDGE }} />
            <div onMouseDown={onResizeMouseDown('e')} className={`${handleBase} right-0 top-2 bottom-2 cursor-e-resize`} style={{ width: EDGE }} />
            {/* 四个角 */}
            <div onMouseDown={onResizeMouseDown('nw')} className={`${handleBase} top-0 left-0 cursor-nw-resize`} style={{ width: 12, height: 12 }} />
            <div onMouseDown={onResizeMouseDown('ne')} className={`${handleBase} top-0 right-0 cursor-ne-resize`} style={{ width: 12, height: 12 }} />
            <div onMouseDown={onResizeMouseDown('sw')} className={`${handleBase} bottom-0 left-0 cursor-sw-resize`} style={{ width: 12, height: 12 }} />
            <div onMouseDown={onResizeMouseDown('se')} className={`${handleBase} bottom-0 right-0 cursor-se-resize rounded-br-2xl`} style={{ width: 12, height: 12 }} />
          </>
        )}
      </div>

      {/* ── 移动端底部抽屉 ── */}
      <div className='md:hidden fixed inset-0 z-50 flex flex-col justify-end'>
        {/* 遮罩 */}
        <div className='absolute inset-0 bg-black/30' onClick={onClose} />
        {/* 抽屉主体 */}
        <div className='relative bg-white rounded-t-2xl flex flex-col overflow-hidden' style={{ height: '85vh' }}>
          {/* 抽屉头部 */}
          <div className='flex items-center gap-2 px-4 h-12 border-b border-gray-100 flex-shrink-0'>
            <NotebookPen className='h-4 w-4 flex-shrink-0' style={{ color: '#5a7a00' }} />
            <span className='text-sm font-semibold text-gray-700 flex-1'>梳理</span>
            <button onClick={onClose} className='p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-50 transition-colors'>
              <X className='h-4 w-4' />
            </button>
          </div>
          {/* 内容区 */}
          <div className='flex-1 overflow-hidden min-h-0'>
            <NoteView tasks={tasks} onSelectTask={onSelectTask} />
          </div>
        </div>
      </div>
    </>
  );
}

// ── 悬浮 FAB 按钮（PC 端，可拖拽，默认右下角） ─────────────────────
function FloatFAB({ active, onClick }) {
  // null = 默认右下角；有值 = 拖拽后的 left/top
  const [pos, setPos] = useState({ x: null, y: null });
  const dragging = useRef(false);
  const didDrag = useRef(false);          // 是否真的发生了拖动（区分点击/拖拽）
  const dragOffset = useRef({ x: 0, y: 0 });
  const fabRef = useRef(null);
  const SIZE = 48;
  const DRAG_THRESHOLD = 4;              // px：超过此距离才算拖拽

  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    dragging.current = true;
    didDrag.current = false;
    const rect = fabRef.current.getBoundingClientRect();
    // 固化当前位置（如果还在默认右下角）
    if (pos.x === null) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPos({ x: vw - SIZE - 24, y: vh - SIZE - 24 });
      dragOffset.current = { x: e.clientX - (vw - SIZE - 24), y: e.clientY - (vh - SIZE - 24) };
    } else {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    e.preventDefault();
  };

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return;
      const dx = Math.abs(e.clientX - (pos.x !== null ? pos.x + dragOffset.current.x : 0));
      if (dx > DRAG_THRESHOLD || didDrag.current) didDrag.current = true;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let nx = e.clientX - dragOffset.current.x;
      let ny = e.clientY - dragOffset.current.y;
      nx = Math.max(8, Math.min(nx, vw - SIZE - 8));
      ny = Math.max(8, Math.min(ny, vh - SIZE - 8));
      setPos({ x: nx, y: ny });
    };
    const onMouseUp = () => {
      if (dragging.current && !didDrag.current) {
        // 没有发生真正拖拽 → 视为点击
        onClick();
      }
      dragging.current = false;
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [pos, onClick]);

  // 计算样式：有拖拽位置用 left/top，否则用默认 right/bottom
  const posStyle = pos.x !== null
    ? { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }
    : { right: 24, bottom: 24 };

  return (
    <div
      ref={fabRef}
      onMouseDown={onMouseDown}
      title='梳理（可拖拽）'
      className='hidden md:flex fixed z-40 items-center justify-center shadow-lg select-none'
      style={{
        ...posStyle,
        width: SIZE,
        height: SIZE,
        borderRadius: '50%',
        backgroundColor: active ? '#2d4a00' : '#bbea3b',
        color: active ? '#bbea3b' : '#2d4a00',
        boxShadow: active
          ? '0 4px 20px rgba(45,74,0,0.35)'
          : '0 4px 16px rgba(187,234,59,0.5)',
        cursor: dragging.current ? 'grabbing' : 'grab',
        transition: dragging.current ? 'none' : 'background-color 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      {active ? <X className='h-5 w-5 pointer-events-none' /> : <NotebookPen className='h-5 w-5 pointer-events-none' />}
    </div>
  );
}

const Index = () => {
  const [activeTab, setActiveTab] = useState('tasks');
  const [configOpen, setConfigOpen] = useState(false);
  const [pendingMemoId, setPendingMemoId] = useState(null);
  const [pendingTaskId, setPendingTaskId] = useState(null);
  const [floatNoteOpen, setFloatNoteOpen] = useState(false);
  const [floatTasks, setFloatTasks] = useState([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState('profile');

  const { user } = useAuth();

  // ── 移动端返回手势 / 浏览器后退支持 ──
  // 设计:
  //   - Index 不再主动 pushState/popstate(避免抢断子页面内部状态)
  //   - 子页面(任务详情、移动端阅读添加等)在打开时自己 pushState 一次,
  //     监听到 popstate 时关闭自身 → 浏览器回退时不会跳走 tab
  //   - Index 只在弹层(用户设置 / 悬浮梳理 / 配置)打开时,先尝试 history.back()
  //     让最近的子页面/弹层自己关闭,而不是直接 setActiveTab
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      // 让子页面/弹层自己处理;不主动切 tab
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // 弹层关闭:回退到上一层(让浏览器自己控制栈)
  // 弹层打开:不动 history(子页面/外层已 push 过)
  useEffect(() => {
    // 监听弹层变化:关闭时如果历史栈里有"弹层 push 的项",back 一步
    // 但这容易和子页面冲突,保守做法:什么都不做,弹层用 onClose 自管
  }, []);

  const handleNavClick = (id) => {
    setActiveTab(id);
    setConfigOpen(false);
    setSettingsOpen(false);
  };
  const openSettings = (section = 'profile') => {
    setSettingsSection(section);
    setSettingsOpen(true);
    setConfigOpen(false);
  };
  const handleGoToMemo = (memoId) => {
    setPendingMemoId(memoId);
    setActiveTab('memos');
    setConfigOpen(false);
  };
  const handleGoToTask = (taskId) => {
    setPendingTaskId(taskId);
    setActiveTab('tasks');
    setConfigOpen(false);
  };

  const renderPage = () => {
    if (settingsOpen) {
      return (
        <SettingsCenter
          onBack={() => setSettingsOpen(false)}
          defaultSection={settingsSection}
        />
      );
    }
    if (configOpen) {
      return (
        <div className='h-full overflow-y-auto bg-[#f5f5f5]'>
          <div className='max-w-3xl mx-auto px-4 py-6'>
            <div className='bg-white rounded-2xl border border-gray-100 p-5 shadow-sm'>
              <ConfigContent />
            </div>
          </div>
        </div>
      );
    }
    switch (activeTab) {
      case 'dashboard':
        return <DashboardPage onNavigate={handleNavClick} />;
      case 'tasks':
        return <TasksPage initialTaskId={pendingTaskId} onInitialTaskConsumed={() => setPendingTaskId(null)} onGoToMemo={handleGoToMemo} onTasksLoaded={setFloatTasks} />;
      case 'memos':
        return <MemosPage initialMemoId={pendingMemoId} onInitialMemoConsumed={() => setPendingMemoId(null)} onGoToTask={handleGoToTask} />;
      case 'reading':
        return <ReadingPage />;
      default:
        return <DashboardPage onNavigate={handleNavClick} />;
    }
  };

  return (
    <div className='flex flex-col h-screen-safe bg-[#f5f5f5] min-h-0'>
      {/* ══ 移动端顶部标题栏(适配刘海屏；设置中心全屏时隐藏) ══ */}
      {!settingsOpen && (
      <header
        className='md:hidden flex-shrink-0 bg-white flex items-center px-4 border-b border-gray-100'
        style={{ height: 'calc(44px + env(safe-area-inset-top, 0px) + 4px)', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2px)' }}
      >
        <img src='/logo.png' alt='AI-Buddy' className='h-7 w-7 rounded-md object-cover mr-2' />
        <span className='text-sm font-bold text-gray-800'>AI-Buddy</span>
        <span className='ml-auto text-xs text-gray-400'>
          {new Date().toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' })}
        </span>
      </header>
      )}

      {/* ══ PC 端顶部标题栏 ══ */}
      <header className='hidden md:flex flex-shrink-0 bg-white h-14 items-center pl-5 pr-5 border-b border-gray-100'>
        <div className='flex items-center gap-2'>
          <img src='/logo.png' alt='AI-Buddy' className='h-9 w-9 rounded-md object-cover' />
          <span className='text-base font-semibold text-gray-800 leading-none ml-1'>AI-Buddy</span>
          <span className='text-gray-200 select-none leading-none ml-2'>|</span>
          <span className='text-base font-medium text-gray-500 leading-none'>{settingsOpen ? '设置' : (configOpen ? pageTitles.config : pageTitles[activeTab])}</span>
        </div>
        <div className='ml-auto flex items-center gap-3'>
          <span className='text-xs text-gray-400'>
            {(() => {
              const now = new Date();
              const dateStr = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
              const startOfYear = new Date(now.getFullYear(), 0, 1);
              const dayOfYear = Math.floor((now - startOfYear) / 86400000) + 1;
              const weekNum = Math.ceil((dayOfYear + ((startOfYear.getDay() + 6) % 7)) / 7);
              return `${dateStr} · 第${weekNum}周`;
            })()}
          </span>
        </div>
      </header>

      {/* ══ 下方区域：左侧边栏 + 右侧内容 ══ */}
      <div className='flex flex-1 min-h-0 overflow-hidden'>
        {/* ── PC 紧凑左侧边栏 ── */}
        <aside className='hidden md:flex flex-col flex-shrink-0 bg-white border-r border-gray-100' style={{ width: 72 }}>
          {/* 主导航（不再包含梳理入口） */}
          <nav className='flex-1 flex flex-col items-center py-3 gap-1'>
            {navItems.map(({ id, label, icon: Icon }) => {
              const active = activeTab === id && !configOpen && !settingsOpen;
              return (
                <button
                  key={id}
                  onClick={() => handleNavClick(id)}
                  title={label}
                  className={`w-14 py-2 rounded-xl flex flex-col items-center gap-1 transition-all ${active ? 'text-[#2d4a00]' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}
                  style={active ? { backgroundColor: '#bbea3b' } : {}}
                >
                  <Icon className='h-4 w-4' />
                  <span className='text-[10px] font-medium leading-none'>{label}</span>
                </button>
              );
            })}
          </nav>

          {/* 左下角：头像（点击进入设置中心） */}
          <div className='border-t border-gray-100 py-3 flex flex-col items-center gap-1'>
            <button
              onClick={() => openSettings('profile')}
              title='个人设置 / 设置中心'
              className={`w-14 py-2 rounded-xl flex flex-col items-center gap-1 transition-all ${settingsOpen ? 'text-[#2d4a00]' : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50'}`}
              style={settingsOpen ? { backgroundColor: '#bbea3b' } : {}}
            >
              <div className='w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white text-xs font-semibold overflow-hidden'>
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt='avatar' className='w-full h-full object-cover' />
                ) : (
                  (user?.nickname || user?.username || 'U')[0].toUpperCase()
                )}
              </div>
              <span className='text-[10px] font-medium leading-none truncate max-w-[50px]'>{user?.nickname || user?.username || '我'}</span>
            </button>
          </div>
        </aside>

        {/* ── 右侧页面内容 ── */}
        <main className='flex-1 overflow-hidden min-h-0'>{renderPage()}</main>
      </div>

      {/* ══ 移动端底部导航(适配底部小白条 + 各种 iOS WebClip 状态；设置中心全屏时隐藏) ══ */}
      {!settingsOpen && (
      <nav
        className='md:hidden flex-shrink-0 bg-white border-t border-gray-100 flex items-stretch z-30'
        style={{ height: 'calc(56px + env(safe-area-inset-bottom, 0px) + 8px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)' }}
      >
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id && !configOpen && !settingsOpen;
          return (
            <button key={id} onClick={() => handleNavClick(id)} className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative ${active ? 'text-gray-900' : 'text-gray-400'}`}>
              {active && <span className='absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full' style={{ backgroundColor: '#bbea3b' }} />}
              <Icon className={`h-5 w-5 ${active ? 'stroke-[2px]' : 'stroke-[1.5px]'}`} style={active ? { color: '#5a7a00' } : {}} />
              <span className={`text-[11px] ${active ? 'font-semibold' : 'font-normal'}`} style={active ? { color: '#5a7a00' } : {}}>{label}</span>
            </button>
          );
        })}

        {/* 移动端梳理入口 */}
        <button
          onClick={() => setFloatNoteOpen((v) => !v)}
          className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative ${floatNoteOpen ? 'text-gray-900' : 'text-gray-400'}`}
        >
          {floatNoteOpen && <span className='absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full' style={{ backgroundColor: '#bbea3b' }} />}
          <NotebookPen className={`h-5 w-5 ${floatNoteOpen ? 'stroke-[2px]' : 'stroke-[1.5px]'}`} style={floatNoteOpen ? { color: '#5a7a00' } : {}} />
          <span className={`text-[11px] ${floatNoteOpen ? 'font-semibold' : 'font-normal'}`} style={floatNoteOpen ? { color: '#5a7a00' } : {}}>梳理</span>
        </button>

        {/* 移动端设置入口（头像，进入设置中心） */}
        <button onClick={() => openSettings('profile')} className={`flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors relative ${settingsOpen ? 'text-gray-900' : 'text-gray-400'}`}>
          {settingsOpen && <span className='absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b-full' style={{ backgroundColor: '#bbea3b' }} />}
          <div className='h-5 w-5 rounded-full bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center text-white text-[9px] font-semibold overflow-hidden'>
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt='avatar' className='w-full h-full object-cover' />
            ) : (
              (user?.nickname || user?.username || 'U')[0].toUpperCase()
            )}
          </div>
          <span className={`text-[11px] ${settingsOpen ? 'font-semibold' : 'font-normal'}`} style={settingsOpen ? { color: '#5a7a00' } : {}}>我的</span>
        </button>
      </nav>
      )}

      {/* ══ PC 端悬浮 FAB 按钮（梳理） ══ */}
      <FloatFAB active={floatNoteOpen} onClick={() => setFloatNoteOpen((v) => !v)} />

      {/* ══ 悬浮梳理面板 ══ */}
      <FloatNotePanel
        open={floatNoteOpen}
        onClose={() => setFloatNoteOpen(false)}
        tasks={floatTasks}
        onSelectTask={null}
      />
    </div>
  );
};
export default Index;

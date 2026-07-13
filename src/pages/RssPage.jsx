import { useState, useEffect, useRef, useCallback } from "react";
import {
  Plus, Rss, ExternalLink, Check, Loader2, Star, Trash2, Menu, X,
  ChevronDown, RefreshCw, Pencil, Copy, Clock, List as ListIcon, Layers,
  AlertTriangle, Search, Globe, CheckCircle2, XCircle, Settings2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── 工具 ────────────────────────────────────────────────────────
function getAuthHeaders(json = false) {
  const headers = {};
  try {
    const token = localStorage.getItem('ai_buddy_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch {}
  if (json) headers['Content-Type'] = 'application/json';
  return headers;
}

async function api(path, options = {}) {
  const opts = {
    credentials: 'include',
    ...options,
    headers: { ...getAuthHeaders(!!options.body), ...(options.headers || {}) },
  };
  if (options.body && typeof options.body === 'object') {
    opts.body = JSON.stringify(options.body);
  }
  const res = await fetch(path, opts);
  if (res.status === 401) {
    try { localStorage.removeItem('ai_buddy_token'); } catch {}
    if (window.location.hash !== '#/login') window.location.hash = '#/login';
  }
  return res.json();
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} 天前`;
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric' });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const COLOR_OPTIONS = ['#bbea3b', '#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444', '#6b7280'];

// ════════════════════════════════════════════════════════════════════
// 主组件
// ════════════════════════════════════════════════════════════════════
const RssPage = () => {
  const [sources, setSources] = useState([]);
  const [articles, setArticles] = useState([]);
  const [groupedArticles, setGroupedArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [articlesLoading, setArticlesLoading] = useState(false);

  // 过滤
  const [activeSourceId, setActiveSourceId] = useState('all'); // 'all' / 'unread' / 'starred' / <source_id>
  // 视图：'timeline' 时间线 / 'grouped' 按源分组
  const [view, setView] = useState('timeline');
  // 排序方向（仅时间线视图生效）
  const [sortDir, setSortDir] = useState('desc'); // 'desc' / 'asc'
  const [search, setSearch] = useState('');

  // 抽屉（移动端）
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 添加 / 编辑 订阅源
  const [isSourceDialogOpen, setIsSourceDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState(null);
  const [sourceForm, setSourceForm] = useState({ url: '', name: '', color: '#bbea3b', description: '' });
  const [previewing, setPreviewing] = useState(false);
  const [previewResult, setPreviewResult] = useState(null);
  const [savingSource, setSavingSource] = useState(false);

  // 刷新全部
  const [refreshingAll, setRefreshingAll] = useState(false);

  // 文章详情
  const [openArticle, setOpenArticle] = useState(null);

  // 删除确认
  const [deleteSourceId, setDeleteSourceId] = useState(null);
  const [deleteArticleId, setDeleteArticleId] = useState(null);

  // 复制反馈
  const [copyToast, setCopyToast] = useState('');

  // 自动刷新定时器
  const pollRef = useRef(null);

  // ── 拉取源列表 ──
  const fetchSources = useCallback(async () => {
    const json = await api('/api/rss/sources');
    if (json.error) {
      toast.error(`加载源失败：${json.error.message}`);
      return [];
    }
    setSources(json.data || []);
    return json.data || [];
  }, []);

  // ── 拉取文章（时间线） ──
  const fetchArticles = useCallback(async () => {
    setArticlesLoading(true);
    const params = new URLSearchParams();
    if (activeSourceId === 'unread') params.set('is_read', 'false');
    else if (activeSourceId === 'starred') params.set('is_starred', 'true');
    else if (activeSourceId !== 'all') params.set('source_id', activeSourceId);
    if (search) params.set('q', search);
    params.set('order', 'published_at');
    params.set('dir', sortDir);
    params.set('limit', '200');
    const json = await api(`/api/rss/articles?${params.toString()}`);
    setArticlesLoading(false);
    if (json.error) {
      toast.error(`加载文章失败：${json.error.message}`);
      return;
    }
    setArticles(json.data || []);
  }, [activeSourceId, search, sortDir]);

  // ── 拉取文章（分组） ──
  const fetchGrouped = useCallback(async () => {
    setArticlesLoading(true);
    const params = new URLSearchParams();
    if (activeSourceId === 'unread') params.set('is_read', 'false');
    else if (activeSourceId === 'starred') params.set('is_starred', 'true');
    params.set('limit', '20');
    const json = await api(`/api/rss/articles/grouped?${params.toString()}`);
    setArticlesLoading(false);
    if (json.error) {
      toast.error(`加载文章失败：${json.error.message}`);
      return;
    }
    setGroupedArticles(json.data || []);
  }, [activeSourceId]);

  // 初始化
  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchSources();
      setLoading(false);
    })();
  }, [fetchSources]);

  // 过滤/视图变化 → 重新拉取
  useEffect(() => {
    if (loading) return;
    if (view === 'grouped') {
      fetchGrouped();
    } else {
      fetchArticles();
    }
  }, [view, activeSourceId, search, sortDir, loading, fetchArticles, fetchGrouped]);

  // 自动轮询（每 30s 刷新源状态和文章列表，仅当无 dialog 打开时）
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      if (isSourceDialogOpen || openArticle || deleteSourceId || deleteArticleId) return;
      // 静默刷新（不触发 loading）
      const newSources = await fetchSources();
      // 若有源正在 pending 状态，继续轮询；否则降频
      const hasPending = newSources.some(s => s.last_status === 'pending');
      if (view === 'grouped') {
        fetchGrouped();
      } else {
        fetchArticles();
      }
    }, 30000);
    return () => clearInterval(pollRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, isSourceDialogOpen, openArticle, deleteSourceId, deleteArticleId, activeSourceId, search, sortDir]);

  // ── 源操作 ──────────────────────────────────────────────────────
  const openAddSource = () => {
    setEditingSource(null);
    setSourceForm({ url: '', name: '', color: '#bbea3b', description: '' });
    setPreviewResult(null);
    setIsSourceDialogOpen(true);
  };

  const openEditSource = (src) => {
    setEditingSource(src);
    setSourceForm({
      url: src.url || '',
      name: src.name || '',
      color: src.color || '#bbea3b',
      description: src.description || '',
    });
    setPreviewResult(null);
    setIsSourceDialogOpen(true);
  };

  const handlePreviewSource = async () => {
    const url = sourceForm.url.trim();
    if (!url) return;
    setPreviewing(true);
    setPreviewResult(null);
    try {
      const json = await api('/api/rss/preview', { method: 'POST', body: { url } });
      if (json.error) throw new Error(json.error.message);
      setPreviewResult(json.data);
      // 回填名称（如果用户没填）
      if (!sourceForm.name && json.data?.title) {
        setSourceForm(prev => ({ ...prev, name: json.data.title }));
      }
    } catch (e) {
      setPreviewResult({ error: e.message });
    } finally {
      setPreviewing(false);
    }
  };

  const handleSaveSource = async () => {
    const url = sourceForm.url.trim();
    if (!url) { toast.error('请填写订阅源 URL'); return; }
    setSavingSource(true);
    try {
      if (editingSource) {
        const json = await api(`/api/rss/sources/${editingSource.id}`, { method: 'PATCH', body: sourceForm });
        if (json.error) throw new Error(json.error.message);
        toast.success('已更新订阅源');
      } else {
        const json = await api('/api/rss/sources', { method: 'POST', body: sourceForm });
        if (json.error) throw new Error(json.error.message);
        toast.success('已添加订阅源，正在后台抓取…');
      }
      setIsSourceDialogOpen(false);
      await fetchSources();
      // 立即触发一次文章列表刷新
      if (view === 'grouped') fetchGrouped();
      else fetchArticles();
    } catch (e) {
      toast.error(`保存失败：${e.message}`);
    } finally {
      setSavingSource(false);
    }
  };

  const handleDeleteSource = async (id) => {
    setDeleteSourceId(null);
    try {
      const json = await api(`/api/rss/sources/${id}`, { method: 'DELETE' });
      if (json.error) throw new Error(json.error.message);
      toast.success('已删除订阅源');
      if (activeSourceId === String(id)) setActiveSourceId('all');
      await fetchSources();
      if (view === 'grouped') fetchGrouped();
      else fetchArticles();
    } catch (e) {
      toast.error(`删除失败：${e.message}`);
    }
  };

  const handleRefreshSource = async (id) => {
    try {
      const json = await api(`/api/rss/sources/${id}/refresh`, { method: 'POST' });
      if (json.error) throw new Error(json.error.message);
      toast.info('正在后台抓取，稍后会自动刷新列表');
      // 立即标记状态为 pending
      setSources(prev => prev.map(s => s.id === id ? { ...s, last_status: 'pending' } : s));
      // 5 秒后刷新一次
      setTimeout(() => {
        fetchSources();
        if (view === 'grouped') fetchGrouped();
        else fetchArticles();
      }, 5000);
    } catch (e) {
      toast.error(`刷新失败：${e.message}`);
    }
  };

  const handleRefreshAll = async () => {
    setRefreshingAll(true);
    try {
      // 标记所有源为 pending
      setSources(prev => prev.map(s => ({ ...s, last_status: 'pending' })));
      // 串行触发
      for (const s of sources) {
        await api(`/api/rss/sources/${s.id}/refresh`, { method: 'POST' }).catch(() => {});
        await new Promise(r => setTimeout(r, 500));
      }
      toast.info('已开始刷新所有订阅源');
      // 10 秒后刷新一次
      setTimeout(() => {
        fetchSources();
        if (view === 'grouped') fetchGrouped();
        else fetchArticles();
      }, 10000);
    } finally {
      setRefreshingAll(false);
    }
  };

  // ── 文章操作 ────────────────────────────────────────────────────
  const toggleArticleRead = async (article) => {
    // 乐观更新
    const newVal = !article.is_read;
    const updater = (a) => a.id === article.id ? { ...a, is_read: newVal } : a;
    if (view === 'grouped') {
      setGroupedArticles(prev => prev.map(g => ({ ...g, articles: g.articles.map(updater) })));
    } else {
      setArticles(prev => prev.map(updater));
    }
    try {
      const json = await api(`/api/rss/articles/${article.id}`, { method: 'PATCH', body: { is_read: newVal } });
      if (json.error) throw new Error(json.error.message);
    } catch (e) {
      // 回滚
      const rollback = (a) => a.id === article.id ? { ...a, is_read: article.is_read } : a;
      if (view === 'grouped') {
        setGroupedArticles(prev => prev.map(g => ({ ...g, articles: g.articles.map(rollback) })));
      } else {
        setArticles(prev => prev.map(rollback));
      }
      toast.error(`更新失败：${e.message}`);
    }
  };

  const toggleArticleStar = async (article) => {
    const newVal = !article.is_starred;
    const updater = (a) => a.id === article.id ? { ...a, is_starred: newVal } : a;
    if (view === 'grouped') {
      setGroupedArticles(prev => prev.map(g => ({ ...g, articles: g.articles.map(updater) })));
    } else {
      setArticles(prev => prev.map(updater));
    }
    try {
      const json = await api(`/api/rss/articles/${article.id}`, { method: 'PATCH', body: { is_starred: newVal } });
      if (json.error) throw new Error(json.error.message);
    } catch (e) {
      const rollback = (a) => a.id === article.id ? { ...a, is_starred: article.is_starred } : a;
      if (view === 'grouped') {
        setGroupedArticles(prev => prev.map(g => ({ ...g, articles: g.articles.map(rollback) })));
      } else {
        setArticles(prev => prev.map(rollback));
      }
      toast.error(`更新失败：${e.message}`);
    }
  };

  const handleDeleteArticle = async (id) => {
    setDeleteArticleId(null);
    try {
      const json = await api(`/api/rss/articles/${id}`, { method: 'DELETE' });
      if (json.error) throw new Error(json.error.message);
      // 移除本地
      if (view === 'grouped') {
        setGroupedArticles(prev => prev.map(g => ({ ...g, articles: g.articles.filter(a => a.id !== id) })));
      } else {
        setArticles(prev => prev.filter(a => a.id !== id));
      }
      // 刷新源统计
      fetchSources();
      toast.success('已删除');
    } catch (e) {
      toast.error(`删除失败：${e.message}`);
    }
  };

  const handleCopyUrl = async (article) => {
    const text = article.url || '';
    try {
      await navigator.clipboard.writeText(text);
      setCopyToast(`已复制：${text.slice(0, 60)}${text.length > 60 ? '...' : ''}`);
      setTimeout(() => setCopyToast(''), 2500);
    } catch (e) {
      setCopyToast(`复制失败：${e.message}`);
      setTimeout(() => setCopyToast(''), 2500);
    }
  };

  // ── 统计 ──
  const totalCount = sources.reduce((s, src) => s + (src.article_count || 0), 0);
  const sourceMap = Object.fromEntries(sources.map(s => [s.id, s]));

  // 时间线视图文章
  const timelineArticles = articles;

  // 分组视图文章（已服务端分组）
  // ── 侧边栏内容 ──
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">订阅</span>
        <button
          onClick={openAddSource}
          title="添加订阅源"
          className="p-1 rounded-md text-gray-400 hover:text-[#2d4a00] hover:bg-[#bbea3b33] transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <SideItem
          active={activeSourceId === 'all'}
          onClick={() => { setActiveSourceId('all'); setSidebarOpen(false); }}
          label="全部"
          count={totalCount}
          icon={<Rss className="h-3.5 w-3.5" />}
          color="#6b7280"
        />
        <SideItem
          active={activeSourceId === 'unread'}
          onClick={() => { setActiveSourceId('unread'); setSidebarOpen(false); }}
          label="未读"
          count={articles.filter(a => !a.is_read).length || (activeSourceId === 'unread' ? articles.length : 0)}
          icon={<Check className="h-3.5 w-3.5" />}
          color="#10b981"
        />
        <SideItem
          active={activeSourceId === 'starred'}
          onClick={() => { setActiveSourceId('starred'); setSidebarOpen(false); }}
          label="星标"
          count={articles.filter(a => a.is_starred).length || (activeSourceId === 'starred' ? articles.length : 0)}
          icon={<Star className="h-3.5 w-3.5" />}
          color="#f59e0b"
        />

        {sources.length > 0 && <div className="mx-3 my-2 border-t border-gray-100" />}

        {sources.map((src) => (
          <SourceSideItem
            key={src.id}
            source={src}
            active={activeSourceId === String(src.id)}
            onClick={() => { setActiveSourceId(String(src.id)); setSidebarOpen(false); }}
            onRefresh={() => handleRefreshSource(src.id)}
            onEdit={() => openEditSource(src)}
            onDelete={() => setDeleteSourceId(src.id)}
          />
        ))}

        {sources.length === 0 && !loading && (
          <div className="px-4 py-6 text-center">
            <Rss className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-400">还没有订阅源</p>
            <button
              onClick={openAddSource}
              className="mt-3 px-3 py-1.5 rounded-md text-xs font-medium border-0"
              style={{ backgroundColor: '#bbea3b', color: '#2d4a00' }}
            >
              + 添加第一个订阅
            </button>
          </div>
        )}
      </div>

      {sources.length > 0 && (
        <div className="border-t border-gray-100 p-2 flex-shrink-0">
          <button
            onClick={handleRefreshAll}
            disabled={refreshingAll}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {refreshingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            刷新全部
          </button>
        </div>
      )}
    </div>
  );

  // ── 渲染 ──
  return (
    <div className="h-full flex overflow-hidden relative">
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 bg-black/40 z-30" onClick={() => setSidebarOpen(false)} />
      )}
      <div className={`
        md:hidden fixed top-0 left-0 h-full w-64 bg-white z-40 shadow-xl
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex items-center justify-between px-4 h-12 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-900">订阅源</span>
          <button onClick={() => setSidebarOpen(false)} className="p-1 text-gray-400">
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent />
      </div>

      <aside className="hidden md:flex flex-col w-56 flex-shrink-0 border-r border-gray-100 bg-white overflow-y-auto">
        <SidebarContent />
      </aside>

      <div className="flex-1 overflow-y-auto bg-[#f5f5f5] min-w-0">
        <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-3 md:py-5">

          {/* 顶部工具栏 */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {/* 移动端：菜单按钮 */}
            <button
              className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 flex-shrink-0"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-4 w-4" />
              <span className="max-w-[80px] truncate">
                {activeSourceId === 'all' ? '全部' :
                 activeSourceId === 'unread' ? '未读' :
                 activeSourceId === 'starred' ? '星标' :
                 (sourceMap[activeSourceId]?.name || '订阅')}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </button>

            {/* 视图切换 */}
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
              <button
                onClick={() => setView('timeline')}
                className={`flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${
                  view === 'timeline' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
                title="时间线视图"
              >
                <Clock className="h-3.5 w-3.5" />
                时间线
              </button>
              <button
                onClick={() => setView('grouped')}
                className={`flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium transition-colors ${
                  view === 'grouped' ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                }`}
                title="按订阅源分组"
              >
                <Layers className="h-3.5 w-3.5" />
                分组
              </button>
            </div>

            {/* 排序方向（仅时间线视图生效） */}
            {view === 'timeline' && (
              <button
                onClick={() => setSortDir(prev => prev === 'desc' ? 'asc' : 'desc')}
                className="flex items-center gap-1 h-8 px-2.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50"
                title={sortDir === 'desc' ? '当前：最新优先' : '当前：最早优先'}
              >
                {sortDir === 'desc' ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5 rotate-180" />}
                {sortDir === 'desc' ? '最新' : '最早'}
              </button>
            )}

            {/* 搜索框 */}
            <div className="relative flex-1 min-w-[150px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索标题..."
                className="w-full h-8 pl-8 pr-3 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-gray-300"
              />
            </div>

            {/* 刷新按钮（醒目，触发全部源抓取 + 重新拉取列表） */}
            <button
              onClick={handleRefreshAll}
              disabled={refreshingAll || sources.length === 0}
              className="flex items-center gap-1.5 h-8 px-3 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 active:scale-95 transition-transform flex-shrink-0"
              title="刷新所有订阅源并重新加载列表"
            >
              {refreshingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="hidden sm:inline">{refreshingAll ? '刷新中...' : '刷新'}</span>
            </button>

            {/* 添加按钮 */}
            <button
              onClick={openAddSource}
              className="hidden md:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium border-0 active:scale-95 transition-transform flex-shrink-0"
              style={{ backgroundColor: '#bbea3b', color: '#2d4a00' }}
            >
              <Plus className="h-4 w-4" />
              添加订阅
            </button>
          </div>

          {/* 文章列表 */}
          {loading ? (
            <SkeletonList />
          ) : view === 'timeline' ? (
            <TimelineView
              articles={timelineArticles}
              loading={articlesLoading}
              sourceMap={sourceMap}
              onToggleRead={toggleArticleRead}
              onToggleStar={toggleArticleStar}
              onDelete={(a) => setDeleteArticleId(a.id)}
              onOpen={(a) => setOpenArticle(a)}
              onCopy={handleCopyUrl}
            />
          ) : (
            <GroupedView
              groups={groupedArticles}
              loading={articlesLoading}
              onToggleRead={toggleArticleRead}
              onToggleStar={toggleArticleStar}
              onDelete={(a) => setDeleteArticleId(a.id)}
              onOpen={(a) => setOpenArticle(a)}
              onCopy={handleCopyUrl}
              onRefreshSource={(srcId) => handleRefreshSource(srcId)}
            />
          )}

          {/* 移动端 FAB */}
          <button
            className="md:hidden fixed z-30 right-4 bottom-[calc(56px+env(safe-area-inset-bottom,0px)+16px)] flex items-center justify-center h-14 w-14 rounded-full shadow-xl border-0 active:scale-95 transition-transform"
            style={{ backgroundColor: '#bbea3b', color: '#2d4a00' }}
            onClick={openAddSource}
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* 复制反馈 */}
      {copyToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2">
          <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
          <span className="truncate">{copyToast}</span>
        </div>
      )}

      {/* 添加 / 编辑 订阅源 */}
      <Dialog open={isSourceDialogOpen} onOpenChange={(open) => { setIsSourceDialogOpen(open); if (!open) setPreviewResult(null); }}>
        <DialogContent className="w-full max-w-lg mx-auto sm:rounded-xl rounded-none sm:max-h-[90dvh] max-h-[100dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rss className="h-4 w-4" />
              {editingSource ? '编辑订阅源' : '添加订阅源'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">订阅源 URL *</label>
              <div className="flex gap-2">
                <Input
                  type="url"
                  value={sourceForm.url}
                  onChange={(e) => setSourceForm(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://www.jiqizhixin.com/rss"
                  disabled={!!editingSource}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreviewSource}
                  disabled={previewing || !sourceForm.url.trim()}
                  className="flex-shrink-0"
                >
                  {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : '预览'}
                </Button>
              </div>
              <p className="text-xs text-gray-400 mt-1">支持 RSS 2.0 / Atom 格式</p>
            </div>

            {/* 预览结果 */}
            {previewResult && (
              <div className={`border rounded-lg p-3 text-xs ${
                previewResult.error
                  ? 'bg-red-50 border-red-200 text-red-600'
                  : 'bg-green-50 border-green-200 text-green-700'
              }`}>
                {previewResult.error ? (
                  <div className="flex items-center gap-1.5">
                    <XCircle className="h-3.5 w-3.5" />
                    预览失败：{previewResult.error}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {previewResult.title || '(无标题)'}
                    </div>
                    {previewResult.description && (
                      <div className="text-green-600 line-clamp-2">{previewResult.description}</div>
                    )}
                    <div className="text-green-600">
                      检测到 {previewResult.sample_count || 0} 篇文章
                    </div>
                    {previewResult.sample_items?.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-green-600/80">
                        {previewResult.sample_items.slice(0, 3).map((it, i) => (
                          <li key={i} className="truncate">· {it.title}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-1.5 block">名称（留空自动获取）</label>
              <Input
                value={sourceForm.name}
                onChange={(e) => setSourceForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如：机器之心"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">颜色</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSourceForm(prev => ({ ...prev, color: c }))}
                    className={`w-7 h-7 rounded-full transition-all ${
                      sourceForm.color === c ? 'ring-2 ring-offset-2 ring-gray-400' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setIsSourceDialogOpen(false)}>取消</Button>
              <Button
                type="button"
                onClick={handleSaveSource}
                disabled={savingSource || !sourceForm.url.trim()}
                className="border-0"
                style={{ backgroundColor: '#bbea3b', color: '#2d4a00' }}
              >
                {savingSource && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {editingSource ? '保存' : '添加并抓取'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 文章详情 */}
      <Dialog open={!!openArticle} onOpenChange={(open) => { if (!open) setOpenArticle(null); }}>
        <DialogContent className="w-full max-w-2xl mx-auto sm:rounded-xl rounded-none sm:max-h-[90dvh] max-h-[100dvh] overflow-y-auto">
          {openArticle && (
            <ArticleDetail
              article={openArticle}
              source={sourceMap[openArticle.source_id]}
              onToggleRead={() => { toggleArticleRead(openArticle); setOpenArticle(null); }}
              onToggleStar={() => { toggleArticleStar(openArticle); setOpenArticle(null); }}
              onCopy={() => handleCopyUrl(openArticle)}
              onClose={() => setOpenArticle(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 删除订阅源确认 */}
      <AlertDialog open={!!deleteSourceId} onOpenChange={(open) => { if (!open) setDeleteSourceId(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              确认删除订阅源？
            </AlertDialogTitle>
            <AlertDialogDescription>
              删除后该订阅源下所有文章都会被一并删除，且无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white border-0"
              onClick={() => handleDeleteSource(deleteSourceId)}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 删除文章确认 */}
      <AlertDialog open={!!deleteArticleId} onOpenChange={(open) => { if (!open) setDeleteArticleId(null); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              删除这篇文章？
            </AlertDialogTitle>
            <AlertDialogDescription>
              删除后该文章将永久从你的 RSS 阅读列表中移除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600 text-white border-0"
              onClick={() => handleDeleteArticle(deleteArticleId)}
            >
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════
// 子组件
// ════════════════════════════════════════════════════════════════════

function SideItem({ active, onClick, label, count, icon, color }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left ${
        active ? 'font-medium' : 'text-gray-600 hover:bg-gray-50 active:bg-gray-100'
      }`}
      style={active ? { backgroundColor: '#bbea3b33', color: '#2d4a00' } : {}}
    >
      <span style={{ color }} className="flex-shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count > 0 && (
        <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">{count}</span>
      )}
    </button>
  );
}

function SourceSideItem({ source, active, onClick, onRefresh, onEdit, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef(null);

  // 点击外部关闭
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  const status = source.last_status;
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left ${
          active ? 'font-medium' : 'text-gray-600 hover:bg-gray-50 active:bg-gray-100'
        }`}
        style={active ? { backgroundColor: '#bbea3b33', color: '#2d4a00' } : {}}
      >
        <span
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: source.color || '#6b7280' }}
        />
        <span className="flex-1 truncate">{source.name || '(未命名)'}</span>
        {/* 状态指示 */}
        {status === 'pending' && (
          <Loader2 className="h-3 w-3 text-gray-400 animate-spin flex-shrink-0" />
        )}
        {status === 'error' && (
          <span title={source.last_error || '抓取失败'} className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
        )}
        <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">{source.article_count || 0}</span>
        {/* 菜单触发 */}
        <span
          role="button"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
          className="p-0.5 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 flex-shrink-0"
          title="更多操作"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </span>
      </button>
      {menuOpen && (
        <div className="absolute right-2 top-full mt-1 z-10 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px]">
          <button
            onClick={() => { setMenuOpen(false); onRefresh(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-3 w-3" /> 刷新
          </button>
          <button
            onClick={() => { setMenuOpen(false); onEdit(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
          >
            <Pencil className="h-3 w-3" /> 编辑
          </button>
          <button
            onClick={() => { setMenuOpen(false); onDelete(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-3 w-3" /> 删除
          </button>
        </div>
      )}
    </div>
  );
}

function SkeletonList() {
  return (
    <div className="flex flex-col divide-y divide-gray-100 bg-white rounded-xl border border-gray-100 overflow-hidden">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="flex gap-3 p-3">
          <div className="w-[68px] h-[68px] rounded-lg bg-gray-100 animate-pulse flex-shrink-0" />
          <div className="flex-1 min-w-0 flex flex-col gap-2 py-1">
            <div className="h-4 bg-gray-100 rounded animate-pulse w-3/4" />
            <div className="h-3 bg-gray-100 rounded animate-pulse w-full" />
            <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function TimelineView({ articles, loading, sourceMap, onToggleRead, onToggleStar, onDelete, onOpen, onCopy }) {
  if (loading && articles.length === 0) return <SkeletonList />;
  if (articles.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-10 md:p-16 text-center">
        <Rss className="h-10 w-10 md:h-12 md:w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">暂无文章</p>
        <p className="text-gray-300 text-xs mt-1">添加订阅源后将自动抓取最新文章</p>
      </div>
    );
  }
  return (
    <div className="flex flex-col divide-y divide-gray-100 bg-white rounded-xl border border-gray-100 overflow-hidden">
      {articles.map(article => (
        <ArticleRow
          key={article.id}
          article={article}
          source={sourceMap[article.source_id]}
          onToggleRead={() => onToggleRead(article)}
          onToggleStar={() => onToggleStar(article)}
          onDelete={() => onDelete(article)}
          onOpen={() => onOpen(article)}
          onCopy={() => onCopy(article)}
        />
      ))}
    </div>
  );
}

function GroupedView({ groups, loading, onToggleRead, onToggleStar, onDelete, onOpen, onCopy, onRefreshSource }) {
  if (loading && groups.length === 0) return <SkeletonList />;
  if (groups.length === 0 || groups.every(g => g.articles.length === 0)) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-10 md:p-16 text-center">
        <Layers className="h-10 w-10 md:h-12 md:w-12 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-400 text-sm">暂无文章</p>
        <p className="text-gray-300 text-xs mt-1">添加订阅源后将自动抓取最新文章</p>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {groups.map(group => (
        <GroupBlock
          key={group.source.id}
          group={group}
          onToggleRead={onToggleRead}
          onToggleStar={onToggleStar}
          onDelete={onDelete}
          onOpen={onOpen}
          onCopy={onCopy}
          onRefresh={() => onRefreshSource(group.source.id)}
        />
      ))}
    </div>
  );
}

function GroupBlock({ group, onToggleRead, onToggleStar, onDelete, onOpen, onCopy, onRefresh }) {
  const { source, articles } = group;
  if (!articles || articles.length === 0) return null;
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* 分组标题 */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/50">
        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: source.color || '#6b7280' }} />
        <span className="font-semibold text-gray-800 text-sm flex-1 truncate">{source.name || '(未命名)'}</span>
        <span className="text-xs text-gray-400 tabular-nums">{source.article_count || articles.length} 篇</span>
        {source.last_status === 'pending' && (
          <Loader2 className="h-3 w-3 text-gray-400 animate-spin" title="正在抓取" />
        )}
        {source.last_status === 'error' && (
          <span title={source.last_error || '抓取失败'}>
            <XCircle className="h-3.5 w-3.5 text-red-400" />
          </span>
        )}
        <button
          onClick={onRefresh}
          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100"
          title="刷新此源"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>
      {/* 文章列表 */}
      <div className="flex flex-col divide-y divide-gray-100">
        {articles.map(article => (
          <ArticleRow
            key={article.id}
            article={article}
            source={source}
            onToggleRead={() => onToggleRead(article)}
            onToggleStar={() => onToggleStar(article)}
            onDelete={() => onDelete(article)}
            onOpen={() => onOpen(article)}
            onCopy={() => onCopy(article)}
          />
        ))}
      </div>
    </div>
  );
}

function ArticleRow({ article, source, onToggleRead, onToggleStar, onDelete, onOpen, onCopy }) {
  const color = (source && source.color) || '#6b7280';
  return (
    <div className="group flex gap-3 px-3 py-3 sm:px-4 sm:py-3.5 hover:bg-gray-50 active:bg-gray-100 transition-colors">
      {/* 缩略图 */}
      <button
        onClick={onOpen}
        className="flex-shrink-0 block w-[64px] h-[44px] sm:w-[80px] sm:h-[56px] bg-gray-100 rounded-md overflow-hidden relative"
        title={article.title}
      >
        {article.cover_url ? (
          <img
            src={article.cover_url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              const ph = e.currentTarget.parentElement.querySelector('[data-fallback]');
              if (ph) ph.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          data-fallback
          className={`absolute inset-0 ${article.cover_url ? 'hidden' : 'flex'} items-center justify-center text-white`}
          style={{ backgroundColor: color }}
        >
          <Rss className="h-5 w-5" />
        </div>
      </button>

      {/* 中间：标题 + 摘要 + 元信息 */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {/* 标题行 */}
        <div className="flex items-start gap-1.5">
          <button
            onClick={onToggleRead}
            className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center transition-all ${
              article.is_read
                ? 'border-green-400 bg-green-400 text-white'
                : 'border-gray-300 hover:border-green-400 text-transparent hover:text-green-400'
            }`}
            title={article.is_read ? '标记未读' : '标记已读'}
          >
            <Check className="h-2.5 w-2.5" />
          </button>
          <button
            onClick={onOpen}
            className={`flex-1 min-w-0 font-semibold text-[15px] leading-snug line-clamp-2 text-left ${
              article.is_read ? 'text-gray-500' : 'text-gray-900'
            } hover:underline`}
          >
            {article.title}
          </button>
          <button
            onClick={onToggleStar}
            className={`flex-shrink-0 p-0.5 rounded transition-colors ${
              article.is_starred ? 'text-amber-400' : 'text-gray-300 hover:text-amber-400'
            }`}
            title={article.is_starred ? '取消星标' : '加星标'}
          >
            <Star className="h-4 w-4" fill={article.is_starred ? 'currentColor' : 'none'} />
          </button>
        </div>

        {/* 摘要 */}
        {article.summary ? (
          <p className="text-[13px] text-gray-500 leading-relaxed line-clamp-2 cursor-pointer" onClick={onOpen}>
            {article.summary}
          </p>
        ) : (
          <p className="text-[13px] text-gray-300 italic">暂无摘要</p>
        )}

        {/* 元信息 + 操作 */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          {source && (
            <span
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-white flex-shrink-0"
              style={{ backgroundColor: color }}
            >
              <Rss className="h-2.5 w-2.5" />
              {source.name}
            </span>
          )}
          {(article.categories || []).slice(0, 2).map((cat, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500 flex-shrink-0">
              {typeof cat === 'string' ? cat : (cat?.name || '')}
            </span>
          ))}
          <div className="flex-1" />
          <span className="text-xs text-gray-400 tabular-nums flex-shrink-0" title={formatDate(article.published_at)}>
            {timeAgo(article.published_at) || timeAgo(article.created_at)}
          </span>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 transition-colors"
              title="打开原文"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <button
              onClick={onCopy}
              className="p-1 rounded text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              title="复制链接"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onDelete}
              className="p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 transition-colors"
              title="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArticleDetail({ article, source, onToggleRead, onToggleStar, onCopy, onClose }) {
  const color = (source && source.color) || '#6b7280';
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 pr-8">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-xs font-normal text-gray-500">{source?.name || 'RSS'}</span>
        </DialogTitle>
      </DialogHeader>
      <div className="mt-2 space-y-3">
        {/* 标题 */}
        <h2 className={`text-lg font-bold leading-snug ${article.is_read ? 'text-gray-500' : 'text-gray-900'}`}>
          {article.title}
        </h2>

        {/* 元信息 */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
          {article.author && <span>{article.author}</span>}
          {article.author && <span>·</span>}
          <span>{formatDate(article.published_at)}</span>
          {article.url && (
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-indigo-600 hover:text-indigo-800"
            >
              <ExternalLink className="h-3 w-3" />
              打开原文
            </a>
          )}
        </div>

        {/* 分类标签 */}
        {(article.categories || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {(article.categories || []).map((cat, i) => (
              <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">
                {typeof cat === 'string' ? cat : (cat?.name || '')}
              </span>
            ))}
          </div>
        )}

        {/* 摘要 */}
        {article.summary && (
          <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
            {article.summary}
          </div>
        )}

        {/* 封面 */}
        {article.cover_url && (
          <img
            src={article.cover_url}
            alt=""
            className="w-full max-h-72 object-cover rounded-lg"
            referrerPolicy="no-referrer"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}

        {/* 底部操作 */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <Button
            type="button"
            variant="outline"
            onClick={onToggleRead}
            className="flex items-center gap-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            {article.is_read ? '标记未读' : '标记已读'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onToggleStar}
            className="flex items-center gap-1.5"
          >
            <Star className="h-3.5 w-3.5" fill={article.is_starred ? 'currentColor' : 'none'} />
            {article.is_starred ? '取消星标' : '加星标'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onCopy}
            className="flex items-center gap-1.5"
          >
            <Copy className="h-3.5 w-3.5" />
            复制链接
          </Button>
          <div className="flex-1" />
          <Button type="button" onClick={onClose}>关闭</Button>
        </div>
      </div>
    </>
  );
}

export default RssPage;

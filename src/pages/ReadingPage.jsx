import { useState, useEffect, useRef } from "react";
import {
  Plus, BookOpen, ExternalLink, Check, Loader2, Sparkles,
  Star, Tag, Trash2, Menu, X, ChevronDown, AlertTriangle,
  Wand2, Download, PlayCircle, FileText, Link as LinkIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { genId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── 平台图标 / 颜色映射 ──────────────────────────────────────
const PLATFORM_META = {
  douyin:       { label: '抖音',     color: '#fe2c55', Icon: PlayCircle },
  bilibili:     { label: 'B站',      color: '#fb7299', Icon: PlayCircle },
  xiaohongshu:  { label: '小红书',   color: '#ff2442', Icon: FileText },
  wechat:       { label: '公众号',   color: '#07c160', Icon: FileText },
  youtube:      { label: 'YouTube',  color: '#ff0000', Icon: PlayCircle },
  tiktok:       { label: 'TikTok',   color: '#010101', Icon: PlayCircle },
  kuaishou:     { label: '快手',     color: '#fed91b', Icon: PlayCircle },
  weibo:        { label: '微博',     color: '#e6162d', Icon: FileText },
  xigua:        { label: '西瓜',     color: '#ff6633', Icon: PlayCircle },
  zhihu:        { label: '知乎',     color: '#0084ff', Icon: FileText },
  twitter:      { label: 'X',        color: '#000000', Icon: FileText },
  facebook:     { label: 'Facebook', color: '#1877f2', Icon: FileText },
  instagram:    { label: 'IG',       color: '#e1306c', Icon: FileText },
  web:          { label: '网页',     color: '#6b7280', Icon: LinkIcon },
  other:        { label: '其他',     color: '#6b7280', Icon: LinkIcon },
};

function platformMeta(p) {
  return PLATFORM_META[p] || PLATFORM_META.other;
}

function tagStyle(color) {
  return {
    backgroundColor: color + "22",
    color: color,
    border: `1px solid ${color}44`,
  };
}

// 从 HTML 字符串提取标题和摘要
function extractFromHtml(html) {
  let title = "";
  const ogT = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i);
  if (ogT) title = ogT[1].trim();
  if (!title) {
    const tM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (tM) {
      title = tM[1]
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/\s+/g, " ").trim();
    }
  }
  let summary = "";
  const ogD = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i);
  if (ogD) summary = ogD[1].trim();
  if (!summary) {
    const mD = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
      || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
    if (mD) summary = mD[1].trim();
  }
  return { title: title.slice(0, 200), summary: summary.slice(0, 500) };
}

/**
 * 通过隐藏 iframe 加载目标 URL，利用浏览器当前登录态（Cookie）获取页面标题
 * - 同域：直接读 iframe.contentDocument.title
 * - 跨域：onload 后尝试读（SecurityError 时 catch，返回 null）
 * - 超时自动清理
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

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;width:1px;height:1px;top:-9999px;left:-9999px;opacity:0;pointer-events:none;border:none;";
    iframe.sandbox = "allow-scripts allow-same-origin allow-forms";
    iframe.referrerPolicy = "no-referrer";

    const timer = setTimeout(() => done(null), timeoutMs);

    iframe.onload = () => {
      clearTimeout(timer);
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        const t = doc?.title?.trim();
        if (t && !t.includes("登录") && !t.includes("Login") && !t.includes("login")) {
          done(t.slice(0, 200));
        } else {
          const h1 = doc?.querySelector("h1")?.textContent?.trim();
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

// ─── 解析 URL 标题和摘要（通过 iframe 获取）─────────────────────────
async function fetchUrlMeta(url) {
  if (!url || !url.startsWith("http")) return { title: "", summary: "" };
  const cleanUrl = url.trim();
  try { new URL(cleanUrl); } catch { return { title: "", summary: "" }; }

  try {
    const t = await fetchTitleViaIframe(cleanUrl, 8000);
    if (t) return { title: t, summary: "" };
  } catch { /* ignore */ }

  return { title: "", summary: "" };
}

// ─── AI 识别标签（已移除内网 edge function 依赖，暂返回空） ──────────
async function classifyWithAI(title, summary, url, tagNames) {
  // TODO: 接入外部 AI 接口实现自动分类
  return [];
}

// ════════════════════════════════════════════════════════════════════
// 主组件
// ════════════════════════════════════════════════════════════════════
const ReadingPage = () => {
  const [items, setItems] = useState([]);
  // 统一使用 task_tags 表
  const [tags, setTags] = useState([]);
  const [activeTag, setActiveTag] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [form, setForm] = useState({
    url: "", title: "", summary: "", cover_url: "", platform: "web",
    tags: [], is_read: false, is_starred: false, is_offline: false,
  });
  const [fetching, setFetching] = useState(false);
  const [fetchingTip, setFetchingTip] = useState("");
  const [classifying, setClassifying] = useState(false);
  const [shareInput, setShareInput] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const urlFetchedRef = useRef("");

  useEffect(() => {
    fetchItems();
    fetchTags();
  }, []);

  // ── 数据获取 ──────────────────────────────────────────────────────
  const fetchItems = async () => {
    const { data } = await supabase.from("reading_items").select("*").is("deleted_at", null).order("created_at", { ascending: false });
    setItems(data || []);
  };

  // 统一从 task_tags 读取标签
  const fetchTags = async () => {
    const { data } = await supabase.from("task_tags").select("*").order("created_at", { ascending: true });
    setTags(data || []);
  };

  // ── 文章操作 ──────────────────────────────────────────────────────
  // 粘贴抖音/B站/小红书等分享文本 → 一键解析
  const handleExtractShare = async () => {
    const text = shareInput.trim();
    if (!text) return;
    setExtracting(true);
    setExtractError("");
    setFetchingTip("正在识别分享内容…");
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ input: text }),
      });
      const json = await res.json();
      if (json.error || !json.data) {
        throw new Error(json.error?.message || '解析失败');
      }
      const d = json.data;
      if (d.code !== 200) {
        throw new Error(d.message || '解析失败');
      }
      setForm((prev) => ({
        ...prev,
        url: d.url || prev.url,
        title: d.title || prev.title,
        summary: d.summary || prev.summary,
        cover_url: d.cover_url || prev.cover_url,
        platform: d.platform || prev.platform,
      }));
      setFetchingTip("");
    } catch (e) {
      setExtractError(e.message);
      setFetchingTip("");
    } finally {
      setExtracting(false);
    }
  };

  const handleUrlBlur = async () => {
    const url = form.url.trim();
    if (!url || url === urlFetchedRef.current) return;
    try { new URL(url); } catch { return; }
    urlFetchedRef.current = url;
    setFetching(true);
    setFetchingTip("正在自动解析标题和摘要…");

    const { title, summary } = await fetchUrlMeta(url);
    const newTitle = title || form.title;
    const newSummary = summary || form.summary;

    setForm((prev) => ({ ...prev, title: newTitle, summary: newSummary }));
    setFetching(false);
    setFetchingTip("");

    if (tags.length > 0) {
      setClassifying(true);
      const picked = await classifyWithAI(newTitle, newSummary, url, tags.map((t) => t.name));
      const pickedIds = tags.filter((t) => picked.includes(t.name)).map((t) => t.id);
      setForm((prev) => ({ ...prev, tags: pickedIds }));
      setClassifying(false);
    }
  };

  const handleReClassify = async () => {
    if (!form.title && !form.summary) return;
    setClassifying(true);
    const picked = await classifyWithAI(form.title, form.summary, form.url, tags.map((t) => t.name));
    const pickedIds = tags.filter((t) => picked.includes(t.name)).map((t) => t.id);
    setForm((prev) => ({ ...prev, tags: pickedIds }));
    setClassifying(false);
  };

  const toggleFormTag = (tagId) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tagId) ? prev.tags.filter((id) => id !== tagId) : [...prev.tags, tagId],
    }));
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setDownloading(true);
    try {
      let insertData = { id: genId(), ...form };

      // 如果勾选"离线到本地"，先调 download 接口拿到 offline_path
      if (form.is_offline && (form.url || shareInput)) {
        const res = await fetch('/api/extract/download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ input: form.url || shareInput }),
        });
        const json = await res.json();
        if (json.error) {
          throw new Error(json.error.message || '离线下载失败');
        }
        if (json.data?.code === 200) {
          insertData.is_offline = true;
          insertData.offline_path = json.data.offline_path || null;
        } else {
          // 下载失败但仍可入阅读列表
          insertData.is_offline = false;
        }
      }

      await supabase.from("reading_items").insert([insertData]);
      fetchItems();
      setIsAddOpen(false);
      resetForm();
    } catch (e) {
      setExtractError(`保存失败：${e.message}`);
    } finally {
      setDownloading(false);
    }
  };

  const resetForm = () => {
    urlFetchedRef.current = "";
    setFetchingTip("");
    setExtractError("");
    setShareInput("");
    setForm({
      url: "", title: "", summary: "", cover_url: "", platform: "web",
      tags: [], is_read: false, is_starred: false, is_offline: false,
    });
  };

  const toggleRead = async (item) => {
    await supabase.from("reading_items").update({ is_read: !item.is_read }).eq("id", item.id);
    fetchItems();
  };

  const toggleStar = async (item) => {
    await supabase.from("reading_items").update({ is_starred: !item.is_starred }).eq("id", item.id);
    fetchItems();
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const handleDelete = async (id) => {
    const now = new Date().toISOString();
    // 软删除：只标记 deleted_at，不真正删除数据
    await supabase.from("reading_items").update({ deleted_at: now }).eq("id", id);
    setDeleteConfirmId(null);
    fetchItems();
  };

  // ── 过滤逻辑 ──────────────────────────────────────────────────────
  const filteredItems = items.filter((item) => {
    if (activeTag === "starred") { if (!item.is_starred) return false; }
    else if (activeTag !== "all") { if (!(item.tags || []).includes(activeTag)) return false; }
    if (readFilter === "unread") return !item.is_read;
    if (readFilter === "read") return item.is_read;
    if (platformFilter !== "all" && (item.platform || "web") !== platformFilter) return false;
    return true;
  });

  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t]));

  // ── 侧边栏内容（PC 和移动端抽屉共用） ────────────────────────────
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="px-3 pt-4 pb-2 flex items-center justify-between flex-shrink-0">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">分类</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        <SideItem
          active={activeTag === "all"}
          onClick={() => { setActiveTag("all"); setIsSidebarOpen(false); }}
          label="全部"
          count={items.length}
          icon={<BookOpen className="h-3.5 w-3.5" />}
          color="#6b7280"
        />
        <SideItem
          active={activeTag === "starred"}
          onClick={() => { setActiveTag("starred"); setIsSidebarOpen(false); }}
          label="星标"
          count={items.filter((i) => i.is_starred).length}
          icon={<Star className="h-3.5 w-3.5" />}
          color="#f59e0b"
        />

        {tags.length > 0 && <div className="mx-3 my-2 border-t border-gray-100" />}

        {tags.map((tag) => (
          <SideItem
            key={tag.id}
            active={activeTag === tag.id}
            onClick={() => { setActiveTag(tag.id); setIsSidebarOpen(false); }}
            label={tag.name}
            count={items.filter((i) => (i.tags || []).includes(tag.id)).length}
            icon={<Tag className="h-3.5 w-3.5" />}
            color={tag.color}
          />
        ))}
      </div>
    </div>
  );

  const activeTagLabel =
    activeTag === "all" ? "全部" :
    activeTag === "starred" ? "星标" :
    (tags.find((t) => t.id === activeTag)?.name || "全部");

  // ── 渲染 ──────────────────────────────────────────────────────────
  return (
    <div className="h-full flex overflow-hidden relative">

      {isSidebarOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 z-30"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div className={`
        md:hidden fixed top-0 left-0 h-full w-64 bg-white z-40 shadow-xl
        transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        <div className="flex items-center justify-between px-4 h-12 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-900">分类筛选</span>
          <button onClick={() => setIsSidebarOpen(false)} className="p-1 text-gray-400">
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent />
      </div>

      <aside className="hidden md:flex flex-col w-52 flex-shrink-0 border-r border-gray-100 bg-white overflow-y-auto">
        <SidebarContent />
      </aside>

      <div className="flex-1 overflow-y-auto bg-[#f5f5f5] min-w-0">
        <div className="w-full max-w-[1200px] mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-3 md:py-5">

          <div className="flex items-center gap-2 mb-4">
            <button
              className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 flex-shrink-0"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="h-4 w-4" />
              <span className="max-w-[80px] truncate">{activeTagLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </button>

            <div className="flex items-center gap-1.5 flex-1 overflow-x-auto scrollbar-none">
              {["all", "unread", "read"].map((f) => {
                const countMap = {
                  all: filteredItems.length,
                  unread: filteredItems.filter((i) => !i.is_read).length,
                  read: filteredItems.filter((i) => i.is_read).length,
                };
                return (
                  <button
                    key={f}
                    onClick={() => setReadFilter(f)}
                    className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      readFilter === f
                        ? "border-0"
                        : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                    }`}
                    style={readFilter === f ? { backgroundColor: "#bbea3b", color: "#2d4a00" } : {}}
                  >
                    {{ all: "全部", unread: "待读", read: "已读" }[f]}
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      readFilter === f ? "bg-[#2d4a0022] text-[#2d4a00]" : "bg-gray-100 text-gray-500"
                    }`}>
                      {countMap[f]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* 平台过滤器 */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none flex-shrink-0">
              <button
                onClick={() => setPlatformFilter("all")}
                className={`flex-shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  platformFilter === "all"
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                全平台
              </button>
              {Object.entries(PLATFORM_META).map(([k, v]) => {
                const count = items.filter((i) => (i.platform || "web") === k).length;
                if (count === 0) return null;
                const active = platformFilter === k;
                return (
                  <button
                    key={k}
                    onClick={() => setPlatformFilter(k)}
                    className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      active
                        ? "border-0"
                        : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                    }`}
                    style={active ? { backgroundColor: v.color + "22", color: v.color } : {}}
                  >
                    {v.label}
                    <span className={`text-xs px-1 rounded-full ${
                      active ? "bg-white/30" : "bg-gray-100 text-gray-500"
                    }`}>{count}</span>
                  </button>
                );
              })}
            </div>

            <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button className="flex-shrink-0 border-0" size="sm" style={{ backgroundColor: "#bbea3b", color: "#2d4a00" }}>
                  <Plus className="h-4 w-4 md:mr-1.5" />
                  <span className="hidden sm:inline">添加文章</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="w-full max-w-2xl mx-auto sm:rounded-xl rounded-none sm:max-h-[90vh] max-h-screen overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>添加文章</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddSubmit} className="space-y-4 mt-4">
                  {/* 粘贴识别：抖音/B站/小红书/公众号等分享内容 */}
                  <div className="bg-gradient-to-br from-indigo-50/60 to-purple-50/40 border border-indigo-100 rounded-lg p-3">
                    <label className="text-sm font-medium mb-1.5 flex items-center gap-1.5">
                      <Wand2 className="h-3.5 w-3.5 text-indigo-500" />
                      粘贴抖音等网站复制内容，一键识别
                    </label>
                    <div className="flex gap-2">
                      <Textarea
                        value={shareInput}
                        onChange={(e) => setShareInput(e.target.value)}
                        placeholder="例如：3.58 复制打开抖音，看看【xxx的作品】标题 # 标签 https://v.douyin.com/xxx..."
                        rows={2}
                        className="resize-none flex-1 bg-white"
                      />
                      <Button
                        type="button"
                        onClick={handleExtractShare}
                        disabled={extracting || !shareInput.trim()}
                        className="border-0 flex-shrink-0 self-start"
                        style={{ backgroundColor: "#6366f1", color: "#fff" }}
                      >
                        {extracting
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <><Wand2 className="h-4 w-4 mr-1" />识别</>}
                      </Button>
                    </div>
                    {extractError && (
                      <p className="text-xs text-red-500 mt-1.5 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        {extractError}
                      </p>
                    )}
                    {fetchingTip && extracting && (
                      <p className="text-xs text-indigo-500 mt-1.5 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {fetchingTip}
                      </p>
                    )}
                    <p className="text-xs text-gray-400 mt-1.5">
                      支持抖音 / B站 / 小红书 / 公众号 / YouTube / TikTok / 微博 / 快手 / 西瓜 / 知乎等 1000+ 平台
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">文章链接</label>
                    <div className="relative">
                      <Input
                        type="url"
                        value={form.url}
                        onChange={(e) => setForm({ ...form, url: e.target.value })}
                        onBlur={handleUrlBlur}
                        placeholder="https://example.com"
                        required
                        className={fetching ? "pr-9" : ""}
                      />
                      {fetching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 animate-spin" />}
                    </div>
                    {fetching && (
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {fetchingTip || "正在自动解析标题和摘要…"}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">标题</label>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="文章标题（粘贴链接后自动获取）"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">摘要</label>
                    <Textarea
                      value={form.summary}
                      onChange={(e) => setForm({ ...form, summary: e.target.value })}
                      placeholder="简要描述文章内容（粘贴链接后自动获取）"
                      rows={3}
                      className="resize-none"
                    />
                  </div>
                  {/* 平台 + 离线到本地 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">平台</label>
                      <select
                        value={form.platform || 'web'}
                        onChange={(e) => setForm({ ...form, platform: e.target.value })}
                        className="w-full h-9 px-3 rounded-md border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      >
                        {Object.entries(PLATFORM_META).map(([k, v]) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <label className={`flex items-start gap-2 px-3 py-2 rounded-md border w-full cursor-pointer transition-colors ${
                        form.is_offline
                          ? "bg-indigo-50 border-indigo-200"
                          : "bg-white border-gray-200 hover:bg-gray-50"
                      }`}>
                        <input
                          type="checkbox"
                          checked={form.is_offline}
                          onChange={(e) => setForm({ ...form, is_offline: e.target.checked })}
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 flex items-center gap-1">
                            <Download className="h-3.5 w-3.5" />
                            离线到本地
                          </div>
                          <div className="text-xs text-gray-500 leading-snug">
                            视频/图/文章 markdown 下载到服务端
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-sm font-medium">标签</label>
                      <button
                        type="button"
                        onClick={handleReClassify}
                        disabled={classifying || (!form.title && !form.summary) || tags.length === 0}
                        className="flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                      >
                        {classifying
                          ? <><Loader2 className="h-3 w-3 animate-spin" />AI 识别中…</>
                          : <><Sparkles className="h-3 w-3" />AI 自动识别</>}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag) => (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => toggleFormTag(tag.id)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                            form.tags.includes(tag.id) ? "ring-2 ring-offset-1" : "opacity-60 hover:opacity-100"
                          }`}
                          style={tagStyle(tag.color)}
                        >
                          {tag.name}
                        </button>
                      ))}
                      {tags.length === 0 && (
                        <span className="text-xs text-gray-400">暂无标签，请在任务页面新建标签</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button type="button" variant="outline" onClick={() => { setIsAddOpen(false); resetForm(); }}>取消</Button>
                    <Button type="submit" className="border-0" style={{ backgroundColor: "#bbea3b", color: "#2d4a00" }} disabled={fetching || classifying || extracting || downloading}>
                      {(fetching || classifying || extracting || downloading) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {form.is_offline ? "下载并添加" : "添加"}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {/* 文章列表 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredItems.map((item) => (
              <ArticleCard
                key={item.id}
                item={item}
                tagMap={tagMap}
                onToggleRead={() => toggleRead(item)}
                onToggleStar={() => toggleStar(item)}
                onDelete={() => setDeleteConfirmId(item.id)}
              />
            ))}
          </div>

          {/* 删除确认弹窗 */}
          <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
            <AlertDialogContent className="max-w-sm">
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  确认删除文章？
                </AlertDialogTitle>
                <AlertDialogDescription>
                  删除后该文章将从列表中消失，但数据仍保留在数据库中，随时可以找回。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-red-500 hover:bg-red-600 text-white border-0"
                  onClick={() => handleDelete(deleteConfirmId)}
                >
                  确认删除
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {filteredItems.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-10 md:p-16 text-center mt-2">
              <BookOpen className="h-10 w-10 md:h-12 md:w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">暂无文章</p>
              <p className="text-gray-300 text-xs mt-1">点击右上角「添加文章」开始收藏</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ── 子组件：左侧导航项 ────────────────────────────────────────────
function SideItem({ active, onClick, label, count, icon, color }) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm transition-colors text-left ${
        active ? "font-medium" : "text-gray-600 hover:bg-gray-50 active:bg-gray-100"
      }`}
      style={active ? { backgroundColor: "#bbea3b33", color: "#2d4a00" } : {}}
    >
      <span style={{ color }} className="flex-shrink-0">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count > 0 && (
        <span className="text-xs text-gray-400 flex-shrink-0 tabular-nums">{count}</span>
      )}
    </button>
  );
}

// ── 子组件：文章卡片 ──────────────────────────────────────────────
function ArticleCard({ item, tagMap, onToggleRead, onToggleStar, onDelete }) {
  const pm = platformMeta(item.platform);
  const PlatformIcon = pm.Icon;
  return (
    <div className={`
      bg-white rounded-xl border border-gray-100 overflow-hidden
      hover:shadow-md transition-all duration-200 flex flex-col
      ${item.is_read ? "opacity-60" : ""}
    `}>
      {/* 封面图（仅当 cover_url 存在时显示） */}
      {item.cover_url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block relative aspect-[16/9] bg-gray-100 overflow-hidden group"
        >
          <img
            src={item.cover_url}
            alt={item.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          {/* 平台角标 */}
          <div
            className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white shadow-sm"
            style={{ backgroundColor: pm.color }}
          >
            <PlatformIcon className="h-3 w-3" />
            {pm.label}
          </div>
          {/* 离线标识 */}
          {item.is_offline && (
            <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-black/60 text-white backdrop-blur-sm">
              <Download className="h-3 w-3" />
              已离线
            </div>
          )}
        </a>
      )}

      <div className="p-4 flex flex-col flex-1">
      {/* 第一行：已读按钮 + 标题 + 星标按钮 */}
      <div className="flex items-start gap-2 mb-2">
        {/* 已读 toggle */}
        <button
          onClick={onToggleRead}
          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
            item.is_read
              ? "border-green-400 bg-green-400 text-white"
              : "border-gray-300 hover:border-green-400 text-transparent hover:text-green-400"
          }`}
          title={item.is_read ? "标记未读" : "标记已读"}
        >
          <Check className="h-3 w-3" />
        </button>

        {/* 标题 */}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex-1 min-w-0 font-semibold leading-snug text-[15px] hover:underline ${
            item.is_read ? "text-gray-400 line-through decoration-gray-300" : "text-gray-900"
          }`}
        >
          {item.title}
        </a>

        {/* 星标 toggle */}
        <button
          onClick={onToggleStar}
          className={`mt-0.5 flex-shrink-0 p-0.5 rounded transition-colors ${
            item.is_starred
              ? "text-amber-400"
              : "text-gray-300 hover:text-amber-400"
          }`}
          title={item.is_starred ? "取消星标" : "加星标"}
        >
          <Star className="h-4 w-4" fill={item.is_starred ? "currentColor" : "none"} />
        </button>
      </div>

      {/* 无封面时显示平台+离线小标签 */}
      {!item.cover_url && (
        <div className="flex items-center gap-1.5 mb-2 -mt-1">
          <span
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-white"
            style={{ backgroundColor: pm.color }}
          >
            <PlatformIcon className="h-3 w-3" />
            {pm.label}
          </span>
          {item.is_offline && (
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-600">
              <Download className="h-3 w-3" />
              已离线
            </span>
          )}
        </div>
      )}

      {/* 内容摘要：最多3行，撑满剩余空间 */}
      <div className="flex-1 min-h-0">
        {item.summary ? (
          <p className="text-sm text-gray-500 line-clamp-3 leading-relaxed">
            {item.summary}
          </p>
        ) : (
          <p className="text-sm text-gray-300 italic">暂无摘要</p>
        )}
      </div>

      {/* 底部一行：标签 + 域名 + 日期 + 删除 */}
      <div className="flex items-center gap-1.5 pt-2.5 mt-2.5 border-t border-gray-50 flex-wrap">
        {/* 标签 */}
        {(item.tags || []).map((tid) => {
          const tag = tagMap[tid];
          if (!tag) return null;
          return (
            <span
              key={tid}
              className="px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0"
              style={tagStyle(tag.color)}
            >
              {tag.name}
            </span>
          );
        })}
        {(item.tags || []).length === 0 && (
          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-400 flex-shrink-0">未分类</span>
        )}

        {/* 弹性空白，把后面的信息推到右侧 */}
        <div className="flex-1" />

        {/* 加入日期 */}
        <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
          {new Date(item.created_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
        </span>

        {/* 删除 */}
        <button
          onClick={onDelete}
          className="flex-shrink-0 p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 active:bg-red-100 transition-colors"
          title="删除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      </div>
    </div>
  );
}

export default ReadingPage;

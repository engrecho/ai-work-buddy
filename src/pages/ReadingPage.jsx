import { useState, useEffect, useRef } from "react";
import {
  Plus, BookOpen, ExternalLink, Check, Loader2, Sparkles,
  Star, Tag, Trash2, Menu, X, ChevronDown, AlertTriangle,
  Wand2, Download, PlayCircle, FileText, Link as LinkIcon,
  Pencil, Copy, FolderOpen, RefreshCw, FileVideo, FileImage,
  FileAudio, FileCode2, ChevronRight, Eye,
} from "lucide-react";
import { supabase, batchQuery } from "@/integrations/supabase/client";
import { genId } from "@/lib/utils";
import { toast } from "sonner";
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
  douyin:       { label: '抖音',     color: '#FF0050', Icon: PlayCircle },
  bilibili:     { label: 'B站',      color: '#FF6699', Icon: PlayCircle },
  xiaohongshu:  { label: '小红书',   color: '#FF2442', Icon: FileText },
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
const ReadingPage = ({ initialReadingId, onInitialReadingConsumed } = {}) => {
  const [items, setItems] = useState([]);
  // 统一使用 task_tags 表
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
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
    // 批量获取：一次请求拉取阅读列表 + 标签
    (async () => {
      setLoading(true);
      const results = await batchQuery([
        { table: 'reading_items', select: 'id,url,platform,title,summary,cover_url,category,is_read,is_starred,is_offline,offline_path,tags,created_at,deleted_at', filter: ['is:deleted_at:null'], order: ['created_at:desc'], limit: 200 },
        { table: 'task_tags', order: ['created_at:asc'] },
      ]);
      const [itemsRes = {}, tagsRes = {}] = results;
      const loadedItems = itemsRes.data || [];
      setItems(loadedItems);
      setTags(tagsRes.data || []);
      setLoading(false);
      // 若有 initialReadingId，自动打开对应条目的编辑详情
      if (initialReadingId) {
        const target = loadedItems.find((it) => String(it.id) === String(initialReadingId));
        if (target) handleStartEdit(target);
        onInitialReadingConsumed?.();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 数据获取 ──────────────────────────────────────────────────────
  const fetchItems = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("reading_items")
      .select("id,url,platform,title,summary,cover_url,category,is_read,is_starred,is_offline,offline_path,tags,created_at,deleted_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200);
    setItems(data || []);
    setLoading(false);
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
      let insertData = { ...form };
      // url 优先用解析后的 url，其次用输入的 shareInput
      if (!insertData.url && shareInput) insertData.url = shareInput;

      const { data: inserted, error: insertErr } = await supabase.from("reading_items").insert([insertData]).select().single();
      if (insertErr) throw insertErr;

      if (form.is_offline && insertData.url) {
        toast.info("正在后台离线保存…（可正常关闭页面）");
        // 离线下载由后端自动处理，这里直接把本地状态标记为离线中
        if (inserted?.id) {
          setItems((prev) => [{ ...inserted, is_offline: true }, ...prev]);
        }
        // 轮询刷新 offline_path（后端后台下载完会更新）
        const checkInterval = setInterval(async () => {
          try {
            const { data } = await supabase.from("reading_items")
              .select("id,is_offline,offline_path")
              .eq("id", inserted?.id || insertData.id)
              .maybeSingle();
            if (data?.offline_path) {
              clearInterval(checkInterval);
              setItems((prev) => prev.map((it) => it.id === data.id ? { ...it, is_offline: true, offline_path: data.offline_path } : it));
              toast.success("离线保存完成！");
            } else if (data && data.is_offline === false && !data.offline_path) {
              // 下载失败，后端回滚了
              clearInterval(checkInterval);
              setItems((prev) => prev.map((it) => it.id === data.id ? { ...it, is_offline: false, offline_path: null } : it));
              toast.error("离线保存失败，请稍后重试");
            }
          } catch (_) {}
        }, 3000);
        // 最多轮询 5 分钟
        setTimeout(() => clearInterval(checkInterval), 5 * 60 * 1000);
      } else {
        fetchItems();
      }

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
    // 乐观更新：先改本地，失败再回滚
    setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, is_read: !it.is_read } : it));
    try {
      await supabase.from("reading_items").update({ is_read: !item.is_read }).eq("id", item.id);
    } catch (e) {
      setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, is_read: item.is_read } : it));
      toast.error("更新失败");
    }
  };

  const toggleStar = async (item) => {
    setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, is_starred: !it.is_starred } : it));
    try {
      await supabase.from("reading_items").update({ is_starred: !item.is_starred }).eq("id", item.id);
    } catch (e) {
      setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, is_starred: item.is_starred } : it));
      toast.error("更新失败");
    }
  };

  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const handleDelete = async (id) => {
    const now = new Date().toISOString();
    // 乐观移除：先从列表剔除，失败再恢复
    const snapshot = items;
    setItems((prev) => prev.filter((it) => it.id !== id));
    setDeleteConfirmId(null);
    try {
      await supabase.from("reading_items").update({ deleted_at: now }).eq("id", id);
    } catch (e) {
      setItems(snapshot);
      toast.error("删除失败");
    }
  };

  // 去除离线
  const handleRemoveOffline = async (item) => {
    setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, is_offline: false, offline_path: null } : it));
    try {
      await supabase.from("reading_items").update({ is_offline: false, offline_path: null }).eq("id", item.id);
      toast.success("已去除离线保存");
    } catch (e) {
      setItems((prev) => prev.map((it) => it.id === item.id ? { ...it, is_offline: item.is_offline, offline_path: item.offline_path } : it));
      toast.error("操作失败");
    }
  };

  // ── 编辑 ────────────────────────────────────────────────────────
  const [editingItem, setEditingItem] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);

  const handleStartEdit = (item) => {
    setEditingItem(item);
    setEditForm({
      url: item.url || "",
      title: item.title || "",
      summary: item.summary || "",
      cover_url: item.cover_url || "",
      platform: item.platform || "web",
      category: item.category || "work",
      is_read: !!item.is_read,
      is_starred: !!item.is_starred,
      is_offline: !!item.is_offline,
      offline_path: item.offline_path || "",
      tags: Array.isArray(item.tags) ? item.tags : [],
    });
  };
  const handleSaveEdit = async () => {
    if (!editingItem) return;
    setSavingEdit(true);
    // 乐观更新本地
    setItems((prev) => prev.map((it) => it.id === editingItem.id ? { ...it, ...editForm } : it));
    const snapshotItem = editingItem;
    setEditingItem(null);
    try {
      const { error } = await supabase
        .from("reading_items")
        .update(editForm)
        .eq("id", snapshotItem.id);
      if (error) throw error;
    } catch (e) {
      // 回滚
      setItems((prev) => prev.map((it) => it.id === snapshotItem.id ? { ...it, ...snapshotItem } : it));
      alert(`保存失败：${e.message}`);
    } finally {
      setSavingEdit(false);
    }
  };
  const toggleEditTag = (tagId) => {
    setEditForm((prev) => ({
      ...prev,
      tags: prev.tags.includes(tagId)
        ? prev.tags.filter((id) => id !== tagId)
        : [...prev.tags, tagId],
    }));
  };

  // ── 复制链接 ────────────────────────────────────────────────────
  const [copyToast, setCopyToast] = useState("");
  const handleCopyUrl = async (item) => {
    const text = item.url || "";
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // fallback：临时 textarea
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setCopyToast(`已复制：${text.slice(0, 60)}${text.length > 60 ? "..." : ""}`);
      setTimeout(() => setCopyToast(""), 2500);
    } catch (e) {
      setCopyToast(`复制失败：${e.message}`);
      setTimeout(() => setCopyToast(""), 2500);
    }
  };

  // ── 离线文件查看/下载 ────────────────────────────────────────────
  const [offlineFilesItem, setOfflineFilesItem] = useState(null);
  const [offlineFilesList, setOfflineFilesList] = useState([]);
  const [offlineFilesLoading, setOfflineFilesLoading] = useState(false);
  const [redownloading, setRedownloading] = useState(false);

  const openOfflineFiles = async (item) => {
    setOfflineFilesItem(item);
    setOfflineFilesList([]);
    setOfflineFilesLoading(true);
    try {
      const res = await fetch(`/api/reading/${item.id}/files`, { credentials: "include" });
      const json = await res.json();
      if (json.error) {
        alert(`加载失败：${json.error.message}`);
        return;
      }
      setOfflineFilesList(json.data?.files || []);
    } catch (e) {
      alert(`加载失败：${e.message}`);
    } finally {
      setOfflineFilesLoading(false);
    }
  };

  const handleRedownload = async () => {
    if (!offlineFilesItem) return;
    setRedownloading(true);
    try {
      // 通过更新 is_offline=true 触发后端重新下载（后端会先置 false 再后台下载）
      const { error } = await supabase
        .from("reading_items")
        .update({ is_offline: true })
        .eq("id", offlineFilesItem.id);
      if (error) throw error;
      toast.info("正在后台重新离线…（可正常关闭弹窗）");
      // 轮询刷新
      const checkInterval = setInterval(async () => {
        try {
          const { data } = await supabase.from("reading_items")
            .select("id,is_offline,offline_path")
            .eq("id", offlineFilesItem.id)
            .maybeSingle();
          if (data?.offline_path) {
            clearInterval(checkInterval);
            setItems((prev) => prev.map((it) => it.id === data.id ? { ...it, is_offline: true, offline_path: data.offline_path } : it));
            setOfflineFilesItem((prev) => prev ? { ...prev, is_offline: true, offline_path: data.offline_path } : prev);
            await openOfflineFiles({ ...offlineFilesItem, offline_path: data.offline_path });
            fetchItems();
            toast.success("重新离线完成！");
          } else if (data && data.is_offline === false && !data.offline_path) {
            clearInterval(checkInterval);
            toast.error("重新离线失败，请稍后重试");
          }
        } catch (_) {}
      }, 3000);
      setTimeout(() => clearInterval(checkInterval), 5 * 60 * 1000);
    } catch (e) {
      alert(`重新下载失败：${e.message}`);
    } finally {
      setRedownloading(false);
    }
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

          {/* 顶部操作栏：平台过滤器 + 添加按钮（PC端在右上方） */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <button
              className="md:hidden flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 flex-shrink-0"
              onClick={() => setIsSidebarOpen(true)}
            >
              <Menu className="h-4 w-4" />
              <span className="max-w-[80px] truncate">{activeTagLabel}</span>
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            </button>

            <div className="flex items-center gap-1.5 flex-wrap">
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
            <div className="flex items-center gap-1.5 flex-wrap">
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

            {/* PC端：添加文章按钮在右上方，移动端：右下角FAB */}
            <div className="ml-auto flex-shrink-0">
              <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
                <DialogTrigger asChild>
                  <button
                    aria-label="添加文章"
                    className="hidden md:inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-medium border-0 active:scale-95 transition-transform"
                    style={{ backgroundColor: "#bbea3b", color: "#2d4a00" }}
                  >
                    <Plus className="h-4 w-4" />
                    添加文章
                  </button>
                </DialogTrigger>
                {/* Dialog content moved below */}
              <DialogContent className="w-full max-w-2xl mx-auto sm:rounded-xl rounded-none sm:max-h-[90dvh] max-h-[100dvh] overflow-y-auto">
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
                        将链接离线保存
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
                      添加
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
            </div>
          </div>

          {/* 文章列表(列表式:头图缩略图 + 标题/摘要 + 右侧操作) */}
          {loading && items.length === 0 ? (
            <div className="flex flex-col divide-y divide-gray-100 bg-white rounded-xl border border-gray-100 overflow-hidden">
              {[0, 1, 2, 3].map((i) => (
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
          ) : (
          <div className="flex flex-col divide-y divide-gray-100 bg-white rounded-xl border border-gray-100 overflow-hidden">
            {filteredItems.map((item) => (
              <ArticleRow
                key={item.id}
                item={item}
                tagMap={tagMap}
                onToggleRead={() => toggleRead(item)}
                onToggleStar={() => toggleStar(item)}
                onDelete={() => setDeleteConfirmId(item.id)}
                onEdit={() => handleStartEdit(item)}
                onCopy={() => handleCopyUrl(item)}
                onOpenFiles={() => openOfflineFiles(item)}
                onRemoveOffline={() => handleRemoveOffline(item)}
              />
            ))}
          </div>
          )}

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

          {!loading && filteredItems.length === 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-10 md:p-16 text-center mt-2">
              <BookOpen className="h-10 w-10 md:h-12 md:w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">暂无文章</p>
              <p className="text-gray-300 text-xs mt-1">点击右上角「添加文章」开始收藏</p>
            </div>
          )}
        </div>

        {/* 移动端：右下角悬浮添加按钮(FAB) — 复用顶部栏的 Dialog */}
        <button
          aria-label="添加文章"
          className="md:hidden fixed z-30 right-4 bottom-[calc(56px+env(safe-area-inset-bottom,0px)+16px)] flex items-center justify-center h-14 w-14 rounded-full shadow-xl border-0 active:scale-95 transition-transform"
          style={{ backgroundColor: "#bbea3b", color: "#2d4a00" }}
          onClick={() => { setIsAddOpen(true); }}
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>

      {/* 复制反馈 toast（右下角浮动） */}
      {copyToast && (
        <div className="fixed bottom-6 right-6 z-50 max-w-md bg-gray-900 text-white text-sm px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2">
          <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
          <span className="truncate">{copyToast}</span>
        </div>
      )}

      {/* 编辑 Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => { if (!open) setEditingItem(null); }}>
        <DialogContent className="w-full max-w-2xl mx-auto sm:rounded-xl rounded-none sm:max-h-[90dvh] max-h-[100dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-4 w-4" />
              编辑文章
            </DialogTitle>
          </DialogHeader>
          {editingItem && (
            <div className="space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">文章链接</label>
                <Input
                  type="url"
                  value={editForm.url}
                  onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">标题</label>
                <Input
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  placeholder="文章标题"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">摘要</label>
                <Textarea
                  value={editForm.summary}
                  onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                  placeholder="文章摘要"
                  rows={3}
                  className="resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">封面 URL</label>
                  <Input
                    value={editForm.cover_url}
                    onChange={(e) => setEditForm({ ...editForm, cover_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">平台</label>
                  <select
                    value={editForm.platform}
                    onChange={(e) => setEditForm({ ...editForm, platform: e.target.value })}
                    className="w-full h-9 px-3 rounded-md border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    {Object.entries(PLATFORM_META).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">分类 (category)</label>
                <Input
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  placeholder="work / article / video ..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.is_read}
                    onChange={(e) => setEditForm({ ...editForm, is_read: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                  />
                  <span className="text-sm">已读</span>
                </label>
                <label className="flex items-center gap-2 px-3 py-2 rounded-md border border-gray-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.is_starred}
                    onChange={(e) => setEditForm({ ...editForm, is_starred: e.target.checked })}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600"
                  />
                  <span className="text-sm">星标</span>
                </label>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">离线</label>
                {editForm.is_offline ? (
                  <div className="space-y-2">
                    <div className="text-xs text-green-600 flex items-center gap-1">
                      <Check className="h-3 w-3" />已离线保存
                    </div>
                    <div className="text-xs text-gray-500 font-mono bg-gray-50 px-3 py-2 rounded break-all">
                      {editForm.offline_path || "（无路径信息）"}
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          setSavingEdit(true);
                          try {
                            await supabase
                              .from("reading_items")
                              .update({ is_offline: false, offline_path: null })
                              .eq("id", editingItem.id);
                            setEditForm(prev => ({ ...prev, is_offline: false, offline_path: "" }));
                            setItems(prev => prev.map(it => it.id === editingItem.id ? { ...it, is_offline: false, offline_path: null } : it));
                          } catch (e) { alert(`操作失败：${e.message}`); }
                          setSavingEdit(false);
                        }}
                        disabled={savingEdit}
                        className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" /> 去除离线
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setSavingEdit(true);
                          try {
                            // 通过更新 is_offline=true 触发后端重新下载
                            const { error } = await supabase
                              .from("reading_items")
                              .update({ is_offline: true })
                              .eq("id", editingItem.id);
                            if (error) throw error;
                            setEditForm(prev => ({ ...prev, is_offline: true, offline_path: "" }));
                            setItems(prev => prev.map(it => it.id === editingItem.id ? { ...it, is_offline: true, offline_path: null } : it));
                            toast.info("正在后台重新离线…");
                            // 轮询刷新
                            const id = editingItem.id;
                            const iv = setInterval(async () => {
                              const { data } = await supabase.from("reading_items")
                                .select("id,is_offline,offline_path")
                                .eq("id", id).maybeSingle();
                              if (data?.offline_path) {
                                clearInterval(iv);
                                setEditForm(prev => ({ ...prev, is_offline: true, offline_path: data.offline_path }));
                                setItems(prev => prev.map(it => it.id === id ? { ...it, is_offline: true, offline_path: data.offline_path } : it));
                                toast.success("重新离线完成！");
                              }
                            }, 3000);
                            setTimeout(() => clearInterval(iv), 5 * 60 * 1000);
                          } catch (e) { alert(`重新下载失败：${e.message}`); }
                          setSavingEdit(false);
                        }}
                        disabled={savingEdit}
                        className="text-xs px-2.5 py-1 rounded border border-indigo-200 text-indigo-600 hover:bg-indigo-50 flex items-center gap-1"
                      >
                        <RefreshCw className="h-3 w-3" /> 重新下载
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      setSavingEdit(true);
                      try {
                        // 通过更新 is_offline=true 触发后端离线下载
                        const { error } = await supabase
                          .from("reading_items")
                          .update({ is_offline: true })
                          .eq("id", editingItem.id);
                        if (error) throw error;
                        setEditForm(prev => ({ ...prev, is_offline: true, offline_path: "" }));
                        setItems(prev => prev.map(it => it.id === editingItem.id ? { ...it, is_offline: true, offline_path: null } : it));
                        toast.info("正在后台离线保存…");
                        const id = editingItem.id;
                        const iv = setInterval(async () => {
                          const { data } = await supabase.from("reading_items")
                            .select("id,is_offline,offline_path")
                            .eq("id", id).maybeSingle();
                          if (data?.offline_path) {
                            clearInterval(iv);
                            setEditForm(prev => ({ ...prev, is_offline: true, offline_path: data.offline_path }));
                            setItems(prev => prev.map(it => it.id === id ? { ...it, is_offline: true, offline_path: data.offline_path } : it));
                            toast.success("离线保存完成！");
                          } else if (data && data.is_offline === false && !data.offline_path) {
                            clearInterval(iv);
                            setEditForm(prev => ({ ...prev, is_offline: false, offline_path: "" }));
                            setItems(prev => prev.map(it => it.id === id ? { ...it, is_offline: false, offline_path: null } : it));
                            toast.error("离线保存失败，请稍后重试");
                          }
                        }, 3000);
                        setTimeout(() => clearInterval(iv), 5 * 60 * 1000);
                      } catch (e) { alert(`离线保存失败：${e.message}`); }
                      setSavingEdit(false);
                    }}
                    disabled={savingEdit}
                    className="flex items-center gap-2 px-3 py-2 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-sm w-full justify-center"
                  >
                    {savingEdit ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        正在离线保存到服务端…（可关闭页面，不影响后台处理）
                      </>
                    ) : (
                      <>
                        <Download className="h-4 w-4" />
                        将链接离线保存
                      </>
                    )}
                  </button>
                )}
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">标签</label>
                <div className="flex flex-wrap gap-2">
                  {tags.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleEditTag(tag.id)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                        editForm.tags?.includes(tag.id) ? "ring-2 ring-offset-1" : "opacity-60 hover:opacity-100"
                      }`}
                      style={tagStyle(tag.color)}
                    >
                      {tag.name}
                    </button>
                  ))}
                  {tags.length === 0 && (
                    <span className="text-xs text-gray-400">暂无标签</span>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setEditingItem(null)}>取消</Button>
                <Button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                  className="border-0"
                  style={{ backgroundColor: "#bbea3b", color: "#2d4a00" }}
                >
                  {savingEdit && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  保存
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 离线文件 Dialog */}
      <Dialog open={!!offlineFilesItem} onOpenChange={(open) => { if (!open) setOfflineFilesItem(null); }}>
        <DialogContent className="w-full max-w-2xl mx-auto sm:rounded-xl rounded-none sm:max-h-[90dvh] max-h-[100dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              离线文件 · {offlineFilesItem?.title?.slice(0, 30)}{offlineFilesItem?.title && offlineFilesItem.title.length > 30 ? "..." : ""}
            </DialogTitle>
          </DialogHeader>
          {offlineFilesItem && (
            <div className="space-y-3 mt-2">
              <div className="text-xs text-gray-500 font-mono bg-gray-50 px-3 py-2 rounded break-all">
                {offlineFilesItem.offline_path}
              </div>

              {offlineFilesLoading ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  加载中...
                </div>
              ) : offlineFilesList.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  目录下没有可下载的文件
                </div>
              ) : (
                <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
                  {offlineFilesList.map((f) => (
                    <OfflineFileRow key={f.name} file={f} />
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100">
                <button
                  onClick={handleRedownload}
                  disabled={redownloading}
                  className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                >
                  {redownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  重新下载
                </button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOfflineFilesItem(null)}
                >关闭</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ── 子组件：离线文件行 ──────────────────────────────────────────────
const FILE_CATEGORY_META = {
  video:    { label: '视频',   Icon: FileVideo, color: '#fe2c55' },
  audio:    { label: '音频',   Icon: FileAudio, color: '#8b5cf6' },
  image:    { label: '图片',   Icon: FileImage, color: '#06b6d4' },
  markdown: { label: '文章',   Icon: FileText,  color: '#07c960' },
  info:     { label: '元信息', Icon: FileCode2, color: '#6b7280' },
  other:    { label: '其他',   Icon: FileText,  color: '#9ca3af' },
};

function OfflineFileRow({ file }) {
  const meta = FILE_CATEGORY_META[file.category] || FILE_CATEGORY_META.other;
  const Icon = meta.Icon;
  const sizeKB = (file.size / 1024).toFixed(1);
  const sizeMB = (file.size / 1024 / 1024).toFixed(2);
  const sizeStr = file.size > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors">
      <div
        className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ backgroundColor: meta.color + "22", color: meta.color }}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 truncate">{file.name}</div>
        <div className="text-xs text-gray-500 flex items-center gap-2">
          <span>{meta.label}</span>
          <span>·</span>
          <span>{sizeStr}</span>
        </div>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {/* 预览按钮（图片/视频/音频/MD 支持新标签页打开） */}
        {['image', 'video', 'audio', 'markdown', 'info'].includes(file.category) && (
          <a
            href={file.preview_url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
            title="新标签页预览"
          >
            <Eye className="h-3.5 w-3.5" />
          </a>
        )}
        {/* 下载按钮 */}
        <a
          href={file.download_url}
          className="p-1.5 rounded text-gray-400 hover:text-green-600 hover:bg-green-50"
          title="下载文件"
          download={file.name}
        >
          <Download className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

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

// ── 子组件：文章列表行(列表式展示,头图缩略图在左侧) ──────────────────
// 布局: 头图(64×44 / 80×56)  |  标题(2行) + 摘要(4行)        |  元信息 + 操作(1行底部)
function ArticleRow({ item, tagMap, onToggleRead, onToggleStar, onDelete, onEdit, onCopy, onOpenFiles, onRemoveOffline }) {
  const pm = platformMeta(item.platform);
  const PlatformIcon = pm.Icon;
  return (
    <div
      className={`
        group flex gap-3 px-3 py-3 sm:px-4 sm:py-3.5
        hover:bg-gray-50 active:bg-gray-100 transition-colors
      `}
    >
      {/* 头图缩略图(64×44 移动端,80×56 PC 端) */}
      <a
        href={item.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-shrink-0 block w-[64px] h-[44px] sm:w-[80px] sm:h-[56px] bg-gray-100 rounded-md overflow-hidden relative self-start"
        title={item.title}
      >
        {item.cover_url ? (
          <img
            src={item.cover_url}
            alt={item.title}
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
          className={`absolute inset-0 ${item.cover_url ? 'hidden' : 'flex'} items-center justify-center text-white`}
          style={{ backgroundColor: pm.color }}
        >
          <PlatformIcon className="h-5 w-5" />
        </div>
      </a>

      {/* 中间:标题 + 摘要 + 底部元信息 */}
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        {/* 标题(最多 2 行) + 已读 + 星标 */}
        <div className="flex items-start gap-1.5">
          <button
            onClick={onToggleRead}
            className={`mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border-[1.5px] flex items-center justify-center transition-all ${
              item.is_read
                ? "border-green-400 bg-green-400 text-white"
                : "border-gray-300 hover:border-green-400 text-transparent hover:text-green-400"
            }`}
            title={item.is_read ? "标记未读" : "标记已读"}
          >
            <Check className="h-2.5 w-2.5" />
          </button>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex-1 min-w-0 font-semibold text-[15px] leading-snug line-clamp-2 hover:underline ${
              item.is_read ? "text-blue-600" : "text-gray-900"
            }`}
          >
            {item.title}
          </a>
          <button
            onClick={onToggleStar}
            className={`flex-shrink-0 p-0.5 rounded transition-colors ${
              item.is_starred ? "text-amber-400" : "text-gray-300 hover:text-amber-400"
            }`}
            title={item.is_starred ? "取消星标" : "加星标"}
          >
            <Star className="h-4 w-4" fill={item.is_starred ? "currentColor" : "none"} />
          </button>
        </div>

        {/* 摘要(最多 4 行) */}
        {item.summary ? (
          <p className="text-[13px] text-gray-500 leading-relaxed line-clamp-4">
            {item.summary}
          </p>
        ) : (
          <p className="text-[13px] text-gray-300 italic">暂无摘要</p>
        )}

        {/* 底部元信息 + 操作(单行) */}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span
            className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium text-white flex-shrink-0"
            style={{ backgroundColor: pm.color }}
          >
            <PlatformIcon className="h-2.5 w-2.5" />
            {pm.label}
          </span>
          {item.is_offline && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-50 text-green-600 flex-shrink-0 border border-green-200">
              <Download className="h-2.5 w-2.5" />
              已离线
            </span>
          )}
          {(item.tags || []).slice(0, 3).map((tid) => {
            const tag = tagMap[tid];
            if (!tag) return null;
            return (
              <span
                key={tid}
                className="px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap flex-shrink-0"
                style={tagStyle(tag.color)}
              >
                {tag.name}
              </span>
            );
          })}
          {(!item.tags || item.tags.length === 0) && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-400 flex-shrink-0">未分类</span>
          )}

          {/* 推后:日期 + 操作 */}
          <div className="flex-1" />
          <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
            {new Date(item.created_at).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
          </span>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              onClick={onCopy}
              className="p-1 rounded text-gray-300 hover:text-indigo-500 hover:bg-indigo-50 active:bg-indigo-100 transition-colors"
              title="复制链接"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onEdit}
              className="p-1 rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50 active:bg-blue-100 transition-colors"
              title="编辑"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            {item.is_offline && (
              <button
                onClick={onOpenFiles}
                className="p-1 rounded text-gray-300 hover:text-green-500 hover:bg-green-50 active:bg-green-100 transition-colors"
                title="查看/下载离线文件"
              >
                <FolderOpen className="h-3.5 w-3.5" />
              </button>
            )}
            {item.is_offline && (
              <button
                onClick={onRemoveOffline}
                className="p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 active:bg-red-100 transition-colors"
                title="去除离线"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={onDelete}
              className="p-1 rounded text-gray-300 hover:text-red-400 hover:bg-red-50 active:bg-red-100 transition-colors"
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

export default ReadingPage;

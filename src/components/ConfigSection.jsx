import { useState, useRef, useEffect, useCallback } from "react";
import { Users, Tag, FolderOpen, X, Pencil, Trash2, AlertCircle, Settings, ChevronRight, GripVertical, ChevronUp, ChevronDown as ChevronDownIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { genId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ─── 预设颜色 ─────────────────────────────────────────────────────
const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#06b6d4", "#6b7280", "#84cc16", "#f97316",
];

// ─── 颜色选择器 ───────────────────────────────────────────────────
const ColorPicker = ({ value, onChange }) => (
  <div className="flex flex-wrap gap-2">
    {PRESET_COLORS.map((color) => (
      <button
        key={color}
        type="button"
        onClick={() => onChange(color)}
        className={`w-6 h-6 rounded-full border-2 transition-transform active:scale-95 ${value === color ? "border-gray-900 scale-110" : "border-transparent"}`}
        style={{ backgroundColor: color }}
      />
    ))}
  </div>
);

// ─── 错误提示 ─────────────────────────────────────────────────────
const ErrorNotice = ({ error, tableName }) => {
  if (!error) return null;
  return (
    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">错误提示</p>
        <p className="text-xs mt-0.5">{error}</p>
        <p className="text-xs mt-1 text-red-500">请检查数据库 `{tableName}` 表是否已创建。</p>
      </div>
    </div>
  );
};

// ─── 关键词输入 ───────────────────────────────────────────────────
const KeywordsInput = ({ value = [], onChange }) => {
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef(null);
  const addKeyword = () => {
    const kw = inputVal.trim();
    if (!kw) return;
    const newKws = kw.split(/[,，\s]+/).map(k => k.trim()).filter(k => k && !value.includes(k));
    if (newKws.length > 0) onChange([...value, ...newKws]);
    setInputVal("");
    inputRef.current?.focus();
  };
  const removeKeyword = (kw) => onChange(value.filter(k => k !== kw));
  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === "，") { e.preventDefault(); addKeyword(); }
    else if (e.key === "Backspace" && !inputVal && value.length > 0) onChange(value.slice(0, -1));
  };
  return (
    <div
      className="min-h-[36px] flex flex-wrap gap-1.5 items-center px-2 py-1.5 border border-gray-200 rounded-lg bg-white cursor-text focus-within:border-[#bbea3b] focus-within:ring-1 focus-within:ring-[#bbea3b]/30 transition-colors"
      onClick={() => inputRef.current?.focus()}
    >
      {value.map((kw) => (
        <span key={kw} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#f0f9d4] text-[#3a5c00] border border-[#bbea3b]/50">
          {kw}
          <button type="button" onClick={(e) => { e.stopPropagation(); removeKeyword(kw); }} className="hover:text-red-500 transition-colors">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={inputVal}
        onChange={(e) => setInputVal(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={addKeyword}
        placeholder={value.length === 0 ? "输入关键词，回车确认..." : ""}
        className="flex-1 min-w-[80px] text-xs outline-none bg-transparent placeholder-gray-300 py-0.5"
      />
    </div>
  );
};

// ─── 人员管理面板 ─────────────────────────────────────────────────
export const MembersPanel = () => {
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({ mis: "", name: "" });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchMembers(); }, []);

  const fetchMembers = async () => {
    const { data, error: e } = await supabase.from("task_members").select("*").order("created_at", { ascending: true });
    if (e) { setError("读取人员失败：" + e.message); return; }
    setMembers(data || []); setError("");
  };

  const handleSave = async () => {
    if (!form.mis.trim() || !form.name.trim()) return;
    setLoading(true); setError("");
    try {
      if (editing) {
        const { error: e } = await supabase.from("task_members").update({ mis: form.mis.trim(), name: form.name.trim() }).eq("id", editing.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("task_members").insert([{ id: genId(), mis: form.mis.trim(), name: form.name.trim() }]);
        if (e) throw e;
      }
      await fetchMembers(); setForm({ mis: "", name: "" }); setEditing(null);
    } catch (e) { setError("操作失败：" + e.message); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <ErrorNotice error={error} tableName="task_members" />
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">{editing ? "编辑人员" : "新增人员"}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">MIS 账号</label>
            <Input value={form.mis} onChange={(e) => setForm({ ...form, mis: e.target.value })} placeholder="如 zhangsan" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">姓名</label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如 张三" />
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="border-0" style={{ backgroundColor: "#bbea3b", color: "#2d4a00" }} onClick={handleSave} disabled={!form.mis.trim() || !form.name.trim() || loading}>
            {loading ? "保存中..." : editing ? "保存" : "创建"}
          </Button>
          {editing && <Button size="sm" variant="outline" onClick={() => { setEditing(null); setForm({ mis: "", name: "" }); }}>取消</Button>}
        </div>
      </div>
      <div className="space-y-1 max-h-[50vh] overflow-y-auto">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 group">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 text-white" style={{ backgroundColor: "#5a7a00" }}>{m.name.slice(0, 1)}</div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{m.name}</p>
                <p className="text-xs text-gray-400">{m.mis}</p>
              </div>
            </div>
            <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <button onClick={() => { setEditing(m); setForm({ mis: m.mis, name: m.name }); }} className="p-1.5 rounded hover:bg-gray-200 text-gray-500"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={async () => { await supabase.from("task_members").delete().eq("id", m.id); fetchMembers(); }} className="p-1.5 rounded hover:bg-red-100 text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
        {members.length === 0 && !error && <p className="text-sm text-gray-400 text-center py-6">暂无人员，请先添加</p>}
      </div>
    </div>
  );
};

// ─── 标签管理面板 ─────────────────────────────────────────────────
export const TagsPanel = () => {
  const [tags, setTags] = useState([]);
  const [form, setForm] = useState({ name: "", color: PRESET_COLORS[0] });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchTags(); }, []);

  const fetchTags = async () => {
    const { data, error: e } = await supabase.from("task_tags").select("*").order("created_at", { ascending: true });
    if (e) { setError("读取标签失败：" + e.message); return; }
    setTags(data || []); setError("");
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setLoading(true); setError("");
    try {
      if (editing) {
        const { error: e } = await supabase.from("task_tags").update({ name: form.name.trim(), color: form.color }).eq("id", editing.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from("task_tags").insert([{ id: genId(), name: form.name.trim(), color: form.color }]);
        if (e) throw e;
      }
      await fetchTags(); setForm({ name: "", color: PRESET_COLORS[0] }); setEditing(null);
    } catch (e) { setError("操作失败：" + e.message); } finally { setLoading(false); }
  };

  return (
    <div className="space-y-4">
      <ErrorNotice error={error} tableName="task_tags" />
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">{editing ? "编辑标签" : "新建标签"}</p>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="标签名称" />
        <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
        <div className="flex gap-2">
          <Button size="sm" className="border-0" style={{ backgroundColor: "#bbea3b", color: "#2d4a00" }} onClick={handleSave} disabled={!form.name.trim() || loading}>
            {loading ? "保存中..." : editing ? "保存" : "创建"}
          </Button>
          {editing && <Button size="sm" variant="outline" onClick={() => { setEditing(null); setForm({ name: "", color: PRESET_COLORS[0] }); }}>取消</Button>}
        </div>
      </div>
      <div className="space-y-1 max-h-[50vh] overflow-y-auto">
        {tags.map((t) => (
          <div key={t.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 group">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
              <span className="text-sm text-gray-800">{t.name}</span>
            </div>
            <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <button onClick={() => { setEditing(t); setForm({ name: t.name, color: t.color }); }} className="p-1.5 rounded hover:bg-gray-200 text-gray-500"><Pencil className="h-3.5 w-3.5" /></button>
              <button onClick={async () => { await supabase.from("task_tags").delete().eq("id", t.id); fetchTags(); }} className="p-1.5 rounded hover:bg-red-100 text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        ))}
        {tags.length === 0 && !error && <p className="text-sm text-gray-400 text-center py-6">暂无标签，请先创建</p>}
      </div>
    </div>
  );
};

// ─── 分组管理面板 ─────────────────────────────────────────────────
export const GroupsPanel = () => {
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({ name: "", color: PRESET_COLORS[2], keywords: [] });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // 拖拽排序相关
  const dragIndexRef = useRef(null);
  const dragOverIndexRef = useRef(null);

  useEffect(() => { fetchGroups(); }, []);

  const fetchGroups = async () => {
    const { data, error: e } = await supabase.from("task_groups").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true });
    if (e) { setError("读取分组失败：" + e.message); return; }
    setGroups(data || []); setError("");
  };

  // 持久化 sort_order 到数据库
  const persistOrder = useCallback(async (newGroups) => {
    const updates = newGroups.map((g, i) => ({ id: g.id, sort_order: i }));
    for (const u of updates) {
      await supabase.from("task_groups").update({ sort_order: u.sort_order }).eq("id", u.id);
    }
  }, []);

  // 上移 / 下移
  const moveGroup = useCallback(async (index, direction) => {
    const newGroups = [...groups];
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= newGroups.length) return;
    [newGroups[index], newGroups[targetIndex]] = [newGroups[targetIndex], newGroups[index]];
    setGroups(newGroups);
    await persistOrder(newGroups);
  }, [groups, persistOrder]);

  // 拖拽排序
  const handleDragStart = (index) => { dragIndexRef.current = index; };
  const handleDragOver = (e, index) => {
    e.preventDefault();
    dragOverIndexRef.current = index;
  };
  const handleDrop = async (e) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    const to = dragOverIndexRef.current;
    if (from === null || to === null || from === to) return;
    const newGroups = [...groups];
    const [moved] = newGroups.splice(from, 1);
    newGroups.splice(to, 0, moved);
    dragIndexRef.current = null;
    dragOverIndexRef.current = null;
    setGroups(newGroups);
    await persistOrder(newGroups);
  };
  const handleDragEnd = () => {
    dragIndexRef.current = null;
    dragOverIndexRef.current = null;
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setLoading(true); setError("");
    const payload = { name: form.name.trim(), color: form.color, keywords: form.keywords || [] };
    try {
      if (editing) {
        const { error: e } = await supabase.from("task_groups").update(payload).eq("id", editing.id);
        if (e) throw e;
      } else {
        // 新建时排在最后
        const maxOrder = groups.length > 0 ? Math.max(...groups.map((g) => g.sort_order ?? 0)) + 1 : 0;
        const { error: e } = await supabase.from("task_groups").insert([{ id: genId(), ...payload, sort_order: maxOrder }]);
        if (e) throw e;
      }
      await fetchGroups(); setForm({ name: "", color: PRESET_COLORS[2], keywords: [] }); setEditing(null);
    } catch (e) { setError("操作失败：" + e.message); } finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    await supabase.from("tasks").update({ group_id: null }).eq("group_id", id);
    await supabase.from("task_groups").delete().eq("id", id);
    fetchGroups();
  };

  return (
    <div className="space-y-4">
      <ErrorNotice error={error} tableName="task_groups" />
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">{editing ? "编辑分组" : "新建分组"}</p>
        <div>
          <label className="text-xs text-gray-500 mb-1 block">分组名称</label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="分组名称，例如 本周重点" />
        </div>
        <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
        <div>
          <p className="text-xs text-gray-500 mb-1.5">关键词 <span className="text-gray-400">（创建任务时自动匹配分组）</span></p>
          <KeywordsInput value={form.keywords} onChange={(kws) => setForm({ ...form, keywords: kws })} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="border-0" style={{ backgroundColor: "#bbea3b", color: "#2d4a00" }} onClick={handleSave} disabled={!form.name.trim() || loading}>
            {loading ? "保存中..." : editing ? "保存" : "创建"}
          </Button>
          {editing && <Button size="sm" variant="outline" onClick={() => { setEditing(null); setForm({ name: "", color: PRESET_COLORS[2], keywords: [] }); }}>取消</Button>}
        </div>
      </div>

      {groups.length > 0 && (
        <p className="text-xs text-gray-400 flex items-center gap-1 px-1">
          <GripVertical className="h-3 w-3" />
          拖动左侧图标或点击箭头可调整顺序，任务列表将按此顺序展示
        </p>
      )}

      <div className="space-y-1 max-h-[50vh] overflow-y-auto">
        {groups.map((g, index) => (
          <div
            key={g.id}
            draggable
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={handleDrop}
            onDragEnd={handleDragEnd}
            className="px-2 py-2 rounded-lg hover:bg-gray-50 group border border-transparent hover:border-gray-100 transition-all cursor-grab active:cursor-grabbing active:bg-blue-50 active:border-blue-200"
          >
            <div className="flex items-center justify-between gap-1">
              {/* 拖拽手柄 + 颜色 + 名称 */}
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <GripVertical className="h-4 w-4 text-gray-300 flex-shrink-0 group-hover:text-gray-400 transition-colors" />
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                <span className="text-sm text-gray-800 truncate font-medium">{g.name}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">#{index + 1}</span>
              </div>
              {/* 操作按钮 */}
              <div className="flex items-center gap-0.5 flex-shrink-0">
                {/* 上移/下移（移动端友好） */}
                <button
                  onClick={() => moveGroup(index, -1)}
                  disabled={index === 0}
                  className="p-1.5 rounded hover:bg-gray-200 text-gray-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  title="上移"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => moveGroup(index, 1)}
                  disabled={index === groups.length - 1}
                  className="p-1.5 rounded hover:bg-gray-200 text-gray-400 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                  title="下移"
                >
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => { setEditing(g); setForm({ name: g.name, color: g.color, keywords: g.keywords || [] }); }} className="p-1.5 rounded hover:bg-gray-200 text-gray-500 transition-colors"><Pencil className="h-3.5 w-3.5" /></button>
                <button onClick={() => handleDelete(g.id)} className="p-1.5 rounded hover:bg-red-100 text-red-400 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            {(g.keywords || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5 pl-7">
                {g.keywords.map((kw) => (
                  <span key={kw} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500">{kw}</span>
                ))}
              </div>
            )}
          </div>
        ))}
        {groups.length === 0 && !error && <p className="text-sm text-gray-400 text-center py-6">暂无分组，请先创建</p>}
      </div>
    </div>
  );
};

// ─── 配置内容主体（供右侧面板复用） ──────────────────────────────
export const ConfigContent = ({ defaultTab = "members" }) => (
  <Tabs defaultValue={defaultTab}>
    <TabsList className="w-full mb-4 bg-gray-100 rounded-lg p-1 grid grid-cols-3 gap-1 h-auto">
      <TabsTrigger value="members" className="flex items-center gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
        <Users className="h-3 w-3" />人员
      </TabsTrigger>
      <TabsTrigger value="tags" className="flex items-center gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
        <Tag className="h-3 w-3" />标签
      </TabsTrigger>
      <TabsTrigger value="groups" className="flex items-center gap-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">
        <FolderOpen className="h-3 w-3" />分组
      </TabsTrigger>
    </TabsList>
    <TabsContent value="members"><MembersPanel /></TabsContent>
    <TabsContent value="tags"><TagsPanel /></TabsContent>
    <TabsContent value="groups"><GroupsPanel /></TabsContent>
  </Tabs>
);

// ─── 侧边栏配置入口（PC端） ───────────────────────────────────────
// onOpen: () => void  —— 点击时通知父组件打开右侧配置面板
// active: bool        —— 当前是否处于配置视图（高亮状态）
export const SidebarConfigSection = ({ collapsed, onOpen, active = false }) => {
  // 收起状态：只显示图标按钮
  if (collapsed) {
    return (
      <div className="border-t border-gray-100 py-3 flex justify-center">
        <button
          onClick={onOpen}
          title="配置管理"
          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
            active ? "text-[#2d4a00]" : "text-gray-400 hover:text-gray-700 hover:bg-gray-50"
          }`}
          style={active ? { backgroundColor: "#bbea3b" } : {}}
        >
          <Settings className="h-5 w-5" />
        </button>
      </div>
    );
  }

  // 展开状态：显示完整入口行，点击跳转到右侧配置面板
  return (
    <div className="border-t border-gray-100">
      <button
        onClick={onOpen}
        className={`w-full flex items-center justify-between px-3 py-2.5 transition-colors rounded-none ${
          active ? "text-[#2d4a00]" : "hover:bg-gray-50 text-gray-700"
        }`}
        style={active ? { backgroundColor: "#f0f9d4" } : {}}
      >
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ backgroundColor: active ? "#bbea3b" : "#f0f9d4" }}
          >
            <Settings className="h-4 w-4" style={{ color: "#5a7a00" }} />
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold">配置管理</p>
            <p className="text-xs text-gray-400 truncate">人员 · 标签 · 分组</p>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
      </button>
    </div>
  );
};


export default SidebarConfigSection;

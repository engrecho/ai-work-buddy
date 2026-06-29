import { useEffect, useState, useRef } from "react";
import { Pencil, Trash2, ArrowLeft, Users, Tag, AlertCircle, FolderOpen, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  genId,
  clearStoredTaskAssignmentsByGroup,
  getStoredTaskGroups,
  saveStoredTaskGroups,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const PRESET_COLORS = [
  "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#06b6d4", "#6b7280", "#84cc16", "#f97316",
];

const ErrorNotice = ({ error, tableName }) => {
  if (!error) return null;

  return (
    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
      <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">错误提示</p>
        <p className="text-xs mt-0.5">{error}</p>
        <p className="text-xs mt-1 text-red-500">请检查数据库 `{tableName}` 表是否已创建，或联系管理员确认 RLS 策略。</p>
      </div>
    </div>
  );
};

const ColorPicker = ({ value, onChange }) => (
  <div>
    <p className="text-xs text-gray-500 mb-2">选择颜色</p>
    <div className="flex flex-wrap gap-2">
      {PRESET_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          className={`w-7 h-7 rounded-full border-2 transition-transform active:scale-95 ${value === color ? "border-gray-900 scale-110" : "border-transparent"}`}
          style={{ backgroundColor: color }}
        />
      ))}
    </div>
  </div>
);

// ─── 关键词输入组件 ────────────────────────────────────────────────
const KeywordsInput = ({ value = [], onChange }) => {
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef(null);

  const addKeyword = () => {
    const kw = inputVal.trim();
    if (!kw) return;
    // 支持逗号/空格分隔批量输入
    const newKws = kw.split(/[,，\s]+/).map(k => k.trim()).filter(k => k && !value.includes(k));
    if (newKws.length > 0) {
      onChange([...value, ...newKws]);
    }
    setInputVal("");
    inputRef.current?.focus();
  };

  const removeKeyword = (kw) => {
    onChange(value.filter(k => k !== kw));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" || e.key === "," || e.key === "，") {
      e.preventDefault();
      addKeyword();
    } else if (e.key === "Backspace" && !inputVal && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div>
      <p className="text-xs text-gray-500 mb-1.5">关键词
        <span className="text-gray-400 ml-1">（用于创建任务时自动匹配分组，支持逗号/回车分隔）</span>
      </p>
      <div
        className="min-h-[38px] flex flex-wrap gap-1.5 items-center px-2 py-1.5 border border-gray-200 rounded-lg bg-white cursor-text focus-within:border-[#bbea3b] focus-within:ring-1 focus-within:ring-[#bbea3b]/30 transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((kw) => (
          <span
            key={kw}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[#f0f9d4] text-[#3a5c00] border border-[#bbea3b]/50"
          >
            {kw}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeKeyword(kw); }}
              className="hover:text-red-500 transition-colors flex-shrink-0"
            >
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
    </div>
  );
};

// ─── 人员管理 ─────────────────────────────────────────────────────
const MembersPanel = () => {
  const [members, setMembers] = useState([]);
  const [form, setForm] = useState({ mis: "", name: "" });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchMembers(); }, []);

  const fetchMembers = async () => {
    const { data, error: fetchError } = await supabase.from("task_members").select("*").order("created_at", { ascending: true });
    if (fetchError) {
      setError("读取人员失败：" + fetchError.message);
      return;
    }
    setMembers(data || []);
    setError("");
  };

  const handleSave = async () => {
    if (!form.mis.trim() || !form.name.trim()) return;
    setLoading(true);
    setError("");

    try {
      if (editing) {
        const { error: updateError } = await supabase
          .from("task_members")
          .update({ mis: form.mis.trim(), name: form.name.trim() })
          .eq("id", editing.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("task_members")
          .insert([{ id: genId(), mis: form.mis.trim(), name: form.name.trim() }]);
        if (insertError) throw insertError;
      }

      await fetchMembers();
      setForm({ mis: "", name: "" });
      setEditing(null);
    } catch (e) {
      setError("操作失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (member) => {
    setEditing(member);
    setForm({ mis: member.mis, name: member.name });
  };

  const handleDelete = async (id) => {
    setError("");
    const { error: deleteError } = await supabase.from("task_members").delete().eq("id", id);
    if (deleteError) {
      setError("删除失败：" + deleteError.message);
      return;
    }
    await fetchMembers();
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
          <Button
            size="sm"
            className="border-0"
            style={{ backgroundColor: "#bbea3b", color: "#2d4a00" }}
            onClick={handleSave}
            disabled={!form.mis.trim() || !form.name.trim() || loading}
          >
            {loading ? "保存中..." : editing ? "保存" : "创建"}
          </Button>
          {editing && (
            <Button size="sm" variant="outline" onClick={() => { setEditing(null); setForm({ mis: "", name: "" }); }}>
              取消
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {members.map((member) => (
          <div key={member.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 group">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 text-white"
                style={{ backgroundColor: "#5a7a00" }}
              >
                {member.name.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">{member.name}</p>
                <p className="text-xs text-gray-400">{member.mis}</p>
              </div>
            </div>
            <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <button onClick={() => handleEdit(member)} className="p-1.5 rounded hover:bg-gray-200 text-gray-500">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => handleDelete(member.id)} className="p-1.5 rounded hover:bg-red-100 text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {members.length === 0 && !error && <p className="text-sm text-gray-400 text-center py-6">暂无人员，请先添加</p>}
      </div>
    </div>
  );
};

// ─── 标签管理 ─────────────────────────────────────────────────────
const TagsPanel = () => {
  const [tags, setTags] = useState([]);
  const [form, setForm] = useState({ name: "", color: PRESET_COLORS[0] });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchTags(); }, []);

  const fetchTags = async () => {
    const { data, error: fetchError } = await supabase.from("task_tags").select("*").order("created_at", { ascending: true });
    if (fetchError) {
      setError("读取标签失败：" + fetchError.message);
      return;
    }
    setTags(data || []);
    setError("");
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    setError("");

    try {
      if (editing) {
        const { error: updateError } = await supabase
          .from("task_tags")
          .update({ name: form.name.trim(), color: form.color })
          .eq("id", editing.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("task_tags")
          .insert([{ id: genId(), name: form.name.trim(), color: form.color }]);
        if (insertError) throw insertError;
      }

      await fetchTags();
      setForm({ name: "", color: PRESET_COLORS[0] });
      setEditing(null);
    } catch (e) {
      setError("操作失败：" + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (tag) => {
    setEditing(tag);
    setForm({ name: tag.name, color: tag.color });
  };

  const handleDelete = async (id) => {
    setError("");
    const { error: deleteError } = await supabase.from("task_tags").delete().eq("id", id);
    if (deleteError) {
      setError("删除失败：" + deleteError.message);
      return;
    }
    await fetchTags();
  };

  return (
    <div className="space-y-4">
      <ErrorNotice error={error} tableName="task_tags" />
      <div className="bg-gray-50 rounded-xl p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700">{editing ? "编辑标签" : "新建标签"}</p>
        <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="标签名称" />
        <ColorPicker value={form.color} onChange={(color) => setForm({ ...form, color })} />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="border-0"
            style={{ backgroundColor: "#bbea3b", color: "#2d4a00" }}
            onClick={handleSave}
            disabled={!form.name.trim() || loading}
          >
            {loading ? "保存中..." : editing ? "保存" : "创建"}
          </Button>
          {editing && (
            <Button size="sm" variant="outline" onClick={() => { setEditing(null); setForm({ name: "", color: PRESET_COLORS[0] }); }}>
              取消
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {tags.map((tag) => (
          <div key={tag.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-gray-50 group">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: tag.color }} />
              <span className="text-sm text-gray-800">{tag.name}</span>
            </div>
            <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
              <button onClick={() => handleEdit(tag)} className="p-1.5 rounded hover:bg-gray-200 text-gray-500">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => handleDelete(tag.id)} className="p-1.5 rounded hover:bg-red-100 text-red-400">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}
        {tags.length === 0 && !error && <p className="text-sm text-gray-400 text-center py-6">暂无标签，请先创建</p>}
      </div>
    </div>
  );
};

// ─── 分组管理 ─────────────────────────────────────────────────────
const GroupsPanel = () => {
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({ name: "", color: PRESET_COLORS[2], keywords: [] });
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchGroups(); }, []);

  const fetchGroups = async () => {
    const { data, error: fetchError } = await supabase.from("task_groups").select("*").order("created_at", { ascending: true });
    if (fetchError) {
      const fallback = getStoredTaskGroups();
      setGroups(fallback);
      setError("");
      return;
    }
    const nextGroups = data || [];
    setGroups(nextGroups);
    saveStoredTaskGroups(nextGroups);
    setError("");
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setLoading(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      color: form.color,
      keywords: form.keywords || [],
    };

    try {
      if (editing) {
        const { error: updateError } = await supabase
          .from("task_groups")
          .update(payload)
          .eq("id", editing.id);
        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from("task_groups")
          .insert([{ id: genId(), ...payload }]);
        if (insertError) throw insertError;
      }

      await fetchGroups();
      setForm({ name: "", color: PRESET_COLORS[2], keywords: [] });
      setEditing(null);
    } catch (e) {
      // 降级到 localStorage
      const currentGroups = getStoredTaskGroups();
      const nextGroups = editing
        ? currentGroups.map((group) => group.id === editing.id ? { ...group, ...payload } : group)
        : [...currentGroups, { id: genId(), created_at: new Date().toISOString(), ...payload }];
      saveStoredTaskGroups(nextGroups);
      setGroups(nextGroups);
      setForm({ name: "", color: PRESET_COLORS[2], keywords: [] });
      setEditing(null);
      setError("");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (group) => {
    setEditing(group);
    setForm({ name: group.name, color: group.color, keywords: group.keywords || [] });
  };

  const handleDelete = async (id) => {
    setError("");

    try {
      const { error: clearError } = await supabase.from("tasks").update({ group_id: null }).eq("group_id", id);
      if (clearError) throw clearError;

      const { error: deleteError } = await supabase.from("task_groups").delete().eq("id", id);
      if (deleteError) throw deleteError;

      await fetchGroups();
    } catch (e) {
      const nextGroups = getStoredTaskGroups().filter((group) => group.id !== id);
      saveStoredTaskGroups(nextGroups);
      clearStoredTaskAssignmentsByGroup(id);
      setGroups(nextGroups);
      setError("");
    }
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
        <KeywordsInput
          value={form.keywords}
          onChange={(kws) => setForm({ ...form, keywords: kws })}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="border-0"
            style={{ backgroundColor: "#bbea3b", color: "#2d4a00" }}
            onClick={handleSave}
            disabled={!form.name.trim() || loading}
          >
            {loading ? "保存中..." : editing ? "保存" : "创建"}
          </Button>
          {editing && (
            <Button size="sm" variant="outline" onClick={() => { setEditing(null); setForm({ name: "", color: PRESET_COLORS[2], keywords: [] }); }}>
              取消
            </Button>
          )}
        </div>
      </div>
      <div className="space-y-1 max-h-[60vh] overflow-y-auto">
        {groups.map((group) => (
          <div key={group.id} className="px-3 py-2.5 rounded-lg hover:bg-gray-50 group">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: group.color }} />
                <span className="text-sm text-gray-800 truncate font-medium">{group.name}</span>
              </div>
              <div className="flex gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
                <button onClick={() => handleEdit(group)} className="p-1.5 rounded hover:bg-gray-200 text-gray-500">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => handleDelete(group.id)} className="p-1.5 rounded hover:bg-red-100 text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {/* 关键词展示 */}
            {(group.keywords || []).length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1.5 pl-5">
                {group.keywords.map((kw) => (
                  <span key={kw} className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-500">
                    {kw}
                  </span>
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

// ─── 主页面 ───────────────────────────────────────────────────────
const TaskConfigPage = ({ onBack }) => (
  <div className="h-full overflow-y-auto bg-[#f5f5f5]">
    <div className="max-w-2xl mx-auto px-4 py-4 md:py-6">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} className="text-gray-500 hover:text-gray-700 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold text-gray-900">任务配置</h2>
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4 md:p-6">
        <Tabs defaultValue="members">
          <TabsList className="w-full mb-5 bg-gray-100 rounded-lg p-1 grid grid-cols-3 gap-1 h-auto">
            <TabsTrigger value="members" className="flex items-center gap-1.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Users className="h-3.5 w-3.5" />人员管理
            </TabsTrigger>
            <TabsTrigger value="tags" className="flex items-center gap-1.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <Tag className="h-3.5 w-3.5" />标签管理
            </TabsTrigger>
            <TabsTrigger value="groups" className="flex items-center gap-1.5 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <FolderOpen className="h-3.5 w-3.5" />分组管理
            </TabsTrigger>
          </TabsList>
          <TabsContent value="members"><MembersPanel /></TabsContent>
          <TabsContent value="tags"><TagsPanel /></TabsContent>
          <TabsContent value="groups"><GroupsPanel /></TabsContent>
        </Tabs>
      </div>
    </div>
  </div>
);

export default TaskConfigPage;
export { MembersPanel, TagsPanel, GroupsPanel };

import { useState, useEffect } from "react";
import { CheckSquare, FileText, Zap, BookOpen, ArrowRight, Circle, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const STATUS_ICON = {
  todo: <Circle className="h-3.5 w-3.5 text-gray-400" />,
  in_progress: <Loader2 className="h-3.5 w-3.5 text-blue-500" />,
  done: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
};
const STATUS_LABEL = { todo: "待办", in_progress: "进行中", done: "已完成" };

const DashboardPage = ({ onNavigate }) => {
  const [stats, setStats] = useState({ tasks: 0, memos: 0, notes: 0, reading: 0 });
  const [recentTasks, setRecentTasks] = useState([]);
  const [recentNotes, setRecentNotes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchStats(); }, []);

  const fetchStats = async () => {
    try {
      const [t, m, n, r, rt, rn] = await Promise.all([
        supabase.from("tasks").select("id", { count: "exact" }).eq("status", "todo"),
        supabase.from("memos").select("id", { count: "exact" }),
        supabase.from("quick_notes").select("id", { count: "exact" }),
        supabase.from("reading_items").select("id", { count: "exact" }).eq("is_read", false),
        supabase.from("tasks").select("*").order("created_at", { ascending: false }).limit(4),
        supabase.from("quick_notes").select("*").order("created_at", { ascending: false }).limit(2),
      ]);
      setStats({ tasks: t.count || 0, memos: m.count || 0, notes: n.count || 0, reading: r.count || 0 });
      setRecentTasks(rt.data || []);
      setRecentNotes(rn.data || []);
    } finally {
      setLoading(false);
    }
  };

  const statItems = [
    { id: "tasks",      label: "待办任务", value: stats.tasks,   icon: CheckSquare },
    { id: "memos",      label: "备忘录",   value: stats.memos,   icon: FileText    },
    { id: "quicknotes", label: "随记",     value: stats.notes,   icon: Zap         },
    { id: "reading",    label: "待读文章", value: stats.reading, icon: BookOpen    },
  ];

  return (
    <div className="h-full overflow-y-auto bg-[#f5f5f5]">
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-4 md:py-6 space-y-4 md:space-y-5">

        {/* Greeting Banner */}
        <div
          className="rounded-xl px-5 py-4 md:py-6"
          style={{ background: "linear-gradient(135deg, #bbea3b 0%, #d4f56a 60%, #e8fca0 100%)" }}
        >
          <p className="text-xs mb-0.5" style={{ color: "#4a6800" }}>
            {new Date().toLocaleDateString("zh-CN", { weekday: "long", month: "long", day: "numeric" })}
          </p>
          <h2 className="text-xl font-bold" style={{ color: "#2d4a00" }}>今日概览</h2>
          <p className="text-sm mt-1" style={{ color: "#4a6800" }}>保持专注，高效完成每一项工作</p>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {statItems.map(({ id, label, value, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className="bg-white rounded-xl flex items-center gap-3 px-4 py-4 hover:shadow-md active:scale-[0.98] transition-all border border-gray-100 text-left group"
            >
              <div
                className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                style={{ backgroundColor: "#bbea3b22" }}
              >
                <Icon className="h-5 w-5" style={{ color: "#5a7a00" }} />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold leading-none" style={{ color: "#2d4a00" }}>
                  {loading ? "—" : value}
                </div>
                <div className="text-xs text-gray-500 mt-1">{label}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Bottom two columns on PC */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
          {/* Recent Tasks */}
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <span className="text-sm font-medium text-gray-900">最近任务</span>
              <button
                onClick={() => onNavigate("tasks")}
                className="flex items-center gap-0.5 text-xs hover:opacity-80 transition-opacity"
                style={{ color: "#5a7a00" }}
              >
                全部 <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {loading ? (
              <div className="px-4 py-3 space-y-3">
                {[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : recentTasks.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">暂无任务</div>
            ) : (
              <div>
                {recentTasks.map((task, i) => (
                  <div key={task.id}
                    className={`flex items-center gap-3 px-4 py-3 ${i < recentTasks.length - 1 ? "border-b border-gray-50" : ""}`}>
                    {STATUS_ICON[task.status] || STATUS_ICON.todo}
                    <span className="flex-1 text-sm text-gray-800 truncate">{task.title}</span>
                    <span className="text-xs text-gray-400">{STATUS_LABEL[task.status]}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Notes */}
          <div className="bg-white rounded-xl border border-gray-100">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-50">
              <span className="text-sm font-medium text-gray-900">最新随记</span>
              <button
                onClick={() => onNavigate("quicknotes")}
                className="flex items-center gap-0.5 text-xs hover:opacity-80 transition-opacity"
                style={{ color: "#5a7a00" }}
              >
                全部 <ArrowRight className="h-3 w-3" />
              </button>
            </div>
            {loading ? (
              <div className="px-4 py-3 space-y-3">
                {[1,2].map(i => <div key={i} className="h-14 bg-gray-100 rounded animate-pulse" />)}
              </div>
            ) : recentNotes.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">暂无随记</div>
            ) : (
              <div>
                {recentNotes.map((note, i) => (
                  <div key={note.id}
                    className={`px-4 py-3 ${i < recentNotes.length - 1 ? "border-b border-gray-50" : ""}`}>
                    <p className="text-sm text-gray-700 line-clamp-2">{note.content}</p>
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(note.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default DashboardPage;

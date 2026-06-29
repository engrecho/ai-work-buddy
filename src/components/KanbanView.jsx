import { useState, useRef } from "react";
import { CheckCircle2, Circle, Flag, Calendar, User, Megaphone, GripVertical, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, CornerDownRight, Layers, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// ─── 日期工具 ─────────────────────────────────────────────────────
const toDateStr = (d) => d.toISOString().slice(0, 10);

const getDateBounds = () => {
  const now = new Date();
  const todayStr = toDateStr(now);

  const in3 = new Date(now);
  in3.setDate(now.getDate() + 2);
  const in3Str = toDateStr(in3);

  const dow = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - dow);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekStartStr = toDateStr(weekStart);
  const weekEndStr = toDateStr(weekEnd);

  return { todayStr, in3Str, weekStartStr, weekEndStr };
};

// ─── 看板列定义 ───────────────────────────────────────────────────
// 判断任务自身的 due_date / plan_date 任一满足指定日期范围
const taskSelfMatchDate = (task, check) => {
  const dates = [task.due_date, task.plan_date].filter(Boolean).map(d => d.slice(0, 10));
  return dates.some(check);
};

// 判断任务自身或其任意子孙是否满足日期条件（allTasks 为全量任务列表）
const taskOrDescendantMatchDate = (task, allTasks, check) => {
  if (taskSelfMatchDate(task, check)) return true;
  const children = allTasks.filter(t => t.parent_id === task.id);
  return children.some(child => taskOrDescendantMatchDate(child, allTasks, check));
};

const getColumns = () => {
  const { todayStr, in3Str, weekStartStr, weekEndStr } = getDateBounds();
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = toDateStr(tomorrow);
  const in3Next = new Date();
  in3Next.setDate(in3Next.getDate() + 3);
  const in3NextStr = toDateStr(in3Next);

  return [
    {
      id: "today",
      label: "今日待办",
      color: "#ef4444",
      bgColor: "#fef2f2",
      borderColor: "#fecaca",
      dotColor: "bg-red-400",
      // 自身满足：due_date 或 plan_date 任一 <= 今日
      matchSelf: (task) => taskSelfMatchDate(task, d => d <= todayStr),
      targetDate: todayStr,
    },
    {
      id: "3days",
      label: "近3日待办",
      color: "#f97316",
      bgColor: "#fff7ed",
      borderColor: "#fed7aa",
      dotColor: "bg-orange-400",
      // 自身满足：due_date 或 plan_date 任一在明天~3天内
      matchSelf: (task) => taskSelfMatchDate(task, d => d >= tomorrowStr && d <= in3Str),
      targetDate: tomorrowStr,
    },
    {
      id: "week",
      label: "本周待办",
      color: "#3b82f6",
      bgColor: "#eff6ff",
      borderColor: "#bfdbfe",
      dotColor: "bg-blue-400",
      // 自身满足：due_date 或 plan_date 任一在本周剩余天(3天后~周末)
      matchSelf: (task) => taskSelfMatchDate(task, d => d >= in3NextStr && d <= weekEndStr),
      targetDate: weekEndStr,
    },
    {
      id: "later",
      label: "非紧急待办",
      color: "#6b7280",
      bgColor: "#f9fafb",
      borderColor: "#e5e7eb",
      dotColor: "bg-gray-400",
      // 无日期 或 日期超出本周
      matchSelf: (task) => {
        const dates = [task.due_date, task.plan_date].filter(Boolean).map(d => d.slice(0, 10));
        if (dates.length === 0) return true;
        return dates.every(d => d > weekEndStr);
      },
      targetDate: null,
    },
  ];
};

// ─── 优先级颜色 ───────────────────────────────────────────────────
const PRIORITY_COLOR = {
  high: "text-red-500",
  medium: "text-amber-500",
  low: "text-gray-400",
};

// ─── 日期格式化工具：任意 ISO 字符串 → MM/DD HH:mm ─────────────
const formatDateTime = (str) => {
  if (!str) return "";
  try {
    const d = new Date(str);
    if (isNaN(d)) return str.slice(5, 10).replace("-", "/");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    // 如果时间是 00:00，只显示日期
    if (hh === "00" && mi === "00") return `${mm}/${dd}`;
    return `${mm}/${dd} ${hh}:${mi}`;
  } catch {
    return str.slice(5, 10).replace("-", "/");
  }
};

// ─── 单张任务卡片 ─────────────────────────────────────────────────
const KanbanCard = ({ task, allTasks, members, groups, onSelect, onToggleDone, isDragging }) => {
  const ownerNames = (task.owner_ids || [])
    .map((id) => members.find((m) => m.id === id || m.id === String(id)))
    .filter(Boolean)
    .map((m) => m.name)
    .slice(0, 2);

  const dateStr = task.plan_date || task.due_date;
  const today = toDateStr(new Date());
  const isOverdue = dateStr && dateStr.slice(0, 10) < today && task.status !== "done";

  // 所属分组
  const group = groups && task.group_id
    ? groups.find((g) => g.id === task.group_id || String(g.id) === String(task.group_id))
    : null;

  // 上级任务
  const parentTask = task.parent_id ? allTasks.find((t) => t.id === task.parent_id) : null;

  return (
    <div
      className={`bg-white rounded-xl border transition-all select-none ${
        isDragging
          ? "shadow-xl border-blue-300 opacity-90 rotate-1 scale-105"
          : "border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200"
      }`}
    >
      <div className="p-3">
        {/* 上级项目标签 */}
        {parentTask && (
          <div className="flex items-center gap-1 mb-1.5">
            <CornerDownRight className="h-3 w-3 text-gray-300 flex-shrink-0" />
            <span className="text-[10px] text-gray-400 truncate max-w-[160px]">{parentTask.title}</span>
          </div>
        )}

        {/* 顶部：完成按钮 + 标题 */}
        <div className="flex items-start gap-2">
          {/* 完成按钮 */}
          <button
            onClick={(e) => { e.stopPropagation(); onToggleDone(task); }}
            className="flex-shrink-0 mt-0.5"
          >
            {task.status === "done" ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <Circle className="h-4 w-4 text-gray-300 hover:text-green-400 transition-colors" />
            )}
          </button>

          {/* 标题 */}
          <button
            onClick={() => onSelect(task)}
            className={`flex-1 text-left text-sm leading-snug ${
              task.status === "done" ? "line-through text-gray-400" : "text-gray-800 hover:text-gray-900"
            }`}
          >
            {task.title}
            {task.need_report && (
              <span className="inline-flex items-center ml-1.5 align-middle">
                <Megaphone className="h-3 w-3 text-orange-400" />
              </span>
            )}
          </button>
        </div>

        {/* 底部：分组 + 日期 + 主R + 优先级 */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-2 pl-6">
          {/* 分组标签 */}
          {group && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium flex-shrink-0"
              style={{ backgroundColor: (group.color || "#6b7280") + "22", color: group.color || "#6b7280" }}
            >
              {group.name}
            </span>
          )}
          {/* 日期 */}
          {dateStr && (
            <span className={`flex items-center gap-0.5 text-[11px] flex-shrink-0 ${isOverdue ? "text-red-500 font-medium" : "text-gray-400"}`}>
              <Calendar className="h-3 w-3" />
              {formatDateTime(dateStr)}
              {isOverdue && <span className="ml-0.5">逾期</span>}
            </span>
          )}
          {/* 主R */}
          {ownerNames.length > 0 && (
            <span className="flex items-center gap-0.5 text-[11px] text-gray-400 flex-shrink-0">
              <User className="h-3 w-3" />
              {ownerNames.join("、")}
            </span>
          )}
          {/* 优先级 */}
          {task.priority && task.priority !== "medium" && (
            <Flag className={`h-3 w-3 ml-auto ${PRIORITY_COLOR[task.priority] || "text-gray-400"}`} />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── 可拖拽卡片包装（PC） ─────────────────────────────────────────
const DraggableCard = ({ task, allTasks, members, groups, onSelect, onToggleDone, onDragStart, onDragEnd, isDragging }) => {
  const cardRef = useRef(null);

  const handleDragStart = (e) => {
    e.dataTransfer.effectAllowed = "move";
    onDragStart(task);
  };

  const touchState = useRef({ startX: 0, startY: 0, moving: false });

  const handleTouchStart = (e) => {
    const t = e.touches[0];
    touchState.current = { startX: t.clientX, startY: t.clientY, moving: false };
    onDragStart(task);
  };

  const handleTouchMove = (e) => {
    touchState.current.moving = true;
    const t = e.touches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const col = el?.closest("[data-column-id]");
    if (col) {
      document.querySelectorAll("[data-column-id]").forEach((c) => c.classList.remove("touch-drag-over"));
      col.classList.add("touch-drag-over");
    }
  };

  const handleTouchEnd = (e) => {
    document.querySelectorAll("[data-column-id]").forEach((c) => c.classList.remove("touch-drag-over"));
    const t = e.changedTouches[0];
    const el = document.elementFromPoint(t.clientX, t.clientY);
    const col = el?.closest("[data-column-id]");
    if (col && touchState.current.moving) {
      const colId = col.getAttribute("data-column-id");
      onDragEnd(colId);
    } else {
      onDragEnd(null);
    }
  };

  return (
    <div
      ref={cardRef}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={() => onDragEnd(null)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className={`transition-opacity ${isDragging ? "opacity-40" : "opacity-100"}`}
    >
      <KanbanCard
        task={task}
        allTasks={allTasks}
        members={members}
        groups={groups}
        onSelect={onSelect}
        onToggleDone={onToggleDone}
        isDragging={isDragging}
      />
    </div>
  );
};

// ─── PC 看板列 ────────────────────────────────────────────────────
const KanbanColumn = ({
  column,
  tasks,
  allTasks,
  members,
  groups,
  onSelect,
  onToggleDone,
  onDrop,
  draggingTask,
  onDragStart,
  onDragEnd,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleDragOver = (e) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e) => { e.preventDefault(); setIsDragOver(false); onDrop(column); };

  return (
    <div
      className={`flex flex-col rounded-2xl border-2 transition-all min-w-[260px] md:min-w-0 md:flex-1 ${
        isDragOver ? "border-dashed scale-[1.01]" : "border-transparent"
      }`}
      style={isDragOver
        ? { borderColor: column.color, backgroundColor: column.bgColor }
        : { backgroundColor: column.bgColor, borderColor: column.borderColor }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      data-column-id={column.id}
    >
      {/* 列头 */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 rounded-t-xl cursor-pointer select-none"
        onClick={() => setCollapsed((v) => !v)}
      >
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${column.dotColor}`} />
        <span className="text-sm font-semibold text-gray-800 flex-1">{column.label}</span>
        <span
          className="text-xs font-medium px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: column.color + "22", color: column.color }}
        >
          {tasks.length}
        </span>
        {collapsed ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronUp className="h-3.5 w-3.5 text-gray-400" />}
      </div>

      {/* 卡片列表 */}
      {!collapsed && (
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-2 min-h-[80px]">
          {tasks.map((task) => (
            <DraggableCard
              key={task.id}
              task={task}
              allTasks={allTasks}
              members={members}
              groups={groups}
              onSelect={onSelect}
              onToggleDone={onToggleDone}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              isDragging={draggingTask?.id === task.id}
            />
          ))}
          {tasks.length === 0 && (
            <div className="flex items-center justify-center h-16 text-xs text-gray-300">
              {isDragOver ? "松开放置到此列" : "暂无任务"}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── 移动端看板：上下排列 + 左滑切换列 ───────────────────────────
const MobileKanban = ({
  columns,
  getColumnTasks,
  todayDone,
  allTasks,
  members,
  groups,
  onSelect,
  onToggleDone,
  onMoveTask,
  draggingTask,
  onDragStart,
  onDragEnd,
}) => {
  const [activeColIdx, setActiveColIdx] = useState(0);
  const containerRef = useRef(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
    // 水平滑动距离 > 60px 且垂直偏移 < 40px 才触发切换
    if (Math.abs(dx) > 60 && dy < 40) {
      if (dx < 0 && activeColIdx < columns.length - 1) {
        setActiveColIdx((v) => v + 1);
      } else if (dx > 0 && activeColIdx > 0) {
        setActiveColIdx((v) => v - 1);
      }
    }
  };

  const col = columns[activeColIdx];
  const colTasks = getColumnTasks(col);
  const allColTasks = col.id === "today" ? [...colTasks, ...todayDone] : colTasks;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* 顶部 Tab 导航 */}
      <div className="flex-shrink-0 flex items-center bg-white border-b border-gray-100 px-2 py-1.5 gap-1 overflow-x-auto">
        {columns.map((c, i) => {
          const cnt = (getColumnTasks(c).length + (c.id === "today" ? todayDone.length : 0));
          return (
            <button
              key={c.id}
              onClick={() => setActiveColIdx(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0 ${
                i === activeColIdx
                  ? "text-white shadow-sm"
                  : "text-gray-500 bg-gray-100"
              }`}
              style={i === activeColIdx ? { backgroundColor: c.color } : {}}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${c.dotColor} ${i === activeColIdx ? "bg-white/70" : ""}`} />
              {c.label}
              <span
                className={`text-[10px] px-1 rounded-full ${i === activeColIdx ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"}`}
              >
                {cnt}
              </span>
            </button>
          );
        })}
      </div>

      {/* 左右切换箭头 + 内容区 */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden relative"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* 左箭头 */}
        {activeColIdx > 0 && (
          <button
            onClick={() => setActiveColIdx((v) => v - 1)}
            className="absolute left-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-gray-400 active:scale-95"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        {/* 右箭头 */}
        {activeColIdx < columns.length - 1 && (
          <button
            onClick={() => setActiveColIdx((v) => v + 1)}
            className="absolute right-1 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white shadow-md flex items-center justify-center text-gray-400 active:scale-95"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* 当前列内容 */}
        <div
          className="h-full overflow-y-auto px-3 py-2 space-y-2"
          style={{ backgroundColor: col.bgColor }}
          data-column-id={col.id}
        >
          {allColTasks.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-300">
              <CheckCircle2 className="h-10 w-10 mb-2" />
              <span className="text-xs">暂无任务</span>
            </div>
          )}
          {allColTasks.map((task) => (
            <MobileSwipeCard
              key={task.id}
              task={task}
              allTasks={allTasks}
              members={members}
              groups={groups}
              onSelect={onSelect}
              onToggleDone={onToggleDone}
              columns={columns}
              currentColIdx={activeColIdx}
              onMoveTask={onMoveTask}
            />
          ))}
        </div>
      </div>

      {/* 底部分页点 */}
      <div className="flex-shrink-0 flex items-center justify-center gap-1.5 py-2 bg-white border-t border-gray-100">
        {columns.map((c, i) => (
          <button
            key={c.id}
            onClick={() => setActiveColIdx(i)}
            className={`rounded-full transition-all ${i === activeColIdx ? "w-4 h-2" : "w-2 h-2 bg-gray-200"}`}
            style={i === activeColIdx ? { backgroundColor: c.color } : {}}
          />
        ))}
      </div>
    </div>
  );
};

// ─── 移动端左滑卡片（支持左滑快速移动到其他列） ──────────────────
const MobileSwipeCard = ({ task, allTasks, members, groups, onSelect, onToggleDone, columns, currentColIdx, onMoveTask }) => {
  const [swipeX, setSwipeX] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isVertical = useRef(false);

  const SWIPE_THRESHOLD = 60;
  const MAX_SWIPE = 120;

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isVertical.current = false;
    setSwiping(false);
  };

  const handleTouchMove = (e) => {
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = Math.abs(e.touches[0].clientY - touchStartY.current);

    // 如果垂直方向移动更多，认为是滚动，不处理
    if (!swiping && dy > Math.abs(dx) && dy > 10) {
      isVertical.current = true;
      return;
    }
    if (isVertical.current) return;

    // 只处理左滑（负值）
    if (dx < -5) {
      e.preventDefault();
      setSwiping(true);
      setSwipeX(Math.max(dx, -MAX_SWIPE));
    }
  };

  const handleTouchEnd = () => {
    if (swipeX < -SWIPE_THRESHOLD) {
      // 左滑超过阈值：弹出操作菜单（通过 setSwipeX 保持展开状态）
      setSwipeX(-MAX_SWIPE);
    } else {
      setSwipeX(0);
    }
    setSwiping(false);
  };

  const handleMoveToCol = (col) => {
    setSwipeX(0);
    onMoveTask(task, col);
  };

  // 其他列（排除当前列）
  const otherCols = columns.filter((_, i) => i !== currentColIdx);

  return (
    <div className="relative overflow-hidden rounded-xl">
      {/* 左滑后显示的操作按钮 */}
      <div
        className="absolute right-0 top-0 bottom-0 flex items-center gap-1 px-2"
        style={{ width: MAX_SWIPE }}
      >
        {otherCols.slice(0, 2).map((col) => (
          <button
            key={col.id}
            onClick={() => handleMoveToCol(col)}
            className="flex-1 h-full flex flex-col items-center justify-center gap-0.5 rounded-lg text-white text-[10px] font-medium"
            style={{ backgroundColor: col.color }}
          >
            <span className={`w-2 h-2 rounded-full bg-white/60`} />
            <span className="leading-tight text-center px-0.5">{col.label.replace("待办", "")}</span>
          </button>
        ))}
      </div>

      {/* 卡片主体 */}
      <div
        className="relative z-10 transition-transform"
        style={{
          transform: `translateX(${swipeX}px)`,
          transition: swiping ? "none" : "transform 0.2s ease",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <KanbanCard
          task={task}
          allTasks={allTasks}
          members={members}
          groups={groups}
          onSelect={onSelect}
          onToggleDone={onToggleDone}
          isDragging={false}
        />
      </div>
    </div>
  );
};

// ─── 分组筛选下拉器 ──────────────────────────────────────────────
const GroupFilterSelect = ({ groups, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const selectedGroup = groups.find(g => String(g.id) === String(value));

  return (
    <div className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium border transition-all ${
          value !== "all"
            ? "border-transparent shadow-sm"
            : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
        }`}
        style={value !== "all" && selectedGroup ? {
          backgroundColor: selectedGroup.color + "22",
          color: selectedGroup.color,
          border: `1px solid ${selectedGroup.color}44`,
        } : {}}
      >
        <Layers className="h-3.5 w-3.5 flex-shrink-0" />
        <span className="whitespace-nowrap">
          {value === "all" ? "全部分组" : (selectedGroup?.name || "全部分组")}
        </span>
        <ChevronDown className={`h-3 w-3 flex-shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 left-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden min-w-[160px]">
            {/* 全部分组 */}
            <button
              type="button"
              onClick={() => { onChange("all"); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                value === "all" ? "bg-gray-50 font-medium text-gray-800" : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-full border border-dashed border-gray-300 flex-shrink-0" />
              <span>全部分组</span>
              {value === "all" && <Check className="h-3.5 w-3.5 ml-auto text-gray-500" />}
            </button>
            {groups.length > 0 && <div className="border-t border-gray-100 mx-2" />}
            {groups.map(g => (
              <button
                key={g.id}
                type="button"
                onClick={() => { onChange(String(g.id)); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  String(value) === String(g.id) ? "bg-gray-50" : "hover:bg-gray-50"
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                <span className="truncate font-medium flex-1 text-left" style={{ color: g.color }}>{g.name}</span>
                {String(value) === String(g.id) && <Check className="h-3.5 w-3.5 flex-shrink-0" style={{ color: g.color }} />}
              </button>
            ))}
            {groups.length === 0 && (
              <div className="px-3 py-4 text-xs text-center text-gray-400">暂无分组</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

// ─── 主看板视图 ───────────────────────────────────────────────────
const KanbanView = ({ tasks, members, groups, onSelect, onRefresh }) => {
  const [draggingTask, setDraggingTask] = useState(null);
  const [filterGroupId, setFilterGroupId] = useState("all");
  const draggingTaskRef = useRef(null);

  const columns = getColumns();

  // 已完成任务：次日自动隐藏
  const today = toDateStr(new Date());
  const visibleTasks = tasks.filter((task) => {
    if (task.status === "done") {
      const completedAt = task.updated_at;
      if (!completedAt) return false;
      return completedAt.slice(0, 10) >= today;
    }
    return true;
  });

  // 分组筛选
  const groupFilteredTasks = filterGroupId === "all"
    ? visibleTasks
    : visibleTasks.filter(t => String(t.group_id) === String(filterGroupId));

  // 预计算各列的日期 check 函数，供 getColumnTasks 使用
  const { todayStr: _todayStr, in3Str: _in3Str, weekEndStr: _weekEndStr } = getDateBounds();
  const _tomorrow = new Date(); _tomorrow.setDate(_tomorrow.getDate() + 1);
  const _tomorrowStr = toDateStr(_tomorrow);
  const _in3Next = new Date(); _in3Next.setDate(_in3Next.getDate() + 3);
  const _in3NextStr = toDateStr(_in3Next);

  const colCheckFns = {
    today:  (d) => d <= _todayStr,
    "3days": (d) => d >= _tomorrowStr && d <= _in3Str,
    week:   (d) => d >= _in3NextStr && d <= _weekEndStr,
  };

  // 优先级顺序判断：今日 > 近3日 > 本周 > 非紧急
  // 每个任务只归入优先级最高的列，不重复出现
  const getTaskPriorityColumn = (task) => {
    if (task.status === "done") return null;
    // 按优先级顺序依次检查
    if (taskOrDescendantMatchDate(task, tasks, colCheckFns["today"])) return "today";
    if (taskOrDescendantMatchDate(task, tasks, colCheckFns["3days"])) return "3days";
    if (taskOrDescendantMatchDate(task, tasks, colCheckFns["week"])) return "week";
    return "later"; // 无日期 或 日期超出本周
  };

  const getColumnTasks = (col) => {
    return groupFilteredTasks.filter((t) => getTaskPriorityColumn(t) === col.id);
  };

  const getTodayDoneTasks = () =>
    groupFilteredTasks.filter((t) => {
      if (t.status !== "done") return false;
      const completedAt = t.updated_at;
      return completedAt && completedAt.slice(0, 10) >= today;
    });

  const handleDragStart = (task) => {
    setDraggingTask(task);
    draggingTaskRef.current = task;
  };

  const handleDrop = async (column) => {
    const task = draggingTaskRef.current;
    if (!task) return;
    setDraggingTask(null);
    draggingTaskRef.current = null;
    await moveTaskToColumn(task, column);
  };

  const handleDragEnd = async (colId) => {
    const task = draggingTaskRef.current;
    setDraggingTask(null);
    draggingTaskRef.current = null;
    if (!colId || !task) return;
    const col = columns.find((c) => c.id === colId);
    if (col) await moveTaskToColumn(task, col);
  };

  const moveTaskToColumn = async (task, column) => {
    const newPlanDate = column.targetDate; // null => 非紧急（清空计划日期）
    const currentPlanDate = task.plan_date ? task.plan_date.slice(0, 10) : null;
    if (currentPlanDate === newPlanDate) return;

    const update = { plan_date: newPlanDate, updated_at: new Date().toISOString() };

    // 若拖拽后 due_date 早于新 plan_date，把 due_date 调整为与 plan_date 一致
    // 避免出现「截止日期 < 计划日期」的矛盾状态
    if (newPlanDate && task.due_date) {
      const dueDateStr = task.due_date.slice(0, 10);
      if (dueDateStr < newPlanDate) {
        update.due_date = newPlanDate;
      }
    }

    await supabase.from("tasks").update(update).eq("id", task.id);
    onRefresh();
  };

  const handleToggleDone = async (task) => {
    const newStatus = task.status === "done" ? "todo" : "done";
    await supabase.from("tasks").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", task.id);
    onRefresh();
  };

  const todayDone = getTodayDoneTasks();

  return (
    <div className="h-full flex flex-col overflow-hidden bg-[#f5f5f5]">
      {/* 顶部筛选栏（分组筛选） */}
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-white border-b border-gray-100">
        <GroupFilterSelect
          groups={groups}
          value={filterGroupId}
          onChange={setFilterGroupId}
        />
        {filterGroupId !== "all" && (
          <span className="text-xs text-gray-400">
            共 {groupFilteredTasks.filter(t => t.status !== "done").length} 项待办
          </span>
        )}
      </div>

      {/* PC 端：横向4列 */}
      <div className="hidden md:flex flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-3 h-full p-4 min-w-max md:min-w-0 md:w-full">
          {columns.map((col) => {
            const colTasks = getColumnTasks(col);
            const allColTasks = col.id === "today" ? [...colTasks, ...todayDone] : colTasks;
            return (
              <KanbanColumn
                key={col.id}
                column={col}
                tasks={allColTasks}
                allTasks={tasks}
                members={members}
                groups={groups}
                onSelect={onSelect}
                onToggleDone={handleToggleDone}
                onDrop={handleDrop}
                draggingTask={draggingTask}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              />
            );
          })}
        </div>
      </div>

      {/* 移动端：上下排列 + Tab 切换 + 左滑操作 */}
      <div className="md:hidden flex-1 overflow-hidden">
        <MobileKanban
          columns={columns}
          getColumnTasks={getColumnTasks}
          todayDone={todayDone}
          allTasks={tasks}
          members={members}
          groups={groups}
          onSelect={onSelect}
          onToggleDone={handleToggleDone}
          onMoveTask={moveTaskToColumn}
          draggingTask={draggingTask}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        />
      </div>

      {/* 底部提示（仅PC） */}
      <div className="hidden md:flex flex-shrink-0 px-4 py-1.5 bg-white border-t border-gray-100 items-center gap-4">
        <span className="text-xs text-gray-400">
          拖拽卡片可自动更新计划日期 · 已完成任务次日自动隐藏
        </span>
        <span className="ml-auto text-xs text-gray-400">
          共 {groupFilteredTasks.filter((t) => t.status !== "done").length} 项待办
        </span>
      </div>
    </div>
  );
};

export default KanbanView;

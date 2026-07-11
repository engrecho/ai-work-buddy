import { useState, useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { TaskMention } from "./TaskMentionExtension";
import {
  Bold, Italic, UnderlineIcon, Strikethrough,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Heading2, Heading3, Quote, Undo, Redo, ImageIcon, LinkIcon, Unlink,
  CheckSquare, ListTodo, Search, X, CheckCircle2, Clock, Circle
} from "lucide-react";

// ─── 状态图标 ──────────────────────────────────────────────────────
const STATUS_ICON = {
  done: <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />,
  in_progress: <Clock className="h-3 w-3 text-blue-400 flex-shrink-0" />,
  todo: <Circle className="h-3 w-3 text-gray-300 flex-shrink-0" />,
};

// ─── 工具栏按钮 ────────────────────────────────────────────────────
const ToolbarBtn = ({ onClick, active, children, title }) => (
  <button
    type="button"
    title={title}
    onMouseDown={(e) => { e.preventDefault(); onClick(); }}
    className={`p-1.5 rounded transition-colors ${active ? "bg-gray-200 text-gray-900" : "text-gray-500 hover:bg-gray-100 hover:text-gray-900"}`}
  >
    {children}
  </button>
);

// ─── 任务搜索浮层（/ 唤起 或 工具栏唤起） ────────────────────────
function TaskSearchMenu({ tasks, groups, anchorRect, onSelect, onClose }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 点击浮层外关闭
  useEffect(() => {
    const handle = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  // 过滤（只显示顶级任务）
  const filtered = tasks.filter(
    (t) =>
      !t.parent_id &&
      (query === "" ||
        t.title?.toLowerCase().includes(query.toLowerCase()))
  );

  // 按分组分类
  const grouped = {};
  const noGroup = [];
  filtered.forEach((t) => {
    if (t.group_id) {
      if (!grouped[t.group_id]) grouped[t.group_id] = [];
      grouped[t.group_id].push(t);
    } else {
      noGroup.push(t);
    }
  });

  // 计算浮层位置
  const style = {};
  if (anchorRect) {
    style.position = "fixed";
    // 默认贴编辑器左上方显示，智能调整
    const menuH = 340;
    const menuW = 300;
    const spaceBelow = window.innerHeight - anchorRect.bottom;
    const spaceAbove = anchorRect.top;
    if (spaceBelow >= menuH || spaceBelow >= spaceAbove) {
      style.top = Math.min(anchorRect.bottom + 4, window.innerHeight - menuH - 8);
    } else {
      style.top = Math.max(anchorRect.top - menuH - 4, 8);
    }
    style.left = Math.min(anchorRect.left, window.innerWidth - menuW - 8);
    style.width = menuW;
  }

  const renderTask = (t) => (
    <button
      key={t.id}
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onSelect(t); }}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[#f0ffd0] rounded-lg transition-colors group"
    >
      {STATUS_ICON[t.status] || STATUS_ICON.todo}
      <span className={`flex-1 text-xs truncate ${t.status === "done" ? "line-through text-gray-400" : "text-gray-700"}`}>
        {t.title}
      </span>
    </button>
  );

  return (
    <div
      ref={menuRef}
      style={style}
      className="z-[70] bg-white rounded-xl shadow-xl border border-gray-100 flex flex-col overflow-hidden"
    >
      {/* 搜索框 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <Search className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
          placeholder="搜索任务…"
          className="flex-1 text-xs outline-none bg-transparent text-gray-700 placeholder-gray-400"
        />
        <button type="button" onMouseDown={(e) => { e.preventDefault(); onClose(); }} className="p-0.5 rounded hover:bg-gray-100 text-gray-400">
          <X className="h-3 w-3" />
        </button>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto max-h-72 py-1.5 px-1.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-6">没有找到任务</p>
        ) : (
          <>
            {/* 按分组展示 */}
            {Object.entries(grouped).map(([gid, gTasks]) => {
              const group = groups.find((g) => String(g.id) === String(gid));
              return (
                <div key={gid} className="mb-1">
                  <div className="flex items-center gap-1.5 px-2 py-1">
                    {group && (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: group.color || "#9ca3af" }}
                      />
                    )}
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide truncate">
                      {group?.name || "未知分组"}
                    </span>
                  </div>
                  {gTasks.map(renderTask)}
                </div>
              );
            })}
            {/* 无分组任务 */}
            {noGroup.length > 0 && (
              <div className="mb-1">
                {Object.keys(grouped).length > 0 && (
                  <div className="px-2 py-1">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">其他</span>
                  </div>
                )}
                {noGroup.map(renderTask)}
              </div>
            )}
          </>
        )}
      </div>

      <div className="px-3 py-1.5 border-t border-gray-50 flex items-center gap-1 text-[10px] text-gray-400">
        <span className="px-1 py-0.5 bg-gray-100 rounded text-[9px] font-mono">Enter</span>
        <span>选择</span>
        <span className="ml-2 px-1 py-0.5 bg-gray-100 rounded text-[9px] font-mono">Esc</span>
        <span>关闭</span>
      </div>
    </div>
  );
}

// ─── 主组件 ────────────────────────────────────────────────────────
const RichEditor = ({
  value,
  onChange,
  placeholder = "输入内容…按 / 插入任务",
  readOnly = false,
  fullHeight = false,
  tasks = [],       // 供任务选择用
  groups = [],      // 供分组显示用
  onTaskInserted,   // 回调：(taskId) => void，用于同步 relatedIds
  onTaskChipClick,  // 回调：(taskId) => void，点击任务 chip 时触发
}) => {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkText, setLinkText] = useState("");

  // 任务选择浮层状态
  const [taskMenuOpen, setTaskMenuOpen] = useState(false);
  const [taskMenuAnchor, setTaskMenuAnchor] = useState(null);
  const slashPosRef = useRef(null); // 记录 / 字符插入位置，选中后删除

  const lastValueRef = useRef(value);
  const editorContainerRef = useRef(null);

  // ── 打开任务浮层（计算锚点矩形） ──────────────────────────────
  const openTaskMenu = useCallback((editor) => {
    // 尝试从当前光标位置获取坐标
    let rect = null;
    try {
      const { from } = editor.state.selection;
      const coords = editor.view.coordsAtPos(from);
      rect = { top: coords.top, bottom: coords.bottom, left: coords.left, right: coords.right };
    } catch {
      // fallback：用编辑器容器位置
      if (editorContainerRef.current) {
        const r = editorContainerRef.current.getBoundingClientRect();
        rect = { top: r.top + 40, bottom: r.top + 60, left: r.left + 12, right: r.left + 200 };
      }
    }
    setTaskMenuAnchor(rect);
    setTaskMenuOpen(true);
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder }),
      Image.configure({ inline: false, allowBase64: true }),
      Link.configure({
        openOnClick: readOnly,
        autolink: true,
        defaultProtocol: "https",
        HTMLAttributes: { class: "text-blue-600 underline cursor-pointer hover:text-blue-800" },
      }),
      TaskList.configure({ HTMLAttributes: { class: "task-list" } }),
      TaskItem.configure({ nested: true, HTMLAttributes: { class: "task-item" } }),
      TaskMention,
    ],
    content: value || "",
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      if (readOnly) return;
      const html = editor.getHTML();
      lastValueRef.current = html;
      onChange && onChange(html);
    },
  });

  // 监听 / 键唤起任务菜单
  useEffect(() => {
    if (!editor || readOnly) return;
    const handleKeyDown = (e) => {
      if (e.key === "/") {
        // 记录 / 插入的位置（延迟一帧等 editor 更新）
        setTimeout(() => {
          slashPosRef.current = editor.state.selection.from;
          openTaskMenu(editor);
        }, 0);
      }
    };
    const editorDom = editor.view.dom;
    editorDom.addEventListener("keydown", handleKeyDown);
    return () => editorDom.removeEventListener("keydown", handleKeyDown);
  }, [editor, readOnly, openTaskMenu]);

  // 监听 chip 点击（事件委托）
  useEffect(() => {
    if (!editor || !onTaskChipClick) return;
    const handleClick = (e) => {
      const chip = e.target.closest('[data-task-mention]');
      if (chip) {
        const taskId = chip.getAttribute('data-task-mention');
        if (taskId) {
          e.preventDefault();
          e.stopPropagation();
          onTaskChipClick(taskId);
        }
      }
    };
    const editorDom = editor.view.dom;
    editorDom.addEventListener('click', handleClick);
    return () => editorDom.removeEventListener('click', handleClick);
  }, [editor, onTaskChipClick]);

  // 外部 value 变化时同步
  useEffect(() => {
    if (!editor) return;
    const incoming = value || "";
    if (incoming !== lastValueRef.current) {
      lastValueRef.current = incoming;
      editor.commands.setContent(incoming, false);
    }
  }, [editor, value]);

  // readOnly 变化同步
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  if (!editor) return null;

  // ── 选择任务后插入 chip ──────────────────────────────────────
  const handleSelectTask = (task) => {
    setTaskMenuOpen(false);
    const group = groups.find((g) => String(g.id) === String(task.group_id));

    // 删掉 / 字符（如果是从 / 唤起的）
    const slashPos = slashPosRef.current;
    slashPosRef.current = null;

    editor.chain().focus().run();

    setTimeout(() => {
      // 删除 / 字符
      if (slashPos != null) {
        const currentFrom = editor.state.selection.from;
        // /  字符在 slashPos - 1（因为 / 也会插入到文档）
        const deleteFrom = slashPos - 1;
        if (deleteFrom >= 0) {
          editor.commands.deleteRange({ from: deleteFrom, to: currentFrom });
        }
      }

      // 插入 taskMention 节点
      editor.chain().focus().insertContent({
        type: "taskMention",
        attrs: {
          id: task.id,
          title: task.title,
          status: task.status || "todo",
          groupName: group?.name || "",
          groupColor: group?.color || "#9ca3af",
        },
      }).run();

      // 插入空格
      editor.commands.insertContent(" ");

      // 通知父组件同步 relatedIds
      onTaskInserted?.(task.id);
    }, 0);
  };

  // ── 插入图片 ──────────────────────────────────────────────────
  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      editor.chain().focus().setImage({ src: ev.target.result, alt: file.name }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── 插入链接 ──────────────────────────────────────────────────
  const handleInsertLink = () => {
    if (!linkUrl.trim()) return;
    const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`;
    if (editor.state.selection.empty && linkText.trim()) {
      editor.chain().focus().insertContent(`<a href="${url}">${linkText || url}</a>`).run();
    } else {
      editor.chain().focus().setLink({ href: url }).run();
    }
    setShowLinkInput(false);
    setLinkUrl("");
    setLinkText("");
  };

  const handleOpenLinkInput = () => {
    const existingHref = editor.getAttributes("link").href || "";
    setLinkUrl(existingHref);
    setLinkText("");
    setShowLinkInput(true);
  };

  // ── readOnly 渲染 ──────────────────────────────────────────────
  if (readOnly) {
    const handleReadOnlyChipClick = (e) => {
      if (!onTaskChipClick) return;
      const chip = e.target.closest('[data-task-mention]');
      if (chip) {
        const taskId = chip.getAttribute('data-task-mention');
        if (taskId) {
          e.preventDefault();
          onTaskChipClick(taskId);
        }
      }
    };
    return (
      <div onClick={handleReadOnlyChipClick}>
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none px-3 py-2 min-h-[60px] [&_.ProseMirror]:outline-none [&_.ProseMirror_a]:text-blue-600 [&_.ProseMirror_a]:underline [&_.ProseMirror_a]:cursor-pointer [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:h-auto [&_.ProseMirror_img]:block [&_.ProseMirror_img]:rounded-lg [&_.ProseMirror_img]:my-2 [&_.task-list]:list-none [&_.task-list]:pl-0 [&_.task-item]:flex [&_.task-item]:items-start [&_.task-item]:gap-2 [&_.task-item]:my-1 [&_.task-item_>_label]:flex [&_.task-item_>_label]:items-center [&_.task-item_>_label]:gap-2 [&_.task-item_>_label_>_input[type=checkbox]]:w-4 [&_.task-item_>_label_>_input[type=checkbox]]:h-4 [&_.task-item_>_label_>_input[type=checkbox]]:rounded [&_.task-item_>_label_>_input[type=checkbox]]:accent-[#5a7a00] [&_.task-item[data-checked=true]_>_label_>_div]:line-through [&_.task-item[data-checked=true]_>_label_>_div]:text-gray-400"
        />
      </div>
    );
  }

  return (
    <div
      ref={editorContainerRef}
      className={`border border-gray-100 rounded-xl overflow-visible focus-within:border-[#bbea3b] focus-within:ring-2 focus-within:ring-[#bbea3b]/30 focus-within:ring-offset-0 transition-all relative bg-white${fullHeight ? " flex flex-col h-full" : ""}`}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-100 bg-white rounded-t-xl flex-shrink-0">
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="加粗">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="斜体">
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="下划线">
          <UnderlineIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="删除线">
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="标题2">
          <Heading2 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="标题3">
          <Heading3 className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="无序列表">
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="有序列表">
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          active={editor.isActive("taskList")}
          title="任务清单（可勾选）"
        >
          <CheckSquare className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")} title="引用">
          <Quote className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="左对齐">
          <AlignLeft className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="居中">
          <AlignCenter className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="右对齐">
          <AlignRight className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarBtn onClick={handleOpenLinkInput} active={editor.isActive("link")} title="插入链接">
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
        {editor.isActive("link") && (
          <ToolbarBtn onClick={() => editor.chain().focus().unsetLink().run()} active={false} title="移除链接">
            <Unlink className="h-3.5 w-3.5" />
          </ToolbarBtn>
        )}
        <label title="插入图片" className="p-1.5 rounded transition-colors text-gray-500 hover:bg-gray-100 hover:text-gray-900 cursor-pointer">
          <ImageIcon className="h-3.5 w-3.5" />
          <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
        </label>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        {/* 添加任务按钮（工具栏入口） */}
        <ToolbarBtn
          onClick={() => openTaskMenu(editor)}
          active={taskMenuOpen}
          title="插入任务引用（或按 / 唤起）"
        >
          <ListTodo className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <div className="w-px h-4 bg-gray-200 mx-1" />
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} active={false} title="撤销">
          <Undo className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} active={false} title="重做">
          <Redo className="h-3.5 w-3.5" />
        </ToolbarBtn>
      </div>

      {/* 链接输入浮层 */}
      {showLinkInput && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-blue-50">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleInsertLink(); }
              if (e.key === "Escape") setShowLinkInput(false);
            }}
            placeholder="输入链接地址，如 https://example.com"
            className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400 bg-white"
          />
          {editor.state.selection.empty && (
            <input
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="链接显示文字（可选）"
              className="w-36 text-xs border border-gray-200 rounded px-2 py-1 outline-none focus:border-blue-400 bg-white"
            />
          )}
          <button type="button" onClick={handleInsertLink} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">确认</button>
          <button type="button" onClick={() => setShowLinkInput(false)} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700">取消</button>
        </div>
      )}

      {/* Editor */}
      <EditorContent
        editor={editor}
        className={`prose prose-sm max-w-none px-3 py-2 focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400 [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_img]:max-w-full [&_.ProseMirror_img]:h-auto [&_.ProseMirror_img]:block [&_.ProseMirror_img]:rounded-lg [&_.ProseMirror_img]:my-2 [&_.ProseMirror_a]:text-blue-600 [&_.ProseMirror_a]:underline [&_.task-list]:list-none [&_.task-list]:pl-0 [&_.task-list]:my-1 [&_.task-item]:flex [&_.task-item]:items-start [&_.task-item]:gap-2 [&_.task-item]:my-0.5 [&_.task-item_>_label]:flex [&_.task-item_>_label]:items-start [&_.task-item_>_label]:gap-2 [&_.task-item_>_label]:cursor-pointer [&_.task-item_>_label]:w-full [&_.task-item_>_label_>_input[type=checkbox]]:mt-0.5 [&_.task-item_>_label_>_input[type=checkbox]]:w-4 [&_.task-item_>_label_>_input[type=checkbox]]:h-4 [&_.task-item_>_label_>_input[type=checkbox]]:flex-shrink-0 [&_.task-item_>_label_>_input[type=checkbox]]:rounded [&_.task-item_>_label_>_input[type=checkbox]]:cursor-pointer [&_.task-item_>_label_>_input[type=checkbox]]:accent-[#5a7a00] [&_.task-item[data-checked=true]_>_label_>_div]:line-through [&_.task-item[data-checked=true]_>_label_>_div]:text-gray-400 [&_.task-item_>_label_>_div]:flex-1 [&_.task-item_>_label_>_div]:min-w-0${fullHeight ? " flex-1 overflow-y-auto [&_.ProseMirror]:h-full [&_.ProseMirror]:min-h-full" : " min-h-[200px] flex-1 overflow-y-auto [&_.ProseMirror]:min-h-[200px]"}`}
      />

      {/* 任务搜索浮层 */}
      {taskMenuOpen && (
        <TaskSearchMenu
          tasks={tasks}
          groups={groups}
          anchorRect={taskMenuAnchor}
          onSelect={handleSelectTask}
          onClose={() => { setTaskMenuOpen(false); slashPosRef.current = null; }}
        />
      )}
    </div>
  );
};

export default RichEditor;

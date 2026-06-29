import { useState, useEffect } from "react";
import { Plus, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { genId } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

const QuickNotesPage = () => {
  const [notes, setNotes] = useState([]);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState("");

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    const { data } = await supabase
      .from("quick_notes")
      .select("*")
      .order("created_at", { ascending: false });
    setNotes(data || []);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!content.trim()) return;
    
    await supabase.from("quick_notes").insert([{ id: genId(), content, tags }]);
    setContent("");
    setTags("");
    fetchNotes();
  };

  const handleDelete = async (id) => {
    await supabase.from("quick_notes").delete().eq("id", id);
    fetchNotes();
  };

  return (
    <div className="h-full overflow-y-auto"><div className="max-w-5xl mx-auto p-4 md:p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900">随记</h2>
        <p className="text-sm text-gray-500 mt-1">快速记录碎片化的灵感和想法</p>
      </div>

      {/* Quick Input */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 mb-6">
        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="写下你的想法..."
            rows={4}
            className="resize-none"
            required
          />
          <div className="flex gap-3">
            <Input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="标签（用逗号分隔）"
              className="flex-1"
            />
            <Button type="submit" className="border-0" style={{ backgroundColor: "#bbea3b", color: "#2d4a00" }}>
              <Zap className="h-4 w-4 mr-2" />
              快速记录
            </Button>
          </div>
        </form>
      </div>

      {/* Notes Masonry */}
      <div className="columns-1 md:columns-2 lg:columns-3 gap-4 space-y-4">
        {notes.map((note) => {
          const tagList = note.tags ? note.tags.split(",").filter(Boolean) : [];
          
          return (
            <div key={note.id} className="break-inside-avoid rounded-xl p-4 hover:shadow-md transition-all" style={{ background: "linear-gradient(135deg, #f0fcd0 0%, #e8fca0 100%)", border: "1px solid #d4f56a" }}>
              <p className="text-sm text-gray-700 whitespace-pre-wrap mb-3">{note.content}</p>
              {tagList.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {tagList.map((tag, i) => (
                    <span key={i} className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: "#bbea3b44", color: "#4a6800" }}>
                      {tag.trim()}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>{new Date(note.created_at).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                <button
                  onClick={() => handleDelete(note.id)}
                  className="text-red-400 hover:text-red-600 transition-colors"
                >
                  删除
                </button>
              </div>
            </div>
          );
        })}
        {notes.length === 0 && (
          <div className="col-span-full bg-white rounded-xl border border-gray-100 p-12 text-center">
            <Zap className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-400">暂无随记，随时记录灵感</p>
          </div>
        )}
      </div>
    </div></div>
  );
};

export default QuickNotesPage;

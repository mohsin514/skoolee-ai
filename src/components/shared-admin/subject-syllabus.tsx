"use client";

import { useCallback, useEffect, useState } from "react";
import { BookMarked, ChevronDown, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmptyInline } from "@/components/shared-admin";

type TopicStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";

type SyllabusTopic = {
  id: string;
  title: string;
  description: string | null;
  order: number;
  status: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const NEXT_STATUS: Record<SyllabusTopic["status"], SyllabusTopic["status"]> = {
  NOT_STARTED: "IN_PROGRESS",
  IN_PROGRESS: "COMPLETED",
  COMPLETED: "NOT_STARTED",
};

const STATUS_LABEL: Record<SyllabusTopic["status"], string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
};

export function SubjectSyllabus({ subjectId }: { subjectId: string }) {
  const [topicTitle, setTopicTitle] = useState("");
  const [syllabusTopics, setTopics] = useState<SyllabusTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const fetchTopics = useCallback(async () => {
    if (!subjectId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/syllabus`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load syllabus");
      setTopics(json.data || []);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  const addTopic = async () => {
    if (!topicTitle.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/syllabus`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: topicTitle.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to add topic");
      setTopicTitle("");
      setTopics((prev) => [...prev, json.data]);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (topic: SyllabusTopic) => {
    const nextStatus = NEXT_STATUS[topic.status];
    setBusy(true);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/syllabus`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: topic.id, status: nextStatus }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to update topic");
      setTopics((prev) => prev.map((t) => (t.id === topic.id ? json.data : t)));
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteTopic = async (id: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/subjects/${subjectId}/syllabus?id=${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete topic");
      setTopics((prev) => prev.filter((t) => t.id !== id));
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const moveTopic = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= syllabusTopics.length) return;
    const reordered = [...syllabusTopics];
    const [moving] = reordered.splice(index, 1);
    reordered.splice(target, 0, moving);
    setTopics(reordered);
    setBusy(true);
    try {
      const first = reordered[index];
      const second = reordered[target];
      await Promise.all([
        fetch(`/api/subjects/${subjectId}/syllabus`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: first.id, order: index }),
        }),
        fetch(`/api/subjects/${subjectId}/syllabus`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: second.id, order: target }),
        }),
      ]);
    } catch {
      toast.error("Could not reorder topics");
      fetchTopics();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-[#cfc2d6]/10 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BookMarked className="h-4 w-4 text-[#8127cf]" />
          <p className="text-[10px] font-black uppercase tracking-wider text-ink-subtle">
            Syllabus · {syllabusTopics.length} topic{syllabusTopics.length !== 1 ? "s" : ""}
          </p>
        </div>
        <ChevronDown
          className={cn("h-4 w-4 cursor-pointer text-ink-subtle transition-transform", open && "rotate-180")}
          onClick={() => setOpen(!open)}
        />
      </div>

      {open ? (
        <div className="mt-4 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-xs font-bold text-ink-subtle">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading syllabus…
            </div>
          ) : (
            <>
              {syllabusTopics.length ? (
                <div className="space-y-1.5">
                  {syllabusTopics.map((topic, index) => (
                    <div key={topic.id} className="flex items-center gap-2 rounded-xl bg-[#fbf0fe]/60 px-3 py-2">
                      <button
                        type="button"
                        onClick={() => moveTopic(index, index > 0 ? -1 : 1)}
                        disabled={busy}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-white hover:text-[#8127cf] disabled:opacity-30 cursor-pointer"
                        title="Move up"
                      >
                        <ChevronDown className="h-3 w-3 rotate-180" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-[#1f1a23]">{topic.title}</p>
                        {topic.description ? (
                          <p className="truncate text-[9px] font-bold text-ink-subtle">{topic.description}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleStatus(topic)}
                        disabled={busy}
                        className={cn(
                          "shrink-0 cursor-pointer rounded-full px-2 py-1 text-[7px] font-black uppercase tracking-wider transition-all hover:opacity-80 disabled:opacity-50",
                          topic.status === "COMPLETED"
                            ? "bg-emerald-50 text-emerald-600"
                            : topic.status === "IN_PROGRESS"
                              ? "bg-amber-50 text-amber-600"
                              : "bg-[#f3f4f9] text-[#64748b]"
                        )}
                        title="Cycle status: Not started → In progress → Completed"
                      >
                        {STATUS_LABEL[topic.status]}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteTopic(topic.id)}
                        disabled={busy}
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ink-subtle transition-colors hover:bg-rose-50 hover:text-rose-500 disabled:opacity-30 cursor-pointer"
                        title="Delete topic"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : <EmptyInline text="No syllabus topics yet. Add the first topic below." />}

              <div className="flex gap-2 pt-1">
                <input
                  type="text"
                  value={topicTitle}
                  onChange={(e) => setTopicTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addTopic(); }}
                  placeholder="Add a syllabus topic (e.g. Chapter 1: Algebra)"
                  className="h-10 flex-1 rounded-xl border border-[#8127cf]/20 bg-white px-3 text-xs font-bold text-[#1f1a23] outline-none placeholder:text-ink-subtle"
                />
                <button
                  type="button"
                  onClick={addTopic}
                  disabled={busy || !topicTitle.trim()}
                  className="flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#8127cf] px-4 text-[9px] font-black uppercase tracking-wider text-white transition-all duration-200 hover:bg-[#6a1fad] active:scale-95 disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
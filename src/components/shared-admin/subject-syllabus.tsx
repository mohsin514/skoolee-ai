"use client";

import { Button as SystemButton } from "@/components/ui/button";
import { useCallback, useEffect, useState, useRef } from "react";
import { BookMarked, ChevronDown, Plus, Trash2 } from "lucide-react";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { checkedJson, readRequest, requestFailure, type RequestFailure } from "@/lib/http/request-state";
import { ErrorState } from "@/components/ui/error-state";
import { useUiText } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { EmptyInline } from "@/components/shared-admin";
import { Input as SystemInput } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { SkeletonBar, SkeletonRegion } from "@/components/ui/skeleton";
import { ConfirmAction } from "@/components/ui/confirm-action";

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
  const ui = useUiText();
  const [topicTitle, setTopicTitle] = useState("");
  const [syllabusTopics, setTopics] = useState<SyllabusTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SyllabusTopic | null>(null);
  const [open, setOpen] = useState(false);
  // R4: a syllabus that did not load is an inline error with Retry, not a toast.
  const [loadFailed, setLoadFailed] = useState<RequestFailure | null>(null);
  const sequence = useRef(0);

  const fetchTopics = useCallback(async () => {
    const version = ++sequence.current;
    setLoading(true); setLoadFailed(null);
    try {
      const json = await checkedJson(await readRequest(`/api/subjects/${subjectId}/syllabus`));
      if (version !== sequence.current) return;
      setTopics(json.data || []);
    } catch (failure) { if (version === sequence.current) { setTopics([]); setLoadFailed(requestFailure(failure)); } }
    finally { if (version === sequence.current) setLoading(false); }
  }, [subjectId]);

  useEffect(() => {
    void fetchTopics();
    return () => { sequence.current++; };
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
      if (!res.ok) throw new Error(json.error || "");
      setTopicTitle("");
      setTopics((prev) => [...prev, json.data]);
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not add the topic. Please try again.")));
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
      if (!res.ok) throw new Error(json.error || "");
      setTopics((prev) => prev.map((t) => (t.id === topic.id ? json.data : t)));
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not update the topic. Please try again.")));
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
      if (!res.ok) throw new Error(json.error || "");
      setTopics((prev) => prev.filter((t) => t.id !== id));
      toast.success(ui("Topic deleted"));
    } catch (error) {
      toast.error(friendlyErrorMessage(error, ui("Could not delete the topic. Please try again.")));
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
      toast.error(ui("Could not reorder the topics. Please try again."));
      fetchTopics();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sk-panel mt-4 p-4">
      {/* A real disclosure button (keyboard and screen reader), not a clickable icon. */}
      <SystemButton
        variant="ghost"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="w-full justify-between gap-3 px-2 text-start"
      >
        <span className="flex items-center gap-2">
          <BookMarked aria-hidden="true" className="h-4 w-4 text-primary" />
          <span className="text-2xs font-semibold ltr:uppercase ltr:tracking-wider text-ink-subtle">
            {ui(syllabusTopics.length === 1 ? "Syllabus · {0} topic" : "Syllabus · {0} topics", [syllabusTopics.length])}
          </span>
        </span>
        <ChevronDown aria-hidden="true" className={cn("h-4 w-4 text-ink-subtle transition-transform motion-reduce:transition-none", open && "rotate-180")} />
      </SystemButton>

      {open ? (
        <div className="mt-4 space-y-3">
          {loadFailed && !loading ? (
            <ErrorState error={loadFailed} className="py-6" title={ui("The syllabus did not load")} onRetry={fetchTopics} retryLabel={ui("Try again")} />
          ) : loading ? (
            <SkeletonRegion className="space-y-1.5" label={ui("Loading syllabus")}>
              <SkeletonBar className="h-9 w-full rounded-xl" />
              <SkeletonBar className="h-9 w-4/5 rounded-xl" />
            </SkeletonRegion>
          ) : (
            <>
              {syllabusTopics.length ? (
                <div className="space-y-1.5">
                  {syllabusTopics.map((topic, index) => (
                    <div key={topic.id} className="flex items-center gap-2 rounded-xl bg-brand-50/60 px-3 py-2">
                      <IconButton
                        label={index > 0 ? ui("Move up") : ui("Move down")}
                        variant="ghost"
                        onClick={() => moveTopic(index, index > 0 ? -1 : 1)}
                        disabled={busy}
                      >
                        <ChevronDown aria-hidden="true" className={cn("h-3 w-3", index > 0 && "rotate-180")} />
                      </IconButton>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-bold text-ink-strong"><bdi>{topic.title}</bdi></p>
                        {topic.description ? (
                          <p className="truncate text-2xs font-normal text-ink-subtle"><bdi>{topic.description}</bdi></p>
                        ) : null}
                      </div>
                      <Tooltip content={ui("Select to move the status on: not started, then in progress, then completed.")}>
                        <SystemButton variant="ghost"
                          type="button"
                          size="sm"
                          onClick={() => toggleStatus(topic)}
                          disabled={busy}
                          className="h-auto shrink-0 px-1 py-1 text-ink-muted"
                        >
                          <Badge
                            size="sm"
                            dot
                            variant={topic.status === "COMPLETED" ? "success" : topic.status === "IN_PROGRESS" ? "warning" : "neutral"}
                          >
                            {ui(STATUS_LABEL[topic.status] ?? topic.status)}
                          </Badge>
                        </SystemButton>
                      </Tooltip>
                      <IconButton
                        label={ui("Delete topic")}
                        variant="ghost"
                        onClick={() => setPendingDelete(topic)}
                        disabled={busy}
                      >
                        <Trash2 aria-hidden="true" className="h-3 w-3" />
                      </IconButton>
                    </div>
                  ))}
                </div>
              ) : <EmptyInline text={ui("No syllabus topics yet. Add the first topic below.")} />}

              <ConfirmAction
                open={pendingDelete !== null}
                tone="danger"
                title={ui("Delete this topic?")}
                description={pendingDelete ? ui("\"{0}\" will be removed from this subject's syllabus.", [pendingDelete.title]) : ""}
                confirmLabel={ui("Delete topic")}
                busy={busy}
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                  const target = pendingDelete;
                  setPendingDelete(null);
                  if (target) void deleteTopic(target.id);
                }}
              />

              <div className="flex gap-2 pt-1">
                <SystemInput
                  type="text"
                  value={topicTitle}
                  onChange={(e) => setTopicTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addTopic(); }}
                  placeholder={ui("Add a syllabus topic (e.g. Chapter 1: Algebra)")}
                  className="flex-1 px-3"
                />
                <SystemButton variant="default"
                  type="button"
                  onClick={addTopic}
                  disabled={busy || !topicTitle.trim()}
                  className="flex shrink-0 items-center gap-1.5 px-4 justify-start"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {ui("Add")}
                </SystemButton>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

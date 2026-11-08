"use client";

import { useEffect, useState } from "react";
import { Scale } from "lucide-react";
import { DeskRowIcon, deskRow } from "@/components/ui/desk";
import { useLocale } from "@/components/locale/LocaleProvider";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ExamResults } from "../exam-results";
import { studioResultsCopy } from "@/lib/school-ai/exam-studio-copy-results";
import { studioHomeCopy } from "@/lib/school-ai/exam-studio-copy-home";

type Appeal = { id: string; assignmentId: string; attemptId: string; title: string; studentName: string; rollNo: string; status: string };

export function DepartmentAppeals() {
  const { language } = useLocale();
  const t = studioResultsCopy(language);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [open, setOpen] = useState<Appeal | null>(null);
  const [revision, setRevision] = useState(0);
  // SKAI-1572: a failed load is its own state, never a silently empty queue; loaded rows stay on a refresh failure.
  const [failed, setFailed] = useState(false);
  // SKAI-1725: appeals after the first 50 load page by page; a failed page keeps the queue and retries the same cursor.
  const [nextCursor, setNextCursor] = useState<string | null>(null), [more, setMore] = useState<"idle" | "loading" | "failed">("idle");
  const loadMore = (cursor: string) => {
    setMore("loading");
    void fetch(`/api/school-ai/department-appeals?cursor=${encodeURIComponent(cursor)}`, { cache: "no-store" })
      .then(async response => { const data = response.ok ? await response.json().catch(() => null) : null; if (!Array.isArray(data?.appeals)) throw new Error("appeals did not load"); return data as { appeals: Appeal[]; nextCursor: string | null }; })
      .then(page => { setAppeals(current => [...current, ...page.appeals]); setNextCursor(page.nextCursor); setMore("idle"); })
      .catch(() => setMore("failed"));
  };
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/school-ai/department-appeals", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = response.ok ? await response.json().catch(() => null) : null;
        if (!Array.isArray(data?.appeals)) throw new Error("appeals did not load");
        return data as { appeals: Appeal[]; nextCursor?: string | null };
      })
      .then(page => { if (!controller.signal.aborted) { setAppeals(page.appeals); setNextCursor(page.nextCursor ?? null); setMore("idle"); setFailed(false); } })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [revision]);
  if (!appeals.length && !failed) return null;
  return <section className="sk-panel space-y-3 p-4 sm:p-5" data-department-appeals aria-labelledby="department-appeals-title">
    <h2 id="department-appeals-title" className="text-lg font-bold">{t.departmentTitle}</h2>
    <p className="text-sm text-ink-muted">{t.departmentIntro}</p>
    {failed ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm" data-department-appeals-failed><span>{t.departmentLoadFailed}</span><Button type="button" size="sm" variant="outline" onClick={() => setRevision(value => value + 1)}>{t.departmentRetry}</Button></div> : null}
    <ul className="space-y-2">{appeals.map(appeal => <li key={appeal.id} data-tone="warning" className={`${deskRow} flex flex-wrap items-center justify-between gap-3`}>
      <DeskRowIcon icon={Scale} />
      <div className="min-w-0 flex-1"><p className="font-semibold"><bdi>{appeal.title}</bdi></p><p className="text-sm text-ink-muted"><bdi>{appeal.studentName}</bdi> · <bdi>{appeal.rollNo}</bdi></p></div>
      <Button type="button" size="sm" onClick={() => setOpen(appeal)}>{studioHomeCopy(language).open}</Button>
    </li>)}</ul>
    {nextCursor ? <div className="flex flex-wrap items-center gap-2" aria-live="polite" data-department-appeals-more>{more === "failed" ? <p role="alert" className="text-sm text-status-danger-text">{t.departmentMoreFailed}</p> : null}<Button type="button" size="sm" variant="outline" disabled={more === "loading"} aria-busy={more === "loading"} onClick={() => loadMore(nextCursor)}>{more === "loading" ? t.departmentLoadingMore : more === "failed" ? t.departmentRetry : t.departmentLoadMore}</Button></div> : null}
    {open ? <Modal title={t.departmentTitle} icon={Scale} tone="amber" subtitle={`${open.studentName} · ${open.rollNo}`} size="lg" onClose={() => { setOpen(null); setRevision(value => value + 1); }}>
      <ExamResults id={open.assignmentId} attemptId={open.attemptId} locale={language} departmentReview />
    </Modal> : null}
  </section>;
}

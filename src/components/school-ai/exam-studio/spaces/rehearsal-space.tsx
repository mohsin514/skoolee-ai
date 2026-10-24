"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { TaskFeedback } from "@/components/ui/task-patterns";
import { studioSpacesCopy } from "@/lib/school-ai/exam-studio-copy-spaces";
import { ExamReleasePanel, type Readiness } from "../../exam-release-panel";
import type { StudioSpaceProps } from "../studio-space-registry";

/**
 * SKO-408 Rehearsal space: the rehearsal state of every paper's current version in one view, and the
 * rehearsal panel (key-free preview, automated checks, reported defects, blockers) for the one opened.
 */
type Row = { id: string; title: string; version: number; state: "NONE" | "CLEAN" | "BLOCKING" };

export default function RehearsalSpace({ language, scope, records, capabilities, reload }: StudioSpaceProps) {
  const t = studioSpacesCopy(language);
  const papers = useMemo(() => records.filter(record => record.kind === "PAPER" && (!scope.subjectId || record.data.subjectId === scope.subjectId)).slice(0, 20), [records, scope.subjectId]);
  const [rows, setRows] = useState<Row[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    const next = await Promise.all(papers.map(async paper => {
      const response = await fetch(`/api/school-ai/workspace/${encodeURIComponent(paper.id)}/rehearsal`, { cache: "no-store" }).catch(() => null);
      const readiness = response?.ok ? ((await response.json()) as { readiness: Readiness }).readiness : null;
      const state: Row["state"] = !readiness?.rehearsal ? "NONE" : readiness.rehearsal.results.some(result => result.severity === "BLOCKING") ? "BLOCKING" : "CLEAN";
      return { id: paper.id, title: paper.title, version: paper.version, state };
    }));
    setRows(next);
  }, [papers]);
  useEffect(() => { void load(); }, [load]);
  const onChanged = useCallback(async () => { reload(); }, [reload]);
  // Stable, so the panel's own load effect never restarts because this table re-rendered.
  const onLoaded = useCallback(() => { void load(); }, [load]);
  if (!papers.length) return <TaskFeedback kind="empty" title={t.noPapers}><p>{t.rehearsalIntro}</p></TaskFeedback>;
  const paper = papers.find(entry => entry.id === open);
  const label = (state: Row["state"]) => state === "CLEAN" ? t.rehearsalClean : state === "BLOCKING" ? t.rehearsalBlocking : t.rehearsalNone;
  return <div className="space-y-4" data-rehearsal-space>
    <p className="text-sm text-ink-subtle">{t.rehearsalIntro}</p>
    <div className="sk-panel overflow-x-auto p-2"><table className="w-full min-w-[28rem] text-sm">
      <thead><tr className="text-xs text-ink-subtle"><th className="p-2 text-start">{t.paperCol}</th><th className="p-2 text-start">{t.versionCol}</th><th className="p-2 text-start">{t.stateCol}</th><th className="p-2" /></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} className="border-t" data-rehearsal-row={row.state}>
        <td className="p-2"><bdi dir="auto">{row.title}</bdi></td><td className="p-2 tabular-nums">v{new Intl.NumberFormat(language).format(row.version)}</td>
        <td className={`p-2 ${row.state === "BLOCKING" ? "font-semibold text-status-error-text" : row.state === "NONE" ? "text-ink-subtle" : ""}`}>{label(row.state)}</td>
        <td className="p-2 text-end"><Button size="sm" variant={open === row.id ? "secondary" : "outline"} onClick={() => setOpen(row.id)}>{t.openPaper}</Button></td>
      </tr>)}</tbody>
    </table></div>
    {paper && <ExamReleasePanel key={`${paper.id}:${paper.version}`} recordId={paper.id} locale={language} canApprove={capabilities.canApprove} disabled={!capabilities.canCreate} onChanged={onChanged} onLoaded={onLoaded} />}
  </div>;
}

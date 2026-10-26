"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  return <div className="min-w-0 space-y-4" data-rehearsal-space>
    <p className="text-sm text-ink-subtle">{t.rehearsalIntro}</p>
    <Table className="min-w-[36rem]" containerClassName="max-w-full" aria-label={t.rehearsalIntro}>
      <TableHeader><TableRow><TableHead>{t.paperCol}</TableHead><TableHead className="w-24 text-end">{t.versionCol}</TableHead><TableHead>{t.stateCol}</TableHead><TableHead className="text-end"><span className="sr-only">{t.openPaper}</span></TableHead></TableRow></TableHeader>
      <TableBody>{rows.map(row => <TableRow key={row.id} data-rehearsal-row={row.state} data-state={open === row.id ? "selected" : undefined}>
        <TableHead scope="row" className="min-w-48 max-w-md py-4 text-sm text-foreground"><bdi dir="auto">{row.title}</bdi></TableHead><TableCell className="text-end tabular-nums"><bdi>v{new Intl.NumberFormat(language).format(row.version)}</bdi></TableCell>
        <TableCell><Badge variant={row.state === "BLOCKING" ? "danger" : row.state === "CLEAN" ? "success" : "neutral"} className="leading-relaxed">{label(row.state)}</Badge></TableCell>
        <TableCell className="text-end"><Button size="sm" variant={open === row.id ? "secondary" : "outline"} onClick={() => setOpen(row.id)}>{t.openPaper}</Button></TableCell>
      </TableRow>)}</TableBody>
    </Table>
    {paper && <ExamReleasePanel key={`${paper.id}:${paper.version}`} recordId={paper.id} locale={language} canApprove={capabilities.canApprove} disabled={!capabilities.canCreate} onChanged={onChanged} onLoaded={onLoaded} />}
  </div>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { BookOpenCheck, FileStack, ListTree, MoveRight } from "lucide-react";
import { DeskRowIcon, RelativeTime, deskRow } from "@/components/ui/desk";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { useLocale } from "@/components/locale/LocaleProvider";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioHomeCopy } from "@/lib/school-ai/exam-studio-copy-home";
import type { DepartmentQueue as Queue } from "@/lib/school-ai/department-approvals-service";
import { Isolated } from "./space-state";

/**
 * SKO-500: the head of department's queue on the teacher home. Renders nothing for anyone who heads
 * no department. Approving runs the shared approval path as the head (and approves the cited file).
 */
export function DepartmentQueue() {
  const { language } = useLocale();
  const t = studioHomeCopy(language);
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium" }).format(new Date(value));
  const [queue, setQueue] = useState<Queue | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [preview, setPreview] = useState<{ id: string; title: string; version: number; text: string | null; outcomes: Array<{ id: string; title: string; unit?: string }> } | null>(null);

  const openPreview = async (id: string) => {
    setBusy(id); setNotice(null);
    try {
      const response = await fetch(`/api/school-ai/department-approvals?recordId=${encodeURIComponent(id)}`, { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setPreview(payload.preview);
      else setNotice({ tone: "danger", text: typeof payload.error === "string" ? payload.error : t.failed });
    } catch { setNotice({ tone: "danger", text: t.failed }); } finally { setBusy(null); }
  };

  const load = useCallback(async () => {
    const response = await fetch("/api/school-ai/department-approvals", { cache: "no-store" }).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) : null;
    setQueue(payload?.queue ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const approve = async (id: string, version: number) => {
    setBusy(id); setNotice(null);
    const response = await fetch("/api/school-ai/department-approvals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ recordId: id, version }) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    setBusy(null);
    setNotice(response?.ok ? { tone: "success", text: t.approved } : { tone: "danger", text: typeof payload.error === "string" ? payload.error : t.failed });
    if (response?.ok) setPreview(null);
    await load();
  };

  if (!queue?.heads) return null;
  return <section id="department-queue" className="sk-panel scroll-mt-24 space-y-3 p-4 sm:p-5" aria-labelledby="department-queue-title" data-department-queue>
    <header className="space-y-1">
      <h2 id="department-queue-title" className="flex items-center gap-2 text-lg font-bold"><BookOpenCheck aria-hidden="true" className="size-5 text-primary" />{t.queueTitle}</h2>
      <p className="text-sm text-ink-muted">{t.queueIntro}</p>
    </header>
    {notice ? <Alert tone={notice.tone} compact live="polite">{notice.text}</Alert> : null}
    {!queue.approvals.length && !queue.jumps.length ? <EmptyState size="sm" icon={BookOpenCheck} title={t.queueEmpty} /> : null}
    {queue.approvals.length ? <ul className="space-y-2">
      {queue.approvals.map(item => <li key={item.id} data-tone="info" className={`${deskRow} flex flex-wrap items-center justify-between gap-3`}>
        <DeskRowIcon icon={item.kind === "CURRICULUM" ? ListTree : FileStack} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-semibold"><Isolated>{item.title}</Isolated></p>
          <p className="text-xs text-ink-muted">{item.subjectName && item.className ? <><Isolated>{item.subjectName}</Isolated> · <Isolated>{item.className}</Isolated> · </> : null}{item.kind === "CURRICULUM" ? fillStudioCopy(t.syllabusMeta, [number(item.outcomeCount ?? 0), item.authorName]) : fillStudioCopy(t.sourceMeta, [item.authorName])} · <RelativeTime iso={item.submittedAt} full={date(item.submittedAt)} /></p>
        </div>
        <Button type="button" size="sm" loading={busy === item.id} disabled={Boolean(busy)} onClick={() => void openPreview(item.id)}>{t.open}</Button>
      </li>)}
    </ul> : null}
    {queue.jumps.length ? <div className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-bold"><MoveRight aria-hidden="true" className="size-4 text-warning rtl:rotate-180" />{t.jumpsTitle}</h3>
      <ul className="space-y-1.5">
        {queue.jumps.map(jump => <li key={jump.id} data-tone={jump.backdated ? "warning" : "neutral"} className={`${deskRow} text-sm`}>
          <p>{fillStudioCopy(t.jumpRow, [jump.teacherName, number(jump.written), jump.className ?? "", number(jump.unitsCrossed)])}</p>
          <p className="text-xs text-ink-subtle"><bdi>{date(jump.at)}</bdi>{jump.backdated ? <> · {t.jumpBackdated}</> : null}</p>
        </li>)}
      </ul>
    </div> : null}
    {preview ? <Modal title={preview.title} icon={BookOpenCheck} tone="violet" size="lg" onClose={() => setPreview(null)}>
      <div className="space-y-4" data-department-preview>
        {notice ? <Alert tone={notice.tone} compact>{notice.text}</Alert> : null}
        {preview.text !== null ? <p dir="auto" className="whitespace-pre-wrap break-words text-sm">{preview.text}</p> : <ol className="list-decimal space-y-3 ps-5">{preview.outcomes.map(outcome => <li key={outcome.id}><p className="text-xs text-ink-muted"><Isolated>{outcome.unit ?? ""}</Isolated></p><Isolated>{outcome.title}</Isolated></li>)}</ol>}
        <Button type="button" loading={busy === preview.id} disabled={Boolean(busy)} onClick={() => void approve(preview.id, preview.version)}>{t.approve}</Button>
      </div>
    </Modal> : null}
  </section>;
}

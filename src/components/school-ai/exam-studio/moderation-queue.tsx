"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileCheck2 } from "lucide-react";
import { DeskPill, DeskRowIcon, deskRow, urgencyFirst, type DeskTone } from "@/components/ui/desk";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { failureForStatus, RequestFailure, requestFailure } from "@/lib/http/request-state";
import { useLocale } from "@/components/locale/LocaleProvider";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSlotsCopy } from "@/lib/school-ai/exam-studio-copy-slots";
import { studioHomeCopy } from "@/lib/school-ai/exam-studio-copy-home";
import type { SlotView } from "@/lib/school-ai/paper-slot-service";
import { moderatorQueue, queueView } from "@/lib/school-ai/moderation-queue-state";
import { ModerationPanel } from "./moderation-panel";

/** SKO-501: papers waiting for this person's moderation (renders nothing when there are none). */
// Papers waiting on the moderator lead; signed and sealed papers follow.
const SLOT_RANK: Record<string, number> = { CHANGED_AFTER_APPROVAL: 0, READY_FOR_REVIEW: 1, NEEDS_CORRECTION: 2, MODERATED: 3, SEALED: 4 };
const SLOT_TONE: Record<string, DeskTone> = { CHANGED_AFTER_APPROVAL: "danger", READY_FOR_REVIEW: "warning", NEEDS_CORRECTION: "info", MODERATED: "success", SEALED: "neutral" };

export function ModerationQueue() {
  const { language } = useLocale();
  const t = studioSlotsCopy(language);
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  // SKAI-1456: loading, failed and loaded are separate. A failed read is never an empty queue; a refresh that fails
  // keeps the last loaded papers on screen. `null` slots means nothing has loaded yet.
  const [slots, setSlots] = useState<SlotView[] | null>(null);
  const [failure, setFailure] = useState<RequestFailure | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<SlotView | null>(null);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    try {
      const response = await fetch("/api/school-ai/paper-slots/mine", { cache: "no-store" });
      if (!response.ok) throw new RequestFailure(failureForStatus(response.status), response.status);
      const payload = await response.json().catch(() => { throw new RequestFailure("server", response.status); });
      if (!Array.isArray(payload?.slots)) throw new RequestFailure("server", response.status);
      if (request !== sequence.current) return;
      setSlots(moderatorQueue({ viewerId: payload.viewerId, slots: payload.slots as SlotView[] }));
      setFailure(null);
    } catch (error) {
      if (request === sequence.current) setFailure(requestFailure(error));
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  // A denied role has no moderation queue to show; it is not an error for them.
  const view = queueView({ slots, failure });
  if (view === "denied" || view === "hidden") return null;
  if (view === "loading") return <p role="status" className="text-sm text-ink-muted">{t.moderateLoading}</p>;
  if (view === "failed") {
    return <section id="moderation-queue" className="sk-panel scroll-mt-24 space-y-3 p-4 sm:p-5" aria-labelledby="moderation-queue-title" data-moderation-queue data-queue-state="failed">
      <h2 id="moderation-queue-title" className="flex items-center gap-2 text-lg font-bold"><FileCheck2 aria-hidden="true" className="size-5 text-primary" />{t.moderateTitle}</h2>
      <ErrorState error={failure} onRetry={load} variant="panel" />
    </section>;
  }
  if (slots === null) return null; // a "list" view always has loaded papers
  return <section id="moderation-queue" className="sk-panel scroll-mt-24 space-y-3 p-4 sm:p-5" aria-labelledby="moderation-queue-title" data-moderation-queue>
    <h2 id="moderation-queue-title" className="flex items-center gap-2 text-lg font-bold"><FileCheck2 aria-hidden="true" className="size-5 text-primary" />{t.moderateTitle}</h2>
    {failure ? <div role="alert" data-queue-refresh-failed className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
      <p>{t.moderateRefreshFailed}</p>
      <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void load()}>{t.moderateRetry}</Button>
    </div> : null}
    <ul className="grid gap-2 md:grid-cols-2">
      {urgencyFirst(slots, slot => SLOT_RANK[slot.status] ?? 9).map(slot => <li key={slot.id} data-tone={SLOT_TONE[slot.status] ?? "neutral"} className={`${deskRow} flex flex-wrap items-center justify-between gap-3`}>
        <DeskRowIcon icon={FileCheck2} />
        <div className="min-w-0 flex-1 basis-52 space-y-1">
          <p className="font-semibold"><bdi>{slot.subjectName}</bdi> · <bdi>{slot.gradeName}</bdi></p>
          <p className="text-xs text-ink-muted"><bdi>{slot.authorName ?? ""}</bdi> · {fillStudioCopy(t.dueOn, [date(slot.dueOn)])}</p>
          <DeskPill tone={SLOT_TONE[slot.status] ?? "neutral"}>{t[`status${slot.status}` as keyof typeof t]}</DeskPill>
        </div>
        <Button type="button" size="sm" onClick={() => setOpen(slot)}>{slot.status === "READY_FOR_REVIEW" ? t.moderate : studioHomeCopy(language).open}</Button>
      </li>)}
    </ul>
    {open ? <Modal title={fillStudioCopy(t.moderationTitle, [`${open.subjectName} · ${open.gradeName}`])} icon={FileCheck2} tone="violet" size="lg" onClose={() => { setOpen(null); void load(); }}>
      <ModerationPanel slotId={open.id} onDone={() => void load()} />
    </Modal> : null}
  </section>;
}

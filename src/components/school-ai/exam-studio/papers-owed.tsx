"use client";

import { useCallback, useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { useLocale } from "@/components/locale/LocaleProvider";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSlotsCopy } from "@/lib/school-ai/exam-studio-copy-slots";
import type { SlotView } from "@/lib/school-ai/paper-slot-service";

/**
 * SKO-500: the papers the exam office asked this teacher to write. "Start the paper" opens (or creates
 * once) the slot's brief with the office's settings confirmed. On Today it navigates to Exam Studio;
 * inside the Studio's brief space it hands the brief straight to the space.
 */
const OWED = new Set(["REQUESTED", "DRAFT", "NEEDS_CORRECTION", "READY_FOR_REVIEW", "CHANGED_AFTER_APPROVAL"]);

export function PapersOwed({ onOpenBrief }: { onOpenBrief?: (briefId: string, slotId: string, subjectId: string | null) => void }) {
  const { language } = useLocale();
  const t = studioSlotsCopy(language);
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const [slots, setSlots] = useState<SlotView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/school-ai/paper-slots/mine", { cache: "no-store" }).catch(() => null);
    const payload = response?.ok ? await response.json().catch(() => null) : null;
    setSlots(payload ? (payload.slots as SlotView[]).filter(slot => slot.authorUserId === payload.viewerId && OWED.has(slot.status)) : []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const open = async (slot: SlotView) => {
    if (!onOpenBrief) { window.location.assign(`/ai/studio#space=brief&slot=${encodeURIComponent(slot.id)}`); return; }
    setBusy(slot.id); setFailed(null);
    const response = await fetch(`/api/school-ai/paper-slots/${encodeURIComponent(slot.id)}/brief`, { method: "POST" }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    setBusy(null);
    if (!response?.ok) { setFailed(typeof payload.error === "string" ? payload.error : t.failed); return; }
    onOpenBrief(payload.briefId, slot.id, typeof payload.subjectId === "string" ? payload.subjectId : null);
  };

  if (!slots?.length) return null;
  return <section className="sk-panel space-y-3 p-4 sm:p-5" aria-labelledby="papers-owed-title" data-papers-owed>
    <header className="space-y-1">
      <h2 id="papers-owed-title" className="flex items-center gap-2 text-lg font-bold"><FileText aria-hidden="true" className="size-5 text-primary" />{t.mineTitle}</h2>
      <p className="text-sm text-ink-muted">{t.mineIntro}</p>
    </header>
    {failed ? <Alert tone="danger" compact live="polite">{failed}</Alert> : null}
    <ul className="grid gap-2 md:grid-cols-2">
      {slots.map(slot => <li key={slot.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-subtle p-3" data-paper-owed={slot.status}>
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold"><bdi>{slot.subjectName}</bdi> · <bdi>{slot.gradeName}</bdi></p>
          <p className="text-xs text-ink-muted"><bdi>{slot.sessionTitle}</bdi> · {fillStudioCopy(t.dueOn, [date(slot.dueOn)])}</p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Badge variant={slot.overdue ? "danger" : "neutral"} size="sm">{slot.overdue ? t.overdue : (t as Record<string, string>)[`status${slot.status}`] ?? slot.status}</Badge>
          </div>
        </div>
        <Button type="button" size="sm" loading={busy === slot.id} disabled={Boolean(busy)} onClick={() => void open(slot)}>{slot.paperRecordId ? t.continueBrief : t.openBrief}</Button>
      </li>)}
    </ul>
  </section>;
}

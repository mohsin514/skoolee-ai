"use client";

import { useCallback, useEffect, useState } from "react";
import { FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useLocale } from "@/components/locale/LocaleProvider";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSlotsCopy } from "@/lib/school-ai/exam-studio-copy-slots";
import { studioHomeCopy } from "@/lib/school-ai/exam-studio-copy-home";
import type { SlotView } from "@/lib/school-ai/paper-slot-service";
import { ModerationPanel } from "./moderation-panel";

/** SKO-501: papers waiting for this person's moderation (renders nothing when there are none). */
export function ModerationQueue() {
  const { language } = useLocale();
  const t = studioSlotsCopy(language);
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const [slots, setSlots] = useState<SlotView[]>([]);
  const [open, setOpen] = useState<SlotView | null>(null);
  const load = useCallback(async () => {
    const payload = await fetch("/api/school-ai/paper-slots/mine", { cache: "no-store" }).then(response => (response.ok ? response.json() : null)).catch(() => null);
    setSlots(payload ? (payload.slots as SlotView[]).filter(slot => slot.moderatorUserId === payload.viewerId && ["READY_FOR_REVIEW", "NEEDS_CORRECTION", "MODERATED", "SEALED", "CHANGED_AFTER_APPROVAL"].includes(slot.status)) : []);
  }, []);
  useEffect(() => { void load(); }, [load]);
  if (!slots.length) return null;
  return <section id="moderation-queue" className="sk-panel scroll-mt-24 space-y-3 p-4 sm:p-5" aria-labelledby="moderation-queue-title" data-moderation-queue>
    <h2 id="moderation-queue-title" className="flex items-center gap-2 text-lg font-bold"><FileCheck2 aria-hidden="true" className="size-5 text-primary" />{t.moderateTitle}</h2>
    <ul className="grid gap-2 md:grid-cols-2">
      {slots.map(slot => <li key={slot.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-subtle bg-surface-subtle p-3">
        <div className="min-w-0 space-y-0.5">
          <p className="font-semibold"><bdi>{slot.subjectName}</bdi> · <bdi>{slot.gradeName}</bdi></p>
          <p className="text-xs text-ink-muted"><bdi>{slot.authorName ?? ""}</bdi> · {fillStudioCopy(t.dueOn, [date(slot.dueOn)])}</p>
          <Badge variant="info" size="sm">{t[`status${slot.status}` as keyof typeof t]}</Badge>
        </div>
        <Button type="button" size="sm" onClick={() => setOpen(slot)}>{slot.status === "READY_FOR_REVIEW" ? t.moderate : studioHomeCopy(language).open}</Button>
      </li>)}
    </ul>
    {open ? <Modal title={fillStudioCopy(t.moderationTitle, [`${open.subjectName} · ${open.gradeName}`])} size="lg" onClose={() => { setOpen(null); void load(); }}>
      <ModerationPanel slotId={open.id} onDone={() => void load()} />
    </Modal> : null}
  </section>;
}

"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/locale/LocaleProvider";
import { periodChangeCopy } from "@/lib/timetable/editor-copy";
import type { PeriodAssignment } from "@/lib/timetable/period-changes";

export function PeriodChangeReview({ clearing, onConfirm, onCancel }: { clearing: Array<{ slot: PeriodAssignment; type: string }>; onConfirm: () => Promise<boolean>; onCancel: () => void }) {
  const { language } = useLocale(), c = periodChangeCopy(language);
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  const save = async () => { if (busy) return; setBusy(true); setError(false); try { if (!await onConfirm()) setError(true); } catch { setError(true); } finally { setBusy(false); } };
  return <Modal title={c.title} subtitle={c.hint} icon={AlertTriangle} size="md" onClose={onCancel} dismissible={!busy} disableBackdropClose={busy} footer={<div className="flex flex-wrap justify-end gap-3"><Button variant="outline" disabled={busy} onClick={onCancel}>{c.cancel}</Button><Button variant="destructive" disabled={busy} onClick={() => void save()}>{busy && <Loader2 aria-hidden="true" className="motion-safe:animate-spin" />}{busy ? c.saving : c.confirm}</Button></div>}>
    <div className="space-y-4 text-start" dir={language === "en" ? "ltr" : "rtl"} aria-busy={busy}>
      {error && <p role="alert" className="text-sm text-destructive">{c.failed}</p>}
      <p className="text-sm font-semibold">{c.count.replace("{count}", new Intl.NumberFormat(language).format(clearing.length))}</p>
      <ul className="space-y-3">{clearing.map(({ slot, type }) => <li key={slot.id} className="rounded-xl border border-border bg-surface-muted p-4 text-sm">
        <p className="font-semibold">{new Intl.DateTimeFormat(language, { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, slot.dayOfWeek)))} · {c.period} {new Intl.NumberFormat(language).format(slot.periodNumber)} · {type in c ? c[type as keyof typeof c] : type}</p>
        <p className="mt-1 text-ink-muted"><bdi>{slot.startTime}–{slot.endTime}</bdi></p>
        <dl className="mt-3 space-y-1 break-words">{slot.subjectId && <div><dt className="inline font-medium">{c.subject}: </dt><dd className="inline">{slot.subject?.name || c.assigned}</dd></div>}{slot.teacherId && <div><dt className="inline font-medium">{c.teacher}: </dt><dd className="inline">{slot.teacher?.fullName || c.assigned}</dd></div>}{(slot.roomId || slot.roomNumber) && <div><dt className="inline font-medium">{c.room}: </dt><dd className="inline">{slot.room?.roomNumber || slot.roomNumber || c.assigned}</dd></div>}</dl>
      </li>)}</ul>
    </div>
  </Modal>;
}

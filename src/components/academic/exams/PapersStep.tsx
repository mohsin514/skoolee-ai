"use client";

import { useCallback, useEffect, useState } from "react";
import { BellRing, Check, Circle, FileText, PencilLine, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { FormField } from "@/components/ui/form-field";
import { Modal, ModalActions } from "@/components/ui/modal";
import { TaskFeedback, TaskLoading } from "@/components/ui/task-patterns";
import { useLocale } from "@/components/locale/LocaleProvider";
import { cn } from "@/lib/utils";
import { fillStudioCopy } from "@/lib/school-ai/exam-studio-copy";
import { studioSlotsCopy, type StudioSlotsCopy } from "@/lib/school-ai/exam-studio-copy-slots";
import type { SlotView } from "@/lib/school-ai/paper-slot-service";

/**
 * SKO-500: the office's Papers step. One row per grade and subject: the sections that share it, the
 * sitting, the deadline, author and moderator, the derived status and its readiness ticks. The office
 * requests papers, changes the deadline, author or moderator, reminds the author, and withdraws or
 * restores a request (the paper itself is always kept).
 */
type Listing = { slots: SlotView[]; office: boolean; staff: Array<{ id: string; name: string }>; progress: { slots: number; sealed: number }; scheduledRows: number; unlinkedRows: number; paperDueOn: string | null };

const TONE: Record<string, "neutral" | "warning" | "info" | "success" | "danger" | "secondary"> = {
  REQUESTED: "neutral", DRAFT: "warning", NEEDS_CORRECTION: "danger", READY_FOR_REVIEW: "info", MODERATED: "info", APPROVED: "success",
  CHANGED_AFTER_APPROVAL: "danger", SEALED: "secondary", STALE: "danger", PRINTED: "secondary", GATE_OPEN: "info", SAT: "info", MARKED: "success", PUBLISHED: "success", CANCELLED: "neutral",
};
const OWED = new Set(["REQUESTED", "DRAFT", "NEEDS_CORRECTION"]);
const statusWord = (t: StudioSlotsCopy, status: string) => (t as Record<string, string>)[`status${status}`] ?? status;
const tickWord = (t: StudioSlotsCopy, tick: string) => (t as Record<string, string>)[`tick${tick}`] ?? tick;

export function PapersStep({ sessionId, onChanged }: { sessionId: string; onChanged?: () => void }) {
  const { language } = useLocale();
  const t = studioSlotsCopy(language);
  const date = (value: string) => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const number = (value: number) => new Intl.NumberFormat(language).format(value);
  const [data, setData] = useState<Listing | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deadline, setDeadline] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(null);
  const [editing, setEditing] = useState<SlotView | null>(null);
  const [withdrawing, setWithdrawing] = useState<SlotView | null>(null);

  const load = useCallback(async () => {
    const response = await fetch(`/api/academic/exam-sessions/${encodeURIComponent(sessionId)}/paper-slots`, { cache: "no-store" }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    if (!response?.ok) { setFailed(typeof payload.error === "string" ? payload.error : t.failed); return; }
    setFailed(null); setData(payload.data);
  }, [sessionId, t.failed]);
  useEffect(() => { void load(); }, [load]);

  const send = async (key: string, url: string, method: "POST" | "PATCH", body: unknown, success: (result: unknown) => string) => {
    setBusy(key); setNotice(null);
    const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const payload = response ? await response.json().catch(() => ({})) : {};
    setBusy(null);
    if (!response?.ok) { setNotice({ tone: "danger", text: typeof payload.error === "string" ? payload.error : t.failed }); return false; }
    setNotice({ tone: "success", text: success(payload.data) });
    await load(); onChanged?.();
    return true;
  };

  if (failed) return <TaskFeedback kind="error" title={t.failed}><p>{failed}</p></TaskFeedback>;
  if (!data) return <TaskLoading label={t.stepTitle} />;
  const canRequest = data.office && data.scheduledRows > 0 && (data.unlinkedRows > 0 || data.slots.length === 0);

  return <section className="space-y-4" aria-labelledby="papers-step-title" data-papers-step>
    <div className="sk-panel space-y-3 p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id="papers-step-title" className="flex items-center gap-2 text-lg font-bold"><FileText aria-hidden="true" className="size-5 text-primary" />{t.stepTitle}</h2>
          <p className="text-sm text-ink-muted">{t.stepIntro}</p>
        </div>
        {data.slots.length ? <Badge variant="secondary">{fillStudioCopy(t.progress, [number(data.progress.sealed), number(data.progress.slots)])}</Badge> : null}
      </header>
      {notice ? <Alert tone={notice.tone} compact live="polite">{notice.text}</Alert> : null}
      {data.scheduledRows === 0 ? <Alert tone="info" compact>{t.noDatesheet}</Alert> : null}
      {canRequest ? <div className="flex flex-wrap items-end gap-3">
        <FormField name="paperDeadline" label={t.deadlineLabel} hint={t.deadlineHint} className="w-56">
          <Input type="date" value={deadline} onChange={event => setDeadline(event.currentTarget.value)} />
        </FormField>
        <Button type="button" loading={busy === "request"} disabled={Boolean(busy)} onClick={() => void send("request", `/api/academic/exam-sessions/${encodeURIComponent(sessionId)}/paper-slots`, "POST", deadline ? { dueOn: deadline } : {}, result => { const created = (result as { created: number }).created; return created ? fillStudioCopy(t.requested, [number(created)]) : t.nothingToRequest; })}>
          {data.slots.length ? t.requestAgain : t.request}
        </Button>
        <p className="w-full text-xs text-ink-subtle">{t.requestHint}</p>
      </div> : null}
    </div>

    {data.slots.length ? <ul className="grid gap-3 xl:grid-cols-2">
      {data.slots.map(slot => {
        const cancelled = slot.status === "CANCELLED";
        return <li key={slot.id} className={cn("sk-panel space-y-3 p-4", cancelled && "opacity-70")} data-slot-status={slot.status}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-base font-bold"><bdi>{slot.subjectName}</bdi> · <bdi>{slot.gradeName}</bdi></p>
              <p className="text-xs text-ink-muted">{fillStudioCopy(t.sections, [slot.sections.map(section => section.name).join(language === "en" ? ", " : "، ")])}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant={TONE[slot.status] ?? "neutral"}>{statusWord(t, slot.status)}</Badge>
              {slot.overdue ? <Badge variant="danger">{t.overdue}</Badge> : null}
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
            <div><dt className="text-2xs font-semibold text-ink-subtle">{t.columnSitting}</dt><dd><bdi>{slot.dates.map(date).join(" · ")}</bdi>{slot.period ? <span className="block text-xs text-ink-muted"><bdi dir="ltr">{slot.period}</bdi></span> : null}</dd></div>
            <div><dt className="text-2xs font-semibold text-ink-subtle">{t.columnDue}</dt><dd className={cn(slot.overdue && "font-semibold text-status-error-text")}><bdi>{date(slot.dueOn)}</bdi></dd></div>
            <div><dt className="text-2xs font-semibold text-ink-subtle">{t.columnAuthor}</dt><dd>{slot.authorName ? <bdi>{slot.authorName}</bdi> : <span className="text-ink-muted">{t.noAuthor}</span>}</dd></div>
            <div><dt className="text-2xs font-semibold text-ink-subtle">{t.columnModerator}</dt><dd>{slot.moderatorName ? <bdi>{slot.moderatorName}</bdi> : <span className="text-ink-muted">{t.noModerator}</span>}</dd></div>
          </dl>
          <div>
            <p className="sr-only">{t.readinessTitle}</p>
            <ul className="flex flex-wrap gap-1.5" aria-label={t.readinessTitle}>
              {slot.readiness.map(row => <li key={row.tick} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-2xs font-semibold", row.done ? "border-status-success-border bg-status-success-surface text-status-success-text" : "border-border-subtle text-ink-subtle")}>
                {row.done ? <Check aria-hidden="true" className="size-3" /> : <Circle aria-hidden="true" className="size-3" />}{tickWord(t, row.tick)}
              </li>)}
            </ul>
          </div>
          {data.office ? <div className="flex flex-wrap gap-2">
            {!cancelled && OWED.has(slot.status) && slot.authorUserId ? <Button type="button" size="sm" variant="outline" loading={busy === `nudge-${slot.id}`} disabled={Boolean(busy)} onClick={() => void send(`nudge-${slot.id}`, `/api/academic/paper-slots/${slot.id}/nudge`, "POST", {}, () => fillStudioCopy(t.nudged, [slot.authorName ?? ""]))}><BellRing aria-hidden="true" />{t.nudge}</Button> : null}
            {!cancelled ? <Button type="button" size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => setEditing(slot)}><PencilLine aria-hidden="true" />{t.edit}</Button> : null}
            {!cancelled ? <Button type="button" size="sm" variant="ghost" disabled={Boolean(busy)} onClick={() => setWithdrawing(slot)}><XCircle aria-hidden="true" />{t.cancelRequest}</Button>
              : <Button type="button" size="sm" variant="ghost" loading={busy === `restore-${slot.id}`} disabled={Boolean(busy)} onClick={() => void send(`restore-${slot.id}`, `/api/academic/paper-slots/${slot.id}`, "PATCH", { version: slot.version, restore: true }, () => t.saved)}><Undo2 aria-hidden="true" />{t.restore}</Button>}
          </div> : null}
        </li>;
      })}
    </ul> : null}

    {editing ? <EditSlot t={t} slot={editing} staff={data.staff} busy={busy === "edit"} onClose={() => setEditing(null)} onSave={async body => { if (await send("edit", `/api/academic/paper-slots/${editing.id}`, "PATCH", { version: editing.version, ...body }, () => t.saved)) setEditing(null); }} /> : null}
    {withdrawing ? <WithdrawSlot t={t} busy={busy === "withdraw"} onClose={() => setWithdrawing(null)} onSave={async reason => { if (await send("withdraw", `/api/academic/paper-slots/${withdrawing.id}`, "PATCH", { version: withdrawing.version, cancel: { reason } }, () => t.saved)) setWithdrawing(null); }} /> : null}
  </section>;
}

function EditSlot({ t, slot, staff, busy, onClose, onSave }: { t: StudioSlotsCopy; slot: SlotView; staff: Array<{ id: string; name: string }>; busy: boolean; onClose: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [dueOn, setDueOn] = useState(slot.dueOn);
  const [author, setAuthor] = useState(slot.authorUserId ?? "");
  const [moderator, setModerator] = useState(slot.moderatorUserId ?? "");
  const clash = Boolean(author) && author === moderator;
  const body = { ...(dueOn !== slot.dueOn ? { dueOn } : {}), ...(author !== (slot.authorUserId ?? "") ? { authorUserId: author || null } : {}), ...(moderator !== (slot.moderatorUserId ?? "") ? { moderatorUserId: moderator || null } : {}) };
  return <Modal title={`${slot.subjectName} · ${slot.gradeName}`} onClose={onClose} footer={<ModalActions busy={busy} actionLabel={t.save} cancelLabel={t.cancel} onCancel={onClose} onAction={() => onSave(body)} blockedReason={clash ? t.authorIsModerator : null} />}>
    <div className="space-y-3">
      <FormField name="slotDue" label={t.columnDue}><Input type="date" value={dueOn} onChange={event => setDueOn(event.currentTarget.value)} /></FormField>
      <FormField name="slotAuthor" label={t.authorLabel}><Select value={author} onChange={event => setAuthor(event.currentTarget.value)}><option value="">{t.noAuthor}</option>{staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</Select></FormField>
      <FormField name="slotModerator" label={t.moderatorLabel} error={clash ? t.authorIsModerator : undefined}><Select value={moderator} onChange={event => setModerator(event.currentTarget.value)}><option value="">{t.noModerator}</option>{staff.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}</Select></FormField>
    </div>
  </Modal>;
}

function WithdrawSlot({ t, busy, onClose, onSave }: { t: StudioSlotsCopy; busy: boolean; onClose: () => void; onSave: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return <Modal title={t.cancelRequest} subtitle={t.cancelHint} onClose={onClose} footer={<ModalActions busy={busy} tone="rose" actionLabel={t.cancelRequest} cancelLabel={t.close} onCancel={onClose} onAction={() => onSave(reason.trim())} blockedReason={reason.trim().length < 3 ? t.cancelReason : null} />}>
    <FormField name="withdrawReason" label={t.cancelReason}><Input value={reason} maxLength={500} onChange={event => setReason(event.currentTarget.value)} /></FormField>
  </Modal>;
}

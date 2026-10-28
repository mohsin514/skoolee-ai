"use client";
import { useEffect, useState } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { archiveCampus, previewCampusArchive, restoreCampus, type CampusArchivePreview } from "@/app/actions/settings";

// SKO-389: a campus is archived only after the owner has seen what it still holds; anything that
// would be stranded (pupils, classes, payments awaiting confirmation, the last active campus) blocks it.

const BLOCKER_TEXT: Record<CampusArchivePreview["blockers"][number], string> = {
  ACTIVE_STUDENTS: "Move or archive its {0} active pupil(s) first.",
  ACTIVE_CLASSES: "Archive or move its {1} active class(es) first.",
  PENDING_ONLINE_PAYMENTS: "Wait for {2} online payment(s) to be confirmed first.",
  OPEN_INVOICES: "Collect, adjust or cancel its {3} unpaid invoice(s) first; invoices are never deleted.",
  LAST_ACTIVE_CAMPUS: "A school needs at least one active campus.",
};

/** Controlled archive dialog: previews what the campus still holds, then asks for a reason (SKO-389). */
export function CampusArchiveDialog({ campus, open, onClose, onDone }: { campus: { id: string; name: string }; open: boolean; onClose: () => void; onDone: () => Promise<void> | void }) {
  const ui = useUiText();
  const [preview, setPreview] = useState<CampusArchivePreview | null>(null), [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => {
    if (!open) { setPreview(null); return; }
    let cancelled = false;
    setBusy(true); setError(""); setReason("");
    previewCampusArchive(campus.id)
      .then(result => { if (!cancelled) setPreview(result); })
      .catch(failure => { if (!cancelled) { toast.error(friendlyErrorMessage(failure, ui("Could not check this campus."))); onClose(); } })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
    // The preview is fetched once per opening for this campus.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, campus.id]);
  const blocked = Boolean(preview?.blockers.length);
  const confirm = async () => {
    if (!preview || blocked) { onClose(); return; }
    if (!reason.trim()) { setError(ui("Give a reason for archiving this campus.")); return; }
    setBusy(true); setError("");
    try {
      const result = await archiveCampus({ campusId: campus.id, reason });
      if (!result.success && "blockers" in result) { setPreview({ ...preview, blockers: result.blockers ?? [], counts: result.counts ?? preview.counts }); return; }
      toast.success(ui("{0} archived. Its classes, pupils, invoices and reports are kept.", [campus.name]));
      onClose(); await onDone();
    } catch (failure) { setError(friendlyErrorMessage(failure, ui("Could not archive this campus."))); } finally { setBusy(false); }
  };
  const counts = preview?.counts;
  return <ConfirmAction open={open && Boolean(preview)} title={ui("Archive {0}?", [campus.name])}
    description={blocked ? ui("This campus cannot be archived yet. Nothing has been changed.") : ui("The campus leaves current lists and its staff can no longer add new work there. Its classes, pupils, invoices, receipts and reports are kept, and you can restore it later.")}
    confirmLabel={blocked ? ui("Close") : ui("Archive campus")} cancelLabel={ui("Keep editing")} tone={blocked ? "primary" : "warning"} busy={busy}
    detail={counts && <div className="space-y-3 text-sm" data-campus-archive-preview>
      <p className="text-ink-muted">{ui("{0} active pupil(s) · {1} active class(es) · {2} staff · {3} unpaid invoice(s) · {4} payment(s) awaiting confirmation · {5} queued AI run(s)", [counts.activeStudents, counts.activeClasses, counts.staff, counts.openInvoices, counts.pendingOnlinePayments, counts.queuedRuns])}</p>
      {blocked ? <ul className="list-disc space-y-1 ps-5 font-medium text-destructive" data-campus-archive-blockers>{preview!.blockers.map(blocker => <li key={blocker}>{ui(BLOCKER_TEXT[blocker], [counts.activeStudents, counts.activeClasses, counts.pendingOnlinePayments, counts.openInvoices])}</li>)}</ul>
        : <FormField name="campus-archive-reason" label={ui("Reason")} required><Input value={reason} maxLength={300} dir="auto" onChange={event => setReason(event.target.value)} /></FormField>}
      {error && <p role="alert" className="font-medium text-destructive">{error}</p>}
    </div>}
    onConfirm={() => confirm()} onCancel={onClose} />;
}

export function CampusArchiveButton({ campus, onDone }: { campus: { id: string; name: string }; onDone: () => Promise<void> | void }) {
  const ui = useUiText();
  const [open, setOpen] = useState(false);
  return <>
    <Button variant="outline" type="button" onClick={() => setOpen(true)} className="shrink-0" data-archive-campus={campus.id}><Archive aria-hidden="true" />{ui("Archive")}</Button>
    <CampusArchiveDialog campus={campus} open={open} onClose={() => setOpen(false)} onDone={onDone} />
  </>;
}

export function ArchivedCampusList({ campuses, onDone }: { campuses: { id: string; name: string; city: string; archivedAt: string | null; archiveReason: string }[]; onDone: () => Promise<void> | void }) {
  const ui = useUiText();
  const { date } = useLocaleFormat();
  const [restoring, setRestoring] = useState<{ id: string; name: string } | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  if (!campuses.length) return null;
  const restore = async () => {
    if (!restoring) return;
    setBusy(true); setError("");
    try {
      const result = await restoreCampus(restoring.id);
      toast.success(result.alreadyActive ? ui("{0} is already active.", [restoring.name]) : ui("{0} restored.", [restoring.name]));
      setRestoring(null); await onDone();
    } catch (failure) { setError(friendlyErrorMessage(failure, ui("Could not restore this campus."))); } finally { setBusy(false); }
  };
  return <div className="mt-6 space-y-3" data-archived-campuses>
    <h2 className="text-sm font-bold text-ink-strong">{ui("Archived campuses")}</h2>
    {campuses.map(campus => <div key={campus.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-surface-subtle p-3 sm:p-4" data-archived-campus={campus.id}>
      <div className="min-w-0"><p className="break-words text-sm font-bold text-ink-strong"><bdi>{campus.name}</bdi></p><p className="text-2xs font-semibold text-ink-muted"><bdi>{[campus.city, campus.archiveReason].filter(Boolean).join(" · ")}</bdi>{campus.archivedAt ? <> · {ui("Archived {0}", [date(campus.archivedAt)])}</> : null}</p></div>
      <Button variant="outline" size="sm" type="button" onClick={() => { setError(""); setRestoring(campus); }}><RotateCcw aria-hidden="true" />{ui("Restore")}</Button>
    </div>)}
    <ConfirmAction open={Boolean(restoring)} title={ui("Restore {0}?", [restoring?.name ?? ""])} description={ui("The campus returns to current lists with everything it held. A campus with the same name that is already active blocks the restore.")} confirmLabel={ui("Restore campus")} cancelLabel={ui("Keep editing")} tone="success" busy={busy}
      detail={error ? <p role="alert" className="text-sm font-medium text-destructive">{error}</p> : undefined} onConfirm={() => restore()} onCancel={() => setRestoring(null)} />
  </div>;
}

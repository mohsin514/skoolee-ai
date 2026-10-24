"use client";
import { useCallback, useEffect, useState } from "react";
import { Archive, RotateCcw } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Alert } from "@/components/ui/alert";
import { SkeletonList } from "@/components/ui/skeleton";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

type ArchivedClass = { id: string; name: string; section: string | null; academicYear: number; archivedAt: string | null; archiveReason?: string | null; campus?: { name: string } | null; _count?: { students: number; subjects: number } };

/**
 * SKO-389: archived classes stay listed for their year and can be restored. The server re-checks the
 * campus and refuses a restore that would duplicate an active class with the same name, section and year.
 */
export function ArchivedClassesPanel({ version, onRestored }: { version?: number; onRestored?: () => void }) {
  const ui = useUiText();
  const { date: formatDay } = useLocaleFormat();
  const [classes, setClasses] = useState<ArchivedClass[]>([]), [loading, setLoading] = useState(true), [failed, setFailed] = useState(false);
  const [restoring, setRestoring] = useState<ArchivedClass | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setFailed(false);
    try {
      const response = await fetch("/api/classes?includeArchived=true", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setClasses((payload.data as ArchivedClass[]).filter(row => row.archivedAt));
    } catch { setFailed(true); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load, version]);
  const label = (row: ArchivedClass) => `${row.name}${row.section ? ` · ${row.section}` : ""} · ${row.academicYear}`;
  const restore = async () => {
    if (!restoring) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/classes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "restore", id: restoring.id }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(response.status === 409 ? ui("This class conflicts with an active class or its campus is unavailable. Nothing was changed.") : ui("Class could not be restored"));
      toast.success(payload.alreadyActive ? ui("{0} is already active.", [label(restoring)]) : ui("{0} restored. Its history was never removed.", [label(restoring)]));
      setRestoring(null); await load(); onRestored?.();
    } catch (failure) { setError(failure instanceof Error && failure.message ? failure.message : ui("Class could not be restored")); } finally { setBusy(false); }
  };
  return <section className="sk-panel sk-rise space-y-4 p-6" data-archived-classes>
    <div className="flex items-center gap-2"><Archive className="size-5 text-primary" aria-hidden="true" /><h2 className="text-lg font-bold text-ink-strong">{ui("Archived classes")}</h2></div>
    <p className="text-sm leading-relaxed text-ink-muted">{ui("Archived classes keep their attendance, marks, fees and timetable history for their year. Restore one that was archived by mistake.")}</p>
    {loading ? <SkeletonList rows={3} label={ui("Loading archived classes…")} />
      : failed ? <ErrorState title={ui("Archived classes could not be loaded.")} onRetry={() => void load()} retryLabel={ui("Try again")} />
      : classes.length === 0 ? <EmptyState size="sm" icon={Archive} title={ui("No archived classes.")} description={ui("Classes you archive appear here and can be restored.")} />
      : <ul className="space-y-2">{classes.map(row => <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-edge p-3 transition-colors hover:bg-surface-hover" data-archived-class={row.id}>
          <div className="min-w-0"><p className="break-words text-sm font-semibold text-ink-strong">{label(row)}</p><p className="text-xs text-ink-subtle tabular-nums">{[row.campus?.name, row.archiveReason, row.archivedAt ? formatDay(row.archivedAt) : ""].filter(Boolean).join(" · ")}</p></div>
          <Button variant="outline" onClick={() => { setError(""); setRestoring(row); }}><RotateCcw className="size-4" aria-hidden="true" />{ui("Restore")}</Button>
        </li>)}</ul>}
    <ConfirmAction open={Boolean(restoring)} title={ui("Restore {0}?", [restoring ? label(restoring) : ""])} description={ui("The class returns to current class lists. The campus and any active class with the same name, section and year are checked first; nothing changes if there is a conflict.")} confirmLabel={ui("Restore class")} tone="success" busy={busy}
      detail={error ? <Alert tone="danger" compact>{error}</Alert> : undefined}
      onConfirm={() => void restore()} onCancel={() => setRestoring(null)} />
  </section>;
}

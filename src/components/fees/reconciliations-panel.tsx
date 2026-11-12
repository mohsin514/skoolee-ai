"use client";
import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, Landmark, Scale } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { DeskPill, DeskRowIcon, deskRow, urgencyFirst } from "@/components/ui/desk";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SkeletonTable } from "@/components/ui/skeleton";
import { useLocaleFormat, useUiText, useLocale } from "@/components/locale/LocaleProvider";

// SKO-432: the reconciliation workbench. Each committed statement shows where every unit of money
// went; matched rows post as payments only after an explicit review; unmatched money stays visible.

type Row = { rowNumber: number; date: string; amountMinor: number; description: string; currency?: string; studentName?: string | null; manualMatch?: { reason: string } | null };
// SKAI-1865: the list arrives as a summary (counts, currency, the first unallocated rows); "Show all" loads one statement in full.
type Rec = {
  id: string; status: string; bankAccount: string | null; from: string | null; to: string | null;
  matchedCount: number; manualMatchCount: number; currency: string | null; unmatched: Row[]; unmatchedCount: number;
  posting: { posted?: { rowNumber: number; receiptNo: string | null }[]; exceptions?: { rowNumber: number; amountMinor: number; reason: string }[] } | null;
  report: { received: number; allocated: number; credited: number; unallocated: number; adjustments: number; difference: number; balanced: boolean };
};

export function ReconciliationsPanel({ campusId, version = 0, onPosted, showEmpty = false }: { campusId?: string; version?: number; onPosted?: () => void; /** Render an empty state instead of nothing (the dedicated Reconciliation tab). */ showEmpty?: boolean }) {
  const ui = useUiText();
  const { money, date } = useLocaleFormat();
  const { currency: campusCurrency } = useLocale();
  const [items, setItems] = useState<Rec[] | null>(null), [posting, setPosting] = useState<Rec | null>(null), [busy, setBusy] = useState(false), [failed, setFailed] = useState(false);
  const [allUnmatched, setAllUnmatched] = useState<Record<string, Row[]>>({}), [expanding, setExpanding] = useState<string | null>(null);
  const scope = campusId ? `campusId=${encodeURIComponent(campusId)}` : "";
  const load = useCallback(async () => {
    setFailed(false);
    const response = await fetch(`/api/fees/reconciliations?summary=1${scope ? `&${scope}` : ""}`, { cache: "no-store" }).catch(() => null);
    const json = response ? await response.json().catch(() => ({})) : {};
    if (response?.ok && json.success) { setItems(json.data); setAllUnmatched({}); }
    else setFailed(true);
  }, [scope]);
  const showAll = async (id: string) => {
    setExpanding(id);
    try {
      const response = await fetch(`/api/fees/reconciliations?id=${encodeURIComponent(id)}${scope ? `&${scope}` : ""}`, { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      const rows: Row[] | undefined = json.data?.[0]?.unmatched;
      if (!response.ok || !json.success || !rows) throw new Error(json.error || ui("The unallocated rows could not be loaded."));
      setAllUnmatched(current => ({ ...current, [id]: rows }));
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : ui("The unallocated rows could not be loaded.")); } finally { setExpanding(null); }
  };
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load, version]);
  const post = async () => {
    if (!posting) return;
    setBusy(true);
    try {
      const response = await fetch("/api/fees/reconciliations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: posting.id, action: "post" }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error || ui("The statement could not be posted."));
      toast.success(json.data?.replayed ? ui("This statement was already posted; nothing was posted twice.") : ui("Matched payments posted. Unmatched money stays unallocated for review."));
      setPosting(null); await load(); onPosted?.();
    } catch (failure) { toast.error(failure instanceof Error ? failure.message : ui("The statement could not be posted.")); } finally { setBusy(false); }
  };
  if (showEmpty && failed) return <ErrorState title={ui("Reconciliations could not be loaded")} description={ui("Check your connection and try again.")} onRetry={() => void load()} />;
  if (showEmpty && !items) return <SkeletonTable rows={3} columns={3} label={ui("Loading reconciliations")} />;
  if (showEmpty && items && items.length === 0) return <div className="sk-panel"><EmptyState icon={Landmark} title={ui("No bank statements to reconcile")} description={ui("Imported statements appear here. Matched rows become payments only after you review and post them.")} /></div>;
  if (!items || items.length === 0) return null;
  return <section className="sk-panel space-y-4 p-5" data-reconciliations>
    <h3 className="flex items-center gap-2 text-base font-bold text-ink-strong"><Landmark className="size-4 text-primary" aria-hidden="true" />{ui("Bank reconciliations")}</h3>
    {/* Statements awaiting review lead; posted and reversed ones are history. */}
    {urgencyFirst(items, rec => (rec.status === "pending" ? 0 : 1)).map(rec => {
      const currency = rec.currency || campusCurrency, fmt = (amount: number) => money(amount, currency), r = rec.report;
      const tone = rec.status === "posted" ? "success" : rec.status === "reversed" ? "neutral" : r.balanced ? "warning" : "danger";
      return <article key={rec.id} data-tone={tone} className={`${deskRow} space-y-3`} data-reconciliation={rec.id} data-reconciliation-status={rec.status}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex min-w-0 items-center gap-3 text-sm font-semibold text-ink-strong tabular-nums"><DeskRowIcon icon={FileSpreadsheet} /><span className="min-w-0">{rec.bankAccount} · {rec.from ? date(rec.from) : ""} – {rec.to ? date(rec.to) : ""}</span></p>
          <DeskPill tone={rec.status === "posted" ? "success" : rec.status === "reversed" ? "neutral" : "warning"}>{rec.status === "posted" ? ui("Posted") : rec.status === "reversed" ? ui("Reversed") : ui("Awaiting review")}</DeskPill>
        </div>
        <p className={`flex flex-wrap items-center gap-2 text-xs ${r.balanced ? "text-ink-muted" : "font-semibold text-status-error-text"}`} data-conservation={r.balanced ? "balanced" : "difference"}><Scale className="size-3.5" aria-hidden="true" />
          <bdi>{ui("Received {0} = allocated {1} + credit {2} + unallocated {3}", [fmt(r.received), fmt(r.allocated), fmt(r.credited), fmt(r.unallocated)])}</bdi>{r.balanced ? "" : ` · ${ui("Unexplained difference {0}", [fmt(r.difference)])}`}</p>
        {rec.unmatchedCount > 0 && <div className="space-y-1"><p className="sk-eyebrow text-ink-subtle">{ui("Unallocated — stays visible until reviewed")}</p><ul className="space-y-1 text-xs" data-unallocated>{(allUnmatched[rec.id] ?? rec.unmatched).map(row => <li key={row.rowNumber} className="rounded-lg border border-status-warning-border bg-status-warning-surface px-3 py-1.5 tabular-nums">{date(row.date)} · <bdi>{fmt(row.amountMinor)}</bdi> · <bdi>{row.description}</bdi></li>)}</ul>
          {!allUnmatched[rec.id] && rec.unmatchedCount > rec.unmatched.length && <Button variant="secondary" size="sm" onClick={() => void showAll(rec.id)} loading={expanding === rec.id} disabled={expanding !== null}>{ui("Show all {0} unallocated rows", [rec.unmatchedCount])}</Button>}</div>}
        {(rec.posting?.exceptions ?? []).length > 0 && <ul className="space-y-1 text-xs" data-reconciliation-exceptions>{rec.posting!.exceptions!.map(item => <li key={item.rowNumber} className="rounded-lg border border-status-error-border bg-status-error-surface px-3 py-1.5 tabular-nums">{ui("Row {0}", [item.rowNumber])} · <bdi>{fmt(item.amountMinor)}</bdi> · {ui(item.reason)}</li>)}</ul>}
        {rec.manualMatchCount > 0 && <p className="text-xs text-ink-muted">{ui("{0} matched by hand with a recorded reason.", [rec.manualMatchCount])}</p>}
        {rec.status === "pending" && rec.matchedCount > 0 && <Button onClick={() => setPosting(rec)} disabled={busy} loading={busy && posting?.id === rec.id}>{ui("Post {0} matched payment(s)", [rec.matchedCount])}</Button>}
      </article>;
    })}
    <ConfirmAction open={Boolean(posting)} title={ui("Post matched payments?")} description={posting ? ui("{0} matched transaction(s) totalling {1} become payments with receipts. {2} stays unallocated for review. This cannot be posted twice.", [posting.matchedCount, money(posting.report.allocated, posting.currency || campusCurrency), money(posting.report.unallocated, posting.currency || campusCurrency)]) : ""}
      confirmLabel={ui("Post payments")} cancelLabel={ui("Keep editing")} tone="primary" busy={busy} onConfirm={() => post()} onCancel={() => setPosting(null)} />
  </section>;
}

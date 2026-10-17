"use client";
import { useCallback, useEffect, useState } from "react";
import { Landmark, Scale } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";

// SKO-432: the reconciliation workbench. Each committed statement shows where every unit of money
// went; matched rows post as payments only after an explicit review; unmatched money stays visible.

type Row = { rowNumber: number; date: string; amountMinor: number; description: string; currency?: string; studentName?: string | null; manualMatch?: { reason: string } | null };
type Rec = {
  id: string; status: string; bankAccount: string | null; from: string | null; to: string | null; matched: Row[]; unmatched: Row[];
  posting: { posted?: { rowNumber: number; receiptNo: string | null }[]; exceptions?: { rowNumber: number; amountMinor: number; reason: string }[] } | null;
  report: { received: number; allocated: number; credited: number; unallocated: number; adjustments: number; difference: number; balanced: boolean };
};

export function ReconciliationsPanel({ campusId, version = 0, onPosted }: { campusId?: string; version?: number; onPosted?: () => void }) {
  const ui = useUiText();
  const { money, date } = useLocaleFormat();
  const [items, setItems] = useState<Rec[] | null>(null), [posting, setPosting] = useState<Rec | null>(null), [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(`/api/fees/reconciliations${campusId ? `?campusId=${encodeURIComponent(campusId)}` : ""}`, { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    if (response.ok && json.success) setItems(json.data);
  }, [campusId]);
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
  if (!items || items.length === 0) return null;
  return <section className="sk-panel space-y-4 p-5" data-reconciliations>
    <h3 className="flex items-center gap-2 text-sm font-black"><Landmark className="size-4 text-primary" aria-hidden="true" />{ui("Bank reconciliations")}</h3>
    {items.map(rec => {
      const currency = rec.matched[0]?.currency || rec.unmatched[0]?.currency || "PKR", fmt = (amount: number) => money(amount, currency), r = rec.report;
      return <article key={rec.id} className="space-y-3 rounded-2xl border border-border p-4" data-reconciliation={rec.id} data-reconciliation-status={rec.status}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold">{rec.bankAccount} · {rec.from ? date(rec.from) : ""} – {rec.to ? date(rec.to) : ""}</p>
          <span className="rounded-lg bg-muted px-2 py-1 text-[10px] font-black uppercase">{rec.status === "posted" ? ui("Posted") : rec.status === "reversed" ? ui("Reversed") : ui("Awaiting review")}</span>
        </div>
        <p className={`flex flex-wrap items-center gap-2 text-xs ${r.balanced ? "text-ink-muted" : "font-bold text-destructive"}`} data-conservation={r.balanced ? "balanced" : "difference"}><Scale className="size-3.5" aria-hidden="true" />
          <bdi>{ui("Received {0} = allocated {1} + credit {2} + unallocated {3}", [fmt(r.received), fmt(r.allocated), fmt(r.credited), fmt(r.unallocated)])}</bdi>{r.balanced ? "" : ` · ${ui("Unexplained difference {0}", [fmt(r.difference)])}`}</p>
        {rec.unmatched.length > 0 && <div className="space-y-1"><p className="text-[10px] font-black uppercase text-ink-subtle">{ui("Unallocated — stays visible until reviewed")}</p><ul className="space-y-1 text-xs" data-unallocated>{rec.unmatched.map(row => <li key={row.rowNumber} className="rounded-lg bg-amber-50 px-3 py-1.5">{date(row.date)} · <bdi>{fmt(row.amountMinor)}</bdi> · <bdi>{row.description}</bdi></li>)}</ul></div>}
        {(rec.posting?.exceptions ?? []).length > 0 && <ul className="space-y-1 text-xs" data-reconciliation-exceptions>{rec.posting!.exceptions!.map(item => <li key={item.rowNumber} className="rounded-lg bg-rose-50 px-3 py-1.5">{ui("Row {0}", [item.rowNumber])} · <bdi>{fmt(item.amountMinor)}</bdi> · {ui(item.reason)}</li>)}</ul>}
        {rec.matched.some(row => row.manualMatch) && <p className="text-xs text-ink-muted">{ui("{0} matched by hand with a recorded reason.", [rec.matched.filter(row => row.manualMatch).length])}</p>}
        {rec.status === "pending" && rec.matched.length > 0 && <Button onClick={() => setPosting(rec)} disabled={busy}>{ui("Post {0} matched payment(s)", [rec.matched.length])}</Button>}
      </article>;
    })}
    <ConfirmAction open={Boolean(posting)} title={ui("Post matched payments?")} description={posting ? ui("{0} matched transaction(s) totalling {1} become payments with receipts. {2} stays unallocated for review. This cannot be posted twice.", [posting.matched.length, money(posting.report.allocated, posting.matched[0]?.currency || "PKR"), money(posting.report.unallocated, posting.matched[0]?.currency || "PKR")]) : ""}
      confirmLabel={ui("Post payments")} tone="primary" busy={busy} onConfirm={() => void post()} onCancel={() => setPosting(null)} />
  </section>;
}

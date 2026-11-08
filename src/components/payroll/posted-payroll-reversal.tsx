"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { DeskSection } from "@/components/ui/desk";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { payrollReversalEnabled } from "@/lib/feature-flags";

type Line = { id: string; status: string; net: number; user?: { fullName: string } | null };

/** SKAI-1506: posted (PAID) payroll lines for a month, each with "Reverse posted payroll expense" (asks for a reason). */
export function PostedPayrollReversal({ enabled = payrollReversalEnabled(), currency = "PKR" }: { enabled?: boolean; currency?: string }) {
  const ui = useUiText();
  const { money } = useLocaleFormat();
  const now = new Date();
  const [period, setPeriod] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [target, setTarget] = useState<Line | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const load = useCallback(async () => {
    const [year, month] = period.split("-");
    const r = await fetch(`/api/payroll?month=${Number(month)}&year=${year}`, { cache: "no-store" }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setLines(r?.ok ? (j?.data?.run?.lines ?? j?.run?.lines ?? []).filter((l: Line) => l.status === "PAID") : []);
  }, [period]);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  if (!enabled) return null;
  const reverse = async (reason?: string) => {
    if (!target) return;
    setBusy(true);
    const key = `payroll-reverse-${target.id}-${Date.now()}`;
    const r = await fetch("/api/payroll/lines", { method: "PATCH", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body: JSON.stringify({ id: target.id, action: "reverse", reason }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false); setTarget(null);
    setNotice(r?.ok ? { tone: "success", text: ui("Payroll expense reversed. An opposite ledger entry was posted.") } : { tone: "danger", text: j?.error ?? ui("The reversal could not be posted. Try again.") });
    void load();
  };
  return (
    <DeskSection title={ui("Posted payroll expenses")} icon={RotateCcw} data-payroll-reversal>
      <div className="space-y-3">
        <Input type="month" aria-label={ui("Payroll month")} value={period} onChange={(e) => setPeriod(e.target.value)} className="max-w-48" />
        {notice ? <Alert tone={notice.tone} compact>{notice.text}</Alert> : null}
        {lines && !lines.length ? <EmptyState title={ui("No posted payroll expenses for this month.")} /> : null}
        <ul className="divide-y divide-border">
          {(lines ?? []).map((l) => (
            <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="text-ink-strong"><bdi>{l.user?.fullName ?? l.id.slice(0, 8)}</bdi> · <span dir="ltr">{money(l.net, currency)}</span></span>
              <Button type="button" size="sm" variant="outline" data-action="reverse-payroll" disabled={busy} onClick={() => setTarget(l)}>{ui("Reverse posted payroll expense")}</Button>
            </li>
          ))}
        </ul>
      </div>
      <ConfirmAction open={!!target} tone="danger" busy={busy} title={ui("Reverse posted payroll expense")} description={ui("This posts an opposite, linked ledger entry and marks the line reversed. The original entry is kept.")}
        confirmLabel={ui("Reverse expense")} requireReason={{ label: ui("Reason for the reversal") }} onConfirm={reverse} onCancel={() => setTarget(null)} />
    </DeskSection>
  );
}

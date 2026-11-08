"use client";

import { useCallback, useEffect, useState } from "react";
import { BookX } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { DeskSection } from "@/components/ui/desk";
import { EmptyState } from "@/components/ui/empty-state";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { libraryChargeActionsEnabled } from "@/lib/feature-flags";

type Charge = { id: string; kind: string; amount: number; currency: string; reason: string | null; memberName: string | null; memberNo: string | null };

/** SKAI-1669: the fees office's queue of library charges handed over by the desk, with Accept and Return to library. */
export function HandedLibraryCharges({ enabled = libraryChargeActionsEnabled() }: { enabled?: boolean }) {
  const ui = useUiText();
  const { money } = useLocaleFormat();
  const [charges, setCharges] = useState<Charge[] | null>(null);
  const [returning, setReturning] = useState<Charge | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/fees/library-charges", { cache: "no-store" }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setCharges(r?.ok ? j?.data ?? [] : []);
  }, []);
  useEffect(() => { if (enabled) void load(); }, [enabled, load]);
  if (!enabled) return null;
  const act = async (chargeId: string, action: "accept" | "return", reason?: string) => {
    setBusy(true);
    const r = await fetch("/api/fees/library-charges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chargeId, action, reason }) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false); setReturning(null);
    setNotice(r?.ok ? { tone: "success", text: ui(action === "accept" ? "Charge accepted. A fee invoice was posted to the family." : "Charge returned to the library.") } : { tone: "danger", text: j?.error ?? ui("The charge could not be updated. Try again.") });
    void load();
  };
  return (
    <DeskSection title={ui("Library charges handed to fees")} icon={BookX} data-library-charges-queue>
      <div className="space-y-3">
        {notice ? <Alert tone={notice.tone} compact>{notice.text}</Alert> : null}
        {charges && !charges.length ? <EmptyState title={ui("No library charges are waiting.")} /> : null}
        <ul className="divide-y divide-border">
          {(charges ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
              <span className="text-ink-strong"><bdi>{c.memberName ?? c.memberNo ?? "—"}</bdi> · <span dir="ltr">{money(c.amount, c.currency)}</span>{c.reason ? <span className="block text-ink-muted"><bdi>{c.reason}</bdi></span> : null}</span>
              <span className="flex gap-2">
                <Button type="button" size="sm" data-action="accept-library-charge" disabled={busy} onClick={() => void act(c.id, "accept")}>{ui("Accept")}</Button>
                <Button type="button" size="sm" variant="outline" data-action="return-library-charge" disabled={busy} onClick={() => setReturning(c)}>{ui("Return to library")}</Button>
              </span>
            </li>
          ))}
        </ul>
      </div>
      <ConfirmAction open={!!returning} tone="warning" busy={busy} title={ui("Return to library")} description={ui("The charge goes back to the lending desk with your reason.")}
        confirmLabel={ui("Return to library")} requireReason={{ label: ui("Why it goes back"), minLength: 8 }} onConfirm={(reason) => returning ? act(returning.id, "return", reason) : undefined} onCancel={() => setReturning(null)} />
    </DeskSection>
  );
}

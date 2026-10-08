"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";


type RequestRow = {
  id: string;
  kind: string;
  state: string;
  requestedPlan: string | null;
  effectiveAt: string | null;
  details: Record<string, unknown>;
  createdAt: string;
  school: { id: string; name: string; plan: string };
  requestedBy: { id: string; fullName: string; email: string };
};

export function SubscriptionRequestReview() {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/owner/subscription-requests", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load subscription requests");
    setRequests(data.requests);
  }, []);
  useEffect(() => { void load().catch(error => toast.error(error.message)); }, [load]);

  const review = async (row: RequestRow, decision: "APPROVE_REQUEST" | "DECLINE_REQUEST") => {
    setBusy(row.id);
    try {
      const response = await fetch("/api/owner/subscription-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: row.id, decision, reason: reasons[row.id] || "Reviewed under current commercial policy." }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Review failed");
      toast.success(data.note || "Review recorded");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Review failed");
    } finally { setBusy(null); }
  };

  return <div className="h-full overflow-y-auto p-6">
    <h2 className="text-2xl font-bold">Subscription requests</h2>
    <p className="mt-1 text-sm text-ink-muted">Review plan changes, cancellation requests, refunds, and recovery requests. A refund review never submits a provider refund.</p>
    {requests.length === 0 ? <p className="mt-6 rounded-xl border p-5">No requests need review.</p> : <div className="mt-5 space-y-4">
      {requests.map(row => <article key={row.id} className="space-y-3 rounded-xl border bg-white p-5">
        <div className="flex flex-wrap justify-between gap-2">
          <div><h3 className="font-semibold">{row.kind.replaceAll("_", " ")} · {row.school.name}</h3><p className="text-sm text-ink-muted">Current {row.school.plan}{row.requestedPlan ? ` → ${row.requestedPlan}` : ""} · Requested by {row.requestedBy.fullName} · {new Date(row.createdAt).toLocaleString()}</p></div>
          {row.effectiveAt && <p className="text-sm">Effective date: {new Date(row.effectiveAt).toLocaleDateString()}</p>}
        </div>
        <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs">{JSON.stringify(row.details, null, 2)}</pre>
        <label className="block text-sm">Review reason<Textarea className="mt-1 block w-full p-2" value={reasons[row.id] || ""} onChange={event => setReasons(previous => ({ ...previous, [row.id]: event.target.value }))} placeholder="Reason recorded in the audit log" /></label>
        <div className="flex gap-2"><Button variant="default" disabled={busy === row.id}  onClick={() => void review(row, "APPROVE_REQUEST")}>Approve request</Button><Button variant="outline" disabled={busy === row.id}  onClick={() => void review(row, "DECLINE_REQUEST")}>Decline request</Button></div>
      </article>)}
    </div>}
  </div>;
}

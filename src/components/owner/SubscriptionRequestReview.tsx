"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "@/components/ui/toast";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Inbox } from "lucide-react";


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
        body: JSON.stringify({ requestId: row.id, decision, reason: (reasons[row.id] || "").trim() }),
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
    <h2 className="text-2xl font-bold tracking-tight text-ink-strong sm:text-3xl">Subscription requests</h2>
    <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-muted">Review plan changes, cancellation requests, refunds, and recovery requests. A refund review never submits a provider refund.</p>
    {requests.length === 0 ? <div className="mt-6"><EmptyState size="sm" icon={Inbox} title="No requests need review" description="New plan, cancellation, refund and recovery requests from schools appear here." /></div> : <div className="mt-5 space-y-4">
      {requests.map(row => <article key={row.id} className="sk-panel space-y-3 p-4 sm:p-5">
        <div className="flex flex-wrap justify-between gap-2">
          <div className="min-w-0"><h3 className="text-base font-semibold text-ink-strong">{row.kind.replaceAll("_", " ")} · {row.school.name}</h3><p className="text-sm text-ink-muted">Current {row.school.plan}{row.requestedPlan ? ` → ${row.requestedPlan}` : ""} · Requested by {row.requestedBy.fullName} · {new Date(row.createdAt).toLocaleString()}</p></div>
          {row.effectiveAt && <p className="text-sm">Effective date: {new Date(row.effectiveAt).toLocaleDateString()}</p>}
        </div>
        <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-subtle p-3 text-xs">{JSON.stringify(row.details, null, 2)}</pre>
        <label className="block text-sm font-semibold">Review reason<Textarea className="mt-1 block w-full p-2" value={reasons[row.id] || ""} onChange={event => setReasons(previous => ({ ...previous, [row.id]: event.target.value }))} placeholder="Reason recorded in the audit log" /></label>
        {(reasons[row.id] || "").trim().length < 8 ? <p className="text-xs text-ink-muted">Write a reason of at least 8 characters; it is recorded in the audit log.</p> : null}
        <div className="flex flex-wrap gap-2"><Button variant="default" loading={busy === row.id} disabled={busy === row.id || (reasons[row.id] || "").trim().length < 8} onClick={() => void review(row, "APPROVE_REQUEST")}>Approve request</Button><Button variant="outline" disabled={busy === row.id || (reasons[row.id] || "").trim().length < 8} onClick={() => void review(row, "DECLINE_REQUEST")}>Decline request</Button></div>
      </article>)}
    </div>}
    <ProviderEventQueue />
  </div>;
}

type ProviderEvent = { eventId: string; provider: string; eventType: string; state: string; error: string | null; schoolId: string | null; attemptCount: number; receivedAt: string };

/** SKO-373: verified provider events that failed or could not be applied automatically. */
function ProviderEventQueue() {
  const [events, setEvents] = useState<ProviderEvent[] | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    const response = await fetch("/api/owner/provider-events", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load provider events");
    setEvents(data.events);
  }, []);
  useEffect(() => { void load().catch(error => toast.error(error.message)); }, [load]);
  const resolve = async (row: ProviderEvent) => {
    setBusy(row.eventId);
    try {
      const response = await fetch("/api/owner/provider-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: row.eventId, note: (notes[row.eventId] || "").trim() }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not resolve the event");
      toast.success("Event marked as handled");
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not resolve the event"); }
    finally { setBusy(null); }
  };
  return <section className="mt-10" aria-labelledby="provider-events-title" data-provider-events>
    <h2 id="provider-events-title" className="text-lg font-bold text-ink-strong">Payment provider events needing review</h2>
    <p className="mt-1 text-sm text-ink-muted">Verified events the system did not apply automatically. Marking one handled records your note only; correct any billing state through a reviewed request or the provider.</p>
    {events === null ? <p role="status" className="mt-4 text-sm">Loading events…</p> : events.length === 0 ? <div className="mt-4"><EmptyState size="sm" icon={Inbox} title="No provider events need review" description="Verified provider events that could not be applied automatically appear here." /></div> : <div className="mt-4 space-y-3">
      {events.map(row => <article key={row.eventId} className="sk-panel space-y-2 p-4" data-provider-event={row.eventId} data-state={row.state}>
        <p className="flex flex-wrap items-center gap-2 font-semibold text-ink-strong">{row.provider} · {row.eventType} <Badge variant={row.state === "NEEDS_REVIEW" ? "warning" : "danger"} dot>{row.state === "NEEDS_REVIEW" ? "Needs review" : "Failed"}</Badge></p>
        <p className="text-xs text-ink-subtle tabular-nums"><bdi>{row.eventId}</bdi> · {new Date(row.receivedAt).toLocaleString()} · attempts {row.attemptCount}{row.schoolId ? ` · institution ${row.schoolId}` : " · no matching institution"}</p>
        {row.error ? <p className="text-sm">{row.error}</p> : null}
        <label className="block text-sm font-semibold">How was this handled?<Textarea className="mt-1 block w-full p-2" value={notes[row.eventId] || ""} onChange={event => setNotes(previous => ({ ...previous, [row.eventId]: event.target.value }))} /></label>
        <Button variant="outline" loading={busy === row.eventId} disabled={busy === row.eventId || (notes[row.eventId] || "").trim().length < 8} onClick={() => void resolve(row)}>Mark handled</Button>
      </article>)}
    </div>}
  </section>;
}

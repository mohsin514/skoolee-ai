"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftRight, CalendarPlus, CircleSlash, CreditCard, Inbox, PlayCircle, ReceiptText, RefreshCw, RotateCcw, Webhook, type LucideIcon } from "lucide-react";
import { useLocale, useUiText } from "@/components/locale/LocaleProvider";
import { localeTag } from "@/lib/locale/package";
import { getPlanLimits } from "@/config/plans";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { DeskPill, DeskRowIcon, DeskStats, RelativeTime, StatTile, deskRow, urgencyFirst } from "@/components/ui/desk";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert } from "@/components/ui/alert";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonList } from "@/components/ui/skeleton";
import { PAGE_CARD_BODY } from "@/components/role-dashboard/RoleShellSkeleton";
import { cn } from "@/lib/utils";

/**
 * Subscription requests (owner console, §4.4b): a queue. Each row carries one Approve / Decline pair; either
 * decision asks for the reason recorded in the audit log in a ConfirmAction (§4.5.5), never a free-floating
 * textarea under the buttons. A refund review never submits a provider refund. A failed load is an inline
 * ErrorState with retry (R4).
 */
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
type Decision = "APPROVE_REQUEST" | "DECLINE_REQUEST";

const KIND_LABEL: Record<string, string> = { PLAN_CHANGE: "Plan change", CANCELLATION: "Cancellation", REFUND: "Refund review", RENEWAL_RECOVERY: "Payment recovery", PAYMENT_REPORT: "Payment report", GRACE_EXTENSION: "Grace extension", RESUME: "Resumed subscription" };
const KIND_ICON: Record<string, LucideIcon> = { PLAN_CHANGE: ArrowLeftRight, CANCELLATION: CircleSlash, REFUND: RotateCcw, RENEWAL_RECOVERY: CreditCard, PAYMENT_REPORT: ReceiptText, GRACE_EXTENSION: CalendarPlus, RESUME: PlayCircle };
const planName = (plan: string | null) => (plan ? getPlanLimits(plan).name : "");

function useInstant() {
  const tag = localeTag(useLocale());
  return {
    dateTime: (value: string) => new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)),
    date: (value: string) => new Intl.DateTimeFormat(tag, { dateStyle: "medium" }).format(new Date(value)),
  };
}

export function SubscriptionRequestReview() {
  const t = useUiText();
  const when = useInstant();
  const [requests, setRequests] = useState<RequestRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<{ row: RequestRow; decision: Decision } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadFailed(false);
    try {
      const response = await fetch("/api/owner/subscription-requests", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error);
      setRequests(data.requests ?? []);
    } catch {
      setLoadFailed(true);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const review = async (row: RequestRow, decision: Decision, reason: string) => {
    setBusy(row.id);
    try {
      const response = await fetch("/api/owner/subscription-requests", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: row.id, decision, reason: reason.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error);
      toast.success(decision === "APPROVE_REQUEST" ? t("Request approved. The school is told.") : t("Request declined. The school is told."));
      setDeciding(null);
      await load();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, t("The review could not be saved. Please try again.")));
    } finally { setBusy(null); }
  };

  // The scrolling body of the shell's one page card (addendum 2026-10-22).
  return <div className={cn("custom-scrollbar min-h-0 flex-1 space-y-6 overflow-y-auto", PAGE_CARD_BODY)}>
    <PageHeader
      eyebrow="Platform operations"
      icon={ReceiptText}
      title="Subscription requests"
      description="Plan changes, cancellations, refunds and recovery requests from schools. A refund review never submits a provider refund."
      secondaryActions={[{ id: "refresh", label: "Refresh", icon: RefreshCw, loading, onClick: () => { void load(); setRefreshVersion(value => value + 1); } }]}
    />
    {requests?.length ? <DeskStats data-subscription-pulse>
      <StatTile index={0} icon={Inbox} tone="warning" value={requests.length} label={t("Waiting for review")} />
      <StatTile index={1} icon={CircleSlash} tone={requests.some(row => row.kind === "CANCELLATION") ? "danger" : "neutral"} value={requests.filter(row => row.kind === "CANCELLATION").length} label={t("Cancellation")} />
      <StatTile index={2} icon={RotateCcw} tone={requests.some(row => row.kind === "REFUND") ? "danger" : "neutral"} value={requests.filter(row => row.kind === "REFUND").length} label={t("Refund review")} />
      <StatTile index={3} icon={ArrowLeftRight} tone="brand" value={requests.filter(row => row.kind === "PLAN_CHANGE").length} label={t("Plan change")} />
    </DeskStats> : null}
    {loadFailed ? (
      <div className="sk-panel"><ErrorState title={t("Subscription requests did not load")} description={t("Check your connection and try again.")} onRetry={() => void load()} /></div>
    ) : requests === null ? (
      <SkeletonList rows={3} label={t("Loading subscription requests")} />
    ) : requests.length === 0 ? (
      <div className="sk-panel"><EmptyState size="sm" icon={Inbox} title={t("No requests need review")} description={t("New plan, cancellation, refund and recovery requests from schools appear here.")} /></div>
    ) : (
      <ul className="space-y-3" aria-label={t("Subscription requests")}>
        {/* Money leaving or a school leaving comes first: refunds and cancellations, then everything else. */}
        {urgencyFirst(requests, row => row.kind === "REFUND" || row.kind === "CANCELLATION" ? 0 : 1).map(row => <li key={row.id} data-tone={row.kind === "REFUND" || row.kind === "CANCELLATION" ? "danger" : "warning"} className={`${deskRow} space-y-3`} data-subscription-request={row.kind}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 basis-64 items-start gap-3">
            <DeskRowIcon icon={KIND_ICON[row.kind] ?? Inbox} />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink-strong">{t(KIND_LABEL[row.kind] ?? row.kind)} · <bdi>{row.school.name}</bdi></h2>
              <p className="mt-0.5 text-sm text-ink-muted">
                {t("Current plan")}: <bdi>{planName(row.school.plan)}</bdi>
                {row.requestedPlan ? <> <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span> <bdi>{planName(row.requestedPlan)}</bdi></> : null}
                {" · "}{t("Requested by {0}", [row.requestedBy.fullName])} · <bdi><RelativeTime iso={row.createdAt} full={when.dateTime(row.createdAt)} /></bdi>
              </p>
              {row.effectiveAt ? <p className="mt-0.5 text-sm text-ink-muted">{t("Effective date")}: <bdi>{when.date(row.effectiveAt)}</bdi></p> : null}
            </div>
            </div>
            <DeskPill tone="warning">{t("Waiting for review")}</DeskPill>
          </div>
          <details className="rounded-xl border border-border-subtle bg-surface-subtle p-3 text-xs">
            <summary className="cursor-pointer font-semibold text-ink">{t("Request details")}</summary>
            <pre dir="ltr" className="mt-2 max-h-44 overflow-auto whitespace-pre-wrap text-ink-muted">{JSON.stringify(row.details, null, 2)}</pre>
          </details>
          <div className="flex flex-wrap gap-2">
            <Button type="button" loading={busy === row.id && deciding?.decision === "APPROVE_REQUEST"} disabled={busy === row.id} onClick={() => setDeciding({ row, decision: "APPROVE_REQUEST" })}>{t("Approve")}</Button>
            <Button type="button" variant="outline" disabled={busy === row.id} onClick={() => setDeciding({ row, decision: "DECLINE_REQUEST" })}>{t("Decline")}</Button>
          </div>
        </li>)}
      </ul>
    )}
    <ProviderEventQueue refreshVersion={refreshVersion} />
    <ConfirmAction
      open={Boolean(deciding)}
      tone={deciding?.decision === "DECLINE_REQUEST" ? "danger" : "primary"}
      title={deciding?.decision === "DECLINE_REQUEST" ? t("Decline this request?") : t("Approve this request?")}
      description={deciding?.decision === "DECLINE_REQUEST"
        ? t("The school is told the request was declined, with your reason. Their plan does not change.")
        : t("The school is told the request was approved. A plan change still needs their checkout or the provider to take effect.")}
      confirmLabel={deciding?.decision === "DECLINE_REQUEST" ? t("Decline") : t("Approve")}
      cancelLabel={t("Keep editing")}
      requireReason={{ label: t("Reason recorded in the audit log"), minLength: 8 }}
      busy={Boolean(deciding) && busy === deciding?.row.id}
      onCancel={() => setDeciding(null)}
      onConfirm={(reason?: string) => { const target = deciding; if (!target) return; return review(target.row, target.decision, reason ?? ""); }}
    />
  </div>;
}

type ProviderEvent = { eventId: string; provider: string; eventType: string; state: string; error: string | null; schoolId: string | null; attemptCount: number; receivedAt: string };

/** SKO-373: verified provider events that failed or could not be applied automatically. */
function ProviderEventQueue({ refreshVersion }: { refreshVersion: number }) {
  const t = useUiText();
  const when = useInstant();
  const [events, setEvents] = useState<ProviderEvent[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const response = await fetch("/api/owner/provider-events", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error);
      setEvents(data.events ?? []);
    } catch {
      setLoadFailed(true);
    }
  }, []);
  useEffect(() => { void load(); }, [load, refreshVersion]);
  const resolve = async (row: ProviderEvent) => {
    setBusy(row.eventId);
    try {
      const response = await fetch("/api/owner/provider-events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: row.eventId, note: (notes[row.eventId] || "").trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error);
      toast.success(t("Event marked as handled"));
      await load();
    } catch (error) { toast.error(friendlyErrorMessage(error, t("Could not resolve the event"))); }
    finally { setBusy(null); }
  };
  return <section aria-labelledby="provider-events-title" data-provider-events className="space-y-4">
    <div className="flex min-w-0 items-start gap-3">
      <DeskRowIcon icon={Webhook} />
      <div className="min-w-0">
      <h2 id="provider-events-title" className="text-lg font-bold text-ink-strong">{t("Payment provider events needing review")}</h2>
      <p className="mt-1 text-sm text-ink-muted">{t("Verified events the system did not apply automatically. Marking one handled records your note only; correct any billing state through a reviewed request or the provider.")}</p>
      </div>
    </div>
    {loadFailed ? <div className="sk-panel"><ErrorState title={t("Provider events did not load")} description={t("Check your connection and try again.")} onRetry={() => void load()} /></div>
      : events === null ? <SkeletonList rows={3} label={t("Loading events")} />
      : events.length === 0 ? <div className="sk-panel"><EmptyState size="sm" icon={Inbox} title={t("No provider events need review")} description={t("Verified provider events that could not be applied automatically appear here.")} /></div>
      : <ul className="space-y-3">
        {events.map(row => <li key={row.eventId} data-tone={row.state === "NEEDS_REVIEW" ? "warning" : "danger"} className={`${deskRow} space-y-2`} data-provider-event={row.eventId} data-state={row.state}>
          <p className="flex flex-wrap items-center gap-2 font-semibold text-ink-strong"><bdi dir="ltr">{row.provider} · {row.eventType}</bdi> <DeskPill tone={row.state === "NEEDS_REVIEW" ? "warning" : "danger"}>{row.state === "NEEDS_REVIEW" ? t("Needs review") : t("Failed")}</DeskPill></p>
          <p className="text-xs tabular-nums text-ink-subtle"><bdi dir="ltr" className="break-all">{row.eventId}</bdi> · <bdi><RelativeTime iso={row.receivedAt} full={when.dateTime(row.receivedAt)} /></bdi> · {t("{0} attempts", [row.attemptCount])} · {row.schoolId ? <>{t("Institution")} <bdi dir="ltr">{row.schoolId}</bdi></> : t("No matching institution")}</p>
          {row.error ? <Alert tone="danger" compact live="off"><span dir="auto">{row.error}</span></Alert> : null}
          <FormField name={`provider-note-${row.eventId}`} label={t("How was this handled?")} hint={t("At least 8 characters. Recorded with the event.")}>
            <Textarea className="w-full" value={notes[row.eventId] || ""} onChange={event => setNotes(previous => ({ ...previous, [row.eventId]: event.target.value }))} />
          </FormField>
          <Button variant="outline" type="button" loading={busy === row.eventId} disabled={busy === row.eventId || (notes[row.eventId] || "").trim().length < 8} onClick={() => void resolve(row)}>{t("Mark handled")}</Button>
        </li>)}
      </ul>}
  </section>;
}

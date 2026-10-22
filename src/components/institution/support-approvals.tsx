"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import { useLocaleFormat, useUiText } from "@/components/locale/LocaleProvider";
import { useConsoleAccess } from "@/components/nav/ViewGate";
import { Alert } from "@/components/ui/alert";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { SkeletonList } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { friendlyErrorMessage, toast } from "@/components/ui/toast";

/**
 * Vendor support access requests for this school (M10): the institution authority approves, declines or
 * revokes each grant — the group admin in `/super?view=approvals&tab=support`, the standalone school admin
 * in `/admin?view=approvals&tab=support`. Deciding needs two-step sign-in (G11); without it the decisions
 * are not offered and one Alert says how to turn it on (F28), instead of buttons the server would refuse.
 */
type Grant = {
  id: string; purpose: string; status: string; scope: string[]; actions: string[]; expiresAt: string;
  emergencyReason: string | null; reviewDueAt: string | null; reviewedAt: string | null;
  incident: { reference: string; impact: string };
};
type Decision = "approve" | "reject" | "revoke" | "review";

const DOMAIN_LABELS: Record<string, string> = { school_profile: "School profile", operations: "Operations", users: "Staff directory", finance: "Finance", learning: "Learning records" };
const STATUS_LABELS: Record<string, string> = { pending: "Waiting for you", approved: "Approved", active: "Active", rejected: "Declined", revoked: "Revoked", expired: "Expired", closed: "Closed" };
const statusVariant = (status: string): NonNullable<BadgeProps["variant"]> => status === "active" ? "success" : status === "pending" ? "warning" : "neutral";

export function SupportApprovalsPanel() {
  const t = useUiText();
  // R7: support windows in the school's language, numbering system and timezone.
  const { dateTime } = useLocaleFormat();
  const access = useConsoleAccess();
  const mfaReady = !access.ready || access.has("mfaVerified");
  const [items, setItems] = useState<Grant[]>([]);
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; decision: Decision } | null>(null);
  const [confirm, setConfirm] = useState<{ item: Grant; decision: "reject" | "revoke" } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/super/support-grants", { cache: "no-store" });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(json.error);
      setItems(json.data || []);
    } catch (error) {
      setLoadError(friendlyErrorMessage(error, t("Support requests could not be loaded right now. Please try again.")));
    } finally {
      setLoading(false);
    }
  }, [t]);
  useEffect(() => { void refresh(); }, [refresh]);

  const decide = async (item: Grant, decision: Decision) => {
    if (pending) return;
    setPending({ id: item.id, decision });
    try {
      const response = await fetch("/api/super/support-grants", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grantId: item.id, decision, evidence: evidence[item.id] }) });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) { toast.error(friendlyErrorMessage(json.error, t("Could not update support grant"))); return; }
      toast.success(decision === "approve" ? t("Support access approved") : decision === "reject" ? t("Support request rejected") : decision === "revoke" ? t("Support access revoked") : t("Emergency review recorded"));
      await refresh();
    } catch (error) {
      toast.error(friendlyErrorMessage(error, t("Could not update support grant")));
    } finally {
      setPending(null);
    }
  };
  const busy = (item: Grant, decision: Decision) => pending?.id === item.id && pending?.decision === decision;

  return (
    <div className="space-y-4" data-support-approvals>
      {!mfaReady ? (
        <Alert
          tone="warning"
          icon={ShieldAlert}
          title={t("Turn on two-step sign-in")}
          actions={<Link href="/account/security" className={buttonVariants({ variant: "outline", size: "sm" })}>{t("Turn on two-step sign-in")}</Link>}
          data-mfa-required
        >
          {t("Approving, declining or revoking support access needs two-step sign-in on your account.")}
        </Alert>
      ) : null}
      {loading && items.length === 0 ? (
        <SkeletonList rows={3} label={t("Loading support requests")} />
      ) : loadError ? (
        <div className="sk-panel">
          <ErrorState title={t("Could not load support approvals")} description={loadError} onRetry={() => void refresh()} />
        </div>
      ) : items.length === 0 ? (
        <div className="sk-panel">
          <EmptyState
            icon={ShieldCheck}
            title={t("No support requests need review")}
            description={t(access.has("groupConsole") ? "When SkooleeAI support asks to access one of your campuses, the request appears here for your decision." : "When SkooleeAI support asks to access this school, the request appears here for your decision.")}
          />
        </div>
      ) : (
        <ul className="sk-stagger space-y-4">
          {items.map((item) => (
            <li key={item.id} className="sk-panel space-y-4 p-4 sm:p-5" data-support-grant={item.status}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink-strong"><bdi dir="ltr">{item.incident.reference}</bdi></p>
                    <Badge variant={statusVariant(item.status)} size="sm" dot>{t(STATUS_LABELS[item.status] ?? item.status)}</Badge>
                    {item.emergencyReason ? <Badge variant="warning" size="sm" dot>{t("Emergency access")}</Badge> : null}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink" dir="auto">{item.purpose}</p>
                  <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-[auto_1fr]">
                    <dt className="font-semibold text-ink-muted">{t("Impact")}</dt>
                    <dd className="min-w-0 text-ink" dir="auto">{item.incident.impact}</dd>
                    <dt className="font-semibold text-ink-muted">{t("Domains")}</dt>
                    <dd className="min-w-0 text-ink">{item.scope.map((domain) => t(DOMAIN_LABELS[domain] || domain)).join(", ")}</dd>
                    <dt className="font-semibold text-ink-muted">{t("Actions")}</dt>
                    <dd className="min-w-0 text-ink">{item.actions.map((action) => t(action[0].toUpperCase() + action.slice(1))).join(", ")}</dd>
                    <dt className="font-semibold text-ink-muted">{t("Expires")}</dt>
                    <dd className="min-w-0 tabular-nums text-ink"><bdi>{dateTime(item.expiresAt)}</bdi></dd>
                  </dl>
                </div>
                {item.status === "pending" && mfaReady ? (
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                    <Button type="button" loading={busy(item, "approve")} disabled={Boolean(pending)} onClick={() => void decide(item, "approve")} className="flex-1 sm:flex-none">{t("Approve")}</Button>
                    <Button type="button" variant="outline" disabled={Boolean(pending)} onClick={() => setConfirm({ item, decision: "reject" })} className="flex-1 sm:flex-none">{t("Decline")}</Button>
                  </div>
                ) : null}
              </div>
              {item.emergencyReason ? (
                <Alert tone="warning" title={t("Emergency justification")} live="off">
                  <p dir="auto">{item.emergencyReason}</p>
                  {item.reviewDueAt && !item.reviewedAt ? <p className="mt-2 font-semibold">{t("Review due")}: <bdi>{dateTime(item.reviewDueAt)}</bdi></p> : null}
                </Alert>
              ) : null}
              {item.status === "active" && !item.reviewedAt && item.emergencyReason && mfaReady ? (
                <div className="space-y-3">
                  <FormField name={`review-evidence-${item.id}`} label={t("Review evidence")} hint={t("At least 12 characters: what you checked and what you found.")}>
                    <Textarea className="min-h-20 w-full" value={evidence[item.id] || ""} onChange={(event) => setEvidence((current) => ({ ...current, [item.id]: event.target.value }))} />
                  </FormField>
                  <Button variant="outline" type="button" loading={busy(item, "review")} disabled={Boolean(pending) || (evidence[item.id] || "").trim().length < 12} onClick={() => void decide(item, "review")}>{t("Record emergency review")}</Button>
                </div>
              ) : null}
              {item.status === "active" && mfaReady ? (
                <div className="flex justify-start border-t border-border-subtle pt-4">
                  <Button variant="outline" type="button" disabled={Boolean(pending)} onClick={() => setConfirm({ item, decision: "revoke" })}>{t("Revoke access now")}</Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <ConfirmAction
        open={Boolean(confirm)}
        title={confirm?.decision === "revoke" ? t("Revoke support access?") : t("Decline this support request?")}
        description={confirm?.decision === "revoke"
          ? t("Support loses access to this school straight away, and any support actions still queued are cancelled.")
          : t("SkooleeAI support is told the request was declined. They can send a new request if they still need access.")}
        confirmLabel={confirm?.decision === "revoke" ? t("Revoke access now") : t("Decline")}
        cancelLabel={t("Keep editing")}
        tone="danger"
        busy={Boolean(confirm) && busy(confirm!.item, confirm!.decision)}
        onCancel={() => setConfirm(null)}
        onConfirm={() => { const target = confirm; if (!target) return; void decide(target.item, target.decision).finally(() => setConfirm(null)); }}
      />
    </div>
  );
}

"use client";
import { AlertTriangle, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TaskStatus } from "@/components/ui/task-patterns";
import { formatInstant, type LocalePackage } from "@/lib/locale/package";
import { fillCopy, type SecurityCopy } from "@/lib/auth/security-ui-copy";

/** GET /api/account/mfa. No secret, code or hash is ever part of it. */
export type TwoFactorStatus = {
  enabled: boolean;
  required: boolean;
  enrolledAt: string | null;
  recoveryCodesRemaining: number;
  recoveryCodesTotal: number;
  authenticatorReadable: boolean | null;
};

/** A calm card for one group inside the Settings modal: neutral surface, hairline border, soft lift. */
export const securityCardClass = "rounded-3xl border border-border-subtle bg-white p-5 shadow-[0_1px_2px_rgba(120,70,180,0.04),0_10px_28px_-18px_rgba(55,27,77,0.18)] sm:p-6";

const LOW_CODES = 3;

export function TwoFactorCard({ status, t, locale, onToggle, onChange, onRegenerate }: {
  status: TwoFactorStatus;
  t: SecurityCopy;
  locale: LocalePackage;
  onToggle: (next: boolean) => void;
  onChange: () => void;
  onRegenerate: () => void;
}) {
  const { enabled, required } = status;
  const low = enabled && status.recoveryCodesRemaining <= LOW_CODES;

  return (
    <section aria-labelledby="security-2fa-heading" className={securityCardClass}>
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-primary">
          <ShieldCheck aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 id="security-2fa-heading" className="text-base font-bold tracking-tight text-ink-strong">{t.twoFactorTitle}</h4>
            <Badge variant={enabled ? "success" : "outline"}>{enabled ? t.on : t.off}</Badge>
          </div>
          <p className="mt-1 text-sm font-normal leading-relaxed text-ink-muted">{enabled ? t.twoFactorOnBody : t.twoFactorOffBody}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {/* aria-disabled (not disabled) keeps a mandatory switch focusable so its reason is read. */}
        <label className={`flex min-h-14 w-full items-center justify-between gap-4 rounded-2xl border border-border-subtle bg-surface-subtle px-4 motion-safe:transition-colors hover:bg-surface-hover ${required ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}>
          <span className="min-w-0 text-sm font-semibold text-ink-strong">{t.twoFactorTitle}</span>
          <Switch checked={enabled}
            aria-disabled={required ? "true" : undefined} aria-describedby={required ? "security-2fa-required" : undefined}
            onChange={() => { if (!required) onToggle(!enabled); }} />
        </label>
        {required && <p id="security-2fa-required" className="flex items-center gap-1.5 px-1 text-xs font-medium text-ink-muted"><ShieldCheck aria-hidden="true" className="size-3.5 shrink-0 text-primary" />{t.required}</p>}
      </div>

      {enabled && <>
        {status.authenticatorReadable === false && (
          <Alert tone="warning" live="off" icon={AlertTriangle} className="mt-5">
            <p className="text-sm font-normal leading-relaxed">{t.unreadable}</p>
          </Alert>
        )}

        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          {status.enrolledAt && (
            <div className="min-w-0 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
              <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted"><Smartphone aria-hidden="true" className="size-3.5" />{t.added}</dt>
              <dd className="mt-1.5 text-sm font-bold text-ink-strong [overflow-wrap:anywhere]">{formatInstant(status.enrolledAt, locale)}</dd>
            </div>
          )}
          <div className="min-w-0 rounded-2xl border border-border-subtle bg-surface-subtle p-4">
            <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted"><KeyRound aria-hidden="true" className="size-3.5" />{t.codesLabel}</dt>
            <dd className="mt-1.5 text-sm font-bold text-ink-strong">{fillCopy(t.codesCount, status.recoveryCodesRemaining, status.recoveryCodesTotal)}</dd>
            {low && <dd className="mt-2"><TaskStatus attention>{t.lowCodes}</TaskStatus></dd>}
          </div>
        </dl>

        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Button type="button" onClick={onChange}><Smartphone aria-hidden="true" />{t.change}</Button>
          <Button type="button" variant="outline" onClick={onRegenerate}><KeyRound aria-hidden="true" />{t.regenerate}</Button>
        </div>
      </>}
    </section>
  );
}

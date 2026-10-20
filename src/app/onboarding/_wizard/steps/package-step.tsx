import { Clock3, Sparkles } from "lucide-react";
import { CapacityMeter } from "@/components/onboarding/CapacityMeter";
import { ForwardArrow } from "@/components/onboarding/ForwardArrow";
import { StepCard } from "@/components/onboarding/StepCard";
import { StepDock } from "@/components/onboarding/StepDock";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getPackageCopy } from "@/app/onboarding/package/copy";
import { fill } from "../../copy";
import type { PackageStepProps } from "../types";

/* ═══ STEP: Package ═══
   The package in force, any package chosen but not active yet, and the chooser (a modal) one click away. */
export function PackageStep({ t, language, headingRef, folio, notices, busy, back, planName, pendingPackage, limit, planned, draftsBeyond, canPurchase, onChoosePackage, onContinue }: PackageStepProps) {
  const packages = getPackageCopy(language);
  // Only choices that wait on the team are described here; a started online checkout has its own status page.
  const waiting = pendingPackage && (pendingPackage.provider === "SALES_ASSISTED" || pendingPackage.status === "CUSTOM_QUOTE") ? pendingPackage : null;
  const pendingName = waiting ? packages.planNames[waiting.plan as keyof typeof packages.planNames] ?? waiting.plan : null;
  return (
    <StepCard
      headingRef={headingRef}
      folio={folio}
      title={t.packageTitle}
      intro={t.packageIntro}
      notices={notices}
      dock={(
        <StepDock
          back={back}
          extra={canPurchase ? (
            <Button type="button" variant="outline" onClick={onChoosePackage} className="gap-2">
              <Sparkles aria-hidden="true" className="size-4" />{t.comparePackages}
            </Button>
          ) : undefined}
          primary={(
            <Button onClick={onContinue} disabled={busy} loading={busy} className="sk-nudge-trigger gap-2">
              {fill(t.continueWith, planName)} <ForwardArrow />
            </Button>
          )}
        />
      )}
    >
      <div className="space-y-5">
        <div className="sk-plan-ticket sk-gradient-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="sk-eyebrow">{t.currentPackage}</p>
              <p className="text-3xl font-bold text-ink-strong [overflow-wrap:anywhere]"><bdi>{planName}</bdi></p>
              <p className="text-sm text-ink-muted">{fill(t.covers, t.campusCount(limit))}</p>
            </div>
            {canPurchase ? (
              <Button type="button" variant="secondary" size="sm" onClick={onChoosePackage}>{t.changePackage}</Button>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle pt-3">
            <CapacityMeter planned={planned} limit={limit} />
            <p className="text-sm font-medium text-ink-strong">{fill(t.planned, planned)}</p>
          </div>
        </div>
        {pendingName ? (
          <Alert tone="info" icon={Clock3} live="off" role="note" title={fill(packages.chooser.pending, pendingName)}>
            {waiting?.status === "CUSTOM_QUOTE" ? packages.chooser.bodies.custom : packages.chooser.bodies.reserved}
          </Alert>
        ) : null}
        {draftsBeyond > 0 && (
          <Alert tone="warning">{fill(t.overLimit, draftsBeyond)}</Alert>
        )}
        <p className="text-sm leading-relaxed text-ink-muted">{canPurchase ? t.noPaymentNeeded : t.purchaseNotDelegated}</p>
      </div>
    </StepCard>
  );
}

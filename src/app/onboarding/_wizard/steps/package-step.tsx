import Link from "next/link";
import { CapacityMeter } from "@/components/onboarding/CapacityMeter";
import { ForwardArrow } from "@/components/onboarding/ForwardArrow";
import { StepCard } from "@/components/onboarding/StepCard";
import { StepDock } from "@/components/onboarding/StepDock";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { fill } from "../../copy";
import type { PackageStepProps } from "../types";

/* ═══ STEP: Package ═══ */
export function PackageStep({ t, headingRef, folio, notices, busy, back, planName, limit, planned, draftsBeyond, canPurchase, compareHref, onContinue }: PackageStepProps) {
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
          extra={canPurchase ? <Link href={compareHref} className={buttonVariants({ variant: "outline" })}>{t.comparePackages}</Link> : undefined}
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
          <div className="min-w-0 space-y-1">
            <p className="sk-eyebrow">{t.currentPackage}</p>
            <p className="text-3xl font-bold text-ink-strong [overflow-wrap:anywhere]"><bdi>{planName}</bdi></p>
            <p className="text-sm text-ink-muted">{fill(t.covers, t.campusCount(limit))}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle pt-3">
            <CapacityMeter planned={planned} limit={limit} />
            <p className="text-sm font-medium text-ink-strong">{fill(t.planned, planned)}</p>
          </div>
        </div>
        {draftsBeyond > 0 && (
          <Alert tone="warning">{fill(t.overLimit, draftsBeyond)}</Alert>
        )}
        <p className="text-sm leading-relaxed text-ink-muted">{canPurchase ? t.noPaymentNeeded : t.purchaseNotDelegated}</p>
      </div>
    </StepCard>
  );
}

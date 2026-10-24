import { Package, Sparkles } from "lucide-react";
import { CapacityMeter } from "@/components/onboarding/CapacityMeter";
import { ForwardArrow } from "@/components/onboarding/ForwardArrow";
import { StepCard } from "@/components/onboarding/StepCard";
import { StepDock } from "@/components/onboarding/StepDock";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getPackageCopy } from "@/app/onboarding/package/copy";
import { fill } from "../../copy";
import type { PackageStepProps } from "../types";

/* ═══ STEP: Package ═══
   Nothing is pre-selected: until the owner chooses, the step asks them to and Continue waits. Once chosen,
   it shows that package and where it stands (active, reserved, requested, payment in progress). */
export function PackageStep({ t, local, language, headingRef, folio, notices, busy, back, selectedPackage, limit, planned, draftsBeyond, canPurchase, onChoosePackage, onContinue }: PackageStepProps) {
  const packages = getPackageCopy(language);
  const chosen = selectedPackage;
  const chosenName = chosen ? packages.planNames[chosen.plan as keyof typeof packages.planNames] ?? chosen.plan : null;
  const active = Boolean(chosen && (chosen.status === "FREE_SELECTED" || chosen.status === "SETTLED"));
  const state = !chosen ? null
    : active ? local.packageState.active
    : chosen.status === "CUSTOM_QUOTE" ? local.packageState.requested
    : chosen.provider === "PAY_LATER" || chosen.provider === "SALES_ASSISTED" ? local.packageState.due
    : local.packageState.checkout;
  const reasonId = "package-continue-reason";
  const blocked = !chosen && !busy;

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
          extra={canPurchase && chosen ? (
            <Button type="button" variant="outline" onClick={onChoosePackage} className="gap-2">
              <Sparkles aria-hidden="true" className="size-4" />{t.changePackage}
            </Button>
          ) : undefined}
          primary={(
            <Button onClick={onContinue} disabled={busy || !chosen} loading={busy} aria-describedby={blocked ? reasonId : undefined} className="sk-nudge-trigger gap-2">
              {chosenName ? fill(t.continueWith, chosenName) : t.continue} <ForwardArrow />
            </Button>
          )}
          reason={blocked ? { id: reasonId, text: local.selectFirst } : undefined}
        />
      )}
    >
      {!chosen ? (
        <EmptyState
          icon={Package}
          title={local.noPackageTitle}
          description={canPurchase ? local.noPackageBody : t.purchaseNotDelegated}
          action={canPurchase ? <Button type="button" onClick={onChoosePackage} className="gap-2"><Sparkles aria-hidden="true" className="size-4" />{local.choosePackage}</Button> : undefined}
        />
      ) : (
        <div className="space-y-5">
          <div className="sk-plan-ticket sk-gradient-border">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="sk-eyebrow">{local.yourPackage}</p>
                <p className="text-3xl font-bold text-ink-strong [overflow-wrap:anywhere]"><bdi>{chosenName}</bdi></p>
                <p className="sk-choice-tag" data-tone={active ? undefined : "info"}>{state}</p>
              </div>
              {canPurchase ? (
                <Button type="button" variant={chosen.provider === "PAY_LATER" || chosen.provider === "SALES_ASSISTED" ? "default" : "secondary"} size="sm" onClick={onChoosePackage}>
                  {chosen.provider === "PAY_LATER" || chosen.provider === "SALES_ASSISTED" ? packages.chooser.payNow : t.changePackage}
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border-subtle pt-3">
              <CapacityMeter planned={planned} limit={limit} />
              <p className="text-sm font-medium text-ink-strong">{fill(t.planned, planned)}</p>
            </div>
          </div>
          {draftsBeyond > 0 && (
            <Alert tone="warning">{fill(t.overLimit, draftsBeyond)}</Alert>
          )}
        </div>
      )}
    </StepCard>
  );
}

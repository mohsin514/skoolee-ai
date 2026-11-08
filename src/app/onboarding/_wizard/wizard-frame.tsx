import type { ReactNode } from "react";
import { LogOut, School, ShieldCheck } from "lucide-react";
import type { SetupStepId } from "@/lib/onboarding/setup-state";
import { AuthColophon } from "@/components/auth/AuthColophon";
import { AuthMascot } from "@/components/auth/AuthMascot";
import { AuthShell } from "@/components/auth/AuthShell";
import { SetupBar } from "@/components/onboarding/SetupBar";
import { SheetRail, type RailState } from "@/components/onboarding/SheetRail";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { fill } from "../copy";
import type { SetupWizard, SetupWizardReady } from "./use-setup-wizard";
import { WizardCover } from "./wizard-cover";
import { GuideCompanion } from "@/components/onboarding/GuideCompanion";
import { normalizeUserRole } from "@/lib/roles";

/**
 * The setup desk on the Front Desk shell ("Charter Desk", spec §5.1): AuthShell's
 * studio layout with the decorative charter cover (lg+), then on the paper side
 * one SetupBar (Oolee, the structure summary, the save state, Save and exit, one
 * Sign out), the delegate note and save banner, the numbered SheetRail, and the
 * page's children: the one step card and the handover strip.
 *
 * AuthShell's <main> is the page's only <main> and carries lang + dir.
 */
export function WizardFrame({ wizard, ready, children }: { wizard: SetupWizard; ready: SetupWizardReady; children: ReactNode }) {
  const { t, lang, flow, step, completed, reachable, saving, activating, edited, type, mode, banner, success, goTo, handleLogout, saveAndExit } = wizard;
  const { v, attention, sealState, coverData } = ready;

  // Attention marks other steps; the current step stays "current" (aria-current) and its card shows the error summary.
  const railState = (id: SetupStepId): RailState =>
    id === step ? "current" : attention.includes(id) ? "attention" : completed.includes(id) ? "done" : reachable.includes(id) ? "open" : "locked";

  return (
    <AuthShell
      language={lang}
      layout="studio"
      cover={(
        <WizardCover
          t={t}
          language={lang}
          step={step}
          flow={flow}
          completed={completed}
          sealed={Boolean(success)}
          sealState={sealState}
          attention={attention}
          failedStep={ready.failed && v.failedStep ? (v.failedStep as SetupStepId) : null}
          data={coverData}
        />
      )}
      footer={<AuthColophon language={lang} claims={["campuses", "encrypted"]} />}
    >
      <SetupBar
        face={<AuthMascot size="min(1.5rem, 7vw)" rule={false} signals={wizard.signals} />}
        summary={(
          // Structure stays visible for the whole journey.
          <p data-testid="structure-summary" className="sk-chip min-w-0">
            <School aria-hidden="true" className="size-3.5 shrink-0 text-primary" />
            <span className="min-w-0 truncate">{t.types[type].short}{mode ? ` · ${t.modes[mode].short}` : ""}</span>
          </p>
        )}
        save={{
          state: saving ? "saving" : wizard.saveFailed ? "failed" : edited ? "dirty" : "saved",
          labels: { saving: t.saving, saved: t.savedAt, dirty: t.charter.saveDirty, failed: wizard.local.saveFailedLabel },
        }}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={() => void saveAndExit()} disabled={saving || activating}>{t.saveExit}</Button>
            <Button variant="ghost" size="sm" onClick={() => void handleLogout()} className="gap-1.5 px-2.5">
              <LogOut aria-hidden="true" className="size-4 rtl:rotate-180" />
              <span className="max-sm:sr-only">{t.signOut}</span>
            </Button>
          </>
        )}
      />

      {v.actor.kind === "delegate" && (
        <Alert tone="info" icon={ShieldCheck} live="off" role="note">
          {t.delegateBanner} {v.actor.canPurchase ? t.delegateBannerBuy : t.delegateBannerNoBuy}
        </Alert>
      )}
      {banner && (
        <Alert tone="warning" live="assertive">{banner}</Alert>
      )}

      <SheetRail
        label={t.wizard}
        steps={flow.map((id) => ({ id, title: t.steps[id].title, state: railState(id) }))}
        itemName={(n, total, title) => fill(t.charter.railItem, n, total, title)}
        stateLabels={{ done: t.stepState.done, current: t.stepState.current, locked: t.stepState.locked, attention: t.charter.attention }}
        disabled={saving || activating || Boolean(success)}
        onSelect={(id) => void goTo(id as SetupStepId)}
      />

      <GuideCompanion language={lang} role={normalizeUserRole(v.actor.role) ?? undefined} title={t.steps[step].title} ready={Boolean(success)} />
      {children}
    </AuthShell>
  );
}

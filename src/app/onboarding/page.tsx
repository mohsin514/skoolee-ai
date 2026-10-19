'use client'

import { unresolvedOptionalWork, type SetupStepId } from "@/lib/onboarding/setup-state";
import { ErrorSummary } from "@/components/onboarding/ErrorSummary";
import { fill } from "./copy";
import { HandoverPanel } from "./_wizard/handover-panel";
import { useSetupWizard } from "./_wizard/use-setup-wizard";
import { WizardFrame } from "./_wizard/wizard-frame";
import { WizardLoadError, WizardNoAccess, WizardSkeleton } from "./_wizard/wizard-states";
import { StructureStep } from "./_wizard/steps/structure-step";
import { IdentityStep } from "./_wizard/steps/identity-step";
import { PackageStep } from "./_wizard/steps/package-step";
import { CampusesStep } from "./_wizard/steps/campuses-step";
import { AcademicStep } from "./_wizard/steps/academic-step";
import { ReviewStep } from "./_wizard/steps/review-step";

// The setup wizard (SKO-391) on the Front Desk shell ("Charter Desk"). State and server calls live in
// `useSetupWizard`; this file picks the load state and composes the studio frame, the one step card
// (with its error summary in the card's notices) and the handover strip.
export default function OnboardingWizard() {
  const w = useSetupWizard();
  const { load, ready, t, local, lang, headingRef, summaryRef, saving, activating, step, flow, stepIndex, reachable, success, errors } = w;

  // ── Loading / no-access / error states ──
  if (load.kind === "error") return <WizardLoadError onRetry={() => void w.reload()} onSignOut={w.handleLogout} />;
  if (load.kind === "noAccess") return <WizardNoAccess onSignOut={w.handleLogout} />;
  // A ready load whose view has not landed yet keeps the skeleton too.
  if (load.kind === "loading" || !ready) return <WizardSkeleton t={t} />;

  const { v, d, s, isGroup, limit, planned, split, overLimit, compareHref, errorEntries } = ready;
  const notices = errorEntries.length > 0 ? (
    <ErrorSummary
      ref={summaryRef}
      title={t.errorSummary(errorEntries.length)}
      items={errorEntries.map(([field, code]) => ({
        key: field,
        label: `${field.startsWith("campus:") ? `${d.campuses.find((c) => `campus:${c.key}` === field)?.name || t.campusName}: ` : ""}${t.errors[code] ?? code}`,
        onSelect: () => ready.jumpToError(field),
      }))}
    />
  ) : null;
  const base = { t, local, language: lang, headingRef, folio: fill(t.stepOf, stepIndex + 1, flow.length), notices, busy: saving };
  const withBack = { ...base, back: { label: t.back, onClick: w.goBack, disabled: saving || activating || Boolean(success) } };
  const continueFrom = (id: SetupStepId) => () => void w.continueFrom(id);
  const failedStep = v.failedStep as SetupStepId;
  const failure = ready.failed ? {
    message: v.lastError ?? "",
    goTo: v.failedStep && v.failedStep !== "review" && flow.includes(failedStep)
      ? { label: fill(t.goToStep, t.steps[failedStep].title), onClick: () => void w.goTo(failedStep) }
      : undefined,
  } : null;

  return (
    <WizardFrame wizard={w} ready={ready}>
      {step === 'structure' && (
        <StructureStep
          {...base}
          mode={w.mode}
          type={w.type}
          savedType={v.institutionType}
          campusDraftCount={d.campuses.length}
          limit={limit}
          modeError={errors.adoptionMode ? t.errors[errors.adoptionMode] : undefined}
          onModeChange={w.setMode}
          onTypeChange={w.setType}
          onContinue={continueFrom("structure")}
        />
      )}

      {step === 'identity' && (
        <IdentityStep
          {...withBack}
          isGroup={isGroup}
          school={s}
          setSchool={w.setSchool}
          errors={errors}
          logo={{ preview: ready.logoPreview, hasLogo: Boolean(s.logoUrl), uploading: w.logoUploading, onFile: w.handleLogoFile, onRemove: () => w.setSchool({ logoUrl: "" }) }}
          preview={{ schoolName: s.name, regId: isGroup ? s.regId : s.primaryCampusRegId, kicker: t.types[w.type].short }}
          onContinue={continueFrom("identity")}
        />
      )}

      {step === 'package' && (
        <PackageStep
          {...withBack}
          isGroup={isGroup}
          planName={v.plan.name}
          limit={limit}
          planned={planned.length}
          draftsBeyond={split.drafts.length}
          canPurchase={v.actor.canPurchase}
          compareHref={compareHref}
          onContinue={continueFrom("package")}
        />
      )}

      {step === 'campuses' && (
        <CampusesStep
          {...withBack}
          campuses={d.campuses}
          limit={limit}
          draftsBeyond={split.drafts.length}
          canPurchase={v.actor.canPurchase}
          compareHref={compareHref}
          form={w.newCampus}
          setForm={w.setNewCampus}
          formErrors={w.campusErrors}
          rowErrors={errors}
          editingKey={w.editingKey}
          savingCampus={w.savingCampus}
          institutionCity={s.city}
          onSaveCampus={() => void w.saveCampus()}
          onEditCampus={w.editCampus}
          onCancelEdit={w.cancelCampusEdit}
          deleting={w.campusToDelete}
          onAskDelete={w.setCampusToDelete}
          onCancelDelete={() => w.setCampusToDelete(null)}
          onConfirmDelete={() => void w.confirmDeleteCampus()}
          onContinue={continueFrom("campuses")}
        />
      )}

      {step === 'academic' && (
        <AcademicStep
          {...withBack}
          school={s}
          setSchool={w.setSchool}
          errors={errors}
          setAcademicYear={ready.setAcademicYear}
          toggleWorkingDay={ready.toggleWorkingDay}
          thisYear={ready.thisYear}
          offDays={ready.offDays}
          workingDays={ready.workingDays}
          listSeparator={ready.listSeparator}
          onContinue={continueFrom("academic")}
        />
      )}

      {step === 'review' && (
        <ReviewStep
          {...withBack}
          type={w.type}
          mode={w.mode}
          isGroup={isGroup}
          school={s}
          logoPreview={ready.logoPreview}
          planName={v.plan.name}
          limit={limit}
          planned={planned}
          activateCount={split.activate.length}
          draftCount={split.drafts.length}
          overLimit={overLimit}
          canPurchase={v.actor.canPurchase}
          compareHref={compareHref}
          optionalWork={unresolvedOptionalWork(w.type, w.mode, d)}
          offDays={ready.offDays}
          listSeparator={ready.listSeparator}
          success={success}
          workspaceHref="/setup/readiness"
          failure={failure}
          activating={activating}
          saving={saving}
          sealState={ready.sealState}
          attention={ready.attention}
          editable={activating || success ? [] : reachable.filter((id) => id !== "review")}
          onEdit={(id) => void w.goTo(id)}
          onActivate={() => void w.handleActivate()}
        />
      )}

      {(v.actor.canDelegate || v.delegate) && v.actor.kind === "owner" && !success && (
        <HandoverPanel t={t} view={v} onChange={(next) => w.applyView(next, step)} />
      )}
    </WizardFrame>
  );
}

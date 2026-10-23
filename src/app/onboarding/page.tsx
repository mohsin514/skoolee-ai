'use client'

import { institutionSetupDestination } from "@/lib/school-ai/setup-role";
import { useId } from "react";
import { unresolvedOptionalWork, type SetupStepId } from "@/lib/onboarding/setup-state";
import { FlagshipChip } from "@/components/ui/flagship";
import type { Language } from "@/lib/locale/package";
import { ErrorSummary } from "@/components/onboarding/ErrorSummary";
import { PackageChooser } from "@/components/onboarding/PackageChooser";
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
// (with its error summary in the card's notices), what opens next (the two flagships) and the handover strip.

/** SkooleeAI's flagships (addendum 2026-10-22), as the owner meets them right after activation. */
const NEXT_COPY = {
  title: ["What opens next", "ما الذي يُفتح بعد ذلك", "اس کے بعد کیا کھلے گا"],
  items: [
    {
      key: "ai-workflows",
      name: ["AI Workflows", "مسارات الذكاء الاصطناعي", "اے آئی ورک فلوز"],
      body: [
        "Right after activation, answer a short questionnaire and AI drafts your launch plan; nothing applies until you approve it.",
        "بعد التفعيل مباشرةً، أجب عن استبيان قصير ليُعدّ الذكاء الاصطناعي مسودة خطة الانطلاق؛ ولا يُطبَّق شيء قبل موافقتك.",
        "فعال ہوتے ہی ایک مختصر سوالنامے کے جواب دیں اور اے آئی آغاز کے منصوبے کا مسودہ بناتا ہے؛ آپ کی منظوری سے پہلے کچھ لاگو نہیں ہوتا۔",
      ],
    },
    {
      key: "exam-studio",
      name: ["Exam Studio", "استوديو الاختبارات", "ایگزام اسٹوڈیو"],
      body: [
        "Whenever your teachers are ready, AI builds assessments from their material; they review, deliver securely and mark.",
        "متى كان معلموك مستعدين، يبني الذكاء الاصطناعي الاختبارات من موادهم؛ فيراجعونها ويقدّمونها بأمان ويصحّحونها.",
        "جب آپ کے اساتذہ تیار ہوں، اے آئی ان کے مواد سے جائزے تیار کرتا ہے؛ وہ جائزہ لے کر محفوظ طریقے سے امتحان لیتے اور جانچتے ہیں۔",
      ],
    },
  ],
} as const;

function FlagshipsNext({ language, group }: { language: Language; group: boolean }) {
  const index = language === "ar" ? 1 : language === "ur" ? 2 : 0;
  const titleId = useId();
  return (
    <section className="sk-panel flex flex-col gap-3 p-4 sm:p-5" aria-labelledby={titleId} data-onboarding-flagships>
      <h2 id={titleId} className="text-base font-bold text-ink-strong">{NEXT_COPY.title[index]}</h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {NEXT_COPY.items.map((item) => (
          <li key={item.key} className="min-w-0 space-y-1" data-flagship={item.key}>
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-strong"><FlagshipChip />{item.name[index]}</p>
            <p className="text-sm leading-relaxed text-ink-muted">{group && item.key === "ai-workflows" ? ["Review campus readiness and delegate setup to campus administrators. Each campus team reviews and applies its own setup.", "راجع جاهزية الفروع وفوّض الإعداد إلى مسؤوليها. يراجع كل فريق إعداد فرعه ويطبّقه.", "کیمپس کی تیاری دیکھیں اور سیٹ اپ کیمپس منتظمین کو سونپیں۔ ہر کیمپس کی ٹیم اپنے سیٹ اپ کا جائزہ لے کر اسے نافذ کرتی ہے۔"][index] : item.body[index]}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function OnboardingWizard() {
  const w = useSetupWizard();
  const { load, ready, t, local, lang, headingRef, summaryRef, saving, activating, step, flow, stepIndex, reachable, success, errors } = w;

  // ── Loading / no-access / error states ──
  if (load.kind === "error") return <WizardLoadError onRetry={() => void w.reload()} onSignOut={w.handleLogout} />;
  if (load.kind === "noAccess") return <WizardNoAccess onSignOut={w.handleLogout} />;
  // A ready load whose view has not landed yet keeps the skeleton too.
  if (load.kind === "loading" || !ready) return <WizardSkeleton t={t} />;

  const { v, d, s, isGroup, limit, planned, split, overLimit, errorEntries } = ready;
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
          registeredType={v.registeredType}
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
          pendingPackage={v.pendingPackage}
          selectedPackage={v.selectedPackage}
          limit={limit}
          planned={planned.length}
          draftsBeyond={split.drafts.length}
          canPurchase={v.actor.canPurchase}
          onChoosePackage={w.packages.show}
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
          onChoosePackage={w.packages.show}
          form={w.newCampus}
          setForm={w.setNewCampus}
          formErrors={w.campusErrors}
          rowErrors={errors}
          editingKey={w.editingKey}
          savingCampus={w.savingCampus}
          institutionCity={s.city}
          country={s.country}
          onSaveCampus={() => void w.saveCampus()}
          onEditCampus={w.editCampus}
          onCancelEdit={w.cancelCampusEdit}
          deleting={w.campusToDelete}
          deleteError={w.deleteError}
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
          onChoosePackage={w.packages.show}
          optionalWork={unresolvedOptionalWork(w.type, w.mode, d)}
          offDays={ready.offDays}
          listSeparator={ready.listSeparator}
          success={success}
          workspaceHref={institutionSetupDestination(w.type)}
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

      {step === 'review' && <FlagshipsNext language={lang} group={w.type === "GROUP"} />}

      {w.packages.open && v.actor.canPurchase && (
        <PackageChooser
          onClose={w.packages.hide}
          onChosen={() => void w.refreshView()}
          language={w.language}
          returnStep={step}
          campuses={Math.max(1, planned.length)}
          students={w.packages.students}
          onStudentsChange={w.packages.setStudents}
          period={w.packages.period}
          onPeriodChange={w.packages.setPeriod}
          pending={v.pendingPackage}
          hasChoice={Boolean(v.selectedPackage)}
          contactEmail={v.contactEmail}
          beforeLeave={w.beforeLeave}
          returnFocusRef={w.packages.fromLink ? headingRef : undefined}
        />
      )}

      {(v.actor.canDelegate || v.delegate) && v.actor.kind === "owner" && !success && (
        <HandoverPanel t={t} view={v} onChange={(next) => w.applyView(next, step)} />
      )}
    </WizardFrame>
  );
}

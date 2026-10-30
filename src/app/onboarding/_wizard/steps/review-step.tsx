import { Fragment, useEffect, useRef } from "react";
import Link from "next/link";
import { BookOpenCheck, CalendarRange, ImageIcon, Phone, ShieldCheck, UserRound, Users, Wallet } from "lucide-react";
import { InstitutionPreview } from "@/components/auth/InstitutionPreview";
import { WaxSeal } from "@/components/auth/WaxSeal";
import { CapacityMeter } from "@/components/onboarding/CapacityMeter";
import { ForwardArrow } from "@/components/onboarding/ForwardArrow";
import { LedgerList, LedgerRow, ReviewArticle } from "@/components/onboarding/ReviewSheet";
import { SealSlot } from "@/components/onboarding/SealSlot";
import { StepCard } from "@/components/onboarding/StepCard";
import { StepDock } from "@/components/onboarding/StepDock";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FollowUpList, type FollowUpItem } from "@/components/ui/follow-up-list";
import { authCopy } from "@/lib/auth/auth-copy";
import type { OptionalWorkKey, SetupStepId } from "@/lib/onboarding/setup-state";
import { fill } from "../../copy";
import { weekdayName } from "../helpers";
import type { ReviewStepProps } from "../types";

/** Each kind of later work gets its own icon and tone, so the list reads at a glance. */
const OPTIONAL_WORK_LOOK: Record<OptionalWorkKey, Pick<FollowUpItem, "icon" | "tone">> = {
  logo: { icon: ImageIcon, tone: "brand" },
  contact: { icon: Phone, tone: "berry" },
  sessionDates: { icon: CalendarRange, tone: "info" },
  principals: { icon: UserRound, tone: "warning" },
  roster: { icon: Users, tone: "success" },
  curriculum: { icon: BookOpenCheck, tone: "brand" },
  feesPayroll: { icon: Wallet, tone: "warning" },
};

/* ═══ STEP: Review & activate: the charter as one letterhead of numbered articles ═══ */
export function ReviewStep({
  t, language, headingRef, folio, notices, busy, back, type, mode, isGroup, school, logoPreview, planName, limit, planned,
  activateCount, draftCount, overLimit, canPurchase, onChoosePackage, optionalWork, offDays, listSeparator, success, workspaceHref,
  failure, activating, saving, sealState, attention, editable, onEdit, onActivate,
}: ReviewStepProps) {
  const s = school;
  const c = t.charter;
  const failureRef = useRef<HTMLDivElement>(null);
  const failureMessage = failure && !success ? failure.message : null;
  // A fresh activation failure takes focus so screen readers land on it.
  useEffect(() => {
    if (failureMessage) failureRef.current?.focus({ preventScroll: false });
  }, [failureMessage]);

  const stepNotices = [
    notices ? <Fragment key="errors">{notices}</Fragment> : null,
    success ? (
      <Alert
        key="success"
        tone="success"
        title={t.successTitle}
        className="sk-enter"
        actions={<Link href={workspaceHref} className="sk-link text-sm">{c.openWorkspace}</Link>}
      >
        {fill(t.successBody, success.activated, success.drafts)} {t.openingWorkspace}
      </Alert>
    ) : null,
    failure && !success ? (
      <Alert
        key="failure"
        ref={failureRef}
        tone="danger"
        title={t.failedTitle}
        data-testid="setup-failure"
        tabIndex={-1}
        actions={failure.goTo ? (
          <Button variant="outline" size="sm" onClick={failure.goTo.onClick}>{failure.goTo.label}</Button>
        ) : undefined}
      >
        <p dir="auto">{failure.message}</p>
        <p className="mt-1 text-ink-muted">{t.failedBody}</p>
      </Alert>
    ) : null,
  ].filter(Boolean);

  const article = (target: SetupStepId, title: string) => ({
    title,
    edit: { label: fill(c.editSection, title), text: c.edit, onClick: () => onEdit(target), disabled: !editable.includes(target) },
    attention: attention.includes(target) ? c.attention : undefined,
  });
  const campusTarget: SetupStepId = isGroup ? "campuses" : "identity";
  const kicker = `${t.types[type].label} · ${mode ? t.modes[mode].short : "—"}`;
  const regId = isGroup ? s.regId : s.primaryCampusRegId;
  const weeklyOff = offDays.map((day) => weekdayName(day, language, "short")).join(listSeparator) || t.none;

  return (
    <StepCard
      headingRef={headingRef}
      folio={folio}
      title={t.reviewTitle}
      intro={t.reviewIntro}
      notices={stepNotices.length > 0 ? stepNotices : null}
      dock={(
        <StepDock
          back={back}
          extra={overLimit && canPurchase ? <Button type="button" variant="outline" onClick={onChoosePackage}>{t.changePackage}</Button> : undefined}
          primary={(
            <Button size="lg" onClick={onActivate} disabled={activating || saving || busy || Boolean(success)} loading={activating} aria-describedby={overLimit ? "launch-capacity-note" : undefined} className="sk-nudge-trigger flex-1 gap-3">
              {activating ? t.activating : <>{overLimit ? t.activateEligible : t.activate} <ForwardArrow className="w-5 h-5" /></>}
            </Button>
          )}
        />
      )}
    >
      <div className="space-y-6">
        {/* Charter head: who this charter is for */}
        <div>
          <div className="sk-charter-head">
            <SealSlot tone="paper" state={sealState} size={48} className="shrink-0 lg:hidden" />
            <span aria-hidden="true" className="hidden size-12 shrink-0 place-items-center overflow-hidden rounded-full border border-border-subtle bg-white lg:grid [&_img]:size-full [&_img]:object-cover">
              {logoPreview ?? <WaxSeal size={40} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold uppercase tracking-wide text-ink-strong break-words">{s.name || authCopy[language].preview.placeholder}</p>
              <p className="mt-0.5 text-sm text-ink-muted">{kicker}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="sk-chip max-w-full"><span className="truncate">{planName}</span></span>
            {regId ? <span className="sk-chip max-w-full"><bdi dir="ltr" data-numeric="" className="truncate">{regId}</bdi></span> : null}
          </div>
          <div className="sk-letterhead-rule mt-4" aria-hidden="true" />
        </div>

        <div className="sk-charter-grid">
          <ReviewArticle index={1} id="review-structure" {...article("structure", t.steps.structure.title)}>
            <LedgerList>
              <LedgerRow label={t.institutionType} value={t.types[type].label} />
              <LedgerRow label={t.adoptionMode} value={mode ? t.modes[mode].short : "—"} />
            </LedgerList>
          </ReviewArticle>
          <ReviewArticle index={2} id="review-package" {...article("package", t.steps.package.title)}>
            <LedgerList>
              <LedgerRow label={t.currentPackage} value={planName} />
              <LedgerRow label={t.activatedCapacity} value={fill(t.capacityValue, activateCount, limit < 0 ? "∞" : limit)} />
            </LedgerList>
            <CapacityMeter planned={planned.length} limit={limit} />
          </ReviewArticle>
          <ReviewArticle index={3} id="review-identity" {...article("identity", t.steps.identity.title)}>
            <LedgerList>
              <LedgerRow label={isGroup ? t.groupName : t.schoolName} value={s.name || "—"} />
              <LedgerRow label={isGroup ? t.schoolId : t.campusId} value={regId || "—"} ltr />
              <LedgerRow label={t.city} value={s.city || "—"} />
              <LedgerRow label={t.contactEmail} value={s.email || "—"} ltr />
            </LedgerList>
          </ReviewArticle>
          <ReviewArticle index={4} id="review-academic" {...article("academic", t.steps.academic.title)}>
            <LedgerList>
              <LedgerRow label={t.session} value={[s.sessionLabel, s.academicYear && !s.sessionLabel.includes(s.academicYear) ? `(${s.academicYear})` : ""].filter(Boolean).join(" ") || "—"} ltr />
              <LedgerRow label={t.timezone} value={s.timezone || "—"} ltr />
              <LedgerRow label={t.sessionDates} value={s.sessionStart ? `${s.sessionStart}${s.sessionEnd ? ` → ${s.sessionEnd}` : ""}` : t.startsToday} ltr={Boolean(s.sessionStart)} />
              <LedgerRow label={t.weeklyOff} value={weeklyOff} />
            </LedgerList>
          </ReviewArticle>
          <ReviewArticle index={5} id="review-campuses-title" wide {...article(campusTarget, t.campuses)}>
            <ul className="grid gap-2 @min-[34rem]:grid-cols-2" data-testid="review-campuses">
              {planned.map((campus, i) => {
                const isDraft = i >= activateCount;
                return (
                  <li key={campus.key} className="flex items-start justify-between gap-3 rounded-xl border border-border-subtle bg-surface-subtle px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink-strong break-words">{isGroup ? campus.name : t.primaryCampus}</p>
                      <p className="mt-0.5 text-xs text-ink-subtle [overflow-wrap:anywhere]">
                        {campus.city}{campus.city && campus.regId ? " · " : null}{campus.regId ? <bdi dir="ltr" data-numeric="">{campus.regId}</bdi> : null}
                      </p>
                    </div>
                    <Badge variant={isDraft ? "warning" : "success"} size="sm" dot className="shrink-0">{isDraft ? t.draftBadge : t.activateBadge}</Badge>
                  </li>
                );
              })}
            </ul>
          </ReviewArticle>
        </div>

        {/* Clauses */}
        <div className="rounded-2xl border border-status-brand-border bg-status-brand-surface p-4">
          <h2 className="mb-1.5 flex items-center gap-2 text-base font-bold text-ink-strong"><ShieldCheck aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" /> {t.authoritative}</h2>
          <p className="text-sm leading-relaxed text-ink">{mode === "EXAM_STUDIO" ? t.authoritativeExam : t.authoritativeFull}</p>
        </div>
        <div>
          <h2 className="mb-2.5 text-base font-bold text-ink-strong">{t.unresolved}</h2>
          <div data-testid="optional-work">
            <FollowUpList
              id="optional-work-list"
              label={t.unresolved}
              items={optionalWork.map((key) => ({ key, label: t.optionalWork[key], ...OPTIONAL_WORK_LOOK[key] }))}
            />
          </div>
        </div>
        {overLimit && (
          <Alert id="launch-capacity-note" tone="warning">
            {fill(t.activateNote, activateCount, draftCount)}
          </Alert>
        )}
        <Alert tone="info" live="off" role="note">{c.sealNote}</Alert>
      </div>
    </StepCard>
  );
}

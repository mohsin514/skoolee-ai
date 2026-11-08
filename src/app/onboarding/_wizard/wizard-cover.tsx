import type { ReactNode } from "react";
import type { SetupStepId } from "@/lib/onboarding/setup-state";
import type { Language } from "@/lib/locale/package";
import { AuthCover } from "@/components/auth/AuthCover";
import { CharterLedger, type CharterLedgerRow } from "@/components/onboarding/CharterLedger";
import { fill, type OnboardingCopy } from "../copy";
import { WEEK_DAYS } from "./helpers";
import type { CoverData, PlateProps, WizardSealState } from "./types";
import { StructurePlate } from "./plates/structure-plate";
import { IdentityPlate } from "./plates/identity-plate";
import { PackagePlate } from "./plates/package-plate";
import { CampusesPlate } from "./plates/campuses-plate";
import { AcademicPlate } from "./plates/academic-plate";
import { ReviewPlate } from "./plates/review-plate";

/**
 * The charter cover (lg+, inside AuthShell's aria-hidden studio cover): the
 * step line, a live per-step plate drawn from the owner's own answers, and a
 * dot-leader ledger of everything set so far that ends in the seal slot.
 *
 * Decorative and text-only. It precedes the desk in the DOM, so it repeats no
 * pinned string: `short` labels, the plan name, the city, counts and dates
 * only. No campus names, links, buttons, ids or live regions (the pin guard in
 * tests/onboarding/charter-pins.test.tsx greps this file and the plates).
 */
export type WizardCoverProps = {
  t: OnboardingCopy;
  language: Language;
  step: SetupStepId;
  flow: SetupStepId[];
  completed: SetupStepId[];
  sealed: boolean;
  sealState: WizardSealState;
  attention: SetupStepId[];
  /** The step a FAILED activation names (all its rows are flagged), or null. */
  failedStep: SetupStepId | null;
  data: CoverData;
};

const PLATES: Record<SetupStepId, (props: PlateProps) => ReactNode> = {
  structure: StructurePlate,
  identity: IdentityPlate,
  package: PackagePlate,
  campuses: CampusesPlate,
  academic: AcademicPlate,
  review: ReviewPlate,
};

export function StepPlate({ step, ...props }: PlateProps & { step: SetupStepId }) {
  const Plate = PLATES[step];
  return <Plate {...props} />;
}

export function WizardCover({ t, language, step, flow, completed, sealed, sealState, attention, failedStep, data }: WizardCoverProps) {
  const position = Math.max(0, flow.indexOf(step));
  // The session and week are defaults until the owner reaches the academic step: the ledger lists only what was set.
  const academicAt = flow.indexOf("academic");
  const academicSet = completed.includes("academic") || (academicAt >= 0 && position >= academicAt);
  const isGroup = data.type === "GROUP";
  const active = data.campusNodes.filter((node) => node.state === "active").length;
  const drafts = data.campusNodes.length - active;
  const openDays = WEEK_DAYS.filter((day) => !data.weekends.includes(day)).length;
  // A row is flagged when its step needs attention and the row is unset, or when activation failed on that step
  // (a missing mode flags "Use", never the type that is already set).
  const row = (key: string, label: string, owner: SetupStepId, value: string | null, ltr?: boolean): CharterLedgerRow => ({
    key, label, value, ltr, flag: attention.includes(owner) && (!value || owner === failedStep),
  });

  const rows: CharterLedgerRow[] = [
    row("type", t.charter.ledger.type, "structure", t.types[data.type].short),
    row("use", t.charter.ledger.use, "structure", data.mode ? t.charter.useShort[data.mode] : null),
    row("city", t.charter.ledger.city, "identity", data.city.trim() || null),
    row("package", t.charter.ledger.package, "package", data.planName),
    row("campuses", t.charter.ledger.campuses, "campuses", isGroup
      ? (data.campusNodes.length === 0 ? null : drafts > 0 ? fill(t.charter.campusSplit, active, drafts) : t.campusCount(active))
      : t.campusCount(1)),
    row("session", t.charter.ledger.session, "academic", academicSet ? data.sessionLabel : null, true),
    row("week", t.charter.ledger.week, "academic", academicSet ? t.workingDays(openDays) : null),
  ];
  const caption = sealState === "pressed" ? t.charter.sealPressed : sealState === "failed" ? t.charter.sealFailed : t.charter.sealOpen;

  return (
    <AuthCover
      eyebrow={`${fill(t.stepOf, position + 1, flow.length)} · ${t.steps[step].title}`}
      heading={{ ...(sealed ? t.charter.cover.sealed : t.charter.cover[step]), as: "p" }}
      headingKey={sealed ? "sealed" : step}
      art={<StepPlate step={step} t={t} language={language} data={data} />}
      foot={<CharterLedger title={t.charter.ledgerTitle} rows={rows} seal={{ state: sealState, caption }} />}
    />
  );
}

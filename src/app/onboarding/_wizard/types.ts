import type { ReactNode, RefObject } from "react";
import type {
  AdoptionMode, CampusDraft, InstitutionType, OptionalWorkKey, SchoolDraft, SetupStepId, StepErrors,
} from "@/lib/onboarding/setup-state";
import type { Language } from "@/lib/locale/package";
import type { SealState } from "@/components/onboarding/SealSlot";
import type { OnboardingCopy } from "../copy";
import type { CampusForm } from "./helpers";
import type { LocalCopy } from "./local-copy";

export type LoadState = { kind: "loading" } | { kind: "ready" } | { kind: "noAccess" } | { kind: "error" };

/** Activation's seal: success → pressed, activating → pending, a FAILED setup → failed, otherwise open. */
export type WizardSealState = SealState;

// ─── Per-step props (spec §4.2). Task A3 owns this file; Task C may extend it; B tasks only import it. ───

/** What every step card receives. The page builds it once per render. */
export type StepBase = {
  t: OnboardingCopy;
  local: LocalCopy;
  /** The setup's language, mapped to the shell's three (en/ar/ur). */
  language: Language;
  /** The step's h1 (`#step-heading`); focus moves here on every step change. */
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** "Step 2 of 6" (`fill(t.stepOf, stepIndex + 1, flow.length)`). */
  folio: string;
  /** The error summary (null without errors). StepCard renders it under the intro. */
  notices: ReactNode;
  /** A step save is in flight (the wizard's `saving`). */
  busy: boolean;
  /** The dock's Back button; undefined on the first step. */
  back?: { label: string; onClick(): void; disabled?: boolean };
};

export type StructureStepProps = StepBase & {
  mode: AdoptionMode | null;
  type: InstitutionType;
  /** The type the server last acknowledged; a difference shows the shape preview. */
  savedType: InstitutionType;
  /** The type chosen at registration (null for accounts that predate the choice): shown as settled, with Change. */
  registeredType: InstitutionType | null;
  campusDraftCount: number;
  limit: number;
  /** `t.errors[errors.adoptionMode]`; render with `FieldError live={false}` (the summary is the live region). */
  modeError?: string;
  onModeChange(mode: AdoptionMode): void;
  onTypeChange(type: InstitutionType): void;
  /** Never disabled: a missing mode is reported by the error summary. */
  onContinue(): void;
};

export type IdentityStepProps = StepBase & {
  isGroup: boolean;
  school: SchoolDraft;
  setSchool(patch: Partial<SchoolDraft>): void;
  errors: StepErrors;
  /** `preview` is the page's `next/image` of the uploaded logo (alt = t.logo), or null. */
  logo: { preview: ReactNode | null; hasLogo: boolean; uploading: boolean; onFile(file?: File): void; onRemove(): void };
  /** For the below-lg `InstitutionPreview variant="strip"` ("Prints as …"). */
  preview: { schoolName: string; regId: string; kicker: string };
  onContinue(): void;
};

export type PackageStepProps = StepBase & {
  /** The package the owner chose (null until they choose; nothing is pre-selected). */
  selectedPackage: { plan: string; status: string; provider: string } | null;
  /** A package chosen but not active yet (reserved for the team, custom terms, or checkout started). */
  pendingPackage: { plan: string; status: string; provider: string } | null;
  isGroup: boolean;
  planName: string;
  /** Campuses the package activates; -1 = unlimited. */
  limit: number;
  /** Campuses that will be set up (count). */
  planned: number;
  /** Planned campuses beyond the package's capacity (saved as drafts). */
  draftsBeyond: number;
  canPurchase: boolean;
  /** Opens the package chooser modal. */
  onChoosePackage(): void;
  onContinue(): void;
};

export type CampusesStepProps = StepBase & {
  campuses: CampusDraft[];
  limit: number;
  draftsBeyond: number;
  canPurchase: boolean;
  /** Opens the package chooser modal. */
  onChoosePackage(): void;
  form: CampusForm;
  setForm(next: CampusForm): void;
  formErrors: StepErrors;
  /** Step-level errors; `campus:<key>` entries outline a roster row. */
  rowErrors: StepErrors;
  editingKey: string | null;
  savingCampus: boolean;
  /** The institution's own city (for the composer's prefill hint). */
  institutionCity: string;
  /** The school's country (ISO alpha-2): picks the boards offered and the phone code a new number starts on. */
  country: string;
  onSaveCampus(): void;
  onEditCampus(campus: CampusDraft): void;
  onCancelEdit(): void;
  /** The campus whose delete confirmation is open (the step renders the dialog). */
  deleting: CampusDraft | null;
  deleteError?: string | null;
  onAskDelete(campus: CampusDraft): void;
  onCancelDelete(): void;
  onConfirmDelete(): void;
  /** Disabled while `campuses.length === 0` (the dock states why). */
  onContinue(): void;
};

export type AcademicStepProps = StepBase & {
  school: SchoolDraft;
  setSchool(patch: Partial<SchoolDraft>): void;
  errors: StepErrors;
  setAcademicYear(raw: string): void;
  /** Toggles an ISO weekday (1 = Monday … 7 = Sunday); refuses (toast) to close all seven. */
  toggleWorkingDay(day: number): void;
  thisYear: number;
  /** ISO weekdays closed / open, in week order (for the summary panel). */
  offDays: number[];
  workingDays: number[];
  /** "، " in ar/ur, ", " otherwise. */
  listSeparator: string;
  onContinue(): void;
};

export type ReviewStepProps = StepBase & {
  type: InstitutionType;
  mode: AdoptionMode | null;
  isGroup: boolean;
  school: SchoolDraft;
  /** The page's `next/image` of the logo (alt = t.logo), or null. */
  logoPreview: ReactNode | null;
  planName: string;
  limit: number;
  planned: CampusDraft[];
  activateCount: number;
  draftCount: number;
  overLimit: boolean;
  canPurchase: boolean;
  /** Opens the package chooser modal. */
  onChoosePackage(): void;
  optionalWork: OptionalWorkKey[];
  /** ISO weekdays closed, in week order. */
  offDays: number[];
  listSeparator: string;
  success: { activated: number; drafts: number } | null;
  workspaceHref: "/setup/readiness";
  /** The last activation failure; `goTo` jumps to the step that failed (label = fill(t.goToStep, title)). */
  failure: { message: string; goTo?: { label: string; onClick(): void } } | null;
  activating: boolean;
  saving: boolean;
  sealState: WizardSealState;
  /** Steps flagged "Needs attention" (failed step and steps owning current errors). */
  attention: SetupStepId[];
  /** Steps an article's Edit may jump to: reachable minus review; [] while activating or after success. */
  editable: SetupStepId[];
  /** Jumps to a step (campuses → identity for a single school is the caller's choice of target). */
  onEdit(step: SetupStepId): void;
  onActivate(): void;
};

// ─── The cover (decorative, aria-hidden) ───

/** Everything the cover may draw: the owner's own answers and the package's real capacity. NEVER campus names. */
export type CoverData = {
  type: InstitutionType;
  mode: AdoptionMode | null;
  name: string;
  tagline: string;
  city: string;
  establishedYear: string;
  website: string;
  /** The logo as a decorative `next/image` (alt ""), or null. */
  logoPreview: ReactNode | null;
  /** Group: the School ID; single school: the primary campus ID. */
  regId: string;
  /** `t.schoolId` (group) or `t.campusId` (single school). */
  idLabel: string;
  planName: string;
  /** -1 = unlimited. */
  limit: number;
  /** One node per planned campus, in order: active up to the package's capacity, draft beyond. Keys are draft keys. */
  campusNodes: { key: string; state: "active" | "draft" }[];
  sessionLabel: string;
  academicYear: string;
  sessionStart: string;
  sessionEnd: string;
  timezone: string;
  /** ISO weekdays closed. */
  weekends: number[];
};

/** Every plate returns `<div className="sk-plate" data-layer="{step}">…</div>`. */
export type PlateProps = { t: OnboardingCopy; language: Language; data: CoverData };

export type { CampusForm } from "./helpers";

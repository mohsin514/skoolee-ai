// ─────────────────────────────────────────────────────────────────
// Institution setup state (SKO-391) — pure rules shared by the wizard,
// the server actions and the tests.
//
// The setup is keyed by institution *type*, never by the owner's role: a
// group with one campus is still a group, and a standalone school never
// repeats its details on a campus form. Steps, validation and the split
// between activated and draft campuses all derive from the saved state.
// ─────────────────────────────────────────────────────────────────
import { z } from "zod";
import { EMAIL_PATTERN } from "@/lib/school/details";

export const INSTITUTION_TYPES = ["STANDALONE", "GROUP"] as const;
export const ADOPTION_MODES = ["EXAM_STUDIO", "FULL_OPERATIONS"] as const;
export type InstitutionType = (typeof INSTITUTION_TYPES)[number];
export type AdoptionMode = (typeof ADOPTION_MODES)[number];

export const SETUP_STEPS = ["structure", "identity", "package", "campuses", "academic", "review"] as const;
export type SetupStepId = (typeof SETUP_STEPS)[number];

export const MAX_CAMPUS_DRAFTS = 50;

/** The journey for one institution type. Only a group configures campuses. */
export function setupFlow(type: InstitutionType): SetupStepId[] {
  return type === "GROUP"
    ? ["structure", "identity", "package", "campuses", "academic", "review"]
    : ["structure", "identity", "package", "academic", "review"];
}

export function isSetupStep(value: unknown): value is SetupStepId {
  return typeof value === "string" && (SETUP_STEPS as readonly string[]).includes(value);
}

/** Registration stored GROUP/STANDALONE; very old rows fall back to the owner's role. */
export function initialInstitutionType(registrationKind: string | null | undefined, role: string): InstitutionType {
  if (registrationKind === "GROUP" || registrationKind === "STANDALONE") return registrationKind;
  return role === "ADMIN" ? "STANDALONE" : "GROUP";
}

const text = (max: number) => z.string().max(max).catch("").default("");

export const campusDraftSchema = z.object({
  key: z.string().min(1).max(64),
  name: text(160),
  city: text(120),
  address: text(500),
  phone: text(40),
  email: text(200),
  website: text(300),
  principalName: text(160),
  regId: text(40),
  autoId: z.boolean().catch(true).default(true),
  board: text(80),
});

export const schoolDraftSchema = z.object({
  name: text(200),
  city: text(120),
  address: text(500),
  email: text(200),
  phone: text(40),
  website: text(300),
  logoUrl: text(500),
  establishedYear: text(4),
  tagline: text(200),
  regId: text(40),
  autoId: z.boolean().catch(true).default(true),
  /** Standalone only: the ID of the primary campus created from these details. */
  primaryCampusRegId: text(40),
  primaryCampusAutoId: z.boolean().catch(true).default(true),
  timezone: text(64),
  academicYear: text(4),
  sessionLabel: text(60),
  sessionStart: text(10),
  sessionEnd: text(10),
  weekends: z.array(z.number().int().min(1).max(7)).max(7).catch([7]).default([7]),
});

export const setupDraftSchema = z.object({
  school: schoolDraftSchema.catch(() => schoolDraftSchema.parse({})).default(() => schoolDraftSchema.parse({})),
  campuses: z.array(campusDraftSchema).max(MAX_CAMPUS_DRAFTS).catch([]).default([]),
});

export type CampusDraft = z.infer<typeof campusDraftSchema>;
export type SchoolDraft = z.infer<typeof schoolDraftSchema>;
export type SetupDraft = z.infer<typeof setupDraftSchema>;

/** Any stored or submitted value, normalised to a bounded draft. Never throws. */
export function parseSetupDraft(value: unknown): SetupDraft {
  const parsed = setupDraftSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : setupDraftSchema.parse({});
}

/** Field → error code. Codes are localised by the wizard and turned into text for API callers. */
export type StepErrors = Record<string, string>;

const blank = (value: string | undefined) => !value || !value.trim();
const badEmail = (value: string) => Boolean(value.trim()) && !EMAIL_PATTERN.test(value.trim());
const badPhone = (value: string) => {
  if (!value.trim()) return false;
  const digits = value.replace(/\D/g, "").length;
  return digits < 7 || digits > 15;
};

export function validateCampusDraft(campus: CampusDraft, others: CampusDraft[] = []): StepErrors {
  const errors: StepErrors = {};
  if (blank(campus.name)) errors.campusName = "campusName.required";
  if (blank(campus.city)) errors.campusCity = "campusCity.required";
  if (blank(campus.regId)) errors.campusRegId = "campusRegId.required";
  else if (others.some((o) => o.key !== campus.key && o.regId.trim().toUpperCase() === campus.regId.trim().toUpperCase())) errors.campusRegId = "campusRegId.duplicate";
  if (badEmail(campus.email)) errors.campusEmail = "email.invalid";
  if (badPhone(campus.phone)) errors.campusPhone = "phone.invalid";
  return errors;
}

/**
 * What must be true before a step counts as completed. Optional fields are
 * never required here — deferring them is surfaced on the review instead.
 */
export function validateStep(
  step: SetupStepId,
  state: { institutionType: InstitutionType; adoptionMode: AdoptionMode | null; draft: SetupDraft },
  now = new Date(),
): StepErrors {
  const { draft } = state;
  const school = draft.school;
  const errors: StepErrors = {};
  switch (step) {
    case "structure":
      if (!state.adoptionMode) errors.adoptionMode = "adoptionMode.required";
      break;
    case "identity": {
      if (blank(school.name)) errors.name = "name.required";
      if (blank(school.city)) errors.city = "city.required";
      if (badPhone(school.phone)) errors.phone = "phone.invalid";
      if (school.establishedYear) {
        const year = Number(school.establishedYear);
        if (!Number.isInteger(year) || year < 1800 || year > now.getFullYear() + 1) errors.establishedYear = "establishedYear.invalid";
      }
      if (state.institutionType === "STANDALONE" ? blank(school.primaryCampusRegId) : blank(school.regId)) errors.regId = "regId.required";
      break;
    }
    case "package":
      break;
    case "campuses":
      if (state.institutionType !== "GROUP") break;
      if (draft.campuses.length === 0) errors.campuses = "campuses.required";
      for (const campus of draft.campuses) {
        const campusErrors = validateCampusDraft(campus, draft.campuses);
        if (Object.keys(campusErrors).length) {
          errors[`campus:${campus.key}`] = Object.values(campusErrors)[0];
        }
      }
      break;
    case "academic": {
      const year = Number(school.academicYear);
      if (!Number.isInteger(year) || year < 2000 || year > now.getFullYear() + 5) errors.academicYear = "academicYear.invalid";
      if (blank(school.sessionLabel)) errors.sessionLabel = "sessionLabel.required";
      if (school.sessionStart && school.sessionEnd && school.sessionEnd <= school.sessionStart) errors.sessionEnd = "sessionEnd.beforeStart";
      if (new Set(school.weekends).size >= 7) errors.weekends = "weekends.allClosed";
      break;
    }
    case "review":
      for (const earlier of setupFlow(state.institutionType).filter((s) => s !== "review")) {
        Object.assign(errors, validateStep(earlier, state, now));
      }
      break;
  }
  return errors;
}

/** Steps a person may open: everything completed plus the first incomplete one. */
export function reachableSteps(flow: SetupStepId[], completed: readonly string[]): SetupStepId[] {
  const reachable: SetupStepId[] = [];
  for (const step of flow) {
    reachable.push(step);
    if (!completed.includes(step)) break;
  }
  return reachable;
}

/** Where a returning owner, delegate or checkout redirect lands. */
export function resumeStep(flow: SetupStepId[], completed: readonly string[], saved: string | null | undefined, requested?: string | null): SetupStepId {
  const reachable = reachableSteps(flow, completed);
  if (isSetupStep(requested) && reachable.includes(requested)) return requested;
  if (isSetupStep(saved) && reachable.includes(saved)) return saved;
  return reachable[reachable.length - 1] ?? flow[0];
}

/**
 * Changing the institution shape keeps every draft (campus drafts are never
 * discarded) but re-opens the steps whose meaning changed.
 */
export function completedAfterTypeChange(completed: readonly string[], next: InstitutionType): SetupStepId[] {
  const flow = setupFlow(next);
  return completed.filter((s): s is SetupStepId => isSetupStep(s) && flow.includes(s) && s !== "campuses" && s !== "review");
}

/** The campuses a completion would create, in order. A standalone school gets one primary campus from its own details. */
export function campusesForCompletion(type: InstitutionType, draft: SetupDraft): CampusDraft[] {
  if (type === "GROUP") return draft.campuses;
  const school = draft.school;
  return [{
    key: "primary",
    name: school.name,
    city: school.city,
    address: school.address,
    phone: school.phone,
    email: school.email,
    website: school.website,
    principalName: "",
    regId: school.primaryCampusRegId,
    autoId: school.primaryCampusAutoId,
    board: "",
  }];
}

/** Campuses within the current package activate; the rest stay recoverable drafts. */
export function splitByCapacity<T>(campuses: T[], limit: number, alreadyActive = 0) {
  if (limit < 0) return { activate: campuses, drafts: [] as T[] };
  const room = Math.max(0, limit - alreadyActive);
  return { activate: campuses.slice(0, room), drafts: campuses.slice(room) };
}

export type OptionalWorkKey = "logo" | "contact" | "sessionDates" | "principals" | "feesPayroll" | "roster" | "curriculum";

/** Optional work deferred during setup, shown on the review rather than blocking it. */
export function unresolvedOptionalWork(type: InstitutionType, mode: AdoptionMode | null, draft: SetupDraft): OptionalWorkKey[] {
  const work: OptionalWorkKey[] = [];
  if (!draft.school.logoUrl) work.push("logo");
  if (!draft.school.phone && !draft.school.website) work.push("contact");
  if (!draft.school.sessionStart || !draft.school.sessionEnd) work.push("sessionDates");
  if (type === "GROUP" && draft.campuses.some((c) => !c.principalName.trim())) work.push("principals");
  work.push("roster", "curriculum");
  // Exam Studio adoption keeps fees and payroll in the school's current systems;
  // full operations can configure them after launch. Neither blocks activation.
  if (mode === "FULL_OPERATIONS") work.push("feesPayroll");
  return work;
}

/** English rendering of step error codes, for server errors and API callers. */
export function describeStepErrors(errors: StepErrors): string {
  const messages: Record<string, string> = {
    "adoptionMode.required": "Choose how you will use Skoolee.",
    "name.required": "School name is required.",
    "city.required": "City is required.",
    "phone.invalid": "Enter a valid phone number.",
    "email.invalid": "Enter a valid email address.",
    "establishedYear.invalid": "Enter a valid established year.",
    "regId.required": "An ID is required.",
    "campuses.required": "Add at least one campus.",
    "campusName.required": "Campus name is required.",
    "campusCity.required": "Campus city is required.",
    "campusRegId.required": "Campus ID is required.",
    "campusRegId.duplicate": "That Campus ID is already used by another campus.",
    "academicYear.invalid": "Enter a valid academic year.",
    "sessionLabel.required": "Give the session a name, e.g. 2026-27.",
    "sessionEnd.beforeStart": "The session must end after it starts.",
    "weekends.allClosed": "A campus needs at least one working day.",
  };
  return [...new Set(Object.values(errors).map((code) => messages[code] ?? code))].join(" ");
}

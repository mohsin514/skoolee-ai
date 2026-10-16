import { z } from "zod";
import type { ReleaseGateId } from "./commercial-evidence";
import type { ProctorPolicy } from "./exam-proctor";

/**
 * Delivery Policy (SKO-408, Requirement 12, R2.4, R10.1, R13.4).
 *
 * Pure module: no I/O, no Prisma, no service import, no `process.env` read. Runnable under
 * `npm run test:school-ai`. The policy is stored as a `SchoolAiRecord` of the new kind
 * `DELIVERY_POLICY` (registered by its own task), so it inherits versioning, `APPROVED` status,
 * immutable revisions, campus scoping, compare-and-set on version and audit logging with no
 * migration. This module owns the schema and the pure decisions only.
 *
 * Four things are structural here rather than conventional.
 *
 * 1. **Managed mode fails closed by absence.** `managedModeAvailable` asks each of the four named
 *    gates in `VALIDATION_GATE_IDS` for a dated pass. A gate that is open, *or missing from the
 *    record altogether*, answers no, so an incomplete policy is an unavailable one (R12.8–R12.10).
 *    It is a type predicate, so a `ManagedReadyPolicy` cannot be obtained without the check.
 * 2. **A refusal cannot carry `ADMITTED`, and an admission cannot carry a refusal code.**
 *    `AdmissionDecision` is a discriminated union over `decision`, so the two halves of R12.4 and
 *    R12.7 cannot disagree.
 * 3. **Capture consent cannot reach the admission decision (R13.4).** `admissionClientSchema` is
 *    strict and has no consent field, so there is no input through which a declined camera could
 *    refuse an attempt. `captureRequired` on the policy is the single R13.4 exception, and it is a
 *    statement the workspace must display before the attempt starts — never an admission input.
 * 4. **A key cannot be stored (R12.2).** `requiredConfigKeyId` is an *identity*: a short label such
 *    as `seb-lab-2026-a`, refused outright when it looks like key material. The SEB Config Key and
 *    Browser Exam Key values are read from server configuration under the names in
 *    `SEB_KEY_ENV_NAMES`; the schema is strict, so the record has no field in which either value
 *    could be written, and therefore no field a projection would have to withhold from a client.
 *    The admission input carries `configKeyMatches: boolean` — the comparison happens at the
 *    request boundary and the decision never sees a hash.
 *
 * Capture configuration itself is *not* restated here. `ProctorPolicySchema` in `./exam-proctor`
 * already owns camera, screen and the 1–7 day retention bound (R13.7), and the compile-time guard
 * below fails the build if the two records ever grow an overlapping field.
 */

/* ------------------------------------------------------------------ tiers, clients, devices */

export const DELIVERY_TIERS = ["STANDARD", "MANAGED"] as const;
export const deliveryTierSchema = z.enum(DELIVERY_TIERS);
export type DeliveryTier = z.infer<typeof deliveryTierSchema>;

/** The client the policy requires. `NONE` is the standard browser tier, which stays fully supported (R12.1). */
export const REQUIRED_CLIENTS = ["NONE", "SAFE_EXAM_BROWSER"] as const;
export const requiredClientSchema = z.enum(REQUIRED_CLIENTS);
export type RequiredClient = z.infer<typeof requiredClientSchema>;

export const CLIENT_KINDS = ["ORDINARY_BROWSER", "SAFE_EXAM_BROWSER"] as const;
export const clientKindSchema = z.enum(CLIENT_KINDS);
export type ClientKind = z.infer<typeof clientKindSchema>;

export const deviceClassSchema = z.string().trim().min(1).max(80);

/** R12.11 records the Local_Release target on the policy; the schema bound is the target itself. */
export const LOCAL_RELEASE_TARGET_SECONDS = 120;
/** R10.1 and the Form_Set schema share one ceiling. A school configures down from it, never up. */
export const MAX_FORMS_CEILING = 4;

/* ------------------------------------------------------------------ validation gates (R12.8–R12.10) */

/**
 * The four managed-mode validation gates. All four are closed by the single commercial release
 * gate `MANAGED_CLIENT_DEVICE_VALIDATION`, owned by SKO-449 on real hardware, so the two modules
 * name the same work: the identifier below is typed as a `ReleaseGateId`, and renaming the gate in
 * the Commercial Evidence Register fails this file's type check.
 */
export const VALIDATION_GATE_IDS = ["CLIENT_CONFIG", "DEVICE_MATRIX", "LOCAL_RELEASE", "EMERGENCY_EXIT"] as const;
export type ValidationGateId = (typeof VALIDATION_GATE_IDS)[number];
export const validationGateIdSchema = z.enum(VALIDATION_GATE_IDS);
export const MANAGED_MODE_RELEASE_GATE: ReleaseGateId = "MANAGED_CLIENT_DEVICE_VALIDATION";
export const MANAGED_MODE_GATE_OWNER = "SKO-449";

const ticket = z.string().trim().regex(/^SKO-\d{2,6}$/u, "A gate owner is a ticket identifier such as SKO-449.");

/** A dated pass, or `null` while the gate is open. An open gate refuses every admission under the policy. */
export const validationGateSchema = z.strictObject({
  gate: validationGateIdSchema,
  passedOn: z.iso.date().nullable(),
  owner: ticket,
  /** What the dated pass cites, or — while the gate is open — what would close it (R12.17). */
  evidence: z.string().trim().min(10).max(400),
});
export type ValidationGate = z.infer<typeof validationGateSchema>;
export type OpenValidationGate = ValidationGate & { passedOn: null };
export type PassedValidationGate = ValidationGate & { passedOn: string };

/* ------------------------------------------------------------------ supported device matrix (R12.9) */

/** One dated real-device test result. A `FAIL` row is a recorded result, never a permission. */
export const supportedDeviceSchema = z.strictObject({
  deviceClass: deviceClassSchema,
  os: z.string().trim().min(1).max(80),
  clientVersion: z.string().trim().min(1).max(40),
  testedOn: z.iso.date(),
  result: z.enum(["PASS", "FAIL"]),
});
export type SupportedDevice = z.infer<typeof supportedDeviceSchema>;

/* ------------------------------------------------------------------ configuration identity, never a key */

/** Where the Config Key and Browser Exam Key values live. This module reads neither. */
export const SEB_KEY_ENV_NAMES = Object.freeze(["SCHOOL_AI_SEB_CONFIG_KEY", "SCHOOL_AI_SEB_EXAM_KEY"] as const);

/**
 * True when a value carries the shape of key material rather than of a name: an unbroken 32-character
 * or longer run of digest/base64 characters (a SHA-256 hex digest is 64, a 32-byte base64 key is 44),
 * or a PEM header. Configuration *names* use separators, so they never match.
 */
export function looksLikeKeyMaterial(value: string): boolean {
  return /[A-Za-z0-9+/]{32,}/u.test(value) || /BEGIN[ A-Z]*(?:KEY|CERTIFICATE)/u.test(value);
}

export const configKeyIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u, "A client configuration identity is a short label such as seb-lab-2026-a.")
  .refine(value => !looksLikeKeyMaterial(value), "A client configuration identity names the approved configuration. The Config Key and Browser Exam Key values are read from server configuration and are never stored on this record.");

/** An attempt support page the Exam Room boundary may admit while an attempt runs (R11.1). */
export const attemptSupportPathSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^\/[A-Za-z0-9._~/-]*$/u, "An attempt support path is an application path beginning with a slash.")
  .refine(value => !value.includes("..") && !value.includes("//"), "An attempt support path carries no parent-directory or protocol-relative segment.");

export const SEPARATION_OF_DUTIES = ["NOT_REQUIRED", "REQUIRED"] as const;
export const separationOfDutiesSchema = z.enum(SEPARATION_OF_DUTIES);
export type SeparationOfDuties = z.infer<typeof separationOfDutiesSchema>;

/* ------------------------------------------------------------------ the policy record (R12.2) */

export const deliveryPolicySchema = z
  .strictObject({
    tier: deliveryTierSchema,
    requiredClient: requiredClientSchema,
    /** Identity only; never a key. */
    requiredConfigKeyId: configKeyIdSchema.nullable(),
    supportedDevices: z.array(supportedDeviceSchema).max(100),
    gates: z.array(validationGateSchema).length(VALIDATION_GATE_IDS.length),
    localReleaseSeconds: z.number().int().min(1).max(LOCAL_RELEASE_TARGET_SECONDS),
    /** The client-side quit path that releases the device independently of Skoolee AI (R12.12). */
    emergencyExitPath: z.string().trim().min(1).max(400),
    permittedFallbackTier: deliveryTierSchema.nullable(),
    attemptSupportPaths: z.array(attemptSupportPathSchema).max(10),
    /** The single R13.4 exception. Displayed to the candidate before the attempt starts, never an admission input. */
    captureRequired: z.boolean(),
    separationOfDuties: separationOfDutiesSchema,
    /** A school configures down from `MAX_FORMS_CEILING`, never up (R10.1). */
    maxForms: z.number().int().min(1).max(MAX_FORMS_CEILING),
    expiresOn: z.iso.date().nullable(),
  })
  // `.length(4)` alone would accept four copies of one gate. Each named gate appears exactly once,
  // so "every gate carries a dated pass" is a statement about all four and not about a subset.
  .refine(value => VALIDATION_GATE_IDS.every(id => value.gates.filter(gate => gate.gate === id).length === 1), `A delivery policy records each of ${VALIDATION_GATE_IDS.join(", ")} exactly once.`);
export type DeliveryPolicy = z.infer<typeof deliveryPolicySchema>;

/** A policy every one of whose named gates carries a dated pass. Reachable only through `managedModeAvailable`. */
export type ManagedReadyPolicy = DeliveryPolicy & { gates: PassedValidationGate[] };

/**
 * Compile-time guard: capture configuration (camera, screen, retention days, consent version) stays
 * in `ProctorPolicySchema`. If the two records ever grow a shared field this assignment fails.
 */
type CaptureConfigurationNotDuplicated = Extract<keyof DeliveryPolicy, keyof ProctorPolicy> extends never ? true : never;
const captureConfigurationNotDuplicated: CaptureConfigurationNotDuplicated = true;
void captureConfigurationNotDuplicated;

/* ------------------------------------------------------------------ the platform default */

/**
 * The built-in default, used when a scope has no approved Delivery Policy. Standard tier, every gate
 * open, no managed client, no supported device, no attempt support path, capture not required,
 * `separationOfDuties: NOT_REQUIRED` and `maxForms` at the ceiling.
 *
 * It is parsed against its own schema at module load, so a default that could not be stored cannot
 * ship, and deep-frozen, so no caller can edit the platform's fallback at runtime.
 */
export const PLATFORM_DEFAULT_DELIVERY_POLICY: DeliveryPolicy = deepFreeze(
  deliveryPolicySchema.parse({
    tier: "STANDARD",
    requiredClient: "NONE",
    requiredConfigKeyId: null,
    supportedDevices: [],
    gates: VALIDATION_GATE_IDS.map(gate => ({ gate, passedOn: null, owner: MANAGED_MODE_GATE_OWNER, evidence: `Awaiting a dated pass on real devices from ${MANAGED_MODE_GATE_OWNER}; release gate ${MANAGED_MODE_RELEASE_GATE} is open.` })),
    localReleaseSeconds: LOCAL_RELEASE_TARGET_SECONDS,
    emergencyExitPath: "The managed client quit path, which releases the device without reaching Skoolee AI. No managed client is configured by default.",
    permittedFallbackTier: null,
    attemptSupportPaths: [],
    captureRequired: false,
    separationOfDuties: "NOT_REQUIRED",
    maxForms: MAX_FORMS_CEILING,
    expiresOn: null,
  }),
);

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") for (const inner of Object.values(value)) deepFreeze(inner);
  return Object.freeze(value);
}

/* ------------------------------------------------------------------ resolution and its source (R2.4) */

export const DELIVERY_POLICY_KIND = "DELIVERY_POLICY";
export const DELIVERY_POLICY_SOURCES = ["SCHOOL_POLICY", "PLATFORM_DEFAULT"] as const;
export type DeliveryPolicySource = (typeof DELIVERY_POLICY_SOURCES)[number];
export const DELIVERY_POLICY_DEFAULT_REASONS = ["NO_APPROVED_POLICY", "POLICY_UNREADABLE"] as const;
export type DeliveryPolicyDefaultReason = (typeof DELIVERY_POLICY_DEFAULT_REASONS)[number];

/**
 * A policy together with the source that produced it. The union keeps the two honest about each
 * other: a platform-default resolution cannot carry a record identifier or version, and a school
 * policy always carries both, so an interface can never report "school policy" without one.
 */
export type ResolvedDeliveryPolicy =
  | { policy: DeliveryPolicy; source: "SCHOOL_POLICY"; recordId: string; version: number; defaultedBecause: null }
  | { policy: DeliveryPolicy; source: "PLATFORM_DEFAULT"; recordId: null; version: null; defaultedBecause: DeliveryPolicyDefaultReason };

/**
 * Resolves the approved policy revision a caller has already loaded, or degrades to the platform
 * default and says why. An unreadable stored record degrades the same way rather than throwing:
 * the default is the standard tier with every gate open, so degrading removes managed delivery and
 * never grants it.
 */
export function resolveDeliveryPolicy(approved: { recordId: string; version: number; data: unknown } | null): ResolvedDeliveryPolicy {
  if (!approved) return { policy: PLATFORM_DEFAULT_DELIVERY_POLICY, source: "PLATFORM_DEFAULT", recordId: null, version: null, defaultedBecause: "NO_APPROVED_POLICY" };
  const parsed = deliveryPolicySchema.safeParse(approved.data);
  if (!parsed.success) return { policy: PLATFORM_DEFAULT_DELIVERY_POLICY, source: "PLATFORM_DEFAULT", recordId: null, version: null, defaultedBecause: "POLICY_UNREADABLE" };
  return { policy: parsed.data, source: "SCHOOL_POLICY", recordId: approved.recordId, version: approved.version, defaultedBecause: null };
}

export const APPROVAL_SEPARATION_REASONS = ["SEPARATION_NOT_REQUIRED", "DISTINCT_ACTORS", "SAME_ACTOR", "UNDETERMINED_ACTOR"] as const;
export type ApprovalSeparationReason = (typeof APPROVAL_SEPARATION_REASONS)[number];

/**
 * R2.4 is conditional on a school policy record requiring separation, and the platform default sets
 * `NOT_REQUIRED` — so an unconfigured school degrades to always-allow. Every decision therefore
 * carries the source that produced it (`SCHOOL_POLICY` or `PLATFORM_DEFAULT`), which the approval
 * interface states. A refusal is typed as `separationOfDuties: "REQUIRED"`, so "refused by the
 * platform default" is not a representable outcome.
 */
export type ApprovalSeparationDecision =
  | { allowed: true; reason: "SEPARATION_NOT_REQUIRED" | "DISTINCT_ACTORS"; separationOfDuties: SeparationOfDuties; source: DeliveryPolicySource }
  | { allowed: false; reason: "SAME_ACTOR" | "UNDETERMINED_ACTOR"; separationOfDuties: "REQUIRED"; source: DeliveryPolicySource };

export function approvalSeparationDecision(input: { resolved: ResolvedDeliveryPolicy; authorId: string | null | undefined; approverId: string | null | undefined }): ApprovalSeparationDecision {
  const { source } = input.resolved;
  const separationOfDuties = input.resolved.policy.separationOfDuties;
  if (separationOfDuties === "NOT_REQUIRED") return { allowed: true, reason: "SEPARATION_NOT_REQUIRED", separationOfDuties, source };
  const author = (input.authorId ?? "").trim();
  const approver = (input.approverId ?? "").trim();
  // Separation is required and one side is unknown: the two cannot be shown to be different actors.
  if (!author || !approver) return { allowed: false, reason: "UNDETERMINED_ACTOR", separationOfDuties, source };
  if (author === approver) return { allowed: false, reason: "SAME_ACTOR", separationOfDuties, source };
  return { allowed: true, reason: "DISTINCT_ACTORS", separationOfDuties, source };
}

/** The configured form ceiling for a scope. A school value above the platform ceiling is unstorable, so this clamps rather than trusts. */
export function maxFormsFor(resolved: ResolvedDeliveryPolicy): number {
  return Math.min(Math.max(1, Math.trunc(resolved.policy.maxForms)), MAX_FORMS_CEILING);
}

/* ------------------------------------------------------------------ gates */

/**
 * Every named gate that lacks a dated pass, in `VALIDATION_GATE_IDS` order. A gate missing from the
 * record is reported as open, so the interface can name it (R12.17) instead of omitting it.
 */
export function openGates(policy: DeliveryPolicy): OpenValidationGate[] {
  return VALIDATION_GATE_IDS.flatMap(id => {
    const recorded = policy.gates.find(gate => gate.gate === id);
    if (recorded === undefined) return [{ gate: id, passedOn: null, owner: MANAGED_MODE_GATE_OWNER, evidence: `No ${id} gate record; managed delivery stays unavailable until ${MANAGED_MODE_GATE_OWNER} records a dated pass.` } satisfies OpenValidationGate];
    return recorded.passedOn === null ? [{ ...recorded, passedOn: null }] : [];
  });
}

/**
 * False while any named gate lacks a dated pass — including a gate the record omits (R12.8–R12.10).
 * The predicate form means a `ManagedReadyPolicy` cannot be produced by any other route.
 */
export function managedModeAvailable(policy: DeliveryPolicy): policy is ManagedReadyPolicy {
  return VALIDATION_GATE_IDS.every(id => {
    const recorded = policy.gates.find(gate => gate.gate === id);
    return typeof recorded?.passedOn === "string" && recorded.passedOn.length > 0;
  });
}

/* ------------------------------------------------------------------ admission (R12.4–R12.10) */

/**
 * The closed reason-code set of R12.7, plus `ADMITTED` for the one non-refusal. `ORDINARY_BROWSER`
 * is the first refusal R12.5 names and is kept distinct from `CLIENT_MISMATCH` so the recorded
 * decision says which of the two happened.
 */
export const ADMISSION_REASON_CODES = ["ADMITTED", "ORDINARY_BROWSER", "CLIENT_MISMATCH", "CONFIG_MISMATCH", "UNSUPPORTED_DEVICE", "UNSUPPORTED_VERSION", "PRIVATE_BROWSING", "POLICY_EXPIRED", "VALIDATION_GATE_NOT_PASSED"] as const;
export type AdmissionReasonCode = (typeof ADMISSION_REASON_CODES)[number];
export type AdmissionRefusalCode = Exclude<AdmissionReasonCode, "ADMITTED">;
export const admissionReasonCodeSchema = z.enum(ADMISSION_REASON_CODES);

/**
 * What the request boundary observed about the client. Strict and consent-free: there is no field
 * through which a declined camera or screen consent could refuse an attempt (R13.4), and
 * `configKeyMatches` is the *outcome* of the server-side header comparison, so no key or hash
 * reaches this decision (R12.2).
 */
export const admissionClientSchema = z.strictObject({
  kind: clientKindSchema,
  version: z.string().trim().min(1).max(40),
  deviceClass: deviceClassSchema,
  privateContext: z.boolean(),
  configKeyMatches: z.boolean(),
});
export type AdmissionClient = z.infer<typeof admissionClientSchema>;

export type AdmissionDecision = { decision: "ADMIT"; reasonCode: "ADMITTED" } | { decision: "REFUSE"; reasonCode: AdmissionRefusalCode };

const ADMIT: AdmissionDecision = Object.freeze({ decision: "ADMIT", reasonCode: "ADMITTED" } as const);
const refuse = (reasonCode: AdmissionRefusalCode): AdmissionDecision => ({ decision: "REFUSE", reasonCode });
/** The policy dates are calendar dates, so the comparison is a calendar comparison in UTC. */
const utcDate = (now: Date): string | null => (Number.isFinite(now.getTime()) ? now.toISOString().slice(0, 10) : null);

/**
 * Pure. Every refusal path of R12.5 and R12.8–R12.10 decided without I/O, with the attempt left
 * unstarted and the deadline unset by the caller on any refusal (R12.6).
 *
 * Order matters, and it is the design's: tier, then policy currency, then the gates, then the
 * client. Two reason codes carry decisions worth stating plainly:
 *
 * - `CLIENT_MISMATCH` is also the answer for a managed policy whose `requiredClient` is `NONE`. A
 *   policy that demands managed delivery while naming no managed client matches no client at all,
 *   so it admits nobody rather than falling through to the standard tier.
 * - `CONFIG_MISMATCH` is also the answer for a managed policy with no `requiredConfigKeyId`. R12.4
 *   requires verifying the client configuration identity against the approved revision; with no
 *   identity recorded there is nothing to verify against, so the request is refused.
 *
 * A clock that is not a usable instant cannot establish that the policy is in date, so it refuses
 * with `POLICY_EXPIRED` rather than admitting.
 */
export function admissionDecision(input: { policy: DeliveryPolicy; now: Date; client: AdmissionClient }): AdmissionDecision {
  const { policy, client } = input;
  // The standard browser tier remains fully supported and carries no managed-client requirement (R12.1).
  if (policy.tier !== "MANAGED") return ADMIT;
  const today = utcDate(input.now);
  if (today === null) return refuse("POLICY_EXPIRED");
  if (policy.expiresOn !== null && policy.expiresOn < today) return refuse("POLICY_EXPIRED");
  if (!managedModeAvailable(policy)) return refuse("VALIDATION_GATE_NOT_PASSED");
  if (policy.requiredClient !== "SAFE_EXAM_BROWSER") return refuse("CLIENT_MISMATCH");
  if (client.kind !== "SAFE_EXAM_BROWSER") return refuse("ORDINARY_BROWSER");
  if (client.privateContext) return refuse("PRIVATE_BROWSING");
  if (policy.requiredConfigKeyId === null || !client.configKeyMatches) return refuse("CONFIG_MISMATCH");
  // A dated real-device pass for this device class, on or before today. A `FAIL` row, a missing row
  // and a row dated in the future are all "no dated result" (R12.9).
  const dated = policy.supportedDevices.filter(device => device.result === "PASS" && device.testedOn <= today && device.deviceClass.trim() === client.deviceClass.trim());
  if (!dated.length) return refuse("UNSUPPORTED_DEVICE");
  if (!dated.some(device => device.clientVersion.trim() === client.version.trim())) return refuse("UNSUPPORTED_VERSION");
  return ADMIT;
}

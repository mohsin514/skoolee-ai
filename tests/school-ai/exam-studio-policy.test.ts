import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ADMISSION_REASON_CODES,
  LOCAL_RELEASE_TARGET_SECONDS,
  MANAGED_MODE_GATE_OWNER,
  MANAGED_MODE_RELEASE_GATE,
  MAX_FORMS_CEILING,
  PLATFORM_DEFAULT_DELIVERY_POLICY,
  SEB_KEY_ENV_NAMES,
  VALIDATION_GATE_IDS,
  admissionClientSchema,
  admissionDecision,
  approvalSeparationDecision,
  deliveryPolicySchema,
  looksLikeKeyMaterial,
  managedModeAvailable,
  maxFormsFor,
  openGates,
  resolveDeliveryPolicy,
  type AdmissionClient,
  type AdmissionReasonCode,
  type DeliveryPolicy,
  type ValidationGateId,
} from "../../src/lib/school-ai/delivery-policy";
import { FIXED_EPOCH_MS } from "./exam-studio-generators";

// Property 10 ("No silent managed downgrade") sweeps generated client descriptors in
// exam-studio-managed.test.ts with the managed admission slice. This file covers the policy record
// itself: the resolved source, the two configurable bounds, the gate semantics and reachability of
// every reason code, all with named examples.

/** The fixture epoch, so device test dates and the clock agree across school-ai tests. */
const NOW = new Date(FIXED_EPOCH_MS); // 2026-05-01T08:00:00Z
const TESTED_ON = "2026-04-01";
const DEVICE_CLASS = "lab-desktop";
const CLIENT_VERSION = "3.7.1";

const datedGates = (open: readonly ValidationGateId[] = []) => VALIDATION_GATE_IDS.map(gate => ({ gate, passedOn: open.includes(gate) ? null : "2026-04-15", owner: MANAGED_MODE_GATE_OWNER, evidence: `A dated real-device result recorded by ${MANAGED_MODE_GATE_OWNER} for ${gate}.` }));

/** A storable managed policy. Every scenario below is parsed, so no test relies on an unstorable record. */
const managedPolicy = (overrides: Record<string, unknown> = {}): DeliveryPolicy =>
  deliveryPolicySchema.parse({
    tier: "MANAGED",
    requiredClient: "SAFE_EXAM_BROWSER",
    requiredConfigKeyId: "seb-lab-2026-a",
    supportedDevices: [{ deviceClass: DEVICE_CLASS, os: "Windows 11", clientVersion: CLIENT_VERSION, testedOn: TESTED_ON, result: "PASS" }],
    gates: datedGates(),
    localReleaseSeconds: LOCAL_RELEASE_TARGET_SECONDS,
    emergencyExitPath: "The managed client quit password path, documented for invigilators.",
    permittedFallbackTier: "STANDARD",
    attemptSupportPaths: ["/ai/exams/attempt/support"],
    captureRequired: false,
    separationOfDuties: "REQUIRED",
    maxForms: 4,
    expiresOn: null,
    ...overrides,
  });

const client = (overrides: Partial<AdmissionClient> = {}): AdmissionClient => admissionClientSchema.parse({ kind: "SAFE_EXAM_BROWSER", version: CLIENT_VERSION, deviceClass: DEVICE_CLASS, privateContext: false, configKeyMatches: true, ...overrides });

const decide = (policy: DeliveryPolicy, overrides: Partial<AdmissionClient> = {}, now: Date = NOW) => admissionDecision({ policy, now, client: client(overrides) });

test("an unconfigured school resolves to the platform default, which degrades separation of duties to always-allow and names the source", () => {
  const unconfigured = resolveDeliveryPolicy(null);
  assert.equal(unconfigured.source, "PLATFORM_DEFAULT");
  assert.equal(unconfigured.defaultedBecause, "NO_APPROVED_POLICY");
  assert.equal(unconfigured.recordId, null);
  assert.equal(unconfigured.policy.separationOfDuties, "NOT_REQUIRED");

  // R2.4 has no record in an unconfigured school, so the same actor may approve their own version —
  // and the decision says which policy source allowed it, rather than allowing it silently.
  const sameActor = approvalSeparationDecision({ resolved: unconfigured, authorId: "teacher-1", approverId: "teacher-1" });
  assert.deepEqual(sameActor, { allowed: true, reason: "SEPARATION_NOT_REQUIRED", separationOfDuties: "NOT_REQUIRED", source: "PLATFORM_DEFAULT" });

  // A school that configured separation refuses the same actor, and reports its own source.
  const configured = resolveDeliveryPolicy({ recordId: "record-1", version: 3, data: managedPolicy() });
  assert.equal(configured.source, "SCHOOL_POLICY");
  assert.equal(configured.version, 3);
  assert.equal(configured.defaultedBecause, null);
  assert.deepEqual(approvalSeparationDecision({ resolved: configured, authorId: "teacher-1", approverId: "teacher-1" }), { allowed: false, reason: "SAME_ACTOR", separationOfDuties: "REQUIRED", source: "SCHOOL_POLICY" });
  assert.deepEqual(approvalSeparationDecision({ resolved: configured, authorId: "teacher-1", approverId: "approver-9" }), { allowed: true, reason: "DISTINCT_ACTORS", separationOfDuties: "REQUIRED", source: "SCHOOL_POLICY" });
  // Separation required and one actor unknown: the two cannot be shown to be different people.
  assert.deepEqual(approvalSeparationDecision({ resolved: configured, authorId: "  ", approverId: "approver-9" }), { allowed: false, reason: "UNDETERMINED_ACTOR", separationOfDuties: "REQUIRED", source: "SCHOOL_POLICY" });

  // An unreadable stored record degrades to the default rather than throwing, and degrading can only
  // remove managed delivery: the default is the standard tier with every gate open.
  const unreadable = resolveDeliveryPolicy({ recordId: "record-2", version: 1, data: { tier: "MANAGED" } });
  assert.equal(unreadable.source, "PLATFORM_DEFAULT");
  assert.equal(unreadable.defaultedBecause, "POLICY_UNREADABLE");
  assert.equal(unreadable.policy.tier, "STANDARD");
  assert.equal(managedModeAvailable(unreadable.policy), false);
  assert.equal(PLATFORM_DEFAULT_DELIVERY_POLICY.separationOfDuties, "NOT_REQUIRED");
  assert.equal(PLATFORM_DEFAULT_DELIVERY_POLICY.maxForms, MAX_FORMS_CEILING);
  assert.equal(openGates(PLATFORM_DEFAULT_DELIVERY_POLICY).length, VALIDATION_GATE_IDS.length);
  assert.throws(() => Object.assign(PLATFORM_DEFAULT_DELIVERY_POLICY, { tier: "MANAGED" }), TypeError);
});

test("a school configures the form ceiling down from four but never up", () => {
  assert.equal(MAX_FORMS_CEILING, 4);
  for (const maxForms of [1, 2, 3, 4]) assert.equal(deliveryPolicySchema.parse({ ...managedPolicy(), maxForms }).maxForms, maxForms);
  for (const maxForms of [5, 8, 0, -1, 2.5, Number.NaN]) assert.equal(deliveryPolicySchema.safeParse({ ...managedPolicy(), maxForms }).success, false, String(maxForms));
  // A value that cannot be stored cannot be read back either.
  assert.equal(maxFormsFor(resolveDeliveryPolicy({ recordId: "record-1", version: 1, data: managedPolicy({ maxForms: 2 }) })), 2);
  assert.equal(maxFormsFor({ ...resolveDeliveryPolicy(null), policy: { ...PLATFORM_DEFAULT_DELIVERY_POLICY, maxForms: 40 } }), MAX_FORMS_CEILING);
});

test("the local release bound is one to one hundred and twenty seconds", () => {
  assert.equal(LOCAL_RELEASE_TARGET_SECONDS, 120);
  for (const localReleaseSeconds of [1, 45, 120]) assert.equal(deliveryPolicySchema.parse({ ...managedPolicy(), localReleaseSeconds }).localReleaseSeconds, localReleaseSeconds);
  for (const localReleaseSeconds of [0, -1, 121, 600, 30.5]) assert.equal(deliveryPolicySchema.safeParse({ ...managedPolicy(), localReleaseSeconds }).success, false, String(localReleaseSeconds));
});

test("managed mode is unavailable while any named gate lacks a dated pass", () => {
  assert.equal(managedModeAvailable(managedPolicy()), true);
  assert.deepEqual(openGates(managedPolicy()), []);
  for (const gate of VALIDATION_GATE_IDS) {
    const policy = managedPolicy({ gates: datedGates([gate]) });
    assert.equal(managedModeAvailable(policy), false, gate);
    assert.deepEqual(
      openGates(policy).map(open => open.gate),
      [gate],
    );
    // R12.17: the open gate is named, with the owner who closes it.
    assert.equal(openGates(policy)[0].owner, MANAGED_MODE_GATE_OWNER);
    assert.equal(decide(policy).reasonCode, "VALIDATION_GATE_NOT_PASSED");
  }
  // A record cannot omit a gate or repeat one, so "every gate passed" is never a statement about a subset.
  assert.equal(deliveryPolicySchema.safeParse({ ...managedPolicy(), gates: datedGates().slice(0, 3) }).success, false);
  assert.equal(deliveryPolicySchema.safeParse({ ...managedPolicy(), gates: datedGates().map(gate => ({ ...gate, gate: "CLIENT_CONFIG" })) }).success, false);
  // An object built outside the schema with a gate missing still reads as unavailable, and the
  // missing gate is reported as open rather than dropped.
  const incomplete = { ...managedPolicy(), gates: datedGates().slice(0, 3) } as DeliveryPolicy;
  assert.equal(managedModeAvailable(incomplete), false);
  assert.deepEqual(
    openGates(incomplete).map(open => open.gate),
    ["EMERGENCY_EXIT"],
  );
  assert.equal(decide(incomplete).reasonCode, "VALIDATION_GATE_NOT_PASSED");
  // The four validation gates are closed by the one release gate the evidence register seeds open.
  assert.equal(MANAGED_MODE_RELEASE_GATE, "MANAGED_CLIENT_DEVICE_VALIDATION");
});

test("every admission reason code is reachable, and the set is closed", () => {
  const reached: Record<AdmissionReasonCode, () => ReturnType<typeof admissionDecision>> = {
    // The standard tier stays fully supported, and a fully gated managed client is admitted.
    ADMITTED: () => decide(managedPolicy()),
    ORDINARY_BROWSER: () => decide(managedPolicy(), { kind: "ORDINARY_BROWSER" }),
    // A managed policy naming no managed client matches no client at all.
    CLIENT_MISMATCH: () => decide(managedPolicy({ requiredClient: "NONE" })),
    CONFIG_MISMATCH: () => decide(managedPolicy(), { configKeyMatches: false }),
    UNSUPPORTED_DEVICE: () => decide(managedPolicy(), { deviceClass: "unreviewed-byod-phone" }),
    UNSUPPORTED_VERSION: () => decide(managedPolicy(), { version: "0.9.0-unreviewed" }),
    PRIVATE_BROWSING: () => decide(managedPolicy(), { privateContext: true }),
    POLICY_EXPIRED: () => decide(managedPolicy({ expiresOn: "2026-04-30" })),
    VALIDATION_GATE_NOT_PASSED: () => decide(managedPolicy({ gates: datedGates(["DEVICE_MATRIX"]) })),
  };
  assert.deepEqual(Object.keys(reached).sort(), [...ADMISSION_REASON_CODES].sort(), "every recorded reason code needs a reachable path");
  for (const [code, run] of Object.entries(reached)) {
    const result = run();
    assert.equal(result.reasonCode, code);
    assert.equal(result.decision, code === "ADMITTED" ? "ADMIT" : "REFUSE");
  }
  // The standard tier admits without a managed client, and an expiry on the same day is still in date.
  assert.equal(decide(deliveryPolicySchema.parse({ ...managedPolicy(), tier: "STANDARD" }), { kind: "ORDINARY_BROWSER" }).decision, "ADMIT");
  assert.equal(decide(managedPolicy({ expiresOn: "2026-05-01" })).decision, "ADMIT");
  // A managed policy with no recorded configuration identity has nothing to verify against, and a
  // device result that is a failure or not yet dated is not a pass.
  assert.equal(decide(managedPolicy({ requiredConfigKeyId: null })).reasonCode, "CONFIG_MISMATCH");
  assert.equal(decide(managedPolicy({ supportedDevices: [{ deviceClass: DEVICE_CLASS, os: "Windows 11", clientVersion: CLIENT_VERSION, testedOn: TESTED_ON, result: "FAIL" }] })).reasonCode, "UNSUPPORTED_DEVICE");
  assert.equal(decide(managedPolicy({ supportedDevices: [{ deviceClass: DEVICE_CLASS, os: "Windows 11", clientVersion: CLIENT_VERSION, testedOn: "2026-06-01", result: "PASS" }] })).reasonCode, "UNSUPPORTED_DEVICE");
  // An unusable clock cannot establish that the policy is in date.
  assert.equal(decide(managedPolicy(), {}, new Date(Number.NaN)).reasonCode, "POLICY_EXPIRED");
});

test("the policy stores a configuration identity and no key, and capture consent cannot reach the decision", () => {
  assert.deepEqual([...SEB_KEY_ENV_NAMES], ["SCHOOL_AI_SEB_CONFIG_KEY", "SCHOOL_AI_SEB_EXAM_KEY"]);
  // The record is strict, so there is no field in which a Config Key or Browser Exam Key could be written.
  for (const extra of [{ configKey: "a" }, { browserExamKey: "b" }, { examKey: "c" }, { captureConsent: true }]) assert.equal(deliveryPolicySchema.safeParse({ ...managedPolicy(), ...extra }).success, false, Object.keys(extra)[0]);
  // A digest or a base64 key in the identity field is refused; a name is accepted.
  for (const requiredConfigKeyId of ["9f".repeat(32), "a3c1d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5", "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A", "seb lab", ""]) assert.equal(deliveryPolicySchema.safeParse({ ...managedPolicy(), requiredConfigKeyId }).success, false, requiredConfigKeyId.slice(0, 16));
  for (const requiredConfigKeyId of ["seb-lab-2026-a", "config.spring-term.v2", "seb:lab:a1"]) assert.equal(deliveryPolicySchema.parse({ ...managedPolicy(), requiredConfigKeyId }).requiredConfigKeyId, requiredConfigKeyId);
  assert.equal(looksLikeKeyMaterial("9f".repeat(32)), true);
  assert.equal(looksLikeKeyMaterial("seb-lab-2026-a"), false);

  // R13.4: the admission input has no consent field at all, so a declined camera has no path to a
  // refusal — and `captureRequired` changes nothing about the decision, it is only displayed before start.
  assert.equal(admissionClientSchema.safeParse({ kind: "SAFE_EXAM_BROWSER", version: CLIENT_VERSION, deviceClass: DEVICE_CLASS, privateContext: false, configKeyMatches: true, cameraConsent: false }).success, false);
  assert.deepEqual(decide(managedPolicy({ captureRequired: true })), decide(managedPolicy({ captureRequired: false })));
  assert.equal(deliveryPolicySchema.parse({ ...managedPolicy(), captureRequired: true }).captureRequired, true);
  // The Exam Room boundary reads attemptSupportPaths, so an off-application path is unstorable.
  for (const path of ["https://example.invalid/x", "//example.invalid", "/ai/../super", "ai/exams"]) assert.equal(deliveryPolicySchema.safeParse({ ...managedPolicy(), attemptSupportPaths: [path] }).success, false, path);
});

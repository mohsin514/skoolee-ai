import assert from "node:assert/strict";
import test from "node:test";
import {
  campusesForCompletion,
  completedAfterTypeChange,
  describeStepErrors,
  initialInstitutionType,
  parseSetupDraft,
  reachableSteps,
  resumeStep,
  setupFlow,
  splitByCapacity,
  unresolvedOptionalWork,
  validateCampusDraft,
  validateStep,
} from "@/lib/onboarding/setup-state";
import { onboardingCopy } from "@/app/onboarding/copy";

const now = new Date("2026-10-17T00:00:00Z");
const draft = (overrides: Record<string, unknown> = {}, campuses: unknown[] = []) => parseSetupDraft({
  school: { name: "Synthetic Academy", city: "Lahore", regId: "SKL-0001", primaryCampusRegId: "BR-0001", academicYear: "2026", sessionLabel: "2026-27", weekends: [7], ...overrides },
  campuses,
});
const campus = (key: string, regId: string, extra: Record<string, unknown> = {}) => ({ key, name: `Campus ${key}`, city: "Lahore", regId, ...extra });

test("institution type comes from the registration choice, not the role", () => {
  assert.equal(initialInstitutionType("GROUP", "ADMIN"), "GROUP");
  assert.equal(initialInstitutionType("STANDALONE", "SUPER_ADMIN"), "STANDALONE");
  assert.equal(initialInstitutionType("UNVERIFIED", "ADMIN"), "STANDALONE");
  assert.equal(initialInstitutionType(null, "SUPER_ADMIN"), "GROUP");
});

test("standalone and group journeys follow the ticket's order", () => {
  assert.deepEqual(setupFlow("STANDALONE"), ["structure", "identity", "package", "academic", "review"]);
  assert.deepEqual(setupFlow("GROUP"), ["structure", "identity", "package", "campuses", "academic", "review"]);
});

test("a standalone school creates exactly one primary campus from its own details", () => {
  const planned = campusesForCompletion("STANDALONE", draft({ phone: "+92 300 1234567" }, [campus("x", "BR-X"), campus("y", "BR-Y")]));
  assert.equal(planned.length, 1);
  assert.equal(planned[0].name, "Synthetic Academy");
  assert.equal(planned[0].city, "Lahore");
  assert.equal(planned[0].regId, "BR-0001");
  assert.equal(planned[0].phone, "+92 300 1234567");
});

test("a group stays a group with one campus, and over-limit campuses become drafts", () => {
  const one = campusesForCompletion("GROUP", draft({}, [campus("a", "BR-A")]));
  assert.equal(one.length, 1);
  const three = [campus("a", "BR-A"), campus("b", "BR-B"), campus("c", "BR-C")];
  assert.deepEqual(splitByCapacity(three, 1), { activate: [three[0]], drafts: [three[1], three[2]] });
  assert.deepEqual(splitByCapacity(three, -1), { activate: three, drafts: [] });
  assert.deepEqual(splitByCapacity(three, 2, 1), { activate: [three[0]], drafts: [three[1], three[2]] });
});

test("step validation returns field codes and accepts deferred optional fields", () => {
  assert.deepEqual(validateStep("structure", { institutionType: "GROUP", adoptionMode: null, draft: draft() }, now), { adoptionMode: "adoptionMode.required" });
  assert.deepEqual(validateStep("identity", { institutionType: "STANDALONE", adoptionMode: "EXAM_STUDIO", draft: draft({ name: " ", city: "" }) }, now), { name: "name.required", city: "city.required" });
  assert.deepEqual(validateStep("identity", { institutionType: "STANDALONE", adoptionMode: "EXAM_STUDIO", draft: draft() }, now), {});
  assert.deepEqual(validateStep("identity", { institutionType: "STANDALONE", adoptionMode: "EXAM_STUDIO", draft: draft({ primaryCampusRegId: "" }) }, now), { regId: "regId.required" });
  assert.deepEqual(validateStep("campuses", { institutionType: "GROUP", adoptionMode: "EXAM_STUDIO", draft: draft() }, now), { campuses: "campuses.required" });
  const dup = draft({}, [campus("a", "BR-A"), campus("b", "br-a")]);
  assert.equal(validateStep("campuses", { institutionType: "GROUP", adoptionMode: "EXAM_STUDIO", draft: dup }, now)["campus:b"], "campusRegId.duplicate");
  assert.deepEqual(validateStep("academic", { institutionType: "GROUP", adoptionMode: "EXAM_STUDIO", draft: draft({ sessionStart: "2026-09-01", sessionEnd: "2026-08-01" }) }, now), { sessionEnd: "sessionEnd.beforeStart" });
  assert.deepEqual(validateStep("academic", { institutionType: "GROUP", adoptionMode: "EXAM_STUDIO", draft: draft({ academicYear: "1999", weekends: [1, 2, 3, 4, 5, 6, 7] }) }, now), { academicYear: "academicYear.invalid", weekends: "weekends.allClosed" });
  // Review rechecks every earlier step for the institution's own journey only.
  assert.deepEqual(validateStep("review", { institutionType: "STANDALONE", adoptionMode: "FULL_OPERATIONS", draft: draft() }, now), {});
  assert.ok(validateStep("review", { institutionType: "GROUP", adoptionMode: "FULL_OPERATIONS", draft: draft() }, now).campuses);
});

test("campus draft validation checks contact formats", () => {
  assert.deepEqual(validateCampusDraft(parseSetupDraft({ campuses: [campus("a", "BR-A", { email: "nope", phone: "12" })] }).campuses[0]), { campusEmail: "email.invalid", campusPhone: "phone.invalid" });
});

test("resume lands on the saved step, honours a reachable requested step and refuses a locked one", () => {
  const flow = setupFlow("GROUP");
  assert.deepEqual(reachableSteps(flow, ["structure", "identity"]), ["structure", "identity", "package"]);
  assert.equal(resumeStep(flow, ["structure", "identity"], "package"), "package");
  assert.equal(resumeStep(flow, ["structure", "identity"], "package", "identity"), "identity");
  assert.equal(resumeStep(flow, ["structure", "identity"], "package", "review"), "package", "a checkout return cannot skip ahead");
  assert.equal(resumeStep(flow, [], "academic"), "structure");
  assert.equal(resumeStep(flow, ["structure"], null, "bogus"), "identity");
});

test("changing the institution shape keeps drafts but re-opens structure-dependent steps", () => {
  assert.deepEqual(completedAfterTypeChange(["structure", "identity", "package", "campuses", "academic", "review"], "STANDALONE"), ["structure", "identity", "package", "academic"]);
  assert.deepEqual(completedAfterTypeChange(["structure", "identity", "package", "academic"], "GROUP"), ["structure", "identity", "package", "academic"]);
});

test("draft parsing is bounded and never throws on hostile input", () => {
  const parsed = parseSetupDraft({ school: { name: 42, weekends: [0, 9], extra: "x" }, campuses: "not-a-list" });
  assert.equal(parsed.school.name, "");
  assert.deepEqual(parsed.school.weekends, [7]);
  assert.deepEqual(parsed.campuses, []);
  assert.equal(parseSetupDraft({ campuses: Array.from({ length: 60 }, (_, i) => campus(String(i), `BR-${i}`)) }).campuses.length, 0, "over-cap list is rejected, not truncated silently into a partial save");
  assert.equal(parseSetupDraft(null).school.academicYear, "");
});

test("optional work is listed, and fees/payroll never block an Exam Studio adoption", () => {
  const exam = unresolvedOptionalWork("STANDALONE", "EXAM_STUDIO", draft());
  assert.ok(!exam.includes("feesPayroll"));
  assert.ok(exam.includes("roster") && exam.includes("curriculum") && exam.includes("logo"));
  assert.ok(unresolvedOptionalWork("GROUP", "FULL_OPERATIONS", draft({}, [campus("a", "BR-A")])).includes("principals"));
  assert.ok(unresolvedOptionalWork("GROUP", "FULL_OPERATIONS", draft()).includes("feesPayroll"));
});

test("every error code has English, Arabic and Urdu text", () => {
  const codes = ["adoptionMode.required", "name.required", "city.required", "phone.invalid", "email.invalid", "establishedYear.invalid", "regId.required", "campuses.required", "campusName.required", "campusCity.required", "campusRegId.required", "campusRegId.duplicate", "academicYear.invalid", "sessionLabel.required", "sessionEnd.beforeStart", "weekends.allClosed"];
  for (const language of ["en", "ar", "ur"]) {
    const copy = onboardingCopy(language);
    for (const code of codes) assert.ok(copy.errors[code], `${language} ${code}`);
  }
  assert.notEqual(onboardingCopy("ar").steps.review.title, onboardingCopy("en").steps.review.title);
  assert.notEqual(onboardingCopy("ur").modes.EXAM_STUDIO.label, onboardingCopy("en").modes.EXAM_STUDIO.label);
  assert.equal(describeStepErrors({ name: "name.required", city: "city.required" }), "School name is required. City is required.");
});

test("website validation covers institution, campus and final review without requiring a scheme", () => {
  for (const website of ["", "www.school.edu.pk", "https://school.edu.pk/path?q=one", "http://school.example", "https://مدرسة.example"]) {
    const data = draft({ website });
    assert.equal(validateStep("identity", { institutionType: "GROUP", adoptionMode: "EXAM_STUDIO", draft: data }, now).website, undefined, website);
  }
  for (const website of ["not a valid website", "https://", "javascript:alert(1)", "ftp://school.example", "https://user:secret@school.example", "https://-invalid.example", "https://school..example"]) {
    const data = draft({ website }, [campus("one", "BR-1", { website })]);
    const state = { institutionType: "GROUP" as const, adoptionMode: "EXAM_STUDIO" as const, draft: data };
    assert.equal(validateStep("identity", state, now).website, "website.invalid", website);
    assert.equal(validateStep("review", state, now).website, "website.invalid", website);
    assert.equal(validateCampusDraft(data.campuses[0]).campusWebsite, "website.invalid", website);
    for (const lang of ["en", "ar", "ur"] as const) assert.ok(onboardingCopy(lang).errors["website.invalid"]);
  }
});

test("SKAI-934: campus phone rejects letters and accepts PK/SA/AE formats on client and server", async () => {
  const { assertPhone, isValidPhone, phoneProblem } = await import("@/lib/school/details");
  for (const ok of ["0300 1234567", "+92 300 1234567", "+92-300-1234567", "+966 50 123 4567", "+971 (4) 123-4567", "050.123.4567"]) {
    assert.equal(isValidPhone(ok), true, ok);
    assert.equal(assertPhone(ok, "Phone number"), ok);
  }
  assert.equal(phoneProblem("abc1234567"), "format");
  assert.equal(phoneProblem("0300-ABC-4567"), "format");
  assert.equal(phoneProblem("92+3001234567"), "format");
  assert.equal(phoneProblem("123"), "short");
  assert.equal(phoneProblem("+1234567890123456"), "long");
  assert.throws(() => assertPhone("phone 0300", "Phone number"), /only digits/);
  const row = parseSetupDraft({ campuses: [campus("a", "BR-A", { phone: "0300-call-me", email: "office@school" })] }).campuses[0];
  assert.deepEqual(validateCampusDraft(row), { campusEmail: "email.invalid", campusPhone: "phone.invalid" });
});

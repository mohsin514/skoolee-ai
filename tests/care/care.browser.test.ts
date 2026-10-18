import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import bcrypt from "bcryptjs";
import { totp } from "../../src/lib/auth/mfa-crypto";

// SKO-439 on the isolated app with synthetic data: a workspace is unusable until a leader records the local
// procedure, lead and retention; clinic and safeguarding memberships are independent and principals, teachers,
// families and support staff are refused (and logged); medication is recorded only against an in-date
// instruction with its own dose; any staff member records a concern (source, observation, event time) and gets
// only a receipt; no family hears anything automatically; disclosures need a second lead bound to the exact
// text and can never reach an implicated guardian; emergency access is short, audited, stops views and exports
// the moment it ends, and is reviewed by the lead.
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/postgres") throw Error("Only isolated local DB 55438 is allowed");
const base = process.env.CARE_TEST_APP || "http://localhost:3107";
const evidence = process.env.CARE_EVIDENCE_DIR || "/tmp/sko439-evidence";
const db = new PrismaClient(), password = "SyntheticCare439!";
const schoolId = `care439-${randomUUID()}`, north = randomUUID(), south = randomUUID(), classId = randomUUID();
const users = new Map<string, { id: string; email: string }>();
const sessions = new Map<string, Awaited<ReturnType<BrowserContext["storageState"]>>>();
const ids: Record<string, string> = {};
const OBS = "SYNTHETIC-OBSERVATION-439: bruise on left forearm, said 'I fell at home'.";
let browser: Browser;

async function user(key: string, role: string, campus = north, language = "en") {
  const id = randomUUID(), email = `${randomUUID()}@example.invalid`;
  await db.user.create({ data: { id, email, password: await bcrypt.hash(password, 12), fullName: `Synthetic ${key}`, role: role as never, schoolId, campusId: campus, isActive: true, onboardingComplete: true, preferredLanguage: language } });
  users.set(key, { id, email }); return id;
}
async function context(key: string, viewport = { width: 1440, height: 1000 }) {
  const saved = sessions.get(key);
  if (saved) return browser.newContext({ viewport, storageState: saved, reducedMotion: "reduce" });
  const ctx = await browser.newContext({ viewport, reducedMotion: "reduce" });
  assert.equal((await ctx.request.post(base + "/api/auth/login", { data: { email: users.get(key)!.email, password } })).status(), 200);
  const { secret } = await (await ctx.request.post(base + "/api/auth/mfa", { data: { action: "setup" } })).json().catch(() => ({}));
  if (secret) { await ctx.request.post(base + "/api/auth/mfa", { data: { action: "verify-setup", code: totp(secret.replace(/\s+/g, "")) } }); await ctx.request.post(base + "/api/auth/mfa", { data: { action: "acknowledge", acknowledged: true } }); }
  sessions.set(key, await ctx.storageState());
  return ctx;
}
const shot = async (page: Page, name: string) => { await page.evaluate("Promise.all(document.getAnimations().filter(a => Number.isFinite(Number(a.effect && a.effect.getComputedTiming().endTime))).map(a => a.finished.catch(() => undefined)))"); await page.screenshot({ path: `${evidence}/${name}.png` }); };
const call = async (key: string, method: "post" | "get", path: string, data?: Record<string, unknown>) => { const ctx = await context(key); const r = await ctx.request[method](`${base}${path}`, data ? { data } : undefined); const body = await r.text(); await ctx.close(); let json: { data?: any; error?: string } = {}; try { json = JSON.parse(body); } catch { /* */ } return { status: r.status(), json, body }; };
const care = (key: string, data: Record<string, unknown>) => call(key, "post", "/api/care", data);
const view = (key: string, query: string) => call(key, "get", `/api/care?${query}`);
const id = (key: string) => users.get(key)!.id;
const relate = async (guardianKey: string) => {
  const rel = await db.guardianRelationship.create({ data: { schoolId, campusId: north, studentId: ids.hana, guardianUserId: id(guardianKey), createdByUserId: id("principal"), fullName: `Synthetic ${guardianKey}`, email: users.get(guardianKey)!.email, relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
  await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: id("principal"), reason: "Synthetic care fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: true } } });
};

before(async () => {
  await db.school.create({ data: { id: schoolId, name: "Synthetic Cedar School", slug: schoolId, regId: schoolId, contactEmail: `${schoolId}@example.invalid`, city: "Lahore", status: "ACTIVE", plan: "PRO", timezone: "Asia/Karachi" } as never });
  for (const [cid, name] of [[north, "Cedar North"], [south, "Cedar South"]]) { await db.campus.create({ data: { id: cid, schoolId, name, regId: cid, city: "Lahore" } }); await db.academicCycle.create({ data: { schoolId, campusId: cid, label: "2026", academicYear: 2026, status: "ACTIVE" } }); }
  await user("principal", "PRINCIPAL"); await user("nurse", "TEACHER"); await user("clinicLead", "TEACHER"); await user("clinicStaff", "RECEPTIONIST");
  await user("sgLead", "TEACHER"); await user("sgDeputy", "TEACHER"); await user("teacher", "TEACHER"); await user("support", "ACCOUNTANT"); await user("southTeacher", "TEACHER", south);
  await user("teacher-ar", "TEACHER", north, "ar"); await user("guardianA", "PARENT"); await user("guardianB", "PARENT");
  await db.class.create({ data: { id: classId, schoolId, campusId: north, name: "Grade 6", section: "B", academicYear: 2026 } });
  ids.hana = randomUUID(); ids.omar = randomUUID();
  await db.student.create({ data: { id: ids.hana, schoolId, campusId: north, classId, fullName: "Synthetic Hana Rahman", rollNo: "601", gender: "FEMALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never });
  await db.student.create({ data: { id: ids.omar, schoolId, campusId: north, classId, fullName: "Synthetic Omar Qureshi", rollNo: "602", gender: "MALE", status: "active", enrollmentDate: new Date("2026-04-01Z") } as never });
  await relate("guardianA"); await relate("guardianB");
  await db.authAttempt.deleteMany({});
  await mkdir(evidence, { recursive: true });
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); await db.school.delete({ where: { id: schoolId } }).catch(() => undefined); await db.$disconnect(); });

test("a workspace stays closed until the local procedure, lead and retention are validated", async () => {
  assert.equal((await care("teacher", { action: "configure", domain: "CLINIC", enabled: true })).status, 403, "only campus leaders configure");
  for (const [key, domain, role] of [["nurse", "CLINIC", "NURSE"], ["clinicLead", "CLINIC", "LEAD"], ["clinicStaff", "CLINIC", "CLINIC_STAFF"], ["sgLead", "SAFEGUARDING", "LEAD"], ["sgDeputy", "SAFEGUARDING", "DEPUTY"]]) {
    const r = await care("principal", { action: "add-member", domain, userId: id(key), role });
    assert.equal(r.status, 201, r.body);
  }
  assert.equal((await care("principal", { action: "add-member", domain: "SAFEGUARDING", userId: id("nurse"), role: "NURSE" })).status, 400, "safeguarding has no nurse role");
  assert.equal((await care("principal", { action: "add-member", domain: "CLINIC", userId: id("nurse"), role: "NURSE" })).status, 409, "one active membership");
  // Before enabling, nothing works — not even intake, which points to the local procedure.
  const early = await care("teacher", { action: "concern", studentId: ids.hana, source: "STAFF_OBSERVATION", observation: "x", eventAt: new Date().toISOString(), idempotencyKey: randomUUID() });
  assert.equal(early.status, 409); assert.match(early.json.error ?? "", /local safeguarding procedure/);
  assert.equal((await view("nurse", "view=clinic")).status, 409);
  const missing = [
    [{}, /local procedure/], [{ procedureReference: "CEDAR-SG-2026 v3" }, /retained/], [{ procedureReference: "CEDAR-SG-2026 v3", retentionMonths: 300 }, /responsible lead/],
    [{ procedureReference: "CEDAR-SG-2026 v3", retentionMonths: 300, leadUserId: id("sgDeputy") }, /added to this workspace as a lead/],
    [{ procedureReference: "CEDAR-SG-2026 v3", retentionMonths: 300, leadUserId: id("sgLead") }, /Confirm/],
  ] as const;
  for (const [extra, message] of missing) { const r = await care("principal", { action: "configure", domain: "SAFEGUARDING", enabled: true, ...extra }); assert.equal(r.status, 400); assert.match(r.json.error ?? "", message); }
  assert.equal((await care("principal", { action: "configure", domain: "SAFEGUARDING", enabled: true, confirm: true, procedureReference: "CEDAR-SG-2026 v3", retentionMonths: 300, leadUserId: id("sgLead") })).status, 200);
  assert.equal((await care("principal", { action: "configure", domain: "CLINIC", enabled: true, confirm: true, procedureReference: "CEDAR-CLINIC-2026 v2", retentionMonths: 120, leadUserId: id("clinicLead") })).status, 200);
  const row = await db.confidentialSetting.findFirstOrThrow({ where: { schoolId, domain: "SAFEGUARDING" } });
  assert.deepEqual([row.enabled, row.confirmedById, row.retentionMonths], [true, id("principal"), 300]);
  const leadMember = await db.confidentialMember.findFirstOrThrow({ where: { schoolId, userId: id("sgLead"), revokedAt: null } });
  assert.equal((await care("principal", { action: "revoke-member", id: leadMember.id })).status, 409, "the responsible lead cannot simply be removed");
});

test("clinic records: visits, care plan, and doses only against an in-date instruction with its own dose", async () => {
  assert.equal((await care("nurse", { action: "visit", studentId: ids.hana, observation: "", actionTaken: "Rest", outcome: "RETURNED_TO_CLASS" })).status, 400);
  const v = await care("clinicStaff", { action: "visit", studentId: ids.hana, observation: "Headache after PE, pale, no vomiting.", actionTaken: "Water and 20 minutes rest", outcome: "RETURNED_TO_CLASS" });
  assert.equal(v.status, 201, v.body);
  assert.equal((await care("clinicStaff", { action: "care-plan", studentId: ids.hana, allergies: "x" })).status, 403, "clinic staff do not write care plans");
  assert.equal((await care("nurse", { action: "care-plan", studentId: ids.hana, allergies: "Peanuts (anaphylaxis)", actionPlan: "Adrenaline auto-injector in clinic cabinet B; call emergency services.", teacherSummary: "Severe nut allergy: no nut foods in class; send to clinic at first sign of reaction." })).status, 200);
  const from = new Date(Date.now() - 86_400_000), until = new Date(Date.now() + 30 * 86_400_000);
  assert.equal((await care("clinicStaff", { action: "instruction", studentId: ids.hana, medicine: "x", dose: "1", schedule: "x", authorizedBy: "x", authorizationRef: "x", validFrom: from, validUntil: until })).status, 403, "only nurses and leads record instructions");
  assert.equal((await care("nurse", { action: "instruction", studentId: ids.hana, medicine: "Cetirizine", dose: "5 mg", schedule: "Once daily at lunch if itching", authorizedBy: "Dr Synthetic Ali", authorizationRef: "", validFrom: from, validUntil: until })).status, 400, "the signed authorization reference is required");
  const ins = await care("nurse", { action: "instruction", studentId: ids.hana, medicine: "Cetirizine", dose: "5 mg", schedule: "Once daily at lunch if itching", authorizedBy: "Dr Synthetic Ali", authorizationRef: "AUTH-439-01", validFrom: from, validUntil: until });
  assert.equal(ins.status, 201); ids.ins = ins.json.data.id;
  const wrong = await care("clinicStaff", { action: "dose", instructionId: ids.ins, dose: "10 mg" });
  assert.equal(wrong.status, 409); assert.match(wrong.json.error ?? "", /cannot change a dose/);
  assert.equal((await care("clinicStaff", { action: "dose", instructionId: ids.ins, dose: "5 mg", givenAt: new Date(Date.now() - 2 * 86_400_000).toISOString() })).status, 409, "no instruction in effect at that time");
  const given = await care("clinicStaff", { action: "dose", instructionId: ids.ins, dose: "5 MG" });
  assert.equal(given.status, 201);
  const dose = await db.medicationDose.findUniqueOrThrow({ where: { id: given.json.data.id } });
  assert.deepEqual([dose.dose, dose.actorId], ["5 mg", id("clinicStaff")], "dose recorded as approved, with the actor");
  const ended = await care("nurse", { action: "instruction", studentId: ids.hana, medicine: "Ibuprofen", dose: "200 mg", schedule: "If pain", authorizedBy: "Dr Synthetic Ali", authorizationRef: "AUTH-439-02", validFrom: from, validUntil: until });
  assert.equal((await care("nurse", { action: "end-instruction", id: ended.json.data.id })).status, 200);
  assert.equal((await care("clinicStaff", { action: "dose", instructionId: ended.json.data.id, dose: "200 mg" })).status, 409, "an ended instruction cannot be used");
  // General staff see only the summary written for them.
  const summary = await view("teacher", `view=summary&studentId=${ids.hana}`);
  assert.equal(summary.json.data.summary, "Severe nut allergy: no nut foods in class; send to clinic at first sign of reaction.");
  assert.ok(!/anaphylaxis|Adrenaline|Cetirizine|Headache/.test(summary.body), "no clinical detail in the teacher summary");
  assert.equal((await view("southTeacher", `view=summary&studentId=${ids.hana}`)).status, 404, "another campus");
});

test("concern intake: any staff, no diagnosis, idempotent receipt, no access for the reporter, no family message", async () => {
  const key = randomUUID();
  const body = { action: "concern", studentId: ids.hana, source: "DISCLOSURE_BY_PUPIL", observation: OBS, eventAt: new Date(Date.now() - 3_600_000).toISOString(), guardianInvolved: true, idempotencyKey: key };
  assert.equal((await care("guardianA", body)).status, 403, "families cannot record concerns");
  assert.equal((await care("teacher", { ...body, observation: "" })).status, 400);
  assert.equal((await care("teacher", { ...body, eventAt: new Date(Date.now() + 3_600_000).toISOString() })).status, 400, "the event cannot be in the future");
  const first = await care("teacher", body);
  assert.equal(first.status, 201, first.body);
  const again = await care("teacher", body);
  assert.deepEqual([again.status, again.json.data.reference], [200, first.json.data.reference], "a retried submit is the same concern");
  assert.deepEqual(Object.keys(first.json.data).sort(), ["createdAt", "reference"], "the receipt carries no case detail");
  const row = await db.safeguardingConcern.findFirstOrThrow({ where: { schoolId, reference: first.json.data.reference } });
  ids.c1 = row.id; ids.ref1 = row.reference;
  assert.deepEqual([row.status, row.ownerId, row.reporterId, row.source].map(String), ["NEW", "null", id("teacher"), "DISCLOSURE_BY_PUPIL"]);
  assert.deepEqual(row.implicatedGuardianIds.sort(), [id("guardianA"), id("guardianB")].sort(), "a possibly involved family is fully implicated until a lead narrows it");
  assert.equal((await view("teacher", `view=safeguarding&concernId=${ids.c1}`)).status, 404, "the reporter does not get the case");
  assert.equal(await db.notification.count({ where: { userId: { in: [id("guardianA"), id("guardianB")] } } }), 0, "no automatic family message");
  const notices = await db.notification.findMany({ where: { userId: { in: [id("sgLead"), id("sgDeputy")] }, type: "SAFEGUARDING_CONCERN_RECEIVED" } });
  assert.equal(notices.length, 2);
  assert.ok(notices.every(n => !JSON.stringify(n).includes("Hana") && !JSON.stringify(n).includes(ids.ref1) && !JSON.stringify(n).includes("SYNTHETIC-OBSERVATION")), "notices name no student, case or narrative");
  const second = await care("teacher", { ...body, studentId: ids.omar, observation: "SYNTHETIC-OTHER-CASE-439: unrelated", guardianInvolved: false, idempotencyKey: randomUUID() });
  ids.c2 = (await db.safeguardingConcern.findFirstOrThrow({ where: { schoolId, reference: second.json.data.reference } })).id;
  const mine = await view("teacher", "view=my-reports");
  assert.deepEqual(mine.json.data.map((r: { reference: string }) => r.reference).sort(), [ids.ref1, second.json.data.reference].sort());
});

test("separate domains: clinic, principal, teacher, family, support and another campus are refused and logged", async () => {
  const sg = (key: string) => view(key, "view=safeguarding"), clinic = (key: string) => view(key, "view=clinic");
  for (const key of ["nurse", "clinicLead", "clinicStaff", "principal", "teacher", "support", "southTeacher"]) assert.equal((await sg(key)).status, 403, `${key} → safeguarding queue`);
  for (const key of ["nurse", "clinicLead", "principal", "teacher"]) assert.notEqual((await view(key, `view=safeguarding&concernId=${ids.c1}`)).status, 200, `${key} → case`);
  for (const key of ["sgLead", "sgDeputy", "principal", "teacher", "support"]) assert.equal((await clinic(key)).status, 403, `${key} → clinic queue`);
  assert.equal((await view("sgLead", `view=clinic&studentId=${ids.hana}`)).status, 403, "safeguarding membership does not open clinic records");
  assert.equal((await view("guardianA", `view=clinic&studentId=${ids.hana}`)).status, 403);
  assert.equal((await view("guardianA", `view=safeguarding&concernId=${ids.c1}`)).status, 404);
  assert.equal((await call("guardianA", "get", `/api/care/export?concernId=${ids.c1}`)).status, 404);
  assert.ok(await db.confidentialAccessLog.count({ where: { schoolId, action: "DENIED", actorId: id("nurse"), domain: "SAFEGUARDING" } }) >= 1, "refusals are audited");
  // Ordinary search and the code that feeds AI never touch these records.
  const search = await call("principal", "get", `/api/search?q=${encodeURIComponent("Synthetic Hana")}&types=student`);
  assert.equal(search.status, 200);
  assert.ok(!/SG-|SYNTHETIC-OBSERVATION|safeguard|clinic|Cetirizine|allerg/i.test(search.body), "search reveals neither case existence nor summaries");
  for (const file of ["src/lib/search/service.ts", "src/lib/ai/gateway.ts", "src/lib/study/assistant.ts", "src/lib/policies/service.ts"]) {
    const source = await readFile(file, "utf8").catch(() => "");
    assert.ok(!/safeguardingConcern|clinicVisit|carePlan|medicationInstruction|lib\/care/.test(source), `${file} has no confidential source`);
  }
});

test("triage: designated owner, versioned changes, escalation and an append-only chronology; lists hold no narrative", async () => {
  const queue = await view("sgLead", "view=safeguarding");
  assert.equal(queue.status, 200);
  assert.ok(!queue.body.includes("SYNTHETIC-OBSERVATION") && !queue.body.includes("Hana") && !queue.body.includes("SYNTHETIC-OTHER-CASE"), "the queue holds no names or observations");
  assert.ok(queue.json.data.concerns.some((c: { reference: string }) => c.reference === ids.ref1));
  const detail = await view("sgLead", `view=safeguarding&concernId=${ids.c1}`);
  assert.equal(detail.json.data.concern.observation, OBS);
  assert.ok(!detail.body.includes("SYNTHETIC-OTHER-CASE"), "one case at a time");
  const v = detail.json.data.concern.version;
  assert.equal((await care("sgLead", { action: "escalate", concernId: ids.c1, version: v, escalation: "INTERNAL_REVIEW", reason: "x" })).status, 409, "an owner comes first");
  assert.equal((await care("sgLead", { action: "assign", concernId: ids.c1, version: v, ownerId: id("teacher") })).status, 400, "the owner must be a safeguarding member");
  assert.equal((await care("sgLead", { action: "assign", concernId: ids.c1, version: v, ownerId: id("sgDeputy") })).status, 200);
  assert.equal((await care("sgLead", { action: "note", concernId: ids.c1, version: v, body: "stale" })).status, 409, "a stale version is refused");
  assert.equal(await db.notification.count({ where: { userId: id("sgDeputy"), type: "SAFEGUARDING_CASE_ASSIGNED" } }), 1);
  assert.equal((await care("sgDeputy", { action: "escalate", concernId: ids.c1, version: v + 1, escalation: "EXTERNAL_REFERRAL", reason: "Pattern with previous observation; refer per CEDAR-SG-2026 §4" })).status, 200);
  assert.equal((await care("sgDeputy", { action: "note", concernId: ids.c1, version: v + 2, body: "Spoke with class teacher; no further marks seen." })).status, 200);
  const after = await db.safeguardingConcern.findUniqueOrThrow({ where: { id: ids.c1 } });
  assert.deepEqual([after.status, after.escalation, after.ownerId], ["ESCALATED", "EXTERNAL_REFERRAL", id("sgDeputy")]);
  assert.deepEqual((await db.safeguardingEntry.findMany({ where: { concernId: ids.c1 }, orderBy: { createdAt: "asc" } })).map(e => e.kind), ["CREATED", "OWNER", "ESCALATION", "NOTE"]);
});

test("disclosure: exact content and audience, second-lead approval bound to the text, never to an implicated guardian", async () => {
  let c = (await view("sgLead", `view=safeguarding&concernId=${ids.c1}`)).json.data;
  const msg = "We would like to meet you this week about Hana's wellbeing at school. Please call the school office.";
  const toA = await care("sgLead", { action: "propose-disclosure", concernId: ids.c1, recipientType: "GUARDIAN", recipientUserId: id("guardianA"), purpose: "Arrange a meeting", content: msg });
  assert.equal(toA.status, 409, "implicated guardians can receive nothing");
  // A lead narrows who is named: guardian A stays implicated, guardian B is not.
  assert.equal((await care("sgLead", { action: "implicated", concernId: ids.c1, version: c.concern.version, guardianUserIds: [id("guardianA")], reason: "Pupil named only guardian A" })).status, 200);
  c = (await view("sgLead", `view=safeguarding&concernId=${ids.c1}`)).json.data;
  assert.deepEqual(c.guardians.map((g: { name: string; implicated: boolean }) => [g.name, g.implicated]).sort(), [["Synthetic guardianA", true], ["Synthetic guardianB", false]]);
  const toB = await care("sgLead", { action: "propose-disclosure", concernId: ids.c1, recipientType: "GUARDIAN", recipientUserId: id("guardianB"), purpose: "Arrange a meeting", content: msg });
  assert.equal(toB.status, 201); ids.d1 = toB.json.data.id;
  assert.equal(await db.notification.count({ where: { userId: id("guardianB") } }), 0, "proposing sends nothing");
  const d = (await view("sgDeputy", `view=safeguarding&concernId=${ids.c1}`)).json.data.disclosures.find((x: { id: string }) => x.id === ids.d1);
  assert.equal((await care("sgLead", { action: "review-disclosure", id: ids.d1, decision: "APPROVE", contentHash: d.contentHash })).status, 403, "not by the proposer");
  assert.equal((await care("sgDeputy", { action: "release-disclosure", id: ids.d1 })).status, 409, "nothing is released before approval");
  assert.equal((await care("sgDeputy", { action: "review-disclosure", id: ids.d1, decision: "APPROVE", contentHash: "0".repeat(64) })).status, 409, "approval is bound to the exact text");
  assert.equal((await care("sgDeputy", { action: "review-disclosure", id: ids.d1, decision: "APPROVE", contentHash: d.contentHash })).status, 200);
  assert.equal((await care("sgDeputy", { action: "review-disclosure", id: ids.d1, decision: "APPROVE", contentHash: d.contentHash })).status, 409, "reviewed once");
  assert.equal((await care("sgLead", { action: "release-disclosure", id: ids.d1 })).status, 200);
  assert.equal(await db.notification.count({ where: { userId: id("guardianB"), type: "CARE_MESSAGE_FAMILY" } }), 1);
  assert.equal(await db.notification.count({ where: { userId: id("guardianA") } }), 0, "the implicated guardian hears nothing");
  const famB = await call("guardianB", "get", "/api/family/care-messages");
  assert.deepEqual(famB.json.data.map((m: { content: string }) => m.content), [msg], "the approved words, exactly");
  assert.ok(!famB.body.includes(ids.ref1) && !famB.body.includes("SYNTHETIC-OBSERVATION"), "no case reference or narrative");
  assert.deepEqual((await call("guardianA", "get", "/api/family/care-messages")).json.data, []);
  const declined = await care("sgDeputy", { action: "propose-disclosure", concernId: ids.c1, recipientType: "EXTERNAL_AGENCY", recipientName: "Synthetic Child Protection Unit", purpose: "Case referral", content: "Referral summary for SG case." });
  assert.equal((await care("sgLead", { action: "review-disclosure", id: declined.json.data.id, decision: "DECLINE" })).status, 200);
  assert.equal((await care("sgLead", { action: "release-disclosure", id: declined.json.data.id })).status, 409, "a declined disclosure stays restricted");
});

test("exports: one case only, audited; emergency access is short, audited, stops at expiry and is reviewed", async () => {
  const exp = await call("sgDeputy", "get", `/api/care/export?concernId=${ids.c1}`);
  assert.equal(exp.status, 200);
  assert.ok(exp.body.includes(ids.ref1) && exp.body.includes("SYNTHETIC-OBSERVATION-439"));
  assert.ok(!exp.body.includes("SYNTHETIC-OTHER-CASE") && !/Cetirizine|Peanut/.test(exp.body), "no other case or clinic detail");
  assert.equal(await db.confidentialAccessLog.count({ where: { schoolId, action: "EXPORT", recordId: ids.c1, actorId: id("sgDeputy") } }), 1);
  // Clinic emergency: any staff member at the campus, one student, minutes not hours.
  assert.equal((await care("teacher", { action: "emergency", domain: "CLINIC", studentId: ids.hana, purpose: "Reaction on trip", minutes: 600 })).status, 400);
  assert.equal((await care("teacher", { action: "emergency", domain: "SAFEGUARDING", studentId: ids.hana, purpose: "x", minutes: 30 })).status, 403, "only leaders open safeguarding emergency access");
  assert.equal((await care("southTeacher", { action: "emergency", domain: "CLINIC", studentId: ids.hana, purpose: "x", minutes: 30 })).status, 404, "another campus");
  const g = await care("teacher", { action: "emergency", domain: "CLINIC", studentId: ids.hana, purpose: "Possible allergic reaction on the science trip", minutes: 30 });
  assert.equal(g.status, 201); ids.g1 = g.json.data.id;
  assert.equal(await db.notification.count({ where: { userId: id("clinicLead"), type: "CONFIDENTIAL_EMERGENCY_ACCESS" } }), 1);
  const rec = await view("teacher", `view=clinic&studentId=${ids.hana}`);
  assert.equal(rec.status, 200);
  assert.equal(rec.json.data.access.emergency, true);
  assert.equal(rec.json.data.plan.allergies, "Peanuts (anaphylaxis)");
  assert.deepEqual([rec.json.data.visits.length, rec.json.data.doses.length], [0, 0], "emergency access shows what is needed to act, not the visit history");
  assert.equal((await view("teacher", `view=clinic&studentId=${ids.omar}`)).status, 403, "one student only");
  assert.equal((await call("teacher", "get", `/api/care/export?studentId=${ids.hana}`)).status, 200);
  // Expire it: the very next view and export are refused and logged.
  await db.emergencyAccess.update({ where: { id: ids.g1 }, data: { createdAt: new Date(Date.now() - 2 * 3_600_000), expiresAt: new Date(Date.now() - 3_600_000) } });
  assert.equal((await view("teacher", `view=clinic&studentId=${ids.hana}`)).status, 403);
  assert.equal((await call("teacher", "get", `/api/care/export?studentId=${ids.hana}`)).status, 403);
  assert.ok(await db.confidentialAccessLog.count({ where: { schoolId, actorId: id("teacher"), action: "DENIED", studentId: ids.hana } }) >= 2);
  // Safeguarding emergency by a leader; revoking it mid-session stops access.
  const sg = await care("principal", { action: "emergency", domain: "SAFEGUARDING", studentId: ids.hana, purpose: "Police at reception asking about pupil; lead unreachable", minutes: 15 });
  assert.equal(sg.status, 201); ids.g2 = sg.json.data.id;
  assert.equal((await view("principal", `view=safeguarding&studentId=${ids.hana}`)).json.data.length, 1);
  assert.equal((await view("principal", `view=safeguarding&concernId=${ids.c1}`)).status, 200);
  assert.equal((await view("principal", `view=safeguarding&concernId=${ids.c2}`)).status, 404, "another student's case stays closed");
  assert.equal((await care("principal", { action: "revoke-emergency", id: ids.g2 })).status, 200);
  assert.equal((await view("principal", `view=safeguarding&concernId=${ids.c1}`)).status, 404);
  assert.equal((await call("principal", "get", `/api/care/export?concernId=${ids.c1}`)).status, 404);
  // The leads review every grant, with what it was used for.
  const ov = await view("clinicLead", "view=oversight&domain=CLINIC");
  const grant = ov.json.data.grants.find((x: { id: string }) => x.id === ids.g1);
  assert.deepEqual([grant.live, grant.uses >= 2, grant.reviewedAt], [false, true, null]);
  assert.equal((await view("nurse", "view=oversight&domain=CLINIC")).status, 403, "lead only");
  assert.equal((await care("clinicLead", { action: "review-emergency", id: ids.g1, note: "" })).status, 400);
  assert.equal((await care("clinicLead", { action: "review-emergency", id: ids.g1, note: "Justified: reaction on trip, care plan used." })).status, 200);
  assert.equal((await care("sgLead", { action: "review-emergency", id: ids.g2, note: "Justified; lead was in a meeting. Police referred to lead." })).status, 200);
  assert.equal((await care("sgLead", { action: "review-emergency", id: ids.g2, note: "again" })).status, 409);
  assert.ok(await db.confidentialAccessLog.count({ where: { schoolId, action: { in: ["EMERGENCY_OPEN", "EMERGENCY_REVOKE", "EMERGENCY_REVIEW"] } } }) >= 5);
});

test("closing keeps the chronology; closed cases take no further changes", async () => {
  const c = (await view("sgDeputy", `view=safeguarding&concernId=${ids.c2}`)).json.data;
  assert.equal((await care("sgDeputy", { action: "close", concernId: ids.c2, version: c.concern.version, reason: "Resolved" })).status, 409, "an owner first");
  assert.equal((await care("sgDeputy", { action: "assign", concernId: ids.c2, version: c.concern.version, ownerId: id("sgDeputy") })).status, 200);
  assert.equal((await care("sgDeputy", { action: "close", concernId: ids.c2, version: c.concern.version + 1, reason: "" })).status, 400);
  assert.equal((await care("sgDeputy", { action: "close", concernId: ids.c2, version: c.concern.version + 1, reason: "Explained by documented sports injury; no further action." })).status, 200);
  assert.equal((await care("sgDeputy", { action: "escalate", concernId: ids.c2, version: c.concern.version + 2, escalation: "INTERNAL_REVIEW", reason: "x" })).status, 409);
  assert.deepEqual((await db.safeguardingEntry.findMany({ where: { concernId: ids.c2 }, orderBy: { createdAt: "asc" } })).map(e => e.kind), ["CREATED", "OWNER", "CLOSED"]);
});

test("screens: intake receipt, clinic record, case and disclosure review, emergency banner, phone, Arabic, no access", async () => {
  const t = await (await context("teacher")).newPage();
  await t.goto(`${base}/care`);
  await t.locator("[data-care-intake]").waitFor();
  await t.locator("[data-care-student-search]").fill("Omar");
  await t.locator(`[data-care-pick="${ids.omar}"]`).click();
  await t.locator("[data-care-observation]").fill("SYNTHETIC-UI-439: pupil seemed withdrawn and said he did not want to go home.");
  await t.locator("[data-care-submit]").click();
  await t.locator("[data-care-receipt]").waitFor();
  assert.match(await t.locator("[data-care-receipt]").innerText(), /not been sent to a guardian/);
  await shot(t, "01-intake-receipt");
  await t.close();
  const n = await (await context("nurse")).newPage();
  await n.goto(`${base}/care`);
  await n.locator('[data-care-tab="clinic"]').click();
  await n.locator("[data-clinic-queue]").waitFor();
  assert.ok(!(await n.locator("[data-clinic-queue]").innerText()).includes("Headache"), "no observation in the queue");
  await shot(n, "02-clinic-queue");
  assert.equal(await n.locator('[data-care-tab="safeguarding"]').count(), 0, "clinic members do not see the safeguarding workspace");
  await n.locator("[data-clinic-queue-instruction]").first().click();
  await n.locator("[data-clinic-record]").waitFor();
  await shot(n, "03-clinic-record");
  await n.close();
  const lead = await (await context("sgLead")).newPage();
  await lead.goto(`${base}/care`);
  await lead.locator('[data-care-tab="safeguarding"]').click();
  await lead.locator("[data-safeguarding-queue]").waitFor();
  await shot(lead, "04-safeguarding-queue");
  await lead.locator(`[data-safeguarding-row="${ids.ref1}"]`).click();
  await lead.locator(`[data-concern="${ids.c1}"]`).waitFor();
  await lead.locator("[data-concern-disclose]").click();
  await lead.locator("[data-disclosure-type]").selectOption("STAFF");
  await lead.locator("[data-disclosure-staff] option").nth(1).waitFor({ state: "attached" });
  await lead.locator("[data-disclosure-staff]").selectOption(id("teacher"));
  await lead.locator("[data-disclosure-purpose]").fill("Classroom support");
  await lead.locator("[data-disclosure-content]").fill("Please let Hana leave class to see me if she asks, without asking why.");
  await lead.locator("[data-disclosure-preview]").click();
  await lead.locator("[data-disclosure-confirm]").waitFor();
  await shot(lead, "05-disclosure-preview");
  await lead.locator("[data-disclosure-propose]").click();
  await lead.locator("[data-disclosure-confirm]").waitFor({ state: "detached" });
  await lead.close();
  const dep = await (await context("sgDeputy")).newPage();
  await dep.goto(`${base}/care`);
  await dep.locator('[data-care-tab="safeguarding"]').click();
  await dep.locator(`[data-safeguarding-row="${ids.ref1}"]`).click();
  await dep.locator("[data-disclosure-status=PROPOSED] [data-disclosure-review]").click();
  await dep.locator("[data-disclosure-review-modal]").waitFor();
  await shot(dep, "06-disclosure-review");
  await dep.locator("[data-disclosure-approve]").click();
  await dep.locator("[data-disclosure-review-modal]").waitFor({ state: "detached" });
  await dep.locator("[data-disclosure-status=APPROVED]").waitFor();
  await dep.close();
  await care("teacher", { action: "emergency", domain: "CLINIC", studentId: ids.hana, purpose: "Reaction during sports day", minutes: 15 });
  const em = await (await context("teacher")).newPage();
  await em.goto(`${base}/care`);
  await em.locator('[data-care-tab="emergency"]').click();
  await em.locator("[data-my-grant-open]").first().click();
  await em.locator("[data-care-emergency-banner]").waitFor();
  await shot(em, "07-emergency-banner");
  await em.close();
  const phone = await (await context("sgLead", { width: 390, height: 844 })).newPage();
  await phone.goto(`${base}/care`);
  await phone.locator('[data-care-tab="safeguarding"]').click();
  await phone.locator(`[data-safeguarding-row="${ids.ref1}"]`).click();
  await phone.locator(`[data-concern="${ids.c1}"]`).waitFor();
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true, "no sideways scroll at phone width");
  await shot(phone, "08-case-phone");
  await phone.close();
  const ar = await (await context("teacher-ar")).newPage();
  await ar.goto(`${base}/care`);
  await ar.locator("[data-care-intake]").waitFor();
  assert.equal(await ar.evaluate(() => document.documentElement.dir), "rtl");
  assert.match(await ar.locator("[data-care-intake] h2").innerText(), /[؀-ۿ]/);
  await shot(ar, "09-intake-ar");
  await ar.close();
  const fam = await (await context("guardianA")).newPage();
  await fam.goto(`${base}/care`);
  await fam.locator("[data-care-denied]").waitFor();
  await shot(fam, "10-family-no-access");
  await fam.close();
  const settings = await (await context("principal")).newPage();
  await settings.goto(`${base}/care`);
  await settings.locator('[data-care-tab="settings"]').click();
  await settings.locator("[data-care-setting=SAFEGUARDING][data-enabled=true]").waitFor();
  await shot(settings, "11-settings");
  await settings.close();
});

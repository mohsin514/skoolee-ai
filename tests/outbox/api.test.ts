import assert from "node:assert/strict";
import { after, test } from "node:test";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";
import { appendEvent, consume } from "../../src/lib/queue/outbox";
import { contentHash } from "../../src/lib/academic/report-versions";
import { reportWorkflow } from "../../src/lib/queue/report-workflow";
const url = new URL(process.env.DATABASE_URL || "http://invalid");
if (url.hostname !== "127.0.0.1" || url.port !== "55420" || url.pathname !== "/sko220_test") throw new Error("Synthetic local database required");
const db = new PrismaClient();
const base = "http://127.0.0.1:3220/api/owner/workflows";
const schoolId = "rehearsal-school";
async function token(role: string) {
  return new SignJWT({ userId: `role-${role}`, schoolId, role, email: `${role.toLowerCase()}@example.invalid`, campusId: "rehearsal-campus", onboardingComplete: true, schoolStatus: "ACTIVE" })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("10m").sign(new TextEncoder().encode("sko220-local-synthetic-test-secret"));
}
async function get(role: string, school = schoolId) { return fetch(`${base}?schoolId=${school}`, { headers: { Cookie: `skoolee_token=${await token(role)}` }, redirect: "manual" }); }
after(async () => db.$disconnect());
test("operator API rejects anonymous and every school role; APP_OWNER sees metadata only", async () => {
  assert.equal((await fetch(`${base}?schoolId=${schoolId}`, { redirect: "manual" })).status, 401);
  const roles = await db.$queryRaw<{ role: string }[]>`SELECT role::text AS role FROM users WHERE school_id=${schoolId}`;
  for (const { role } of roles) assert.equal((await get(role)).status, role === "APP_OWNER" ? 200 : 403, role);
  const report = await (await get("APP_OWNER")).text();
  assert.doesNotMatch(report, /Synthetic pupil|example.invalid|rehearsal-exam|marks_obtained/);
  assert.deepEqual(await (await get("APP_OWNER", "empty-synthetic-scope")).json(), { workflows: [] });
});
test("operator mutation is audited, cross-school reference is denied, deactivation invalidates existing token", async () => {
  const eventId = await db.$transaction(tx => appendEvent(tx, { schoolId, actorId: "role-PRINCIPAL", kind: "TEST", version: 1, referenceId: "rehearsal-exam", identity: `api-${Date.now()}` }));
  const headers = { Cookie: `skoolee_token=${await token("APP_OWNER")}`, "Content-Type": "application/json" };
  const selected = await (await fetch(`${base}?schoolId=${schoolId}&eventId=${eventId}`, { headers })).json();
  assert.equal(selected.workflows.length, 1);
  assert.equal(selected.workflows[0].id, eventId);
  const post = (body: unknown) => fetch(base, { method: "POST", headers, body: JSON.stringify(body) });
  assert.equal((await post({ schoolId: "outbox-school-b", eventId, action: "cancel" })).status, 409);
  assert.equal((await post({ schoolId, eventId, action: "cancel" })).status, 200);
  const logs = await db.$queryRaw<unknown[]>`SELECT id FROM audit_logs WHERE record_id=${eventId} AND school_id=${schoolId}`;
  assert.equal(logs.length, 1);
  await db.$executeRaw`UPDATE users SET is_active=false WHERE id='role-APP_OWNER'`;
  try { assert.equal((await fetch(`${base}?schoolId=${schoolId}`, { headers })).status, 401); }
  finally { await db.$executeRaw`UPDATE users SET is_active=true WHERE id='role-APP_OWNER'`; }
});

test("report publication and required event roll back together, then commit and deliver once", async () => {
  await db.$executeRaw`INSERT INTO report_cards (id,school_id,campus_id,student_id,exam_id,status)
    VALUES ('outbox-report',${schoolId},'rehearsal-campus','rehearsal-student','rehearsal-exam','REVIEWED') ON CONFLICT (student_id,exam_id) DO UPDATE SET status='REVIEWED'`;
  await db.$executeRaw`UPDATE exams SET status='PRINCIPAL_REVIEWED',is_locked=true,reviewed_at='2026-10-08T01:00:00Z' WHERE id='rehearsal-exam'`;
  await db.$executeRaw`UPDATE report_cards SET remarks_en='Synthetic approved remark' WHERE id='outbox-report'`;
  const reviewHeaders = { Cookie: `skoolee_token=${await token("PRINCIPAL")}`, "Content-Type": "application/json" };
  const queueResponse = await fetch("http://127.0.0.1:3220/api/reports?examId=rehearsal-exam", { headers: reviewHeaders });
  assert.equal(queueResponse.status, 200, await queueResponse.clone().text());
  const queue = await queueResponse.json();
  const card = queue.reportCards.find((card: { id: string }) => card.id === "outbox-report");
  const approval = await fetch("http://127.0.0.1:3220/api/reports", { method: "POST", headers: reviewHeaders, body: JSON.stringify({ action: "approve", examId: "rehearsal-exam", versions: [{ reportCardId: card.id, versionId: card.review.id }] }) });
  assert.equal(approval.status, 200, await approval.clone().text());
  const originalStatus = (await db.reportCard.findUniqueOrThrow({ where: { id: "outbox-report" } })).status;
  const identity = `report-published:rehearsal-exam:${contentHash([card.review.id])}`;
  const collision = await db.$transaction(tx => appendEvent(tx, { schoolId, actorId: "role-ADMIN", kind: "TEST", version: 1, referenceId: "rehearsal-exam", identity }));
  const headers = { Cookie: `skoolee_token=${await token("PRINCIPAL")}`, "Content-Type": "application/json" };
  const publish = () => fetch("http://127.0.0.1:3220/api/reports", { method: "POST", headers, body: JSON.stringify({ action: "publish", examId: "rehearsal-exam" }) });
  assert.equal((await publish()).status, 500);
  assert.equal((await db.$queryRaw<{ status: string }[]>`SELECT status FROM exams WHERE id='rehearsal-exam'`)[0].status, "PRINCIPAL_REVIEWED");
  assert.equal((await db.$queryRaw<{ status: string }[]>`SELECT status FROM report_cards WHERE id='outbox-report'`)[0].status, originalStatus);
  await db.$executeRaw`DELETE FROM workflow_events WHERE id=${collision}`;
  const response = await publish();
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  assert.equal(body.backgroundDelivery, "pending");
  const ref = { schoolId, eventId: body.workflowId };
  await Promise.all([consume(db, ref, reportWorkflow), consume(db, ref, reportWorkflow)]);
  assert.equal((await db.$queryRaw<{ state: string }[]>`SELECT state FROM workflow_jobs WHERE id=${ref.eventId}`)[0].state, "completed");
  assert.equal((await db.$queryRaw<unknown[]>`SELECT id FROM workflow_effects WHERE job_id=${ref.eventId}`).length, 1);
});

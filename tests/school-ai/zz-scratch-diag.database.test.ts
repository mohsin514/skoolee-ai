import { test, after } from "node:test";
import { PrismaClient } from "@prisma/client";
import { examProctorFixture, removeProctorFixture, proctorContext as ctx } from "./exam-proctor-fixture";
import { recordExamIntegrityEvent, reviewExamIntegrity } from "../../src/lib/school-ai/exam-integrity-service";
import { randomUUID } from "node:crypto";
import { auditHistoryScope } from "../../src/lib/audit-history";
process.env.SCHOOL_AI_STORAGE_DIR = "/private/tmp/skoolee-ai-figure-unit-storage";
const db = new PrismaClient();
after(async () => { await db.$disconnect(); });
test("diag", async () => {
  const f = await examProctorFixture(db, { integrityDays: 2 });
  try {
    const saved = await ctx(f.learner, () => recordExamIntegrityEvent(f.learner, f.assignment.id, { attemptId: f.attempt!.id, clientEventId: randomUUID(), kind: "PAGE_HIDDEN", observedAt: new Date().toISOString(), details: {} }));
    await ctx(f.admin, () => reviewExamIntegrity(f.admin, f.assignment.id, { eventId: saved.id, version: 1, decision: "DISMISSED", reason: "Learner used an approved accessibility tool." }));
    const all = await db.auditLog.findMany({ where: { schoolId: f.schoolId }, select: { id: true, tableName: true, campusId: true, recordId: true } });
    console.log("ALL AUDIT", JSON.stringify(all, null, 1));
    console.log("SCOPE", JSON.stringify(auditHistoryScope(f.admin)));
    const scoped = await db.auditLog.findMany({ where: auditHistoryScope(f.admin), select: { id: true, tableName: true, campusId: true } });
    console.log("SCOPED", JSON.stringify(scoped, null, 1));
  } finally { await removeProctorFixture(db, f.schoolId); }
});

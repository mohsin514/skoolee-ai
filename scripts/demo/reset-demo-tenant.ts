/**
 * SKO-452: reset the dedicated synthetic LEAP demo tenant to a known state.
 *
 *   DEMO_PASSWORD=… npx tsx scripts/demo/reset-demo-tenant.ts
 *
 * It only ever deletes and recreates one school: DEMO_SCHOOL_ID, whose name must carry the
 * "[Synthetic demo]" label. It refuses if that id belongs to anything else, never reads or changes
 * another tenant, and refuses a non-local database unless DEMO_RESET_ALLOW_REMOTE=1 is set on purpose.
 * Every person, message and record it creates is synthetic and labelled. No payment or real message is
 * created; the guardian's one next action is an in-app notification only.
 *
 * The state it builds supports the three-minute story in docs/leap/demo-runbook.md:
 *   1. an approved curriculum source and an approved paper a teacher can review and reuse;
 *   2. an exam in marks entry with its subject ready for a live paper scan (the scan itself, and the
 *      ambiguous 7/1 digit it catches, happen live through the product's own review gate);
 *   3. a guardian of two siblings with one allowed next action in the family inbox.
 */
import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";

export const DEMO_SCHOOL_ID = "skoolee-demo-synthetic";
export const DEMO_LABEL = "[Synthetic demo]";
const DEMO_NAME = `${DEMO_LABEL} Cedar Demo School`;

export type DemoManifest = { schoolId: string; accounts: { role: string; email: string }[]; counts: Record<string, number>; fingerprint: string };

function assertDatabaseAllowed(url: string | undefined) {
  const host = new URL(url ?? "http://invalid").hostname;
  if (host !== "127.0.0.1" && host !== "localhost" && process.env.DEMO_RESET_ALLOW_REMOTE !== "1") throw new Error(`Refusing to reset the demo tenant on ${host}. Set DEMO_RESET_ALLOW_REMOTE=1 only for the dedicated demo environment.`);
}

export async function resetDemoTenant(db: PrismaClient, password: string): Promise<DemoManifest> {
  if (!password || password.length < 12) throw new Error("Set DEMO_PASSWORD (12+ characters) for the synthetic demo accounts.");
  const existing = await db.school.findUnique({ where: { id: DEMO_SCHOOL_ID }, select: { name: true } });
  if (existing && !existing.name.startsWith(DEMO_LABEL)) throw new Error(`School ${DEMO_SCHOOL_ID} is not labelled "${DEMO_LABEL}". Nothing was changed.`);
  if (existing) await db.school.delete({ where: { id: DEMO_SCHOOL_ID } });

  const schoolId = DEMO_SCHOOL_ID, campusId = randomUUID(), hash = await bcrypt.hash(password, 12);
  await db.school.create({ data: { id: schoolId, name: DEMO_NAME, slug: schoolId, regId: "DEMO-0001", contactEmail: "demo-school@example.invalid", city: "Riyadh", status: "ACTIVE", plan: "PRO" } });
  await db.campus.create({ data: { id: campusId, schoolId, name: `${DEMO_LABEL} Main campus`, regId: "DEMO-C1", city: "Riyadh" } });
  await db.academicCycle.create({ data: { schoolId, campusId, label: "2026–27 synthetic term", academicYear: 2026, status: "ACTIVE" } });

  const accounts = [
    { key: "principal", role: "PRINCIPAL", name: `${DEMO_LABEL} Principal` },
    { key: "teacher", role: "TEACHER", name: `${DEMO_LABEL} Science Teacher` },
    { key: "guardian", role: "PARENT", name: `${DEMO_LABEL} Guardian` },
  ] as const;
  const ids: Record<string, string> = {};
  for (const a of accounts) {
    ids[a.key] = randomUUID();
    await db.user.create({ data: { id: ids[a.key], email: `demo-${a.key}@example.invalid`, password: hash, fullName: a.name, role: a.role, schoolId, campusId, isActive: true, onboardingComplete: true, preferredLanguage: "en" } });
  }

  const classIds: string[] = [];
  for (const section of ["A", "B"]) classIds.push((await db.class.create({ data: { schoolId, campusId, name: "Grade 7", section, academicYear: 2026, classTeacherId: ids.teacher, capacity: 30 } })).id);
  const subjectId = (await db.subject.create({ data: { schoolId, campusId, classId: classIds[0], name: "Science", teacherId: ids.teacher, totalMarks: 20 } })).id;
  const students: string[] = [];
  for (let i = 1; i <= 12; i++) {
    const s = await db.student.create({ data: { schoolId, campusId, classId: classIds[i <= 6 ? 0 : 1], fullName: `${DEMO_LABEL} Student ${String(i).padStart(2, "0")}`, rollNo: `D7-${String(i).padStart(2, "0")}`, gender: i % 2 ? "FEMALE" : "MALE", status: "active" } });
    students.push(s.id);
  }
  // A guardian of two siblings (students 01 and 07, one in each section).
  for (const studentId of [students[0], students[6]]) {
    const rel = await db.guardianRelationship.create({ data: { schoolId, campusId, studentId, guardianUserId: ids.guardian, createdByUserId: ids.principal, fullName: `${DEMO_LABEL} Guardian`, email: "demo-guardian@example.invalid", relationship: "Parent", status: "ACTIVE", verifiedAt: new Date() } });
    await db.guardianAccessVersion.create({ data: { schoolId, relationshipId: rel.id, createdByUserId: ids.principal, reason: "Synthetic demo fixture", effectiveFrom: new Date(Date.now() - 60_000), permissions: { learningRecords: true, attendance: true, finances: false, communication: true, pickup: false } } });
  }
  await db.exam.create({ data: { schoolId, campusId, classId: classIds[0], title: `${DEMO_LABEL} Science unit test`, term: "Term 1", academicYear: 2026, status: "MARKS_ENTRY" } });

  // The approved source and paper are created through the product's own workspace rules.
  const { createWorkspaceRecord, updateWorkspaceRecord } = await import("../../src/lib/school-ai/repository");
  const principal: AuthUser = { userId: ids.principal, schoolId, campusId, role: "PRINCIPAL", email: "demo-principal@example.invalid" };
  const curriculum = {
    subjectId, classId: classIds[0], academicYear: "2026", board: `${DEMO_LABEL} curriculum`,
    sources: [{ id: "source-1", title: `${DEMO_LABEL} Grade 7 science syllabus`, kind: "SYLLABUS" as const, reference: "Synthetic document, page 3", excerpt: "Plants make glucose by photosynthesis using light, water and carbon dioxide.", approved: true }],
    outcomes: [{ id: "outcome-1", title: "Explain what photosynthesis needs and makes", sourceId: "source-1", sourcePage: "3", included: true, taught: true }],
  };
  let cur = await createWorkspaceRecord(principal, { kind: "CURRICULUM", campusId, title: `${DEMO_LABEL} Grade 7 science`, data: curriculum, idempotencyKey: `demo-curriculum-${randomUUID()}` });
  cur = await updateWorkspaceRecord(principal, cur.id, { version: cur.version, action: "approve" });
  const paper = {
    curriculumId: cur.id, curriculumVersion: cur.version, subjectId, classId: classIds[0], language: "en" as const,
    blueprint: { title: `${DEMO_LABEL} Photosynthesis check`, durationMinutes: 20, totalMarks: 5, instructions: "Answer every question.", sections: [{ id: "a", title: "A", type: "SINGLE_CHOICE" as const, questionCount: 1, answerCount: 1, marksPerQuestion: 2, outcomeIds: ["outcome-1"] }, { id: "b", title: "B", type: "SHORT_TEXT" as const, questionCount: 1, answerCount: 1, marksPerQuestion: 3, outcomeIds: ["outcome-1"] }] },
    questions: [
      { id: "q1", sectionId: "a", type: "SINGLE_CHOICE" as const, prompt: "Which gas do plants take in for photosynthesis?", marks: 2, options: [{ id: "o1", text: "Carbon dioxide" }, { id: "o2", text: "Oxygen" }], correctOptionId: "o1", modelAnswer: "Carbon dioxide.", rubric: [{ id: "r1", criterion: "Correct choice", marks: 2 }], outcomeIds: ["outcome-1"], sourceRefs: [{ sourceId: "source-1", page: "3", excerpt: "using light, water and carbon dioxide" }], locked: false },
      { id: "q2", sectionId: "b", type: "SHORT_TEXT" as const, prompt: "Name two things a plant needs for photosynthesis.", marks: 3, options: [], correctOptionId: null, modelAnswer: "Any two of light, water and carbon dioxide.", rubric: [{ id: "r2", criterion: "Two correct inputs", marks: 3 }], outcomeIds: ["outcome-1"], sourceRefs: [{ sourceId: "source-1", page: "3", excerpt: "light, water and carbon dioxide" }], locked: false },
    ],
    generation: { kind: "MANUAL" as const, model: null, generatedAt: null },
  };
  let pap = await createWorkspaceRecord(principal, { kind: "PAPER", campusId, title: paper.blueprint.title, data: paper, idempotencyKey: `demo-paper-${randomUUID()}` });
  pap = await updateWorkspaceRecord(principal, pap.id, { version: pap.version, action: "approve" });

  // The guardian's one allowed next action: an in-app notification, nothing sent outside the product.
  await db.notification.create({ data: { schoolId, campusId, userId: ids.guardian, type: "DEMO", category: "ACTION", title: `${DEMO_LABEL} Review Student 01's science feedback`, message: "Synthetic demonstration data. Open the reviewed feedback and acknowledge it.", sourceType: "DEMO", sourceId: pap.id } });

  const counts = {
    users: await db.user.count({ where: { schoolId } }), classes: classIds.length, students: students.length,
    guardianLinks: await db.guardianRelationship.count({ where: { schoolId } }), exams: await db.exam.count({ where: { schoolId } }),
    approvedRecords: await db.schoolAiRecord.count({ where: { schoolId, status: "APPROVED" } }), familyActions: await db.notification.count({ where: { schoolId, category: "ACTION" } }),
  };
  const names = (await db.student.findMany({ where: { schoolId }, select: { fullName: true, rollNo: true }, orderBy: { rollNo: "asc" } })).map((s) => `${s.rollNo}:${s.fullName}`);
  const fingerprint = createHash("sha256").update(JSON.stringify({ counts, names, school: DEMO_NAME, paper: paper.questions.map((q) => q.prompt) })).digest("hex");
  return { schoolId, accounts: accounts.map((a) => ({ role: a.role, email: `demo-${a.key}@example.invalid` })), counts, fingerprint };
}

async function main() {
  assertDatabaseAllowed(process.env.DATABASE_URL);
  const db = new PrismaClient();
  try {
    const manifest = await resetDemoTenant(db, process.env.DEMO_PASSWORD ?? "");
    console.log(JSON.stringify(manifest, null, 2));
  } finally {
    await db.$disconnect();
    const { prisma } = await import("../../src/lib/db/prisma");
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.endsWith("reset-demo-tenant.ts")) main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exit(1); });

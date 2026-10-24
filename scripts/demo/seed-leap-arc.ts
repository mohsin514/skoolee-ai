/**
 * SKO-507: the pre-seeded part of the LEAP five-minute arc (plan §10), added on top of a fresh demo reset:
 *   - six more synthetic pupils in Grade 7 A (twelve in all) and a learner account for each, so a sitting has
 *     enough marked scripts for Item Watch;
 *   - an approved "Gases check" paper whose second item is ambiguous (Nitrogen against Air), and
 *   - two earlier released sittings for Grade 7 A (six and three weeks ago) whose marked scripts are the Exam
 *     Twin's evidence for the photosynthesis paper.
 * Every record is synthetic and labelled. Sittings go through the product's own create and release services;
 * only the historic scripts and their marks are written as fixtures, and the runbook says so.
 *
 *   DEMO_PASSWORD=… npx tsx scripts/demo/reset-demo-tenant.ts --leap
 */
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { AuthUser } from "../../src/lib/auth";
import { DEMO_LABEL, DEMO_SCHOOL_ID } from "./reset-demo-tenant";

type Script = { responses: Record<string, string>; marks: Record<string, number> };

export async function seedLeapArc(db: PrismaClient) {
  const { runWithTenantContext } = await import("../../src/lib/db/tenant-context");
  return runWithTenantContext({ schoolId: DEMO_SCHOOL_ID }, () => seed(db));
}

async function seed(db: PrismaClient) {
  const schoolId = DEMO_SCHOOL_ID;
  const principalRow = await db.user.findFirstOrThrow({ where: { schoolId, email: "demo-principal@example.invalid" } });
  const studentRow = await db.user.findFirstOrThrow({ where: { schoolId, email: "demo-student@example.invalid" } });
  const principal: AuthUser = { userId: principalRow.id, schoolId, campusId: principalRow.campusId, role: "PRINCIPAL", email: principalRow.email };
  const classA = await db.class.findFirstOrThrow({ where: { schoolId, name: "Grade 7", section: "A" } });
  for (let i = 13; i <= 18; i++) await db.student.create({ data: { schoolId, campusId: classA.campusId, classId: classA.id, fullName: `${DEMO_LABEL} Student ${i}`, rollNo: `D7-${i}`, gender: i % 2 ? "FEMALE" : "MALE", status: "active" } });
  const pupils = await db.student.findMany({ where: { schoolId, classId: classA.id, status: "active", archivedAt: null }, orderBy: { rollNo: "asc" } });
  for (const pupil of pupils) if (!pupil.studentUserId) {
    const user = await db.user.create({ data: { email: `demo-learner-${pupil.rollNo}@example.invalid`.toLowerCase(), password: studentRow.password, fullName: pupil.fullName, role: "STUDENT", schoolId, campusId: pupil.campusId, isActive: true, onboardingComplete: true, preferredLanguage: "en" } });
    await db.student.update({ where: { id: pupil.id }, data: { studentUserId: user.id } });
  }
  const learners = await db.student.findMany({ where: { schoolId, classId: classA.id, status: "active", archivedAt: null }, orderBy: { rollNo: "asc" } });

  const { createWorkspaceRecord, updateWorkspaceRecord } = await import("../../src/lib/school-ai/repository");
  const { createSchoolAiExam } = await import("../../src/lib/school-ai/exam-service");
  const { releaseResults } = await import("../../src/lib/school-ai/exam-release-service");
  const photosynthesis = await db.schoolAiRecord.findFirstOrThrow({ where: { schoolId, kind: "PAPER", status: "APPROVED" }, orderBy: { createdAt: "asc" } });
  const base = photosynthesis.data as { curriculumId: string; curriculumVersion: number; subjectId: string; classId: string; questions: Array<Record<string, unknown>> };
  const [plantsGas, inputs] = base.questions;
  const gases = {
    curriculumId: base.curriculumId, curriculumVersion: base.curriculumVersion, subjectId: base.subjectId, classId: base.classId, language: "en" as const,
    blueprint: { title: `${DEMO_LABEL} Gases check`, durationMinutes: 20, totalMarks: 7, instructions: "Answer every question.", sections: [{ id: "a", title: "A", type: "SINGLE_CHOICE" as const, questionCount: 2, answerCount: 2, marksPerQuestion: 2, outcomeIds: ["outcome-1"] }, { id: "b", title: "B", type: "SHORT_TEXT" as const, questionCount: 1, answerCount: 1, marksPerQuestion: 3, outcomeIds: ["outcome-1"] }] },
    questions: [
      { ...plantsGas, id: "q1" },
      // The seeded ambiguous item: "Air" is defensible to a careful reader, which Item Watch should surface.
      { id: "q2", sectionId: "a", type: "SINGLE_CHOICE" as const, prompt: "Which gas makes up most of the air around a leaf?", marks: 2, options: [{ id: "o1", text: "Nitrogen" }, { id: "o2", text: "Air" }], correctOptionId: "o1", modelAnswer: "Nitrogen.", rubric: [{ id: "r1", criterion: "Correct choice", marks: 2 }], outcomeIds: ["outcome-1"], sourceRefs: [{ sourceId: "source-1", page: "3", excerpt: "using light, water and carbon dioxide" }], locked: false },
      { ...inputs, id: "q3", sectionId: "b" },
    ],
    generation: { kind: "MANUAL" as const, model: null, generatedAt: null },
  };
  let paper = await createWorkspaceRecord(principal, { kind: "PAPER", campusId: classA.campusId, title: gases.blueprint.title, data: gases, idempotencyKey: `leap-gases-${randomUUID()}` });
  paper = await updateWorkspaceRecord(principal, paper.id, { version: paper.version, action: "approve" });

  const day = 86_400_000;
  const sit = async (paperId: string, title: string, weeksAgo: number, scripts: (index: number) => Script) => {
    const startsAt = new Date(Date.now() - weeksAgo * 7 * day), endsAt = new Date(startsAt.getTime() + 40 * 60_000);
    const exam = await createSchoolAiExam(principal, { idempotencyKey: randomUUID(), paperId, title, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), studentIds: learners.map(row => row.id), mode: "STANDARD" }, new Date(startsAt.getTime() - 60_000));
    for (const [index, learner] of learners.entries()) {
      const script = scripts(index);
      const review = { marks: Object.entries(script.marks).map(([questionId, marks]) => ({ questionId, marks, feedback: marks ? "Credit given against the rubric." : "Not yet: see the model answer." })), note: "Marked against the rubric.", total: Object.values(script.marks).reduce((sum, value) => sum + value, 0) };
      const attempt = await db.schoolAiExamAttempt.create({ data: { schoolId, campusId: learner.campusId, assignmentId: exam.id, studentId: learner.id, userId: learner.studentUserId!, startedAt: startsAt, deadlineAt: endsAt, submittedAt: new Date(startsAt.getTime() + 30 * 60_000), sequence: 2, status: "REVIEWED", responses: script.responses, review, reviewVersion: 1, reviewedById: principalRow.id, reviewedAt: new Date(endsAt.getTime() + day) } });
      await db.schoolAiExamResultRevision.create({ data: { schoolId, campusId: learner.campusId, assignmentId: exam.id, attemptId: attempt.id, version: 1, review, reason: "Initial marking", createdById: principalRow.id } });
    }
    await releaseResults(principal, exam.id);
    return exam.id;
  };
  // Gases check: the three strongest learners choose "Air" on the ambiguous item.
  const gasesSitting = await sit(paper.id, `${DEMO_LABEL} Gases check · term 1`, 6, index => {
    const strong = index < 3, weak = index >= 9;
    return { responses: { q1: weak ? "o2" : "o1", q2: strong ? "o2" : weak ? "o2" : "o1", q3: strong ? "Light, water and carbon dioxide" : "Light" }, marks: { q1: weak ? 0 : 2, q2: strong || weak ? 0 : 2, q3: strong ? 3 : weak ? 1 : 0 } };
  });
  const photosynthesisSitting = await sit(photosynthesis.id, `${DEMO_LABEL} Photosynthesis check · term 1`, 3, index => ({
    responses: { q1: index < 8 ? "o1" : "o2", q2: index < 4 ? "Light, water and carbon dioxide" : "Light and water" },
    marks: { q1: index < 8 ? 2 : 0, q2: index < 4 ? 3 : index < 9 ? 2 : 1 },
  }));
  return { learners: learners.length, gasesPaperId: paper.id, sittings: [gasesSitting, photosynthesisSitting] };
}

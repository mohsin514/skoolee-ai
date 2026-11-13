/**
 * SKAI-217: approved synthetic curricula for a QA school, so the J03 objective-map flow
 * (record a mapping, refresh, history, duplicate replay) can run in a QA lane.
 *
 * Uses the real School AI record lifecycle (create, then approve) as the school's QA admin.
 * Idempotent: an approved curriculum with the same title is left alone. Never creates credentials.
 * Requires pnpm run qa:seed and qa:seed:academics (classes + subjects) for the school first.
 *
 * Run:  pnpm run qa:seed:curriculum                  (qa-alpha: two boards)
 *       pnpm run qa:seed:curriculum -- --school=qa-beta   (one board)
 */
import { randomUUID } from "node:crypto";
import type { AuthUser } from "../../src/lib/auth";
import { prisma } from "../../src/lib/db/prisma";
import { runAsUser, runUnscoped } from "../../src/lib/db/tenant-context";
import { createWorkspaceRecord, updateWorkspaceRecord } from "../../src/lib/school-ai/repository";
import { assertSeedAllowed } from "./seed-env-guard";
import { boardsFor, curriculumFor } from "./curriculum-seed-plan";

async function main() {
  // School/admin lookups run before a school is bound; every school-scoped write below runs in its tenant context.
  return runUnscoped("qa curriculum seed: resolve synthetic QA school and admin", seed);
}

async function seed() {
  const decision = assertSeedAllowed();
  const slug = process.argv.find((a) => a.startsWith("--school="))?.split("=")[1] ?? "qa-alpha";
  if (!slug.startsWith("qa-")) throw new Error(`[qa-curriculum] refusing: "${slug}" is not a synthetic QA school`);
  console.log(`🧪 QA curriculum seed for ${slug} (${decision.name} @ ${decision.host})`);

  const school = await prisma.school.findUnique({ where: { slug } });
  if (!school) throw new Error(`[qa-curriculum] ${slug} is missing; run pnpm run qa:seed first`);
  const admin = await prisma.user.findUnique({ where: { schoolId_email: { schoolId: school.id, email: `admin@${slug}.qa.local` } } });
  if (!admin?.campusId) throw new Error(`[qa-curriculum] campus-scoped admin@${slug}.qa.local is missing; run pnpm run qa:seed first`);
  const subject = await prisma.subject.findFirst({ where: { schoolId: school.id, campusId: admin.campusId }, include: { class: true }, orderBy: [{ class: { name: "asc" } }, { name: "asc" }, { id: "asc" }] });
  if (!subject) throw new Error(`[qa-curriculum] no subject on the admin's campus; run pnpm run qa:seed:academics -- --school=${slug} first`);
  const lead: AuthUser = { userId: admin.id, schoolId: school.id, campusId: admin.campusId, role: admin.role, email: admin.email, accessVersion: admin.accessVersion };

  await runAsUser(lead, async () => {
  for (const board of boardsFor(slug)) {
    const existing = await prisma.schoolAiRecord.findFirst({ where: { schoolId: school.id, campusId: admin.campusId, kind: "CURRICULUM", title: board.title, status: "APPROVED" } });
    if (existing) { console.log(`  = ${board.title} (already approved)`); continue; }
    const data = curriculumFor(board, subject.id, subject.classId, subject.class.academicYear);
    const created = await createWorkspaceRecord(lead, { kind: "CURRICULUM", campusId: admin.campusId, title: board.title, data, idempotencyKey: randomUUID() });
    await updateWorkspaceRecord(lead, created.id, { version: created.version, action: "approve" });
    console.log(`  ✓ ${board.title} approved for ${subject.name} (${subject.class.name})`);
  }
  });
}

main().catch((e) => { console.error("❌ QA curriculum seed failed:", e); process.exit(1); }).finally(() => prisma.$disconnect());

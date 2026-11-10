/**
 * SKAI-1199 (SKO-166): seed one synthetic class of 100+ students in each QA school
 * (qa-alpha, qa-beta, qa-solo), on the school's first campus, so large-dataset QA can run.
 * Run after `pnpm run qa:seed` (the schools must exist). Fails closed on internet-facing
 * environments via prisma/seed-guard (ALLOW_HOSTED_SEED=1 for a deliberate dev run).
 *
 *   pnpm run qa:seed:large-class               (120 students per school)
 *   pnpm run qa:seed:large-class -- --size 250
 *
 * Idempotent: replaces only the QAL- roll numbers inside "QA Large Class"; touches no accounts
 * and never writes qa-credentials.json.
 */
import { PrismaClient } from "@prisma/client";
import { assertSeedAllowed } from "../../prisma/seed-guard";
import { SCHOOLS } from "./pilot-seed-plan";
import { LARGE_CLASS_NAME, LARGE_CLASS_ROLL_PREFIX, LARGE_CLASS_SECTION, largeClassRoster, parseSize } from "./large-class-plan";

const prisma = new PrismaClient();

async function main() {
  const decision = assertSeedAllowed();
  const flag = process.argv.indexOf("--size");
  const size = parseSize(flag >= 0 ? process.argv[flag + 1] : undefined);
  const academicYear = new Date().getFullYear();
  console.log(`[qa-large-class] ${decision.reason}; ${size} students per school`);
  for (const def of SCHOOLS) {
    const school = await prisma.school.findUnique({ where: { slug: def.slug }, select: { id: true } });
    if (!school) { console.warn(`[qa-large-class] ${def.slug} missing; run qa:seed first`); continue; }
    const campus = await prisma.campus.findFirst({ where: { schoolId: school.id }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!campus) { console.warn(`[qa-large-class] ${def.slug} has no campus; skipped`); continue; }
    const scope = { schoolId: school.id, campusId: campus.id };
    const existing = await prisma.class.findFirst({ where: { ...scope, name: LARGE_CLASS_NAME, section: LARGE_CLASS_SECTION, academicYear }, select: { id: true } });
    const klass = existing ?? await prisma.class.create({ data: { ...scope, name: LARGE_CLASS_NAME, section: LARGE_CLASS_SECTION, academicYear }, select: { id: true } });
    await prisma.$transaction([
      prisma.student.deleteMany({ where: { ...scope, classId: klass.id, rollNo: { startsWith: LARGE_CLASS_ROLL_PREFIX } } }),
      prisma.student.createMany({ data: largeClassRoster(def.slug, size).map((s) => ({ ...scope, classId: klass.id, ...s })) }),
    ]);
    console.log(`[qa-large-class] ${def.slug}: ${size} students in ${LARGE_CLASS_NAME} ${LARGE_CLASS_SECTION}`);
  }
}

void main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

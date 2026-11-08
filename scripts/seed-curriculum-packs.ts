/**
 * SKAI-1008..1012: seed the shipped DRAFT curriculum packs into the platform catalogue.
 *
 * Idempotent: an existing (packId, version) with the same content hash is left alone. A different
 * hash for an existing version is refused, because catalogue versions are immutable; bump the
 * pack's version instead. Never activates anything: activation is a per-campus, human-approved act.
 *
 * Safety: refuses a non-loopback database unless ALLOW_HOSTED_SEED=1 is set for a deliberate run.
 * Run: pnpm run seed:curriculum-packs
 */
import { PrismaClient, type Prisma } from "@prisma/client";
import { catalogueRow, shippedCurriculumPacks } from "../src/lib/school-ai/curriculum-pack-registry";

const url = process.env.DATABASE_URL ?? "";
const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
if (!["127.0.0.1", "localhost", "[::1]"].includes(host) && process.env.ALLOW_HOSTED_SEED !== "1") {
  console.error("Refusing to seed a non-loopback database. Set ALLOW_HOSTED_SEED=1 for a deliberate dev run.");
  process.exit(1);
}

const prisma = new PrismaClient();
async function main() {
  let created = 0, unchanged = 0;
  for (const pack of shippedCurriculumPacks()) {
    const row = catalogueRow(pack);
    const existing = await prisma.curriculumPackVersion.findUnique({ where: { packId_version: { packId: row.packId, version: row.version } } });
    if (existing) {
      if (existing.contentSha256 !== row.contentSha256) throw new Error(`${row.packId} v${row.version} already exists with different content. Bump the pack version; catalogue versions are immutable.`);
      unchanged++;
      continue;
    }
    await prisma.curriculumPackVersion.create({ data: { packId: row.packId, version: row.version, board: row.board, subject: row.subject, schoolGrade: row.schoolGrade, examYear: row.examYear, language: row.language, status: row.status, content: row.content as unknown as Prisma.InputJsonValue, contentSha256: row.contentSha256, unverified: row.unverified as unknown as Prisma.InputJsonValue } });
    created++;
  }
  console.log(`Curriculum catalogue: ${created} created, ${unchanged} unchanged.`);
}
main().finally(() => prisma.$disconnect()).catch(error => { console.error(error instanceof Error ? error.message : error); process.exit(1); });

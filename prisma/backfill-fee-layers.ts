// One-off backfill: convert legacy FeeStructure rows into the four-layer model.
// Run: DIRECT=$(grep '^DATABASE_URL' .env | sed 's/^DATABASE_URL=//' | tr -d '"' | sed 's/:6543/:5432/' | sed 's/[?&]pgbouncer=true//'); DATABASE_URL="$DIRECT" npx tsx prisma/backfill-fee-layers.ts
// Idempotent: skips campuses that already have new-model rows.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const slugify = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_{2,}/g, "_");

const TITLE = "MONTHLY_TUITION";

function typeNameFromKey(key: string): string {
  return key
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

async function main() {
  const campuses = await prisma.campus.findMany({ select: { id: true } });

  let totalGroups = 0;
  let totalLines = 0;
  let totalAssignments = 0;

  for (const campus of campuses) {
    const existingNewModel = await prisma.feeGroup.count({ where: { campusId: campus.id } });
    if (existingNewModel > 0) {
      console.log(`[skip] campus ${campus.id} already has fee groups`);
      continue;
    }

    const structures = await prisma.feeStructure.findMany({
      where: { campusId: campus.id },
      include: { class: { select: { id: true, name: true } } },
      orderBy: { activeFrom: "asc" },
    });

    for (const s of structures) {
      const className = s.class?.name ?? "Unknown";
      const groupName = `Legacy — ${className}`;

      const group = await prisma.feeGroup.create({
        data: { campusId: campus.id, name: groupName, description: `Backfilled from legacy structure (active from ${s.activeFrom.toISOString().slice(0, 10)})` },
      });
      totalGroups++;

      // Monthly tuition line
      let monthlyType = await prisma.feeType.findUnique({
        where: { campusId_code: { campusId: campus.id, code: TITLE } },
      });
      if (!monthlyType) {
        monthlyType = await prisma.feeType.create({
          data: { campusId: campus.id, name: "Monthly Tuition", code: TITLE, description: "Monthly tuition fee" },
        });
      }

      await prisma.feesMasterLine.create({
        data: { campusId: campus.id, feeGroupId: group.id, feeTypeId: monthlyType.id, amount: s.monthlyFee },
      });
      totalLines++;

      // One-time fees
      const oneTime: Record<string, number> =
        typeof s.oneTimeFeesJson === "string"
          ? JSON.parse(s.oneTimeFeesJson ?? "{}")
          : (s.oneTimeFeesJson as Record<string, number> | null) ?? {};

      for (const [key, amount] of Object.entries(oneTime)) {
        const code = slugify(key);
        let type = await prisma.feeType.findUnique({
          where: { campusId_code: { campusId: campus.id, code } },
        });
        if (!type) {
          type = await prisma.feeType.create({
            data: { campusId: campus.id, name: typeNameFromKey(key), code, description: `Backfilled from legacy "${key}"` },
          });
        }
        await prisma.feesMasterLine.create({
          data: { campusId: campus.id, feeGroupId: group.id, feeTypeId: type.id, amount },
        });
        totalLines++;
      }

      // Assignment: legacy rows are per class; one group per class.
      const academicYear = s.activeFrom.getFullYear();
      const exists = await prisma.feeGroupAssignment.findFirst({
        where: { feeGroupId: group.id, classId: s.classId, academicYear },
      });
      if (!exists) {
        await prisma.feeGroupAssignment.create({
          data: { campusId: campus.id, feeGroupId: group.id, classId: s.classId, academicYear },
        });
        totalAssignments++;
      }
    }
  }

  console.log(`Done. groups=${totalGroups} lines=${totalLines} assignments=${totalAssignments}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

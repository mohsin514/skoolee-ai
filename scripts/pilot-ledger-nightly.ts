import { prisma } from "../src/lib/db/prisma";
import { snapshotSchool } from "../src/lib/school-ai/pilot-ledger-service";
import { runUnscoped } from "../src/lib/db/tenant-context";

// SKO-507: nightly Pilot Ledger snapshots, only for schools that opted in. Schedule once a night (e.g. cron
// `15 2 * * *` running `npx tsx scripts/pilot-ledger-nightly.ts`). One school's failure never stops the others.
async function main() {
  // The one cross-school read: which schools opted in. Each snapshot then runs in that school's own context.
  const schools = await runUnscoped("pilot ledger: list opted-in schools", () => prisma.pilotLedgerSetting.findMany({ where: { optedIn: true }, select: { schoolId: true } }));
  let done = 0;
  for (const { schoolId } of schools) {
    try { await snapshotSchool(schoolId); done++; }
    catch (error) { console.error(`[pilot-ledger] ${schoolId}: ${error instanceof Error ? error.message : String(error)}`); }
  }
  console.log(`[pilot-ledger] snapshots written: ${done} of ${schools.length}`);
}
main().finally(() => prisma.$disconnect());

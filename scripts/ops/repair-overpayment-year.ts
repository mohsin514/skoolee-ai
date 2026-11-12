// SKAI-1543: move overpayment credits recorded under the payment's calendar year to the invoice's
// academic year. Dry run by default; pass --apply to write. One school per run.
// Usage: DATABASE_URL=… npx tsx scripts/ops/repair-overpayment-year.ts --school <id> --before <ISO date of the fix deploy> [--apply]
import { PrismaClient } from "@prisma/client";
import { repairMisdatedCredits } from "../../src/lib/fees/repair-carry-year";

const arg = (name: string) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };
const schoolId = arg("--school");
const before = arg("--before") ? new Date(arg("--before")!) : undefined;
if (!schoolId || !before || Number.isNaN(before.getTime())) { console.error("--school and a valid --before date are required"); process.exit(2); }
const apply = process.argv.includes("--apply");

const db = new PrismaClient();
db.$transaction(tx => repairMisdatedCredits(tx as never, { schoolId, before, apply }), { timeout: 120_000 })
  .then(steps => {
    for (const s of steps) console.log(s.kind === "move" ? `move payment=${s.paymentId} credit=${s.credit} ${s.currency} toYear ${s.fromToYear} -> ${s.toToYear}` : `skip payment=${s.paymentId}: ${s.reason}`);
    console.log(`${steps.length} step(s). ${apply ? "Applied." : "Dry run; pass --apply to write."}`);
  })
  .finally(() => db.$disconnect());

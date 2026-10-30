// SKO-475: run before applying the receipt-uniqueness migration to an environment with existing data.
// Lists every (campus, receipt number) issued more than once so each conflict can be reviewed and given
// a corrected number through a correction record; settled payments are never edited silently.
// Usage: DATABASE_URL=… npx tsx scripts/check-receipt-duplicates.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
async function main() {
  const rows = await db.$queryRaw<{ campus_id: string; receipt_no: string; payments: string[] }[]>`
    SELECT campus_id, receipt_no, array_agg(id ORDER BY created_at) AS payments
    FROM payments WHERE receipt_no IS NOT NULL GROUP BY campus_id, receipt_no HAVING count(*) > 1 ORDER BY campus_id, receipt_no`;
  if (!rows.length) { console.log("No duplicate receipt numbers. The uniqueness migration can be applied."); return; }
  console.log(`${rows.length} duplicated receipt number(s). Resolve each before applying the migration:`);
  for (const row of rows) console.log(`campus=${row.campus_id} receipt=${row.receipt_no} payments=${row.payments.join(",")}`);
  process.exitCode = 1;
}
main().finally(() => db.$disconnect());

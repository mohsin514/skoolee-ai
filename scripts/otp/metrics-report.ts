// SKAI-954 / SKAI-897: print the V5/V6 phone OTP report.  npx tsx scripts/otp/metrics-report.ts [days=30]
import { prisma } from "../../src/lib/db/prisma";
import { otpMetrics } from "../../src/lib/auth/otp/metrics";

async function main() {
  const days = Number(process.argv[2]) || 30;
  const rows = await prisma.otpDelivery.findMany({ where: { sentAt: { gte: new Date(Date.now() - days * 86_400_000) } } });
  console.log(JSON.stringify(otpMetrics(rows), null, 2));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

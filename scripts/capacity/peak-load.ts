/**
 * SKO-451 release performance run: `DATABASE_URL=<isolated> CAPACITY_OPERATOR_EMAIL=… CAPACITY_OPERATOR_PASSWORD=…
 * npx tsx scripts/capacity/peak-load.ts [origin] [seconds]`. Synthetic data on the isolated database and a localhost
 * app only; never reads .env. Writes test-results/capacity/<run>.json and .md and records the run for operators.
 */
import { PrismaClient } from "@prisma/client";
import { assertIsolated, peakFixtures, runMorningPeak, signIn } from "../../tests/capacity/peak-profile";

const origin = process.argv[2] || "http://localhost:3107", seconds = Number(process.argv[3] || 30);
assertIsolated(origin);
const email = process.env.CAPACITY_OPERATOR_EMAIL, password = process.env.CAPACITY_OPERATOR_PASSWORD;
if (!email || !password) throw new Error("Set CAPACITY_OPERATOR_EMAIL and CAPACITY_OPERATOR_PASSWORD for a synthetic platform operator.");
const db = new PrismaClient();
async function main() {
  const fixtures = await peakFixtures(db, origin, { pupils: 16, noisyStudents: 1500 });
  try {
    const out = await runMorningPeak(origin, await signIn(origin, email!, password!), fixtures, { durationMs: seconds * 1000, noisyConcurrency: 6, outDir: "test-results/capacity", noisyStudents: 1500 });
    console.log(JSON.stringify({ runId: out.report.runId, passed: out.recorded.passed, objectives: out.objectives }, null, 2));
    if (!out.recorded.passed) process.exitCode = 1;
  } finally { await fixtures.cleanup(); await db.$disconnect(); }
}
void main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });

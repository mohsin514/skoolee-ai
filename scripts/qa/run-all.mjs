#!/usr/bin/env node
// Runs every QA suite. Exit 1 if any fails — wire this into CI.
// Point it at a BUILT server, not `next dev`: a request racing an HMR
// recompile returned a pre-fix response during this engagement and would
// flake in CI.
import { spawnSync } from "node:child_process";
const SUITES = [
  ["§2  isolation sweep (1074 assertions)", "scripts/qa/isolation-sweep.mjs"],
  ["§2  cross-tenant writes (ISO-2.x)",     "scripts/qa/probe-iso-2-writes.mjs"],
  ["§2  ISO-6.1 cross-campus attack",       "scripts/qa/probe-iso-6.1-timetable.mjs"],
  ["§2  ISO-6.1 positive (regression)",     "scripts/qa/probe-iso-6.1-positive.mjs"],
  ["§3  auth / session / licence",          "scripts/qa/probe-auth-3.mjs"],
  ["§9  security suite",                    "scripts/qa/probe-sec-9.mjs"],
  ["§4  role packs",                        "scripts/qa/probe-role-packs.mjs"],
  ["§10.2 permission-matrix enforcement",   "scripts/qa/permission-matrix.mjs"],
  ["§5  cross-module interlink chains",     "scripts/qa/probe-interlink-5.mjs"],
  ["§6.5 tenant timezone",                  "scripts/qa/probe-timezone.mjs"],
  ["FINDING-D one email, two schools",      "scripts/qa/probe-finding-d.mjs"],
  ["OWN-6 / INT-1 / MF-3 deletion",         "scripts/qa/probe-own-6-delete-school.mjs"],
];
let failed = 0;
for (const [name, script] of SUITES) {
  const r = spawnSync("node", [script], { encoding: "utf8" });
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  if (!ok) console.log((r.stdout || "").split("\n").slice(-14).join("\n"));
}
console.log(`\n${failed ? `${failed} suite(s) FAILED` : "all suites passed"}`);
process.exit(failed ? 1 : 0);

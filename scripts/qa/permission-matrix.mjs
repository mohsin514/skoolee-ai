// §10.2 — assert the permission matrix is actually ENFORCED, not just stored.
//
// Uses T3-CAMPUS_ADMIN, whose RolePermission rows revoke all 4 actions on all
// 17 modules (seeded by seed-fixtures.mjs). If enforcement works, every module
// endpoint must refuse it. Anything that answers 200 is a permission bit the
// UI lets an admin set but the server ignores.
import { readFileSync } from "node:fs";
const BASE = "http://localhost:3000";
const fx = JSON.parse(readFileSync("docs/qa/fixtures.json", "utf8"));

// One representative read endpoint per permission module.
const MODULE_VIEW = {
  students:     "/students",
  fees:         "/fees/types",
  payroll:      "/payroll",
  leave:        "/leave",
  attendance:   "/attendance/history",
  timetable:    "/timetable",
  exams:        "/exams",
  reports:      "/reports",
  staff:        "/staff",
  admissions:   "/admission-queries",
  accounts:     "/accounts/ledger",
  ai:           "/ai/insights",
  library:      "/library/books",
  "front-desk": "/front-desk/visitors",
  transport:    "/transport/vehicles",
  inventory:    "/inventory/items",
  dormitory:    "/dormitory/rooms",
};

const revoked = fx.personas["T3-CAMPUS_ADMIN"];
if (!revoked?.token) { console.error("T3-CAMPUS_ADMIN token missing — re-run capture-tokens"); process.exit(2); }

console.log("\n── §10.2 permission-matrix enforcement ──");
console.log("   persona: T3-CAMPUS_ADMIN — all 17 modules revoked (view/add/edit/delete)\n");
console.log("   every row below MUST be denied\n");

const rows = [];
for (const [module, path] of Object.entries(MODULE_VIEW)) {
  const res = await fetch(`${BASE}/api${path}`, { headers: { cookie: `skoolee_token=${revoked.token}` } });
  // 403 = correctly denied. 401/404/405 = denied for another reason (still not a leak).
  // 200 = the revoked permission was ignored.
  const enforced = res.status !== 200;
  rows.push({ module, path, status: res.status, enforced });
  console.log(`  ${enforced ? "DENIED " : "ALLOWED"}  ${module.padEnd(12)} GET ${path.padEnd(24)} HTTP ${res.status}${enforced ? "" : "   <-- permission ignored"}`);
}

// Previously fees/timetable/exams/ai were accepted gaps: they are SHARED
// surfaces (families read their own timetable, results and fee schedule through
// them), so the staff-only assertModuleRead() could not be applied. They now use
// assertSharedModuleRead(), which enforces the view bit for staff and leaves the
// family path to each route's own scoping. All 17 modules are enforced, so this
// set is empty — any entry appearing here again is a regression to justify.
const ACCEPTED_GAPS = new Set([]);

const ignored = rows.filter((r) => !r.enforced && !ACCEPTED_GAPS.has(r.module));
const accepted = rows.filter((r) => !r.enforced && ACCEPTED_GAPS.has(r.module));
console.log(`\n${"=".repeat(72)}`);
console.log(`  modules tested        : ${rows.length}`);
console.log(`  correctly denied      : ${rows.length - ignored.length}`);
console.log(`  PERMISSION IGNORED    : ${ignored.length}`);
if (ignored.length) console.log(`  -> ${ignored.map((r) => r.module).join(", ")}`);
console.log(`  known accepted gaps   : ${accepted.length}${accepted.length ? "  (" + accepted.map((r) => r.module).join(", ") + ")" : ""}`);
console.log("=".repeat(72));
process.exit(ignored.length ? 1 : 0);

// FINDING-D — one person, accounts at two schools.
// The case the product could not represent: a parent with children at two
// institutions, or a teacher working across two groups.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
const BASE = "http://localhost:3000";
const fx = JSON.parse(readFileSync("docs/qa/fixtures.json", "utf8"));
const prisma = new PrismaClient();
const T1 = fx.tenants.T1, T2 = fx.tenants.T2;
const SHARED = "shared.parent@example.invalid";
const PW = "SharedParent#2026";
const out = [];
const check = (name, cond, detail = "") => {
  out.push({ name, pass: !!cond });
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const login = (body) => fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

console.log("\n── FINDING-D: one address, two schools ──\n");
await prisma.user.deleteMany({ where: { email: SHARED } });
const hash = bcrypt.hashSync(PW, 10);

// The write that was previously impossible.
let created = 0;
for (const [tag, t] of [["T1", T1], ["T2", T2]]) {
  try {
    await prisma.user.create({ data: {
      schoolId: t.schoolId, campusId: t.campuses[0].id, email: SHARED,
      fullName: `Shared Parent (${tag})`, role: "PARENT", password: hash,
      isActive: true, onboardingComplete: true } });
    created++;
  } catch (e) { console.log(`    create in ${tag} failed: ${String(e).slice(0, 90)}`); }
}
check("same email can hold an account at BOTH schools", created === 2, `${created}/2 created`);

// Still exactly one per school.
let dupBlocked = false;
try {
  await prisma.user.create({ data: {
    schoolId: T1.schoolId, campusId: T1.campuses[0].id, email: SHARED,
    fullName: "Duplicate", role: "PARENT", password: hash, isActive: true } });
} catch { dupBlocked = true; }
check("a SECOND account on the same email in the SAME school is still rejected", dupBlocked);

// Login must ask which school — and only after the password checks out.
const amb = await login({ email: SHARED, password: PW });
const ambBody = await amb.json();
check("login asks which school", ambBody.needsSchoolSelection === true, `HTTP ${amb.status}`);
check("it lists both schools", (ambBody.schools || []).length === 2,
  (ambBody.schools || []).map((s) => s.schoolName).join(" | "));
check("no cookie issued before the choice is made", !(amb.headers.get("set-cookie") || "").includes("skoolee_token"));

// Enumeration must not regress: a WRONG password reveals nothing (AUTH-1.2).
const wrong = await login({ email: SHARED, password: "WrongPassword#1" });
const wrongBody = await wrong.text();
check("wrong password does NOT reveal the school list",
  wrong.status === 401 && !wrongBody.includes("needsSchoolSelection"), `HTTP ${wrong.status}`);

// Choosing a school signs in to that tenant only.
for (const [tag, t] of [["T1", T1], ["T2", T2]]) {
  const r = await login({ email: SHARED, password: PW, schoolId: t.schoolId });
  const tok = (r.headers.get("set-cookie") || "").match(/skoolee_token=([^;]+)/)?.[1];
  const body = await r.json();
  check(`choosing ${tag} signs in to ${tag}`, !!tok && body?.user?.schoolId === t.schoolId,
    `HTTP ${r.status} school=${body?.user?.schoolName ?? "?"}`);
}

// A single-tenant address must still log in with no extra step (no regression).
const solo = await login({ email: fx.personas["T1-CAMPUS_ADMIN"].email, password: fx.password });
const soloTok = (solo.headers.get("set-cookie") || "").match(/skoolee_token=([^;]+)/)?.[1];
check("single-school login unchanged (no extra step)", !!soloTok, `HTTP ${solo.status}`);

await prisma.user.deleteMany({ where: { email: SHARED } });
const failed = out.filter((x) => !x.pass);
console.log(`\n${"=".repeat(62)}\n  ${out.length - failed.length}/${out.length} passed`);
console.log("=".repeat(62));
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);

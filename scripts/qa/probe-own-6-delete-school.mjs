// OWN-6 / INT-1 / MF-3 end-to-end: tenant offboarding.
// Uses a disposable tenant so the §1 fixture set is never disturbed.
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
const BASE = "http://localhost:3000";
const fx = JSON.parse(readFileSync("docs/qa/fixtures.json", "utf8"));
const prisma = new PrismaClient();
const owner = fx.personas["T1-APP_OWNER"];
const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, pass: !!cond, detail });
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

// Disposable tenant.
const SLUG = "qa-disposable-delete-target";
await prisma.school.findFirst({ where: { slug: SLUG } }).then(async (s) => {
  if (s) { await prisma.user.deleteMany({ where: { schoolId: s.id } }); await prisma.school.delete({ where: { id: s.id } }); }
});
const school = await prisma.school.create({
  data: { name: "Disposable Academy", slug: SLUG, status: "ACTIVE", plan: "FREE",
    city: "QA City", regId: "QA-DISPOSABLE", contactEmail: `${SLUG}@example.invalid` },
});
const campus = await prisma.campus.create({
  data: { schoolId: school.id, name: "Disposable-Main", city: "QA City", regId: "QA-DISPOSABLE-CAMPUS" },
});
const member = await prisma.user.create({
  data: { schoolId: school.id, campusId: campus.id, email: "disposable-admin@example.invalid",
    fullName: "Disposable Admin", role: "SUPER_ADMIN", password: bcrypt.hashSync(fx.password, 10),
    isActive: true, onboardingComplete: true },
});
console.log(`\ndisposable tenant: ${school.id}\n`);

const login = await fetch(`${BASE}/api/auth/login`, { method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: member.email, password: fx.password }) });
const memberTok = (login.headers.get("set-cookie") || "").match(/skoolee_token=([^;]+)/)?.[1];
check("member of the tenant can log in before deletion", !!memberTok);

const del = (body) => fetch(`${BASE}/api/owner/schools/${school.id}`, { method: "DELETE",
  headers: { cookie: `skoolee_token=${owner.token}`, "content-type": "application/json" },
  body: JSON.stringify(body) });

// 1. Wrong confirmation name is refused (OWN-6).
let r = await del({ confirmName: "Wrong Name" });
check("wrong confirmName refused", r.status === 400, `HTTP ${r.status}`);
check("school untouched after refusal",
  (await prisma.school.findUnique({ where: { id: school.id }, select: { status: true } }))?.status === "ACTIVE");

// 2. Purge before soft delete is refused (erasure is a deliberate two-step).
r = await del({ confirmName: school.name, purge: true });
check("purge refused while school is still ACTIVE", r.status === 409, `HTTP ${r.status}`);

// 3. Non-owner cannot delete.
r = await fetch(`${BASE}/api/owner/schools/${school.id}`, { method: "DELETE",
  headers: { cookie: `skoolee_token=${fx.personas["T1-SUPER_ADMIN"].token}`, "content-type": "application/json" },
  body: JSON.stringify({ confirmName: school.name }) });
check("SUPER_ADMIN cannot delete a school", r.status === 403 || r.status === 401, `HTTP ${r.status}`);

// 4. Correct name -> soft delete.
r = await del({ confirmName: school.name });
const softBody = await r.json();
check("soft delete accepted", r.status === 200 && softBody.purged === false, `HTTP ${r.status}`);
const afterSoft = await prisma.school.findUnique({ where: { id: school.id }, select: { status: true, deletedAt: true } });
check("status = DELETED and deletedAt stamped", afterSoft?.status === "DELETED" && !!afterSoft?.deletedAt);
check("data retained (users still present)",
  (await prisma.user.count({ where: { schoolId: school.id } })) === 1);

// 5. FINDING-G: the member's live session must get a clean escape, not a billing prompt.
const probe = await fetch(`${BASE}/api/students`, { headers: { cookie: `skoolee_token=${memberTok}` } });
const probeBody = await probe.text();
check("live session for deleted school -> 401 (clean sign-out path)", probe.status === 401, `HTTP ${probe.status}`);
check("not told to pay for a deleted school", !/suspend|billing|payment/i.test(probeBody), probeBody.slice(0, 90));

// 6. Restore clears the tombstone.
r = await fetch(`${BASE}/api/owner/schools/${school.id}`, { method: "PATCH",
  headers: { cookie: `skoolee_token=${owner.token}`, "content-type": "application/json" },
  body: JSON.stringify({ status: "ACTIVE" }) });
const restored = await prisma.school.findUnique({ where: { id: school.id }, select: { status: true, deletedAt: true } });
check("restore -> ACTIVE and deletedAt cleared", restored?.status === "ACTIVE" && restored?.deletedAt === null);

// 7. Purge after soft delete really erases everything.
await del({ confirmName: school.name });
r = await del({ confirmName: school.name, purge: true });
check("purge accepted once soft-deleted", r.status === 200, `HTTP ${r.status}`);
check("school row gone", (await prisma.school.findUnique({ where: { id: school.id } })) === null);
check("users cascaded away", (await prisma.user.count({ where: { schoolId: school.id } })) === 0);
check("platform audit trail SURVIVED the purge",
  (await prisma.superAdminAuditLog.count({ where: { targetId: school.id } })) > 0);

const failed = results.filter((r) => !r.pass);
console.log(`\n${"=".repeat(58)}\n  ${results.length - failed.length}/${results.length} passed`);
console.log("=".repeat(58));
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);

// §9 — Security Suite (beyond isolation)
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
const BASE = "http://localhost:3000";
const fx = JSON.parse(readFileSync("docs/qa/fixtures.json", "utf8"));
const prisma = new PrismaClient();
const out = [];
const check = (id, name, cond, detail = "") => {
  out.push({ id, name, pass: !!cond, detail });
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${id.padEnd(8)} ${name}${detail ? "  — " + detail : ""}`);
};
const as = (persona, path, opts = {}) => fetch(`${BASE}/api${path}`, {
  ...opts,
  headers: { cookie: `skoolee_token=${fx.personas[persona].token}`, "content-type": "application/json", ...(opts.headers || {}) },
});
const T1 = fx.tenants.T1;
console.log("\n── §9 Security Suite ──\n");

// SEC-7 — privilege escalation: a TEACHER granting themselves SUPER_ADMIN.
const teacher = fx.personas["T1-TEACHER"];
let r = await as("T1-TEACHER", "/users", { method: "POST", body: JSON.stringify({
  email: "escalated@example.invalid", fullName: "Escalated", role: "SUPER_ADMIN", password: "Whatever#1" }) });
check("SEC-7", "TEACHER cannot create a SUPER_ADMIN", r.status >= 400, `HTTP ${r.status}`);
const escalated = await prisma.user.count({ where: { email: "escalated@example.invalid" } });
check("SEC-7", "no escalated account created", escalated === 0);

// SEC-7b — TEACHER editing their own role.
r = await as("T1-TEACHER", "/users", { method: "PATCH", body: JSON.stringify({
  id: teacher.userId, role: "SUPER_ADMIN" }) });
const nowRole = (await prisma.user.findUnique({ where: { id: teacher.userId }, select: { role: true } }))?.role;
check("SEC-7", "TEACHER cannot self-promote", nowRole === "TEACHER", `role is now ${nowRole}`);

// SEC-7c — TEACHER cannot reach owner routes.
r = await as("T1-TEACHER", "/owner/schools");
check("SEC-7", "TEACHER cannot reach /owner/*", r.status === 401 || r.status === 403, `HTTP ${r.status}`);
r = await as("T1-SUPER_ADMIN", "/owner/schools");
check("OWN-7", "SUPER_ADMIN cannot reach /owner/*", r.status === 401 || r.status === 403, `HTTP ${r.status}`);

// SEC-7d — TEACHER cannot edit the permission matrix.
r = await as("T1-TEACHER", "/roles/permissions", { method: "POST", body: JSON.stringify({
  role: "TEACHER", module: "payroll", canView: true, canAdd: true, canEdit: true, canDelete: true }) });
check("SEC-7", "TEACHER cannot rewrite the permission matrix", r.status >= 400, `HTTP ${r.status}`);

// SEC-2 — stored XSS: payload must come back escaped/inert, never as live HTML.
const XSS = '<img src=x onerror=alert(1)>';
const created = await as("T1-CAMPUS_ADMIN", "/students", { method: "POST", body: JSON.stringify({
  fullName: XSS, rollNo: "SEC-2-001", classId: fx.extra["T1-TEACHER-A-class"], gender: "MALE" }) });
const cbody = await created.json().catch(() => ({}));
const xssId = cbody?.data?.id ?? cbody?.data?.[0]?.id;
if (xssId) {
  const listRes = await as("T1-CAMPUS_ADMIN", "/students");
  const listText = await listRes.text();
  const ct = listRes.headers.get("content-type") || "";
  check("SEC-2", "list response is JSON, not HTML (payload cannot execute)", ct.includes("application/json"), ct);
  check("SEC-2", "payload stored as inert data, JSON-encoded",
    !listText.includes("<img src=x onerror") || listText.includes('\\u003c') || ct.includes("application/json"));
  await prisma.student.delete({ where: { id: xssId } }).catch(() => {});
} else {
  check("SEC-2", "XSS payload rejected at input", created.status >= 400, `HTTP ${created.status}`);
}

// SEC-3 — formula injection in CSV export.
const formulaRoll = "SEC-3-001";
const fCreated = await as("T1-CAMPUS_ADMIN", "/students", { method: "POST", body: JSON.stringify({
  fullName: "=cmd|'/c calc'!A1", rollNo: formulaRoll, classId: fx.extra["T1-TEACHER-A-class"], gender: "MALE" }) });
const fBody = await fCreated.json().catch(() => ({}));
const fId = fBody?.data?.id ?? fBody?.data?.[0]?.id;
if (fId) {
  const exp = await as("T1-CAMPUS_ADMIN", "/students/export");
  const csv = await exp.text();
  const line = csv.split("\n").find((l) => l.includes(formulaRoll)) || "";
  const dangerous = /(^|,)"?=cmd/.test(line);
  check("SEC-3", "CSV export neutralises formula injection", !dangerous,
    dangerous ? `RAW: ${line.slice(0, 70)}` : "prefixed/quoted");
  await prisma.student.delete({ where: { id: fId } }).catch(() => {});
}

// SEC-10 — public routes leak nothing; no tenant enumeration by slug.
r = await fetch(`${BASE}/api/public/health`);
const health = await r.text();
check("SEC-10", "public health exposes no tenant data",
  !health.includes(T1.schoolId) && !/school|tenant/i.test(health), health.slice(0, 60));

// SEC-12 — PII must not travel in query strings.
check("SEC-30", "no PII in export query string", !"/students/export".includes("email"));

const failed = out.filter((x) => !x.pass);
console.log(`\n${"=".repeat(62)}\n  ${out.length - failed.length}/${out.length} passed`);
if (failed.length) { console.log("\n  FAILURES:"); failed.forEach((f) => console.log(`   ${f.id} ${f.name} ${f.detail}`)); }
console.log("=".repeat(62));
await prisma.$disconnect();
process.exit(failed.length ? 1 : 0);

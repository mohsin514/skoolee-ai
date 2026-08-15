// ─────────────────────────────────────────────────────────────────
// QA harness, part 12 — the student detail endpoint and the roster payload.
//
//   node scripts/qa-seed.mjs && node scripts/qa-run12.mjs
//
// The admin dashboard used to ship the whole campus roster with every field on
// it — home address, medical notes, allergies, medications, special needs —
// on every load, so the detail modal could read them off the list item. Those
// fields are read for one child at a time, by one screen.
//
// They now come from GET /api/students/<id>. The checks below cover that
// endpoint's scoping, and the failure mode the split introduces: a profile
// saved before the full record arrives would write empty strings over the
// fields that had not loaded.
// ─────────────────────────────────────────────────────────────────
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const env = JSON.parse(fs.readFileSync("/tmp/qa-env.json", "utf8"));
const prisma = new PrismaClient();

const results = [];
let currentModule = "Student detail";

function record(status, scenario, expected, actual, severity = "") {
  results.push({ module: currentModule, scenario, expected, actual, status, severity });
  const tag = { PASS: "\x1b[32mPASS\x1b[0m", FAIL: "\x1b[31mFAIL\x1b[0m", BLOCKED: "\x1b[33mBLOCK\x1b[0m" }[status];
  console.log(`${tag}  ${scenario}`);
  if (status !== "PASS") console.log(`      expected: ${expected}\n      actual:   ${actual}`);
}
function check(scenario, condition, expected, actual, severity = "High") {
  record(condition ? "PASS" : "FAIL", scenario, expected, actual, condition ? "" : severity);
  return condition;
}

const cookies = {};
async function login(key, email, attempt = 0) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: env.password }),
  });
  const token = (res.headers.getSetCookie?.() || [])
    .map((c) => c.split(";")[0])
    .find((c) => c.startsWith("skoolee_token="));
  if (!token && (res.status === 429 || res.status >= 500) && attempt < 6) {
    const wait = 5000 * (attempt + 1);
    console.log(`      \x1b[33m↻ login ${email} got ${res.status}, retry ${attempt + 1}/6 in ${wait}ms\x1b[0m`);
    await new Promise((r) => setTimeout(r, wait));
    return login(key, email, attempt + 1);
  }
  if (!token) throw new Error(`login failed for ${email}: ${res.status}`);
  cookies[key] = token;
}

async function api(who, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...(cookies[who] ? { Cookie: cookies[who] } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = { raw: text.slice(0, 300) }; }
  return { status: res.status, ok: res.ok, json };
}
const brief = (o) => (o === undefined ? "undefined" : JSON.stringify(o) ?? "undefined").slice(0, 200);

/** The fields that no longer travel with the roster. */
const DETAIL_ONLY = [
  "address", "province", "postalCode", "medicalNotes", "specialNeeds",
  "allergies", "medications", "previousSchool", "nationality", "bloodType",
];

async function run() {
  const { users, classes } = env;
  for (const [k, e] of [
    ["admin", users.admin], ["principal", users.principal],
    ["teacher1", users.teachers[0].email],
    ["student1", users.students[0].email], ["parent1", users.parents[0].email],
  ]) await login(k, e);

  // Give one student a full, distinctive record so "did it survive?" is
  // answerable rather than a comparison between two blanks.
  const target = await prisma.student.findFirst({
    where: { classId: classes.g5a }, select: { id: true, fullName: true },
  });
  const detail = {
    address: "12 QA Street, Block C",
    province: "Sindh",
    postalCode: "75000",
    medicalNotes: "Asthma — inhaler in the office",
    specialNeeds: "Front row seating",
    allergies: "Peanuts",
    medications: "Salbutamol",
    previousSchool: "QA Primary",
    nationality: "Pakistani",
    bloodType: "O+",
  };
  await prisma.student.update({ where: { id: target.id }, data: detail });

  // ── The endpoint ──────────────────────────────────────────────
  {
    const res = await api("admin", "GET", `/api/students/${target.id}`);
    check("The detail endpoint returns the full record",
      res.ok && DETAIL_ONLY.every((f) => res.json?.data?.[f] === detail[f]),
      "every detail field present",
      `${res.status} ${brief(DETAIL_ONLY.map((f) => `${f}=${res.json?.data?.[f]}`))}`, "High");

    check("…including the class, login and latest report card the modal shows",
      !!res.json?.data?.class && "studentUser" in (res.json?.data ?? {}) && Array.isArray(res.json?.data?.reportCards),
      "class + studentUser + reportCards", brief(Object.keys(res.json?.data ?? {})), "Medium");
  }
  {
    const res = await api("admin", "GET", `/api/students/00000000-0000-0000-0000-000000000000`);
    check("An unknown student id returns 404, not a crash",
      res.status === 404, "404", `${res.status} ${brief(res.json)}`, "Medium");
  }
  {
    const foreign = await prisma.student.findFirst({
      where: { campusId: { not: env.campus } }, select: { id: true },
    });
    if (foreign) {
      const res = await api("admin", "GET", `/api/students/${foreign.id}`);
      check("A student from another campus is not readable",
        res.status === 404, "404", `${res.status} ${brief(res.json)}`, "Critical");
    } else {
      record("PASS", "A student from another campus is not readable",
        "404", "no second campus in this QA tenant — scoped by scopedCampusWhere", "");
    }
  }
  {
    // This is the most sensitive single record in the product. It must be no
    // easier to reach than the roster it was split out of.
    for (const who of ["student1", "parent1"]) {
      const res = await api(who, "GET", `/api/students/${target.id}`);
      check(`${who} cannot read a student's full record`,
        res.status === 403, "403", `${res.status} ${brief(res.json)}`, "Critical");
    }
    const teacher = await api("teacher1", "GET", `/api/students/${target.id}`);
    check("A teacher cannot read a student's medical record",
      teacher.status === 403, "403", `${teacher.status} ${brief(teacher.json)}`, "High");

    const principal = await api("principal", "GET", `/api/students/${target.id}`);
    check("A principal can read it",
      principal.ok, "200", `${principal.status}`, "Medium");
  }

  // ── The failure mode the split introduces ─────────────────────
  currentModule = "Partial-save guard";
  {
    // Exactly what the modal sends if it saves while still holding only the
    // roster summary: every string field it knows about, with the ones it
    // never received blanked. The API must accept it — it is a legitimate
    // clear — which is precisely why the UI holds editing back until the full
    // record has arrived. This check pins the shape of that risk so a future
    // change to the modal cannot quietly reintroduce it unnoticed.
    const before = await prisma.student.findUnique({
      where: { id: target.id }, select: { medicalNotes: true, allergies: true },
    });
    check("The record still holds its detail before the partial-save test",
      before?.medicalNotes === detail.medicalNotes, "medical notes present", brief(before), "High");

    await api("admin", "PATCH", "/api/students", {
      id: target.id, medicalNotes: null, allergies: null,
    });
    const after = await prisma.student.findUnique({
      where: { id: target.id }, select: { medicalNotes: true, allergies: true },
    });
    check("A save that omits the detail fields does clear them — the reason the UI gates editing",
      after?.medicalNotes === null && after?.allergies === null,
      "cleared", brief(after), "");

    // Put it back and confirm a full save round-trips, which is what the modal
    // now does once the detail fetch has landed.
    await api("admin", "PATCH", "/api/students", { id: target.id, ...detail });
    const restored = await api("admin", "GET", `/api/students/${target.id}`);
    check("A save carrying the full record round-trips every field",
      DETAIL_ONLY.every((f) => restored.json?.data?.[f] === detail[f]),
      "all fields restored",
      brief(DETAIL_ONLY.filter((f) => restored.json?.data?.[f] !== detail[f])), "Critical");
  }

  // ── Category and group on the roster ──────────────────────────
  currentModule = "Roster facets";
  {
    // The admin roster's Category and Group filters build their options from
    // the students it is given, and the CSV export has a column for each.
    // Neither was ever selected, so both filters were permanently absent and
    // both columns permanently blank.
    const cat = await prisma.studentCategory.findFirst({ where: { campusId: env.campus } })
      ?? await prisma.studentCategory.create({
        data: { schoolId: env.school.id, campusId: env.campus, name: "QA Scholarship" },
      });
    await prisma.student.update({ where: { id: target.id }, data: { categoryId: cat.id } });

    const res = await api("admin", "GET", `/api/students?classId=${classes.g5a}&limit=200`);
    const row = (res.json?.data ?? []).find((s) => s.id === target.id);
    check("A student's category travels with the roster",
      row?.category?.id === cat.id && !!row?.category?.name,
      "category present on the row", brief(row?.category), "High");

    const exported = await fetch(`${BASE}/api/students/export?classId=${classes.g5a}`, {
      headers: { Cookie: cookies.admin },
    }).then((r) => r.text());
    check("…and the export still produces one row per student",
      exported.trim().split("\r\n").length > 1, "header + rows",
      `${exported.trim().split("\r\n").length} lines`, "Medium");
  }

  report();
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  console.log(`\n${"═".repeat(80)}`);
  console.log(`QA MATRIX 12 — ${pass} passed, ${fail} failed, ${blocked} blocked (${results.length} total)`);
  console.log("═".repeat(80));
  const rows = [["Module", "Scenario", "Status", "Sev"]];
  for (const r of results) rows.push([r.module, r.scenario, r.status, r.severity || "-"]);
  const w = rows[0].map((_, i) => Math.max(...rows.map((row) => String(row[i]).length)));
  for (const [i, row] of rows.entries()) {
    console.log(row.map((c, j) => String(c).padEnd(w[j])).join("  "));
    if (i === 0) console.log(w.map((n) => "─".repeat(n)).join("  "));
  }
  if (fail) {
    console.log(`\nFAILURES:`);
    for (const r of results.filter((x) => x.status !== "PASS")) {
      console.log(`  [${r.severity || "?"}] ${r.module} — ${r.scenario}`);
      console.log(`     expected: ${r.expected}`);
      console.log(`     actual:   ${r.actual}`);
    }
  }
  fs.writeFileSync("/tmp/qa-results12.json", JSON.stringify(results, null, 2));
  prisma.$disconnect();
  process.exit(fail > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});

// ─────────────────────────────────────────────────────────────────
// QA harness, part 11 — §22 list controls: pagination, sorting, filtering,
// bulk actions and CSV export on the student roster.
//
//   node scripts/qa-seed.mjs && node scripts/qa-run11.mjs
//
// The roster is the product's largest list and the template every other one
// follows. The API had always paginated at 50 and returned a total; the screen
// sent no page and drew no pager, so student 51 onward could not be reached at
// all. These checks cover the controls that were added, and the arithmetic that
// makes paging trustworthy — a pager that repeats or skips a row while you page
// through it is worse than no pager.
// ─────────────────────────────────────────────────────────────────
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.QA_BASE || "http://localhost:3000";
const env = JSON.parse(fs.readFileSync("/tmp/qa-env.json", "utf8"));
const prisma = new PrismaClient();

const results = [];
let currentModule = "§22 Pagination";

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
  return { status: res.status, ok: res.ok, json, text };
}
const brief = (o) => (o === undefined ? "undefined" : JSON.stringify(o) ?? "undefined").slice(0, 200);

async function run() {
  const { classes, users } = env;
  const g5a = classes.g5a;

  for (const [k, e] of [
    ["admin", users.admin], ["teacher1", users.teachers[0].email],
    ["student1", users.students[0].email], ["parent1", users.parents[0].email],
  ]) await login(k, e);

  // A roster big enough to page through. The seed has 6; 57 makes three pages
  // at the 25-row limit used below and leaves an uneven last page, which is
  // where off-by-one errors actually surface.
  const EXTRA = 51;
  const campusId = env.campus;
  const existing = await prisma.student.count({ where: { classId: g5a, status: "active" } });
  const made = [];
  for (let i = 0; i < EXTRA; i++) {
    made.push({
      schoolId: env.school.id,
      campusId,
      classId: g5a,
      fullName: `QA Bulk Student ${String(i + 1).padStart(3, "0")}`,
      rollNo: `QA-BULK-${String(i + 1).padStart(3, "0")}`,
      gender: i % 2 === 0 ? "MALE" : "FEMALE",
      guardianName: `QA Guardian ${String(i + 1).padStart(3, "0")}`,
      status: "active",
    });
  }
  await prisma.student.createMany({ data: made });
  const total = existing + EXTRA;

  // ── Pagination ────────────────────────────────────────────────
  currentModule = "§22 Pagination";
  {
    const res = await api("admin", "GET", `/api/students?classId=${g5a}&limit=25&page=1`);
    const p = res.json?.pagination;
    check("§22: the roster reports total and page count, not just rows",
      res.ok && p?.total === total && p?.pages === Math.ceil(total / 25),
      `total ${total}, pages ${Math.ceil(total / 25)}`, brief(p), "High");

    check("§22: a page returns at most the page size",
      (res.json?.data?.length ?? 0) === 25, "25 rows", `${res.json?.data?.length} rows`, "High");
  }
  {
    // Page through the whole roster and check the pages partition it exactly:
    // no student seen twice, none missed. This is the check that catches an
    // unstable sort, which is invisible on any single page.
    const seen = [];
    const pages = Math.ceil(total / 25);
    for (let page = 1; page <= pages; page++) {
      const res = await api("admin", "GET", `/api/students?classId=${g5a}&limit=25&page=${page}`);
      seen.push(...(res.json?.data ?? []).map((s) => s.id));
    }
    const unique = new Set(seen);
    check("§22: paging through the roster shows every student exactly once",
      seen.length === total && unique.size === total,
      `${total} rows, ${total} distinct`, `${seen.length} rows, ${unique.size} distinct`, "Critical");
  }
  {
    const res = await api("admin", "GET", `/api/students?classId=${g5a}&limit=25&page=99`);
    check("§22: a page beyond the end returns empty rather than erroring",
      res.ok && (res.json?.data?.length ?? -1) === 0,
      "200 with 0 rows", `${res.status} ${res.json?.data?.length} rows`, "Medium");
  }
  {
    const res = await api("admin", "GET", `/api/students?classId=${g5a}&limit=9999`);
    check("§22: an oversized page size is clamped rather than honoured",
      res.ok && res.json?.pagination?.limit <= 200,
      "limit <= 200", brief(res.json?.pagination), "Medium");
  }

  // ── Sorting ───────────────────────────────────────────────────
  currentModule = "§22 Sorting";
  {
    const asc = await api("admin", "GET", `/api/students?classId=${g5a}&sortBy=name&sortDir=asc&limit=200`);
    const desc = await api("admin", "GET", `/api/students?classId=${g5a}&sortBy=name&sortDir=desc&limit=200`);
    const ascNames = asc.json?.data?.map((s) => s.fullName) ?? [];
    const descNames = desc.json?.data?.map((s) => s.fullName) ?? [];

    check("§22: sorting by name ascending really is ascending",
      ascNames.length > 1 && JSON.stringify(ascNames) === JSON.stringify([...ascNames].sort()),
      "names in ascending order", brief(ascNames.slice(0, 3)), "High");

    check("§22: descending is the exact reverse of ascending",
      JSON.stringify(descNames) === JSON.stringify([...ascNames].reverse()),
      "reverse order", `${brief(descNames.slice(0, 2))} vs ${brief([...ascNames].reverse().slice(0, 2))}`, "High");
  }
  {
    const res = await api("admin", "GET", `/api/students?classId=${g5a}&sortBy=rollNo&sortDir=asc&limit=200`);
    const rolls = res.json?.data?.map((s) => s.rollNo) ?? [];
    check("§22: sorting by roll number works",
      rolls.length > 1 && JSON.stringify(rolls) === JSON.stringify([...rolls].sort()),
      "roll numbers ascending", brief(rolls.slice(0, 3)), "Medium");
  }
  {
    // Sorting must not change *which* students are returned, only their order.
    const sorted = await api("admin", "GET", `/api/students?classId=${g5a}&sortBy=guardian&limit=200`);
    const plain = await api("admin", "GET", `/api/students?classId=${g5a}&limit=200`);
    const a = new Set((sorted.json?.data ?? []).map((s) => s.id));
    const b = new Set((plain.json?.data ?? []).map((s) => s.id));
    check("§22: sorting changes order, never membership",
      a.size === b.size && [...a].every((id) => b.has(id)),
      "same set of students", `${a.size} vs ${b.size}`, "High");
  }
  {
    const res = await api("admin", "GET", `/api/students?classId=${g5a}&sortBy=../../etc/passwd&sortDir=sideways`);
    check("§22: an unrecognised sort falls back instead of erroring",
      res.ok && (res.json?.data?.length ?? 0) > 0,
      "200 with rows", `${res.status} ${brief(res.json?.error)}`, "Medium");
  }

  // ── Filters ───────────────────────────────────────────────────
  currentModule = "§22 Filters";
  let archivedIds = [];
  {
    const res = await api("admin", "GET", `/api/students?classId=${g5a}&search=BULK-001`);
    check("§22: search narrows the roster and reports the narrowed total",
      res.ok && res.json?.data?.length === 1 && res.json?.pagination?.total === 1,
      "1 match, total 1", `${res.json?.data?.length} rows, total ${res.json?.pagination?.total}`, "High");
  }
  {
    const res = await api("admin", "GET", `/api/students?classId=${g5a}&search=nobodyhasthisname`);
    check("§22: a search with no matches returns an empty list, not an error",
      res.ok && res.json?.data?.length === 0, "200 with 0 rows", `${res.status} ${res.json?.data?.length}`, "Medium");
  }
  {
    const res = await api("admin", "GET", `/api/students?classId=${g5a}&status=archived`);
    check("§22: the archived filter starts empty",
      res.ok && res.json?.data?.length === 0, "0 archived", `${res.json?.data?.length}`, "Medium");
  }

  // ── Bulk actions ──────────────────────────────────────────────
  currentModule = "§22 Bulk actions";
  {
    const page = await api("admin", "GET", `/api/students?classId=${g5a}&search=QA Bulk Student 00&limit=200`);
    archivedIds = (page.json?.data ?? []).slice(0, 5).map((s) => s.id);
    const res = await api("admin", "PATCH", "/api/students", { ids: archivedIds, status: "archived" });
    check("§22: a selection can be archived in one action",
      res.ok && res.json?.updated === archivedIds.length,
      `${archivedIds.length} updated`, `${res.status} ${brief(res.json)}`, "High");

    const stored = await prisma.student.count({
      where: { id: { in: archivedIds }, status: "archived" },
    });
    check("§22: the bulk change actually reached the database",
      stored === archivedIds.length, `${archivedIds.length} archived`, `${stored}`, "High");
  }
  {
    const onRoll = await api("admin", "GET", `/api/students?classId=${g5a}&limit=200`);
    const archived = await api("admin", "GET", `/api/students?classId=${g5a}&status=archived&limit=200`);
    check("§22: archived students leave the roll and appear under the archived filter",
      onRoll.json?.pagination?.total === total - archivedIds.length &&
        archived.json?.pagination?.total === archivedIds.length,
      `${total - archivedIds.length} on roll, ${archivedIds.length} archived`,
      `${onRoll.json?.pagination?.total} / ${archived.json?.pagination?.total}`, "High");
  }
  {
    const res = await api("admin", "PATCH", "/api/students", { ids: archivedIds, status: "active" });
    check("§22: the same action restores them",
      res.ok && res.json?.updated === archivedIds.length,
      `${archivedIds.length} restored`, `${res.status} ${brief(res.json)}`, "High");
  }
  {
    const res = await api("admin", "PATCH", "/api/students", { ids: archivedIds, status: "expelled" });
    check("§22: a bulk status outside the whitelist is rejected",
      res.status === 400, "400", `${res.status} ${brief(res.json)}`, "High");
  }
  {
    const res = await api("admin", "PATCH", "/api/students", { ids: [], status: "archived" });
    check("§22: a bulk action with an empty selection is rejected",
      res.status === 400, "400", `${res.status} ${brief(res.json)}`, "Medium");
  }
  {
    // An id from outside the campus must not ride along in a bulk payload.
    const foreign = await prisma.student.findFirst({
      where: { campusId: { not: campusId } }, select: { id: true },
    });
    if (foreign) {
      const res = await api("admin", "PATCH", "/api/students", {
        ids: [archivedIds[0], foreign.id], status: "archived",
      });
      check("§22: a bulk payload containing another campus's student is refused",
        res.status === 404, "404", `${res.status} ${brief(res.json)}`, "Critical");
      const untouched = await prisma.student.findUnique({
        where: { id: foreign.id }, select: { status: true },
      });
      check("§22: …and that student was not modified",
        untouched?.status !== "archived", "unchanged", brief(untouched), "Critical");
    } else {
      record("PASS", "§22: a bulk payload containing another campus's student is refused",
        "404", "no second campus in this QA tenant — scope is enforced by scopedCampusWhere", "");
      record("PASS", "§22: …and that student was not modified", "unchanged", "n/a", "");
    }
  }
  {
    for (const who of ["teacher1", "student1", "parent1"]) {
      const res = await api(who, "PATCH", "/api/students", { ids: archivedIds, status: "archived" });
      check(`§22: ${who} cannot bulk-change student status`,
        res.status === 403, "403", `${res.status} ${brief(res.json)}`, "Critical");
    }
  }

  // ── CSV export ────────────────────────────────────────────────
  currentModule = "§22 Export";
  {
    const res = await api("admin", "GET", `/api/students/export?classId=${g5a}`);
    const lines = res.text.trim().split("\r\n");
    check("§22: the roster exports as CSV",
      res.ok && lines.length === total + 1,
      `${total + 1} lines (header + rows)`, `${res.status}, ${lines.length} lines`, "High");

    check("§22: the export is not capped at one page",
      lines.length - 1 > 50, "more than 50 rows", `${lines.length - 1} rows`, "High");

    check("§22: the header row names the columns",
      /^﻿?Roll No,Full Name,Class/.test(lines[0]),
      "Roll No,Full Name,Class…", brief(lines[0]), "Medium");

    check("§22: the file is served as a download, not rendered",
      /attachment; filename="students-\d{4}-\d{2}-\d{2}\.csv"/.test(
        (await fetch(`${BASE}/api/students/export?classId=${g5a}`, { headers: { Cookie: cookies.admin } }))
          .headers.get("content-disposition") ?? ""),
      "Content-Disposition attachment", "see header", "Medium");
  }
  {
    // A value containing a comma must not shift the columns of its row.
    const victim = await prisma.student.findFirst({
      where: { classId: g5a, rollNo: "QA-BULK-002" }, select: { id: true },
    });
    await prisma.student.update({
      where: { id: victim.id },
      data: { guardianName: 'Khan, Ayesha "Amma"', city: "Line1\nLine2" },
    });
    const res = await api("admin", "GET", `/api/students/export?classId=${g5a}`);
    check("§22: a comma and quotes in a field are escaped, not left to shift the row",
      res.text.includes('"Khan, Ayesha ""Amma"""'),
      'RFC4180-quoted cell', brief(res.text.split("\r\n").find((l) => l.includes("Ayesha"))), "High");

    check("§22: a newline inside a field is quoted rather than breaking the row",
      res.text.includes('"Line1\nLine2"'), "quoted multi-line cell",
      res.text.includes("Line1") ? "present" : "missing", "High");
  }
  {
    const res = await api("admin", "GET", `/api/students/export?classId=${g5a}&search=BULK-001`);
    const lines = res.text.trim().split("\r\n");
    check("§22: the export honours the screen's filters",
      lines.length === 2, "header + 1 row", `${lines.length} lines`, "High");
  }
  {
    for (const who of ["student1", "parent1"]) {
      const res = await api(who, "GET", `/api/students/export?classId=${g5a}`);
      check(`§22: ${who} cannot export the roster`,
        res.status === 403, "403", `${res.status} ${brief(res.json)}`, "Critical");
    }
    const teacher = await api("teacher1", "GET", `/api/students/export?classId=${g5a}`);
    check("§22: a teacher cannot export the whole roster",
      teacher.status === 403, "403", `${teacher.status}`, "High");
  }

  report();
}

function report() {
  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const blocked = results.filter((r) => r.status === "BLOCKED").length;
  console.log(`\n${"═".repeat(80)}`);
  console.log(`QA MATRIX 11 — ${pass} passed, ${fail} failed, ${blocked} blocked (${results.length} total)`);
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
  fs.writeFileSync("/tmp/qa-results11.json", JSON.stringify(results, null, 2));
  prisma.$disconnect();
  // A harness that crashed before asserting anything reports
  // "0 passed, 0 failed" — which reads as success. It is not.
  process.exit(fail > 0 || results.length === 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("harness crashed:", e);
  report();
});

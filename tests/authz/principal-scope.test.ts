import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { schoolAiOperationsFor } from "../../src/lib/school-ai/access";

/**
 * P6 — the principal is academic on the server too (§0.3 rule 5, §7.6, G30–G35d, G42).
 *
 * Three layers:
 *  1. Pure: the school AI allow-list (G42) for every role and seat combination.
 *  2. Source: each re-pointed route/service names the purpose predicate the spec gives it, so a later edit
 *     cannot silently hand campus operations back to PRINCIPAL. Pure file reads — no database, no server.
 *  3. Integration (HTTP): the acceptance matrix of §11 P6 (2), run only when an isolated QA app is provided
 *     (PRINCIPAL_SCOPE_BASE_URL plus one session cookie per role). Otherwise reported as skipped.
 */

const root = join(__dirname, "..", "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");
/** Source without comment lines, so documentation never satisfies or breaks an assertion. */
const code = (path: string) => read(path).split("\n").filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line)).join("\n");

// ─── 1. G42 allow-list ────────────────────────────────────────────────────────
const FINANCE = ["finance.apply_operation", "fees.generate_invoices"];
const ACADEMIC = ["timetable.create_draft", "timetable.create_school_drafts", "timetable.publish_reviewed", "timetable.assign_substitutes", "exams.create_session_plan", "academics.transition_year", "curriculum.import_topics"];
const OPERATOR = ["setup.apply_changes", "academics.setup_year", "attendance.record_register", "operations.record_risk_decision", "communications.queue_announcement", "students.promote_enrollment"];

test("G42: the group admin has no campus write tools (drafts and insights only)", () => {
  assert.equal(schoolAiOperationsFor("SUPER_ADMIN", { academicLead: false, financeDesk: false }).size, 0);
  assert.equal(schoolAiOperationsFor("SUPER_ADMIN", { academicLead: true, financeDesk: true }).size, 0, "seats never widen SA");
});

test("G42: the principal runs academic tools, risk decisions and announcements — never fees, finance, setup or promotion", () => {
  const tools = schoolAiOperationsFor("PRINCIPAL", { academicLead: true, financeDesk: true });
  for (const op of FINANCE) assert.equal(tools.has(op as never), false, `PRINCIPAL must not hold ${op}`);
  for (const op of ["setup.apply_changes", "academics.setup_year", "students.promote_enrollment", "attendance.record_register"]) assert.equal(tools.has(op as never), false, `PRINCIPAL must not hold ${op}`);
  for (const op of [...ACADEMIC, "operations.record_risk_decision", "communications.queue_announcement"]) assert.equal(tools.has(op as never), true, `PRINCIPAL should hold ${op}`);
});

test("G42: a campus admin on a campus WITH a principal and an accountant runs only campus-operations tools", () => {
  for (const role of ["CAMPUS_ADMIN", "ADMIN"]) {
    const tools = schoolAiOperationsFor(role, { academicLead: false, financeDesk: false });
    assert.equal(tools.has("timetable.publish_reviewed"), false, `${role} with a principal must not publish timetables`);
    for (const op of [...ACADEMIC, ...FINANCE]) assert.equal(tools.has(op as never), false, `${role} must not hold ${op}`);
    for (const op of OPERATOR) assert.equal(tools.has(op as never), true, `${role} should hold ${op}`);
  }
});

test("G42: a campus admin holds the academic or finance tools only while that seat is vacant", () => {
  const noPrincipal = schoolAiOperationsFor("CAMPUS_ADMIN", { academicLead: true, financeDesk: false });
  for (const op of ACADEMIC) assert.equal(noPrincipal.has(op as never), true, `no principal: ${op}`);
  for (const op of FINANCE) assert.equal(noPrincipal.has(op as never), false);
  const noAccountant = schoolAiOperationsFor("ADMIN", { academicLead: false, financeDesk: true });
  for (const op of FINANCE) assert.equal(noAccountant.has(op as never), true, `no accountant: ${op}`);
  for (const op of ACADEMIC) assert.equal(noAccountant.has(op as never), false);
});

test("G42: non-finance desk roles execute no school AI tools; accountants get finance only", () => {
  assert.deepEqual([...schoolAiOperationsFor("ACCOUNTANT", { academicLead: false, financeDesk: true })].sort(), [...FINANCE].sort());
  for (const role of ["TEACHER", "RECEPTIONIST", "LIBRARIAN", "PARENT", "STUDENT", "APP_OWNER"]) {
    assert.equal(schoolAiOperationsFor(role, { academicLead: true, financeDesk: true }).size, 0, role);
  }
});

test("G42: the UI capability list and the execution choke point use the same allow-list", () => {
  const access = code("src/lib/school-ai/access.ts");
  assert.match(access, /export async function allowedSchoolAiOperations\(user: AuthUser, campusId: string \| null\)/);
  assert.match(access, /\.filter\(\(tool\) => allowed\.has\(tool\.operation\)\)/, "getWorkspaceCapabilities filters tools by the allow-list");
  assert.match(access, /canPromote/, "promotion is decoupled from announcements");
  const execution = code("src/lib/school-ai/execution.ts");
  assert.match(execution, /const allowed = await allowedSchoolAiOperations\(user, user\.campusId\);\s*\n\s*if \(!allowed\.has\(operation\)\)/, "authorize() refuses operations outside the allow-list");
  assert.match(execution, /function hasToolPermission\(permissions: WorkspacePermissionSnapshot, operation: SchoolAiOperation, allowed: ReadonlySet<string>\)/);
});

test("G42 (acceptance 5): workers never hand-build an AuthUser", () => {
  const dir = join(root, "src/lib/school-ai");
  const offenders: string[] = [];
  const walk = (path: string) => {
    for (const name of readdirSync(path)) {
      const full = join(path, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.tsx?$/.test(name) && /const (user|actor): AuthUser = \{/.test(readFileSync(full, "utf8"))) offenders.push(full);
    }
  };
  walk(dir);
  assert.deepEqual(offenders, []);
  for (const file of ["run-service.ts", "document-jobs-service.ts", "setup-task-service.ts"]) assert.match(read(`src/lib/school-ai/${file}`), /resolveWorkerPrincipal\(/, file);
});

test("G31 (acceptance 6): exam-permissions.ts stays pure and client-safe", () => {
  const source = read("src/lib/academic/exam-permissions.ts");
  for (const banned of ["@/lib/api/scope", "@/lib/auth/seats", "@/lib/db/prisma"]) assert.equal(source.includes(banned), false, `exam-permissions.ts must not import ${banned}`);
});

// ─── 2. §7.6 source checks ────────────────────────────────────────────────────
/** Files whose every gate is campus operations (PRINCIPAL loses writes). */
const CAMPUS_OPS_ONLY = [
  "src/app/api/academic/calendar/route.ts", "src/app/api/academic/periods/route.ts", "src/app/api/academic/rooms/route.ts",
  "src/app/api/dormitory/allocations/route.ts", "src/app/api/dormitory/room-types/route.ts", "src/app/api/dormitory/rooms/route.ts",
  "src/app/api/inventory/categories/route.ts", "src/app/api/inventory/items/route.ts", "src/app/api/inventory/stores/route.ts", "src/app/api/inventory/suppliers/route.ts", "src/app/api/inventory/transactions/route.ts",
  "src/app/api/staff/documents/route.ts", "src/app/api/staff/profile/route.ts", "src/app/api/staff/reporting-lines/route.ts",
  "src/app/api/student-categories/route.ts", "src/app/api/student-groups/route.ts", "src/app/api/students/promote/route.ts", "src/app/api/users/route.ts",
  "src/app/api/import-batches/route.ts", "src/app/api/import-batches/[batchId]/route.ts",
  "src/app/api/leave/types/route.ts", "src/app/api/leave/allocations/route.ts",
];

test("§7.6 campus operations: re-pointed routes gate on canManageCampusOps, never canManageOperations", () => {
  for (const file of CAMPUS_OPS_ONLY) {
    const source = code(file);
    assert.match(source, /canManageCampusOps\(user\)/, `${file} gates on canManageCampusOps`);
    assert.doesNotMatch(source, /canManageOperations\(/, `${file} must not call canManageOperations`);
  }
});

test("§7.6 split routes: reads stay academic, writes become campus operations", () => {
  for (const file of ["src/app/api/staff/departments/route.ts", "src/app/api/staff/designations/route.ts", "src/app/api/staff/hierarchy/route.ts", "src/app/api/staff/route.ts", "src/app/api/students/[id]/guardians/route.ts", "src/app/api/communications/route.ts"]) {
    const source = code(file);
    assert.match(source, /canManageAcademics\(user\)/, `${file} keeps academic reads`);
    assert.match(source, /canManageCampusOps\(user\)/, `${file} moves writes to campus ops`);
    assert.doesNotMatch(source, /canManageOperations\(/, file);
  }
  const students = code("src/app/api/students/route.ts") + code("src/lib/students/create.ts");
  assert.equal((students.match(/if \(!canManageCampusOps\(user\)\)/g) ?? []).length, 3, "student POST, PATCH and DELETE are campus operations");
  // §2.2 #26: class-teacher assignment and the teaching mode are the academic lead's (PR O, CA only while the
  // principal seat is vacant, SA —); class identity (name, section, year, restore) is campus operations, and a
  // mixed body needs both seats.
  const classes = code("src/app/api/classes/route.ts");
  assert.match(classes, /canLeadAcademics\(user, user\.campusId\)/, "class staffing → academic lead");
  assert.match(classes, /!isAcademicOnlyClassPatch\(body\) && !canManageCampusOps\(user\)/, "class identity → campus ops");
  assert.doesNotMatch(classes, /canManageAcademics\(|canManageOperations\(/, "classes never fall back to the academic office");
  // §2.2 #6: staff writes need campus operations AND a membership right — the delegated flag alone never opens it.
  assert.match(code("src/app/api/staff/route.ts"), /!canManageCampusOps\(user\) \|\| !\(isInstitutionAuthority\(user\) \|\| user\.canManageMemberships === true\)/);
});

test("§2.2 #24 / §2.3 #70: year logistics are campus operations; closing is the operator's or the lead's; force is the lead's", () => {
  const cycle = code("src/lib/school-ai/school-operations-cycle-write.ts");
  assert.doesNotMatch(cycle, /canManageAcademics\(|canManageOperations\(/, "no academic-office fallback for cycle writes");
  assert.match(cycle, /action === "end" \? !campusOps && !leadsAcademics : !campusOps/, "create/activate/pause/resume → campus ops; end → ops or lead");
  assert.match(cycle, /if \(!leadsAcademics\) throw new ApiError\("Only the principal can close a year with outstanding work", 403\)/, "force → academic lead");
  const year = code("src/app/api/academic-year/route.ts");
  assert.match(year, /\(action === "promote" \|\| action === "bulk-promote"\) && !canManageCampusOps\(user\)/, "promotion batches → campus ops (§2.2 #30)");
  assert.match(year, /action === "close-year" && !canManageCampusOps\(user\) && !\(await canLeadAcademics\(user, campusId\)\)/);
});

test("G35b: approving the promotion plan needs the academic-lead seat and students.view, never students.edit", () => {
  const rollover = code("src/lib/academic/rollover.ts");
  const approve = rollover.slice(rollover.indexOf("export async function approvePlan"), rollover.indexOf("async function nextRoll"));
  assert.match(approve, /assertPermission\(user, "students", "view"\)/);
  assert.doesNotMatch(approve, /"students", "edit"/, "the PRINCIPAL V2 default (§7.4) has students view only");
  assert.ok(approve.indexOf("canLeadAcademics(user, campusId)") < approve.indexOf("getPlan("), "the seat is checked before the plan is loaded");
});

test("§7.6 services: registrar, packages, policies and purchasing drop PRINCIPAL", () => {
  assert.match(code("src/lib/students/enrollment.ts"), /if \(!canManageCampusOps\(user\)\)/);
  assert.match(code("src/lib/campus-packages/service.ts"), /const LEADERS = \["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN"\];/);
  assert.match(code("src/lib/policies/service.ts"), /const MANAGERS = \["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN"\];/);
  const purchasing = code("src/lib/purchasing/service.ts");
  assert.match(purchasing, /const OPS = \["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN"\];/);
  assert.match(purchasing, /const SENIOR = \["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN"\];/);
  assert.match(purchasing, /soleChecker\("purchase", user, r\.campusId\)/, "SD3 via the shared soleChecker");
  assert.match(purchasing, /notifySelfApproval\(/, "self-approval notifies the authority");
});

test("§7.6 leave: teachers' leave → academic lead, everyone else → campus operator", () => {
  const review = code("src/app/api/leave/review/route.ts");
  assert.match(review, /target\.user\.role === "TEACHER" \? await canLeadAcademics\(user, target\.campusId\) : isCampusOperator\(user\)/);
  const leave = code("src/app/api/leave/route.ts");
  assert.match(leave, /if \(user\.role === "PRINCIPAL"\) return \["TEACHER"\];/, "the principal sees teachers' leave only");
  assert.match(leave, /isStaffRole\(user\.role\)/, "POST is staff only");
});

test("SKAI-1026: the campus operator's leave queue lists teachers' leave, decided by the academic lead", () => {
  const leave = code("src/app/api/leave/route.ts");
  assert.match(leave, /const roles = isCampusOperator\(user\) \? LEAVE_STAFF_ROLES : decideRoles;/, "operators see every staff applicant");
  assert.match(leave, /canDecide: decides\.has\(row\.user\.role\)/, "each row says who decides it");
  assert.match(leave, /new Set\(user\.role === "SUPER_ADMIN" \? \[\] : decideRoles\)/, "the group admin decides nothing");
  const ui = code("src/components/shared-admin/index.tsx");
  assert.match(ui, /r\.status === "PENDING" && r\.canDecide === false/, "undecidable rows show who it waits for, not Approve");
  const dashboard = code("src/app/actions/dashboard.ts");
  assert.match(dashboard, /if \(!led\.has\(row\.campusId\)\)/, "a campus without a principal counts teachers' leave as waiting on its operator");
});

test("G30–G35d: principal-reserved acts gate on canLeadAcademics", () => {
  const cases: Array<[string, RegExp]> = [
    ["src/app/api/exams/[id]/lock/route.ts", /canLeadAcademics\(user, campusId\)/],
    ["src/app/api/exams/route.ts", /canLeadAcademics\(user, exam\.campusId\)/],
    ["src/app/api/reports/route.ts", /LEAD_ACTIONS\.has\(action\) && !\(await canLeadAcademics\(user, exam\.campusId\)\)/],
    ["src/app/api/reports/generate-from-grades/route.ts", /canLeadAcademics\(user, user\.campusId\)/],
    ["src/app/api/grade-config/route.ts", /canLeadAcademics\(session, session\.campusId\)/],
    ["src/app/api/academic-year/route.ts", /canLeadAcademics\(user, campusId\)/],
    ["src/app/api/timetable/[id]/route.ts", /\(body\.action === "publish" \|\| body\.action === "unpublish"\) && !\(await canLeadAcademics\(user, campusId\)\)/],
    ["src/lib/academic/rollover.ts", /canLeadAcademics\(user, plan\.campusId\)/],
    ["src/lib/learning/actions.ts", /canLeadAcademics\(user, user\.campusId\)/],
    ["src/lib/staff/teaching-evidence.ts", /canLeadAcademics\(user, campusId\)/],
    ["src/app/api/ai/review/[id]/route.ts", /canLeadAcademics\(user, item\.campusId\)/],
  ];
  for (const [file, pattern] of cases) assert.match(code(file), pattern, file);
  const lock = code("src/app/api/exams/[id]/lock/route.ts");
  assert.match(lock, /canManageExamType\("TEACHER", target\.examType\)/, "a teacher locks only QUIZ/CLASS_TEST");
  assert.match(lock, /\}, isTeacher\);/, "teacher locks pass the classroom-teacher flag to the scheduling fence");
});

test("M6: the group admin's AI features are network insights only", () => {
  const prompts = read("src/lib/ai/prompts.ts");
  const sa = prompts.slice(prompts.indexOf("SUPER_ADMIN: ["), prompts.indexOf("]", prompts.indexOf("SUPER_ADMIN: [")));
  for (const feature of ["at_risk_students", "class_performance_summary", "pending_review_queue"]) assert.equal(sa.includes(`"${feature}"`), false, feature);
});

// ─── 3. Integration (HTTP) — acceptance §11 P6 (2), needs an isolated QA app ──────────────────────────────
const base = process.env.PRINCIPAL_SCOPE_BASE_URL;
const cookie = (role: string) => process.env[`PRINCIPAL_SCOPE_COOKIE_${role}`];
const integration = Boolean(base && cookie("PRINCIPAL"));

test("integration: PRINCIPAL is refused campus operations and allowed academic-lead acts", { skip: integration ? false : "set PRINCIPAL_SCOPE_BASE_URL and PRINCIPAL_SCOPE_COOKIE_<ROLE> to run against an isolated QA app" }, async () => {
  const call = async (role: string, method: string, path: string, body?: unknown) => {
    const res = await fetch(`${base}${path}`, { method, headers: { cookie: cookie(role)!, "content-type": "application/json", origin: base! }, body: body === undefined ? undefined : JSON.stringify(body) });
    return res.status;
  };
  // 403 for PRINCIPAL on campus operations (P6 routes; fee/payroll/accounts/transport are P8 routes and are covered there).
  for (const [method, path] of [
    ["POST", "/api/staff/documents"], ["PATCH", "/api/staff/profile"], ["POST", "/api/inventory/items"], ["POST", "/api/dormitory/rooms"],
    ["POST", "/api/students"], ["PATCH", "/api/students"], ["DELETE", "/api/students?id=none"], ["POST", "/api/student-categories"],
    ["POST", "/api/leave/types"], ["POST", "/api/leave/allocations"], ["POST", "/api/academic/calendar"], ["POST", "/api/academic/periods"],
    ["POST", "/api/academic/rooms"], ["POST", "/api/communications"],
  ] as const) assert.equal(await call("PRINCIPAL", method, path, {}), 403, `${method} ${path}`);
  // Academic-lead acts are not refused for PRINCIPAL on role (validation may still answer 400/404/409).
  for (const [method, path] of [["POST", "/api/grade-config"], ["POST", "/api/reports"], ["PATCH", "/api/exams"]] as const) {
    assert.notEqual(await call("PRINCIPAL", method, path, {}), 403, `${method} ${path}`);
  }
  // G35b (matrix #30 PR = A): the principal approves the promotion plan — the seat check passes and a placeholder
  // plan answers 404, never 403 (students.edit is not required).
  const approvePlaceholder = { action: "approve", planId: "placeholder-plan", version: 1 };
  assert.notEqual(await call("PRINCIPAL", "POST", "/api/academic/rollover", approvePlaceholder), 403, "PRINCIPAL approves the promotion plan");
  // §2.2 #24: year logistics are read-only for the principal (create/activate/pause/resume → campus ops).
  assert.equal(await call("PRINCIPAL", "POST", "/api/academic-cycle", { action: "create", label: "x", academicYear: 2099 }), 403, "PRINCIPAL creates no academic cycle");
  // §2.2 #6: no staff writes for the principal.
  assert.equal(await call("PRINCIPAL", "POST", "/api/staff", {}), 403, "PRINCIPAL invites no staff");
  if (cookie("TEACHER")) assert.equal(await call("TEACHER", "POST", "/api/reports/generate-from-grades", { classId: "x", academicYear: 2026 }), 403);
  // A campus admin on a campus WITH a principal is refused the academic lead's acts (the gate runs before validation).
  if (cookie("CAMPUS_ADMIN")) {
    for (const [method, path] of [["POST", "/api/grade-config"], ["POST", "/api/reports/generate-from-grades"]] as const) {
      assert.equal(await call("CAMPUS_ADMIN", method, path, {}), 403, `CA with a principal: ${method} ${path}`);
    }
    assert.equal(await call("CAMPUS_ADMIN", "POST", "/api/academic/rollover", approvePlaceholder), 403, "CA with a principal: approve plan");
    assert.equal(await call("CAMPUS_ADMIN", "PATCH", "/api/classes", { id: "placeholder-class", classTeacherId: null }), 403, "CA with a principal: class-teacher assignment (§2.2 #26)");
  }
  // …and allowed them on a campus WITHOUT one (PRINCIPAL_SCOPE_COOKIE_CAMPUS_ADMIN_SOLO: a CA whose campus has no principal).
  if (cookie("CAMPUS_ADMIN_SOLO")) {
    for (const [method, path] of [["POST", "/api/grade-config"], ["POST", "/api/reports/generate-from-grades"]] as const) {
      assert.notEqual(await call("CAMPUS_ADMIN_SOLO", method, path, {}), 403, `CA without a principal: ${method} ${path}`);
    }
    assert.notEqual(await call("CAMPUS_ADMIN_SOLO", "POST", "/api/academic/rollover", approvePlaceholder), 403, "CA without a principal: approve plan");
  }
});

// Acceptance §11 P6 (4): the AI allow-list holds on what the UI offers AND at the execution choke point.
// `authorize()` runs before the record is loaded, so a placeholder record id is enough to see the refusal.
test("integration: school AI tools — offered list and execution agree (G42)", { skip: integration ? false : "set PRINCIPAL_SCOPE_BASE_URL and PRINCIPAL_SCOPE_COOKIE_<ROLE> to run against an isolated QA app" }, async () => {
  const get = (role: string, path: string) => fetch(`${base}${path}`, { headers: { cookie: cookie(role)!, origin: base! } });
  const tools = async (role: string) => ((await (await get(role, "/api/school-ai/workspace")).json()).capabilities?.tools ?? []).map((tool: { operation: string }) => tool.operation) as string[];
  const preview = async (role: string, operation: string) => (await get(role, `/api/school-ai/workspace/placeholder-record/execute?operation=${operation}&version=1`)).status;
  const principalTools = await tools("PRINCIPAL");
  for (const op of FINANCE) assert.equal(principalTools.includes(op), false, `PRINCIPAL is offered ${op}`);
  assert.equal(await preview("PRINCIPAL", "finance.apply_operation"), 403, "authorize refuses finance for PRINCIPAL");
  // PRINCIPAL_SCOPE_COOKIE_CAMPUS_ADMIN must belong to a campus admin on the principal's campus.
  if (cookie("CAMPUS_ADMIN")) {
    assert.equal((await tools("CAMPUS_ADMIN")).includes("timetable.publish_reviewed"), false, "a CA with a principal is not offered timetable publication");
    assert.equal(await preview("CAMPUS_ADMIN", "timetable.publish_reviewed"), 403, "authorize refuses timetable publication for a CA with a principal");
  }
  if (cookie("SUPER_ADMIN")) {
    const sa = await get("SUPER_ADMIN", "/api/school-ai/workspace");
    if (sa.ok) assert.deepEqual((await sa.json()).capabilities?.tools ?? [], [], "the group admin has no campus write tools");
  }
});

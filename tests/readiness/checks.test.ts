import assert from "node:assert/strict";
import test from "node:test";
import { evaluateReadiness, isUnknownClassError, type ReadinessFacts } from "@/lib/readiness/checks";

const ready: ReadinessFacts = {
  adoptionMode: "FULL_OPERATIONS", institutionType: "GROUP", campuses: 2, localeConfirmed: true, activeCycles: 1, classes: 3, classesWithTeacher: 1, teachers: 2,
  students: 40, studentsWithoutGuardian: 0, guardianReviewRequired: 0, feeStructures: 1, openingBalances: 0,
  imports: { pendingBatches: 0, rejectedRows: 2, unresolvedRows: 0, unknownClassRows: 1, batches: [] },
  rehearsal: { attendance: "2026-10-17T00:00:00Z", assessment: "2026-10-17T00:00:00Z", family: "2026-10-17T00:00:00Z" },
};

test("a complete full-operations school is ready; rejected rows stay visible as evidence without blocking", () => {
  const result = evaluateReadiness(ready);
  assert.equal(result.ready, true);
  assert.equal(result.nextRequired, null);
  assert.equal(result.checks.find(check => check.id === "imports")!.evidence.unknownClassRows, 1);
});

test("full operations requires verified guardians and fees; Exam Studio does not", () => {
  const gaps = { ...ready, studentsWithoutGuardian: 4, feeStructures: 0 };
  const full = evaluateReadiness(gaps);
  assert.equal(full.ready, false);
  assert.equal(full.nextRequired, "guardians");
  const exam = evaluateReadiness({ ...gaps, adoptionMode: "EXAM_STUDIO", classesWithTeacher: 0 });
  assert.equal(exam.ready, true, "Exam Studio runs beside the school's existing fee and family systems");
  assert.equal(exam.checks.find(check => check.id === "guardians")!.required, false);
});

test("a platform-default locale, a staged import or an incomplete rehearsal blocks go-live, in order", () => {
  assert.equal(evaluateReadiness({ ...ready, localeConfirmed: false }).nextRequired, "locale");
  assert.equal(evaluateReadiness({ ...ready, imports: { ...ready.imports, pendingBatches: 1 } }).nextRequired, "imports");
  const rehearsal = evaluateReadiness({ ...ready, rehearsal: { attendance: "x" } });
  assert.equal(rehearsal.nextRequired, "rehearsal");
  assert.equal(rehearsal.checks.find(check => check.id === "rehearsal")!.evidence.completedSteps, 1);
});

test("unknown-class roster rejections are recognised from the staging error", () => {
  assert.equal(isUnknownClassError("classId: Class is outside the selected campus or does not exist"), true);
  assert.equal(isUnknownClassError("rollNo: Roll number already used"), false);
});

// Open buttons must land where each role can act (G49a): never a console the viewer cannot open, never /dashboard,
// never a view id that only exists as an alias or a retired view.
import { checkHref, type CheckId } from "@/lib/readiness/checks";
import { ROLE_NAV, leaves, type ConsoleId } from "@/lib/navigation/role-nav";
import { canOpenHref } from "@/lib/notifications/links";
import type { UserRole } from "@/lib/roles";

const IDS: CheckId[] = ["campus", "locale", "academic", "staff", "roster", "imports", "guardians", "fees", "rehearsal"];
const liveViews = (id: ConsoleId) => new Set(leaves(ROLE_NAV[id]).flatMap((l) => ("view" in l.target ? [l.target.view] : [])));
function assertLiveView(href: string, consoleId: ConsoleId, label: string) {
  const url = new URL(href, "https://skoolee.invalid");
  if (url.pathname !== ROLE_NAV[consoleId].base) return;
  const view = url.searchParams.get("view");
  assert.ok(!view || liveViews(consoleId).has(view), `${label}: ${href} uses a registry view, not an alias (${view})`);
}

test("the group admin is sent to group views; campus-level work points at Campuses and is marked delegated", () => {
  for (const id of IDS) {
    const { href: target, delegated } = checkHref(id, { role: "SUPER_ADMIN", institutionKind: "GROUP" });
    assert.ok(target, `${id}: the group admin always has a screen`);
    const href = target!;
    assert.ok(!href.startsWith("/admin"), `${id} never opens /admin for the group admin`);
    assert.ok(!href.startsWith("/dashboard"), `${id} never opens a legacy /dashboard page`);
    assert.ok(canOpenHref("SUPER_ADMIN", href), `${id}: ${href} opens for the group admin`);
    assertLiveView(href, "super", id);
    if (["academic", "staff", "roster", "imports", "guardians", "fees"].includes(id)) assert.equal(delegated, true, `${id} is delegated`);
  }
  assert.equal(checkHref("campus", { role: "SUPER_ADMIN" }).href, "/super?view=campuses");
  assert.equal(checkHref("locale", { role: "SUPER_ADMIN" }).href, "/super?view=settings&tab=locale");
  assert.equal(checkHref("fees", "SUPER_ADMIN").href, "/super?view=campuses");
});

test("a single school's admin fixes identity and language in School settings; a campus admin in Campus setup", () => {
  assert.equal(checkHref("campus", { role: "ADMIN", institutionKind: "STANDALONE" }).href, "/admin?view=school-settings&tab=profile");
  assert.equal(checkHref("locale", { role: "ADMIN", institutionKind: "STANDALONE" }).href, "/admin?view=school-settings&tab=locale");
  assert.equal(checkHref("campus", { role: "CAMPUS_ADMIN", institutionKind: "GROUP" }).href, "/admin?view=settings&tab=profile");
  assert.equal(checkHref("locale", { role: "ADMIN", institutionKind: "GROUP" }).href, "/admin?view=settings&tab=profile");
});

test("campus operators open their own console views for campus-level checks", () => {
  for (const viewer of [{ role: "ADMIN", institutionKind: "STANDALONE" }, { role: "CAMPUS_ADMIN", institutionKind: "GROUP" }] as const) {
    assert.equal(checkHref("academic", viewer).href, "/admin?view=academic-hub");
    assert.equal(checkHref("staff", viewer).href, "/admin?view=teachers");
    assert.equal(checkHref("roster", viewer).href, "/admin?view=students");
    assert.equal(checkHref("imports", viewer).href, "/admin?view=students");
    assert.equal(checkHref("guardians", viewer).href, "/admin?view=guardians");
    assert.equal(checkHref("fees", viewer).href, "/admin?view=fees");
    assert.equal(checkHref("campus", viewer).delegated, undefined);
    for (const id of IDS) {
      const href = checkHref(id, viewer).href!;
      assert.ok(href, `${viewer.role} ${id}: operators always have a screen`);
      assert.ok(!href.startsWith("/dashboard"), `${viewer.role} ${id} avoids /dashboard`);
      assert.ok(canOpenHref(viewer.role as UserRole, href), `${viewer.role} ${id}: ${href} opens`);
      assertLiveView(href, "admin", `${viewer.role} ${id}`);
    }
  }
});

test("a setup delegate in another role is never sent into a console it cannot open, nor back to this page", () => {
  for (const role of ["PRINCIPAL", "TEACHER", "ACCOUNTANT", "RECEPTIONIST", "LIBRARIAN"] as const) {
    for (const id of IDS) {
      const { href, delegated, handledElsewhere } = checkHref(id, { role });
      assert.notEqual(delegated, true, `${role} ${id}: the group admin's "campus admins do this" copy is not theirs`);
      if (id === "rehearsal") { assert.equal(href, "/setup/readiness#practice"); continue; }
      if (href === null) { assert.equal(handledElsewhere, true, `${role} ${id}: no screen → handled elsewhere, no link`); continue; }
      assert.ok(!href.startsWith("/setup/readiness"), `${role} ${id}: never an Open link back to the readiness page`);
      assert.ok(canOpenHref(role, href), `${role} ${id}: ${href}`);
    }
  }
  // The principal fixes the academic checks in the academic console; the rest is the campus team's.
  assert.equal(checkHref("academic", { role: "PRINCIPAL" }).href, "/principal?view=classes");
  assert.deepEqual(checkHref("fees", { role: "PRINCIPAL" }), { href: null, handledElsewhere: true });
  assert.deepEqual(checkHref("fees", { role: "TEACHER" }), { href: null, handledElsewhere: true });
});

test("an ADMIN of unknown kind fails closed: campus setup, never the school owner's School settings (C32)", () => {
  assert.equal(checkHref("campus", { role: "ADMIN" }).href, "/admin?view=settings&tab=profile");
  assert.equal(checkHref("locale", { role: "ADMIN" }).href, "/admin?view=settings&tab=profile");
  // The owner flag in the authority role stands in for an unknown kind (§1.1 kindFor).
  assert.equal(checkHref("campus", { role: "ADMIN", isInstitutionOwner: true }).href, "/admin?view=school-settings&tab=profile");
});

test("evaluateReadiness resolves every check href for the viewer", () => {
  const result = evaluateReadiness(ready, { role: "SUPER_ADMIN", institutionKind: "GROUP" });
  for (const check of result.checks) assert.ok(check.href && !check.href.startsWith("/admin") && !check.href.startsWith("/dashboard"), `${check.id}: ${check.href}`);
  const teacher = evaluateReadiness(ready, { role: "TEACHER" });
  assert.ok(teacher.checks.filter((check) => check.id !== "rehearsal").every((check) => check.href === null && check.handledElsewhere), "a teacher delegate gets no links");
  const school = evaluateReadiness(ready, { role: "ADMIN", institutionKind: "STANDALONE" });
  assert.equal(school.checks.find((check) => check.id === "campus")!.href, "/admin?view=school-settings&tab=profile");
});

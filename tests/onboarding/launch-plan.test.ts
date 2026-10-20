import { test } from "node:test";
import assert from "node:assert/strict";
import { isLaunchEntry, isLaunchTask, launchPlan, requiredOnboardingPath } from "../../src/lib/onboarding/launch-plan";
import { USER_ROLES, dashboardPathForRole } from "../../src/lib/roles";
import { launchCopy } from "../../src/components/onboarding/launch-copy";
import { roleGuideCopy } from "../../src/components/onboarding/role-guide-copy";

const permissions = new Map(["ai", "exams", "timetable"].map(key => [key, { canView: true, canAdd: true }]));
const base = { institutionSetup: false, onboardingComplete: true, campusId: "campus-a", permissions };

test("every role has a useful localized route; families and staff never inherit owner setup", () => {
  for (const role of USER_ROLES) {
    const plan = launchPlan({ ...base, role });
    assert.ok(plan.actions.length);
    for (const language of ["en", "ar", "ur"] as const) {
      const c = launchCopy(language);
      assert.ok(c.journey(plan.journey)); assert.ok(c.preparation(plan.journey));
      for (const action of plan.actions) { assert.ok(c.task(action.task)); assert.ok(c.taskDetail(action.task)); }
    }
    if (!["SUPER_ADMIN", "ADMIN", "CAMPUS_ADMIN", "PRINCIPAL", "TEACHER"].includes(role)) {
      assert.equal(plan.actions[0].href, dashboardPathForRole(role));
      assert.equal(requiredOnboardingPath(role, false), null);
    }
  }
});
test("institution authority and teacher profile outrank optional AI workflows", () => {
  assert.deepEqual(launchPlan({ ...base, role: "ADMIN", institutionSetup: true, onboardingComplete: false }).actions, [{ task: "institution", href: "/onboarding" }]);
  assert.deepEqual(launchPlan({ ...base, role: "TEACHER", onboardingComplete: false }).actions, [{ task: "profile", href: "/teacher-onboarding" }]);
  assert.equal(requiredOnboardingPath("TEACHER", true), null);
  assert.equal(requiredOnboardingPath("PRINCIPAL", false), null);
});
test("campus instructions honor missing assignments, role scope and revoked permissions", () => {
  const principal = launchPlan({ ...base, role: "PRINCIPAL" });
  assert.equal(principal.journey, "campus");
  assert.equal(principal.actions[0].href, "/ai?setup=1");
  assert.ok(!principal.actions.some(action => action.href.startsWith("/admin")));
  for (const role of ["ADMIN", "PRINCIPAL", "CAMPUS_ADMIN", "TEACHER"] as const) {
    const unassigned = launchPlan({ ...base, role, campusId: null });
    assert.equal(unassigned.needsCampus, true);
    assert.ok(!unassigned.actions.some(action => action.href.startsWith("/ai")));
    const denied = launchPlan({ ...base, role, permissions: new Map() });
    assert.ok(!denied.actions.some(action => action.href.startsWith("/ai")));
  }
  const examsOnly = launchPlan({ ...base, role: "PRINCIPAL", permissions: new Map([["exams", { canView: true, canAdd: false }]]) });
  assert.ok(!examsOnly.actions.some(action => action.task === "academics"));
  const timetableOnly = launchPlan({ ...base, role: "PRINCIPAL", permissions: new Map([["timetable", { canView: true, canAdd: false }]]) });
  assert.ok(timetableOnly.actions.some(action => action.task === "academics"));
  const readOnly = launchPlan({ ...base, role: "PRINCIPAL", permissions: new Map([["ai", { canView: true, canAdd: false }]]) });
  assert.ok(!readOnly.actions.some(action => action.task === "aiSetup"));
  assert.ok(readOnly.actions.some(action => action.task === "aiWorkspace"));
  for (const role of ["ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST"] as const) {
    assert.ok(launchPlan({ ...base, role }).actions.some(action => action.task === "aiWorkspace"));
    assert.ok(!launchPlan({ ...base, role, permissions: new Map() }).actions.some(action => action.href.startsWith("/ai")));
    assert.ok(!launchPlan({ ...base, role, campusId: null }).actions.some(action => action.href.startsWith("/ai")));
  }
});
test("welcome is limited to entry routes, never timed exams, billing or password setup", () => {
  for (const path of ["/first-login", "/login", "/protect-account", "/subscription", "/onboarding/package", "/ai/studio", "/ai/exams/attempt", "/teacher/attendance"]) assert.equal(isLaunchEntry(path), false, path);
  for (const path of ["/onboarding", "/teacher-onboarding", "/admin", "/student", "/ai"]) assert.equal(isLaunchEntry(path), true, path);
});
test("dashboard defaults and campaign attribution allow welcome; explicit work remains uninterrupted", () => {
  for (const search of ["", "view=overview", "view=overview&lang=ur", "lang=ar&utm_source=welcome", "utm_campaign=first-login"]) {
    assert.equal(isLaunchTask(search), false, search);
    assert.equal(isLaunchTask(search, "#workspace-content"), false, `${search} with skip-navigation anchor`);
  }
  for (const search of ["view=academic-hub", "setup=1", "workflow=overview", "record=123", "view=overview&workflow=fees", "view=overview&view=students"]) {
    assert.equal(isLaunchTask(search), true, search);
  }
  assert.equal(isLaunchTask("view=overview", "#payment"), true);
});

test("every role has its own complete story in each supported language", () => {
  for (const language of ["en", "ar", "ur"] as const) {
    const titles = new Set<string>();
    for (const role of USER_ROLES) {
      const copy = roleGuideCopy(role, language);
      for (const text of [
        copy.title, copy.introduction, copy.preparationTitle, copy.preparation,
        copy.chooseTitle, copy.greeting, copy.scopeTitle, copy.scopeHint,
        copy.reviewTitle, copy.reviewHint, copy.saveTitle, copy.saveHint,
      ]) {
        assert.ok(text.trim().length > 0, `${role} ${language} contains an empty instruction`);
        if (language !== "en") assert.match(text, /[\u0600-\u06ff]/, `${role} ${language} has an untranslated instruction`);
      }
      titles.add(copy.title);
      assert.equal(copy.scenes.length, 3);
      assert.equal(new Set(copy.scenes.map(scene => scene.caption)).size, 3, `${role} ${language} repeats its scene narration`);
      for (const scene of copy.scenes) {
        assert.ok(scene.caption.trim());
        assert.ok(scene.status.trim());
        assert.equal(scene.cards.length, 3);
        assert.ok(scene.cards.every(card => card.label.trim() && card.title.trim()));
      }
    }
    assert.equal(titles.size, USER_ROLES.length, `${language} reuses a role headline`);
  }
});

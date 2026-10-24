import { test } from "node:test";
import assert from "node:assert/strict";
import { AI_SETUP_HREF, campusTaskHref, flagshipOf, isLaunchEntry, isLaunchTask, launchPlan, planFlagships, requiredOnboardingPath } from "../../src/lib/onboarding/launch-plan";
import { USER_ROLES, dashboardPathForRole } from "../../src/lib/roles";
import { launchCopy } from "../../src/components/onboarding/launch-copy";
import { guideRoleFor, roleGuideCopy } from "../../src/components/onboarding/role-guide-copy";

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
      assert.equal(plan.actions[0].task, "roleSetup");
      assert.ok(plan.actions.some(action => action.href === dashboardPathForRole(role)));
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
  // The setup questionnaire is not the principal's (SPEC M51, G42: no setup tools): AI Workflows and Exam Studio are.
  assert.ok(!principal.actions.some(action => action.task === "aiSetup"), "no setup questionnaire for the principal");
  assert.deepEqual(principal.actions.slice(0, 2), [{ task: "roleSetup", href: AI_SETUP_HREF }, { task: "studio", href: "/ai/studio" }]);
  for (const role of ["ADMIN", "CAMPUS_ADMIN"] as const) {
    const plan = launchPlan({ ...base, role });
    assert.equal(plan.actions[0].href, AI_SETUP_HREF, role);
    assert.ok(!plan.actions.some(action => action.task === "aiWorkspace"), `${role}: the questionnaire comes first, workflows after it`);
    assert.ok(!plan.actions.some(action => action.task === "studio"), `${role}: Exam Studio only while academic lead, which the welcome cannot see`);
  }
  // Group owners coordinate campus setup rather than completing the campus interview.
  for (const campusId of ["campus-a", null]) {
    const groupAdmin = launchPlan({ ...base, role: "SUPER_ADMIN", campusId });
    assert.deepEqual(groupAdmin.actions, [{ task: "roleSetup", href: AI_SETUP_HREF }, { task: "workspace", href: "/super" }], `group admin (campus ${campusId})`);
  }
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
  assert.ok(!readOnly.actions.some(action => action.task === "studio"), "no Exam Studio without the exams module");
  // A campus operator who may view AI but not draft opens AI Workflows instead of the questionnaire.
  const viewOnlyOperator = launchPlan({ ...base, role: "CAMPUS_ADMIN", permissions: new Map([["ai", { canView: true, canAdd: false }]]) });
  assert.equal(viewOnlyOperator.actions[0].task, "aiWorkspace");
  // The desks and the teacher have no AI Workflows entry (addendum: SA, standalone ADMIN, CA and PRINCIPAL only).
  for (const role of ["ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST", "TEACHER"] as const) {
    assert.ok(launchPlan({ ...base, role }).actions.some(action => action.task === "roleSetup"), role);
  }
  assert.equal(launchPlan({ ...base, role: "TEACHER" }).actions[0].task, "roleSetup");
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

test("launch hrefs point at registry views (SPEC §3, §11 P3)", () => {
  const campusTask = (role: "ADMIN" | "CAMPUS_ADMIN", institutionKind?: "GROUP" | "STANDALONE") =>
    launchPlan({ ...base, role, institutionKind }).actions.find(action => action.task === "campus")?.href;
  assert.equal(campusTask("ADMIN", "STANDALONE"), "/admin?view=school-settings&tab=profile", "the standalone owner's school profile");
  assert.equal(campusTask("ADMIN", "GROUP"), "/admin?view=settings&tab=profile");
  assert.equal(campusTask("ADMIN"), "/admin?view=settings&tab=profile", "unknown kind: Campus setup, which re-routes the owner");
  assert.equal(campusTask("CAMPUS_ADMIN", "STANDALONE"), "/admin?view=settings&tab=profile", "a deputy edits the campus, never the school");
  for (const role of USER_ROLES) {
    for (const action of launchPlan({ ...base, role }).actions) {
      assert.doesNotMatch(action.href, /view=(institution|schools)\b/, `${role} ${action.task} uses a retired view`);
    }
  }
  // "Review academic setup" (grades, subjects, class structure) opens Classes & subjects, not the Today queue that the
  // workspace task already opens.
  const principal = launchPlan({ ...base, role: "PRINCIPAL" }).actions;
  assert.equal(principal.find(action => action.task === "academics")?.href, "/principal?view=classes");
  assert.notEqual(principal.find(action => action.task === "academics")?.href, principal.find(action => action.task === "workspace")?.href);
  assert.equal(campusTaskHref("ADMIN", "STANDALONE"), "/admin?view=school-settings&tab=profile");
  assert.equal(campusTaskHref("ADMIN", null), "/admin?view=settings&tab=profile");
  assert.equal(launchPlan({ ...base, role: "CAMPUS_ADMIN" }).actions.find(action => action.task === "academics")?.href, "/admin?view=academic-hub");
});

test("every console landing is a welcome entry, including the desks' dashboard and the owner's schools", () => {
  for (const search of ["view=dashboard", "view=schools", "view=dashboard&lang=ur"]) assert.equal(isLaunchTask(search), false, search);
  for (const search of ["view=payments", "view=dashboard&record=1"]) assert.equal(isLaunchTask(search), true, search);
});

test("the ADMIN story follows the institution kind: two hats with billing when standalone, the campus story in a group", () => {
  for (const language of ["en", "ar", "ur"] as const) {
    assert.deepEqual(roleGuideCopy("ADMIN", language, "GROUP"), roleGuideCopy("CAMPUS_ADMIN", language));
    assert.deepEqual(roleGuideCopy("ADMIN", language, "STANDALONE"), roleGuideCopy("ADMIN", language));
    assert.notDeepEqual(roleGuideCopy("ADMIN", language), roleGuideCopy("CAMPUS_ADMIN", language));
  }
  // Unknown kind (the session lookup failed or omitted it) fails closed to the campus story and label (C32).
  assert.equal(guideRoleFor("ADMIN", undefined), "CAMPUS_ADMIN");
  assert.equal(guideRoleFor("ADMIN", null), "CAMPUS_ADMIN");
  assert.equal(guideRoleFor("ADMIN", "GROUP"), "CAMPUS_ADMIN");
  assert.equal(guideRoleFor("ADMIN", "STANDALONE"), "ADMIN");
  for (const role of USER_ROLES) if (role !== "ADMIN") assert.equal(guideRoleFor(role, undefined), role);
  for (const language of ["en", "ar", "ur"] as const) {
    assert.deepEqual(roleGuideCopy(guideRoleFor("ADMIN", undefined), language), roleGuideCopy("CAMPUS_ADMIN", language));
  }
  assert.doesNotMatch(roleGuideCopy(guideRoleFor("ADMIN", undefined), "en").introduction, /billing/i);
  const owner = roleGuideCopy("ADMIN", "en");
  assert.match(owner.introduction, /manage billing/);
  assert.match(owner.scopeHint, /school admin and the account owner/);
  assert.doesNotMatch(roleGuideCopy("CAMPUS_ADMIN", "en").introduction, /billing/i, "a campus admin is never told they manage billing");
});

test("billing wording in the owner story follows the subscription, not the institution kind alone", () => {
  for (const language of ["en", "ar", "ur"] as const) {
    const owner = roleGuideCopy("ADMIN", language, undefined, { billing: true });
    const schoolAdmin = roleGuideCopy("ADMIN", language, undefined, { billing: false });
    assert.deepEqual(owner, roleGuideCopy("ADMIN", language), "role-only callers keep the owner story");
    assert.notDeepEqual(schoolAdmin, owner);
    assert.equal(schoolAdmin.title, owner.title, "still the school admin's story");
    const texts = [schoolAdmin.introduction, schoolAdmin.scopeHint, schoolAdmin.greeting, ...schoolAdmin.scenes.flatMap(scene => [scene.caption, scene.status, ...scene.cards.map(card => card.title)])];
    for (const text of texts) {
      assert.ok(text.trim(), language);
      assert.doesNotMatch(text, /billing|SkooleeAI account|الفوترة|بلنگ/i, `${language}: ${text}`);
      if (language !== "en") assert.match(text, /[\u0600-\u06ff]/, `${language} untranslated: ${text}`);
    }
    assert.equal(new Set(schoolAdmin.scenes.map(scene => scene.caption)).size, 3);
    // `billing` only shapes the owner story; every other story is unchanged by it.
    assert.deepEqual(roleGuideCopy("CAMPUS_ADMIN", language, undefined, { billing: false }), roleGuideCopy("CAMPUS_ADMIN", language));
    assert.deepEqual(roleGuideCopy("ADMIN", language, "GROUP", { billing: false }), roleGuideCopy("CAMPUS_ADMIN", language));
  }
  assert.match(roleGuideCopy("ADMIN", "en", undefined, { billing: true }).introduction, /manage billing/);
});

test("the finance desk's story talks about fees, never billing (§8.2)", () => {
  for (const language of ["en", "ar", "ur"] as const) {
    const copy = roleGuideCopy("ACCOUNTANT", language);
    const texts = [copy.preparation, ...copy.scenes.flatMap(scene => scene.cards.map(card => card.title))];
    for (const text of texts) assert.doesNotMatch(text, /billing|الفوترة|بل کی|بلنگ/i, `${language}: ${text}`);
  }
  assert.match(roleGuideCopy("ACCOUNTANT", "en").preparation, /fee period/);
});

test("the standalone owner's campus task reads as the school's own profile, in every language", () => {
  for (const language of ["en", "ar", "ur"] as const) {
    const c = launchCopy(language);
    assert.notEqual(c.task("campus", true), c.task("campus"), language);
    assert.notEqual(c.taskDetail("campus", true), c.taskDetail("campus"), language);
    assert.equal(c.task("workspace", true), c.task("workspace"), "only the campus task changes");
  }
  assert.equal(launchCopy("en").task("campus", true), "Review school details");
});

test("flagships: the welcome leads each role to the flagships it may use, marked on the choices (addendum 2026-10-22)", () => {
  const flagships = (role: (typeof USER_ROLES)[number], extra: Partial<Parameters<typeof launchPlan>[0]> = {}) => planFlagships(launchPlan({ ...base, role, ...extra }).actions);
  assert.deepEqual(flagships("SUPER_ADMIN"), ["ai-workflows"]);
  assert.deepEqual(flagships("ADMIN"), ["ai-workflows"]);
  assert.deepEqual(flagships("CAMPUS_ADMIN"), ["ai-workflows"]);
  assert.deepEqual(flagships("PRINCIPAL"), ["ai-workflows", "exam-studio"]);
  assert.deepEqual(flagships("TEACHER"), ["ai-workflows", "exam-studio"]);
  assert.deepEqual(flagships("ADMIN", { institutionSetup: true }), ["ai-workflows"], "the institution wizard ends in the AI setup questionnaire");
  for (const role of ["STUDENT", "PARENT", "ACCOUNTANT", "LIBRARIAN", "RECEPTIONIST", "APP_OWNER"] as const) assert.deepEqual(flagships(role), ["ai-workflows"], role);
  assert.deepEqual(flagships("PRINCIPAL", { permissions: new Map() }), [], "no AI module, no flagship");
  assert.equal(flagshipOf("aiSetup"), "ai-workflows");
  assert.equal(flagshipOf("aiWorkspace"), "ai-workflows");
  assert.equal(flagshipOf("studio"), "exam-studio");
  assert.equal(flagshipOf("institution"), null, "the institution wizard itself is not an AI surface");
  for (const language of ["en", "ar", "ur"] as const) {
    const c = launchCopy(language);
    for (const key of ["ai-workflows", "exam-studio"] as const) {
      assert.ok(c.flagshipName(key).trim() && c.flagshipPitch(key).trim(), `${language} ${key}`);
      if (language !== "en") assert.match(c.flagshipPitch(key), /[\u0600-\u06ff]/);
    }
    // The authority sets up the school; a campus operator sets up its campus.
    assert.notEqual(c.task("aiSetup", true), c.task("aiSetup"), language);
    assert.ok(c.flagshipsTitle.trim());
  }
  const en = launchCopy("en");
  assert.equal(en.task("aiSetup", true), "Set up my school with AI");
  assert.equal(en.task("aiSetup"), "Set up my campus with AI");
  assert.equal(en.task("studio"), "Create an exam in Exam Studio");
  assert.equal(en.flagshipName("ai-workflows"), "AI Workflows", "the sidebar's name");
  assert.equal(en.flagshipName("exam-studio"), "Exam Studio", "the sidebar's name");
  // Truthful copy: AI drafts are reviewed and approved before anything applies.
  for (const text of [en.taskDetail("aiSetup"), en.taskDetail("aiWorkspace")]) assert.match(text, /creates|automatically/i, text);
  for (const text of [en.taskDetail("studio"), en.flagshipPitch("ai-workflows")]) assert.match(text, /review|approv/i, text);
});

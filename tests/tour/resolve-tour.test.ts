/**
 * Spotlight tour resolver — persona matrix (SPEC §9.8).
 *   node --import tsx --test tests/tour/resolve-tour.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TOURS, TOUR_IDS, consumePendingStart, hasNewTour, isConsoleLanding, isInsideConsole, parseTourProgress, probeUnsavedWork, recordTourProgress,
  resolveTour, shouldAutoStart, startIndexFor, tourConsole, tourForConsole, tourProgressInput, writePendingStart,
  type StorageLike, type TourId, type TourStep,
} from "../../src/lib/onboarding/tours";
import { ANCHOR_FORMAT } from "../../src/lib/onboarding/tours/anchors";
import { ROLE_NAV, labelFor, leaves, mobileLeaves, type ConsoleId } from "../../src/lib/navigation/role-nav";
import { translateUi } from "../../src/lib/locale/ui-messages";
import { navRefOf } from "../../src/lib/onboarding/tours/resolve";

const MODULES = ["students", "fees", "payroll", "leave", "attendance", "timetable", "exams", "reports", "staff", "admissions", "accounts", "ai", "library", "front-desk", "transport", "inventory", "dormitory"];
const on = (...keys: string[]) => Object.fromEntries(keys.map((k) => [k, true])) as Record<string, boolean>;
const allModules = on(...MODULES);

type Persona = { console: ConsoleId; access: Record<string, boolean>; tour: TourId };
const campusOps = ["campusOps", "recordSearch", "corrections", "improvementLead", "activityStaff", "tripToday"];
const PERSONAS: Record<string, Persona> = {
  saOwner: { console: "super", tour: "super", access: { ...allModules, ...on("institutionAuthority", "billing", "groupConsole", "memberships", "inviteLeaders", "mfaVerified", "schoolAi") } },
  saFlagless: { console: "super", tour: "super", access: { ...allModules, ...on("institutionAuthority", "groupConsole", "memberships", "inviteLeaders") } },
  soFullyStaffed: { console: "admin", tour: "admin-school", access: { ...allModules, ...on(...campusOps, "standaloneOwner", "institutionAuthority", "billing", "memberships", "inviteLeaders", "hasCampusAdmin", "hasPrincipal", "hasAccountant", "hasReceptionist", "hasLibrarian", "schoolAi") } },
  soAlone: { console: "admin", tour: "admin-school", access: { ...allModules, ...on(...campusOps, "standaloneOwner", "institutionAuthority", "billing", "memberships", "inviteLeaders", "hasCampusAdmin", "academicLead", "financeDesk", "frontDesk", "libraryDesk", "schoolAi", "schoolAiExams") } },
  // A STANDALONE ADMIN without the owner flag or a purchase delegation (legacy or provisioned rows): the school's
  // authority with the "Your school" group, but no subscription (canOwnSubscription false).
  soWithoutBilling: { console: "admin", tour: "admin-school", access: { ...allModules, ...on(...campusOps, "standaloneOwner", "institutionAuthority", "memberships", "inviteLeaders", "hasCampusAdmin", "hasPrincipal", "hasAccountant") } },
  caGroupDelegate: { console: "admin", tour: "admin-campus", access: { ...allModules, ...on(...campusOps, "groupCampus", "memberships", "hasCampusAdmin", "hasPrincipal", "hasAccountant", "schoolAi") } },
  caGroupNoInvite: { console: "admin", tour: "admin-campus", access: { ...allModules, ...on(...campusOps, "groupCampus", "hasCampusAdmin", "academicLead", "financeDesk", "schoolAi", "schoolAiExams") } },
  caOneCampusGroupStaleFlag: { console: "admin", tour: "admin-campus", access: { ...allModules, ...on(...campusOps, "groupCampus", "hasCampusAdmin", "hasPrincipal") } },
  deputyStandalone: { console: "admin", tour: "admin-campus", access: { ...allModules, ...on(...campusOps, "standaloneDeputy", "hasCampusAdmin", "hasPrincipal") } },
  principal: { console: "principal", tour: "principal", access: { ...on("students", "attendance", "timetable", "exams", "reports", "staff", "leave", "ai"), ...on("academicLead", "improvementLead", "recordSearch", "corrections", "hasCampusAdmin", "schoolAi", "schoolAiExams") } },
  teacher: { console: "teacher", tour: "teacher", access: on("students", "attendance", "timetable", "exams", "reports", "leave", "ai", "corrections", "schoolAi", "schoolAiExams") },
  accountant: { console: "accountant", tour: "accountant", access: on("fees", "payroll", "accounts", "reports", "leave", "financeDesk", "corrections") },
  receptionist: { console: "receptionist", tour: "receptionist", access: on("front-desk", "admissions", "leave", "frontDesk", "recordSearch") },
  librarian: { console: "librarian", tour: "librarian", access: on("library", "leave", "libraryDesk") },
  parentOneChild: { console: "parent", tour: "parent", access: on("fees", "attendance", "reports", "timetable") },
  parentTwoChildren: { console: "parent", tour: "parent", access: on("fees", "attendance", "reports", "timetable", "multiChild", "pickupGuardian") },
  student: { console: "student", tour: "student", access: on("timetable", "reports", "attendance", "fees", "schoolAiExams") },
  appOwner: { console: "owner", tour: "owner", access: {} },
};

const resolved = (p: Persona, mobile = false) => resolveTour(TOURS[tourForConsole(p.console, p.access)], { access: p.access, mobile });
const en = (steps: TourStep[]) => steps.map((s) => `${s.title[0]} — ${s.body[0]}`).join("\n");
const anchors = (steps: TourStep[]) => steps.map((s) => s.anchor);
const step = (steps: TourStep[], id: string) => steps.find((s) => s.id === id);

test("every persona gets its console's tour variant", () => {
  for (const [name, p] of Object.entries(PERSONAS)) {
    assert.equal(tourForConsole(p.console, p.access), p.tour, name);
    assert.equal(TOURS[p.tour].console, p.console, name);
    assert.ok(resolved(p).length >= 2, `${name} resolves to a usable tour`);
  }
});

test("never a billing step without the billing capability (desktop and mobile)", () => {
  for (const [name, p] of Object.entries(PERSONAS)) {
    for (const mobile of [false, true]) {
      const steps = resolved(p, mobile);
      // A billing step: the billing control itself, or a step that tells the reader billing or the account is theirs
      // (EN/AR/UR). "Billing … stays with your group admin" is not one: it names who holds it.
      const billingStep = steps.some((s) => /billing/.test(s.anchor) || s.id === "billing"
        || /^Owner tools: billing|and the account owner/.test(s.body[0]) || /أدوات المالك: الفوترة|ومالك الحساب/.test(s.body[1]) || /مالک کے اختیارات: بلنگ|اکاؤنٹ کے مالک بھی/.test(s.body[2]));
      if (p.access.billing !== true) assert.equal(billingStep, false, `${name}${mobile ? " (mobile)" : ""} sees a billing step without billing`);
    }
  }
  assert.ok(anchors(resolved(PERSONAS.saOwner)).includes("shell.nav.billing"));
  assert.ok(!anchors(resolved(PERSONAS.saFlagless)).includes("shell.nav.billing"));
  assert.ok(anchors(resolved(PERSONAS.soAlone)).includes("shell.nav.billing"));
  assert.ok(anchors(resolved(PERSONAS.soAlone)).includes("shell.nav-group.your-school"));
  for (const ca of ["caGroupDelegate", "caGroupNoInvite", "caOneCampusGroupStaleFlag", "deputyStandalone"]) {
    assert.ok(!en(resolved(PERSONAS[ca])).includes("Your SkooleeAI plan"), ca);
    assert.ok(!anchors(resolved(PERSONAS[ca])).includes("shell.nav-group.your-school"), ca);
  }
});

test("a standalone school admin without the subscription keeps the school tools, and is never told about billing", () => {
  const steps = resolved(PERSONAS.soWithoutBilling);
  assert.equal(tourForConsole("admin", PERSONAS.soWithoutBilling.access), "admin-school");
  assert.ok(anchors(steps).includes("shell.nav-group.your-school"), "the Your school group is still introduced");
  assert.ok(!anchors(steps).includes("shell.nav.billing"));
  assert.equal(step(steps, "your-school")!.body[0], "School-wide tools: support approvals, who can manage members, and school settings.");
  assert.equal(step(steps, "two-hats")!.body[0], "You are the school admin: daily operations and school-wide settings are both yours.");
  // The subscription holder reads the owner wording.
  const owner = resolved(PERSONAS.soAlone);
  assert.match(step(owner, "your-school")!.body[0], /^Owner tools: billing/);
  assert.match(step(owner, "two-hats")!.body[0], /school admin and the account owner/);
});

test("desk approvers are named for both structures: never 'campus admin' to a standalone school's desks", () => {
  for (const id of ["accountant", "receptionist"] as const) {
    for (const s of TOURS[id].steps) {
      assert.doesNotMatch(s.body[0], /campus admin/i, `${id}.${s.id}`);
      assert.doesNotMatch(s.body[1], /مدير الفرع/, `${id}.${s.id} (ar)`);
      assert.doesNotMatch(s.body[2], /کیمپس منتظم/, `${id}.${s.id} (ur)`);
    }
  }
  assert.match(step(resolved(PERSONAS.accountant), "invoices")!.body[0], /go to your admin for approval/);
  assert.match(step(resolved(PERSONAS.accountant), "payroll")!.body[0], /your admin approves it/);
  assert.match(step(resolved(PERSONAS.receptionist), "admissions")!.body[0], /your admin makes offers/);
});

test("standalone owner: variants follow the principal and accountant seats", () => {
  const staffed = resolved(PERSONAS.soFullyStaffed);
  const alone = resolved(PERSONAS.soAlone);
  assert.match(step(staffed, "academics")!.body[0], /your principal runs timetable, exams and results/);
  assert.match(step(alone, "academics")!.body[0], /move to your principal once you appoint one/);
  assert.match(step(staffed, "fees")!.body[0], /^Your accountant records payments/);
  assert.match(step(alone, "fees")!.body[0], /until you add an accountant/);
  assert.equal(staffed[0].anchor, "shell.header.account");
  assert.match(staffed[0].body[0], /school admin and the account owner/);
});

test("group campus admin: invite copy follows the delegation, academics follow the principal seat", () => {
  const delegate = resolved(PERSONAS.caGroupDelegate);
  const noInvite = resolved(PERSONAS.caGroupNoInvite);
  assert.equal(step(delegate, "staff")!.body[0], "Invite teachers and office staff for this campus.");
  assert.equal(step(noInvite, "staff")!.body[0], "See your staff; your group admin can let you invite.");
  assert.match(step(delegate, "academics")!.body[0], /your principal runs timetable/);
  assert.match(step(noInvite, "academics")!.body[0], /With no principal appointed/);
  assert.match(step(noInvite, "fees")!.body[0], /^Issue invoices, record payments/);
  assert.match(step(delegate, "fees")!.body[0], /your accountant records payments/);
  assert.match(delegate[0].body[0], /stay with your group admin/);
});

test("deputy campus admin in a standalone school never reads 'group admin'", () => {
  for (const mobile of [false, true]) {
    const steps = resolved(PERSONAS.deputyStandalone, mobile);
    const text = en(steps);
    assert.doesNotMatch(text, /group admin/i);
    assert.match(text, /your school admin/);
    assert.equal(steps[0].title[0], "Your school");
  }
});

test("principal, teacher, office desks, families and the platform operator", () => {
  const principal = resolved(PERSONAS.principal);
  assert.deepEqual(anchors(principal).slice(0, 4), ["principal.today.flagship-ai", "principal.today.flagship-exams", "work.today.queue", "page.primary-action"]);
  assert.equal(step(principal, "exams")!.revealGroup, "results");
  assert.equal(step(principal, "approve-reports")!.view, "report-cards");

  const teacher = resolved(PERSONAS.teacher);
  assert.equal(teacher.length, 12);
  assert.match(step(teacher, "tests")!.body[0], /lock the marks when you have finished/);

  const accountant = resolved(PERSONAS.accountant);
  assert.ok(anchors(accountant).includes("shell.nav.payroll"));
  assert.match(step(accountant, "invoices")!.body[0], /go to your admin/);

  const receptionist = resolved(PERSONAS.receptionist);
  assert.ok(anchors(receptionist).includes("reception.pickup.check"));
  assert.equal(receptionist.at(-1)!.anchor, "shell.header.help");

  assert.equal(resolved(PERSONAS.librarian).length, 7);

  const one = resolved(PERSONAS.parentOneChild);
  const two = resolved(PERSONAS.parentTwoChildren);
  assert.ok(!anchors(one).includes("shell.parent.child-switcher"), "one child: no switcher step");
  assert.equal(two[0].anchor, "shell.parent.child-switcher");
  assert.match(step(two, "more")!.body[0], /live under More/);

  assert.equal(resolved(PERSONAS.student)[0].anchor, "student.today.next");
  const owner = resolved(PERSONAS.appOwner);
  assert.deepEqual(anchors(owner), ["owner.schools.table", "shell.nav.subscription-requests", "shell.nav.pricing", "shell.nav.gateways", "shell.nav.support", "shell.nav.audit", "shell.header.help"]);
});

test("flagships: every role that may use them sees the Today card, then the sidebar entry (addendum 2026-10-22)", () => {
  const aiRoles = { saOwner: "super", soFullyStaffed: "admin", soAlone: "admin", caGroupDelegate: "admin", caGroupNoInvite: "admin", principal: "principal" } as const;
  for (const [name, consoleId] of Object.entries(aiRoles)) {
    const steps = resolved(PERSONAS[name]);
    const card = anchors(steps).indexOf(`${consoleId}.today.flagship-ai`);
    const nav = anchors(steps).indexOf("shell.nav.ai-workflows");
    assert.ok(card >= 0, `${name}: AI Workflows card`);
    assert.ok(nav > card, `${name}: the sidebar entry follows the card`);
    assert.deepEqual(steps[nav].title, [labelFor(leaves(ROLE_NAV[consoleId]).find((l) => l.id === "ai-workflows")!, PERSONAS[name].access), translateUi("AI Workflows", "ar"), translateUi("AI Workflows", "ur")]);
    assert.equal(steps[nav].title[0], "AI Workflows");
  }
  const examRoles = { soAlone: "admin", caGroupNoInvite: "admin", principal: "principal", teacher: "teacher" } as const;
  for (const [name, consoleId] of Object.entries(examRoles)) {
    const steps = anchors(resolved(PERSONAS[name]));
    assert.ok(steps.includes(`${consoleId}.today.flagship-exams`), `${name}: Exam Studio card`);
    assert.ok(steps.indexOf("shell.nav.exam-studio") > steps.indexOf(`${consoleId}.today.flagship-exams`), `${name}: Exam Studio entry follows the card`);
  }
  // A campus operator holds Exam Studio only while it is the academic lead (no principal appointed).
  for (const name of ["soFullyStaffed", "caGroupDelegate", "deputyStandalone", "caOneCampusGroupStaleFlag"]) {
    const steps = anchors(resolved(PERSONAS[name]));
    assert.ok(!steps.includes("admin.today.flagship-exams") && !steps.includes("shell.nav.exam-studio"), `${name}: no Exam Studio while a principal leads`);
  }
  // The teacher's flagship is Exam Studio; AI Workflows is not theirs. Desks, families and the platform have neither.
  assert.ok(!anchors(resolved(PERSONAS.teacher)).some((a) => /ai-workflows|flagship-ai/.test(a)));
  for (const name of ["accountant", "receptionist", "librarian", "parentOneChild", "parentTwoChildren", "appOwner"]) {
    assert.ok(!anchors(resolved(PERSONAS[name])).some((a) => /flagship|ai-workflows|exam-studio/.test(a)), name);
  }
  // Learners have no AI Workflows or Exam Studio entry; their flagship is delivery (the Today card of upcoming exams).
  assert.ok(!anchors(resolved(PERSONAS.student)).some((a) => /flagship-ai|ai-workflows|exam-studio/.test(a)));
  // Without the School AI gate there is no AI step at all (the card is not rendered, the entry is hidden).
  const noAi: Persona = { ...PERSONAS.principal, access: { ...PERSONAS.principal.access, ai: false, schoolAi: false, schoolAiExams: false } };
  assert.ok(!anchors(resolved(noAi)).some((a) => /flagship|ai-workflows|exam-studio/.test(a)));
  // Learners keep their online exams (delivery) prominent: the Today card, then the entry right after Today, never
  // only under More. The card is rendered only while exams are scheduled, so its step waits briefly, not 2.5 s.
  const learner = resolved(PERSONAS.student);
  assert.deepEqual(anchors(learner).slice(0, 3), ["student.today.next", "student.today.flagship-exams", "shell.nav.online-exams"]);
  assert.ok(step(learner, "flagship-exams")!.waitMs! < 2500);
  const noExams = anchors(resolved({ ...PERSONAS.student, access: { ...PERSONAS.student.access, schoolAiExams: false } }));
  assert.ok(!noExams.includes("shell.nav.online-exams") && !noExams.includes("student.today.flagship-exams"));
  // Truthful copy: every AI flagship step says drafts are reviewed or approved before anything applies.
  for (const [name, p] of Object.entries(PERSONAS)) {
    for (const s of resolved(p)) {
      if (/flagship-ai|ai-workflows/.test(s.anchor)) assert.match(s.body[0], /review|approv/, `${name}.${s.id}`);
    }
  }
  // While AI setup is pending the flagship card is Today's one primary action and Add student steps down to a
  // secondary, so the enrolment step rings the header's action row (present in both states), never the primary.
  for (const name of ["soAlone", "soFullyStaffed", "caGroupDelegate", "deputyStandalone"]) {
    assert.equal(step(resolved(PERSONAS[name]), "add-student")?.anchor, "page.actions", name);
  }
  // The generic "AI assistant" row is gone from the sidebar; no tour points at it.
  for (const id of TOUR_IDS) assert.ok(!TOURS[id].steps.some((s) => s.anchor === "shell.nav.ai"), id);
  // Phones: the flagship entry is reached through More and says so.
  const phone = resolved(PERSONAS.principal, true);
  assert.equal(step(phone, "ai-workflows")!.anchor, "shell.mobile.more");
  assert.equal(step(phone, "ai-workflows")!.title[0], "Under More: AI Workflows");
  assert.equal(step(phone, "flagship-ai")!.anchor, "principal.today.flagship-ai", "the Today card is the same control on phones");
});

test("mobile anchors map to the console's slots or to More", () => {
  const teacher = resolved(PERSONAS.teacher, true);
  assert.equal(step(teacher, "attendance")!.anchor, "shell.mobile.attendance");
  assert.equal(step(teacher, "marks")!.anchor, "shell.mobile.marks");
  assert.equal(step(teacher, "messages")!.anchor, "shell.mobile.messages");
  assert.equal(step(teacher, "tests")!.anchor, "shell.mobile.more");
  assert.equal(step(teacher, "tests")!.title[0], "Under More: Tests & quizzes");
  assert.match(step(teacher, "tests")!.title[1], /المزيد/);
  assert.match(step(teacher, "tests")!.title[2], /مزید/);
  assert.equal(step(teacher, "classes")!.anchor, "shell.mobile.more");
  const parent = resolved(PERSONAS.parentTwoChildren, true);
  assert.equal(step(parent, "fees")!.anchor, "shell.mobile.fees");
  assert.equal(step(parent, "results")!.anchor, "shell.mobile.results");
  assert.equal(step(parent, "more")!.anchor, "shell.mobile.more");
  assert.equal(step(parent, "more")!.title[0], "More", "an explicit mobile anchor keeps its own title");
  const sa = resolved(PERSONAS.saOwner, true);
  assert.equal(step(sa, "campuses")!.anchor, "shell.mobile.campuses");
  assert.equal(step(sa, "approvals")!.anchor, "shell.mobile.approvals");
  assert.equal(step(sa, "billing")!.anchor, "shell.mobile.more");
  for (const [name, p] of Object.entries(PERSONAS)) {
    const mobile = resolved(p, true);
    for (const s of mobile) {
      assert.ok(!/^shell\.nav(-group)?\./.test(s.anchor), `${name}: ${s.id} keeps a desktop nav anchor on mobile`);
      assert.equal(s.revealGroup, undefined, `${name}: ${s.id} never opens the navigation on mobile`);
      if (s.anchor.startsWith("shell.mobile.") && s.anchor !== "shell.mobile.more") {
        const id = s.anchor.slice("shell.mobile.".length);
        const leaf = [...ROLE_NAV[p.console].entries.flatMap((e) => (e.kind === "group" ? e.children : [e]))].find((l) => l.id === id);
        assert.ok(leaf && mobileLeaves(ROLE_NAV[p.console], p.access).some((item) => item.id === leaf.id), `${name}: ${s.anchor} is a registry mobile slot`);
      }
    }
  }
});

test("a short tour closes on Help with 'That's the essentials'", () => {
  const bare: Persona = { console: "librarian", tour: "librarian", access: {} };
  const steps = resolved(bare);
  assert.ok(steps.length < 3);
  assert.equal(steps.at(-1)!.anchor, "shell.header.help");
  assert.equal(steps.at(-1)!.title[0], "That's the essentials");
});

test("hidden registry controls are dropped even when a step forgets its requires", () => {
  // No `staff` module: the Staff & invites leaf is hidden by the registry, so its step goes too (it has no `requires`).
  const noStaff: Persona = { console: "admin", tour: "admin-campus", access: { ...on(...campusOps, "groupCampus", "students") } };
  const steps = resolved(noStaff);
  assert.ok(!anchors(steps).includes("shell.nav.staff-invites"));
  assert.ok(!anchors(steps).includes("shell.nav.fees"));
  assert.ok(anchors(steps).includes("shell.nav.guardians"));
  // A group with no visible child is dropped as well.
  const noAcademics: Persona = { console: "admin", tour: "admin-campus", access: on("campusOps", "groupCampus", "fees") };
  assert.ok(!anchors(resolved(noAcademics)).includes("shell.nav-group.academics"));
});

test("isConsoleLanding: every console's landing, desk defaults, language and campaign params; deep links are not", () => {
  for (const nav of Object.values(ROLE_NAV)) {
    assert.equal(isConsoleLanding(nav, nav.base, ""), true, nav.id);
    assert.equal(isConsoleLanding(nav, nav.base, "?lang=ar"), true, `${nav.id} ?lang=ar`);
    assert.equal(isConsoleLanding(nav, nav.base, "?utm_source=mail&tour=x"), true, `${nav.id} campaign`);
    assert.equal(isConsoleLanding(nav, nav.base, "", "#workspace-content"), true, `${nav.id} skip link`);
    assert.equal(isConsoleLanding(nav, nav.base, "", "#payment"), false, `${nav.id} hash`);
    if (nav.mode === "view") {
      assert.equal(isConsoleLanding(nav, nav.base, `?view=${nav.defaultView}`), true, `${nav.id} default view`);
      assert.equal(isConsoleLanding(nav, nav.base, "?view=some-task"), false, `${nav.id} deep link`);
    } else {
      assert.equal(isConsoleLanding(nav, `${nav.base}/anything`, ""), false, `${nav.id} sub-route`);
      assert.equal(isConsoleLanding(nav, nav.base, "?record=1"), false, `${nav.id} deep link`);
    }
    assert.equal(isConsoleLanding(nav, "/messages", ""), false, `${nav.id} frame`);
  }
  assert.equal(isConsoleLanding(ROLE_NAV.accountant, "/accountant", "?view=dashboard"), true);
  assert.equal(isConsoleLanding(ROLE_NAV.receptionist, "/receptionist", "?view=dashboard&lang=ur"), true);
  assert.equal(isConsoleLanding(ROLE_NAV.librarian, "/librarian", "?view=dashboard"), true);
  assert.equal(isConsoleLanding(ROLE_NAV.owner, "/owner", "?view=schools"), true);
  assert.equal(isConsoleLanding(ROLE_NAV.super, "/super", "?view=overview"), true);
  assert.equal(isConsoleLanding(ROLE_NAV.super, "/super", "?view=campuses&campus=c1"), false);
});

test("framed routes hand the start to the console; the pending key is consumed once", () => {
  const map = new Map<string, string>();
  const storage: StorageLike = { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
  assert.equal(isInsideConsole(ROLE_NAV.admin, "/messages"), false);
  assert.equal(isInsideConsole(ROLE_NAV.admin, "/admin"), true);
  assert.equal(isInsideConsole(ROLE_NAV.teacher, "/teacher/marks"), true);
  assert.equal(isInsideConsole(ROLE_NAV.teacher, "/ai"), false);
  assert.equal(writePendingStart(storage, "user-1", "admin-campus"), true);
  assert.equal(consumePendingStart(storage, "user-2", "admin"), null, "another account never consumes it");
  assert.equal(consumePendingStart(storage, "user-1", "admin"), "admin-campus");
  assert.equal(consumePendingStart(storage, "user-1", "admin"), null, "consumed once");
  writePendingStart(storage, "user-1", "teacher");
  assert.equal(consumePendingStart(storage, "user-1", "admin"), null, "another console's tour is dropped");
  assert.equal(map.size, 0, "and cleared");
  const broken: StorageLike = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
  assert.equal(writePendingStart(broken, "user-1", "super"), false, "blocked storage falls back to ?tour=");
  assert.equal(consumePendingStart(broken, "user-1", "super"), null);
  assert.equal(writePendingStart(null, "user-1", "super"), false);
  for (const id of TOUR_IDS) assert.ok(tourConsole(id) in ROLE_NAV, id);
});

test("Tour this page starts at the step for the current view", () => {
  const steps = resolved(PERSONAS.principal);
  assert.equal(startIndexFor(steps, ROLE_NAV.principal, "/principal", ""), 0);
  assert.equal(startIndexFor(steps, ROLE_NAV.principal, "/principal", "?view=overview"), 0);
  assert.equal(startIndexFor(steps, ROLE_NAV.principal, "/principal", "?view=report-cards"), steps.findIndex((s) => s.id === "approve-reports"));
  assert.equal(startIndexFor(steps, ROLE_NAV.principal, "/principal", "?view=classes"), 0);
  const teacher = resolved(PERSONAS.teacher);
  assert.equal(startIndexFor(teacher, ROLE_NAV.teacher, "/teacher/marks", ""), 0);
});

test("tour definitions: unique ids, valid anchors, translated copy", () => {
  for (const id of TOUR_IDS) {
    const def = TOURS[id];
    assert.equal(def.id, id);
    assert.ok(def.version >= 1);
    const ids = new Set<string>();
    for (const s of def.steps) {
      assert.ok(!ids.has(s.id), `${id}: duplicate step ${s.id}`); ids.add(s.id);
      assert.match(s.anchor, ANCHOR_FORMAT, `${id}.${s.id}`);
      for (const text of [s.title, s.body, ...(s.variants ?? []).flatMap((v) => [v.title, v.body].filter(Boolean) as (readonly [string, string, string])[])]) {
        assert.equal(text.length, 3);
        assert.ok(text[0].trim(), `${id}.${s.id} EN`);
        assert.match(text[1], /[؀-ۿ]/, `${id}.${s.id} AR is translated`);
        assert.match(text[2], /[؀-ۿ]/, `${id}.${s.id} UR is translated`);
      }
      assert.ok(!(s.view && s.route), `${id}.${s.id}: a step navigates one way`);
      if (s.view) assert.equal(ROLE_NAV[def.console].mode, "view", `${id}.${s.id}: view step in a view console`);
      if (s.route) assert.equal(ROLE_NAV[def.console].mode, "path", `${id}.${s.id}: route step in a path console`);
    }
    assert.equal(def.steps.at(-1)!.anchor, "shell.header.help", `${id} ends on Help`);
    assert.ok(!def.steps.some((s) => s.anchor === "shell.header.notifications"), `${id}: no notification-bell step in v1`);
  }
});

test("progress: validation, read-merge-write, idempotency and re-offer", () => {
  assert.equal(tourProgressInput.safeParse({ tourId: "super", version: 1, status: "done" }).success, true);
  assert.equal(tourProgressInput.safeParse({ tourId: "nope", version: 1, status: "done" }).success, false);
  assert.equal(tourProgressInput.safeParse({ tourId: "super", version: 1, status: "started" }).success, false);
  assert.equal(tourProgressInput.safeParse({ tourId: "super", version: 99, status: "done" }).success, false);
  assert.equal(tourProgressInput.safeParse({ tourId: "super", version: 1, status: "done", userId: "x" }).success, false);
  assert.deepEqual(parseTourProgress({ super: { v: 1, s: "done", at: "t" }, bogus: { v: 1, s: "done" }, teacher: { v: "1", s: "done" } }), { super: { v: 1, s: "done", at: "t" } });
  assert.deepEqual(parseTourProgress(null), {});
  assert.deepEqual(parseTourProgress([1, 2]), {});
  const now = new Date("2026-10-21T10:00:00Z");
  const first = recordTourProgress({}, { tourId: "teacher", version: 1, status: "dismissed" }, now);
  assert.deepEqual(first, { teacher: { v: 1, s: "dismissed", at: now.toISOString() } });
  assert.equal(recordTourProgress(first, { tourId: "teacher", version: 1, status: "dismissed" }, now), null, "idempotent");
  assert.deepEqual(recordTourProgress(first, { tourId: "teacher", version: 1, status: "done" }, now)?.teacher?.s, "done");
  assert.equal(recordTourProgress({ teacher: { v: 2, s: "done", at: "t" } }, { tourId: "teacher", version: 1, status: "dismissed" }, now), null, "an older version never overwrites");
  const def = { ...TOURS.teacher, version: 2 };
  assert.equal(shouldAutoStart(undefined, def), true);
  assert.equal(shouldAutoStart({ v: 1, s: "dismissed", at: "t" }, def), true, "a newer version re-offers once");
  assert.equal(shouldAutoStart({ v: 2, s: "dismissed", at: "t" }, def), false, "dismissed at this version never auto-starts");
  // Help dot (§9.5/§10.7 "stored version < current"): a re-offer only, never for a tour not yet seen.
  assert.equal(hasNewTour(undefined, def), false, "a never-seen tour auto-starts instead; no dot from the first sign-in");
  assert.equal(hasNewTour({ v: 1, s: "done", at: "t" }, def), true, "finished an older version");
  assert.equal(hasNewTour({ v: 1, s: "dismissed", at: "t" }, def), true, "dismissed an older version");
  assert.equal(hasNewTour({ v: 2, s: "dismissed", at: "t" }, def), false);
  assert.equal(hasNewTour({ v: 2, s: "done", at: "t" }, def), false);
});

test("a tour never starts over unsaved work: the beforeunload guards answer a synthetic probe", () => {
  const page = new EventTarget();
  assert.equal(probeUnsavedWork(page), false, "no guard");
  let dirty = false;
  // The shape of useUnsavedGuard / the exam player: cancel only while dirty.
  page.addEventListener("beforeunload", (event) => { if (dirty) { event.preventDefault(); (event as BeforeUnloadEvent).returnValue = ""; } });
  assert.equal(probeUnsavedWork(page), false, "clean form");
  dirty = true;
  assert.equal(probeUnsavedWork(page), true, "dirty form");
  const broken = { dispatchEvent: () => { throw new Error("detached"); } } as unknown as EventTarget;
  assert.equal(probeUnsavedWork(broken), false, "a failing probe never blocks the tour");
});

test("a step on a sidebar control is titled exactly as the sidebar names it, in EN, AR and UR (§8.2, R11)", () => {
  const sidebar = (p: Persona, anchor: string) => {
    const ref = navRefOf(anchor);
    if (!ref) return null;
    const nav = ROLE_NAV[p.console];
    const entry = ref.kind === "group" ? nav.entries.find((e) => e.kind === "group" && e.id === ref.id) : leaves(nav).find((l) => l.id === ref.id);
    assert.ok(entry, `${anchor} is a registry entry`);
    const label = labelFor(entry!, p.access);
    return [label, translateUi(label, "ar"), translateUi(label, "ur")];
  };
  let checked = 0;
  for (const [name, p] of Object.entries(PERSONAS)) {
    const def = TOURS[tourForConsole(p.console, p.access)];
    for (const s of resolved(p)) {
      const expected = sidebar(p, s.anchor);
      if (!expected) continue;
      assert.deepEqual([...s.title], expected, `${name}: ${s.id}`);
      checked += 1;
    }
    // Variants never rename a sidebar control: a variant title on a nav-anchored step is ignored.
    for (const s of def.steps) if (navRefOf(s.anchor)) assert.ok(!s.variants?.some((v) => v.title), `${def.id}: ${s.id} renames a sidebar control`);
  }
  assert.ok(checked > 40, "the matrix covers the nav-anchored steps");
  // labelWhen follows access: the owner's staff leaf reads "Staff & leaders", the group campus admin's "Office staff".
  assert.equal(step(resolved(PERSONAS.soAlone), "staff")!.title[0], "Staff & leaders");
  assert.equal(step(resolved(PERSONAS.caGroupDelegate), "staff")!.title[0], "Office staff");
  // Mobile wraps the same name: "Under More: <sidebar label>".
  const teacher = resolved(PERSONAS.teacher, true);
  assert.equal(step(teacher, "homework")!.title[1], `ضمن «المزيد»: ${translateUi("Homework", "ar")}`);
});

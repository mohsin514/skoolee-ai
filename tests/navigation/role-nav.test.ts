import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_NAV, consoleForRole, consoleName, consoleViews, findLeaf, groupOf, hrefFor, isVisible, labelFor, leafForPath, leafForView, leafVisible,
  leaves, mobileLeaves, resolveAlias, visibleEntries, type ConsoleId, type NavLeaf, type Visibility,
} from "../../src/lib/navigation/role-nav";
import { CAPABILITY_KEYS } from "../../src/lib/navigation/capability-keys";
import { PERMISSION_MODULES } from "../../src/lib/permissions";
import { USER_ROLES } from "../../src/lib/roles";
import { translateUi } from "../../src/lib/locale/ui-messages";

const CONSOLES = Object.keys(ROLE_NAV) as ConsoleId[];
const KEYS = [...PERMISSION_MODULES, ...CAPABILITY_KEYS] as string[];
const all = (value: boolean) => Object.fromEntries(KEYS.map((k) => [k, value])) as Record<string, boolean>;
const ALL_TRUE = all(true);

function visibilityKeys(v?: Visibility): string[] {
  if (!v) return [];
  return [...(v.module ? [v.module] : []), ...(v.all ?? []), ...(v.any ?? []), ...(v.none ?? [])];
}
const isBillingLeaf = (l: NavLeaf) => l.visible?.all?.includes("billing") === true;
const landingOf = (id: ConsoleId) => {
  const nav = ROLE_NAV[id];
  return leaves(nav).find((l) => ("view" in l.target ? nav.mode === "view" && l.target.view === nav.defaultView : l.target.href === nav.base));
};

test("every role maps to a console and every console has a landing leaf", () => {
  for (const role of USER_ROLES) assert.ok(ROLE_NAV[consoleForRole(role)], role);
  for (const id of CONSOLES) {
    assert.equal(ROLE_NAV[id].id, id);
    assert.ok(landingOf(id), `${id} has a landing leaf`);
  }
});

test("ids are unique per console and anchors are derived from them", () => {
  for (const id of CONSOLES) {
    const nav = ROLE_NAV[id];
    const leafIds = leaves(nav).map((l) => l.id);
    assert.equal(new Set(leafIds).size, leafIds.length, `${id}: duplicate leaf id`);
    const groups = nav.entries.filter((e) => e.kind === "group");
    assert.equal(new Set(groups.map((g) => g.id)).size, groups.length, `${id}: duplicate group id`);
    for (const l of leaves(nav)) {
      assert.equal(l.tourAnchor, `shell.nav.${l.id}`);
      assert.match(l.tourAnchor, /^[a-z0-9-]+(\.[a-z0-9-]+){1,3}$/);
    }
    for (const g of groups) {
      assert.equal(g.tourAnchor, `shell.nav-group.${g.id}`);
      assert.match(g.tourAnchor, /^[a-z0-9-]+(\.[a-z0-9-]+){1,3}$/);
      for (const child of g.children) assert.equal(child.group, g.id);
    }
  }
});

/** Top-level rows that count toward the ten-row budget: the flagship pair (addendum 2026-10-22) is extra. */
const regularRows = (id: ConsoleId, access: Record<string, boolean>) => visibleEntries(ROLE_NAV[id], access).filter((e) => !(e.kind === "leaf" && e.flagship));

test("no console shows more than 10 top-level entries (plus the flagship pair) or 10 children per group under any access", () => {
  for (const id of CONSOLES) {
    const nav = ROLE_NAV[id];
    // Visibility only ever removes entries (no `none` clause is used), so all-true is the worst case.
    assert.ok(nav.entries.every((e) => (e.kind === "leaf" ? !e.visible?.none : !e.visible?.none && e.children.every((c) => !c.visible?.none))));
    assert.ok(regularRows(id, ALL_TRUE).length <= 10, `${id}: too many top-level entries`);
    assert.ok(visibleEntries(nav, ALL_TRUE).length - regularRows(id, ALL_TRUE).length <= 2, `${id}: more than two flagship rows`);
    for (const e of nav.entries) if (e.kind === "group") assert.ok(e.children.length <= 10, `${id}.${e.id}: too many children`);
  }
  // Campus admin 9, standalone owner 10 (SPEC §3 rule), flagship rows aside.
  assert.equal(regularRows("admin", { ...ALL_TRUE, standaloneOwner: false }).length, 9);
  assert.equal(regularRows("admin", ALL_TRUE).length, 10);
  for (const id of CONSOLES.filter((c) => c !== "admin")) assert.ok(regularRows(id, ALL_TRUE).length <= 9, id);
});

test("the flagship leaves sit right after the landing leaf, for exactly the roles that may use them", () => {
  const EXPECTED: Record<ConsoleId, string[]> = {
    super: ["ai-workflows"], admin: ["ai-workflows", "exam-studio"], principal: ["ai-workflows", "exam-studio"], teacher: ["ai-workflows", "exam-studio"],
    accountant: ["ai-workflows"], receptionist: ["ai-workflows"], librarian: ["ai-workflows"], parent: ["ai-workflows"], student: ["ai-workflows"], owner: ["ai-workflows"],
  };
  for (const id of CONSOLES) {
    const nav = ROLE_NAV[id];
    const flagships = leaves(nav).filter((l) => l.flagship);
    assert.deepEqual(flagships.map((l) => l.id), EXPECTED[id], `${id}: flagship leaves`);
    // Top level (never in a group, so never under More), directly after the landing leaf, in a fixed order.
    const ids = nav.entries.map((e) => e.id);
    assert.equal(ids[0], landingOf(id)!.id, `${id}: the landing leaf leads`);
    assert.deepEqual(ids.slice(1, 1 + flagships.length), EXPECTED[id], `${id}: flagships follow the landing leaf`);
    for (const l of flagships) {
      assert.equal(l.group, undefined);
      assert.equal(l.mobile, undefined, "the four mobile slots are unchanged");
      assert.ok(l.summary, `${id}.${l.id} has a PageHeader description`);
    }
  }
  // Targets and anchors the tours and Today cards rely on.
  assert.equal(hrefFor(ROLE_NAV.admin, findLeaf("admin", "ai-workflows")!), "/ai");
  assert.equal(hrefFor(ROLE_NAV.principal, findLeaf("principal", "exam-studio")!), "/ai/studio");
  assert.equal(findLeaf("super", "ai-workflows")!.tourAnchor, "shell.nav.ai-workflows");
  assert.equal(findLeaf("teacher", "exam-studio")!.tourAnchor, "shell.nav.exam-studio");
  // Gates: AI Workflows with the School AI workspace gate; Exam Studio with its own, and for a campus operator only
  // while it is the academic lead.
  const admin = ROLE_NAV.admin;
  assert.equal(leafVisible(admin, findLeaf("admin", "ai-workflows")!, { ai: true, schoolAi: true }), true);
  assert.equal(leafVisible(admin, findLeaf("admin", "ai-workflows")!, { ai: true, schoolAi: false }), false);
  assert.equal(leafVisible(admin, findLeaf("admin", "exam-studio")!, { schoolAiExams: true, academicLead: false }), false);
  assert.equal(leafVisible(admin, findLeaf("admin", "exam-studio")!, { schoolAiExams: true, academicLead: true }), true);
  assert.equal(leafVisible(ROLE_NAV.teacher, findLeaf("teacher", "exam-studio")!, { schoolAiExams: false }), false);
  // The generic "AI assistant" row is gone where a flagship replaces it; its view stays valid (bookmarks, Today links).
  for (const id of ["admin", "principal"] as const) {
    const old = findLeaf(id, "ai")!;
    assert.equal(old.hiddenInNav, true, `${id}: no "AI assistant" row`);
    assert.ok(consoleViews(id).includes("ai"));
    assert.ok(!visibleEntries(ROLE_NAV[id], ALL_TRUE).flatMap((e) => (e.kind === "group" ? e.children : [e])).some((l) => l.id === "ai"));
  }
  // Learners keep their delivery entry one tap from Today, outside More.
  const student = ROLE_NAV.student;
  assert.equal(student.entries[2].id, "online-exams");
  assert.equal(groupOf(student, "online-exams"), undefined);
});

test("exactly four distinct mobile slots per console, on leaves, slot 1 is the landing", () => {
  for (const id of CONSOLES) {
    const nav = ROLE_NAV[id];
    const slotted = leaves(nav).filter((l) => l.mobile);
    assert.deepEqual(slotted.map((l) => l.mobile).sort(), [1, 2, 3, 4], `${id}: mobile slots`);
    const first = slotted.find((l) => l.mobile === 1)!;
    assert.equal(first.id, landingOf(id)!.id, `${id}: slot 1 is the landing`);
    assert.equal(mobileLeaves(nav, ALL_TRUE).length, 4);
    assert.deepEqual(mobileLeaves(nav, ALL_TRUE).map((l) => l.mobile), [1, 2, 3, 4]);
  }
});

test("billing leaves exist only in the group and school consoles, and never show without the billing key", () => {
  for (const id of CONSOLES) {
    const billing = leaves(ROLE_NAV[id]).filter(isBillingLeaf);
    if (id === "super" || id === "admin") assert.equal(billing.length, 1, id);
    else assert.equal(billing.length, 0, `${id} has a billing leaf`);
  }
  // A campus operator without billing never sees a billing leaf, whatever else is true.
  const campusOperator = { ...ALL_TRUE, billing: false, campusOps: true };
  for (const id of ["super", "admin"] as const) {
    const nav = ROLE_NAV[id];
    const shown = visibleEntries(nav, campusOperator).flatMap((e) => (e.kind === "group" ? e.children : [e]));
    assert.equal(shown.filter(isBillingLeaf).length, 0, id);
    for (const l of leaves(nav).filter(isBillingLeaf)) assert.equal(leafVisible(nav, l, { campusOps: true, billing: false }), false);
  }
  // A group campus admin (no standaloneOwner) never sees the "Your school" group even with billing forged true.
  const admin = ROLE_NAV.admin;
  const yourSchool = admin.entries.find((e) => e.kind === "group" && e.id === "your-school");
  assert.ok(yourSchool && yourSchool.kind === "group");
  assert.equal(isVisible(yourSchool.visible, { ...ALL_TRUE, standaloneOwner: false }), false);
  assert.equal(leafVisible(admin, findLeaf("admin", "billing")!, { ...ALL_TRUE, standaloneOwner: false }), false);
  assert.equal(leafVisible(admin, findLeaf("admin", "billing")!, ALL_TRUE), true);
});

test("every visible key is a permission module or a capability key; aliases point at registry views", () => {
  for (const id of CONSOLES) {
    const nav = ROLE_NAV[id];
    const clauses = [...leaves(nav).map((l) => l.visible), ...nav.entries.map((e) => e.visible)];
    for (const v of clauses) for (const key of visibilityKeys(v)) assert.ok(KEYS.includes(key), `${id}: unknown key ${key}`);
    for (const l of leaves(nav)) for (const w of l.labelWhen ?? []) assert.ok(KEYS.includes(w.key), `${id}: unknown labelWhen ${w.key}`);
    for (const w of nav.eyebrowWhen ?? []) assert.ok(KEYS.includes(w.key));
    const views = new Set(leaves(nav).flatMap((l) => ("view" in l.target ? [l.target.view] : [])));
    for (const [from, target] of Object.entries(nav.aliases)) {
      assert.ok(views.has(target.view), `${id}: alias ${from} → ${target.view} is not a registry view`);
      assert.deepEqual(resolveAlias(id, from), target);
    }
    for (const view of Object.keys(nav.retired)) assert.ok(!views.has(view), `${id}: retired ${view} is still a leaf`);
    assert.equal(resolveAlias(id, null), null);
  }
});

test("leaves without a visibility clause are only the ones the spec allows", () => {
  const allowed = new Set([
    "super.campuses", "principal.learning-actions", "principal.academic-year",
    "parent.meetings", "parent.activities", "student.study", "student.portfolio", "teacher.portfolios",
  ]);
  for (const id of CONSOLES) {
    const nav = ROLE_NAV[id];
    for (const l of leaves(nav)) {
      if (l.visible) continue;
      const ok = id === "owner" || l.id === "messages" || l.id === landingOf(id)!.id || allowed.has(`${id}.${l.id}`);
      assert.ok(ok, `${id}.${l.id} has no visibility clause`);
    }
  }
  // The named exceptions really are ungated (so the spec list stays honest).
  assert.equal(findLeaf("teacher", "portfolios")?.target && "href" in findLeaf("teacher", "portfolios")!.target ? (findLeaf("teacher", "portfolios")!.target as { href: string }).href : "", "/teacher/portfolio");
});

test("admin has Record corrections gated on corrections and campus operations", () => {
  const leaf = findLeaf("admin", "corrections");
  assert.ok(leaf);
  assert.deepEqual([...(leaf!.visible?.all ?? [])].sort(), ["campusOps", "corrections"]);
  assert.equal(groupOf(ROLE_NAV.admin, "corrections")?.id, "money");
  assert.equal(leafVisible(ROLE_NAV.admin, leaf!, { corrections: true, campusOps: false }), false);
  assert.equal(leafVisible(ROLE_NAV.admin, leaf!, { corrections: true, campusOps: true }), true);
});

test("leafForPath finds every activePaths owner, view leaves included", () => {
  for (const id of CONSOLES) {
    for (const l of leaves(ROLE_NAV[id])) {
      for (const path of l.activePaths ?? []) {
        const found = leafForPath(id, path);
        assert.ok(found, `${id}: nothing claims ${path}`);
        // Another leaf may own the exact href (e.g. teacher /ai is the ai leaf itself); the path still resolves.
        if (!leaves(ROLE_NAV[id]).some((x) => "href" in x.target && x.target.href === path)) assert.equal(found!.id, l.id, `${id}: ${path}`);
        assert.equal(leafForPath(id, `${path}/nested`)?.id, found!.id);
      }
    }
  }
  // /ai and /ai/studio light up their flagship rows (addendum 2026-10-22).
  assert.equal(leafForPath("admin", "/ai")?.id, "ai-workflows");
  assert.equal(leafForPath("admin", "/ai/studio")?.id, "exam-studio");
  assert.equal(leafForPath("super", "/ai")?.id, "ai-workflows");
  assert.equal(leafForPath("admin", "/curriculum")?.id, "academic-overview");
  assert.equal(leafForPath("principal", "/curriculum")?.id, "objective-map");
  assert.equal(leafForPath("principal", "/ai")?.id, "ai-workflows");
  assert.equal(leafForPath("principal", "/ai/studio")?.id, "exam-studio");
  assert.equal(leafForPath("teacher", "/ai/studio")?.id, "exam-studio");
  assert.equal(leafForPath("teacher", "/ai")?.id, "ai-workflows", "a teacher on /ai opens their role-scoped workflows");
  assert.equal(leafForPath("student", "/student/resources")?.id, "work");
  assert.equal(leafForPath("parent", "/parent/resources")?.id, "homework");
  assert.equal(leafForPath("teacher", "/teacher/leave")?.id, "my-leave", "account-menu leaves are not sidebar rows but still resolve by href");
  assert.equal(leafForPath("student", "/student/schedule"), undefined, "a framed path with no leaf renders; its own gate decides (K-m10)");
});

test("pure helpers: views, hrefs, labels, eyebrows", () => {
  assert.ok(consoleViews("admin").includes("billing"));
  assert.ok(consoleViews("admin").includes("institution"), "aliases are accepted views");
  assert.ok(consoleViews("principal").includes("fees"), "retired views are accepted (then redirected)");
  assert.equal(leafForView("accountant", "my-leave")?.id, "my-leave");
  assert.equal(hrefFor(ROLE_NAV.admin, findLeaf("admin", "admissions")!), "/admin?view=admissions");
  assert.equal(hrefFor(ROLE_NAV.super, findLeaf("super", "billing")!), "/super?view=billing");
  assert.equal(hrefFor(ROLE_NAV.teacher, findLeaf("teacher", "marks")!), "/teacher/marks");
  assert.equal(labelFor(findLeaf("admin", "staff-invites")!, { standaloneOwner: true }), "Staff & leaders");
  assert.equal(labelFor(findLeaf("admin", "staff-invites")!, {}), "Staff & invites");
  assert.equal(labelFor(findLeaf("admin", "settings")!, { standaloneOwner: true }), "School setup");
  assert.equal(ROLE_NAV.admin.recordSearch && ROLE_NAV.principal.recordSearch && ROLE_NAV.receptionist.recordSearch, true);
  for (const id of ["super", "teacher", "accountant", "librarian", "parent", "student", "owner"] as const) assert.equal(ROLE_NAV[id].recordSearch, false, id);
});

test("the shell never offers the retired injected links", () => {
  for (const id of CONSOLES) {
    const hrefs = leaves(ROLE_NAV[id]).flatMap((l) => ("href" in l.target ? [l.target.href] : []));
    for (const forbidden of ["/group-policy", "/tax-packages", "/integrations", "/identity", "/dashboard", "/pickup", "/settings/data", "/settings/locale"]) {
      assert.ok(!hrefs.includes(forbidden), `${id} links ${forbidden}`);
    }
  }
});

test("console names read the §1.5 wording in AR and UR without relabelling the same words elsewhere", () => {
  const SPEC: Record<string, [string, string]> = {
    "Group console": ["لوحة المجموعة", "گروپ کنسول"],
    "Campus console": ["لوحة الفرع", "کیمپس کنسول"],
    "School console": ["لوحة المدرسة", "اسکول کنسول"],
    "Academic console": ["اللوحة الأكاديمية", "تعلیمی کنسول"],
    Teaching: ["مساحة التدريس", "تدریس"],
    "Finance desk": ["مكتب المالية", "شعبۂ مالیات"],
    "Front desk": ["مكتب الاستقبال", "استقبالیہ"],
    Library: ["المكتبة", "لائبریری"],
    Family: ["بوابة الأسرة", "خاندانی پورٹل"],
    Learner: ["بوابة الطالب", "طالب علم پورٹل"],
    "Platform operations": ["تشغيل المنصة", "پلیٹ فارم آپریشنز"],
  };
  const names = new Set(CONSOLES.flatMap((id) => [ROLE_NAV[id].eyebrow, ...(ROLE_NAV[id].eyebrowWhen ?? []).map((w) => w.label)]));
  assert.deepEqual([...names].sort(), Object.keys(SPEC).sort(), "every registry console name has its §1.5 wording");
  for (const name of names) {
    assert.equal(consoleName(name, (key) => translateUi(key, "en")), name, `${name}: EN is the registry label`);
    assert.equal(consoleName(name, (key) => translateUi(key, "ar")), SPEC[name][0], `${name}: AR console name`);
    assert.equal(consoleName(name, (key) => translateUi(key, "ur")), SPEC[name][1], `${name}: UR console name`);
  }
  // The same words as ordinary labels keep their generic meaning: the principal's "Teaching" nav group is not
  // "teaching workspace", and "Family" in a record is not "family portal".
  assert.ok(ROLE_NAV.principal.entries.some((e) => e.kind === "group" && e.label === "Teaching"));
  assert.notEqual(translateUi("Teaching", "ar"), SPEC.Teaching[0]);
  assert.notEqual(translateUi("Family", "ar"), SPEC.Family[0]);
  assert.notEqual(translateUi("Learner", "ur"), SPEC.Learner[1]);
});

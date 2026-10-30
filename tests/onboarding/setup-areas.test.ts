import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SETUP_AREAS, SETUP_AREA_TITLES, setupAreaFromTaskKey, setupAreaHref, setupAreaTaskKey } from "@/lib/onboarding/setup-areas";
import { getSetupAreasCopy } from "@/components/readiness/setup-areas-copy";
import { areaRows } from "@/components/readiness/SetupAreasGuide";

test("setup areas run in prerequisite order: year before weekends/holidays, classes before subjects before weights", () => {
  const at = (id: (typeof SETUP_AREAS)[number]) => SETUP_AREAS.indexOf(id);
  assert.ok(at("academicYear") < at("weekends") && at("weekends") < at("holidays"));
  assert.ok(at("periods") < at("rooms") && at("rooms") < at("classes"));
  assert.ok(at("classes") < at("subjects") && at("subjects") < at("gradeWeights"));
});

test("task keys round-trip, and the logo reuses onboarding's optional logo follow-up", () => {
  assert.equal(setupAreaTaskKey("logo"), "logo");
  for (const id of SETUP_AREAS) assert.equal(setupAreaFromTaskKey(setupAreaTaskKey(id)), id);
  assert.equal(setupAreaFromTaskKey("contact"), null);
  assert.equal(setupAreaFromTaskKey("area:unknown"), null);
  assert.equal(setupAreaFromTaskKey("custom-123"), null);
});

test("operators open each area in their own console, never the readiness page", () => {
  for (const role of ["ADMIN", "CAMPUS_ADMIN"]) {
    for (const id of SETUP_AREAS) {
      const { href, delegated } = setupAreaHref(id, { role, institutionKind: "GROUP" });
      assert.ok(href?.startsWith("/admin?view="), `${role} ${id}`);
      assert.ok(!href!.includes("readiness"));
      assert.equal(delegated, undefined);
    }
  }
  assert.equal(setupAreaHref("logo", { role: "ADMIN", institutionKind: "STANDALONE" }).href, "/admin?view=school-settings&tab=profile");
  assert.equal(setupAreaHref("logo", { role: "CAMPUS_ADMIN", institutionKind: "STANDALONE" }).href, "/admin?view=settings&tab=profile");
});

test("every /admin settings tab an area links to exists in the campus setup view", () => {
  const admin = readFileSync("src/app/admin/page.tsx", "utf8");
  for (const id of SETUP_AREAS) {
    const tab = /tab=([a-z-]+)/.exec(setupAreaHref(id, { role: "CAMPUS_ADMIN" }).href ?? "")?.[1];
    if (tab && !["profile"].includes(tab)) assert.ok(admin.includes(`{ id: "${tab}"`), `${id} → ${tab}`);
  }
});

test("group admins are pointed at campuses and told campus admins do it; other roles get no link", () => {
  assert.deepEqual(setupAreaHref("rooms", { role: "SUPER_ADMIN" }), { href: "/super?view=campuses", delegated: true });
  assert.equal(setupAreaHref("logo", { role: "SUPER_ADMIN" }).delegated, undefined);
  assert.equal(setupAreaHref("subjects", { role: "PRINCIPAL" }).href, "/principal?view=classes");
  assert.equal(setupAreaHref("rooms", { role: "PRINCIPAL" }).href, null);
  for (const role of ["TEACHER", "ACCOUNTANT", "PARENT", "STUDENT"]) {
    for (const id of SETUP_AREAS) assert.equal(setupAreaHref(id, { role }).href, null);
  }
});

test("progress resumes from tasks: deferred and open stay, a logo with no task was finished at onboarding", () => {
  const areas = SETUP_AREAS.map(id => ({ id, href: "/x" }));
  const rows = areaRows(areas, [
    { id: "t1", key: "area:academicYear", status: "DONE" },
    { id: "t2", key: "area:weekends", status: "DEFERRED" },
    { id: "t3", key: "area:holidays", status: "OPEN" },
  ]);
  const status = Object.fromEntries(rows.map(row => [row.id, row.status]));
  assert.equal(status.logo, "DONE");
  assert.equal(status.academicYear, "DONE");
  assert.equal(status.weekends, "DEFERRED");
  assert.equal(status.holidays, "OPEN");
  assert.equal(rows.find(row => row.status === "OPEN")?.id, "holidays");
});

test("EN, AR and UR name and explain every area", () => {
  for (const language of ["en", "ar", "ur"]) {
    const copy = getSetupAreasCopy(language);
    for (const id of SETUP_AREAS) {
      assert.ok(copy.areas[id].title.trim() && copy.areas[id].why.trim(), `${language} ${id}`);
      assert.ok(SETUP_AREA_TITLES[id]);
    }
  }
  assert.notEqual(getSetupAreasCopy("ar").title, getSetupAreasCopy("en").title);
  assert.notEqual(getSetupAreasCopy("ur").title, getSetupAreasCopy("en").title);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeCampusRegId, validateCampusInput } from "../../src/lib/school/campus-commands";
import { campusSetupUiEntries } from "../../src/lib/locale/campus-setup-ui-messages";

// SKAI-113: campus setup — IDs, package slots, paused/archived campuses and who may change them.
test("campus IDs are trimmed, upper-cased and kept to a typeable shape", () => {
  assert.equal(normalizeCampusRegId(" br-north "), "BR-NORTH");
  assert.equal(normalizeCampusRegId(""), null);
  assert.equal(normalizeCampusRegId(undefined), null);
  for (const bad of ["AB", "BR NORTH", "-BR1", "A".repeat(21), "BR_1", "بر-1"]) assert.throws(() => normalizeCampusRegId(bad), /3 to 20 letters/);
  assert.equal(validateCampusInput({ name: "North", city: "Lahore", regId: "qa-n1" }).regId, "QA-N1");
  assert.throws(() => validateCampusInput({ name: " ", city: "Lahore" }));
});

test("archived campuses free their package slot and restoring one re-checks the plan", () => {
  const entitlements = readFileSync("src/lib/billing/entitlements.ts", "utf8"), settings = readFileSync("src/app/actions/settings.ts", "utf8");
  assert.match(entitlements, /client\.campus\.count\(\{ where: \{ schoolId, archivedAt: null \} \}\)/);
  const restore = settings.slice(settings.indexOf("export async function restoreCampus"), settings.indexOf("export async function setCampusPaused"));
  assert.match(restore, /assertPlanCapacity\(\{ schoolId: session\.schoolId, metric: "campuses", client: tx \}\)/);
});

test("pause and archive stay with the group admin, scoped to the caller's school", () => {
  const settings = readFileSync("src/app/actions/settings.ts", "utf8");
  const start = settings.indexOf("export async function setCampusPaused"), pause = settings.slice(start, settings.indexOf("SKAI-1151", start));
  assert.match(pause, /if \(!isGroupConsole\(session\)\) throw new Error\("Only the group admin can pause or resume a campus\."\)/);
  assert.match(pause, /updateMany\(\{ where: \{ id: campusId, schoolId: session\.schoolId, archivedAt: null, pausedAt: input\.paused \? null : \{ not: null \} \}/);
  assert.match(pause, /findFirst\(\{ where: \{ id: campusId, schoolId: session\.schoolId \}/);
  // A repeated submit with the same state writes nothing.
  assert.match(pause, /if \(count\) await tx\.auditLog\.create/);
  assert.match(pause, /return \{ success: true, unchanged: true \}/);
  assert.match(pause, /Restore this campus before changing its status/);
});

test("archived campuses are read-only and archived or paused campuses take no new staff", () => {
  const commands = readFileSync("src/lib/school/campus-commands.ts", "utf8"), invite = readFileSync("src/lib/staff/invitation-write.ts", "utf8");
  assert.match(commands, /if \(campus\.archivedAt\) throw new Error\("Restore this campus before editing it\."\)/);
  assert.match(commands, /where: \{ id: campusId, schoolId: session\.schoolId \}/);
  assert.match(invite, /This campus is archived\. Restore it before inviting staff\./);
  assert.match(invite, /This campus is paused\. Resume it before inviting staff\./);
});

test("every new campus string has Arabic and Urdu", () => {
  for (const [en, ar, ur] of campusSetupUiEntries) {
    assert.ok(en && ar && ur && ar !== en && ur !== en, en);
  }
  assert.equal(new Set(campusSetupUiEntries.map(([en]) => en)).size, campusSetupUiEntries.length);
});

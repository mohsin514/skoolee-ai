import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// SKAI-1679: correcting an on-site visit into an already on-site person is refused, as check-in refuses it.
const source = readFileSync("src/lib/front-desk/visitors.ts", "utf8");
const fn = source.slice(source.indexOf("export async function correctVisit"));

test("identity corrections take the campus register lock before the visit lock", () => {
  const campusLock = fn.indexOf("if (identityChange) await lockCampusRegister(db, user, campusId);");
  const visitLock = fn.indexOf("SELECT id FROM visitor_logs WHERE id = ${id}");
  assert.ok(campusLock > 0 && visitLock > campusLock);
});

test("an on-site correction that matches another on-site visit is a 409 and writes nothing", () => {
  assert.match(fn, /if \(identityChange && visit\.status === "ON_SITE"\) \{/);
  assert.match(fn, /status: "ON_SITE", id: \{ not: id \}/);
  assert.ok(fn.indexOf("if (clash) throw new ApiError(") < fn.indexOf("db.visitorLog.update("));
  assert.ok(fn.indexOf("db.visitorLog.update(") < fn.indexOf("writeAuditEvent("));
});

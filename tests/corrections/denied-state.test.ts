import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { AuthUser } from "@/lib/auth";
import { permittedKinds } from "@/lib/corrections/service";

const user = (role: string, schoolId: string, campusId: string): AuthUser =>
  ({ userId: `${role.toLowerCase()}-${schoolId}`, role, schoolId, campusId, email: "qa@example.test", fullName: "QA" }) as unknown as AuthUser;

test("SKAI-336: a receptionist in two schools gets no correction kind, so the page shows the denied state", async () => {
  assert.deepEqual(await permittedKinds(user("RECEPTIONIST", "school-a", "campus-a")), []);
  assert.deepEqual(await permittedKinds(user("RECEPTIONIST", "school-b", "campus-b")), []);
});

test("SKAI-336: an accountant only opens payment corrections, and only in its own school", async () => {
  assert.deepEqual(await permittedKinds(user("ACCOUNTANT", "school-a", "campus-a")), ["PAYMENT"]);
  assert.deepEqual(await permittedKinds(user("ACCOUNTANT", "school-b", "campus-b")), ["PAYMENT"]);
});

test("SKAI-336: the page decides access on the server and renders the denied state without a client fetch", () => {
  const page = readFileSync("src/app/corrections/page.tsx", "utf8");
  assert.match(page, /const permitted = await permittedKinds\(user\);/);
  assert.match(page, /const denied = permitted\.length === 0;/);
  assert.match(page, /permitted\.includes\(wanted\) \? wanted : permitted\[0\]/);
  const view = readFileSync("src/app/corrections/view.tsx", "utf8");
  assert.match(view, /if \(!denied\) void load\(\);/);
  assert.match(view, /if \(denied\) return </);
  for (const lang of ["en", "ar", "ur"]) assert.match(view, new RegExp(`${lang}: \\{ deniedTitle: `));
});

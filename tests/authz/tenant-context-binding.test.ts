import assert from "node:assert/strict";
import { test } from "node:test";
import { getTenantContext, runAsUser, resolveTenantForToken, clearTenantResolutionCache, tenantContextForUser, TenantContextError } from "../../src/lib/db/tenant-context";
import { ApiError, errorResponse } from "../../src/lib/api/scope";
import { friendlyErrorMessage } from "../../src/components/ui/toast";
import { purchasingOverview } from "../../src/lib/purchasing/service";
import type { AuthUser } from "../../src/lib/auth";

// SKAI-1034 / SKAI-1028 / SKAI-1030: entry points bind the signed-in user's school explicitly, two schools and two
// campuses never share a context, denied roles are refused before any query, and internal guard text never reaches
// the reader.
const user = (schoolId: string, campusId: string | null, role: string): AuthUser =>
  ({ userId: `${schoolId}-${role}`, schoolId, campusId, role, email: `${role}@example.invalid` }) as AuthUser;

const librarianA1 = user("school-a", "campus-a1", "LIBRARIAN");
const librarianA2 = user("school-a", "campus-a2", "LIBRARIAN");
const ownerB = user("school-b", null, "SUPER_ADMIN");

test("two schools and two campuses run concurrently without sharing a tenant context", async () => {
  const seen = await Promise.all([librarianA1, librarianA2, ownerB].map((u) => runAsUser(u, async () => {
    await new Promise((r) => setTimeout(r, 5));
    const ctx = getTenantContext();
    return `${ctx?.schoolId}/${ctx?.campusId ?? "-"}/${ctx?.role}`;
  })));
  assert.deepEqual(seen, ["school-a/campus-a1/LIBRARIAN", "school-a/campus-a2/LIBRARIAN", "school-b/-/SUPER_ADMIN"]);
  assert.equal(getTenantContext(), undefined, "the binding ends with the call");
});

test("only the platform operator is bound unscoped; a user without a school is refused", () => {
  assert.equal(tenantContextForUser(librarianA1).unscoped, undefined);
  assert.equal(tenantContextForUser(user("platform", null, "APP_OWNER")).unscoped, true);
  assert.throws(() => tenantContextForUser(user("", "campus-a1", "LIBRARIAN")), TenantContextError);
});

test("denied roles are refused purchasing before any query runs", async () => {
  for (const role of ["STUDENT", "PARENT"]) {
    await assert.rejects(() => runAsUser(user("school-a", "campus-a1", role), () => purchasingOverview(user("school-a", "campus-a1", role))), { status: 403 });
  }
});

test("an unverifiable session token resolves to no tenant and is not remembered", async () => {
  clearTenantResolutionCache();
  const original = console.warn; console.warn = () => {};
  try {
    const first = resolveTenantForToken("not-a-jwt");
    assert.equal(resolveTenantForToken("not-a-jwt"), first, "parallel queries share one resolution");
    assert.equal(await first, null);
    assert.notEqual(resolveTenantForToken("not-a-jwt"), first, "a failed resolution is retried");
  } finally { console.warn = original; clearTenantResolutionCache(); }
});

test("internal errors reach the reader as a generic message, never the guard's wording", async () => {
  const original = console.error; console.error = () => {};
  try {
    const guard = errorResponse(new TenantContextError("No tenant context in scope, runWithTenantContext()"), "[purchasing] GET failed");
    assert.equal(guard.status, 500);
    const body = await guard.json();
    assert.doesNotMatch(JSON.stringify(body), /tenant|runWithTenantContext|\[purchasing\]/i);
    const plain = await errorResponse(new Error("db exploded"), "[tax] GET failed").json();
    assert.doesNotMatch(JSON.stringify(plain), /\[tax\]|exploded/);
    assert.deepEqual(await errorResponse(new Error("x"), "Could not load").json(), { error: "Could not load" });
    assert.equal((await errorResponse(new ApiError("Not permitted", 403)).json()).error, "Not permitted");
  } finally { console.error = original; }
  assert.equal(friendlyErrorMessage(new Error("No tenant context in scope, and no signed-in session"), "Generic"), "Generic");
  assert.equal(friendlyErrorMessage(new Error("[purchasing] GET failed"), "Generic"), "Generic");
});

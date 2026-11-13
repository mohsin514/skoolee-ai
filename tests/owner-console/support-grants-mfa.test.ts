import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// SKAI-1942: a platform owner without two-step sign-in who requests or starts support access gets a readable
// reason with the MFA_REQUIRED code (not "Privileged MFA is required" behind a generic toast), in EN, AR and UR.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;

class ApiError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message); }
}
let actor: { userId: string; role: string; mfaVerified: boolean };
let dbTouched = 0;
const touch = new Proxy({}, { get: () => { dbTouched++; throw new Error("database must not be reached"); } });

mock.module(src("lib/api/scope.ts"), {
  namedExports: {
    ApiError,
    requirePlatformOwner: async () => actor,
    errorResponse: (error: unknown) => error instanceof ApiError
      ? Response.json(error.code ? { error: error.message, code: error.code } : { error: error.message }, { status: error.status })
      : Response.json({ error: String(error) }, { status: 500 }),
  },
});
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: touch } });
mock.module(src("lib/owner/support-access.ts"), {
  namedExports: {
    cleanSupportActions: () => [], cleanSupportScope: () => [], validateSupportGrantCombination: () => {},
    issueSupportCookie: async () => "", SUPPORT_COOKIE: "skoolee_support_grant", supportCookieExpiresAt: (d: Date) => d,
  },
});
mock.module(src("lib/auth/institution-server.ts"), { namedExports: { getInstitutionKind: async () => "STANDALONE" } });

const request = (body: unknown) => new Request("http://localhost/api/owner/support/grants", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
}) as never;
const body = { schoolId: "qa-school-a", purpose: "Investigate the timetable sync issue", impact: "Read only profile", scope: ["school_profile"], actions: ["read"], durationMinutes: 30 };

test("requesting support access without two-step sign-in returns the reason and MFA_REQUIRED", async () => {
  const { POST } = await import(src("app/api/owner/support/grants/route.ts"));
  for (const emergency of [false, true]) {
    actor = { userId: "owner-1", role: "APP_OWNER", mfaVerified: false };
    const response: Response = await POST(request({ ...body, emergency, emergencyReason: emergency ? "Outage affecting the whole school" : "" }));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "Turn on two-step sign-in before you request support access.", code: "MFA_REQUIRED" });
  }
  assert.equal(dbTouched, 0);
});

test("starting an approved grant without two-step sign-in returns the reason and MFA_REQUIRED", async () => {
  const { POST } = await import(src("app/api/owner/support/grants/[id]/start/route.ts"));
  actor = { userId: "owner-1", role: "APP_OWNER", mfaVerified: false };
  const response: Response = await POST(request({}), { params: Promise.resolve({ id: "grant-1" }) });
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "Turn on two-step sign-in before you start support access.", code: "MFA_REQUIRED" });
  assert.equal(dbTouched, 0);
});

test("the MFA reasons and the up-front notice read in Arabic and Urdu", async () => {
  const { arabicP4Ui, urduP4Ui } = await import(src("lib/locale/role-ux/p4-messages.ts"));
  for (const en of [
    "Turn on two-step sign-in before you request support access.",
    "Turn on two-step sign-in before you start support access.",
    "Requesting or starting support access needs two-step sign-in on your account.",
  ]) {
    assert.ok(arabicP4Ui[en] && arabicP4Ui[en] !== en, `AR: ${en}`);
    assert.ok(urduP4Ui[en] && urduP4Ui[en] !== en, `UR: ${en}`);
  }
});

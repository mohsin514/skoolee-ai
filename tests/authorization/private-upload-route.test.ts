import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { NextRequest } from "next/server";
import type { AuthUser } from "../../src/lib/auth";
import type { TxClient } from "../../src/lib/db/prisma";
import * as apiScope from "../../src/lib/api/scope";
import * as uploads from "../../src/lib/storage/private-upload";
import * as sessionCookie from "../../src/lib/auth/session-cookie";
import { checkRevocation } from "../../src/lib/auth/session-revocation";

const require = createRequire(import.meta.url);
const { transformSync } = createRequire(require.resolve("tsx"))("esbuild");
// Execute the actual route with synthetic persistence/session/storage boundaries.
// Its intent validation, bounded body reader and current permission checks remain real.
const routeCode: string = transformSync(readFileSync(resolve("src/app/api/uploads/file/route.ts"), "utf8"), { loader: "ts", format: "cjs" }).code;
const actor: AuthUser = { userId: "admin-a", schoolId: "school-a", campusId: "campus-a", role: "CAMPUS_ADMIN", email: "synthetic@example.invalid", accessVersion: 3 };
const intent: uploads.PrivateUploadIntent = { kind: "student", targetId: "student-a", storageKey: "student-docs/campus-a/student-a/file.pdf", contentType: "application/pdf", sizeBytes: 4 };

async function fixture() {
  const state = { permission: true, accountActive: true, sessionActive: true, authCalls: 0, authorizationCalls: 0, sessionChecks: 0, writes: [] as { key: string; bytes: string; contentType: string }[], storageStatus: 0 };
  const db = {
    user: { findFirst: async () => state.accountActive ? { id: actor.userId } : null },
    rolePermission: { findMany: async () => [{ module: "students", canView: true, canAdd: false, canEdit: state.permission, canDelete: false }] },
    student: { findFirst: async () => ({ id: intent.targetId, campusId: actor.campusId }) },
  } as unknown as TxClient;
  const loaded = { exports: {} as typeof import("../../src/app/api/uploads/file/route") };
  const boundaryRequire = (id: string) => {
    if (id === "@/lib/api/scope") return { ...apiScope, requireAuthUser: async () => { state.authCalls += 1; return actor; } };
    if (id === "@/lib/storage/private-upload") return { ...uploads, authorizePrivateUpload: async (user: AuthUser, selected: uploads.PrivateUploadIntent) => { state.authorizationCalls += 1; return uploads.authorizePrivateUpload(user, selected, db); } };
    if (id === "@/lib/auth/session-cookie") return sessionCookie;
    if (id === "@/lib/auth/session-revocation") return { checkRevocation: (hash: string) => {
      state.sessionChecks += 1;
      assert.equal(hash, sessionCookie.hashSessionToken("synthetic-session"));
      return checkRevocation(hash, async () => [{ isActive: state.sessionActive }]);
    } };
    if (id === "@/lib/storage/s3") return { uploadPrivateObject: async (key: string, bytes: Uint8Array, contentType: string) => {
      if (state.storageStatus) throw { $metadata: { httpStatusCode: state.storageStatus } };
      state.writes.push({ key, bytes: new TextDecoder().decode(bytes), contentType });
    } };
    return require(id);
  };
  new Function("module", "exports", "require", routeCode)(loaded, loaded.exports, boundaryRequire);
  const url = await uploads.createPrivateUploadUrl(actor, { ...intent, fileName: "Synthetic.pdf" });
  const send = async (whileReceiving?: () => void) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) { controller.enqueue(new TextEncoder().encode("AB")); },
      pull(controller) {
        assert.equal(state.authorizationCalls, 1, "first authorization precedes consuming the remaining body");
        whileReceiving?.();
        controller.enqueue(new TextEncoder().encode("CD")); controller.close();
      },
    });
    const request = new NextRequest(new URL(url, "http://synthetic.invalid"), { method: "PUT", headers: { "content-type": "application/pdf", cookie: `${sessionCookie.SESSION_COOKIE_NAME}=synthetic-session` }, body, duplex: "half" } as ConstructorParameters<typeof NextRequest>[1]);
    return loaded.exports.PUT(request);
  };
  return { state, send };
}

test("private upload writes only after both current permission checks and uncached session check", async () => {
  const { state, send } = await fixture();
  const response = await send();
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { success: true });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(state.authCalls, 2); assert.equal(state.authorizationCalls, 2); assert.equal(state.sessionChecks, 1);
  assert.deepEqual(state.writes, [{ key: intent.storageKey, bytes: "ABCD", contentType: intent.contentType }]);
});

test("revoking permission or deactivating the account during receipt prevents the storage effect", async () => {
  for (const field of ["permission", "accountActive"] as const) {
    const { state, send } = await fixture();
    const response = await send(() => { state[field] = false; });
    assert.equal(response.status, 403); assert.equal(state.authorizationCalls, 2);
    assert.deepEqual(state.writes, []);
  }
});

test("logout during receipt is rejected even when a prior authentication result remains available", async () => {
  const { state, send } = await fixture();
  const response = await send(() => { state.sessionActive = false; });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Your session is no longer valid. Please sign in again." });
  assert.equal(state.authCalls, 1, "uncached session check refuses before another possibly memoized auth call");
  assert.equal(state.authorizationCalls, 1); assert.equal(state.sessionChecks, 1); assert.deepEqual(state.writes, []);
});

test("storage replay and provider errors return recoverable responses without exposing object details", async () => {
  for (const [storageStatus, expected] of [[412, 409], [500, 503]]) {
    const { state, send } = await fixture(); state.storageStatus = storageStatus;
    const response = await send(); assert.equal(response.status, expected);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.doesNotMatch(await response.text(), /student-docs|student-a|school-a/);
    assert.deepEqual(state.writes, []);
  }
});

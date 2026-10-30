/**
 * role-ux §7.2 G7 / G7b — membership authority is the institution authority (role + kind), not the owner flag.
 * The invite action, the invitation writer and PUT /api/memberships share the pure decisions under test here.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { inviteDecision, membershipAuthority, membershipChangeDecision, type MembershipActor } from "../../src/lib/membership-access";

const CAMPUS = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

const flaglessGroupAdmin: MembershipActor & { userId: string } = { userId: "sa-2", role: "SUPER_ADMIN", institutionKind: "GROUP", isInstitutionOwner: false, campusId: null, mfaVerified: true };
const groupOwner: MembershipActor & { userId: string } = { userId: "sa-1", role: "SUPER_ADMIN", institutionKind: "GROUP", isInstitutionOwner: true, campusId: null, mfaVerified: true };
const adminOwnerInGroup: MembershipActor & { userId: string } = { userId: "ad-1", role: "ADMIN", institutionKind: "GROUP", isInstitutionOwner: true, campusId: CAMPUS, mfaVerified: true };
const standaloneOwner: MembershipActor & { userId: string } = { userId: "so-1", role: "ADMIN", institutionKind: "STANDALONE", isInstitutionOwner: true, campusId: CAMPUS, mfaVerified: true };
const delegate: MembershipActor & { userId: string } = { userId: "ca-1", role: "CAMPUS_ADMIN", institutionKind: "GROUP", canManageMemberships: true, campusId: CAMPUS, mfaVerified: true };

const target = (role: string, changes: Partial<{ campusId: string | null; isInstitutionOwner: boolean; canPurchaseSubscription: boolean; canManageMemberships: boolean }> = {}) => ({
  id: `target-${role.toLowerCase()}`, role, campusId: CAMPUS, isInstitutionOwner: false, canPurchaseSubscription: false, canManageMemberships: false, ...changes,
});
const change = (role: string, changes: Partial<{ campusId: string | null; canPurchaseSubscription: boolean; canManageMemberships: boolean }> = {}) => ({
  role, campusId: CAMPUS, canPurchaseSubscription: false, canManageMemberships: false, ...changes,
});

test("a flagless group admin is the membership authority: lists school-wide, invites a campus admin anywhere", () => {
  const access = membershipAuthority(flaglessGroupAdmin);
  assert.equal(access.authority, true, "school-wide list scope (GET /api/memberships)");
  assert.equal(access.canManage, true);
  assert.deepEqual(inviteDecision(flaglessGroupAdmin, { role: "CAMPUS_ADMIN", campusId: OTHER }), { ok: true });
  assert.deepEqual(inviteDecision(flaglessGroupAdmin, { role: "PRINCIPAL", campusId: CAMPUS }), { ok: true });
  assert.deepEqual(inviteDecision(standaloneOwner, { role: "CAMPUS_ADMIN", campusId: CAMPUS }), { ok: true }, "a single school's admin appoints a deputy");
});

test("an ADMIN carrying the owner flag inside a group is not the authority (C1 anomaly)", () => {
  const access = membershipAuthority(adminOwnerInGroup);
  assert.equal(access.authority, false);
  assert.equal(access.canManage, false);
  const decision = inviteDecision(adminOwnerInGroup, { role: "TEACHER", campusId: CAMPUS });
  assert.equal(decision.ok, false);
  // With a delegation it is an ordinary campus delegate, nothing more.
  const delegated = { ...adminOwnerInGroup, canManageMemberships: true };
  assert.deepEqual(inviteDecision(delegated, { role: "TEACHER", campusId: CAMPUS }), { ok: true });
  assert.equal(inviteDecision(delegated, { role: "CAMPUS_ADMIN", campusId: CAMPUS }).ok, false);
});

test("a campus delegate stays on its own campus and never appoints leaders or delegates", () => {
  assert.equal(membershipAuthority(delegate).authority, false);
  assert.equal(membershipAuthority(delegate).delegate, true);
  assert.deepEqual(inviteDecision(delegate, { role: "TEACHER", campusId: CAMPUS }), { ok: true });
  assert.deepEqual(inviteDecision(delegate, { role: "ACCOUNTANT", campusId: CAMPUS }), { ok: true });
  for (const [input, status] of [
    [{ role: "TEACHER", campusId: OTHER }, 403],
    [{ role: "CAMPUS_ADMIN", campusId: CAMPUS }, 403],
    [{ role: "PRINCIPAL", campusId: CAMPUS }, 403],
    [{ role: "TEACHER", campusId: CAMPUS, canManageMemberships: true }, 403],
  ] as const) {
    const decision = inviteDecision(delegate, input);
    assert.equal(decision.ok, false, JSON.stringify(input));
    if (!decision.ok) assert.equal(decision.status, status, JSON.stringify(input));
  }
  // Changing someone on another campus, or a leader, is the authority's review.
  assert.equal(membershipChangeDecision(delegate, target("TEACHER", { campusId: OTHER }), change("TEACHER", { campusId: OTHER })).ok, false);
  assert.equal(membershipChangeDecision(delegate, target("PRINCIPAL"), change("PRINCIPAL")).ok, false);
  assert.deepEqual(membershipChangeDecision(delegate, target("TEACHER"), change("LIBRARIAN")), { ok: true });
});

test("purchasing is never delegated through an invitation or to a non-authority role", () => {
  for (const actor of [groupOwner, standaloneOwner]) {
    const decision = inviteDecision(actor, { role: "CAMPUS_ADMIN", campusId: CAMPUS, canPurchaseSubscription: true });
    assert.equal(decision.ok, false);
    const changed = membershipChangeDecision(actor, target("CAMPUS_ADMIN"), change("CAMPUS_ADMIN", { canPurchaseSubscription: true }));
    assert.equal(changed.ok, false);
  }
  assert.equal(inviteDecision(groupOwner, { role: "PARENT", campusId: CAMPUS, canManageMemberships: true }).ok, false, "families never receive delegations");
});

test("the purchase refusal is kind-aware (R-I11): a single school has no group admin to share it with (matrix #2)", () => {
  const groupRefusal = { ok: false, status: 400, error: "Subscription purchasing can only be shared with another group admin, from People & access." };
  const schoolRefusal = { ok: false, status: 400, error: "Subscription purchasing stays with the school admin." };
  assert.deepEqual(inviteDecision(groupOwner, { role: "CAMPUS_ADMIN", campusId: CAMPUS, canPurchaseSubscription: true }), groupRefusal);
  assert.deepEqual(membershipChangeDecision(groupOwner, target("CAMPUS_ADMIN"), change("CAMPUS_ADMIN", { canPurchaseSubscription: true })), groupRefusal);
  assert.deepEqual(inviteDecision(standaloneOwner, { role: "CAMPUS_ADMIN", campusId: CAMPUS, canPurchaseSubscription: true }), schoolRefusal);
  assert.deepEqual(membershipChangeDecision(standaloneOwner, target("ACCOUNTANT"), change("ACCOUNTANT", { canPurchaseSubscription: true })), schoolRefusal);
});

test("PUT /api/memberships: a flag-only change on another group admin is accepted; a role change to SUPER_ADMIN is refused", () => {
  const otherGroupAdmin = target("SUPER_ADMIN", { campusId: null });
  // G7b: the request repeats the stored role and campus exactly — a group admin's campus is null.
  assert.deepEqual(membershipChangeDecision(groupOwner, otherGroupAdmin, change("SUPER_ADMIN", { campusId: null, canPurchaseSubscription: true })), { ok: true });
  assert.deepEqual(membershipChangeDecision(flaglessGroupAdmin, otherGroupAdmin, change("SUPER_ADMIN", { campusId: null, canManageMemberships: true })), { ok: true });
  // An unrelated campus is no longer silently replaced: the stored campus must be sent as is.
  const moved = membershipChangeDecision(groupOwner, otherGroupAdmin, change("SUPER_ADMIN", { campusId: OTHER, canPurchaseSubscription: true }));
  assert.equal(moved.ok, false);
  if (!moved.ok) assert.equal(moved.status, 403);
  // A legacy campus-pinned group admin keeps its stored campus too.
  const pinnedGroupAdmin = target("SUPER_ADMIN", { campusId: CAMPUS });
  assert.deepEqual(membershipChangeDecision(groupOwner, pinnedGroupAdmin, change("SUPER_ADMIN", { campusId: CAMPUS, canManageMemberships: true })), { ok: true });
  assert.equal(membershipChangeDecision(groupOwner, pinnedGroupAdmin, change("SUPER_ADMIN", { campusId: null })).ok, false, "nor unpinned here");
  // Every other role needs a campus.
  const campusless = membershipChangeDecision(groupOwner, target("TEACHER"), change("TEACHER", { campusId: null }));
  assert.equal(campusless.ok, false);
  if (!campusless.ok) assert.equal(campusless.status, 400);
  // The same target cannot be moved to another role.
  assert.equal(membershipChangeDecision(groupOwner, otherGroupAdmin, change("CAMPUS_ADMIN")).ok, false);
  // Nobody becomes a group admin through this route.
  const promote = membershipChangeDecision(groupOwner, target("PRINCIPAL"), change("SUPER_ADMIN"));
  assert.equal(promote.ok, false);
  if (!promote.ok) assert.equal(promote.status, 400);
  // A delegate cannot touch another administrator at all.
  assert.equal(membershipChangeDecision(delegate, otherGroupAdmin, change("SUPER_ADMIN", { campusId: null })).ok, false);
  // The owner and yourself stay immutable here.
  assert.equal(membershipChangeDecision(groupOwner, target("SUPER_ADMIN", { isInstitutionOwner: true, campusId: null }), change("SUPER_ADMIN", { campusId: null })).ok, false);
  assert.equal(membershipChangeDecision(groupOwner, { ...otherGroupAdmin, id: groupOwner.userId }, change("SUPER_ADMIN", { campusId: null })).ok, false);
});

test("the authority appoints a principal as campus admin in one change (vacancy repair, §2.6)", () => {
  assert.deepEqual(membershipChangeDecision(flaglessGroupAdmin, target("PRINCIPAL"), change("CAMPUS_ADMIN", { canManageMemberships: true })), { ok: true });
});

test("MFA is required only to turn a delegation on; plain invites, resends and role changes need none (K-I5)", () => {
  const deferred = { ...groupOwner, mfaVerified: "deferred" as const };
  assert.deepEqual(inviteDecision(deferred, { role: "TEACHER", campusId: CAMPUS }), { ok: true }, "a plain invite");
  assert.deepEqual(inviteDecision(deferred, { role: "CAMPUS_ADMIN", campusId: CAMPUS }), { ok: true }, "a plain leader invite");
  const invite = inviteDecision(deferred, { role: "CAMPUS_ADMIN", campusId: CAMPUS, canManageMemberships: true });
  assert.equal(invite.ok, false);
  if (!invite.ok) assert.equal(invite.code, "MFA_REQUIRED");
  assert.deepEqual(membershipChangeDecision(deferred, target("TEACHER"), change("ACCOUNTANT")), { ok: true }, "a role change");
  const turnOn = membershipChangeDecision(deferred, target("CAMPUS_ADMIN"), change("CAMPUS_ADMIN", { canManageMemberships: true }));
  assert.equal(turnOn.ok, false);
  if (!turnOn.ok) assert.equal(turnOn.code, "MFA_REQUIRED");
  // Turning a delegation off, or keeping it as it is, needs no second factor.
  assert.deepEqual(membershipChangeDecision(deferred, target("CAMPUS_ADMIN", { canManageMemberships: true }), change("CAMPUS_ADMIN")), { ok: true });
  assert.deepEqual(membershipChangeDecision(deferred, target("CAMPUS_ADMIN", { canManageMemberships: true }), change("CAMPUS_ADMIN", { canManageMemberships: true })), { ok: true });
});

test("the three write paths use the shared decisions, never the owner flag as authority", () => {
  const invite = readFileSync(new URL("../../src/app/actions/invite.ts", import.meta.url), "utf8");
  const writer = readFileSync(new URL("../../src/lib/staff/invitation-write.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../src/app/api/memberships/route.ts", import.meta.url), "utf8");
  assert.match(invite, /membershipAuthority\(session\)/);
  assert.match(writer, /inviteDecision\(session/);
  assert.match(route, /membershipChangeDecision\(actor, target, input\)/);
  // G7b: a group admin's null campus is part of the contract, never replaced with a placeholder campus.
  assert.match(route, /campusId: z\.string\(\)\.uuid\(\)\.nullable\(\)/);
  // The MFA_REQUIRED code reaches the client on both write paths (F28), not only the message.
  assert.match(route, /new ApiError\(decision\.error, decision\.status, decision\.code\)/);
  assert.match(writer, /new ApiError\(decision\.error, decision\.status, decision\.code\)/);
  for (const [name, source] of [["invite", invite], ["writer", writer], ["route", route]] as const) {
    assert.doesNotMatch(source, /!\s*(session|actor|user)\.isInstitutionOwner\s*&&/, `${name} no longer decides authority from the owner flag`);
  }
  // An accepted invitation never carries a purchase flag onto the account (the claim may still match the stored row).
  const carried = invite.split("\n").filter((line) => /canPurchaseSubscription:\s*invite\.canPurchaseSubscription/.test(line) && !/staffInvitation\.updateMany/.test(line));
  assert.deepEqual(carried, [], "an accepted invitation never carries a purchase flag");
});

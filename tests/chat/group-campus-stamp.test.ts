import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { AuthUser } from "../../src/lib/auth";

// SKAI-1938: a group created by a school-wide owner was stamped with the owner's null campus, so the campus staff
// it added could not see or open it while the unread badge still counted it.
const src = (path: string) => pathToFileURL(join(__dirname, "..", "..", "src", path)).href;
mock.module(src("lib/db/prisma.ts"), { namedExports: { prisma: {}, tenantTransaction: async () => undefined } });

const actor = (userId: string, role: AuthUser["role"], campusId: string | null, schoolId = "school-a"): AuthUser =>
  ({ userId, schoolId, campusId, role, email: "synthetic@example.invalid", accessVersion: 1 }) as AuthUser;
const owner = actor("owner-a", "SUPER_ADMIN", null);
const teacherA = actor("teacher-a", "TEACHER", "campus-a");
const teacherB = actor("teacher-b", "TEACHER", "campus-b");
const parent = actor("parent-a", "PARENT", null);

function groupRow(campusId: string | null, schoolId = "school-a") {
  const member = (userId: string, role: string) => ({ userId, memberRole: "MEMBER", unreadCount: 0, lastReadAt: null, isMuted: false, isPinned: false, isArchived: false, user: { id: userId, fullName: "Synthetic Person", role, profileImageUrl: null } });
  return { id: "g-1", kind: "GROUP", schoolId, campusId, classId: null, members: [member("owner-a", "SUPER_ADMIN"), member("teacher-a", "TEACHER"), member("teacher-b", "TEACHER"), member("parent-a", "PARENT")] } as never;
}

test("an owner's group takes the campus of the staff it adds, and every member can open it", async () => {
  const { groupCampusId, assertCurrentConversationAccess } = await import("../../src/lib/chat/membership");
  const campusId = groupCampusId(owner, [{ role: "TEACHER", campusId: "campus-a" }, { role: "PARENT", campusId: null }, { role: "STUDENT", campusId: "campus-z" }]);
  assert.equal(campusId, "campus-a");
  const row = groupRow(campusId);
  for (const user of [owner, teacherA, parent]) await assert.doesNotReject(assertCurrentConversationAccess(user, row, {} as never), user.userId);
  await assert.rejects(assertCurrentConversationAccess(teacherB, row, {} as never), /Conversation not found/, "a second campus stays out");
  await assert.rejects(assertCurrentConversationAccess(teacherA, groupRow(campusId, "school-b"), {} as never), /Conversation not found/, "a second school stays out");
});

test("a creator with a campus keeps it, and a families-only owner group stays school-wide", async () => {
  const { groupCampusId } = await import("../../src/lib/chat/membership");
  assert.equal(groupCampusId(teacherA, [{ role: "TEACHER", campusId: "campus-b" }]), "campus-a");
  assert.equal(groupCampusId(owner, [{ role: "PARENT", campusId: null }, { role: "SUPER_ADMIN", campusId: null }]), null);
});

test("an owner cannot put staff from two campuses in one group", async () => {
  const { groupCampusId } = await import("../../src/lib/chat/membership");
  assert.throws(() => groupCampusId(owner, [{ role: "TEACHER", campusId: "campus-a" }, { role: "ACCOUNTANT", campusId: "campus-b" }]), /different campuses/);
});

test("the unread badge counts only conversations the inbox would show", async () => {
  const { visibleConversationWhere } = await import("../../src/lib/chat/membership");
  assert.deepEqual(visibleConversationWhere(teacherA), { schoolId: "school-a", campusId: "campus-a" });
  assert.deepEqual(visibleConversationWhere(owner), { schoolId: "school-a" });
  assert.deepEqual(visibleConversationWhere(parent), { schoolId: "school-a" });
  assert.deepEqual(visibleConversationWhere(actor("student-a", "STUDENT", "campus-a")), { schoolId: "school-a" });
});
